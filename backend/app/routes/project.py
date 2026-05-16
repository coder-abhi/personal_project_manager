from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import crud, schemas
from ..database import get_db

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[schemas.ProjectRead])
async def list_projects(db: Session = Depends(get_db)):
    return crud.list_projects(db)


@router.post("", response_model=schemas.ProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project(project: schemas.ProjectCreate, db: Session = Depends(get_db)):
    return crud.create_project(db, project)


@router.get("/{project_id}/tasks", response_model=list[schemas.TaskRead])
async def list_project_tasks(project_id: str, db: Session = Depends(get_db)):
    if crud.get_project(db, project_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return crud.list_tasks_by_project(db, project_id)
