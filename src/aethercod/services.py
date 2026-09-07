from __future__ import annotations

import re
import sqlite3
import uuid
from .models import Entity, Relation, ValidationIssue
from .repositories import EntityRepository, RelationRepository, TaxonomyRepository, normalize

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
        args: list[str] = [q, q, q]
        where = [
            "e.deleted_at IS NULL",
            "(lower(e.name) LIKE ? OR lower(e.summary) LIKE ? OR EXISTS (SELECT 1 FROM entity_aliases a WHERE a.entity_id=e.id AND a.normalized LIKE ?))",
        ]
        if type_id:
            where.append("e.type_id=?")
            args.append(type_id)
        if tag:
            where.append(
                "EXISTS (SELECT 1 FROM entity_tags et JOIN tags t ON t.id=et.tag_id WHERE et.entity_id=e.id AND t.normalized=?)"
            )
            args.append(normalize(tag))
        rows = self.conn.execute(
            "SELECT e.* FROM entities e WHERE "
            + " AND ".join(where)
            + " ORDER BY e.name COLLATE NOCASE",
            args,
        ).fetchall()
        return [repo._hydrate(r) for r in rows]


class ValidationService:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def scan(self) -> list[ValidationIssue]:
        entities = EntityRepository(self.conn).list(include_deleted=True)
        by_id = {e.id: e for e in entities}
        issues = []
        for r in self.conn.execute("SELECT * FROM relations").fetchall():
            for endpoint in ("source_id", "target_id"):
                target = by_id.get(r[endpoint])
                if target is None:
                    issues.append(
                        ValidationIssue(
                            "missing_relation_target",
                            f"关系引用不存在的词条：{r[endpoint]}",
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
        for e in entities:
            for token in WIKILINK.findall(e.notes):
                target = by_id.get(token)
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
        dupes = self.conn.execute(
            "SELECT normalized, COUNT(*) c FROM entity_aliases GROUP BY normalized HAVING c > 1"
        ).fetchall()
        for d in dupes:
            issues.append(ValidationIssue("duplicate_alias", f"别名重复：{d['normalized']}"))
        return issues


class TimelineService:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def entries(self) -> list[dict]:
        rows = self.conn.execute(
            """SELECT d.entity_id, e.name, e.type_id, d.date_kind, d.label, d.year, d.date_value
               FROM entity_dates d JOIN entities e ON e.id=d.entity_id
               WHERE e.deleted_at IS NULL AND d.year IS NOT NULL
               ORDER BY d.year, e.name COLLATE NOCASE"""
        ).fetchall()
        return [dict(row) for row in rows]


class ProjectService:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.entities = EntityRepository(conn)
        self.relations = RelationRepository(conn)
        self.taxonomy = TaxonomyRepository(conn)
        self.search = SearchService(conn)
        self.validation = ValidationService(conn)
        self.timeline = TimelineService(conn)

    def new_entity(self, type_id: str) -> Entity:
        return Entity(id=uuid.uuid4().hex, type_id=type_id, name="未命名词条")

    def relation_rows(self, entity_id: str) -> list[dict]:
        rows = self.relations.for_entity(entity_id)
        for row in rows:
            target = self.entities.get(row["other_id"])
            row["other_name"] = target.name if target else "（无效引用）"
        return rows
