"""Authenticated raw file intake and import batch routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import AuthContext, get_db, require_roles
from app.db.base import SourceType, UserRole
from app.db.models import BackgroundJob, ImportBatch, ImportBatchFile
from app.imports.service import ImportService

router = APIRouter(prefix="/api/v1/imports", tags=["imports"])

DatabaseSession = Annotated[Session, Depends(get_db)]
ImportOperator = Annotated[
    AuthContext, Depends(require_roles(UserRole.ADMIN, UserRole.OPERATOR))
]


class CreateBatchRequest(BaseModel):
    source_type: SourceType = SourceType.UPLOAD


def _service(request: Request, session: Session) -> ImportService:
    return ImportService.from_settings(session, request.app.state.settings)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_batch(
    payload: CreateBatchRequest,
    request: Request,
    context: ImportOperator,
    session: DatabaseSession,
) -> dict[str, object]:
    batch = _service(request, session).create_batch(
        payload.source_type, context.user.id
    )
    session.commit()
    return {"data": _batch_data(batch)}


@router.post("/{batch_id}/files", status_code=status.HTTP_201_CREATED)
def upload_file(
    batch_id: int,
    request: Request,
    context: ImportOperator,
    session: DatabaseSession,
    file: UploadFile = File(...),  # noqa: B008
) -> dict[str, object]:
    service = _service(request, session)
    try:
        result = service.receive_upload(
            batch_id,
            file.filename or "upload",
            file.file,
            context.user.id,
        )
        session.commit()
    except ImportService.FileTooLarge as exc:
        session.commit()
        raise HTTPException(status_code=413, detail=exc.code) from exc
    except ImportService.InvalidFile as exc:
        session.commit()
        raise HTTPException(status_code=400, detail=exc.code) from exc
    except LookupError as exc:
        session.rollback()
        raise HTTPException(status_code=404, detail="Import batch not found") from exc
    except ValueError as exc:
        session.commit()
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    return {
        "data": {
            "id": result.source_file.id,
            "original_filename": result.source_file.original_filename,
            "file_hash": result.source_file.file_hash,
            "file_size": result.source_file.file_size,
            "duplicate": result.duplicate,
        }
    }


@router.post("/{batch_id}/complete")
def complete_batch(
    batch_id: int,
    request: Request,
    context: ImportOperator,
    session: DatabaseSession,
) -> dict[str, object]:
    try:
        batch, job = _service(request, session).complete_batch(
            batch_id, context.user.id
        )
        session.commit()
    except LookupError as exc:
        session.rollback()
        raise HTTPException(status_code=404, detail="Import batch not found") from exc
    except ValueError as exc:
        session.commit()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"data": {**_batch_data(batch), "job": _job_data(job)}}


@router.get("/{batch_id}")
def get_batch(
    batch_id: int,
    request: Request,
    _: ImportOperator,
    session: DatabaseSession,
) -> dict[str, object]:
    service = _service(request, session)
    try:
        batch = service.get_batch(batch_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail="Import batch not found") from exc
    links = session.scalars(
        select(ImportBatchFile).where(ImportBatchFile.batch_id == batch.id)
    ).all()
    job = session.scalar(
        select(BackgroundJob).where(
            BackgroundJob.job_type == "process_import_batch",
            BackgroundJob.resource_id == str(batch.id),
        )
    )
    return {
        "data": {
            **_batch_data(batch),
            "files": [
                {
                    "id": link.source_file.id,
                    "original_filename": link.source_file.original_filename,
                    "file_hash": link.source_file.file_hash,
                    "duplicate": link.duplicate,
                }
                for link in links
            ],
            "job": _job_data(job) if job else None,
        }
    }


def _batch_data(batch: ImportBatch) -> dict[str, object]:
    return {
        "id": batch.id,
        "source_type": batch.source_type,
        "file_count": batch.file_count,
        "status": batch.status,
        "created_at": batch.created_at,
    }


def _job_data(job: BackgroundJob) -> dict[str, object]:
    return {
        "id": job.id,
        "type": job.job_type,
        "status": job.status,
        "attempts": job.attempts,
        "max_attempts": job.max_attempts,
    }
