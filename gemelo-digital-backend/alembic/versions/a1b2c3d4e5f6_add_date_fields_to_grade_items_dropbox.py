"""add date and link fields to grade_items and dropbox_folders

Revision ID: a1b2c3d4e5f6
Revises: ef7efb89bf39
Create Date: 2026-04-29

"""
from typing import Union, Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'b6f1918135ed'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('grade_items', sa.Column('due_date', sa.Text(), nullable=True))
    op.add_column('grade_items', sa.Column('end_date', sa.Text(), nullable=True))
    op.add_column('grade_items', sa.Column('grade_type', sa.String(50), nullable=True))
    op.add_column('grade_items', sa.Column('category_id', sa.Integer(), nullable=True))
    op.add_column('grade_items', sa.Column('associated_tool_id', sa.Integer(), nullable=True))
    op.add_column('grade_items', sa.Column('associated_tool_item_id', sa.Integer(), nullable=True))

    op.add_column('dropbox_folders', sa.Column('due_date', sa.Text(), nullable=True))
    op.add_column('dropbox_folders', sa.Column('start_date', sa.Text(), nullable=True))
    op.add_column('dropbox_folders', sa.Column('end_date', sa.Text(), nullable=True))
    op.add_column('dropbox_folders', sa.Column('grade_item_id', sa.Integer(), nullable=True))
    op.add_column('dropbox_folders', sa.Column('category_id', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('grade_items', 'due_date')
    op.drop_column('grade_items', 'end_date')
    op.drop_column('grade_items', 'grade_type')
    op.drop_column('grade_items', 'category_id')
    op.drop_column('grade_items', 'associated_tool_id')
    op.drop_column('grade_items', 'associated_tool_item_id')

    op.drop_column('dropbox_folders', 'due_date')
    op.drop_column('dropbox_folders', 'start_date')
    op.drop_column('dropbox_folders', 'end_date')
    op.drop_column('dropbox_folders', 'grade_item_id')
    op.drop_column('dropbox_folders', 'category_id')
