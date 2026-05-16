from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models, schemas


def create_project(db: Session, project: schemas.ProjectCreate) -> models.Project:
    db_project = models.Project(**project.model_dump())
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project


def list_projects(db: Session) -> list[models.Project]:
    return list(db.scalars(select(models.Project).order_by(models.Project.created_at.desc())))


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
