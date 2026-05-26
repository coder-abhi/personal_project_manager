import json
import os
from datetime import datetime, timedelta, timezone
from urllib.error import URLError
from urllib.request import Request, urlopen

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from . import models, schemas


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
    book_data["area"] = book_data["category"]
    book_data["purchased_at"] = book_data["purchase_date"]
    book_data["purchase_price"] = book_data["purchase_price"] or 0
    db_book = models.Book(**book_data)
    db.add(db_book)
    db.flush()

    chapter_titles = generate_chapter_titles(book.title, book.author)
    for index, title in enumerate(chapter_titles, start=1):
        db.add(models.BookChapter(book_id=db_book.id, title=title, position=index))

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


def create_reading_log(db: Session, reading_log: schemas.ReadingLogCreate) -> models.ReadingLog | None:
    if get_book(db, reading_log.book_id) is None:
        return None

    data = reading_log.model_dump()
    if data["read_at"] is None:
        data["read_at"] = datetime.now(timezone.utc)
    data["read_on"] = data["read_at"]

    db_log = models.ReadingLog(**data)
    db.add(db_log)
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
        categories=[{"category": category, "books": count} for category, count in sorted(category_counts.items())],
    )


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


def generate_chapter_titles(title: str, author: str | None) -> list[str]:
    fallback = [
        "Opening ideas",
        "Core concepts",
        "Practice and examples",
        "Key arguments",
        "Closing takeaways",
    ]
    prompt = (
        "Return only JSON with a chapters array of chapter titles for this exact book. "
        f"Book: {title}. Author: {author or 'unknown'}."
    )
    data = _call_openai_json(prompt, max_tokens=700)
    chapters = data.get("chapters") if isinstance(data, dict) else None
    if not isinstance(chapters, list):
        return fallback

    cleaned = [str(chapter).strip()[:240] for chapter in chapters if str(chapter).strip()]
    return cleaned[:40] or fallback


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
        "Suggest 3 books to buy next from this reading history. Return only JSON with a suggestions array. "
        "Each suggestion must have title, author, category, and reason. History: "
        f"{json.dumps(recent_context)}"
    )
    data = _call_openai_json(prompt, max_tokens=900)
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


def _call_openai_json(prompt: str, max_tokens: int) -> dict:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return {}

    payload = {
        "model": os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
        "input": [
            {
                "role": "system",
                "content": "You are a precise literary metadata assistant. Reply with valid JSON only.",
            },
            {"role": "user", "content": prompt},
        ],
        "text": {"format": {"type": "json_object"}},
        "max_output_tokens": max_tokens,
    }
    request = Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=20) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except (OSError, URLError, json.JSONDecodeError):
        return {}

    text = raw.get("output_text")
    if not text:
        text_parts = []
        for output in raw.get("output", []):
            for content in output.get("content", []):
                if content.get("type") == "output_text":
                    text_parts.append(content.get("text", ""))
        text = "".join(text_parts)

    try:
        return json.loads(text)
    except (TypeError, json.JSONDecodeError):
        return {}


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
