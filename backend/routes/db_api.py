from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from services import db

router = APIRouter(prefix="/db", tags=["Database"])

class ProjectCreate(BaseModel):
    userId: str
    name: str

class ProjectUpdate(BaseModel):
    userId: str
    name: str

class AssetCreate(BaseModel):
    userId: str
    originalName: str
    storageKey: str
    mimeType: str
    sizeBytes: int
    projectId: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    durationSeconds: Optional[float] = None

@router.get("/projects")
def get_projects(userId: str):
    return db.list_projects(userId)

@router.post("/projects")
def create_project(data: ProjectCreate):
    return db.create_project(data.userId, data.name)

@router.get("/projects/{project_id}")
def get_project(project_id: str):
    proj = db.get_project(project_id)
    if not proj:
        raise HTTPException(status_code=404, detail="Not Found")
    return proj

@router.patch("/projects/{project_id}")
def update_project(project_id: str, data: ProjectUpdate):
    success = db.update_project(project_id, data.userId, data.name)
    if not success:
        raise HTTPException(status_code=404, detail="Not Found or no changes")
    return {"success": True}

@router.delete("/projects/{project_id}")
def delete_project(project_id: str, userId: str = Query(...)):
    success = db.delete_project(project_id, userId)
    if not success:
        raise HTTPException(status_code=404, detail="Not Found")
    return {"success": True}

@router.get("/assets")
def get_assets(userId: str, projectId: Optional[str] = None):
    return db.list_assets(userId, projectId)

@router.post("/assets")
def create_asset(data: AssetCreate):
    return db.create_asset(
        user_id=data.userId,
        original_name=data.originalName,
        storage_key=data.storageKey,
        mime_type=data.mimeType,
        size_bytes=data.sizeBytes,
        project_id=data.projectId,
        width=data.width,
        height=data.height,
        duration_seconds=data.durationSeconds
    )

@router.get("/assets/{asset_id}")
def get_asset(asset_id: str):
    asset = db.get_asset(asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Not Found")
    return asset

@router.delete("/assets/{asset_id}")
def delete_asset(asset_id: str, userId: str = Query(...)):
    success = db.soft_delete_asset(asset_id, userId)
    if not success:
        raise HTTPException(status_code=404, detail="Not Found")
    return {"success": True}

@router.get("/storage")
def get_storage(userId: str):
    used_bytes = db.get_storage_bytes(userId)
    return {"usedBytes": used_bytes}
