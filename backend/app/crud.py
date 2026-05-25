from datetime import datetime, timezone

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
                delayed_tasks=sum(task.status == models.TaskStatus.delayed for task in tasks),
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
    db_task = models.Task(**task.model_dump())
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

    for key, value in task.model_dump(exclude_unset=True).items():
        setattr(db_task, key, value)

    db.commit()
    db.refresh(db_task)
    return db_task
