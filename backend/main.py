"""
Media Editor — Python Backend Service
FastAPI app providing FFmpeg-based media processing endpoints.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.video_editing.trim import router as trim_router
from routes.video_editing.export import router as export_router
from routes.ai.ai import router as ai_router
from routes.db_api import router as db_router
from services import db

app = FastAPI(
    title="Media Editor Backend",
    description="FFmpeg-powered media processing API for the video editor",
    version="0.1.0",
)

# Allow CORS from the Remotion dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount route modules
app.include_router(trim_router, tags=["Trim"])
app.include_router(export_router, tags=["Export"])
app.include_router(ai_router, tags=["AI"])
app.include_router(db_router)

# Initialize Database on startup
@app.on_event("startup")
def startup_event():
    db.init_db()

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3000)