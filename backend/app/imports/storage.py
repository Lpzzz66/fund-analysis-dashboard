"""Safe temporary upload handling and immutable source-file storage."""

from __future__ import annotations

import hashlib
import os
import secrets
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO
from zipfile import BadZipFile, ZipFile

ALLOWED_EXTENSIONS = {".xls", ".xlsx"}
OLE_HEADER = bytes.fromhex("D0CF11E0A1B11AE1")
ZIP_HEADER = b"PK\x03\x04"
XLSX_REQUIRED_MEMBERS = {"[Content_Types].xml", "xl/workbook.xml"}


class UnsafeStoragePathError(ValueError):
    """Raised when a candidate path escapes its configured root."""


class InvalidFileError(ValueError):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


class FileTooLargeError(InvalidFileError):
    def __init__(self) -> None:
        super().__init__("file_too_large")


@dataclass(frozen=True, slots=True)
class StagedUpload:
    path: Path
    original_filename: str
    extension: str
    file_hash: str
    file_size: int


def resolve_in_root(root: Path, relative_name: str) -> Path:
    """Resolve a relative object name and reject path traversal."""

    resolved_root = root.resolve()
    candidate = (resolved_root / relative_name).resolve()
    if not candidate.is_relative_to(resolved_root):
        raise UnsafeStoragePathError(relative_name)
    return candidate


def stage_upload(
    stream: BinaryIO,
    original_filename: str,
    temp_root: Path,
    max_file_size: int,
) -> StagedUpload:
    """Write one request stream to a temporary file, hash it, and validate format."""

    extension = Path(original_filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise InvalidFileError("unsupported_extension")

    temp_root.mkdir(parents=True, exist_ok=True)
    descriptor, raw_path = tempfile.mkstemp(
        prefix="upload-", suffix=".tmp", dir=temp_root
    )
    temp_path = Path(raw_path)
    digest = hashlib.sha256()
    file_size = 0

    try:
        with os.fdopen(descriptor, "wb") as destination:
            while chunk := stream.read(1024 * 1024):
                file_size += len(chunk)
                if file_size > max_file_size:
                    raise FileTooLargeError
                digest.update(chunk)
                destination.write(chunk)
        _validate_file_signature(temp_path, extension)
    except Exception:
        _remove_temp_file(temp_path, temp_root)
        raise

    return StagedUpload(
        path=temp_path,
        original_filename=Path(original_filename).name,
        extension=extension,
        file_hash=digest.hexdigest(),
        file_size=file_size,
    )


def store_staged_upload(staged: StagedUpload, storage_root: Path) -> tuple[str, Path]:
    """Move a validated temporary file to a random immutable object name."""

    storage_root.mkdir(parents=True, exist_ok=True)
    for _ in range(10):
        object_name = f"{secrets.token_hex(24)}{staged.extension}"
        destination = resolve_in_root(storage_root, object_name)
        if not destination.exists():
            staged.path.replace(destination)
            return object_name, destination
    raise RuntimeError("Could not allocate a unique source-file object name")


def discard_staged_upload(staged: StagedUpload, temp_root: Path) -> None:
    _remove_temp_file(staged.path, temp_root)


def remove_stored_object(path: Path, storage_root: Path) -> None:
    safe_path = resolve_in_root(storage_root, path.name)
    if safe_path == path.resolve() and safe_path.exists():
        safe_path.unlink()


def _validate_file_signature(path: Path, extension: str) -> None:
    with path.open("rb") as source:
        header = source.read(8)

    if extension == ".xls":
        if header != OLE_HEADER:
            raise InvalidFileError("invalid_file_signature")
        return

    if not header.startswith(ZIP_HEADER):
        raise InvalidFileError("invalid_file_signature")
    try:
        with ZipFile(path) as archive:
            if not XLSX_REQUIRED_MEMBERS.issubset(archive.namelist()):
                raise InvalidFileError("invalid_file_signature")
            if archive.testzip() is not None:
                raise InvalidFileError("invalid_file_signature")
    except BadZipFile as exc:
        raise InvalidFileError("invalid_file_signature") from exc


def _remove_temp_file(path: Path, temp_root: Path) -> None:
    safe_path = resolve_in_root(temp_root, path.name)
    if safe_path == path.resolve() and safe_path.exists():
        safe_path.unlink()
