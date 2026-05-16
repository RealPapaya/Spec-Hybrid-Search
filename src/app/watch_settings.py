"""Helpers for the user-selected watched documents directory."""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

from app.config import USER_SETTINGS_PATH, WATCHED_DOCS_DIR

_lock = threading.Lock()


def _read_raw_settings() -> dict[str, Any]:
    if not USER_SETTINGS_PATH.is_file():
        return {}
    try:
        with USER_SETTINGS_PATH.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def get_watched_docs_dir() -> Path:
    """Return the active watched directory, falling back to watched_docs/."""
    settings = _read_raw_settings()
    watch = settings.get("watch") if isinstance(settings.get("watch"), dict) else {}
    directory = watch.get("directory")
    if isinstance(directory, str) and directory.strip():
        return Path(directory).expanduser().resolve()
    return WATCHED_DOCS_DIR.resolve()


def save_watched_docs_dir(directory: Path) -> Path:
    """Persist the active watched directory and return its resolved path."""
    resolved = directory.expanduser().resolve()
    with _lock:
        settings = _read_raw_settings()
        watch = settings.get("watch") if isinstance(settings.get("watch"), dict) else {}
        settings["watch"] = {**watch, "directory": str(resolved)}
        USER_SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = USER_SETTINGS_PATH.with_suffix(USER_SETTINGS_PATH.suffix + ".tmp")
        with tmp_path.open("w", encoding="utf-8", newline="\n") as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)
            f.write("\n")
        tmp_path.replace(USER_SETTINGS_PATH)
    return resolved
