from __future__ import annotations

import json
import sqlite3
import uuid
from pathlib import Path

SCHEMA_VERSION = 2
BUILTIN_TYPES = [
    ("person", "人物", "♙"),
    ("polity", "国家/政权", "♜"),
    ("place", "地区/地点", "⌂"),
    ("organization", "机构/组织", "♧"),
    ("branch", "部分/分支", "⑂"),
    ("event", "事件", "◈"),
    ("item", "物品", "◇"),
    ("species", "种族", "✧"),
    ("concept", "概念/魔法", "∞"),
]
BUILTIN_FIELD_NAMESPACE = uuid.UUID("caec4156-148d-4339-8f42-8a81113d85a9")
BUILTIN_FIELDS = {
    "person": [
        ("中文名", "text", False, []),
        ("英文名", "text", False, []),
        ("称号", "text", False, []),
        ("性别/代词", "text", False, []),
        ("种族", "text", False, []),
    ],
    "polity": [
        ("正式名称", "text", False, []),
        ("英文名", "text", False, []),
        (
            "制度",
            "choice",
            False,
            ["帝国", "王国", "共和国", "公国", "城邦", "联盟", "神权国", "其他"],
        ),
        ("面积", "text", False, []),
        ("人口", "integer", False, []),
        ("地理概述", "textarea", False, []),
        ("文化与经济", "textarea", False, []),
    ],
    "place": [
        ("正式名称", "text", False, []),
        ("英文名", "text", False, []),
        (
            "地点类别",
            "choice",
            False,
            ["大陆", "国家辖区", "行省", "城市", "村镇", "遗迹", "自然地貌", "其他"],
        ),
        ("地位", "text", False, []),
        ("面积", "text", False, []),
        ("人口", "integer", False, []),
        ("地理概述", "textarea", False, []),
        ("经济文化与特色", "textarea", False, []),
    ],
    "organization": [("宗旨", "textarea", False, []), ("职能", "textarea", False, [])],
    "branch": [("职能", "textarea", False, []), ("规模", "integer", False, [])],
    "event": [
        ("前因", "textarea", False, []),
        ("经过", "textarea", False, []),
        ("结果", "textarea", False, []),
    ],
    "item": [
        ("类别", "text", False, []),
        ("材料", "text", False, []),
        ("能力", "textarea", False, []),
        ("历史", "textarea", False, []),
    ],
    "species": [
        ("寿命", "text", False, []),
        ("生理特征", "textarea", False, []),
        ("文化特征", "textarea", False, []),
    ],
    "concept": [
        ("体系/流派", "text", False, []),
        ("规则", "textarea", False, []),
        ("代价", "textarea", False, []),
    ],
}

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS project_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS entity_types (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, icon TEXT NOT NULL DEFAULT '✦', is_builtin INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY, type_id TEXT NOT NULL REFERENCES entity_types(id), name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '#7c3aed',
  remarks TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS entity_aliases (
  entity_id TEXT NOT NULL REFERENCES entities(id), alias TEXT NOT NULL, normalized TEXT NOT NULL,
  PRIMARY KEY (entity_id, alias)
);
CREATE TABLE IF NOT EXISTS alias_redirects (
  alias TEXT PRIMARY KEY, normalized TEXT NOT NULL UNIQUE,
  entity_id TEXT NOT NULL REFERENCES entities(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, normalized TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS entity_tags (entity_id TEXT NOT NULL REFERENCES entities(id), tag_id INTEGER NOT NULL REFERENCES tags(id), PRIMARY KEY (entity_id, tag_id));
CREATE TABLE IF NOT EXISTS entity_type_fields (
  id TEXT PRIMARY KEY, type_id TEXT NOT NULL REFERENCES entity_types(id), name TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text', required INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '', options_json TEXT NOT NULL DEFAULT '[]', default_json TEXT
);
CREATE TABLE IF NOT EXISTS entity_field_values (
  entity_id TEXT NOT NULL REFERENCES entities(id), field_id TEXT NOT NULL REFERENCES entity_type_fields(id),
  value_json TEXT NOT NULL, PRIMARY KEY (entity_id, field_id)
);
CREATE TABLE IF NOT EXISTS relations (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL, target_id TEXT NOT NULL, label TEXT NOT NULL,
  reverse_label TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS entity_dates (
  id TEXT PRIMARY KEY, entity_id TEXT NOT NULL REFERENCES entities(id), date_kind TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '', year INTEGER, date_value TEXT, precision TEXT NOT NULL DEFAULT 'exact',
  end_year INTEGER, end_date_value TEXT
);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type_id);
CREATE INDEX IF NOT EXISTS idx_rel_source ON relations(source_id);
CREATE INDEX IF NOT EXISTS idx_rel_target ON relations(target_id);
CREATE INDEX IF NOT EXISTS idx_alias_redirects_normalized ON alias_redirects(normalized);
CREATE INDEX IF NOT EXISTS idx_dates_start ON entity_dates(year, date_value);
"""


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    return bool(
        conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
        ).fetchone()
    )


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def _add_column(conn: sqlite3.Connection, table: str, definition: str) -> None:
    name = definition.split()[0]
    if name not in _columns(conn, table):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {definition}")


def migrate_v1_to_v2(conn: sqlite3.Connection) -> None:
    """Upgrade an existing v1 database in place, preserving all user rows."""
    # SCHEMA_SQL creates new tables, but ALTER is needed for tables that already
    # existed in v1. SQLite cannot add a NOT NULL column without a constant default.
    _add_column(conn, "entity_type_fields", "description TEXT NOT NULL DEFAULT ''")
    _add_column(conn, "entity_type_fields", "options_json TEXT NOT NULL DEFAULT '[]'")
    _add_column(conn, "entity_type_fields", "default_json TEXT")
    _add_column(conn, "entity_dates", "precision TEXT NOT NULL DEFAULT 'exact'")
    _add_column(conn, "entity_dates", "end_year INTEGER")
    _add_column(conn, "entity_dates", "end_date_value TEXT")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS alias_redirects ("
        "alias TEXT PRIMARY KEY, normalized TEXT NOT NULL UNIQUE, "
        "entity_id TEXT NOT NULL REFERENCES entities(id), created_at TEXT NOT NULL)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_alias_redirects_normalized ON alias_redirects(normalized)"
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_dates_start ON entity_dates(year, date_value)")
    conn.execute(
        "UPDATE entity_dates SET precision='year' WHERE precision='exact' AND year IS NOT NULL AND date_value IS NULL"
    )
    conn.execute("INSERT OR IGNORE INTO schema_meta(key, value) VALUES('migrated_from', '1')")


def connect(path: str | Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        initialize(conn)
        conn.execute("PRAGMA journal_mode = WAL")
    except Exception:
        conn.close()
        raise
    return conn


def initialize(conn: sqlite3.Connection) -> None:
    # Read the marker before running any DDL.  executescript() commits implicitly,
    # so running it first could mutate a database we are about to reject.
    marker_exists = _table_exists(conn, "schema_meta")
    row = (
        conn.execute("SELECT value FROM schema_meta WHERE key='version'").fetchone()
        if marker_exists
        else None
    )
    had_entities = _table_exists(conn, "entities")
    version = int(row[0]) if row and str(row[0]).isdigit() else (1 if had_entities else 0)
    if version > SCHEMA_VERSION:
        raise RuntimeError(
            f"Database schema version {version} is newer than supported {SCHEMA_VERSION}"
        )
    conn.execute("SAVEPOINT aethercod_initialize")
    try:
        # Execute statements individually: executescript() would commit the
        # caller's transaction and make DDL impossible to roll back.
        for statement in SCHEMA_SQL.split(";"):
            if statement.strip():
                conn.execute(statement)
        if version < 2:
            migrate_v1_to_v2(conn)
        conn.execute(
            "INSERT INTO schema_meta(key,value) VALUES('version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (str(SCHEMA_VERSION),),
        )
        conn.executemany(
            "INSERT OR IGNORE INTO entity_types(id,name,icon,is_builtin) VALUES(?,?,?,?)",
            [item + (1,) for item in BUILTIN_TYPES],
        )
        _seed_builtin_fields(conn)
        conn.execute(
            "INSERT OR IGNORE INTO project_meta(key,value) VALUES('name','Untitled World')"
        )
        conn.execute("INSERT OR IGNORE INTO project_meta(key,value) VALUES('description','')")
        conn.execute("RELEASE SAVEPOINT aethercod_initialize")
    except Exception:
        conn.execute("ROLLBACK TO SAVEPOINT aethercod_initialize")
        conn.execute("RELEASE SAVEPOINT aethercod_initialize")
        raise


def is_builtin_field(field_id: str, type_id: str, name: str) -> bool:
    # Legacy templates used random IDs. Protect these by their template name,
    # and protect stable IDs even when their display name has been edited.
    return any(
        name == definition[0]
        or field_id == uuid.uuid5(BUILTIN_FIELD_NAMESPACE, f"{type_id}:{definition[0]}").hex
        for definition in BUILTIN_FIELDS.get(type_id, [])
    )


def _seed_builtin_fields(conn: sqlite3.Connection) -> None:
    """Create stable field definitions for built-in entity templates."""
    for type_id, definitions in BUILTIN_FIELDS.items():
        for name, field_type, required, options in definitions:
            field_id = uuid.uuid5(BUILTIN_FIELD_NAMESPACE, f"{type_id}:{name}").hex
            if conn.execute(
                "SELECT 1 FROM entity_type_fields WHERE type_id=? AND name=?",
                (type_id, name),
            ).fetchone():
                continue
            conn.execute(
                """INSERT OR IGNORE INTO entity_type_fields
                   (id, type_id, name, field_type, required, options_json)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    field_id,
                    type_id,
                    name,
                    field_type,
                    int(required),
                    json.dumps(options, ensure_ascii=False),
                ),
            )


def schema_version(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT value FROM schema_meta WHERE key='version'").fetchone()
    return int(row[0]) if row else 0
