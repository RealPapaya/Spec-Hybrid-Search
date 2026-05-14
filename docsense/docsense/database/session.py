"""
Database engine and session management.

Provides:
- ``get_engine()``        — singleton SQLAlchemy engine
- ``get_session()``       — context-manager session (for pipeline / watcher code)
- ``get_db_session()``    — generator dependency for FastAPI ``Depends()``
- ``init_db()``           — create all tables on first run
"""

from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from docsense.config import get_settings
from docsense.database.models import Base

_engine = None
_SessionLocal: sessionmaker | None = None


def get_engine():
    """Return (creating if necessary) the singleton SQLAlchemy engine."""
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_engine(
            settings.sqlite_url,
            echo=False,
            # SQLite requires this flag when accessed from multiple threads
            connect_args={"check_same_thread": False},
        )
    return _engine


def _get_session_factory() -> sessionmaker:
    """Return the cached session factory."""
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=get_engine(), expire_on_commit=False)
    return _SessionLocal


@contextmanager
def get_session() -> Generator[Session, None, None]:
    """
    Context manager yielding a database session.

    Commits on clean exit, rolls back on any exception, and always closes
    the session.  Use this in pipeline and watcher code::

        with get_session() as session:
            session.add(doc)
    """
    session: Session = _get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db_session() -> Generator[Session, None, None]:
    """
    FastAPI dependency that yields a per-request database session.

    Usage::

        @router.get("/example")
        def example(db: Session = Depends(get_db_session)):
            ...
    """
    session: Session = _get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def init_db() -> None:
    """Create all ORM tables that do not yet exist.

    Safe to call multiple times (uses ``CREATE TABLE IF NOT EXISTS`` semantics).
    For production schema migrations use Alembic instead.
    """
    Base.metadata.create_all(bind=get_engine())
