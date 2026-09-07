from __future__ import annotations

import json
import sqlite3
import uuid
from typing import Any

from .models import Entity, EntityType, Relation, utc_now


def normalize(value: str) -> str:
    return " ".join(value.casefold().split())


class TaxonomyRepository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def list_types(self) -> list[EntityType]:
        rows = self.conn.execute(
            "SELECT * FROM entity_types ORDER BY is_builtin DESC, name"
        ).fetchall()
        return [EntityType(r["id"], r["name"], r["icon"], bool(r["is_builtin"])) for r in rows]

    def get(self, type_id: str) -> EntityType | None:
        r = self.conn.execute("SELECT * FROM entity_types WHERE id=?", (type_id,)).fetchone()
        return EntityType(r["id"], r["name"], r["icon"], bool(r["is_builtin"])) if r else None

    def create_type(self, name: str, icon: str = "✦") -> EntityType:
        type_id = uuid.uuid4().hex
        self.conn.execute(
            "INSERT INTO entity_types(id,name,icon) VALUES(?,?,?)", (type_id, name, icon)
        )
        self.conn.commit()
        return EntityType(type_id, name, icon, False)


class EntityRepository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def _hydrate(self, row: sqlite3.Row) -> Entity:
        e = Entity(
            **{
                k: row[k]
                for k in (
                    "id",
                    "type_id",
                    "name",
                    "summary",
                    "notes",
                    "color",
                    "remarks",
                    "created_at",
                    "updated_at",
                    "deleted_at",
                )
            }
        )
        e.aliases = [
            r[0]
            for r in self.conn.execute(
                "SELECT alias FROM entity_aliases WHERE entity_id=? ORDER BY alias", (e.id,)
            )
        ]
        e.tags = [
            r[0]
            for r in self.conn.execute(
                "SELECT t.name FROM tags t JOIN entity_tags et ON t.id=et.tag_id WHERE et.entity_id=? ORDER BY t.name",
                (e.id,),
            )
        ]
        e.custom_fields = {
            r[0]: json.loads(r[1])
            for r in self.conn.execute(
                "SELECT f.name, v.value_json FROM entity_field_values v JOIN entity_type_fields f ON f.id=v.field_id WHERE v.entity_id=?",
                (e.id,),
            )
        }
        e.dates = [
            dict(r)
            for r in self.conn.execute(
                "SELECT date_kind,label,year,date_value FROM entity_dates WHERE entity_id=? ORDER BY year",
                (e.id,),
            )
        ]
        return e

    def list(
        self, include_deleted: bool = False, type_id: str | None = None, tag: str | None = None
    ) -> list[Entity]:
        where, args = ([] if include_deleted else ["e.deleted_at IS NULL"], [])
        if type_id:
            where.append("e.type_id=?")
            args.append(type_id)
        if tag:
            where.append(
                "EXISTS (SELECT 1 FROM entity_tags et JOIN tags t ON t.id=et.tag_id WHERE et.entity_id=e.id AND t.normalized=?)"
            )
            args.append(normalize(tag))
        sql = (
            "SELECT e.* FROM entities e"
            + (" WHERE " + " AND ".join(where) if where else "")
            + " ORDER BY e.name COLLATE NOCASE"
        )
        return [self._hydrate(r) for r in self.conn.execute(sql, args).fetchall()]

    def get(self, entity_id: str, include_deleted: bool = True) -> Entity | None:
        sql = "SELECT * FROM entities WHERE id=?" + (
            "" if include_deleted else " AND deleted_at IS NULL"
        )
        r = self.conn.execute(sql, (entity_id,)).fetchone()
        return self._hydrate(r) if r else None

    def save(self, entity: Entity) -> Entity:
        now = utc_now()
        entity.updated_at = now
        entity.created_at = entity.created_at or now
        self.conn.execute(
            """INSERT INTO entities(id,type_id,name,summary,notes,color,remarks,created_at,updated_at,deleted_at)
          VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET type_id=excluded.type_id,name=excluded.name,summary=excluded.summary,notes=excluded.notes,color=excluded.color,remarks=excluded.remarks,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at""",
            (
                entity.id,
                entity.type_id,
                entity.name,
                entity.summary,
                entity.notes,
                entity.color,
                entity.remarks,
                entity.created_at,
                entity.updated_at,
                entity.deleted_at,
            ),
        )
        self.conn.execute("DELETE FROM entity_aliases WHERE entity_id=?", (entity.id,))
        self.conn.executemany(
            "INSERT INTO entity_aliases(entity_id,alias,normalized) VALUES(?,?,?)",
            [(entity.id, a, normalize(a)) for a in dict.fromkeys(entity.aliases) if a.strip()],
        )
        self.conn.execute("DELETE FROM entity_tags WHERE entity_id=?", (entity.id,))
        for tag in dict.fromkeys(t.strip() for t in entity.tags if t.strip()):
            self.conn.execute(
                "INSERT OR IGNORE INTO tags(name,normalized) VALUES(?,?)", (tag, normalize(tag))
            )
            tag_id = self.conn.execute(
                "SELECT id FROM tags WHERE normalized=?", (normalize(tag),)
            ).fetchone()[0]
            self.conn.execute(
                "INSERT INTO entity_tags(entity_id,tag_id) VALUES(?,?)", (entity.id, tag_id)
            )
        self.conn.execute("DELETE FROM entity_field_values WHERE entity_id=?", (entity.id,))
        for field_name, value in entity.custom_fields.items():
            field = self.conn.execute(
                "SELECT id FROM entity_type_fields WHERE type_id=? AND name=?",
                (entity.type_id, field_name),
            ).fetchone()
            field_id = field[0] if field else uuid.uuid4().hex
            if field is None:
                self.conn.execute(
                    "INSERT INTO entity_type_fields(id,type_id,name,field_type) VALUES(?,?,?,?)",
                    (field_id, entity.type_id, field_name, "json"),
                )
            self.conn.execute(
                "INSERT INTO entity_field_values(entity_id,field_id,value_json) VALUES(?,?,?)",
                (entity.id, field_id, json.dumps(value, ensure_ascii=False)),
            )
        self.conn.execute("DELETE FROM entity_dates WHERE entity_id=?", (entity.id,))
        self.conn.executemany(
            "INSERT INTO entity_dates(id,entity_id,date_kind,label,year,date_value) VALUES(?,?,?,?,?,?)",
            [
                (
                    uuid.uuid4().hex,
                    entity.id,
                    d.get("date_kind", "custom"),
                    d.get("label", ""),
                    d.get("year"),
                    d.get("date_value"),
                )
                for d in entity.dates
            ],
        )
        self.conn.commit()
        return entity

    def soft_delete(self, entity_id: str) -> None:
        self.conn.execute(
            "UPDATE entities SET deleted_at=?, updated_at=? WHERE id=?",
            (utc_now(), utc_now(), entity_id),
        )
        self.conn.commit()

    def restore(self, entity_id: str) -> None:
        self.conn.execute(
            "UPDATE entities SET deleted_at=NULL, updated_at=? WHERE id=?", (utc_now(), entity_id)
        )
        self.conn.commit()


class RelationRepository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def create(
        self, source_id: str, target_id: str, label: str, reverse_label: str = "", notes: str = ""
    ) -> Relation:
        relation = Relation(
            uuid.uuid4().hex, source_id, target_id, label, reverse_label, notes, utc_now()
        )
        self.conn.execute(
            "INSERT INTO relations VALUES(?,?,?,?,?,?,?)",
            (
                tuple(relation.__dict__.values())
                if hasattr(relation, "__dict__")
                else (
                    relation.id,
                    relation.source_id,
                    relation.target_id,
                    relation.label,
                    relation.reverse_label,
                    relation.notes,
                    relation.created_at,
                )
            ),
        )
        self.conn.commit()
        return relation

    def delete(self, relation_id: str) -> None:
        self.conn.execute("DELETE FROM relations WHERE id=?", (relation_id,))
        self.conn.commit()

    def for_entity(self, entity_id: str) -> list[dict[str, Any]]:
        rows = self.conn.execute(
            """SELECT r.*, CASE WHEN r.source_id=? THEN 'out' ELSE 'in' END direction,
          CASE WHEN r.source_id=? THEN r.target_id ELSE r.source_id END other_id,
          CASE WHEN r.source_id=? THEN r.label ELSE COALESCE(NULLIF(r.reverse_label,''), r.label) END display_label
          FROM relations r WHERE r.source_id=? OR r.target_id=? ORDER BY r.created_at""",
            (entity_id, entity_id, entity_id, entity_id, entity_id),
        ).fetchall()
        return [dict(r) for r in rows]
