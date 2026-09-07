from __future__ import annotations

import json
import re
import sqlite3
import uuid
from collections.abc import Iterable
from typing import Any

from .models import (
    Entity,
    Relation,
    TimelineDate,
    ValidationIssue,
    is_valid_uuid,
    new_uuid,
    normalize_uuid,
    validate_date_parts,
)
from .repositories import (
    AliasRepository,
    EntityRepository,
    FieldDefinitionRepository,
    RelationRepository,
    TaxonomyRepository,
    normalize,
)

WIKILINK = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]")


class SearchService:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def search(
        self, query: str = "", type_id: str | None = None, tag: str | None = None
    ) -> list[Entity]:
        repo = EntityRepository(self.conn)
        if not query.strip():
            return repo.list(type_id=type_id, tag=tag)
        q = f"%{normalize(query)}%"
        # JSON text search is intentional: it allows v1 arbitrary custom JSON
        # and v2 typed values to be found without a second search index.
        args: list[Any] = [q, q, q, q, q, q]
        where = [
            "e.deleted_at IS NULL",
            "(lower(e.name) LIKE ? OR lower(e.summary) LIKE ? OR "
            "lower(e.notes) LIKE ? OR EXISTS (SELECT 1 FROM entity_aliases a "
            "WHERE a.entity_id=e.id AND a.normalized LIKE ?) OR EXISTS (SELECT 1 "
            "FROM entity_field_values v WHERE v.entity_id=e.id AND lower(v.value_json) LIKE ?) "
            "OR EXISTS (SELECT 1 FROM alias_redirects ar WHERE ar.entity_id=e.id "
            "AND ar.normalized LIKE ?))",
        ]
        if type_id:
            where.append("e.type_id=?")
            args.append(type_id)
        if tag:
            where.append(
                "EXISTS (SELECT 1 FROM entity_tags et JOIN tags t ON t.id=et.tag_id "
                "WHERE et.entity_id=e.id AND t.normalized=?)"
            )
            args.append(normalize(tag))
        rows = self.conn.execute(
            "SELECT e.* FROM entities e WHERE "
            + " AND ".join(where)
            + " ORDER BY e.name COLLATE NOCASE",
            args,
        ).fetchall()
        return [repo._hydrate(r) for r in rows]

    def resolve(self, value: str, include_deleted: bool = False) -> Entity | None:
        return EntityRepository(self.conn).resolve(value, include_deleted=include_deleted)


class ValidationService:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def scan(self) -> list[ValidationIssue]:
        entities = EntityRepository(self.conn).list(include_deleted=True)
        by_id = {e.id: e for e in entities}
        issues: list[ValidationIssue] = []
        # UUID validation also catches rows left by hand-edited v1 databases.
        for table, column, kind in (
            ("entities", "id", "invalid_entity_uuid"),
            ("relations", "id", "invalid_relation_uuid"),
            ("entity_type_fields", "id", "invalid_field_uuid"),
            ("entity_dates", "id", "invalid_date_uuid"),
        ):
            if not self._table_has_column(table, column):
                continue
            for row in self.conn.execute(f"SELECT {column} FROM {table}").fetchall():
                if not is_valid_uuid(row[0]):
                    issues.append(
                        ValidationIssue(kind, f"Invalid UUID: {row[0]}", token=str(row[0]))
                    )

        for r in self.conn.execute("SELECT * FROM relations").fetchall():
            for endpoint in ("source_id", "target_id"):
                raw_id = r[endpoint]
                try:
                    endpoint_id = normalize_uuid(raw_id)
                except ValueError:
                    endpoint_id = raw_id
                target = by_id.get(endpoint_id)
                if target is None:
                    issues.append(
                        ValidationIssue(
                            "missing_relation_target",
                            f"关系引用不存在的词条：{raw_id}",
                            relation_id=r["id"],
                        )
                    )
                elif target.deleted_at:
                    issues.append(
                        ValidationIssue(
                            "deleted_relation_target",
                            f"关系指向已删除词条：{target.name}",
                            relation_id=r["id"],
                            entity_id=target.id,
                        )
                    )

        aliases: dict[str, list[tuple[str, str]]] = {}
        for row in self.conn.execute(
            "SELECT entity_id,alias,normalized FROM entity_aliases"
        ).fetchall():
            aliases.setdefault(row["normalized"], []).append((row["entity_id"], row["alias"]))
        for normalized, values in aliases.items():
            if len({item[0] for item in values}) > 1:
                issues.append(ValidationIssue("duplicate_alias", f"别名重复：{normalized}"))
        if self._table_exists(self.conn, "alias_redirects"):
            for row in self.conn.execute("SELECT * FROM alias_redirects").fetchall():
                target = by_id.get(row["entity_id"])
                if target is None:
                    issues.append(
                        ValidationIssue(
                            "missing_alias_redirect_target",
                            f"别名重定向目标不存在：{row['entity_id']}",
                            entity_id=row["entity_id"],
                            token=row["alias"],
                        )
                    )
                elif target.deleted_at:
                    issues.append(
                        ValidationIssue(
                            "deleted_alias_redirect_target",
                            f"别名重定向目标已删除：{target.name}",
                            entity_id=target.id,
                            token=row["alias"],
                        )
                    )
            redirect_dupes = self.conn.execute(
                "SELECT normalized, COUNT(*) c FROM alias_redirects GROUP BY normalized HAVING c > 1"
            ).fetchall()
            issues.extend(
                ValidationIssue("duplicate_alias", f"别名重定向重复：{row['normalized']}")
                for row in redirect_dupes
            )

        fields = FieldDefinitionRepository(self.conn)
        for definition in fields.list():
            for row in self.conn.execute(
                "SELECT entity_id,value_json FROM entity_field_values WHERE field_id=?",
                (definition.id,),
            ).fetchall():
                try:
                    value = json.loads(row["value_json"])
                    fields.validate_value(definition, value)
                except (ValueError, TypeError, json.JSONDecodeError) as exc:
                    issues.append(
                        ValidationIssue(
                            "invalid_field_value",
                            str(exc),
                            entity_id=row["entity_id"],
                            field_id=definition.id,
                        )
                    )
            if definition.required:
                for entity in entities:
                    if entity.type_id != definition.type_id or entity.deleted_at:
                        continue
                    if definition.name not in entity.custom_fields or entity.custom_fields[
                        definition.name
                    ] in (None, ""):
                        issues.append(
                            ValidationIssue(
                                "missing_required_field",
                                f"Required field is missing: {definition.name}",
                                entity_id=entity.id,
                                field_id=definition.id,
                            )
                        )

        for e in entities:
            for token in WIKILINK.findall(e.notes or ""):
                target = self._resolve_entity_token(token, by_id)
                if target is None:
                    issues.append(
                        ValidationIssue(
                            "missing_wikilink",
                            f"正文引用不存在的 UUID：{token}",
                            entity_id=e.id,
                            token=token,
                        )
                    )
                elif target.deleted_at:
                    issues.append(
                        ValidationIssue(
                            "deleted_wikilink",
                            f"正文引用已删除词条：{target.name}",
                            entity_id=e.id,
                            token=token,
                        )
                    )
            for raw_date in e.dates:
                try:
                    validate_date_parts(
                        raw_date.get("year"),
                        raw_date.get("date_value"),
                        raw_date.get("precision", "exact"),
                        raw_date.get("end_year"),
                        raw_date.get("end_date_value"),
                    )
                except ValueError as exc:
                    issues.append(
                        ValidationIssue(
                            "invalid_date", str(exc), entity_id=e.id, date_id=raw_date.get("id")
                        )
                    )

        duplicate_relations = self.conn.execute(
            """SELECT source_id,target_id,label,COUNT(*) c FROM relations
               GROUP BY source_id,target_id,label HAVING c > 1"""
        ).fetchall()
        issues.extend(
            ValidationIssue("duplicate_relation", f"关系重复：{row['label']}")
            for row in duplicate_relations
        )
        return issues

    @staticmethod
    def _resolve_entity_token(token: str, by_id: dict[str, Entity]) -> Entity | None:
        try:
            return by_id.get(normalize_uuid(token))
        except ValueError:
            return None

    def validate_uuid(self, value: str) -> str:
        return normalize_uuid(value)

    @staticmethod
    def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
        return bool(
            conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
            ).fetchone()
        )

    def _table_has_column(self, table: str, column: str) -> bool:
        if not self._table_exists(self.conn, table):
            return False
        return column in {
            row[1] for row in self.conn.execute(f"PRAGMA table_info({table})").fetchall()
        }


class TimelineService:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def entries(
        self,
        type_id: str | None = None,
        date_kind: str | None = None,
        tag: str | None = None,
        include_deleted: bool = False,
        entity_id: str | None = None,
    ) -> list[dict[str, Any]]:
        where = ["1=1"] if include_deleted else ["e.deleted_at IS NULL"]
        args: list[Any] = []
        if type_id:
            where.append("e.type_id=?")
            args.append(type_id)
        if date_kind:
            where.append("d.date_kind=?")
            args.append(date_kind)
        if entity_id:
            where.append("d.entity_id=?")
            args.append(normalize_uuid(entity_id))
        if tag:
            where.append(
                "EXISTS (SELECT 1 FROM entity_tags et JOIN tags t ON t.id=et.tag_id "
                "WHERE et.entity_id=e.id AND t.normalized=?)"
            )
            args.append(normalize(tag))
        sql = (
            "SELECT d.id,d.entity_id,e.name,e.type_id,d.date_kind,d.label,d.year,d.date_value, "
            "d.precision,d.end_year,d.end_date_value "
            "FROM entity_dates d JOIN entities e ON e.id=d.entity_id WHERE "
            + " AND ".join(where)
            + " ORDER BY COALESCE(d.year, 999999999), COALESCE(d.date_value, ''), "
            "e.name COLLATE NOCASE, d.id"
        )
        rows = self.conn.execute(sql, args).fetchall()
        return [dict(row) for row in rows]

    list_entries = entries

    def for_entity(self, entity_id: str) -> list[dict[str, Any]]:
        return self.entries(entity_id=entity_id)

    def bounds(self, **filters: Any) -> tuple[int | None, int | None]:
        rows = self.entries(**filters)
        starts = [row["year"] for row in rows if row["year"] is not None]
        ends = [
            row["end_year"] if row["end_year"] is not None else row["year"]
            for row in rows
            if row["year"] is not None
        ]
        return (min(starts) if starts else None, max(ends) if ends else None)


class ProjectService:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.entities = EntityRepository(conn)
        self.relations = RelationRepository(conn)
        self.taxonomy = TaxonomyRepository(conn)
        self.fields = FieldDefinitionRepository(conn)
        self.aliases = AliasRepository(conn)
        self.search = SearchService(conn)
        self.validation = ValidationService(conn)
        self.timeline = TimelineService(conn)
        # Explicit names make the expanded APIs discoverable without breaking
        # callers that use the original repositories above.
        self.field_definitions = self.fields
        self.alias_redirects = self.aliases

    def new_entity(self, type_id: str) -> Entity:
        if self.taxonomy.get(type_id) is None:
            raise ValueError(f"Unknown entity type: {type_id}")
        return Entity(id=new_uuid(), type_id=type_id, name="未命名词条")

    def new_relation(
        self, source_id: str, target_id: str, label: str, reverse_label: str = "", notes: str = ""
    ) -> Relation:
        return self.relations.create(source_id, target_id, label, reverse_label, notes)

    def relation_rows(self, entity_id: str) -> list[dict[str, Any]]:
        rows = self.relations.for_entity(entity_id)
        for row in rows:
            target = self.entities.get(row["other_id"])
            row["other_name"] = target.name if target else "（无效引用）"
        return rows
