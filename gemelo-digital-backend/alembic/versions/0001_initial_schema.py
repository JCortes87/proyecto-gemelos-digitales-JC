"""initial schema — all tables

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-04-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001_initial_schema"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "courses",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("org_unit_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("code", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("org_unit_id"),
    )
    op.create_index("ix_courses_org_unit_id", "courses", ["org_unit_id"], unique=True)

    op.create_table(
        "students",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("brightspace_user_id", sa.Integer(), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("brightspace_user_id"),
    )
    op.create_index("ix_students_brightspace_user_id", "students", ["brightspace_user_id"], unique=True)

    op.create_table(
        "enrollments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("org_unit_id", sa.Integer(), nullable=False),
        sa.Column("brightspace_user_id", sa.Integer(), nullable=False),
        sa.Column("role_name", sa.String(100), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("org_unit_id", "brightspace_user_id", name="uq_enrollment_course_user"),
    )
    op.create_index("ix_enrollments_org_unit_id", "enrollments", ["org_unit_id"], unique=False)
    op.create_index("ix_enrollments_brightspace_user_id", "enrollments", ["brightspace_user_id"], unique=False)

    op.create_table(
        "grade_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("org_unit_id", sa.Integer(), nullable=False),
        sa.Column("brightspace_grade_object_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("max_points", sa.Float(), nullable=True),
        sa.Column("weight", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_grade_items_org_unit_id", "grade_items", ["org_unit_id"], unique=False)
    op.create_index("ix_grade_items_brightspace_grade_object_id", "grade_items", ["brightspace_grade_object_id"], unique=False)

    op.create_table(
        "dropbox_folders",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("org_unit_id", sa.Integer(), nullable=False),
        sa.Column("brightspace_folder_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("category", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("org_unit_id", "brightspace_folder_id", name="uq_dropbox_folder_course_folder"),
    )
    op.create_index("ix_dropbox_folders_org_unit_id", "dropbox_folders", ["org_unit_id"], unique=False)
    op.create_index("ix_dropbox_folders_brightspace_folder_id", "dropbox_folders", ["brightspace_folder_id"], unique=False)

    op.create_table(
        "outcome_sets",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("org_unit_id", sa.Integer(), nullable=False),
        sa.Column("brightspace_outcome_set_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("org_unit_id", "brightspace_outcome_set_id", name="uq_outcome_set_course_set"),
    )
    op.create_index("ix_outcome_sets_org_unit_id", "outcome_sets", ["org_unit_id"], unique=False)
    op.create_index("ix_outcome_sets_brightspace_outcome_set_id", "outcome_sets", ["brightspace_outcome_set_id"], unique=False)

    op.create_table(
        "sync_runs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sync_type", sa.String(100), nullable=False),
        sa.Column("org_unit_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(50), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("inserted_count", sa.Integer(), nullable=False),
        sa.Column("updated_count", sa.Integer(), nullable=False),
        sa.Column("error_count", sa.Integer(), nullable=False),
        sa.Column("message", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sync_runs_sync_type", "sync_runs", ["sync_type"], unique=False)
    op.create_index("ix_sync_runs_org_unit_id", "sync_runs", ["org_unit_id"], unique=False)
    op.create_index("ix_sync_runs_status", "sync_runs", ["status"], unique=False)

    op.create_table(
        "sync_state",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sync_type", sa.String(100), nullable=False),
        sa.Column("org_unit_id", sa.Integer(), nullable=True),
        sa.Column("last_success_at", sa.DateTime(), nullable=True),
        sa.Column("last_run_at", sa.DateTime(), nullable=True),
        sa.Column("last_status", sa.String(50), nullable=True),
        sa.Column("watermark", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sync_type", "org_unit_id", name="uq_sync_state_type_course"),
    )
    op.create_index("ix_sync_state_sync_type", "sync_state", ["sync_type"], unique=False)
    op.create_index("ix_sync_state_org_unit_id", "sync_state", ["org_unit_id"], unique=False)

    op.create_table(
        "sync_errors",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sync_run_id", sa.Integer(), nullable=True),
        sa.Column("sync_type", sa.String(100), nullable=False),
        sa.Column("org_unit_id", sa.Integer(), nullable=True),
        sa.Column("entity_type", sa.String(100), nullable=True),
        sa.Column("entity_id", sa.String(255), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sync_errors_sync_run_id", "sync_errors", ["sync_run_id"], unique=False)
    op.create_index("ix_sync_errors_sync_type", "sync_errors", ["sync_type"], unique=False)
    op.create_index("ix_sync_errors_org_unit_id", "sync_errors", ["org_unit_id"], unique=False)

    op.create_table(
        "student_course_metric_snapshots",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("org_unit_id", sa.Integer(), nullable=False),
        sa.Column("brightspace_user_id", sa.Integer(), nullable=False),
        sa.Column("current_performance_pct", sa.Float(), nullable=True),
        sa.Column("coverage_pct", sa.Float(), nullable=True),
        sa.Column("graded_items_count", sa.Integer(), nullable=False),
        sa.Column("total_items_count", sa.Integer(), nullable=False),
        sa.Column("not_submitted_weight_pct", sa.Float(), nullable=False),
        sa.Column("pending_submitted_weight_pct", sa.Float(), nullable=False),
        sa.Column("open_weight_pct", sa.Float(), nullable=False),
        sa.Column("overdue_count", sa.Integer(), nullable=False),
        sa.Column("pending_submitted_count", sa.Integer(), nullable=False),
        sa.Column("open_count", sa.Integer(), nullable=False),
        sa.Column("risk_level", sa.String(50), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "org_unit_id", "brightspace_user_id",
            name="uq_student_course_metric_snapshot_course_user",
        ),
    )
    op.create_index("ix_student_course_metric_snapshots_org_unit_id", "student_course_metric_snapshots", ["org_unit_id"], unique=False)
    op.create_index("ix_student_course_metric_snapshots_brightspace_user_id", "student_course_metric_snapshots", ["brightspace_user_id"], unique=False)


def downgrade() -> None:
    op.drop_table("student_course_metric_snapshots")
    op.drop_table("sync_errors")
    op.drop_table("sync_state")
    op.drop_table("sync_runs")
    op.drop_table("outcome_sets")
    op.drop_table("dropbox_folders")
    op.drop_table("grade_items")
    op.drop_table("enrollments")
    op.drop_table("students")
    op.drop_table("courses")
