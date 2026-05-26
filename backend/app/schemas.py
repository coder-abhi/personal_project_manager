from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .models import BookStatus, ProjectType, TaskPriority, TaskStatus


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


class ChapterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    book_id: str
    title: str
    position: int
    resonated: bool


class BookBase(BaseModel):
    title: str = Field(min_length=1, max_length=220)
    author: str | None = Field(default=None, max_length=160)
    category: str = Field(default="General", min_length=1, max_length=80)
    total_pages: int = Field(default=0, ge=0)
    status: BookStatus = BookStatus.yet_to_start
    liked: bool = False
    purchase_date: datetime | None = None
    purchase_price: float | None = Field(default=None, ge=0)


class BookCreate(BookBase):
    pass


class BookUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=220)
    author: str | None = Field(default=None, max_length=160)
    category: str | None = Field(default=None, min_length=1, max_length=80)
    total_pages: int | None = Field(default=None, ge=0)
    status: BookStatus | None = None
    liked: bool | None = None
    purchase_date: datetime | None = None
    purchase_price: float | None = Field(default=None, ge=0)


class BookRead(BookBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    chapters: list[ChapterRead] = []


class ChapterUpdate(BaseModel):
    resonated: bool


class ReadingLogCreate(BaseModel):
    book_id: str
    pages_read: int = Field(ge=1)
    read_at: datetime | None = None
    note: str | None = None


class ReadingLogRead(ReadingLogCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    read_at: datetime


class LibrarySummary(BaseModel):
    total_books: int
    read_books: int
    liked_books: int
    yet_to_start_books: int
    reading_books: int
    pages_today: int
    pages_this_week: int
    current_categories: list[str]
    daywise_pages: list[dict[str, int | str]]
    categories: list[dict[str, int | str]]


class SuggestedBook(BaseModel):
    title: str
    author: str | None = None
    category: str
    reason: str
