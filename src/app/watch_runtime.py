"""Runtime control for the active watchdog observer."""
from __future__ import annotations

import logging
import threading

from app.watch_settings import get_watched_docs_dir
from indexer.watcher import start_watcher

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_observer = None


def start_current_watcher():
    """Start watching the currently configured directory."""
    global _observer
    with _lock:
        if _observer is None:
            _observer = start_watcher(get_watched_docs_dir())
        return _observer


def restart_current_watcher():
    """Restart watchdog after the watched directory changes."""
    global _observer
    with _lock:
        if _observer is not None:
            try:
                _observer.stop()
                _observer.join(timeout=3)
            except Exception:
                logger.exception("Error stopping watcher before restart")
            _observer = None
        _observer = start_watcher(get_watched_docs_dir())
        return _observer


def stop_current_watcher() -> None:
    """Stop the active watchdog observer, if any."""
    global _observer
    with _lock:
        if _observer is not None:
            try:
                _observer.stop()
                _observer.join(timeout=3)
            except Exception:
                logger.exception("Error stopping watcher")
            _observer = None
