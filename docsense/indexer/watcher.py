"""
Watchdog-based folder monitor.

Watches WATCHED_DOCS_DIR for new / modified / moved / deleted files
and feeds them through the indexing pipeline automatically.

Start via:
    from indexer.watcher import start_watcher
    observer = start_watcher()   # returns a running Observer thread
    ...
    observer.stop(); observer.join()
"""
from __future__ import annotations
import logging
import threading
from pathlib import Path

from watchdog.observers import Observer
from watchdog.events import (
    FileSystemEventHandler,
    FileCreatedEvent,
    FileModifiedEvent,
    FileMovedEvent,
    FileDeletedEvent,
)

from app.config import WATCHED_DOCS_DIR
from indexer.extractor import SUPPORTED_EXTENSIONS
from indexer.pipeline import index_file
from app.services.fts import delete_document
from app.services.qdrant_store import delete_doc

logger = logging.getLogger(__name__)

# Expose the helper so fts.py doesn't need to import pipeline
def _doc_id_from_path(filepath: str) -> str:
    import hashlib
    return hashlib.sha256(filepath.encode()).hexdigest()[:16]


class _DocEventHandler(FileSystemEventHandler):
    """Handle FS events for supported document types."""

    def _is_supported(self, path: str) -> bool:
        return Path(path).suffix.lower() in SUPPORTED_EXTENSIONS

    # -- created / modified --------------------------------------------------

    def on_created(self, event: FileCreatedEvent) -> None:
        if not event.is_directory and self._is_supported(event.src_path):
            logger.info("Detected new file: %s", event.src_path)
            index_file(Path(event.src_path))

    def on_modified(self, event: FileModifiedEvent) -> None:
        if not event.is_directory and self._is_supported(event.src_path):
            logger.info("Detected modified file: %s", event.src_path)
            index_file(Path(event.src_path))

    # -- moved ---------------------------------------------------------------

    def on_moved(self, event: FileMovedEvent) -> None:
        if event.is_directory:
            return
        src, dst = event.src_path, event.dest_path

        # Remove old entry
        if self._is_supported(src):
            doc_id = _doc_id_from_path(src)
            delete_document(doc_id)
            delete_doc(doc_id)
            logger.info("Removed moved-away file: %s", src)

        # Index under new path
        if self._is_supported(dst):
            logger.info("Indexing moved-to file: %s", dst)
            index_file(Path(dst))

    # -- deleted -------------------------------------------------------------

    def on_deleted(self, event: FileDeletedEvent) -> None:
        if not event.is_directory and self._is_supported(event.src_path):
            doc_id = _doc_id_from_path(event.src_path)
            delete_document(doc_id)
            delete_doc(doc_id)
            logger.info("Removed deleted file: %s", event.src_path)


def start_watcher(directory: Path | None = None) -> Observer:
    """
    Start the watchdog observer in a daemon thread.
    Returns the running Observer so the caller can stop it on shutdown.
    """
    watch_dir = Path(directory or WATCHED_DOCS_DIR)
    watch_dir.mkdir(parents=True, exist_ok=True)

    handler  = _DocEventHandler()
    observer = Observer()
    observer.schedule(handler, str(watch_dir), recursive=True)
    observer.daemon = True
    observer.start()
    logger.info("Watching for changes in: %s", watch_dir)
    return observer
