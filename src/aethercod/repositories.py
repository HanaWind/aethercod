from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager, nullcontext
from typing import Any, Iterable

from .db import is_builtin_field
from .models import (
    AliasRedirect,
    CustomFieldDefinition,
    Entity,
    EntityType,
    Relation,
    TimelineDate,
    new_uuid,
    normalize_text,
    normalize_uuid,
    normalize_precision,
    stable_date_id,
    utc_now,
    validate_date_parts,
)


@contextmanager
def atomic(conn: sqlite3.Connection):
    """Own only this unit of work, preserving any caller-owned transaction."""
    name = "aethercod_" + new_uuid()
    conn.execute(f"SAVEPOINT {name}")
    try:
        yield
        conn.execute(f"RELEASE SAVEPOINT {name}")
    except Exception:
        conn.execute(f"ROLLBACK TO SAVEPOINT {name}")
        conn.execute(f"RELEASE SAVEPOINT {name}")
        raise


# Kept as the historical public helper; all name/tag/alias comparisons use it.
def normalize(value: str) -> str:
    return normalize_text(value)


FIELD_TYPES = {
    "text",
    "textarea",
    "string",
    "integer",
    "int",
    "number",
    "float",
    "boolean",
    "bool",
    "date",
    "choice",
    "select",
    "multiselect",
    "json",
    "color",
    "url",
    "entity",
    "entity_ref",
    "entity_reference",
    "entity_refs",
    "entity_list",
    "multi_entity",
}


class TaxonomyRepository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def list_types(self) -> list[EntityType]:
        rows = self.conn.execute(
            "SELECT * FROM entity_types ORDER BY is_builtin DESC, name"
        ).fetchall()
        return [EntityType(r["id"], r["name"], r["icon"], bool(r["is_builtin"])) for r in rows]

    def get(self, type_id: str) -> EntityType | None:
        type_id = str(type_id)
        r = self.conn.execute("SELECT * FROM entity_types WHERE id=?", (type_id,)).fetchone()
        return EntityType(r["id"], r["name"], r["icon"], bool(r["is_builtin"])) if r else None

    def create_type(self, name: str, icon: str = "✦") -> EntityType:
        name = str(name).strip()
        if not name:
            raise ValueError("Entity type name is required")
        type_id = new_uuid()
        self.conn.execute(
            "INSERT INTO entity_types(id,name,icon,is_builtin) VALUES(?,?,?,0)",
            (type_id, name, icon or "✦"),
        )
        self.conn.commit()
        return EntityType(type_id, name, icon or "✦", False)

    def update_type(
        self, type_id: str, name: str | None = None, icon: str | None = None
    ) -> EntityType:
        type_id = str(type_id)
        current = self.get(type_id)
        if current is None:
            raise ValueError(f"Unknown entity type: {type_id}")
        if current.is_builtin and name is not None and name.strip() != current.name:
            raise ValueError("Built-in entity type names cannot be changed")
        new_name = (name.strip() if name is not None else current.name) or current.name
        new_icon = icon if icon is not None else current.icon
        self.conn.execute(
            "UPDATE entity_types SET name=?, icon=? WHERE id=?", (new_name, new_icon, type_id)
        )
        self.conn.commit()
        return EntityType(type_id, new_name, new_icon, current.is_builtin)

    def delete_type(self, type_id: str) -> None:
        current = self.get(type_id)
        if current is None:
            return
        if current.is_builtin:
            raise ValueError("Built-in entity types cannot be deleted")
        if self.conn.execute(
            "SELECT 1 FROM entities WHERE type_id=? LIMIT 1", (type_id,)
        ).fetchone():
            raise ValueError("Cannot delete an entity type that still has entities")
        self.conn.execute("DELETE FROM entity_type_fields WHERE type_id=?", (type_id,))
        self.conn.execute("DELETE FROM entity_types WHERE id=?", (type_id,))
        self.conn.commit()

    # Field CRUD is available here as well as on FieldDefinitionRepository for
    # callers that already use TaxonomyRepository as their schema entry point.
    def fields(self, type_id: str | None = None) -> list[CustomFieldDefinition]:
        return FieldDefinitionRepository(self.conn).list(type_id)

    def create_field(self, *args: Any, **kwargs: Any) -> CustomFieldDefinition:
        return FieldDefinitionRepository(self.conn).create(*args, **kwargs)

    def get_field(self, field_id: str) -> CustomFieldDefinition | None:
        return FieldDefinitionRepository(self.conn).get(field_id)

    def update_field(self, *args: Any, **kwargs: Any) -> CustomFieldDefinition:
        return FieldDefinitionRepository(self.conn).update(*args, **kwargs)

    def delete_field(self, field_id: str) -> None:
        FieldDefinitionRepository(self.conn).delete(field_id)


class FieldDefinitionRepository:
    """CRUD and typed validation for custom fields on an entity type."""

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    @staticmethod
    def _definition(row: sqlite3.Row) -> CustomFieldDefinition:
        options = json.loads(row["options_json"] or "[]")
        default = json.loads(row["default_json"]) if row["default_json"] is not None else None
        return CustomFieldDefinition(
            row["id"],
            row["type_id"],
            row["name"],
            row["field_type"],
            bool(row["required"]),
            row["description"] if "description" in row.keys() else "",
            options if isinstance(options, list) else [],
            default,
        )

    def list(self, type_id: str | None = None) -> list[CustomFieldDefinition]:
        if type_id is None:
            rows = self.conn.execute(
                "SELECT * FROM entity_type_fields ORDER BY type_id, name"
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM entity_type_fields WHERE type_id=? ORDER BY name", (str(type_id),)
            ).fetchall()
        return [self._definition(row) for row in rows]

    # Common aliases for callers who prefer list_fields/get_field naming.
    list_fields = list

    def get(self, field_id: str) -> CustomFieldDefinition | None:
        row = self.conn.execute(
            "SELECT * FROM entity_type_fields WHERE id=?", (normalize_uuid(field_id),)
        ).fetchone()
        return self._definition(row) if row else None

    get_field = get

    def create(
        self,
        type_id: str,
        name: str,
        field_type: str = "text",
        required: bool = False,
        description: str = "",
        options: Iterable[str] | None = None,
        default_value: Any = None,
        id: str | None = None,
        *,
        commit: bool = True,
    ) -> CustomFieldDefinition:
        name = str(name).strip()
        if not name:
            raise ValueError("Field name is required")
        field_type = str(field_type or "text").strip().lower()
        self._validate_type(field_type)
        options_list = [str(x) for x in (options or [])]
        field_id = normalize_uuid(id) if id else new_uuid()
        if self.conn.execute(
            "SELECT 1 FROM entity_type_fields WHERE type_id=? AND name=?", (type_id, name)
        ).fetchone():
            raise ValueError(f"Field already exists: {name}")
        self._validate_value_type(field_type, default_value, options_list, allow_none=True)
        self.conn.execute(
            """INSERT INTO entity_type_fields
               (id,type_id,name,field_type,required,description,options_json,default_json)
               VALUES(?,?,?,?,?,?,?,?)""",
            (
                field_id,
                type_id,
                name,
                field_type,
                int(required),
                description or "",
                json.dumps(options_list, ensure_ascii=False),
                (
                    json.dumps(default_value, ensure_ascii=False)
                    if default_value is not None
                    else None
                ),
            ),
        )
        if commit:
            self.conn.commit()
        return CustomFieldDefinition(
            field_id,
            type_id,
            name,
            field_type,
            bool(required),
            description or "",
            options_list,
            default_value,
        )

    create_field = create

    def update(
        self,
        field_id: str,
        *,
        name: str | None = None,
        field_type: str | None = None,
        required: bool | None = None,
        description: str | None = None,
        options: Iterable[str] | None = None,
        default_value: Any = None,
        set_default: bool = False,
    ) -> CustomFieldDefinition:
        field = self.get(field_id)
        if field is None:
            raise ValueError(f"Unknown field: {field_id}")
        new_name = str(name).strip() if name is not None else field.name
        new_type = str(field_type or field.field_type).strip().lower()
        new_options = [str(x) for x in options] if options is not None else list(field.options)
        self._validate_type(new_type)
        if (
            new_name != field.name
            and self.conn.execute(
                "SELECT 1 FROM entity_type_fields WHERE type_id=? AND name=? AND id<>?",
                (field.type_id, new_name, field.id),
            ).fetchone()
        ):
            raise ValueError(f"Field already exists: {new_name}")
        if set_default:
            self._validate_value_type(new_type, default_value, new_options, allow_none=True)
        elif new_type != field.field_type or new_options != field.options:
            for row in self.conn.execute(
                "SELECT value_json FROM entity_field_values WHERE field_id=?", (field.id,)
            ):
                self.validate_value(
                    field.id, json.loads(row[0]), field_type=new_type, options=new_options
                )
        self.conn.execute(
            """UPDATE entity_type_fields SET name=?,field_type=?,required=?,description=?,
               options_json=?,default_json=? WHERE id=?""",
            (
                new_name,
                new_type,
                int(field.required if required is None else required),
                field.description if description is None else description,
                json.dumps(new_options, ensure_ascii=False),
                (
                    json.dumps(default_value, ensure_ascii=False)
                    if set_default
                    else (
                        json.dumps(field.default_value, ensure_ascii=False)
                        if field.default_value is not None
                        else None
                    )
                ),
                field.id,
            ),
        )
        self.conn.commit()
        return self.get(field.id)  # type: ignore[return-value]

    update_field = update

    def delete(self, field_id: str) -> None:
        field_id = normalize_uuid(field_id)
        row = self.conn.execute(
            "SELECT type_id,name FROM entity_type_fields WHERE id=?", (field_id,)
        ).fetchone()
        if row and is_builtin_field(field_id, row["type_id"], row["name"]):
            raise ValueError("Built-in fields cannot be deleted")
        with self.conn:
            self.conn.execute("DELETE FROM entity_field_values WHERE field_id=?", (field_id,))
            self.conn.execute("DELETE FROM entity_type_fields WHERE id=?", (field_id,))

    delete_field = delete

    def validate_value(
        self,
        field: str | CustomFieldDefinition,
        value: Any,
        *,
        field_type: str | None = None,
        options: Iterable[str] | None = None,
    ) -> Any:
        definition = field if isinstance(field, CustomFieldDefinition) else self.get(field)
        if isinstance(field, str) and definition is None and field_type is None:
            raise ValueError(f"Unknown field: {field}")
        type_name = field_type or (definition.field_type if definition else "text")
        choices = (
            list(options) if options is not None else (definition.options if definition else [])
        )
        self._validate_type(type_name)
        self._validate_value_type(type_name, value, choices)
        return value

    def validate_values(
        self, type_id: str, values: dict[str, Any], *, allow_unknown: bool = False
    ) -> dict[str, Any]:
        definitions = {item.name: item for item in self.list(type_id)}
        unknown = set(values) - set(definitions)
        if unknown and not allow_unknown:
            raise ValueError(f"Unknown custom fields: {', '.join(sorted(unknown))}")
        for item in definitions.values():
            if item.required and (
                item.name not in values or values[item.name] is None or values[item.name] == ""
            ):
                raise ValueError(f"Required field is missing: {item.name}")
        for name, value in values.items():
            if name in definitions:
                self.validate_value(definitions[name], value)
        return values

    @staticmethod
    def _validate_type(field_type: str) -> None:
        if field_type not in FIELD_TYPES:
            raise ValueError(f"Unsupported field type: {field_type}")

    def _validate_value_type(
        self, field_type: str, value: Any, options: list[str], allow_none: bool = False
    ) -> None:
        if value is None and allow_none:
            return
        if field_type in {"text", "textarea", "string", "color", "url", "date"} and not isinstance(
            value, str
        ):
            raise ValueError(f"Expected string value for {field_type}")
        if field_type == "date" and value:
            validate_date_parts(None, value)
        if field_type in {"integer", "int"} and (
            isinstance(value, bool) or not isinstance(value, int)
        ):
            raise ValueError("Expected integer value")
        if field_type in {"number", "float"} and (
            isinstance(value, bool) or not isinstance(value, (int, float))
        ):
            raise ValueError("Expected numeric value")
        if field_type in {"boolean", "bool"} and not isinstance(value, bool):
            raise ValueError("Expected boolean value")
        if field_type in {"choice", "select"} and value not in options:
            raise ValueError(f"Value must be one of: {', '.join(options)}")
        if field_type == "multiselect":
            if not isinstance(value, list) or any(item not in options for item in value):
                raise ValueError("Expected a list of configured choices")
        if field_type in {
            "entity",
            "entity_ref",
            "entity_reference",
            "entity_refs",
            "entity_list",
            "multi_entity",
        }:
            refs = (
                value if field_type in {"entity_refs", "entity_list", "multi_entity"} else [value]
            )
            if not isinstance(refs, list) or any(not isinstance(item, str) for item in refs):
                raise ValueError("Entity reference value must contain entity IDs")
            for ref in refs:
                ref_id = normalize_uuid(ref)
                if not self.conn.execute("SELECT 1 FROM entities WHERE id=?", (ref_id,)).fetchone():
                    raise ValueError(f"Unknown entity reference: {ref}")
        if field_type == "json":
            try:
                json.dumps(value, ensure_ascii=False)
            except (TypeError, ValueError) as exc:
                raise ValueError("Value is not JSON serializable") from exc


# Descriptive alias retained for clients that call this a field repository.
CustomFieldRepository = FieldDefinitionRepository


class AliasRepository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def add_redirect(
        self, alias: str, entity_id: str, created_at: str | None = None, *, commit: bool = True
    ) -> AliasRedirect:
        alias = str(alias).strip()
        if not alias:
            raise ValueError("Alias is required")
        entity_id = normalize_uuid(entity_id)
        if not self.conn.execute("SELECT 1 FROM entities WHERE id=?", (entity_id,)).fetchone():
            raise ValueError(f"Unknown entity: {entity_id}")
        redirect = AliasRedirect(alias, normalize(alias), entity_id, created_at or utc_now())
        with atomic(self.conn) if commit else nullcontext():
            self.check_available(alias, entity_id)
            existing = self.conn.execute(
                "SELECT * FROM alias_redirects WHERE normalized=?", (redirect.normalized,)
            ).fetchone()
            if existing:
                return AliasRedirect(
                    existing["alias"], existing["normalized"], entity_id, existing["created_at"]
                )
            self.conn.execute(
                "INSERT INTO alias_redirects(alias,normalized,entity_id,created_at) VALUES(?,?,?,?)",
                (redirect.alias, redirect.normalized, redirect.entity_id, redirect.created_at),
            )
        return redirect

    def check_available(self, alias: str, entity_id: str) -> None:
        normalized = normalize(alias)
        for table in ("alias_redirects", "entity_aliases"):
            if self.conn.execute(
                f"SELECT 1 FROM {table} WHERE normalized=? AND entity_id<>?",
                (normalized, entity_id),
            ).fetchone():
                raise ValueError(f"Alias already points to another entity: {alias}")

    create = add_redirect
    set_redirect = add_redirect

    def remove_redirect(self, alias: str) -> None:
        self.conn.execute("DELETE FROM alias_redirects WHERE alias=?", (alias,))
        self.conn.commit()

    def resolve(self, value: str) -> str | None:
        normalized = normalize(value)
        row = self.conn.execute(
            "SELECT entity_id FROM alias_redirects WHERE normalized=?", (normalized,)
        ).fetchone()
        if row:
            return row[0]
        row = self.conn.execute(
            "SELECT entity_id FROM entity_aliases WHERE normalized=? ORDER BY entity_id LIMIT 1",
            (normalized,),
        ).fetchone()
        return row[0] if row else None

    resolve_alias = resolve

    def list(self, entity_id: str | None = None) -> list[AliasRedirect]:
        if entity_id is None:
            rows = self.conn.execute("SELECT * FROM alias_redirects ORDER BY normalized").fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM alias_redirects WHERE entity_id=? ORDER BY normalized",
                (normalize_uuid(entity_id),),
            ).fetchall()
        return [
            AliasRedirect(r["alias"], r["normalized"], r["entity_id"], r["created_at"])
            for r in rows
        ]


class EntityRepository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.fields = FieldDefinitionRepository(conn)
        self.aliases = AliasRepository(conn)

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
        e.custom_fields = {}
        for r in self.conn.execute(
            "SELECT f.name, v.value_json FROM entity_field_values v JOIN entity_type_fields f ON f.id=v.field_id WHERE v.entity_id=?",
            (e.id,),
        ):
            try:
                e.custom_fields[r[0]] = json.loads(r[1])
            except (TypeError, ValueError):
                e.custom_fields[r[0]] = r[1]
        e.dates = [
            dict(r)
            for r in self.conn.execute(
                "SELECT id,date_kind,label,year,date_value,precision,end_year,end_date_value "
                "FROM entity_dates WHERE entity_id=? ORDER BY year, date_value, id",
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
                "EXISTS (SELECT 1 FROM entity_tags et JOIN tags t ON t.id=et.tag_id "
                "WHERE et.entity_id=e.id AND t.normalized=?)"
            )
            args.append(normalize(tag))
        sql = (
            "SELECT e.* FROM entities e"
            + (" WHERE " + " AND ".join(where) if where else "")
            + " ORDER BY e.name COLLATE NOCASE"
        )
        return [self._hydrate(r) for r in self.conn.execute(sql, args).fetchall()]

    def get(self, entity_id: str, include_deleted: bool = True) -> Entity | None:
        entity_id = normalize_uuid(entity_id)
        sql = "SELECT * FROM entities WHERE id=?" + (
            "" if include_deleted else " AND deleted_at IS NULL"
        )
        r = self.conn.execute(sql, (entity_id,)).fetchone()
        return self._hydrate(r) if r else None

    def resolve(self, value: str, include_deleted: bool = True) -> Entity | None:
        try:
            entity = self.get(value, include_deleted=include_deleted)
        except ValueError:
            entity = None
        if entity:
            return entity
        target_id = self.aliases.resolve(value)
        return self.get(target_id, include_deleted=include_deleted) if target_id else None

    def save(
        self, entity: Entity, *, commit: bool = True, preserve_timestamps: bool = False
    ) -> Entity:
        # Normalize IDs at the persistence boundary, including entities created
        # by older callers that bypass the dataclass constructor.
        entity.id = normalize_uuid(entity.id) if entity.id else new_uuid()
        entity.type_id = str(entity.type_id)
        if not self.conn.execute(
            "SELECT 1 FROM entity_types WHERE id=?", (entity.type_id,)
        ).fetchone():
            raise ValueError(f"Unknown entity type: {entity.type_id}")
        if not str(entity.name).strip():
            raise ValueError("Entity name is required")
        now = utc_now()
        entity.updated_at = (entity.updated_at or now) if preserve_timestamps else now
        entity.created_at = entity.created_at or now
        with atomic(self.conn) if commit else nullcontext():
            self.conn.execute(
                """INSERT INTO entities(id,type_id,name,summary,notes,color,remarks,created_at,updated_at,deleted_at)
                   VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                   type_id=excluded.type_id,name=excluded.name,summary=excluded.summary,notes=excluded.notes,
                   color=excluded.color,remarks=excluded.remarks,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at""",
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
            self.fields.validate_values(entity.type_id, entity.custom_fields, allow_unknown=True)
            self.conn.execute("DELETE FROM entity_aliases WHERE entity_id=?", (entity.id,))
            seen_aliases: set[str] = set()
            for raw_alias in entity.aliases:
                alias = str(raw_alias).strip()
                normalized_alias = normalize(alias)
                if not normalized_alias or normalized_alias in seen_aliases:
                    continue
                self.aliases.check_available(alias, entity.id)
                seen_aliases.add(normalized_alias)
                self.conn.execute(
                    "INSERT INTO entity_aliases(entity_id,alias,normalized) VALUES(?,?,?)",
                    (entity.id, alias, normalized_alias),
                )
            self.conn.execute("DELETE FROM entity_tags WHERE entity_id=?", (entity.id,))
            seen_tags: set[str] = set()
            for raw_tag in entity.tags:
                tag = str(raw_tag).strip()
                normalized_tag = normalize(tag)
                if not normalized_tag or normalized_tag in seen_tags:
                    continue
                seen_tags.add(normalized_tag)
                self.conn.execute(
                    "INSERT OR IGNORE INTO tags(name,normalized) VALUES(?,?)", (tag, normalized_tag)
                )
                tag_id = self.conn.execute(
                    "SELECT id FROM tags WHERE normalized=?", (normalized_tag,)
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
                if field is None:
                    # v1 allowed arbitrary custom fields; preserve that behavior
                    # by defining such imported fields as JSON.
                    field_id = new_uuid()
                    self.conn.execute(
                        "INSERT INTO entity_type_fields(id,type_id,name,field_type) VALUES(?,?,?,?)",
                        (field_id, entity.type_id, field_name, "json"),
                    )
                else:
                    field_id = field[0]
                self.conn.execute(
                    "INSERT INTO entity_field_values(entity_id,field_id,value_json) VALUES(?,?,?)",
                    (entity.id, field_id, json.dumps(value, ensure_ascii=False)),
                )
            self.conn.execute("DELETE FROM entity_dates WHERE entity_id=?", (entity.id,))
            date_rows = []
            for raw in entity.dates:
                if isinstance(raw, TimelineDate):
                    data = {
                        "id": raw.id,
                        "entity_id": raw.entity_id,
                        "date_kind": raw.date_kind,
                        "label": raw.label,
                        "year": raw.year,
                        "date_value": raw.date_value,
                        "precision": raw.precision,
                        "end_year": raw.end_year,
                        "end_date_value": raw.end_date_value,
                    }
                else:
                    data = dict(raw)
                precision = data.get("precision") or (
                    "year"
                    if data.get("year") is not None and not data.get("date_value")
                    else "exact"
                )
                precision = normalize_precision(precision)
                validate_date_parts(
                    data.get("year"),
                    data.get("date_value"),
                    precision,
                    data.get("end_year"),
                    data.get("end_date_value"),
                )
                raw_date_id = data.get("id")
                try:
                    date_id = (
                        normalize_uuid(raw_date_id)
                        if raw_date_id
                        else stable_date_id(
                            entity.id,
                            data.get("date_kind", "custom"),
                            data.get("label", ""),
                            data.get("year"),
                            data.get("date_value"),
                            precision,
                            data.get("end_year"),
                            data.get("end_date_value"),
                        )
                    )
                except ValueError:
                    date_id = stable_date_id(
                        entity.id,
                        data.get("date_kind", "custom"),
                        data.get("label", ""),
                        data.get("year"),
                        data.get("date_value"),
                        precision,
                        data.get("end_year"),
                        data.get("end_date_value"),
                    )
                date_rows.append(
                    (
                        date_id,
                        entity.id,
                        data.get("date_kind", "custom"),
                        data.get("label", ""),
                        data.get("year"),
                        data.get("date_value"),
                        precision,
                        data.get("end_year"),
                        data.get("end_date_value"),
                    )
                )
            self.conn.executemany(
                "INSERT INTO entity_dates(id,entity_id,date_kind,label,year,date_value,precision,end_year,end_date_value) VALUES(?,?,?,?,?,?,?,?,?)",
                date_rows,
            )
        return entity

    def soft_delete(self, entity_id: str) -> None:
        entity_id = normalize_uuid(entity_id)
        now = utc_now()
        with self.conn:
            self.conn.execute(
                "UPDATE entities SET deleted_at=?, updated_at=? WHERE id=?", (now, now, entity_id)
            )

    def restore(self, entity_id: str) -> None:
        entity_id = normalize_uuid(entity_id)
        with self.conn:
            self.conn.execute(
                "UPDATE entities SET deleted_at=NULL, updated_at=? WHERE id=?",
                (utc_now(), entity_id),
            )


class RelationRepository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn

    def _check_endpoints(self, source_id: str, target_id: str) -> tuple[str, str]:
        source_id, target_id = normalize_uuid(source_id), normalize_uuid(target_id)
        if not self.conn.execute("SELECT 1 FROM entities WHERE id=?", (source_id,)).fetchone():
            raise ValueError(f"Unknown relation source entity: {source_id}")
        if not self.conn.execute("SELECT 1 FROM entities WHERE id=?", (target_id,)).fetchone():
            raise ValueError(f"Unknown relation target entity: {target_id}")
        return source_id, target_id

    def get(self, relation_id: str) -> Relation | None:
        row = self.conn.execute(
            "SELECT * FROM relations WHERE id=?", (normalize_uuid(relation_id),)
        ).fetchone()
        return Relation(**dict(row)) if row else None

    def create(
        self,
        source_id: str,
        target_id: str,
        label: str,
        reverse_label: str = "",
        notes: str = "",
        id: str | None = None,
    ) -> Relation:
        source_id, target_id = self._check_endpoints(source_id, target_id)
        if not str(label).strip():
            raise ValueError("Relation label is required")
        relation = Relation(
            id or new_uuid(), source_id, target_id, label, reverse_label, notes, utc_now()
        )
        with self.conn:
            self.conn.execute(
                "INSERT INTO relations(id,source_id,target_id,label,reverse_label,notes,created_at) VALUES(?,?,?,?,?,?,?)",
                (
                    relation.id,
                    relation.source_id,
                    relation.target_id,
                    relation.label,
                    relation.reverse_label,
                    relation.notes,
                    relation.created_at,
                ),
            )
        return relation

    def update(
        self,
        relation_id: str,
        *,
        source_id: str | None = None,
        target_id: str | None = None,
        label: str | None = None,
        reverse_label: str | None = None,
        notes: str | None = None,
    ) -> Relation:
        current = self.get(relation_id)
        if current is None:
            raise ValueError(f"Unknown relation: {relation_id}")
        source, target = self._check_endpoints(
            source_id or current.source_id, target_id or current.target_id
        )
        new_label = label if label is not None else current.label
        if not str(new_label).strip():
            raise ValueError("Relation label is required")
        values = (
            source,
            target,
            new_label,
            reverse_label if reverse_label is not None else current.reverse_label,
            notes if notes is not None else current.notes,
            current.id,
        )
        with self.conn:
            self.conn.execute(
                "UPDATE relations SET source_id=?,target_id=?,label=?,reverse_label=?,notes=? WHERE id=?",
                values,
            )
        return self.get(current.id)  # type: ignore[return-value]

    update_relation = update

    def delete(self, relation_id: str) -> None:
        with self.conn:
            self.conn.execute("DELETE FROM relations WHERE id=?", (normalize_uuid(relation_id),))

    def for_entity(self, entity_id: str) -> list[dict[str, Any]]:
        entity_id = normalize_uuid(entity_id)
        rows = self.conn.execute(
            """SELECT r.*, CASE WHEN r.source_id=? THEN 'out' ELSE 'in' END direction,
               CASE WHEN r.source_id=? THEN r.target_id ELSE r.source_id END other_id,
               CASE WHEN r.source_id=? THEN r.label ELSE COALESCE(NULLIF(r.reverse_label,''), r.label) END display_label
               FROM relations r WHERE r.source_id=? OR r.target_id=? ORDER BY r.created_at, r.id""",
            (entity_id, entity_id, entity_id, entity_id, entity_id),
        ).fetchall()
        return [dict(r) for r in rows]


# Backward/forward-compatible descriptive aliases.
RelationRepository.update_relation = RelationRepository.update
