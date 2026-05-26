from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .models import ProjectType, TaskPriority, TaskStatus


class ProjectBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    type: ProjectType


class ProjectCreate(ProjectBase):
    pass


class ProjectRead(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime


class ProjectSummary(ProjectRead):
    total_tasks: int
    completed_tasks: int
    in_progress_tasks: int
    overdue_tasks: int
    eta_hours: float
    time_spent_hours: float
    completed_hours: float
    remaining_hours: float
    next_deadline: datetime | None


class TaskBase(BaseModel):
    project_id: str
    title: str = Field(min_length=1, max_length=220)
    description: str | None = None
    status: TaskStatus = TaskStatus.todo
    priority: TaskPriority = TaskPriority.medium
    eta_hours: float = Field(default=0, ge=0)
    time_spent_hours: float = Field(default=0, ge=0)
    start_date: datetime | None = None
    deadline: datetime | None = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=220)
    description: str | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    eta_hours: float | None = Field(default=None, ge=0)
    time_spent_hours: float | None = Field(default=None, ge=0)
    start_date: datetime | None = None
    deadline: datetime | None = None


class TaskRead(TaskBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
