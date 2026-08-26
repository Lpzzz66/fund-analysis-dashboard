from collections.abc import Iterator

import pytest
from app.db.base import Base
from app.db.session import create_engine
from sqlalchemy.orm import Session


@pytest.fixture()
def session() -> Iterator[Session]:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db_session:
        yield db_session
    engine.dispose()
