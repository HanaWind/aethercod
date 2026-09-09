from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import re
from typing import Any
import uuid

# UUIDs are persisted as lowercase canonical strings.  Existing v1 hex IDs are
# accepted and normalized to the same 32-character representation, so old
# projects and references remain addressable.
_UUID_RE = re.compile(r"^[0-9a-f]{32}$")
_DATE_PRECISIONS = {"year", "month", "day", "exact", "range"}
_BUILTIN_TYPE_IDS = {
    "person",
    "polity",
    "place",
    "organization",
    "branch",
    "event",
    "item",
    "species",
    "concept",
}
_DATE_NAMESPACE = uuid.UUID("5bcf2ba8-59e5-4a3e-a27a-42d7f78ddf10")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_uuid() -> str:
    """Return a new normalized UUID for persisted identifiers."""
    return uuid.uuid4().hex


def normalize_uuid(value: str | uuid.UUID, *, allow_empty: bool = False) -> str:
    """Normalize canonical, hyphenated, or legacy 32-character UUIDs.

    ``ValueError`` is raised for malformed IDs instead of allowing an invalid
    reference to enter the database.  ``allow_empty`` is useful for optional
    import metadata only and is false by default.
    """
    if isinstance(value, uuid.UUID):
        return value.hex
    text = str(value or "").strip().lower()
    if not text and allow_empty:
        return ""
    try:
        parsed = uuid.UUID(text)
    except (ValueError, AttributeError, TypeError) as exc:
        raise ValueError(f"Invalid UUID: {value!r}") from exc
    normalized = parsed.hex
    if not _UUID_RE.fullmatch(normalized):
        raise ValueError(f"Invalid UUID: {value!r}")
    return normalized


def is_valid_uuid(value: str | uuid.UUID) -> bool:
    try:
        normalize_uuid(value)
    except ValueError:
        return False
    return True


def stable_date_id(
    entity_id: str,
    date_kind: str,
    label: str = "",
    year: int | None = None,
    date_value: str | None = None,
    precision: str = "exact",
    end_year: int | None = None,
    end_date_value: str | None = None,
) -> str:
    """Create a deterministic ID for a date attached to an entity."""
    entity = normalize_uuid(entity_id)
    key = "|".join(
        (
            entity,
            str(date_kind or "custom").strip().casefold(),
            normalize_text(label),
            str(year) if year is not None else "",
            str(date_value or "").strip(),
            normalize_precision(precision),
            str(end_year) if end_year is not None else "",
            str(end_date_value or "").strip(),
        )
    )
    return uuid.uuid5(_DATE_NAMESPACE, key).hex


def normalize_text(value: str) -> str:
    return " ".join(str(value or "").casefold().split())


def normalize_precision(value: str | None) -> str:
    precision = str(value or "exact").strip().lower()
    aliases = {"y": "year", "m": "month", "d": "day", "date": "exact"}
    precision = aliases.get(precision, precision)
    if precision not in _DATE_PRECISIONS:
        raise ValueError(f"Unsupported date precision: {value!r}")
    return precision


@dataclass(slots=True)
class EntityType:
    id: str
    name: str
    icon: str = "✦"
    is_builtin: bool = True

    def __post_init__(self) -> None:
        if self.id and self.id not in _BUILTIN_TYPE_IDS:
            self.id = normalize_uuid(self.id)
        elif not self.id:
            self.id = new_uuid()


@dataclass(slots=True)
class CustomFieldDefinition:
    id: str
    type_id: str
    name: str
    field_type: str = "text"
    required: bool = False
    description: str = ""
    options: list[str] = field(default_factory=list)
    default_value: Any = None

    def __post_init__(self) -> None:
        self.id = normalize_uuid(self.id) if self.id else new_uuid()
        self.field_type = str(self.field_type or "text").strip().lower()


@dataclass(slots=True)
class AliasRedirect:
    alias: str
    normalized: str
    entity_id: str
    created_at: str = ""

    def __post_init__(self) -> None:
        self.normalized = normalize_text(self.alias)
        self.entity_id = normalize_uuid(self.entity_id)
        self.created_at = self.created_at or utc_now()


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

    def __post_init__(self) -> None:
        self.id = normalize_uuid(self.id) if self.id else new_uuid()
        # Type IDs historically include the stable built-ins (person/polity/place)
        # and user-created UUIDs. Keep built-in IDs unchanged.
        if self.type_id and self.type_id not in _BUILTIN_TYPE_IDS:
            try:
                self.type_id = normalize_uuid(self.type_id)
            except ValueError:
                pass
        self.aliases = [str(a) for a in self.aliases if str(a).strip()]
        self.tags = [str(t) for t in self.tags if str(t).strip()]


@dataclass(slots=True)
class Relation:
    id: str
    source_id: str
    target_id: str
    label: str
    reverse_label: str = ""
    notes: str = ""
    created_at: str = ""

    def __post_init__(self) -> None:
        self.id = normalize_uuid(self.id) if self.id else new_uuid()
        self.source_id = normalize_uuid(self.source_id)
        self.target_id = normalize_uuid(self.target_id)
        self.created_at = self.created_at or utc_now()


@dataclass(slots=True)
class TimelineDate:
    id: str
    entity_id: str
    date_kind: str
    label: str = ""
    year: int | None = None
    date_value: str | None = None
    precision: str = "exact"
    end_year: int | None = None
    end_date_value: str | None = None

    def __post_init__(self) -> None:
        self.id = normalize_uuid(self.id) if self.id else new_uuid()
        self.entity_id = normalize_uuid(self.entity_id)
        self.precision = normalize_precision(self.precision)
        validate_date_parts(
            self.year, self.date_value, self.precision, self.end_year, self.end_date_value
        )


def validate_date_parts(
    year: int | None,
    date_value: str | None,
    precision: str = "exact",
    end_year: int | None = None,
    end_date_value: str | None = None,
) -> None:
    """Validate Gregorian partial dates, including signed fictional/BCE years.

    ``exact`` retains the legacy year-only representation. Month/day precision
    requires the corresponding components. Ranges compare known components.
    """
    precision = normalize_precision(precision)

    def parts(raw_year: int | None, value: str | None) -> tuple[int, ...] | None:
        if raw_year is not None and (
            type(raw_year) is not int or not -999_999 <= raw_year <= 999_999
        ):
            raise ValueError("Date year must be an integer between -999999 and 999999")
        if value is None or value == "":
            return (raw_year,) if raw_year is not None else None
        if not isinstance(value, str) or len(value) > 64:
            raise ValueError("Date values must be strings of at most 64 characters")
        match = re.fullmatch(r"([+-]?\d{1,6})(?:-(\d{2})(?:-(\d{2}))?)?", value)
        if not match:
            raise ValueError("Date must use YYYY, YYYY-MM or YYYY-MM-DD")
        parsed = tuple(int(component) for component in match.groups() if component is not None)
        parsed_year = parsed[0]
        if not -999_999 <= parsed_year <= 999_999:
            raise ValueError("Date year must be between -999999 and 999999")
        if raw_year is not None and raw_year != parsed_year:
            raise ValueError("Date year disagrees with date_value")
        if len(parsed) >= 2:
            month = parsed[1]
            if not 1 <= month <= 12:
                raise ValueError("Date month must be between 1 and 12")
            if len(parsed) == 3:
                leap = parsed_year % 4 == 0 and (parsed_year % 100 != 0 or parsed_year % 400 == 0)
                days = (31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
                if not 1 <= parsed[2] <= days[month - 1]:
                    raise ValueError("Invalid day for date month")
        return parsed

    start = parts(year, date_value)
    end = parts(end_year, end_date_value)
    if start is None:
        raise ValueError("A date requires year or date_value")
    if precision == "month" and len(start) != 2:
        raise ValueError("Month precision requires YYYY-MM")
    if precision == "day" and len(start) != 3:
        raise ValueError("Day precision requires YYYY-MM-DD")
    if precision == "year" and len(start) != 1:
        raise ValueError("Year precision requires a year only")
    if precision == "range" and end is None:
        raise ValueError("A date range requires an end date")
    if end is not None:
        shared = min(len(start), len(end))
        if end[:shared] < start[:shared]:
            raise ValueError("Date range end cannot precede its start")


@dataclass(slots=True)
class ValidationIssue:
    kind: str
    message: str
    entity_id: str | None = None
    relation_id: str | None = None
    token: str | None = None
    field_id: str | None = None
    date_id: str | None = None
