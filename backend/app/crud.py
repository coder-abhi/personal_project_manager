import json
import logging
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from . import models, schemas
from .prompts import (
    BOOK_METADATA_SYSTEM_PROMPT,
    BOOK_METADATA_USER_PROMPT,
    BOOK_RECOMMENDATIONS_SYSTEM_PROMPT,
    BOOK_RECOMMENDATIONS_USER_PROMPT,
    OWNED_BOOK_NEXT_READ_SYSTEM_PROMPT,
    OWNED_BOOK_NEXT_READ_USER_PROMPT,
    POMODORO_ASSIGNMENT_SYSTEM_PROMPT,
    POMODORO_ASSIGNMENT_USER_PROMPT,
)

try:
    from openai import OpenAI, OpenAIError
except ImportError:  # pragma: no cover - depends on local environment setup
    OpenAI = None
    OpenAIError = Exception


logger = logging.getLogger(__name__)


def create_project(db: Session, project: schemas.ProjectCreate) -> models.Project:
    db_project = models.Project(**project.model_dump())
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project


def list_projects(db: Session) -> list[models.Project]:
    return list(db.scalars(select(models.Project).order_by(models.Project.created_at.desc())))


def list_project_summaries(db: Session) -> list[schemas.ProjectSummary]:
    query = (
        select(models.Project)
        .options(selectinload(models.Project.tasks))
        .order_by(models.Project.created_at.desc())
    )
    projects = list(db.scalars(query))
    now = datetime.now(timezone.utc)
    summaries: list[schemas.ProjectSummary] = []

    for project in projects:
        tasks = project.tasks
        active_deadlines = [task.deadline for task in tasks if task.deadline is not None and task.status != models.TaskStatus.done]
        overdue_tasks = [
            task
            for task in tasks
            if task.deadline is not None
            and task.status != models.TaskStatus.done
            and _as_aware(task.deadline) < now
        ]
        completed_hours = sum(
            task.eta_hours if task.status == models.TaskStatus.done else min(task.time_spent_hours, task.eta_hours)
            for task in tasks
        )
        remaining_hours = sum(
            0 if task.status == models.TaskStatus.done else max(task.eta_hours - task.time_spent_hours, 0)
            for task in tasks
        )

        summaries.append(
            schemas.ProjectSummary(
                id=project.id,
                name=project.name,
                type=project.type,
                created_at=project.created_at,
                total_tasks=len(tasks),
                completed_tasks=sum(task.status == models.TaskStatus.done for task in tasks),
                in_progress_tasks=sum(task.status == models.TaskStatus.in_progress for task in tasks),
                overdue_tasks=len(overdue_tasks),
                eta_hours=sum(task.eta_hours for task in tasks),
                time_spent_hours=sum(task.time_spent_hours for task in tasks),
                completed_hours=completed_hours,
                remaining_hours=remaining_hours,
                next_deadline=min(active_deadlines, key=_as_aware) if active_deadlines else None,
            )
        )

    return summaries


def _as_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def get_project(db: Session, project_id: str) -> models.Project | None:
    return db.get(models.Project, project_id)


def create_task(db: Session, task: schemas.TaskCreate) -> models.Task:
    task_data = task.model_dump()
    if task_data["status"] == models.TaskStatus.todo:
        task_data["start_date"] = None
    elif task_data["status"] == models.TaskStatus.in_progress and task_data["start_date"] is None:
        task_data["start_date"] = datetime.now(timezone.utc)

    db_task = models.Task(**task_data)
    db.add(db_task)
    db.commit()
    db.refresh(db_task)
    return db_task


def list_tasks_by_project(db: Session, project_id: str) -> list[models.Task]:
    query = select(models.Task).where(models.Task.project_id == project_id).order_by(models.Task.created_at.desc())
    return list(db.scalars(query))


def match_pomodoro_assignment(db: Session, request: schemas.PomodoroAssignmentRequest) -> schemas.PomodoroAssignmentRead:
    note = request.note.strip()
    if not note:
        return schemas.PomodoroAssignmentRead(assigned=False, confidence=0, reason="No session note provided.")

    query = select(models.Project).options(selectinload(models.Project.tasks)).order_by(models.Project.created_at.desc())
    if request.project_ids:
        query = query.where(models.Project.id.in_(request.project_ids))
    projects = list(db.scalars(query))
    candidates = [
        {
            "project_id": project.id,
            "project_name": project.name,
            "project_type": project.type.value,
            "tasks": [
                {
                    "task_id": task.id,
                    "title": task.title,
                    "description": task.description,
                    "status": task.status.value,
                    "priority": task.priority.value,
                }
                for task in project.tasks
                if task.status != models.TaskStatus.done
            ],
        }
        for project in projects
    ]
    candidates = [project for project in candidates if project["tasks"]]
    if not candidates:
        return schemas.PomodoroAssignmentRead(assigned=False, confidence=0, reason="No active candidate tasks.")

    data = resolve_pomodoro_assignment(note=note, candidates=candidates)
    confidence = _as_float(data.get("confidence"))
    project_id = _clean_text(data.get("project_id"))
    task_id = _clean_text(data.get("task_id"))
    valid_task_ids = {
        task["task_id"]: project["project_id"]
        for project in candidates
        for task in project["tasks"]
    }

    if data.get("assigned") is not True or confidence < 0.78:
        return schemas.PomodoroAssignmentRead(
            assigned=False,
            confidence=confidence,
            reason=_clean_text(data.get("reason")) or "The model was not confident enough.",
        )
    if task_id not in valid_task_ids or valid_task_ids[task_id] != project_id:
        return schemas.PomodoroAssignmentRead(
            assigned=False,
            confidence=confidence,
            reason="The model returned an invalid project/task pair.",
        )

    return schemas.PomodoroAssignmentRead(
        assigned=True,
        confidence=confidence,
        project_id=project_id,
        task_id=task_id,
        reason=_clean_text(data.get("reason")),
    )


def update_task(db: Session, task_id: str, task: schemas.TaskUpdate) -> models.Task | None:
    db_task = db.get(models.Task, task_id)
    if db_task is None:
        return None

    changes = task.model_dump(exclude_unset=True)
    next_status = changes.get("status", db_task.status)

    if next_status == models.TaskStatus.todo:
        changes["start_date"] = None
    elif next_status == models.TaskStatus.in_progress and "start_date" not in changes and db_task.start_date is None:
        changes["start_date"] = datetime.now(timezone.utc)

    for key, value in changes.items():
        setattr(db_task, key, value)

    db.commit()
    db.refresh(db_task)
    return db_task


def create_book(db: Session, book: schemas.BookCreate) -> models.Book:
    book_data = book.model_dump()
    book_data["author"] = _clean_text(book.author)
    book_data["category"] = _clean_text(book.category) or "Uncategorized"
    book_data["area"] = book_data["category"]
    book_data["purchased_at"] = book_data["purchase_date"]
    book_data["purchase_price"] = book_data["purchase_price"] or 0
    db_book = models.Book(**book_data)
    db.add(db_book)
    db.commit()
    db.refresh(db_book)
    return db_book


def list_books(db: Session) -> list[models.Book]:
    query = (
        select(models.Book)
        .options(selectinload(models.Book.chapters), selectinload(models.Book.reading_logs))
        .order_by(models.Book.purchase_date.desc().nullslast(), models.Book.created_at.desc())
    )
    return list(db.scalars(query))


def get_book(db: Session, book_id: str) -> models.Book | None:
    query = (
        select(models.Book)
        .where(models.Book.id == book_id)
        .options(selectinload(models.Book.chapters), selectinload(models.Book.reading_logs))
    )
    return db.scalar(query)


def update_book(db: Session, book_id: str, book: schemas.BookUpdate) -> models.Book | None:
    db_book = get_book(db, book_id)
    if db_book is None:
        return None

    changes = book.model_dump(exclude_unset=True)
    if "category" in changes:
        changes["area"] = changes["category"]
    if "purchase_date" in changes:
        changes["purchased_at"] = changes["purchase_date"]
    if "purchase_price" in changes and changes["purchase_price"] is None:
        changes["purchase_price"] = 0

    for key, value in changes.items():
        setattr(db_book, key, value)

    db.commit()
    db.refresh(db_book)
    return db_book


def update_chapter(db: Session, chapter_id: str, chapter: schemas.ChapterUpdate) -> models.BookChapter | None:
    db_chapter = db.get(models.BookChapter, chapter_id)
    if db_chapter is None:
        return None

    db_chapter.resonated = chapter.resonated
    db_chapter.is_liked = chapter.resonated
    db.commit()
    db.refresh(db_chapter)
    return db_chapter


def create_chapter(db: Session, book_id: str, chapter: schemas.ChapterCreate) -> models.BookChapter | None:
    if get_book(db, book_id) is None:
        return None

    last_position = db.scalar(
        select(models.BookChapter.position)
        .where(models.BookChapter.book_id == book_id)
        .order_by(models.BookChapter.position.desc())
        .limit(1)
    )
    db_chapter = models.BookChapter(book_id=book_id, title=chapter.title.strip(), position=(last_position or 0) + 1)
    db.add(db_chapter)
    db.commit()
    db.refresh(db_chapter)
    return db_chapter


def delete_chapter(db: Session, chapter_id: str) -> bool:
    db_chapter = db.get(models.BookChapter, chapter_id)
    if db_chapter is None:
        return False

    db.delete(db_chapter)
    db.commit()
    return True


def delete_book_chapters(db: Session, book_id: str) -> bool:
    db_book = get_book(db, book_id)
    if db_book is None:
        return False

    for chapter in list(db_book.chapters):
        db.delete(chapter)
    db.commit()
    return True


def enrich_book_metadata(db: Session, book_id: str, replace_chapters: bool = False) -> models.Book | None:
    db_book = get_book(db, book_id)
    if db_book is None:
        return None

    metadata = resolve_book_metadata(
        title=db_book.title,
        author=db_book.author,
        category=db_book.category if db_book.category != "Uncategorized" else None,
    )
    if metadata["title"]:
        db_book.title = str(metadata["title"])
    if metadata["author"]:
        db_book.author = str(metadata["author"])
    if (not db_book.category or db_book.category == "Uncategorized") and metadata["category"]:
        db_book.category = str(metadata["category"])
        db_book.area = db_book.category

    chapter_titles = metadata["chapters"]
    if chapter_titles and (replace_chapters or not db_book.chapters):
        for chapter in list(db_book.chapters):
            db.delete(chapter)
        db.flush()
        for index, title in enumerate(chapter_titles, start=1):
            db.add(models.BookChapter(book_id=db_book.id, title=str(title), position=index))

    db.commit()
    db.refresh(db_book)
    return db_book


def create_reading_log(db: Session, reading_log: schemas.ReadingLogCreate) -> models.ReadingLog | None:
    db_book = get_book(db, reading_log.book_id)
    if db_book is None:
        return None

    data = reading_log.model_dump()
    if data["start_page"] is not None and data["end_page"] is not None:
        data["pages_read"] = data["end_page"] - data["start_page"] + 1
    if not data["pages_read"] or data["pages_read"] < 1:
        return None
    if data["read_at"] is None:
        data["read_at"] = datetime.now(timezone.utc)
    data["read_on"] = data["read_at"]

    db_log = models.ReadingLog(**data)
    db.add(db_log)
    if data["end_page"] is not None:
        db_book.current_page = max(db_book.current_page, data["end_page"])
        if db_book.total_pages and db_book.current_page >= db_book.total_pages:
            db_book.status = models.BookStatus.read
        elif db_book.status == models.BookStatus.yet_to_start:
            db_book.status = models.BookStatus.reading
    db.commit()
    db.refresh(db_log)
    return db_log


def list_reading_logs(db: Session) -> list[models.ReadingLog]:
    return list(db.scalars(select(models.ReadingLog).order_by(models.ReadingLog.read_at.desc())))


def get_library_summary(db: Session) -> schemas.LibrarySummary:
    books = list_books(db)
    logs = list_reading_logs(db)
    now = datetime.now(timezone.utc)
    today = now.date()
    week_start = today - timedelta(days=today.weekday())
    active_categories = sorted({book.category for book in books if book.status == models.BookStatus.reading})

    daywise_pages = []
    for days_back in range(6, -1, -1):
        day = today - timedelta(days=days_back)
        daywise_pages.append(
            {
                "date": day.isoformat(),
                "pages": sum(log.pages_read for log in logs if _as_aware(log.read_at).date() == day),
            }
        )

    monthly_pages = []
    for year, month in _last_12_months(now):
        monthly_pages.append(
            {
                "month": f"{year}-{month:02d}",
                "pages": sum(
                    log.pages_read
                    for log in logs
                    if _as_aware(log.read_at).year == year and _as_aware(log.read_at).month == month
                ),
            }
        )

    category_counts: dict[str, int] = {}
    for book in books:
        category_counts[book.category] = category_counts.get(book.category, 0) + 1

    return schemas.LibrarySummary(
        total_books=len(books),
        read_books=sum(book.status == models.BookStatus.read for book in books),
        liked_books=sum(book.liked for book in books),
        yet_to_start_books=sum(book.status == models.BookStatus.yet_to_start for book in books),
        reading_books=sum(book.status == models.BookStatus.reading for book in books),
        pages_today=sum(log.pages_read for log in logs if _as_aware(log.read_at).date() == today),
        pages_this_week=sum(log.pages_read for log in logs if _as_aware(log.read_at).date() >= week_start),
        current_categories=active_categories,
        daywise_pages=daywise_pages,
        monthly_pages=monthly_pages,
        categories=[{"category": category, "books": count} for category, count in sorted(category_counts.items())],
    )


def _last_12_months(value: datetime) -> list[tuple[int, int]]:
    months = []
    year = value.year
    month = value.month
    for _ in range(12):
        months.append((year, month))
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    return list(reversed(months))


def suggest_books(db: Session) -> list[schemas.SuggestedBook]:
    books = list_books(db)
    three_months_ago = datetime.now(timezone.utc) - timedelta(days=90)
    recent_books = [
        book
        for book in books
        if book.purchase_date is not None and _as_aware(book.purchase_date) >= three_months_ago
    ]
    suggestions = generate_book_suggestions(recent_books or books)
    return [schemas.SuggestedBook(**suggestion) for suggestion in suggestions]


def suggest_next_owned_books(db: Session) -> list[schemas.OwnedBookRecommendation]:
    candidates = [book for book in list_books(db) if book.status != models.BookStatus.read]
    recommendations = generate_next_owned_book_suggestions(candidates)
    return [schemas.OwnedBookRecommendation(**recommendation) for recommendation in recommendations]


def resolve_book_metadata(title: str, author: str | None, category: str | None) -> dict[str, str | None | list[str]]:
    provided_author = _clean_text(author)
    provided_category = _clean_text(category)
    metadata = {
        "title": None,
        "author": provided_author,
        "category": provided_category or "Uncategorized",
        "chapters": [],
    }
    data = fetch_book_metadata(title=title, author=provided_author, category=provided_category)
    if not data:
        return metadata

    confidence = _as_float(data.get("confidence"))
    if data.get("identified") is not True or confidence < 0.82:
        return metadata

    corrected_title = _clean_text(data.get("corrected_title"))
    if corrected_title:
        metadata["title"] = corrected_title

    corrected_author = _clean_text(data.get("corrected_author"))
    if corrected_author:
        metadata["author"] = corrected_author

    if not provided_category:
        model_category = _clean_text(data.get("category"))
        if model_category:
            metadata["category"] = model_category

    chapters = data.get("chapters")
    if data.get("chapters_confident") is True and isinstance(chapters, list):
        metadata["chapters"] = [str(chapter).strip()[:240] for chapter in chapters if str(chapter).strip()][:80]

    return metadata


def fetch_book_metadata(title: str, author: str | None, category: str | None) -> dict:
    prompt = f"{BOOK_METADATA_USER_PROMPT} Context: {json.dumps({'title': title, 'author': author, 'category': category})}"
    return _call_openai_json(BOOK_METADATA_SYSTEM_PROMPT, prompt, max_tokens=1200)


def resolve_pomodoro_assignment(note: str, candidates: list[dict]) -> dict:
    prompt = f"{POMODORO_ASSIGNMENT_USER_PROMPT} Context: {json.dumps({'note': note, 'candidates': candidates})}"
    return _call_openai_json(POMODORO_ASSIGNMENT_SYSTEM_PROMPT, prompt, max_tokens=700)


def _clean_text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _as_float(value: object) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0


def generate_book_suggestions(books: list[models.Book]) -> list[dict[str, str | None]]:
    fallback = _fallback_suggestions(books)
    if not books:
        return fallback

    recent_context = [
        {
            "title": book.title,
            "author": book.author,
            "category": book.category,
            "liked": book.liked,
            "status": book.status.value,
        }
        for book in books[:12]
    ]
    prompt = (
        f"{BOOK_RECOMMENDATIONS_USER_PROMPT} History: {json.dumps(recent_context)}"
    )
    data = _call_openai_json(BOOK_RECOMMENDATIONS_SYSTEM_PROMPT, prompt, max_tokens=900)
    suggestions = data.get("suggestions") if isinstance(data, dict) else None
    if not isinstance(suggestions, list):
        return fallback

    cleaned = []
    for item in suggestions[:3]:
        if not isinstance(item, dict) or not item.get("title") or not item.get("reason"):
            continue
        cleaned.append(
            {
                "title": str(item["title"])[:220],
                "author": str(item["author"])[:160] if item.get("author") else None,
                "category": str(item.get("category") or "General")[:80],
                "reason": str(item["reason"])[:320],
            }
        )

    return cleaned or fallback


def generate_next_owned_book_suggestions(books: list[models.Book]) -> list[dict[str, str | None]]:
    fallback = _fallback_owned_book_suggestions(books)
    if not books:
        return fallback

    candidates = [
        {
            "book_id": book.id,
            "title": book.title,
            "author": book.author,
            "category": book.category,
            "status": book.status.value,
            "liked": book.liked,
            "rating": book.rating,
            "pages_read": book.pages_read,
            "pages_remaining": book.pages_remaining,
            "purchase_date": book.purchase_date.isoformat() if book.purchase_date else None,
        }
        for book in books[:30]
    ]
    prompt = f"{OWNED_BOOK_NEXT_READ_USER_PROMPT} Candidates: {json.dumps(candidates)}"
    data = _call_openai_json(OWNED_BOOK_NEXT_READ_SYSTEM_PROMPT, prompt, max_tokens=900)
    items = data.get("recommendations") if isinstance(data, dict) else None
    if not isinstance(items, list):
        return fallback

    books_by_id = {book.id: book for book in books}
    cleaned = []
    seen_ids = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        book_id = str(item.get("book_id") or "")
        if book_id in seen_ids or book_id not in books_by_id:
            continue
        seen_ids.add(book_id)
        book = books_by_id[book_id]
        cleaned.append(_owned_book_recommendation(book, str(item.get("reason") or "Good next pick from your purchased shelf.")))
        if len(cleaned) == 3:
            break

    return cleaned or fallback


def _call_openai_json(system_prompt: str, user_prompt: str, max_tokens: int) -> dict:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.warning("OPENAI_API_KEY is not set. Skipping OpenAI LLM call.")
        return {}

    if OpenAI is None:
        logger.warning("OpenAI Python SDK is not installed. Run `pip install -r backend/requirements.txt`.")
        return {}

    client = OpenAI(api_key=api_key)

    try:
        response = client.responses.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            text={"format": {"type": "json_object"}},
            max_output_tokens=max_tokens,
        )
    except (OpenAIError, OSError) as err:
        logger.warning("OpenAI LLM call failed: %s", err)
        return {}

    text = getattr(response, "output_text", None) or _extract_response_text(response)

    try:
        return json.loads(text)
    except (TypeError, json.JSONDecodeError):
        logger.warning("OpenAI LLM returned non-JSON content.")
        return {}


def _extract_response_text(response: object) -> str:
    response_dict = response.model_dump() if hasattr(response, "model_dump") else {}
    text_parts = []
    for output in response_dict.get("output", []):
        for content in output.get("content", []):
            if content.get("type") == "output_text":
                text_parts.append(content.get("text", ""))
    return "".join(text_parts)


def _fallback_suggestions(books: list[models.Book]) -> list[dict[str, str | None]]:
    favorite_categories = [book.category for book in books if book.liked] or [book.category for book in books]
    top_category = favorite_categories[0] if favorite_categories else "Software Development"
    return [
        {
            "title": "Designing Data-Intensive Applications",
            "author": "Martin Kleppmann",
            "category": "Software Development",
            "reason": "A strong next buy if your shelf leans toward technical depth and durable systems thinking.",
        },
        {
            "title": "The Beginning of Infinity",
            "author": "David Deutsch",
            "category": "Philosophy",
            "reason": f"Pairs well with your recent interest in {top_category} while widening the idea-space.",
        },
        {
            "title": "Thinking in Systems",
            "author": "Donella H. Meadows",
            "category": "Psychology",
            "reason": "Good bridge material for connecting human behavior, strategy, and technical decision-making.",
        },
    ]


def _fallback_owned_book_suggestions(books: list[models.Book]) -> list[dict[str, str | None]]:
    ranked = sorted(
        books,
        key=lambda book: (
            book.status != models.BookStatus.reading,
            -(book.rating or 0),
            not book.liked,
            _as_aware(book.purchase_date or book.created_at),
        ),
    )
    return [
        _owned_book_recommendation(book, "A strong next choice from your purchased shelf based on status, rating, and recency.")
        for book in ranked[:3]
    ]


def _owned_book_recommendation(book: models.Book, reason: str) -> dict[str, str | None]:
    return {
        "book_id": book.id,
        "title": book.title,
        "author": book.author,
        "category": book.category,
        "status": book.status.value,
        "reason": reason[:320],
    }
