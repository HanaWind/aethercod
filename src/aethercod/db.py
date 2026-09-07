from __future__ import annotations

import sqlite3
from pathlib import Path

SCHEMA_VERSION = 1
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
CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, normalized TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS entity_tags (entity_id TEXT NOT NULL REFERENCES entities(id), tag_id INTEGER NOT NULL REFERENCES tags(id), PRIMARY KEY (entity_id, tag_id));
CREATE TABLE IF NOT EXISTS entity_type_fields (
  id TEXT PRIMARY KEY, type_id TEXT NOT NULL REFERENCES entity_types(id), name TEXT NOT NULL, field_type TEXT NOT NULL DEFAULT 'text', required INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS entity_field_values (entity_id TEXT NOT NULL REFERENCES entities(id), field_id TEXT NOT NULL REFERENCES entity_type_fields(id), value_json TEXT NOT NULL, PRIMARY KEY (entity_id, field_id));
CREATE TABLE IF NOT EXISTS relations (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL, target_id TEXT NOT NULL, label TEXT NOT NULL,
  reverse_label TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS entity_dates (
  id TEXT PRIMARY KEY, entity_id TEXT NOT NULL REFERENCES entities(id), date_kind TEXT NOT NULL, label TEXT NOT NULL DEFAULT '',
  year INTEGER, date_value TEXT
);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type_id);
CREATE INDEX IF NOT EXISTS idx_rel_source ON relations(source_id);
CREATE INDEX IF NOT EXISTS idx_rel_target ON relations(target_id);
"""


def connect(path: str | Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    initialize(conn)
    return conn


def initialize(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_SQL)
    conn.execute(
        "INSERT OR REPLACE INTO schema_meta(key, value) VALUES('version', ?)",
        (str(SCHEMA_VERSION),),
    )
    conn.executemany(
        "INSERT OR IGNORE INTO entity_types(id, name, icon, is_builtin) VALUES(?, ?, ?, 1)",
        BUILTIN_TYPES,
    )
    conn.execute("INSERT OR IGNORE INTO project_meta(key, value) VALUES('name', 'Untitled World')")
    conn.execute("INSERT OR IGNORE INTO project_meta(key, value) VALUES('description', '')")
    conn.commit()
