import logging
import re
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import declarative_base, sessionmaker

from config import DATABASE_URL, DB_PATH

log = logging.getLogger("outreach.database")


def _get_engine():
    raw_url = (DATABASE_URL or "").strip()
    if raw_url:
        # Normalize postgres URLs for SQLAlchemy psycopg2 driver
        if raw_url.startswith("postgres://"):
            raw_url = raw_url.replace("postgres://", "postgresql+psycopg2://", 1)
        elif raw_url.startswith("postgresql://") and not raw_url.startswith("postgresql+"):
            raw_url = raw_url.replace("postgresql://", "postgresql+psycopg2://", 1)

        # Remove pgbouncer parameter from query if present as psycopg2 handles it directly
        clean_url = re.sub(r"[?&]pgbouncer=(true|false)", "", raw_url)
        clean_url = clean_url.rstrip("?&")

        log.info("Connecting to PostgreSQL database")
        return create_engine(
            clean_url,
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True,
            pool_recycle=300,
        )

    log.info("Using local SQLite database at %s", DB_PATH)
    sqlite_engine = create_engine(
        f"sqlite:///{DB_PATH}",
        connect_args={"check_same_thread": False},
    )

    @event.listens_for(sqlite_engine, "connect")
    def _sqlite_fk(dbapi_conn, _record):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    return sqlite_engine


engine = _get_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


def init_db():
    import models  # noqa: F401  (registers tables with Base.metadata)

    log.info("Creating tables in database...")
    Base.metadata.create_all(bind=engine)
    log.info("Database tables initialized successfully.")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
