"""add usage tracking / session tables (known_users, login_events, app_sessions,
announcements, bug_reports)

Hasta ahora estas tablas las creaba `usage_tracking.ensure_tables()` con
`create_all` en el arranque de la app, sin migración. Esta revisión las pone
bajo Alembic. Es idempotente: en bases donde ya existen (producción) no hace
nada; en bases nuevas las crea con el mismo esquema que generaba create_all.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-10-01

"""
from typing import Union, Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def _existing_tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    existing = _existing_tables()

    if 'known_users' not in existing:
        op.create_table(
            'known_users',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('user_id', sa.String(50), nullable=False),
            sa.Column('name', sa.String(255), nullable=True),
            sa.Column('email', sa.String(255), nullable=True),
            sa.Column('role', sa.String(100), nullable=True),
            sa.Column('audience', sa.String(20), nullable=True),
            sa.Column('first_seen', sa.DateTime(), nullable=False),
            sa.Column('last_seen', sa.DateTime(), nullable=False),
            sa.Column('login_count', sa.Integer(), nullable=False),
        )
        op.create_index('ix_known_users_user_id', 'known_users', ['user_id'], unique=True)
        op.create_index('ix_known_users_last_seen', 'known_users', ['last_seen'])

    if 'login_events' not in existing:
        op.create_table(
            'login_events',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('user_id', sa.String(50), nullable=False),
            sa.Column('name', sa.String(255), nullable=True),
            sa.Column('email', sa.String(255), nullable=True),
            sa.Column('role', sa.String(100), nullable=True),
            sa.Column('logged_in_at', sa.DateTime(), nullable=False),
        )
        op.create_index('ix_login_events_user_id', 'login_events', ['user_id'])
        op.create_index('ix_login_events_logged_in_at', 'login_events', ['logged_in_at'])

    if 'app_sessions' not in existing:
        op.create_table(
            'app_sessions',
            sa.Column('session_id', sa.String(64), primary_key=True),
            sa.Column('data', sa.Text(), nullable=False),
            sa.Column('expires_at', sa.DateTime(), nullable=False),
            sa.Column('purge_after', sa.DateTime(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=False),
        )
        op.create_index('ix_app_sessions_expires_at', 'app_sessions', ['expires_at'])
        op.create_index('ix_app_sessions_purge_after', 'app_sessions', ['purge_after'])

    if 'announcements' not in existing:
        op.create_table(
            'announcements',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('ts', sa.DateTime(), nullable=False),
            sa.Column('subject', sa.String(255), nullable=False),
            sa.Column('message', sa.Text(), nullable=False),
            sa.Column('tag', sa.String(50), nullable=True),
            sa.Column('author', sa.String(255), nullable=True),
            sa.Column('email_sent', sa.Boolean(), nullable=False),
            sa.Column('recipient_count', sa.Integer(), nullable=False),
        )
        op.create_index('ix_announcements_ts', 'announcements', ['ts'])

    if 'bug_reports' not in existing:
        op.create_table(
            'bug_reports',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('ts', sa.DateTime(), nullable=False),
            sa.Column('title', sa.String(255), nullable=True),
            sa.Column('severity', sa.String(20), nullable=True),
            sa.Column('description', sa.Text(), nullable=False),
            sa.Column('user_id', sa.String(50), nullable=True),
            sa.Column('user_name', sa.String(255), nullable=True),
            sa.Column('user_email', sa.String(255), nullable=True),
            sa.Column('context', sa.Text(), nullable=True),
        )
        op.create_index('ix_bug_reports_ts', 'bug_reports', ['ts'])
        op.create_index('ix_bug_reports_user_id', 'bug_reports', ['user_id'])


def downgrade() -> None:
    # Solo se eliminan si existen; ojo: borra historial de uso, sesiones,
    # anuncios y reportes de error.
    existing = _existing_tables()
    for table in ('bug_reports', 'announcements', 'app_sessions', 'login_events', 'known_users'):
        if table in existing:
            op.drop_table(table)
