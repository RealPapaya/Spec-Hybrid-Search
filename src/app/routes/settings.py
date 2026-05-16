"""
GET/POST /api/local-settings - persist user UI state in a local JSON file.
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from app.config import USER_SETTINGS_PATH

router = APIRouter()

_DEFAULT_SETTINGS: dict[str, Any] = {
    "prefs": {},
    "tags": {"customTags": [], "assignments": {}},
    "bookmarks": {},
    "watch": {},
}


def _merged_defaults(data: dict[str, Any] | None = None) -> dict[str, Any]:
    data = data if isinstance(data, dict) else {}
    tags = data.get("tags") if isinstance(data.get("tags"), dict) else {}
    return {
        "prefs": data.get("prefs") if isinstance(data.get("prefs"), dict) else {},
        "tags": {
            "customTags": tags.get("customTags") if isinstance(tags.get("customTags"), list) else [],
            "assignments": tags.get("assignments") if isinstance(tags.get("assignments"), dict) else {},
        },
        "bookmarks": data.get("bookmarks") if isinstance(data.get("bookmarks"), dict) else {},
        "watch": data.get("watch") if isinstance(data.get("watch"), dict) else {},
    }


def _read_settings() -> dict[str, Any]:
    if not USER_SETTINGS_PATH.is_file():
        return _merged_defaults(_DEFAULT_SETTINGS)
    try:
        with USER_SETTINGS_PATH.open("r", encoding="utf-8") as f:
            return _merged_defaults(json.load(f))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="local settings file is invalid JSON") from exc


def _write_settings(data: dict[str, Any]) -> None:
    USER_SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = USER_SETTINGS_PATH.with_suffix(USER_SETTINGS_PATH.suffix + ".tmp")
    with tmp_path.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(_merged_defaults(data), f, ensure_ascii=False, indent=2)
        f.write("\n")
    tmp_path.replace(USER_SETTINGS_PATH)


@router.get("/local-settings")
async def get_local_settings():
    settings = _read_settings()
    settings["_exists"] = USER_SETTINGS_PATH.is_file()
    return settings


@router.post("/local-settings")
async def save_local_settings(request: Request):
    payload = await request.json()
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="settings payload must be an object")

    current = _read_settings()
    next_settings = {**current}
    for key in ("prefs", "tags", "bookmarks", "watch"):
        if key in payload:
            next_settings[key] = payload[key]

    _write_settings(next_settings)
    return {"status": "ok", "path": str(USER_SETTINGS_PATH)}
