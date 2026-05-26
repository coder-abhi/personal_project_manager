from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..database import get_db

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("", response_model=schemas.TaskRead, status_code=status.HTTP_201_CREATED)
async def create_task(task: schemas.TaskCreate, db: Session = Depends(get_db)):
    if crud.get_project(db, task.project_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return crud.create_task(db, task)


@router.post("/pomodoro-assignment", response_model=schemas.PomodoroAssignmentRead)
async def match_pomodoro_assignment(request: schemas.PomodoroAssignmentRequest, db: Session = Depends(get_db)):
    return crud.match_pomodoro_assignment(db, request)


@router.put("/{task_id}", response_model=schemas.TaskRead)
async def update_task(task_id: str, task: schemas.TaskUpdate, db: Session = Depends(get_db)):
    db_task = crud.update_task(db, task_id, task)
    if db_task is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    return db_task
