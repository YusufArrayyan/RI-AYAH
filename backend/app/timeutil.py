from datetime import UTC, datetime


def utcnow() -> datetime:
    """Waktu UTC naif (SQLite tidak menyimpan zona waktu)."""
    return datetime.now(UTC).replace(tzinfo=None)
