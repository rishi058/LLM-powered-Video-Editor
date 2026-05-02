import sqlite3
import os
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "editor.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    try:
        cursor = conn.cursor()
        
        # Create projects table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        
        # Create assets table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS assets (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                project_id TEXT,
                original_name TEXT NOT NULL,
                storage_key TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                width INTEGER,
                height INTEGER,
                duration_seconds REAL,
                created_at TEXT NOT NULL,
                deleted_at TEXT
            )
        """)
        
        # Create indexes
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_projects_user_id_created_at ON projects(user_id, created_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_assets_user_id_created_at ON assets(user_id, created_at DESC)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_assets_user_project ON assets(user_id, project_id, created_at DESC)")
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_user_storage_key ON assets(user_id, storage_key)")
        
        conn.commit()
    finally:
        conn.close()

# Projects CRUD
def create_project(user_id: str, name: str) -> Dict[str, Any]:
    conn = get_connection()
    try:
        project_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO projects (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (project_id, user_id, name, now, now)
        )
        conn.commit()
        return get_project(project_id)
    finally:
        conn.close()

def get_project(project_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()

def list_projects(user_id: str) -> List[Dict[str, Any]]:
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC", (user_id,)).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()

def update_project(project_id: str, user_id: str, name: str) -> bool:
    conn = get_connection()
    try:
        now = datetime.now(timezone.utc).isoformat()
        cursor = conn.execute(
            "UPDATE projects SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            (name, now, project_id, user_id)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()

def delete_project(project_id: str, user_id: str) -> bool:
    conn = get_connection()
    try:
        cursor = conn.execute("DELETE FROM projects WHERE id = ? AND user_id = ?", (project_id, user_id))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()

# Assets CRUD
def create_asset(user_id: str, original_name: str, storage_key: str, mime_type: str, size_bytes: int, 
                 project_id: str = None, width: int = None, height: int = None, duration_seconds: float = None) -> Dict[str, Any]:
    conn = get_connection()
    try:
        asset_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """INSERT INTO assets 
               (id, user_id, project_id, original_name, storage_key, mime_type, size_bytes, width, height, duration_seconds, created_at) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (asset_id, user_id, project_id, original_name, storage_key, mime_type, size_bytes, width, height, duration_seconds, now)
        )
        conn.commit()
        return get_asset(asset_id)
    finally:
        conn.close()

def get_asset(asset_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    try:
        row = conn.execute("SELECT * FROM assets WHERE id = ? AND deleted_at IS NULL", (asset_id,)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()

def list_assets(user_id: str, project_id: str = None) -> List[Dict[str, Any]]:
    conn = get_connection()
    try:
        if project_id is None:
            rows = conn.execute("SELECT * FROM assets WHERE user_id = ? AND project_id IS NULL AND deleted_at IS NULL ORDER BY created_at DESC", (user_id,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM assets WHERE user_id = ? AND project_id = ? AND deleted_at IS NULL ORDER BY created_at DESC", (user_id, project_id)).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()

def delete_asset(asset_id: str, user_id: str) -> bool:
    conn = get_connection()
    try:
        cursor = conn.execute(
            "DELETE FROM assets WHERE id = ? AND user_id = ?",
            (asset_id, user_id)
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()

def get_storage_bytes(user_id: str) -> int:
    conn = get_connection()
    try:
        row = conn.execute("SELECT COALESCE(SUM(size_bytes), 0) as total FROM assets WHERE user_id = ? AND deleted_at IS NULL", (user_id,)).fetchone()
        return int(row['total']) if row else 0
    finally:
        conn.close()
