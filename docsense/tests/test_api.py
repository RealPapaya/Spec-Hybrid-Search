"""
Integration tests for the FastAPI endpoints (no Qdrant / embedding required).

Uses an in-memory SQLite database and monkey-patches heavy components so the
test suite runs without GPU, Qdrant, or real documents.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from docsense.database.models import Base
from docsense.database.session import get_db_session


# ── In-memory SQLite fixture ──────────────────────────────────────────────

@pytest.fixture(scope="module")
def db_engine():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def db_session(db_engine):
    Session = sessionmaker(bind=db_engine, expire_on_commit=False)
    session = Session()
    yield session
    session.close()


@pytest.fixture()
def client(db_session):
    from docsense.api.main import create_app

    test_app = create_app()
    test_app.dependency_overrides[get_db_session] = lambda: db_session

    with TestClient(test_app) as c:
        yield c


# ── Tests ────────────────────────────────────────────────────────────────

class TestHealthEndpoint:
    def test_health_returns_ok(self, client):
        resp = client.get("/admin/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


class TestRootEndpoint:
    def test_root_returns_service_info(self, client):
        resp = client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["service"] == "DocSense"


class TestDocumentsEndpoint:
    def test_list_documents_empty(self, client):
        resp = client.get("/docs")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_get_nonexistent_document_404(self, client):
        resp = client.get("/docs/nonexistent-id")
        assert resp.status_code == 404


class TestStatsEndpoint:
    def test_stats_returns_zero_counts(self, client, monkeypatch):
        # Patch QdrantStore so we don't need a live Qdrant instance
        import docsense.api.routes.admin as admin_mod

        class _FakeStore:
            def get_collection_info(self):
                return {"points_count": 0, "name": "test", "status": "green"}

        monkeypatch.setattr(admin_mod, "QdrantStore", _FakeStore, raising=False)
        # Also patch at import location
        import docsense.indexer.qdrant_store as qs_mod
        monkeypatch.setattr(qs_mod, "QdrantStore", _FakeStore, raising=False)

        resp = client.get("/admin/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_documents"] == 0
        assert data["total_chunks"] == 0
