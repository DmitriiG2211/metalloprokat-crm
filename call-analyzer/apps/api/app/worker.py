import asyncio
import logging
import time

from app.database import SessionLocal, init_db
from app.seed import seed_database
from app.services.pipeline import cleanup_stale_running_jobs, run_due_jobs_once

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("worker")


async def main() -> None:
    init_db()
    with SessionLocal() as db:
        seed_database(db)
        recovered = cleanup_stale_running_jobs(db)
        if recovered:
            logger.info("Recovered stale jobs: %s", recovered)
    while True:
        with SessionLocal() as db:
            processed = await run_due_jobs_once(db, limit=3)
        if processed == 0:
            time.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())
