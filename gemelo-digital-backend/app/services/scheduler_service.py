from apscheduler.schedulers.background import BackgroundScheduler

from app.services.job_service import run_master_sync_job, run_student_metrics_job

scheduler = BackgroundScheduler(timezone="America/Bogota")


def start_scheduler() -> None:
    if not scheduler.running:
        scheduler.start()


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)


def register_default_jobs(orgUnitId: int) -> None:
    existing_ids = {job.id for job in scheduler.get_jobs()}

    if "master_sync_job" not in existing_ids:
        scheduler.add_job(
            run_master_sync_job,
            "interval",
            minutes=30,
            id="master_sync_job",
            replace_existing=True,
            kwargs={"orgUnitId": orgUnitId},
        )

    if "student_metrics_job" not in existing_ids:
        scheduler.add_job(
            run_student_metrics_job,
            "interval",
            minutes=5,
            id="student_metrics_job",
            replace_existing=True,
            kwargs={"orgUnitId": orgUnitId},
        )