from __future__ import annotations

import json
import os
import shutil
import sqlite3
import tempfile
from pathlib import Path
from typing import Any, Iterable

from .models import Entity, Relation, normalize_uuid, stable_date_id, utc_now
from .repositories import (
    AliasRepository,
    EntityRepository,
    FieldDefinitionRepository,
    RelationRepository,
    TaxonomyRepository,
)
from .db import is_builtin_field

# Default exports include redirects and rich definitions. Explicit v1 exports
# remain available for legacy consumers.
FORMAT_VERSION = 2
LATEST_FORMAT_VERSION = 2
SUPPORTED_FORMAT_VERSIONS = {1, 2}


def _json_default(value: Any) -> Any:
    if hasattr(value, "__dict__"):
        return dict(value.__dict__)
    if hasattr(value, "__slots__"):
        return {name: getattr(value, name) for name in value.__slots__}
    raise TypeError(f"Object is not JSON serializable: {type(value).__name__}")


def entity_to_dict(entity: Entity) -> dict[str, Any]:
    return {
        "id": entity.id,
        "type_id": entity.type_id,
        "name": entity.name,
        "summary": entity.summary,
        "notes": entity.notes,
        "color": entity.color,
        "remarks": entity.remarks,
        "created_at": entity.created_at,
        "updated_at": entity.updated_at,
        "deleted_at": entity.deleted_at,
        "aliases": list(entity.aliases),
        "tags": list(entity.tags),
        "custom_fields": dict(entity.custom_fields),
        "dates": [
            dict(item) if not isinstance(item, dict) else dict(item) for item in entity.dates
        ],
    }


def relation_to_dict(row: dict[str, Any] | Relation) -> dict[str, Any]:
    if isinstance(row, Relation):
        return {
            "id": row.id,
            "source_id": row.source_id,
            "target_id": row.target_id,
            "label": row.label,
            "reverse_label": row.reverse_label,
            "notes": row.notes,
            "created_at": row.created_at,
        }
    return {
        key: row[key]
        for key in ("id", "source_id", "target_id", "label", "reverse_label", "notes", "created_at")
        if key in row
    }


def _project(conn: sqlite3.Connection) -> dict[str, str]:
    return {row["key"]: row["value"] for row in conn.execute("SELECT key, value FROM project_meta")}


def _types(conn: sqlite3.Connection, type_ids: set[str] | None = None) -> list[dict[str, Any]]:
    sql = "SELECT id,name,icon,is_builtin FROM entity_types"
    args: list[Any] = []
    if type_ids:
        marks = ",".join("?" for _ in type_ids)
        sql += f" WHERE id IN ({marks})"
        args.extend(sorted(type_ids))
    sql += " ORDER BY name"
    return [dict(row) for row in conn.execute(sql, args)]


def _fields(conn: sqlite3.Connection, type_ids: set[str] | None = None) -> list[dict[str, Any]]:
    sql = "SELECT id,type_id,name,field_type,required,description,options_json,default_json FROM entity_type_fields"
    args: list[Any] = []
    if type_ids:
        marks = ",".join("?" for _ in type_ids)
        sql += f" WHERE type_id IN ({marks})"
        args.extend(sorted(type_ids))
    sql += " ORDER BY type_id,name"
    output = []
    for row in conn.execute(sql, args):
        item = {
            "id": row["id"],
            "type_id": row["type_id"],
            "name": row["name"],
            "field_type": row["field_type"],
            "required": bool(row["required"]),
            "description": row["description"] if "description" in row.keys() else "",
            "options": json.loads(row["options_json"] or "[]"),
            "default_value": (
                json.loads(row["default_json"]) if row["default_json"] is not None else None
            ),
        }
        # Keep the v1 storage names discoverable for importers that used them.
        item["options_json"] = json.dumps(item["options"], ensure_ascii=False)
        item["default_json"] = (
            json.dumps(item["default_value"], ensure_ascii=False)
            if item["default_value"] is not None
            else None
        )
        output.append(item)
    return output


def _redirects(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    if not conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='alias_redirects'"
    ).fetchone():
        return []
    return [dict(row) for row in conn.execute("SELECT * FROM alias_redirects ORDER BY normalized")]


def export_library(
    conn: sqlite3.Connection, *, format_version: int = FORMAT_VERSION
) -> dict[str, Any]:
    """Export a consistent snapshot of the whole library.

    ``format_version=1`` preserves the original payload contract. Version 2
    contains the same fields plus structured alias redirects and richer field
    definitions; both are accepted by :func:`import_library`.
    """
    if format_version not in SUPPORTED_FORMAT_VERSIONS:
        raise ValueError(f"Unsupported Aethercod JSON format version: {format_version}")
    entities = [entity_to_dict(e) for e in EntityRepository(conn).list(include_deleted=True)]
    type_ids = {item["type_id"] for item in entities}
    result: dict[str, Any] = {
        "format_version": format_version,
        "schema_version": 2,
        "project": _project(conn),
        "entity_types": _types(conn),
        "fields": _fields(conn),
        "entities": entities,
        "relations": [
            relation_to_dict(dict(row))
            for row in conn.execute("SELECT * FROM relations ORDER BY created_at,id")
        ],
    }
    if format_version >= 2:
        result["alias_redirects"] = _redirects(conn)
    return result


def export_entity(
    conn: sqlite3.Connection,
    entity_id: str,
    *,
    include_related: bool = False,
    format_version: int = FORMAT_VERSION,
) -> dict[str, Any]:
    """Export one entity, its type and applicable field definitions.

    ``include_related`` optionally embeds the one-hop related entities; the
    default remains the historical entity-plus-relations payload.
    """
    if format_version not in SUPPORTED_FORMAT_VERSIONS:
        raise ValueError(f"Unsupported Aethercod JSON format version: {format_version}")
    entity_id = normalize_uuid(entity_id)
    entity = EntityRepository(conn).get(entity_id)
    if entity is None:
        raise ValueError(f"Unknown entity: {entity_id}")
    entity_type = conn.execute(
        "SELECT id,name,icon,is_builtin FROM entity_types WHERE id=?", (entity.type_id,)
    ).fetchone()
    relations = [
        relation_to_dict(dict(row))
        for row in conn.execute(
            "SELECT * FROM relations WHERE source_id=? OR target_id=? ORDER BY created_at,id",
            (entity_id, entity_id),
        )
    ]
    type_ids = {entity.type_id}
    related_entities: list[dict[str, Any]] = []
    if include_related:
        for relation in relations:
            other_id = (
                relation["target_id"]
                if relation["source_id"] == entity_id
                else relation["source_id"]
            )
            other = EntityRepository(conn).get(other_id)
            if other is not None:
                related_entities.append(entity_to_dict(other))
                type_ids.add(other.type_id)
    result: dict[str, Any] = {
        "format_version": format_version,
        "schema_version": 2,
        "entity": entity_to_dict(entity),
        "entity_types": _types(conn, type_ids),
        "fields": _fields(conn, type_ids),
        "relations": relations,
    }
    if include_related:
        result["related_entities"] = related_entities
    if format_version >= 2:
        redirects = [item for item in _redirects(conn) if item.get("entity_id") == entity_id]
        result["alias_redirects"] = redirects
    return result


def write_json(payload: dict[str, Any], path: str | Path) -> None:
    """Atomically write JSON, avoiding half-written project exports."""
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(
        prefix=f".{destination.name}.", suffix=".tmp", dir=destination.parent
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2, default=_json_default)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def read_json(path: str | Path) -> dict[str, Any]:
    # utf-8-sig accepts both normal UTF-8 and files saved by Windows Notepad with a BOM.
    payload = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    if not isinstance(payload, dict):
        raise ValueError("不支持的 Aethercod JSON 格式版本")
    version = payload.get("format_version", 1)
    if version not in SUPPORTED_FORMAT_VERSIONS:
        raise ValueError("不支持的 Aethercod JSON 格式版本")
    payload["format_version"] = version
    return payload


def _normalize_type_id(type_id: Any) -> str:
    value = str(type_id or "").strip()
    builtins = {
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
    if value in builtins:
        return value
    return normalize_uuid(value)


def _entity_from_dict(data: dict[str, Any]) -> Entity:
    if not isinstance(data, dict) or not data.get("id") or not data.get("type_id"):
        raise ValueError("Entity requires id and type_id")
    normalized = {
        "id": normalize_uuid(data["id"]),
        "type_id": _normalize_type_id(data["type_id"]),
        "name": data.get("name", "未命名词条"),
        "summary": data.get("summary", ""),
        "notes": data.get("notes", ""),
        "color": data.get("color", "#7c3aed"),
        "remarks": data.get("remarks", ""),
        "created_at": data.get("created_at", ""),
        "updated_at": data.get("updated_at", ""),
        "deleted_at": data.get("deleted_at"),
        "aliases": data.get("aliases", []),
        "tags": data.get("tags", []),
        "custom_fields": data.get("custom_fields", {}),
        "dates": data.get("dates", []),
    }
    if not isinstance(normalized["custom_fields"], dict):
        raise ValueError("Entity custom_fields must be an object")
    if not isinstance(normalized["dates"], list):
        raise ValueError("Entity dates must be a list")
    return Entity(**normalized)


def _field_from_dict(data: dict[str, Any]) -> dict[str, Any]:
    if (
        not isinstance(data, dict)
        or not data.get("id")
        or not data.get("type_id")
        or not data.get("name")
    ):
        raise ValueError("Field requires id, type_id and name")
    options = data.get("options")
    if options is None:
        options = json.loads(data.get("options_json", "[]") or "[]")
    default = data.get("default_value")
    if "default_value" not in data and data.get("default_json") is not None:
        default = json.loads(data["default_json"])
    return {
        "id": normalize_uuid(data["id"]),
        "type_id": _normalize_type_id(data["type_id"]),
        "name": str(data["name"]).strip(),
        "field_type": data.get("field_type", "text"),
        "required": bool(data.get("required", False)),
        "description": data.get("description", ""),
        "options": options if isinstance(options, list) else [],
        "default_value": default,
    }


def _relation_from_dict(data: dict[str, Any]) -> dict[str, Any]:
    if (
        not isinstance(data, dict)
        or not data.get("id")
        or not data.get("source_id")
        or not data.get("target_id")
    ):
        raise ValueError("Relation requires id, source_id and target_id")
    return {
        "id": normalize_uuid(data["id"]),
        "source_id": normalize_uuid(data["source_id"]),
        "target_id": normalize_uuid(data["target_id"]),
        "label": data.get("label", "相关"),
        "reverse_label": data.get("reverse_label", ""),
        "notes": data.get("notes", ""),
        "created_at": data.get("created_at", ""),
    }


def _redirect_from_dict(data: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(data, dict) or not data.get("alias") or not data.get("entity_id"):
        raise ValueError("Alias redirect requires alias and entity_id")
    result = {
        "alias": str(data["alias"]).strip(),
        "normalized": data.get("normalized", ""),
        "entity_id": normalize_uuid(data["entity_id"]),
        "created_at": data.get("created_at", ""),
    }
    if data.get("id"):
        result["id"] = normalize_uuid(data["id"])
    return result


def import_library(conn: sqlite3.Connection, payload: dict[str, Any]) -> dict[str, int]:
    """Atomically merge a full-library or single-entity export by UUID.

    Every identifier and field value is validated before the savepoint is
    released. Any exception restores the database to its pre-import state.
    Relations from a single-entity export whose other endpoint was not included
    are counted as skipped, preserving the v1 single-entry behavior.
    """
    if not isinstance(payload, dict):
        raise ValueError("Aethercod payload must be an object")
    version = payload.get("format_version", 1)
    if version not in SUPPORTED_FORMAT_VERSIONS:
        raise ValueError("不支持的 Aethercod JSON 格式版本")
    type_items = payload.get("entity_types", [])
    field_items = payload.get("fields", [])
    entity_items = list(payload.get("entities", []))
    if payload.get("entity") is not None:
        entity_items.append(payload["entity"])
    related_items = payload.get("related_entities", [])
    entity_items.extend(related_items)
    collections = (
        type_items,
        field_items,
        entity_items,
        payload.get("relations", []),
        payload.get("alias_redirects", []),
    )
    if any(
        not isinstance(items, list) or any(not isinstance(item, dict) for item in items)
        for items in collections
    ):
        raise ValueError("Aethercod payload collections must contain objects")

    # Normalize and validate all data before touching the connection.
    normalized_types: list[dict[str, Any]] = []
    for item in type_items:
        if not item.get("id") or not item.get("name"):
            raise ValueError("Entity type requires id and name")
        type_id = _normalize_type_id(item["id"])
        if type_id in {
            "person",
            "polity",
            "place",
            "organization",
            "branch",
            "event",
            "item",
            "species",
            "concept",
        }:
            # Built-ins retain their stable IDs regardless of display metadata.
            normalized_types.append(
                {
                    "id": type_id,
                    "name": item["name"],
                    "icon": item.get("icon", "✦"),
                    "is_builtin": 1,
                }
            )
        else:
            normalized_types.append(
                {
                    "id": type_id,
                    "name": item["name"],
                    "icon": item.get("icon", "✦"),
                    "is_builtin": int(item.get("is_builtin", 0)),
                }
            )
    normalized_fields = [_field_from_dict(item) for item in field_items]
    normalized_entities = [_entity_from_dict(item) for item in entity_items]
    normalized_relations = [_relation_from_dict(item) for item in payload.get("relations", [])]
    normalized_redirects = [
        _redirect_from_dict(item) for item in payload.get("alias_redirects", [])
    ]
    entity_ids = {item.id for item in normalized_entities}

    conn.execute("SAVEPOINT aethercod_import")
    try:
        for item in normalized_types:
            conn.execute(
                "INSERT INTO entity_types(id,name,icon,is_builtin) VALUES(?,?,?,?) "
                "ON CONFLICT(id) DO UPDATE SET name=excluded.name,icon=excluded.icon",
                (item["id"], item["name"], item["icon"], item["is_builtin"]),
            )
        # Stage entity identities before validating reference fields/defaults,
        # allowing forward references, cycles and self-references in one import.
        for entity in normalized_entities:
            conn.execute(
                "INSERT INTO entities(id,type_id,name,created_at,updated_at) VALUES(?,?,?,?,?) "
                "ON CONFLICT(id) DO NOTHING",
                (
                    entity.id,
                    entity.type_id,
                    entity.name,
                    entity.created_at or utc_now(),
                    entity.updated_at or utc_now(),
                ),
            )
        # A single entity export always carries its type and fields. Full
        # exports carry all definitions. Insert definitions before entities so
        # typed validation can run in EntityRepository.save.
        taxonomy = TaxonomyRepository(conn)
        fields_repo = FieldDefinitionRepository(conn)
        for item in normalized_fields:
            fields_repo._validate_type(item["field_type"])
            fields_repo._validate_value_type(
                item["field_type"], item["default_value"], item["options"], allow_none=True
            )
            if not conn.execute(
                "SELECT 1 FROM entity_types WHERE id=?", (item["type_id"],)
            ).fetchone():
                raise ValueError(f"Unknown field entity type: {item['type_id']}")
            existing = conn.execute(
                "SELECT id FROM entity_type_fields WHERE id=?", (item["id"],)
            ).fetchone()
            same_name = conn.execute(
                "SELECT id FROM entity_type_fields WHERE type_id=? AND name=? AND id<>?",
                (item["type_id"], item["name"], item["id"]),
            ).fetchone()
            if same_name:
                # Legacy built-in templates used random IDs. Reuse that field
                # rather than deleting values or creating a duplicate definition.
                if existing or not is_builtin_field(item["id"], item["type_id"], item["name"]):
                    raise ValueError(f"Field already exists: {item['name']}")
                item["id"] = same_name["id"]
                existing = same_name
            if existing:
                current = fields_repo.get(item["id"])
                if current.type_id != item["type_id"]:
                    raise ValueError("Cannot move an existing field to another entity type")
                conn.execute(
                    "UPDATE entity_type_fields SET type_id=?,name=?,field_type=?,required=?,description=?,options_json=?,default_json=? WHERE id=?",
                    (
                        item["type_id"],
                        item["name"],
                        item["field_type"],
                        int(item["required"]),
                        item["description"],
                        json.dumps(item["options"], ensure_ascii=False),
                        (
                            json.dumps(item["default_value"], ensure_ascii=False)
                            if item["default_value"] is not None
                            else None
                        ),
                        item["id"],
                    ),
                )
            else:
                taxonomy.create_field(
                    item["type_id"],
                    item["name"],
                    item["field_type"],
                    item["required"],
                    item["description"],
                    item["options"],
                    item["default_value"],
                    item["id"],
                    commit=False,
                )
        for key, value in payload.get("project", {}).items():
            conn.execute(
                "INSERT INTO project_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (str(key), str(value)),
            )
        entity_repo = EntityRepository(conn)
        for entity in normalized_entities:
            entity_repo.save(entity, commit=False, preserve_timestamps=True)
            conn.execute(
                "UPDATE entities SET created_at=? WHERE id=?", (entity.created_at, entity.id)
            )
        relation_count = 0
        skipped_relations = 0
        for relation in normalized_relations:
            if (
                not conn.execute(
                    "SELECT 1 FROM entities WHERE id=?", (relation["source_id"],)
                ).fetchone()
                or not conn.execute(
                    "SELECT 1 FROM entities WHERE id=?", (relation["target_id"],)
                ).fetchone()
            ):
                skipped_relations += 1
                continue
            conn.execute(
                "INSERT OR REPLACE INTO relations(id,source_id,target_id,label,reverse_label,notes,created_at) VALUES(?,?,?,?,?,?,?)",
                (
                    relation["id"],
                    relation["source_id"],
                    relation["target_id"],
                    relation["label"],
                    relation["reverse_label"],
                    relation["notes"],
                    relation["created_at"],
                ),
            )
            relation_count += 1
        for redirect in normalized_redirects:
            AliasRepository(conn).add_redirect(
                redirect["alias"], redirect["entity_id"], redirect["created_at"], commit=False
            )
        conn.execute("RELEASE SAVEPOINT aethercod_import")
    except Exception:
        conn.execute("ROLLBACK TO SAVEPOINT aethercod_import")
        conn.execute("RELEASE SAVEPOINT aethercod_import")
        raise
    return {
        "entities": len(normalized_entities),
        "relations": relation_count,
        "skipped_relations": skipped_relations,
        "fields": len(normalized_fields),
        "alias_redirects": len(normalized_redirects),
    }


def backup_project(source: str | Path, destination: str | Path) -> None:
    """Create a consistent SQLite backup, including WAL content."""
    source_path = Path(source)
    destination_path = Path(destination)
    source_conn = sqlite3.connect(str(source_path))
    try:
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        destination_conn = sqlite3.connect(str(destination_path))
        try:
            source_conn.backup(destination_conn)
        finally:
            destination_conn.close()
    finally:
        source_conn.close()
