"""Build a migration inventory from the existing valuation inventory tool.

This module deliberately does not parse workbooks or persist valuation data. It
loads the existing scanner and deduplication modules, then turns their result
into migration actions for the official import service.
"""

from __future__ import annotations

import importlib
import sys
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

ACTION_IMPORT = "import"
ACTION_IMPORT_GZ_ONLY = "import_gz_only"
ACTION_SKIP_DUPLICATE = "skip_duplicate"
ACTION_SKIP_NON_VALUATION = "skip_non_valuation"
ACTION_NEEDS_REVIEW = "needs_review"
UPLOAD_ACTIONS = frozenset({ACTION_IMPORT, ACTION_IMPORT_GZ_ONLY})

CLASS_SAME_CONTENT = "same_content_duplicate"
CLASS_SAME_DATE_CONFLICT = "same_date_conflict"


@dataclass(frozen=True, slots=True)
class MigrationCandidate:
    """One relative source file and the action assigned by the inventory rules."""

    rel_path: str
    product: str | None
    valuation_date: date | None
    sha256: str | None
    size_bytes: int
    source_zone: str
    file_type: str
    is_valuation: bool
    action: str
    duplicate_of: str | None = None
    note: str = ""
    error_message: str = ""

    def static_dict(self) -> dict[str, Any]:
        """Return fields that identify an inventory entry, excluding run state."""

        return {
            "rel_path": self.rel_path,
            "product": self.product,
            "valuation_date": (
                self.valuation_date.isoformat() if self.valuation_date else None
            ),
            "sha256": self.sha256,
            "size_bytes": self.size_bytes,
            "source_zone": self.source_zone,
            "file_type": self.file_type,
            "is_valuation": self.is_valuation,
            "action": self.action,
            "duplicate_of": self.duplicate_of,
            "note": self.note,
            "error_message": self.error_message,
        }


@dataclass(frozen=True, slots=True)
class InventorySnapshot:
    """The scanner output and its existing deduplication result."""

    root_name: str
    files: tuple[Any, ...]
    dedup_result: Any


ScanFunction = Callable[[Path, int], Any]
DedupFunction = Callable[[list[Any]], Any]


def build_inventory(
    root: Path,
    *,
    workers: int = 1,
    scan_fn: ScanFunction | None = None,
    dedup_fn: DedupFunction | None = None,
) -> InventorySnapshot:
    """Scan a source directory with the existing inventory implementation."""

    source_root = root.resolve()
    if not source_root.is_dir():
        raise ValueError("source root does not exist or is not a directory")
    if workers < 1:
        raise ValueError("workers must be at least 1")

    scanner_result = (scan_fn or _scan_with_existing_tool)(source_root, workers)
    files = tuple(sorted(getattr(scanner_result, "files", ()), key=_rel_path))
    dedup_result = (dedup_fn or _dedup_with_existing_tool)(list(files))
    return InventorySnapshot(
        root_name=source_root.name,
        files=files,
        dedup_result=dedup_result,
    )


def classify_candidates(
    files: list[Any] | tuple[Any, ...], dedup_result: Any
) -> tuple[MigrationCandidate, ...]:
    """Apply the existing product/date/hash and primary-first migration rules."""

    by_rel = {_rel_path(info): info for info in files}
    candidates: dict[str, MigrationCandidate] = {}
    grouped_rels: set[str] = set()

    for dedup_group in sorted(
        getattr(dedup_result, "groups", ()), key=_dedup_group_sort_key
    ):
        member_rels = sorted(
            member.rel_path
            for member in getattr(dedup_group, "members", ())
            if member.rel_path in by_rel
        )
        grouped_rels.update(member_rels)
        classification = getattr(dedup_group, "classification", "")
        if classification == CLASS_SAME_DATE_CONFLICT:
            note = "same_date_conflict: " + ";".join(member_rels)
            for rel_path in member_rels:
                candidates[rel_path] = _candidate(
                    by_rel[rel_path], ACTION_NEEDS_REVIEW, note=note
                )
            continue

        if classification == CLASS_SAME_CONTENT:
            keep = getattr(dedup_group, "keep", None)
            for rel_path in member_rels:
                if rel_path == keep:
                    info = by_rel[rel_path]
                    zone = _enum_value(getattr(info, "zone", "other"))
                    action = (
                        ACTION_IMPORT if zone == "primary" else ACTION_IMPORT_GZ_ONLY
                    )
                    candidates[rel_path] = _candidate(
                        info,
                        action,
                        note="duplicate group keep (primary-first)",
                    )
                else:
                    candidates[rel_path] = _candidate(
                        by_rel[rel_path],
                        ACTION_SKIP_DUPLICATE,
                        duplicate_of=keep,
                    )
            continue

        for rel_path in member_rels:
            candidates[rel_path] = _candidate(
                by_rel[rel_path],
                ACTION_NEEDS_REVIEW,
                note="unknown dedup classification",
            )

    for info in files:
        rel_path = _rel_path(info)
        if rel_path in grouped_rels:
            continue
        if not getattr(info, "is_valuation", False):
            file_type = _enum_value(getattr(info, "file_type", "unknown"))
            candidates[rel_path] = _candidate(
                info,
                ACTION_SKIP_NON_VALUATION,
                note=f"not a valuation file: {file_type}",
            )
            continue
        if getattr(info, "identity_conflict", False):
            candidates[rel_path] = _candidate(
                info, ACTION_NEEDS_REVIEW, note="identity_conflict"
            )
            continue
        if not getattr(info, "product", None):
            candidates[rel_path] = _candidate(
                info, ACTION_NEEDS_REVIEW, note="no_product"
            )
            continue
        if not getattr(info, "valuation_date", None):
            candidates[rel_path] = _candidate(info, ACTION_NEEDS_REVIEW, note="no_date")
            continue
        if not getattr(info, "sha256", None):
            candidates[rel_path] = _candidate(info, ACTION_NEEDS_REVIEW, note="no_hash")
            continue

        zone = _enum_value(getattr(info, "zone", "other"))
        if zone == "primary":
            action = ACTION_IMPORT
            note = "primary source"
        elif zone == "gz":
            action = ACTION_IMPORT_GZ_ONLY
            note = "gz only date"
        else:
            action = ACTION_NEEDS_REVIEW
            note = f"unexpected zone: {zone}"
        candidates[rel_path] = _candidate(info, action, note=note)

    return tuple(sorted(candidates.values(), key=_candidate_sort_key))


def _candidate(
    info: Any,
    action: str,
    *,
    duplicate_of: str | None = None,
    note: str = "",
) -> MigrationCandidate:
    valuation_date = getattr(info, "valuation_date", None)
    return MigrationCandidate(
        rel_path=_rel_path(info),
        product=getattr(info, "product", None),
        valuation_date=valuation_date,
        sha256=getattr(info, "sha256", None),
        size_bytes=getattr(info, "size_bytes", -1),
        source_zone=_enum_value(getattr(info, "zone", "other")),
        file_type=_enum_value(getattr(info, "file_type", "unknown")),
        is_valuation=bool(getattr(info, "is_valuation", False)),
        action=action,
        duplicate_of=duplicate_of,
        note=note,
        error_message=getattr(info, "error_message", "") or "",
    )


def _candidate_sort_key(candidate: MigrationCandidate) -> tuple[str, str, int, str]:
    zone_rank = {"primary": 0, "gz": 1}.get(candidate.source_zone, 2)
    return (
        candidate.product or "",
        candidate.valuation_date.isoformat() if candidate.valuation_date else "",
        zone_rank,
        candidate.rel_path,
    )


def _dedup_group_sort_key(group: Any) -> tuple[str, str, str]:
    members = sorted(member.rel_path for member in getattr(group, "members", ()))
    return (
        getattr(group, "product", "") or "",
        getattr(group, "valuation_date", date.min).isoformat(),
        members[0] if members else "",
    )


def _rel_path(info: Any) -> str:
    return str(info.rel_path)


def _enum_value(value: Any) -> str:
    return str(getattr(value, "value", value))


def _scan_with_existing_tool(root: Path, workers: int) -> Any:
    scanner, _ = _load_existing_inventory_modules()
    options = scanner.ScanOptions(
        parse_xls=True,
        parse_xlsx=True,
        workers=workers,
    )
    return scanner.scan(root, options)


def _dedup_with_existing_tool(files: list[Any]) -> Any:
    _, dedup = _load_existing_inventory_modules()
    return dedup.analyze(files)


def _load_existing_inventory_modules() -> tuple[Any, Any]:
    """Load the repository inventory package even when the CLI runs from backend/."""

    try:
        scanner = importlib.import_module("tools.valuation_inventory.scanner")
        dedup = importlib.import_module("tools.valuation_inventory.dedup")
        return scanner, dedup
    except ModuleNotFoundError as exc:
        if exc.name not in {"tools", "tools.valuation_inventory"}:
            raise

    project_root = Path(__file__).resolve().parents[3]
    project_root_text = str(project_root)
    sys.path.insert(0, project_root_text)
    try:
        scanner = importlib.import_module("tools.valuation_inventory.scanner")
        dedup = importlib.import_module("tools.valuation_inventory.dedup")
        return scanner, dedup
    finally:
        if sys.path and sys.path[0] == project_root_text:
            sys.path.pop(0)
