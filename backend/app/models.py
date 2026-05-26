import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class ProjectType(str, enum.Enum):
    continuous = "continuous"
    fixed = "fixed"


class TaskStatus(str, enum.Enum):
    todo = "todo"
    in_progress = "in_progress"
    done = "done"


class TaskPriority(str, enum.Enum):
    high = "high"
    medium = "medium"
    low = "low"


class BookStatus(str, enum.Enum):
    yet_to_start = "yet_to_start"
    reading = "reading"
    read = "read"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    type: Mapped[ProjectType] = mapped_column(Enum(ProjectType), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    tasks: Mapped[list["Task"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="Task.created_at",
    )


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[TaskStatus] = mapped_column(Enum(TaskStatus), default=TaskStatus.todo, nullable=False)
    priority: Mapped[TaskPriority] = mapped_column(Enum(TaskPriority), default=TaskPriority.medium, nullable=False)
    eta_hours: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    time_spent_hours: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    project: Mapped[Project] = relationship(back_populates="tasks")


class Book(Base):
    __tablename__ = "books"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    author: Mapped[str | None] = mapped_column(String(160), nullable=True)
    area: Mapped[str] = mapped_column(String(80), default="General", nullable=False)
    category: Mapped[str] = mapped_column(String(80), default="General", nullable=False)
    total_pages: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    current_page: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[BookStatus] = mapped_column(Enum(BookStatus), default=BookStatus.yet_to_start, nullable=False)
    liked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    purchased_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    purchase_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    purchase_price: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    chapters: Mapped[list["BookChapter"]] = relationship(
        back_populates="book",
        cascade="all, delete-orphan",
        order_by="BookChapter.position",
    )
    reading_logs: Mapped[list["ReadingLog"]] = relationship(
        back_populates="book",
        cascade="all, delete-orphan",
        order_by="ReadingLog.read_at.desc()",
    )

    @property
    def pages_read(self) -> int:
        return sum(log.pages_read for log in self.reading_logs)

    @property
    def pages_remaining(self) -> int:
        return max(self.total_pages - self.pages_read, 0)


class BookChapter(Base):
    __tablename__ = "book_chapters"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    book_id: Mapped[str] = mapped_column(ForeignKey("books.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    is_liked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    resonated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    book: Mapped[Book] = relationship(back_populates="chapters")


class ReadingLog(Base):
    __tablename__ = "reading_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    book_id: Mapped[str] = mapped_column(ForeignKey("books.id"), nullable=False, index=True)
    read_on: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    start_page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pages_read: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    book: Mapped[Book] = relationship(back_populates="reading_logs")
