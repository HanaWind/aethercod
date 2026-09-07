from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass(slots=True)
class EntityType:
    id: str
    name: str
    icon: str = "✦"
    is_builtin: bool = True


@dataclass(slots=True)
class CustomFieldDefinition:
    id: str
    type_id: str
    name: str
    field_type: str = "text"
    required: bool = False


@dataclass(slots=True)
class Entity:
    id: str
    type_id: str
    name: str
    summary: str = ""
    notes: str = ""
    color: str = "#7c3aed"
    remarks: str = ""
    created_at: str = ""
    updated_at: str = ""
    deleted_at: str | None = None
    aliases: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    custom_fields: dict[str, Any] = field(default_factory=dict)
    dates: list[dict[str, Any]] = field(default_factory=list)


@dataclass(slots=True)
class Relation:
    id: str
    source_id: str
    target_id: str
    label: str
    reverse_label: str = ""
    notes: str = ""
    created_at: str = ""


@dataclass(slots=True)
class TimelineDate:
    id: str
    entity_id: str
    date_kind: str
    label: str = ""
    year: int | None = None
    date_value: str | None = None


@dataclass(slots=True)
class ValidationIssue:
    kind: str
    message: str
    entity_id: str | None = None
    relation_id: str | None = None
    token: str | None = None
