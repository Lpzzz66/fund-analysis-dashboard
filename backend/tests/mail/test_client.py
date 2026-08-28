from __future__ import annotations

import pytest

from app.mail.client import ImapClient, MailMessageError
from app.mail.config import MailSettings

from .conftest import FakeConnection, make_email


def _make_settings() -> MailSettings:
    return MailSettings(
        host="imap.example.test",
        port=993,
        username="funds@example.test",
        password="test-only-authorisation-code",
        mailbox="INBOX",
    )


def _fake_connection(
    messages: dict[str, bytes | None],
) -> tuple[ImapClient, FakeConnection]:
    fake = FakeConnection(messages)
    client = ImapClient(_make_settings(), connection_factory=lambda _s: fake)
    return client, fake


def _open(client: ImapClient) -> FakeConnection:
    """Enter the managed connection and return the underlying fake."""

    cm = client.open()
    cm.__enter__()
    return cm.connection  # type: ignore[attr-defined]


def test_fetch_headers_bulk_handles_sparse_uids() -> None:
    """``SEARCH ALL`` returns non-contiguous UIDs after deletions; the
    ranged ``UID FETCH lo:hi`` request must still map each present UID to
    its Message-ID header and silently drop the gaps."""

    messages = {
        "1": make_email("<one@example.test>", []),
        "2": make_email("<two@example.test>", []),
        # gap: 3, 4, 5 deleted
        "6": make_email("<six@example.test>", []),
    }
    client, fake = _fake_connection(messages)
    connection = _open(client)

    header_map = client.fetch_headers_bulk(connection, ["1", "2", "6"])

    # Sparse range "1:6" requested exactly once, but only present UIDs
    # returned and mapped. The deleted UIDs in between are simply absent.
    assert fake.bulk_fetch_calls == ["1:6"]
    assert set(header_map) == {"1", "2", "6"}
    assert b"<one@example.test>" in header_map["1"]
    assert b"<two@example.test>" in header_map["2"]
    assert b"<six@example.test>" in header_map["6"]


def test_fetch_headers_bulk_splits_into_chunks() -> None:
    """More than chunk_size UIDs must produce multiple ranged requests."""

    messages = {
        str(uid): make_email(f"<m{uid}@example.test>", []) for uid in range(1, 1002)
    }
    client, fake = _fake_connection(messages)
    connection = _open(client)

    uids = [str(uid) for uid in range(1, 1002)]
    header_map = client.fetch_headers_bulk(connection, uids, chunk_size=500)

    # 1001 UIDs / 500 per chunk = three ranged requests
    assert fake.bulk_fetch_calls == ["1:500", "501:1000", "1001:1001"]
    assert len(header_map) == 1001
    assert b"<m777@example.test>" in header_map["777"]


def test_fetch_headers_bulk_raises_on_chunk_failure() -> None:
    """If any chunk raises, the helper surfaces MailMessageError so the
    caller can record it in counters instead of silently degrading."""

    messages = {
        str(uid): make_email(f"<m{uid}@example.test>", []) for uid in range(1, 3)
    }
    client, fake = _fake_connection(messages)
    connection = _open(client)

    original_uid = fake.uid

    def selective_uid(command: str, *args: object) -> tuple[str, list[object]]:
        if command.upper() == "FETCH" and isinstance(args[0], str) and ":" in args[0]:
            raise MailMessageError("imap_fetch_failed")
        return original_uid(command, *args)

    fake.uid = selective_uid  # type: ignore[method-assign]
    with pytest.raises(MailMessageError):
        client.fetch_headers_bulk(connection, ["1", "2"])
