"""Create the initial database, authentication, and import intake schema."""

from alembic import op
from app.db import models as _models  # noqa: F401
from app.db.base import Base

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create the initial schema from the canonical SQLAlchemy metadata."""

    Base.metadata.create_all(bind=op.get_bind())


def downgrade() -> None:
    """Remove the schema owned by this initial migration."""

    Base.metadata.drop_all(bind=op.get_bind())
