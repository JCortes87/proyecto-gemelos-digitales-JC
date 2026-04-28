import asyncio

from app.services.brightspace_client import get_brightspace_client
from app.services.sync_service import SyncService


def run_master_sync_job(orgUnitId: int) -> None:
    async def _run():
        bs = get_brightspace_client()
        svc = SyncService(bs)
        await svc.sync_master(orgUnitId)

    asyncio.run(_run())


def run_student_metrics_job(orgUnitId: int) -> None:
    async def _run():
        bs = get_brightspace_client()
        svc = SyncService(bs)
        await svc.sync_student_metric_snapshots(orgUnitId)

    asyncio.run(_run())