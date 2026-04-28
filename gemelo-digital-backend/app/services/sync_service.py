from typing import Any, Dict

from sqlalchemy import select

#|----- Import para los snapshots -----|
from datetime import datetime

from app.db.models import Enrollment, Student, DropboxFolder, GradeItem, OutcomeSet, StudentCourseMetricSnapshot
from app.db.session import SessionLocal
from app.services.brightspace_client import BrightspaceClient

#|-------------- Import para el tracking ----------------|
from app.services.sync_tracking_service import SyncTrackingService

#|------------- Import gemelo service -----------------|
from app.services.gemelo_service import GemeloService


class SyncService:
    def __init__(self, bs: BrightspaceClient):
        self.bs = bs
        #|------ Se utiliza esta nueva variable para el Sync-------|
        self.tracking = SyncTrackingService()
        
        #|------ Agregar el gemelo service ------------------------|
        self.gemelo = GemeloService(self.bs)

    async def sync_classlist(self, orgUnitId: int) -> Dict[str, Any]:
        run_id = self.tracking.start_run("classlist", orgUnitId)
        classlist = await self.bs.list_classlist(orgUnitId)

        inserted_students = 0
        updated_students = 0
        inserted_enrollments = 0
        updated_enrollments = 0

        db = SessionLocal()
        try:
            #|------- Lo modifiqué para hacer debug -----------|
            #for row in classlist:
            for row in classlist:
                user_id = row.get("Identifier") or row.get("UserId") or row.get("userId")
                if user_id is None:
                    continue

                try:
                    brightspace_user_id = int(user_id)
                except Exception:
                    continue

                display_name = (
                    row.get("DisplayName")
                    or row.get("displayName")
                    or row.get("Name")
                    or row.get("name")
                )

                email = row.get("Email") or row.get("email")

                #|-------- Este bloqué lo reemplacé para hacer debug ----------|
                # role_name = None
                # role = row.get("Role") or row.get("role")
                # if isinstance(role, dict):
                #     role_name = role.get("Name") or role.get("name")
                # elif isinstance(role, str):
                #     role_name = role
                
                #|-------- Esta es la nueva versión ------------|
                role_name = (
                    row.get("ClasslistRoleDisplayName")
                    or row.get("RoleName")
                    or row.get("roleName")
                    or row.get("ClasslistRoleName")
                )

                if not role_name:
                    role = row.get("Role") or row.get("role")
                    if isinstance(role, dict):
                        role_name = (
                            role.get("Name")
                            or role.get("name")
                            or role.get("RoleName")
                            or role.get("roleName")
                        )
                    elif isinstance(role, str):
                        role_name = role

                student = db.execute(
                    select(Student).where(Student.brightspace_user_id == brightspace_user_id)
                ).scalar_one_or_none()

                if student is None:
                    student = Student(
                        brightspace_user_id=brightspace_user_id,
                        display_name=display_name,
                        email=email,
                    )
                    db.add(student)
                    inserted_students += 1
                else:
                    changed = False
                    if display_name and student.display_name != display_name:
                        student.display_name = display_name
                        changed = True
                    if email and student.email != email:
                        student.email = email
                        changed = True
                    if changed:
                        updated_students += 1

                enrollment = db.execute(
                    select(Enrollment).where(
                        Enrollment.org_unit_id == orgUnitId,
                        Enrollment.brightspace_user_id == brightspace_user_id,
                    )
                ).scalar_one_or_none()

                if enrollment is None:
                    enrollment = Enrollment(
                        org_unit_id=orgUnitId,
                        brightspace_user_id=brightspace_user_id,
                        role_name=role_name,
                        is_active=True,
                    )
                    db.add(enrollment)
                    inserted_enrollments += 1
                else:
                    changed = False
                    if role_name and enrollment.role_name != role_name:
                        enrollment.role_name = role_name
                        changed = True
                    if enrollment.is_active is not True:
                        enrollment.is_active = True
                        changed = True
                    if changed:
                        updated_enrollments += 1

            db.commit()
            
            #|----------- Para el tracking --------------------|
            self.tracking.finish_run(
                run_id=run_id,
                sync_type="classlist",
                org_unit_id=orgUnitId,
                status="success",
                inserted_count=inserted_students + inserted_enrollments,
                updated_count=updated_students + updated_enrollments,
                error_count=0,
                message="Classlist sync completed",
            )

            return {
                "orgUnitId": orgUnitId,
                "classlist_count": len(classlist),
                "inserted_students": inserted_students,
                "updated_students": updated_students,
                "inserted_enrollments": inserted_enrollments,
                "updated_enrollments": updated_enrollments,
            }

        #|------- Reemplazo este bloque por el que lleva el tracking ---------|
        # except Exception:
        #     db.rollback()
        #     raise
        
        #|------- Este es el bloque que lleva el tracking -------------|
        except Exception as e:
            db.rollback()
            self.tracking.register_error(
                sync_run_id=run_id,
                sync_type="classlist",
                org_unit_id=orgUnitId,
                error_message=str(e),
            )
            self.tracking.finish_run(
                run_id=run_id,
                sync_type="classlist",
                org_unit_id=orgUnitId,
                status="failed",
                inserted_count=inserted_students + inserted_enrollments,
                updated_count=updated_students + updated_enrollments,
                error_count=1,
                message=str(e),
            )
            raise
        
        finally:
            db.close()
            

    async def sync_grade_items(self, orgUnitId: int) -> Dict[str, Any]:
        run_id = self.tracking.start_run("grade_items", orgUnitId)
        items = await self.bs.list_grade_items(orgUnitId)

        inserted = 0
        updated = 0

        db = SessionLocal()
        try:
            for row in items:
                grade_object_id = row.get("Id") or row.get("id")
                if grade_object_id is None:
                    continue

                try:
                    grade_object_id = int(grade_object_id)
                except Exception:
                    continue

                name = row.get("Name") or row.get("name")
                max_points = row.get("MaxPoints") or row.get("maxPoints")
                weight = row.get("Weight") or row.get("weight")

                entity = db.execute(
                    select(GradeItem).where(
                        GradeItem.org_unit_id == orgUnitId,
                        GradeItem.brightspace_grade_object_id == grade_object_id,
                    )
                ).scalar_one_or_none()

                if entity is None:
                    entity = GradeItem(
                        org_unit_id=orgUnitId,
                        brightspace_grade_object_id=grade_object_id,
                        name=name,
                        max_points=float(max_points) if max_points is not None else None,
                        weight=float(weight) if weight is not None else None,
                    )
                    db.add(entity)
                    inserted += 1
                else:
                    changed = False
                    if name and entity.name != name:
                        entity.name = name
                        changed = True
                    if max_points is not None:
                        mp = float(max_points)
                        if entity.max_points != mp:
                            entity.max_points = mp
                            changed = True
                    if weight is not None:
                        wt = float(weight)
                        if entity.weight != wt:
                            entity.weight = wt
                            changed = True
                    if changed:
                        updated += 1

            db.commit()

            self.tracking.finish_run(
                run_id=run_id,
                sync_type="grade_items",
                org_unit_id=orgUnitId,
                status="success",
                inserted_count=inserted,
                updated_count=updated,
                error_count=0,
                message="Grade items sync completed",
            )

            return {
                "orgUnitId": orgUnitId,
                "count": len(items),
                "inserted": inserted,
                "updated": updated,
            }

        except Exception as e:
            db.rollback()
            self.tracking.register_error(
                sync_run_id=run_id,
                sync_type="grade_items",
                org_unit_id=orgUnitId,
                error_message=str(e),
            )
            self.tracking.finish_run(
                run_id=run_id,
                sync_type="grade_items",
                org_unit_id=orgUnitId,
                status="failed",
                inserted_count=inserted,
                updated_count=updated,
                error_count=1,
                message=str(e),
            )
            raise
        finally:
            db.close()
            
    async def sync_dropbox_folders(self, orgUnitId: int) -> Dict[str, Any]:
        run_id = self.tracking.start_run("dropbox_folders", orgUnitId)
        folders = await self.bs.list_dropbox_folders(orgUnitId)

        inserted = 0
        updated = 0

        db = SessionLocal()
        try:
            for row in folders:
                folder_id = row.get("Id") or row.get("id")
                if folder_id is None:
                    continue

                try:
                    folder_id = int(folder_id)
                except Exception:
                    continue

                name = row.get("Name") or row.get("name")
                category = row.get("Category") or row.get("category")

                entity = db.execute(
                    select(DropboxFolder).where(
                        DropboxFolder.org_unit_id == orgUnitId,
                        DropboxFolder.brightspace_folder_id == folder_id,
                    )
                ).scalar_one_or_none()

                if entity is None:
                    entity = DropboxFolder(
                        org_unit_id=orgUnitId,
                        brightspace_folder_id=folder_id,
                        name=name,
                        category=str(category) if category is not None else None,
                    )
                    db.add(entity)
                    inserted += 1
                else:
                    changed = False
                    if name and entity.name != name:
                        entity.name = name
                        changed = True
                    if category is not None:
                        cat = str(category)
                        if entity.category != cat:
                            entity.category = cat
                            changed = True
                    if changed:
                        updated += 1

            db.commit()

            self.tracking.finish_run(
                run_id=run_id,
                sync_type="dropbox_folders",
                org_unit_id=orgUnitId,
                status="success",
                inserted_count=inserted,
                updated_count=updated,
                error_count=0,
                message="Dropbox folders sync completed",
            )

            return {
                "orgUnitId": orgUnitId,
                "count": len(folders),
                "inserted": inserted,
                "updated": updated,
            }

        except Exception as e:
            db.rollback()
            self.tracking.register_error(
                sync_run_id=run_id,
                sync_type="dropbox_folders",
                org_unit_id=orgUnitId,
                error_message=str(e),
            )
            self.tracking.finish_run(
                run_id=run_id,
                sync_type="dropbox_folders",
                org_unit_id=orgUnitId,
                status="failed",
                inserted_count=inserted,
                updated_count=updated,
                error_count=1,
                message=str(e),
            )
            raise
        finally:
            db.close()
            
    async def sync_outcome_sets(self, orgUnitId: int) -> Dict[str, Any]:
        run_id = self.tracking.start_run("outcome_sets", orgUnitId)
        sets_data = await self.bs.list_outcome_sets(orgUnitId)

        rows = sets_data if isinstance(sets_data, list) else (sets_data.get("Items") or sets_data.get("items") or [])
        inserted = 0
        updated = 0

        db = SessionLocal()
        try:
            for row in rows:
                outcome_set_id = row.get("Id") or row.get("id")
                if outcome_set_id is None:
                    continue

                try:
                    outcome_set_id = int(outcome_set_id)
                except Exception:
                    continue

                name = row.get("Name") or row.get("name")
                description = row.get("Description") or row.get("description")

                entity = db.execute(
                    select(OutcomeSet).where(
                        OutcomeSet.org_unit_id == orgUnitId,
                        OutcomeSet.brightspace_outcome_set_id == outcome_set_id,
                    )
                ).scalar_one_or_none()

                if entity is None:
                    entity = OutcomeSet(
                        org_unit_id=orgUnitId,
                        brightspace_outcome_set_id=outcome_set_id,
                        name=name,
                        description=description,
                    )
                    db.add(entity)
                    inserted += 1
                else:
                    changed = False
                    if name and entity.name != name:
                        entity.name = name
                        changed = True
                    if description is not None and entity.description != description:
                        entity.description = description
                        changed = True
                    if changed:
                        updated += 1

            db.commit()

            self.tracking.finish_run(
                run_id=run_id,
                sync_type="outcome_sets",
                org_unit_id=orgUnitId,
                status="success",
                inserted_count=inserted,
                updated_count=updated,
                error_count=0,
                message="Outcome sets sync completed",
            )

            return {
                "orgUnitId": orgUnitId,
                "count": len(rows),
                "inserted": inserted,
                "updated": updated,
            }

        except Exception as e:
            db.rollback()
            self.tracking.register_error(
                sync_run_id=run_id,
                sync_type="outcome_sets",
                org_unit_id=orgUnitId,
                error_message=str(e),
            )
            self.tracking.finish_run(
                run_id=run_id,
                sync_type="outcome_sets",
                org_unit_id=orgUnitId,
                status="failed",
                inserted_count=inserted,
                updated_count=updated,
                error_count=1,
                message=str(e),
            )
            raise
        finally:
            db.close()
        
    async def sync_master(self, orgUnitId: int) -> Dict[str, Any]:
        classlist_result = await self.sync_classlist(orgUnitId)
        grade_items_result = await self.sync_grade_items(orgUnitId)
        dropbox_result = await self.sync_dropbox_folders(orgUnitId)
        outcome_sets_result = await self.sync_outcome_sets(orgUnitId)

        return {
            "orgUnitId": orgUnitId,
            "classlist": classlist_result,
            "grade_items": grade_items_result,
            "dropbox_folders": dropbox_result,
            "outcome_sets": outcome_sets_result,
        }
        
    async def sync_student_metric_snapshots(self, orgUnitId: int) -> Dict[str, Any]:
        run_id = self.tracking.start_run("student_metric_snapshots", orgUnitId)

        classlist = await self.bs.list_classlist(orgUnitId)
        student_ids = []

        for row in classlist:
            user_id = row.get("Identifier") or row.get("UserId") or row.get("userId")
            if user_id is None:
                continue
            try:
                student_ids.append(int(user_id))
            except Exception:
                continue

        metrics_by_user = await self.compute_students_gradebook_metrics_for_sync(
            orgUnitId=orgUnitId,
            student_ids=student_ids,
        )

        inserted = 0
        updated = 0

        db = SessionLocal()
        try:
            for user_id in student_ids:
                summary = metrics_by_user.get(user_id) or {}

                entity = db.execute(
                    select(StudentCourseMetricSnapshot).where(
                        StudentCourseMetricSnapshot.org_unit_id == orgUnitId,
                        StudentCourseMetricSnapshot.brightspace_user_id == user_id,
                    )
                ).scalar_one_or_none()

                payload = {
                    "current_performance_pct": summary.get("currentPerformancePct"),
                    "coverage_pct": summary.get("coveragePct"),
                    "graded_items_count": int(summary.get("gradedItemsCount") or 0),
                    "total_items_count": int(summary.get("totalItemsCount") or 0),
                    "not_submitted_weight_pct": float(summary.get("notSubmittedWeightPct") or 0.0),
                    "pending_submitted_weight_pct": float(summary.get("pendingSubmittedWeightPct") or 0.0),
                    "open_weight_pct": float(summary.get("openWeightPct") or 0.0),
                    "overdue_count": int(summary.get("overdueCount") or 0),
                    "pending_submitted_count": int(summary.get("pendingSubmittedCount") or 0),
                    "open_count": int(summary.get("openCount") or 0),
                    "risk_level": self.gemelo._risk_from_performance(
                        summary.get("currentPerformancePct"),
                        {"critical": 50.0, "watch": 70.0},
                    ),
                    "updated_at": datetime.utcnow(),
                }

                if entity is None:
                    entity = StudentCourseMetricSnapshot(
                        org_unit_id=orgUnitId,
                        brightspace_user_id=user_id,
                        **payload,
                    )
                    db.add(entity)
                    inserted += 1
                else:
                    changed = False
                    for key, value in payload.items():
                        if getattr(entity, key) != value:
                            setattr(entity, key, value)
                            changed = True
                    if changed:
                        updated += 1

            db.commit()

            self.tracking.finish_run(
                run_id=run_id,
                sync_type="student_metric_snapshots",
                org_unit_id=orgUnitId,
                status="success",
                inserted_count=inserted,
                updated_count=updated,
                error_count=0,
                message="Student metric snapshot sync completed",
            )

            return {
                "orgUnitId": orgUnitId,
                "inserted": inserted,
                "updated": updated,
                "count": len(student_ids),
            }

        except Exception as e:
            db.rollback()
            self.tracking.register_error(
                sync_run_id=run_id,
                sync_type="student_metric_snapshots",
                org_unit_id=orgUnitId,
                error_message=str(e),
            )
            self.tracking.finish_run(
                run_id=run_id,
                sync_type="student_metric_snapshots",
                org_unit_id=orgUnitId,
                status="failed",
                inserted_count=inserted,
                updated_count=updated,
                error_count=1,
                message=str(e),
            )
            raise
        finally:
            db.close()    
            
    async def compute_students_gradebook_metrics_for_sync(self, orgUnitId: int, student_ids: list[int]) -> Dict[int, Any]:
        return await self.gemelo.compute_students_gradebook_metrics(
            orgUnitId=orgUnitId,
            student_ids=student_ids,
            course_cfg=None,
            )        
      
      
      
