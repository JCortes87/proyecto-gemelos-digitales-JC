from datetime import datetime

from sqlalchemy import select

from app.db.models import SyncError, SyncRun, SyncState
from app.db.session import SessionLocal


class SyncTrackingService:
    def start_run(self, sync_type: str, org_unit_id: int | None = None) -> int:
        db = SessionLocal()
        try:
            run = SyncRun(
                sync_type=sync_type,
                org_unit_id=org_unit_id,
                status="running",
                started_at=datetime.utcnow(),
            )
            db.add(run)
            db.commit()
            db.refresh(run)
            return run.id
        finally:
            db.close()

    def finish_run(
        self,
        run_id: int,
        sync_type: str,
        org_unit_id: int | None,
        status: str,
        inserted_count: int = 0,
        updated_count: int = 0,
        error_count: int = 0,
        message: str | None = None,
        watermark: str | None = None,
    ) -> None:
        db = SessionLocal()
        try:
            run = db.get(SyncRun, run_id)
            if run:
                run.status = status
                run.finished_at = datetime.utcnow()
                run.inserted_count = inserted_count
                run.updated_count = updated_count
                run.error_count = error_count
                run.message = message

            state = db.execute(
                select(SyncState).where(
                    SyncState.sync_type == sync_type,
                    SyncState.org_unit_id == org_unit_id,
                )
            ).scalar_one_or_none()

            if state is None:
                state = SyncState(
                    sync_type=sync_type,
                    org_unit_id=org_unit_id,
                )
                db.add(state)

            state.last_run_at = datetime.utcnow()
            state.last_status = status
            if status == "success":
                state.last_success_at = datetime.utcnow()
            if watermark is not None:
                state.watermark = watermark

            db.commit()
        finally:
            db.close()

    def register_error(
        self,
        sync_run_id: int | None,
        sync_type: str,
        org_unit_id: int | None,
        error_message: str,
        entity_type: str | None = None,
        entity_id: str | None = None,
    ) -> None:
        db = SessionLocal()
        try:
            err = SyncError(
                sync_run_id=sync_run_id,
                sync_type=sync_type,
                org_unit_id=org_unit_id,
                entity_type=entity_type,
                entity_id=entity_id,
                error_message=error_message,
            )
            db.add(err)
            db.commit()
        finally:
            db.close()