"""
start.py — single entry point for DocSense.

Run:
    python start.py

What this does
--------------
1. Download the Qdrant binary if missing (first run only, ~35 MB zip)
2. Launch Qdrant as a subprocess
3. Wait until Qdrant is healthy (polls /healthz)
4. Launch Uvicorn (FastAPI) in a background thread
5. Open http://localhost:8000 in the default browser
6. Block until Ctrl-C, then cleanly stop everything
"""
from __future__ import annotations
import os
import sys
import json
import time
import shutil
import signal
import zipfile
import tarfile
import logging
import platform
import threading
import subprocess
import webbrowser
import urllib.request
from pathlib import Path

# ── Bootstrap: make sure the project root is on sys.path ─────────────────────
PROJECT_ROOT = Path(__file__).parent.resolve()
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.config import (
    QDRANT_BIN_DIR,
    QDRANT_BIN_PATH,
    QDRANT_BIN_NAME,
    QDRANT_ASSET_SUFFIX,
    QDRANT_DATA_DIR,
    QDRANT_HOST,
    QDRANT_PORT,
    API_HOST,
    API_PORT,
    WATCHED_DOCS_DIR,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("start")

# ── GitHub release helpers ────────────────────────────────────────────────────
GITHUB_API = "https://api.github.com/repos/qdrant/qdrant/releases/latest"


def _latest_release_url() -> tuple[str, str]:
    """Return (version_tag, download_url) for the correct platform asset."""
    logger.info("Fetching latest Qdrant release info …")
    req = urllib.request.Request(GITHUB_API, headers={"User-Agent": "docsense"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())

    tag    = data["tag_name"]
    assets = data.get("assets", [])
    for asset in assets:
        if asset["name"].endswith(QDRANT_ASSET_SUFFIX):
            return tag, asset["browser_download_url"]

    raise RuntimeError(
        f"No matching Qdrant asset for suffix {QDRANT_ASSET_SUFFIX!r} in release {tag}"
    )


def _download_with_progress(url: str, dest: Path) -> None:
    logger.info("Downloading %s …", url)
    with urllib.request.urlopen(url, timeout=120) as resp:
        total = int(resp.headers.get("Content-Length", 0))
        downloaded = 0
        chunk_size  = 1024 * 64
        with open(dest, "wb") as fh:
            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                fh.write(chunk)
                downloaded += len(chunk)
                if total:
                    pct = downloaded * 100 // total
                    print(f"\r  {pct:3d}%  {downloaded/1_048_576:.1f} MB", end="", flush=True)
    print()


def ensure_qdrant_binary() -> None:
    """Download and unpack the Qdrant binary if it isn't already present."""
    if QDRANT_BIN_PATH.exists():
        logger.info("Qdrant binary found: %s", QDRANT_BIN_PATH)
        return

    QDRANT_BIN_DIR.mkdir(parents=True, exist_ok=True)
    tag, url = _latest_release_url()
    logger.info("Downloading Qdrant %s …", tag)

    archive = QDRANT_BIN_DIR / url.split("/")[-1]
    _download_with_progress(url, archive)

    logger.info("Extracting …")
    if archive.suffix == ".zip":
        with zipfile.ZipFile(archive) as zf:
            # Extract only the binary
            for member in zf.namelist():
                if member.endswith(QDRANT_BIN_NAME):
                    zf.extract(member, QDRANT_BIN_DIR)
                    extracted = QDRANT_BIN_DIR / member
                    extracted.rename(QDRANT_BIN_PATH)
                    break
    else:
        with tarfile.open(archive) as tf:
            for member in tf.getmembers():
                if member.name.endswith(QDRANT_BIN_NAME):
                    member.name = QDRANT_BIN_NAME
                    tf.extract(member, QDRANT_BIN_DIR)
                    break

    archive.unlink(missing_ok=True)

    if platform.system() != "Windows":
        QDRANT_BIN_PATH.chmod(0o755)

    logger.info("Qdrant binary ready: %s", QDRANT_BIN_PATH)


# ── Qdrant process ────────────────────────────────────────────────────────────

def start_qdrant() -> subprocess.Popen:
    QDRANT_DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    # Newer Qdrant versions prefer environment variables or a config file over CLI flags
    env = os.environ.copy()
    env["QDRANT__STORAGE__STORAGE_PATH"] = str(QDRANT_DATA_DIR)
    env["QDRANT__SERVICE__HTTP_PORT"] = str(QDRANT_PORT)
    env["QDRANT__SERVICE__HOST"] = QDRANT_HOST
    
    cmd = [str(QDRANT_BIN_PATH)]
    logger.info("Starting Qdrant: %s", " ".join(cmd))
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        env=env,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if platform.system() == "Windows" else 0,
    )
    return proc


def wait_for_qdrant(timeout: int = 30) -> None:
    url = f"http://{QDRANT_HOST}:{QDRANT_PORT}/healthz"
    deadline = time.time() + timeout
    logger.info("Waiting for Qdrant to be ready …")
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status == 200:
                    logger.info("Qdrant is ready.")
                    return
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError(f"Qdrant did not become healthy within {timeout}s")


# ── Uvicorn thread ────────────────────────────────────────────────────────────

def start_uvicorn() -> threading.Thread:
    import uvicorn

    config = uvicorn.Config(
        "app.main:app",
        host=API_HOST,
        port=API_PORT,
        log_level="info",
        reload=False,
    )
    server = uvicorn.Server(config)

    thread = threading.Thread(target=server.run, daemon=True, name="uvicorn")
    thread.start()
    return thread


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    # 1. Ensure required dirs exist
    WATCHED_DOCS_DIR.mkdir(parents=True, exist_ok=True)

    # 2. Download Qdrant binary if needed
    ensure_qdrant_binary()

    # 3. Launch Qdrant
    qdrant_proc = start_qdrant()
    try:
        wait_for_qdrant()
    except RuntimeError as exc:
        logger.error(str(exc))
        qdrant_proc.terminate()
        sys.exit(1)

    # 4. Start Uvicorn in background thread
    logger.info("Starting DocSense API on http://localhost:%d …", API_PORT)
    _uvicorn_thread = start_uvicorn()
    time.sleep(1.5)   # give uvicorn a moment to bind

    # 5. Open browser unless the launcher is handling it.
    url = f"http://localhost:{API_PORT}"
    if os.environ.get("DOCSENSE_OPEN_BROWSER", "1").lower() not in {"0", "false", "no"}:
        logger.info("Opening browser at %s", url)
        webbrowser.open(url)
    else:
        logger.info("Browser launch is handled by the DocSense launcher.")

    # 6. Block until Ctrl-C
    logger.info("DocSense is running. Press Ctrl-C to stop.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass

    # 7. Shutdown
    logger.info("Shutting down …")
    qdrant_proc.terminate()
    try:
        qdrant_proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        qdrant_proc.kill()
    logger.info("Goodbye.")


if __name__ == "__main__":
    main()
