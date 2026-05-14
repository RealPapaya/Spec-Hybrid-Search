import multiprocessing
import uvicorn
import time
import sys
import logging
from docsense.config import get_settings
from docsense.watcher.daemon import main as watcher_main

# Set up logging for the main launcher
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] Launcher: %(message)s")
logger = logging.getLogger(__name__)

def run_watcher():
    logger.info("Starting watcher daemon...")
    watcher_main()

def run_api():
    logger.info("Starting API server...")
    settings = get_settings()
    uvicorn.run(
        "docsense.api.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        log_level=settings.log_level.lower(),
    )

if __name__ == '__main__':
    # Needed for multiprocessing in PyInstaller Windows
    multiprocessing.freeze_support()
    
    # Initialize DB before forking to ensure safety
    from docsense.database.session import init_db
    init_db()

    watcher_proc = multiprocessing.Process(target=run_watcher)
    api_proc = multiprocessing.Process(target=run_api)

    watcher_proc.start()
    api_proc.start()

    try:
        while True:
            time.sleep(1)
            if not watcher_proc.is_alive() or not api_proc.is_alive():
                logger.error("One of the background processes died.")
                break
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    
    watcher_proc.terminate()
    api_proc.terminate()
    watcher_proc.join()
    api_proc.join()
    sys.exit(0)
