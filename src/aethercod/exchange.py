from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from .models import Entity, Relation
from .repositories import EntityRepository, RelationRepository, TaxonomyRepository

FORMAT_VERSION = 1


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
        "aliases": entity.aliases,
        "tags": entity.tags,
        "custom_fields": entity.custom_fields,
        "dates": entity.dates,
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


def export_library(conn) -> dict[str, Any]:
    project = {
        row["key"]: row["value"] for row in conn.execute("SELECT key, value FROM project_meta")
    }
    types = [
        dict(row)
        for row in conn.execute("SELECT id, name, icon, is_builtin FROM entity_types ORDER BY name")
    ]
    entities = [entity_to_dict(e) for e in EntityRepository(conn).list(include_deleted=True)]
    relations = [
        relation_to_dict(dict(row))
        for row in conn.execute("SELECT * FROM relations ORDER BY created_at")
    ]
    fields = [
        dict(row)
        for row in conn.execute(
            "SELECT id, type_id, name, field_type, required FROM entity_type_fields ORDER BY name"
        )
    ]
    return {
        "format_version": FORMAT_VERSION,
        "project": project,
        "entity_types": types,
        "fields": fields,
        "entities": entities,
        "relations": relations,
    }


def export_entity(conn, entity_id: str) -> dict[str, Any]:
    entity = EntityRepository(conn).get(entity_id)
    if entity is None:
        raise ValueError(f"Unknown entity: {entity_id}")
    related = [
        relation_to_dict(dict(row))
        for row in conn.execute(
            "SELECT * FROM relations WHERE source_id=? OR target_id=?", (entity_id, entity_id)
        )
    ]
    return {
        "format_version": FORMAT_VERSION,
        "entity": entity_to_dict(entity),
        "relations": related,
    }


def write_json(payload: dict[str, Any], path: str | Path) -> None:
    Path(path).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def read_json(path: str | Path) -> dict[str, Any]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or payload.get("format_version") != FORMAT_VERSION:
        raise ValueError("不支持的 Aethercod JSON 格式版本")
    return payload


def import_library(conn, payload: dict[str, Any]) -> dict[str, int]:
    """Merge a full-library or single-entity export by UUID."""
    type_repo = TaxonomyRepository(conn)
    existing_types = {item.id for item in type_repo.list_types()}
    for item in payload.get("entity_types", []):
        if item["id"] not in existing_types:
            conn.execute(
                "INSERT OR IGNORE INTO entity_types(id,name,icon,is_builtin) VALUES(?,?,?,?)",
                (item["id"], item["name"], item.get("icon", "✦"), int(item.get("is_builtin", 0))),
            )
    incoming_entities = list(payload.get("entities", []))
    if payload.get("entity"):
        incoming_entities.append(payload["entity"])
    for key, value in payload.get("project", {}).items():
        conn.execute(
            "INSERT INTO project_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, str(value)),
        )
    entity_repo = EntityRepository(conn)
    entity_count = 0
    for data in incoming_entities:
        entity_repo.save(
            Entity(
                **{
                    key: data.get(key, default)
                    for key, default in {
                        "id": data["id"],
                        "type_id": data["type_id"],
                        "name": data.get("name", "未命名词条"),
                        "summary": "",
                        "notes": "",
                        "color": "#7c3aed",
                        "remarks": "",
                        "created_at": "",
                        "updated_at": "",
                        "deleted_at": None,
                    }.items()
                },
                aliases=data.get("aliases", []),
                tags=data.get("tags", []),
                custom_fields=data.get("custom_fields", {}),
                dates=data.get("dates", []),
            )
        )
        entity_count += 1
    relation_count = 0
    for data in payload.get("relations", []):
        if (
            not conn.execute("SELECT 1 FROM entities WHERE id=?", (data["source_id"],)).fetchone()
            or not conn.execute(
                "SELECT 1 FROM entities WHERE id=?", (data["target_id"],)
            ).fetchone()
        ):
            continue
        conn.execute(
            "INSERT OR REPLACE INTO relations(id,source_id,target_id,label,reverse_label,notes,created_at) VALUES(?,?,?,?,?,?,?)",
            (
                data["id"],
                data["source_id"],
                data["target_id"],
                data.get("label", "相关"),
                data.get("reverse_label", ""),
                data.get("notes", ""),
                data.get("created_at", ""),
            ),
        )
        relation_count += 1
    conn.commit()
    return {"entities": entity_count, "relations": relation_count}


def backup_project(source: str | Path, destination: str | Path) -> None:
    shutil.copy2(source, destination)
