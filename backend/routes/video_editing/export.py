from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
import os
from services.ffmpeg_service import concat_clips, mix_audio

router = APIRouter()


class ExportRequest(BaseModel):
    clip_paths: List[str]
    output_path: str
    audio_path: str | None = None
    audio_volume: float = 0.8


class ExportResponse(BaseModel):
    success: bool
    output_path: str
    message: str


@router.post("/export", response_model=ExportResponse)
async def export_video(req: ExportRequest):
    """Concatenate clips and optionally mix audio, producing a final MP4."""
    for p in req.clip_paths:
        if not os.path.isfile(p):
            raise HTTPException(status_code=404, detail=f"Clip not found: {p}")

    try:
        # Step 1: concat all clips
        concat_output = req.output_path
        if req.audio_path:
            concat_output = req.output_path.replace(".mp4", "_noaudio.mp4")

        concat_clips(req.clip_paths, concat_output)

        # Step 2: mix audio if provided
        if req.audio_path:
            if not os.path.isfile(req.audio_path):
                raise HTTPException(status_code=404, detail=f"Audio not found: {req.audio_path}")
            mix_audio(concat_output, req.audio_path, req.output_path, req.audio_volume)
            os.remove(concat_output)

        return ExportResponse(success=True, output_path=req.output_path, message="Export completed")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
