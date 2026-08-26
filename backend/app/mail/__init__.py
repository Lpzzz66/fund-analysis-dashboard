"""IMAP-backed mail ingestion for valuation attachments."""

from .client import ImapClient, MailConnectionError, MailMessageError
from .config import MailConfigurationError, MailSettings
from .service import MailService, MailSyncResult

__all__ = [
    "ImapClient",
    "MailConfigurationError",
    "MailConnectionError",
    "MailMessageError",
    "MailService",
    "MailSettings",
    "MailSyncResult",
]
