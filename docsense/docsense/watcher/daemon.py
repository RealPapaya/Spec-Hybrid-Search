"""
File watcher daemon — monitors a directory and auto-ingests documents.

Features
--------
- Uses *watchdog* to receive OS-level inotify / FSEvents / ReadDirectoryChanges
  notifications for create, modify, delete, and rename events.
- Filters events to only process supported file types (``.pdf``, ``.docx``,
  ``.xlsx``, ``.pptx``).
- Debounces rapid successive events for the same path (e.g. editor temp-files)
  with a 2-second window.
- Performs an initial directory scan on startup so files added while the
  daemon was offline are indexed automatically.
- Handles ``SIGINT`` / ``SIGTERM`` gracefully for clean shutdown.
- **Never crashes** — every event handler and pipeline call is wrapped in a
  broad ``except Exception`` so one bad file cannot kill the process.

Usage
-----
::

    # Standalone
    python -m docsense.watcher.daemon

    # Via CLI entry-point (defined in pyproject.toml)
    docsense-watch
"""

from __future__ import annotations

import logging
import signal
import sys
import time
from pathlib import Path

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from docsense.config import get_settings
from docsense.pipeline import process_file, remove_document

logger = logging.getLogger(__name__)


class _DocSenseHandler(FileSystemEventHandler):
    """
    Watchdog event handler.

    Translates filesystem events into ingestion pipeline calls, with
    debouncing to absorb bursts of events for the same file.
    """

    _DEBOUNCE_SECONDS = 2.0

    def __init__(self) -> None:
        super().__init__()
        self._settings = get_settings()
        self._last_seen: dict[str, float] = {}

    # ------------------------------------------------------------------
    # Watchdog callbacks
    # ------------------------------------------------------------------

    def on_created(self, event: FileSystemEvent) -> None:
        if not self._should_handle(event):
            return
        logger.info("[WATCHER] Created: %s", event.src_path)
        self._safe_process(event.src_path)

    def on_modified(self, event: FileSystemEvent) -> None:
        if not self._should_handle(event):
            return
        logger.info("[WATCHER] Modified: %s", event.src_path)
        self._safe_process(event.src_path)

    def on_deleted(self, event: FileSystemEvent) -> None:
        if event.is_directory:
            return
        if not self._is_supported(event.src_path):
            return
        logger.info("[WATCHER] Deleted: %s", event.src_path)
        self._safe_remove(event.src_path)

    def on_moved(self, event: FileSystemEvent) -> None:
        if event.is_directory:
            return
        # Remove old path if it was indexed
        if self._is_supported(event.src_path):
            logger.info("[WATCHER] Moved (src): %s", event.src_path)
            self._safe_remove(event.src_path)
        # Index new path if supported
        dest = getattr(event, "dest_path", None)
        if dest and self._is_supported(dest) and not self._is_debounced(dest):
            logger.info("[WATCHER] Moved (dst): %s", dest)
            self._safe_process(dest)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _should_handle(self, event: FileSystemEvent) -> bool:
        """Return True if the event should trigger processing."""
        if event.is_directory:
            return False
        if not self._is_supported(event.src_path):
            return False
        if self._is_debounced(event.src_path):
            return False
        return True

    def _is_supported(self, path: str) -> bool:
        return Path(path).suffix.lower() in self._settings.supported_extensions

    def _is_debounced(self, path: str) -> bool:
        """Return True if *path* was handled within the debounce window."""
        now = time.monotonic()
        last = self._last_seen.get(path, 0.0)
        if now - last < self._DEBOUNCE_SECONDS:
            return True
        self._last_seen[path] = now
        return False

    def _safe_process(self, path: str) -> None:
        """Call :func:`process_file`, swallowing all exceptions."""
        try:
            process_file(Path(path))
        except Exception as exc:
            logger.error("[WATCHER] Error processing %s: %s", path, exc, exc_info=True)

    def _safe_remove(self, path: str) -> None:
        """Call :func:`remove_document`, swallowing all exceptions."""
        try:
            remove_document(Path(path))
        except Exception as exc:
            logger.error("[WATCHER] Error removing %s: %s", path, exc, exc_info=True)


# ---------------------------------------------------------------------------
# Initial scan
# ---------------------------------------------------------------------------

def scan_existing_files() -> None:
    """
    Walk the watch directory and index every supported file that is not
    already up-to-date in the index.

    Called once on daemon startup.
    """
    settings = get_settings()
    watch_dir = settings.watch_dir.resolve()

    if not watch_dir.exists():
        logger.warning("Watch directory does not exist yet: %s  (will be created)", watch_dir)
        watch_dir.mkdir(parents=True, exist_ok=True)
        return

    logger.info("Initial scan of: %s", watch_dir)
    count = 0

    for ext in settings.supported_extensions:
        for filepath in watch_dir.rglob(f"*{ext}"):
            try:
                process_file(filepath)
                count += 1
            except Exception as exc:
                logger.error("Scan error for %s: %s", filepath.name, exc)

    logger.info("Initial scan complete: %d file(s) processed.", count)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def main() -> None:
    """
    Start the DocSense file watcher daemon.

    Blocks until a ``SIGINT`` or ``SIGTERM`` signal is received.
    """
    settings = get_settings()

    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Ensure DB tables exist (safe if already present)
    from docsense.database.session import init_db
    init_db()

    watch_dir = settings.watch_dir.resolve()
    watch_dir.mkdir(parents=True, exist_ok=True)

    logger.info("DocSense File Watcher starting…")
    logger.info("  Watch dir  : %s", watch_dir)
    logger.info("  File types : %s", sorted(settings.supported_extensions))

    # Initial scan before the observer starts to handle files added offline
    scan_existing_files()

    # Start the watchdog observer
    handler = _DocSenseHandler()
    observer = Observer()
    observer.schedule(handler, str(watch_dir), recursive=True)
    observer.start()
    logger.info("Watching for changes… (Ctrl-C to stop)")

    # Graceful shutdown on SIGINT / SIGTERM
    def _shutdown(signum: int, frame) -> None:
        logger.info("Shutdown signal received — stopping watcher…")
        observer.stop()
        observer.join()
        logger.info("Watcher stopped. Bye.")
        sys.exit(0)

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    try:
        while observer.is_alive():
            observer.join(timeout=1)
    except KeyboardInterrupt:
        observer.stop()

    observer.join()


if __name__ == "__main__":
    main()
