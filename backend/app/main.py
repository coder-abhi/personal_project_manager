import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from .database import Base, engine
from .routes import project, task

Base.metadata.create_all(bind=engine)


def ensure_sqlite_compatibility() -> None:
    if engine.dialect.name != "sqlite":
        return

    inspector = inspect(engine)
    if "tasks" not in inspector.get_table_names():
        return

    task_columns = {column["name"] for column in inspector.get_columns("tasks")}

    with engine.begin() as connection:
        if "priority" not in task_columns:
            connection.execute(text("ALTER TABLE tasks ADD COLUMN priority VARCHAR(6) NOT NULL DEFAULT 'medium'"))
        if "start_date" not in task_columns:
            connection.execute(text("ALTER TABLE tasks ADD COLUMN start_date DATETIME"))
        connection.execute(text("UPDATE tasks SET status = 'todo' WHERE status = 'delayed'"))
        connection.execute(text("UPDATE projects SET type = 'continuous' WHERE type = 'study'"))


ensure_sqlite_compatibility()

app = FastAPI(title="Personal Execution Tracker API")

frontend_origins = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGIN",
        "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(project.router)
app.include_router(task.router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
