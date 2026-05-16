from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .models import ProjectType, TaskStatus


class ProjectBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    type: ProjectType


class ProjectCreate(ProjectBase):
    pass


class ProjectRead(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime


class TaskBase(BaseModel):
    project_id: str
    title: str = Field(min_length=1, max_length=220)
    description: str | None = None
    status: TaskStatus = TaskStatus.todo
    eta_hours: float = Field(default=0, ge=0)
    time_spent_hours: float = Field(default=0, ge=0)
    deadline: datetime | None = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=220)
    description: str | None = None
    status: TaskStatus | None = None
    eta_hours: float | None = Field(default=None, ge=0)
    time_spent_hours: float | None = Field(default=None, ge=0)
    deadline: datetime | None = None


class TaskRead(TaskBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
