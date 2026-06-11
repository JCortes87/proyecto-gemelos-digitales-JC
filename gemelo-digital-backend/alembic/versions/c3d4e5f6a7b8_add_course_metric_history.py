"""add course_metric_history table for trend snapshots

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6
Create Date: 2026-04-29

"""
from typing import Union, Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'course_metric_history',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('org_unit_id', sa.Integer(), nullable=False, index=True),
        sa.Column('snapshot_date', sa.String(10), nullable=False, index=True),
        sa.Column('avg_pct', sa.Float(), nullable=True),
        sa.Column('at_risk_pct', sa.Float(), nullable=True),
        sa.Column('coverage_pct', sa.Float(), nullable=True),
        sa.Column('total_students', sa.Integer(), default=0),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), default=sa.func.now()),
        sa.UniqueConstraint('org_unit_id', 'snapshot_date', name='uq_course_metric_history_course_date'),
    )


def downgrade() -> None:
    op.drop_table('course_metric_history')
