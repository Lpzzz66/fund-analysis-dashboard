"""Product master-data and subject-mapping maintenance routes."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.dependencies import AuthContext, get_db, require_roles
from app.auth.service import AuthService
from app.db.base import FundStatus, MappingStatus, UserRole
from app.db.models import Fund, FundAlias, ShareClass, SubjectMapping

router = APIRouter(prefix="/api/v1", tags=["catalog"])
DatabaseSession = Annotated[Session, Depends(get_db)]
CatalogOperator = Annotated[
    AuthContext, Depends(require_roles(UserRole.ADMIN, UserRole.OPERATOR))
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _required_text(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("must not be blank")
    return value


def _optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def _validate_date_range(
    valid_from: date | None, valid_to: date | None, resource: str
) -> None:
    if valid_from is not None and valid_to is not None and valid_from > valid_to:
        raise ValueError(f"{resource} valid_from must not be after valid_to")


def _normalized(value: str) -> str:
    return value.strip().casefold()


class AliasInput(StrictModel):
    alias: str = Field(min_length=1, max_length=255)
    source_location: str | None = Field(default=None, max_length=255)
    match_priority: int = Field(default=0, ge=0, le=1000)
    valid_from: date | None = None
    valid_to: date | None = None

    @model_validator(mode="before")
    @classmethod
    def trim_values(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        result = dict(value)
        if isinstance(result.get("alias"), str):
            result["alias"] = _required_text(result["alias"])
        if isinstance(result.get("source_location"), str):
            result["source_location"] = _optional_text(result["source_location"])
        return result

    @model_validator(mode="after")
    def validate_dates(self) -> AliasInput:
        _validate_date_range(self.valid_from, self.valid_to, "alias")
        return self


class FundCreate(StrictModel):
    standard_name: str = Field(min_length=1, max_length=255)
    product_code: str | None = Field(default=None, max_length=100)
    establishment_date: date | None = None
    strategy: str | None = Field(default=None, max_length=255)
    manager: str | None = Field(default=None, max_length=255)
    notes: str | None = None
    aliases: list[AliasInput] = Field(default_factory=list, max_length=100)

    @model_validator(mode="before")
    @classmethod
    def trim_values(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        result = dict(value)
        for field in ("standard_name", "product_code", "strategy", "manager", "notes"):
            if isinstance(result.get(field), str):
                result[field] = (
                    _required_text(result[field])
                    if field == "standard_name"
                    else _optional_text(result[field])
                )
        return result


class FundUpdate(StrictModel):
    standard_name: str | None = Field(default=None, min_length=1, max_length=255)
    product_code: str | None = Field(default=None, max_length=100)
    establishment_date: date | None = None
    strategy: str | None = Field(default=None, max_length=255)
    manager: str | None = Field(default=None, max_length=255)
    notes: str | None = None

    @model_validator(mode="before")
    @classmethod
    def trim_values(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        result = dict(value)
        for field in ("standard_name", "product_code", "strategy", "manager", "notes"):
            if isinstance(result.get(field), str):
                result[field] = (
                    _required_text(result[field])
                    if field == "standard_name"
                    else _optional_text(result[field])
                )
        return result


class AliasUpdate(StrictModel):
    alias: str | None = Field(default=None, min_length=1, max_length=255)
    source_location: str | None = Field(default=None, max_length=255)
    match_priority: int | None = Field(default=None, ge=0, le=1000)
    valid_from: date | None = None
    valid_to: date | None = None

    @model_validator(mode="before")
    @classmethod
    def trim_values(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        result = dict(value)
        if isinstance(result.get("alias"), str):
            result["alias"] = _required_text(result["alias"])
        if isinstance(result.get("source_location"), str):
            result["source_location"] = _optional_text(result["source_location"])
        return result

    @model_validator(mode="after")
    def validate_dates(self) -> AliasUpdate:
        _validate_date_range(self.valid_from, self.valid_to, "alias")
        return self


class ReasonRequest(StrictModel):
    reason: str = Field(min_length=1, max_length=2000)

    @model_validator(mode="before")
    @classmethod
    def trim_reason(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        result = dict(value)
        if isinstance(result.get("reason"), str):
            result["reason"] = _required_text(result["reason"])
        return result


class ShareClassCreate(StrictModel):
    share_code: str = Field(min_length=1, max_length=100)
    share_name: str = Field(min_length=1, max_length=255)
    enabled_from: date | None = None
    disabled_from: date | None = None
    notes: str | None = None

    @model_validator(mode="before")
    @classmethod
    def trim_values(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        result = dict(value)
        for field in ("share_code", "share_name"):
            if isinstance(result.get(field), str):
                result[field] = _required_text(result[field])
        if isinstance(result.get("notes"), str):
            result["notes"] = _optional_text(result["notes"])
        return result

    @model_validator(mode="after")
    def validate_dates(self) -> ShareClassCreate:
        _validate_date_range(self.enabled_from, self.disabled_from, "share class")
        return self


class ShareClassUpdate(StrictModel):
    share_code: str | None = Field(default=None, min_length=1, max_length=100)
    share_name: str | None = Field(default=None, min_length=1, max_length=255)
    enabled_from: date | None = None
    disabled_from: date | None = None
    notes: str | None = None

    @model_validator(mode="before")
    @classmethod
    def trim_values(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        result = dict(value)
        for field in ("share_code", "share_name"):
            if isinstance(result.get(field), str):
                result[field] = _required_text(result[field])
        if isinstance(result.get("notes"), str):
            result["notes"] = _optional_text(result["notes"])
        return result


class ShareClassDisableRequest(StrictModel):
    reason: str = Field(min_length=1, max_length=2000)
    disabled_from: date | None = None

    @model_validator(mode="before")
    @classmethod
    def trim_reason(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        result = dict(value)
        if isinstance(result.get("reason"), str):
            result["reason"] = _required_text(result["reason"])
        return result


class SubjectMappingCreate(StrictModel):
    subject_code_or_prefix: str | None = Field(default=None, max_length=100)
    raw_name_pattern: str | None = Field(default=None, max_length=255)
    standard_category: str = Field(min_length=1, max_length=100)
    is_leaf: bool = True
    include_in_holdings: bool = False
    valid_from: date | None = None
    valid_to: date | None = None
    rule_version: str = Field(min_length=1, max_length=50)
    status: MappingStatus = MappingStatus.ACTIVE

    @model_validator(mode="before")
    @classmethod
    def trim_values(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        result = dict(value)
        for field in (
            "subject_code_or_prefix",
            "raw_name_pattern",
            "standard_category",
            "rule_version",
        ):
            if isinstance(result.get(field), str):
                result[field] = _optional_text(result[field])
        return result

    @model_validator(mode="after")
    def validate_rule(self) -> SubjectMappingCreate:
        _validate_mapping_fields(
            self.subject_code_or_prefix,
            self.raw_name_pattern,
            self.valid_from,
            self.valid_to,
        )
        if not self.standard_category.strip() or not self.rule_version.strip():
            raise ValueError("standard_category and rule_version must not be blank")
        return self


class SubjectMappingUpdate(StrictModel):
    subject_code_or_prefix: str | None = Field(default=None, max_length=100)
    raw_name_pattern: str | None = Field(default=None, max_length=255)
    standard_category: str | None = Field(default=None, max_length=100)
    is_leaf: bool | None = None
    include_in_holdings: bool | None = None
    valid_from: date | None = None
    valid_to: date | None = None
    rule_version: str | None = Field(default=None, max_length=50)
    status: MappingStatus | None = None

    @model_validator(mode="before")
    @classmethod
    def trim_values(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        result = dict(value)
        for field in (
            "subject_code_or_prefix",
            "raw_name_pattern",
            "standard_category",
            "rule_version",
        ):
            if isinstance(result.get(field), str):
                result[field] = _optional_text(result[field])
        return result


class OptionalReasonRequest(StrictModel):
    reason: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="before")
    @classmethod
    def trim_reason(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        result = dict(value)
        if isinstance(result.get("reason"), str):
            result["reason"] = _optional_text(result["reason"])
        return result


def _validate_mapping_fields(
    code_or_prefix: str | None,
    raw_name_pattern: str | None,
    valid_from: date | None,
    valid_to: date | None,
) -> None:
    if not code_or_prefix and not raw_name_pattern:
        raise ValueError("subject_code_or_prefix or raw_name_pattern is required")
    _validate_date_range(valid_from, valid_to, "mapping")


def _validate_date_range_request(
    valid_from: date | None, valid_to: date | None, resource: str
) -> None:
    try:
        _validate_date_range(valid_from, valid_to, resource)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid date range") from exc


def _validate_mapping_request(
    code_or_prefix: str | None,
    raw_name_pattern: str | None,
    valid_from: date | None,
    valid_to: date | None,
) -> None:
    try:
        _validate_mapping_fields(code_or_prefix, raw_name_pattern, valid_from, valid_to)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid subject mapping") from exc


def _fund_data(fund: Fund) -> dict[str, object]:
    return {
        "id": fund.id,
        "standard_name": fund.standard_name,
        "product_code": fund.product_code,
        "establishment_date": fund.establishment_date,
        "strategy": fund.strategy,
        "manager": fund.manager,
        "status": fund.status,
        "notes": fund.notes,
    }


def _alias_data(alias: FundAlias) -> dict[str, object]:
    return {
        "id": alias.id,
        "fund_id": alias.fund_id,
        "alias": alias.alias,
        "source_location": alias.source_location,
        "match_priority": alias.match_priority,
        "valid_from": alias.valid_from,
        "valid_to": alias.valid_to,
    }


def _share_class_data(share_class: ShareClass) -> dict[str, object]:
    return {
        "id": share_class.id,
        "fund_id": share_class.fund_id,
        "share_code": share_class.share_code,
        "share_name": share_class.share_name,
        "status": "inactive" if share_class.disabled_from else "active",
        "enabled_from": share_class.enabled_from,
        "disabled_from": share_class.disabled_from,
        "notes": share_class.notes,
    }


def _mapping_data(mapping: SubjectMapping) -> dict[str, object]:
    return {
        "id": mapping.id,
        "subject_code_or_prefix": mapping.subject_code_or_prefix,
        "raw_name_pattern": mapping.raw_name_pattern,
        "standard_category": mapping.standard_category,
        "is_leaf": mapping.is_leaf,
        "include_in_holdings": mapping.include_in_holdings,
        "valid_from": mapping.valid_from,
        "valid_to": mapping.valid_to,
        "rule_version": mapping.rule_version,
        "status": mapping.status,
    }


def _fund_or_404(session: Session, fund_id: int) -> Fund:
    fund = session.get(Fund, fund_id)
    if fund is None:
        raise HTTPException(status_code=404, detail="Fund not found")
    return fund


def _alias_or_404(session: Session, fund_id: int, alias_id: int) -> FundAlias:
    alias = session.scalar(
        select(FundAlias).where(FundAlias.id == alias_id, FundAlias.fund_id == fund_id)
    )
    if alias is None:
        raise HTTPException(status_code=404, detail="Alias not found")
    return alias


def _share_class_or_404(
    session: Session, fund_id: int, share_class_id: int
) -> ShareClass:
    share_class = session.scalar(
        select(ShareClass).where(
            ShareClass.id == share_class_id, ShareClass.fund_id == fund_id
        )
    )
    if share_class is None:
        raise HTTPException(status_code=404, detail="Share class not found")
    return share_class


def _mapping_or_404(session: Session, mapping_id: int) -> SubjectMapping:
    mapping = session.get(SubjectMapping, mapping_id)
    if mapping is None:
        raise HTTPException(status_code=404, detail="Subject mapping not found")
    return mapping


def _commit(
    session: Session, detail: str = "Catalog data conflicts with an existing record"
) -> None:
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail=detail) from exc


def _flush(
    session: Session, detail: str = "Catalog data conflicts with an existing record"
) -> None:
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail=detail) from exc


def _assert_fund_name_available(
    session: Session, name: str, *, exclude_fund_id: int | None = None
) -> None:
    normalized_name = name.strip().casefold()
    funds = session.scalars(select(Fund)).all()
    if any(
        fund.id != exclude_fund_id
        and fund.standard_name.strip().casefold() == normalized_name
        for fund in funds
    ):
        raise HTTPException(status_code=409, detail="Fund name already exists")
    if any(
        alias.alias.strip().casefold() == normalized_name
        for alias in session.scalars(select(FundAlias))
    ):
        raise HTTPException(status_code=409, detail="Fund name conflicts with an alias")


def _assert_product_code_available(
    session: Session, product_code: str | None, *, exclude_fund_id: int | None = None
) -> None:
    if product_code is None:
        return
    normalized_code = product_code.strip().casefold()
    if any(
        fund.id != exclude_fund_id
        and fund.product_code is not None
        and fund.product_code.strip().casefold() == normalized_code
        for fund in session.scalars(select(Fund))
    ):
        raise HTTPException(status_code=409, detail="Product code already exists")


def _assert_alias_available(
    session: Session,
    alias: str,
    fund_id: int,
    *,
    exclude_alias_id: int | None = None,
) -> None:
    normalized_alias = alias.strip().casefold()
    fund = session.get(Fund, fund_id)
    if fund is not None and fund.standard_name.strip().casefold() == normalized_alias:
        raise HTTPException(status_code=409, detail="Alias must differ from fund name")
    if any(
        item.id != fund_id and item.standard_name.strip().casefold() == normalized_alias
        for item in session.scalars(select(Fund))
    ):
        raise HTTPException(status_code=409, detail="Alias conflicts with a fund name")
    if any(
        item.id != exclude_alias_id
        and item.alias.strip().casefold() == normalized_alias
        for item in session.scalars(select(FundAlias))
    ):
        raise HTTPException(status_code=409, detail="Alias already exists")


def _assert_share_code_available(
    session: Session,
    fund_id: int,
    share_code: str,
    *,
    exclude_share_class_id: int | None = None,
) -> None:
    normalized_code = share_code.strip().casefold()
    if any(
        item.id != exclude_share_class_id
        and item.share_code.strip().casefold() == normalized_code
        for item in session.scalars(
            select(ShareClass).where(ShareClass.fund_id == fund_id)
        )
    ):
        raise HTTPException(status_code=409, detail="Share code already exists")


def _audit(
    session: Session,
    context: AuthContext,
    *,
    action: str,
    resource_type: str,
    resource_id: int,
    reason: str | None = None,
    summary: dict[str, object] | None = None,
) -> None:
    AuthService(session).record_audit(
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id),
        actor_user_id=context.user.id,
        reason=reason,
        summary=summary,
    )


@router.post("/funds", status_code=status.HTTP_201_CREATED)
def create_fund(
    payload: FundCreate, context: CatalogOperator, session: DatabaseSession
) -> dict[str, object]:
    _assert_fund_name_available(session, payload.standard_name)
    _assert_product_code_available(session, payload.product_code)
    aliases_seen: set[str] = set()
    for item in payload.aliases:
        normalized_alias = item.alias.strip().casefold()
        if normalized_alias in aliases_seen:
            raise HTTPException(status_code=409, detail="Alias already exists")
        aliases_seen.add(normalized_alias)
        if normalized_alias == payload.standard_name.strip().casefold():
            raise HTTPException(
                status_code=409, detail="Alias must differ from fund name"
            )
        _assert_alias_available(session, item.alias, 0)

    fund = Fund(
        standard_name=payload.standard_name,
        product_code=payload.product_code,
        establishment_date=payload.establishment_date,
        strategy=payload.strategy,
        manager=payload.manager,
        notes=payload.notes,
        status=FundStatus.ACTIVE,
    )
    session.add(fund)
    _flush(session, "Fund name or product code already exists")
    for item in payload.aliases:
        session.add(
            FundAlias(
                fund_id=fund.id,
                alias=item.alias,
                source_location=item.source_location,
                match_priority=item.match_priority,
                valid_from=item.valid_from,
                valid_to=item.valid_to,
            )
        )
    _flush(session, "Alias already exists")
    for alias in session.scalars(
        select(FundAlias).where(FundAlias.fund_id == fund.id)
    ).all():
        _audit(
            session,
            context,
            action="fund_alias.create",
            resource_type="fund_alias",
            resource_id=alias.id,
        )
    _audit(
        session,
        context,
        action="fund.create",
        resource_type="fund",
        resource_id=fund.id,
    )
    _commit(session, "Fund name or product code already exists")
    return {"data": _fund_data(fund)}


@router.patch("/funds/{fund_id}")
def update_fund(
    fund_id: int,
    payload: FundUpdate,
    context: CatalogOperator,
    session: DatabaseSession,
) -> dict[str, object]:
    fund = _fund_or_404(session, fund_id)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise HTTPException(status_code=400, detail="No fields to update")
    if values.get("standard_name") is None and "standard_name" in values:
        raise HTTPException(status_code=422, detail="standard_name cannot be cleared")
    if "standard_name" in values:
        _assert_fund_name_available(
            session, values["standard_name"], exclude_fund_id=fund.id
        )
    if "product_code" in values:
        _assert_product_code_available(
            session, values["product_code"], exclude_fund_id=fund.id
        )
    for field, value in values.items():
        setattr(fund, field, value)
    _audit(
        session,
        context,
        action="fund.update",
        resource_type="fund",
        resource_id=fund.id,
        summary={"fields": sorted(values)},
    )
    _commit(session, "Fund name or product code already exists")
    return {"data": _fund_data(fund)}


@router.post("/funds/{fund_id}/enable")
def enable_fund(
    fund_id: int, context: CatalogOperator, session: DatabaseSession
) -> dict[str, object]:
    fund = _fund_or_404(session, fund_id)
    fund.status = FundStatus.ACTIVE
    _audit(
        session,
        context,
        action="fund.enable",
        resource_type="fund",
        resource_id=fund.id,
    )
    _commit(session)
    return {"data": _fund_data(fund)}


@router.post("/funds/{fund_id}/disable")
def disable_fund(
    fund_id: int,
    payload: ReasonRequest,
    context: CatalogOperator,
    session: DatabaseSession,
) -> dict[str, object]:
    fund = _fund_or_404(session, fund_id)
    fund.status = FundStatus.INACTIVE
    _audit(
        session,
        context,
        action="fund.disable",
        resource_type="fund",
        resource_id=fund.id,
        reason=payload.reason,
    )
    _commit(session)
    return {"data": _fund_data(fund)}


@router.get("/funds/{fund_id}/aliases")
def list_aliases(
    fund_id: int, _: CatalogOperator, session: DatabaseSession
) -> dict[str, object]:
    _fund_or_404(session, fund_id)
    aliases = session.scalars(
        select(FundAlias)
        .where(FundAlias.fund_id == fund_id)
        .order_by(FundAlias.match_priority.desc(), FundAlias.id)
    ).all()
    return {
        "data": [_alias_data(item) for item in aliases],
        "meta": {"total": len(aliases)},
    }


@router.post("/funds/{fund_id}/aliases", status_code=status.HTTP_201_CREATED)
def create_alias(
    fund_id: int,
    payload: AliasInput,
    context: CatalogOperator,
    session: DatabaseSession,
) -> dict[str, object]:
    _fund_or_404(session, fund_id)
    _assert_alias_available(session, payload.alias, fund_id)
    alias = FundAlias(
        fund_id=fund_id,
        alias=payload.alias,
        source_location=payload.source_location,
        match_priority=payload.match_priority,
        valid_from=payload.valid_from,
        valid_to=payload.valid_to,
    )
    session.add(alias)
    _flush(session, "Alias already exists")
    _audit(
        session,
        context,
        action="fund_alias.create",
        resource_type="fund_alias",
        resource_id=alias.id,
    )
    _commit(session, "Alias already exists")
    return {"data": _alias_data(alias)}


@router.patch("/funds/{fund_id}/aliases/{alias_id}")
def update_alias(
    fund_id: int,
    alias_id: int,
    payload: AliasUpdate,
    context: CatalogOperator,
    session: DatabaseSession,
) -> dict[str, object]:
    alias = _alias_or_404(session, fund_id, alias_id)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "alias" in values:
        _assert_alias_available(
            session, values["alias"], fund_id, exclude_alias_id=alias.id
        )
    next_from = values.get("valid_from", alias.valid_from)
    next_to = values.get("valid_to", alias.valid_to)
    _validate_date_range_request(next_from, next_to, "alias")
    for field, value in values.items():
        setattr(alias, field, value)
    _audit(
        session,
        context,
        action="fund_alias.update",
        resource_type="fund_alias",
        resource_id=alias.id,
        summary={"fields": sorted(values)},
    )
    _commit(session, "Alias already exists")
    return {"data": _alias_data(alias)}


@router.delete("/funds/{fund_id}/aliases/{alias_id}")
def delete_alias(
    fund_id: int,
    alias_id: int,
    context: CatalogOperator,
    session: DatabaseSession,
) -> dict[str, object]:
    alias = _alias_or_404(session, fund_id, alias_id)
    resource_id = alias.id
    session.delete(alias)
    _audit(
        session,
        context,
        action="fund_alias.delete",
        resource_type="fund_alias",
        resource_id=resource_id,
    )
    _commit(session)
    return {"data": {"id": resource_id, "deleted": True}}


@router.get("/funds/{fund_id}/share-classes")
def list_share_classes(
    fund_id: int,
    _: CatalogOperator,
    session: DatabaseSession,
    share_status: Literal["active", "inactive"] | None = Query(
        default=None, alias="status"
    ),
) -> dict[str, object]:
    _fund_or_404(session, fund_id)
    classes = session.scalars(
        select(ShareClass)
        .where(ShareClass.fund_id == fund_id)
        .order_by(ShareClass.share_code, ShareClass.id)
    ).all()
    if share_status is not None:
        classes = [
            item
            for item in classes
            if ("inactive" if item.disabled_from else "active") == share_status
        ]
    return {
        "data": [_share_class_data(item) for item in classes],
        "meta": {"total": len(classes)},
    }


@router.post("/funds/{fund_id}/share-classes", status_code=status.HTTP_201_CREATED)
def create_share_class(
    fund_id: int,
    payload: ShareClassCreate,
    context: CatalogOperator,
    session: DatabaseSession,
) -> dict[str, object]:
    _fund_or_404(session, fund_id)
    _assert_share_code_available(session, fund_id, payload.share_code)
    share_class = ShareClass(
        fund_id=fund_id,
        share_code=payload.share_code,
        share_name=payload.share_name,
        enabled_from=payload.enabled_from,
        disabled_from=payload.disabled_from,
        notes=payload.notes,
    )
    session.add(share_class)
    _flush(session, "Share code already exists")
    _audit(
        session,
        context,
        action="share_class.create",
        resource_type="share_class",
        resource_id=share_class.id,
    )
    _commit(session, "Share code already exists")
    return {"data": _share_class_data(share_class)}


@router.patch("/funds/{fund_id}/share-classes/{share_class_id}")
def update_share_class(
    fund_id: int,
    share_class_id: int,
    payload: ShareClassUpdate,
    context: CatalogOperator,
    session: DatabaseSession,
) -> dict[str, object]:
    share_class = _share_class_or_404(session, fund_id, share_class_id)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise HTTPException(status_code=400, detail="No fields to update")
    next_from = values.get("enabled_from", share_class.enabled_from)
    next_to = values.get("disabled_from", share_class.disabled_from)
    _validate_date_range_request(next_from, next_to, "share class")
    if "share_code" in values:
        _assert_share_code_available(
            session,
            fund_id,
            values["share_code"],
            exclude_share_class_id=share_class.id,
        )
    for field, value in values.items():
        setattr(share_class, field, value)
    _audit(
        session,
        context,
        action="share_class.update",
        resource_type="share_class",
        resource_id=share_class.id,
        summary={"fields": sorted(values)},
    )
    _commit(session, "Share code already exists")
    return {"data": _share_class_data(share_class)}


@router.post("/funds/{fund_id}/share-classes/{share_class_id}/disable")
def disable_share_class(
    fund_id: int,
    share_class_id: int,
    payload: ShareClassDisableRequest,
    context: CatalogOperator,
    session: DatabaseSession,
) -> dict[str, object]:
    share_class = _share_class_or_404(session, fund_id, share_class_id)
    share_class.disabled_from = payload.disabled_from or datetime.now(UTC).date()
    _validate_date_range_request(
        share_class.enabled_from, share_class.disabled_from, "share class"
    )
    _audit(
        session,
        context,
        action="share_class.disable",
        resource_type="share_class",
        resource_id=share_class.id,
        reason=payload.reason,
    )
    _commit(session)
    return {"data": _share_class_data(share_class)}


@router.post("/funds/{fund_id}/share-classes/{share_class_id}/enable")
def enable_share_class(
    fund_id: int,
    share_class_id: int,
    context: CatalogOperator,
    session: DatabaseSession,
) -> dict[str, object]:
    share_class = _share_class_or_404(session, fund_id, share_class_id)
    share_class.disabled_from = None
    _audit(
        session,
        context,
        action="share_class.enable",
        resource_type="share_class",
        resource_id=share_class.id,
    )
    _commit(session)
    return {"data": _share_class_data(share_class)}


@router.get("/subjects/mappings")
def list_subject_mappings(
    _: CatalogOperator,
    session: DatabaseSession,
    mapping_status: MappingStatus | None = Query(default=None, alias="status"),  # noqa: B008
    category: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict[str, object]:
    statement = select(SubjectMapping).order_by(SubjectMapping.id)
    if mapping_status is not None:
        statement = statement.where(SubjectMapping.status == mapping_status)
    if category:
        statement = statement.where(
            SubjectMapping.standard_category == category.strip()
        )
    mappings = session.scalars(statement).all()
    total = len(mappings)
    offset = (page - 1) * page_size
    return {
        "data": [_mapping_data(item) for item in mappings[offset : offset + page_size]],
        "meta": {"page": page, "page_size": page_size, "total": total},
    }


@router.post("/subjects/mappings", status_code=status.HTTP_201_CREATED)
def create_subject_mapping(
    payload: SubjectMappingCreate,
    context: CatalogOperator,
    session: DatabaseSession,
) -> dict[str, object]:
    mapping = SubjectMapping(
        subject_code_or_prefix=payload.subject_code_or_prefix,
        raw_name_pattern=payload.raw_name_pattern,
        standard_category=payload.standard_category,
        is_leaf=payload.is_leaf,
        include_in_holdings=payload.include_in_holdings,
        valid_from=payload.valid_from,
        valid_to=payload.valid_to,
        rule_version=payload.rule_version,
        status=payload.status,
    )
    session.add(mapping)
    _flush(session)
    _audit(
        session,
        context,
        action="subject_mapping.create",
        resource_type="subject_mapping",
        resource_id=mapping.id,
    )
    _commit(session)
    return {"data": _mapping_data(mapping)}


@router.patch("/subjects/mappings/{mapping_id}")
def update_subject_mapping(
    mapping_id: int,
    payload: SubjectMappingUpdate,
    context: CatalogOperator,
    session: DatabaseSession,
) -> dict[str, object]:
    mapping = _mapping_or_404(session, mapping_id)
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise HTTPException(status_code=400, detail="No fields to update")
    _validate_mapping_request(
        values.get("subject_code_or_prefix", mapping.subject_code_or_prefix),
        values.get("raw_name_pattern", mapping.raw_name_pattern),
        values.get("valid_from", mapping.valid_from),
        values.get("valid_to", mapping.valid_to),
    )
    if "standard_category" in values and not values["standard_category"]:
        raise HTTPException(
            status_code=422, detail="standard_category must not be blank"
        )
    if "rule_version" in values and not values["rule_version"]:
        raise HTTPException(status_code=422, detail="rule_version must not be blank")
    for field, value in values.items():
        setattr(mapping, field, value)
    _audit(
        session,
        context,
        action="subject_mapping.update",
        resource_type="subject_mapping",
        resource_id=mapping.id,
        summary={"fields": sorted(values)},
    )
    _commit(session)
    return {"data": _mapping_data(mapping)}


@router.post("/subjects/mappings/{mapping_id}/disable")
def disable_subject_mapping(
    mapping_id: int,
    context: CatalogOperator,
    session: DatabaseSession,
    payload: OptionalReasonRequest | None = None,
) -> dict[str, object]:
    mapping = _mapping_or_404(session, mapping_id)
    mapping.status = MappingStatus.INACTIVE
    _audit(
        session,
        context,
        action="subject_mapping.disable",
        resource_type="subject_mapping",
        resource_id=mapping.id,
        reason=payload.reason if payload else None,
    )
    _commit(session)
    return {"data": _mapping_data(mapping)}
