from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
from services.ffmpeg_service import trim_clip

router = APIRouter()


class TrimRequest(BaseModel):
    input_path: str
    output_path: str
    start_time: float
    end_time: float


class TrimResponse(BaseModel):
    success: bool
    output_path: str
    message: str


@router.post("/trim", response_model=TrimResponse)
async def trim_media(req: TrimRequest):
    """Trim a media file from start_time to end_time (seconds)."""
    if not os.path.isfile(req.input_path):
        raise HTTPException(status_code=404, detail=f"Input file not found: {req.input_path}")

    if req.start_time >= req.end_time:
        raise HTTPException(status_code=400, detail="start_time must be less than end_time")

    try:
        result = trim_clip(req.input_path, req.output_path, req.start_time, req.end_time)
        return TrimResponse(success=True, output_path=result, message="Trim completed")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
