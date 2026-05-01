"""
FFmpeg service — thin wrapper around ffmpeg-python for trim, concat, and audio mixing.
"""
import ffmpeg
import os
import tempfile
from typing import List, Dict


def trim_clip(input_path: str, output_path: str, start_time: float, end_time: float) -> str:
    """
    Trim a media file from start_time to end_time (in seconds).
    Returns the output path.
    """
    duration = end_time - start_time
    (
        ffmpeg
        .input(input_path, ss=start_time, t=duration)
        .output(output_path, codec="copy")
        .overwrite_output()
        .run(quiet=True)
    )
    return output_path


def concat_clips(clip_paths: List[str], output_path: str) -> str:
    """
    Concatenate multiple media files using the concat demuxer.
    All clips must have the same codec, resolution, and frame rate.
    Returns the output path.
    """
    # Write concat file list
    list_path = os.path.join(tempfile.gettempdir(), "concat_list.txt")
    with open(list_path, "w") as f:
        for p in clip_paths:
            # Escape single quotes for ffmpeg
            escaped = p.replace("'", "'\\''")
            f.write(f"file '{escaped}'\n")

    (
        ffmpeg
        .input(list_path, format="concat", safe=0)
        .output(output_path, codec="copy")
        .overwrite_output()
        .run(quiet=True)
    )

    os.remove(list_path)
    return output_path


def mix_audio(video_path: str, audio_path: str, output_path: str, audio_volume: float = 0.8) -> str:
    """
    Overlay an audio track onto a video file.
    Returns the output path.
    """
    video = ffmpeg.input(video_path)
    audio = ffmpeg.input(audio_path).filter("volume", audio_volume)

    (
        ffmpeg
        .output(video.video, audio.audio, output_path, vcodec="copy", acodec="aac", shortest=None)
        .overwrite_output()
        .run(quiet=True)
    )
    return output_path
