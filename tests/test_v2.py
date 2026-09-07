from __future__ import annotations

import sqlite3

import pytest

from aethercod.db import connect, schema_version
from aethercod.models import is_valid_uuid, normalize_uuid


def make_entity(service, type_id, name, **kwargs):
    entity = service.new_entity(type_id)
    entity.name = name
    for key, value in kwargs.items():
        setattr(entity, key, value)
    return service.entities.save(entity)


def test_uuid_policy_accepts_hyphens_and_normalizes():
    raw = "123e4567-e89b-12d3-a456-426614174000"
    assert normalize_uuid(raw) == raw.replace("-", "")
    assert is_valid_uuid(raw)
    with pytest.raises(ValueError):
        normalize_uuid("not-a-uuid")


def test_new_database_seeds_v2_and_builtin_fields(project):
    conn, service = project
    assert schema_version(conn) == 2
    assert {item.id for item in service.taxonomy.list_types()} >= {"person", "polity", "place"}
    assert {field.name for field in service.fields.list("person")} >= {"中文名", "英文名", "称号"}


def test_custom_field_crud_and_typed_validation(project):
    conn, service = project
    field = service.fields.create("person", "等级", "integer", required=True)
    person = make_entity(service, "person", "莉亚", custom_fields={"等级": 7})
    assert service.entities.get(person.id).custom_fields["等级"] == 7
    with pytest.raises(ValueError):
        service.fields.validate_value(field, "七")
    service.fields.update(field.id, description="角色等级")
    assert service.fields.get(field.id).description == "角色等级"
    service.fields.delete(field.id)
    assert service.fields.get(field.id) is None


def test_alias_redirect_and_stable_date_id(project):
    conn, service = project
    person = make_entity(
        service, "person", "艾琳", dates=[{"date_kind": "birth", "year": -42, "precision": "year"}]
    )
    service.aliases.add_redirect("旧王女", person.id)
    assert service.search.resolve("旧王女").id == person.id
    assert service.search.search("旧王女")[0].id == person.id
    original = service.entities.get(person.id).dates[0]["id"]
    service.entities.save(service.entities.get(person.id))
    assert service.entities.get(person.id).dates[0]["id"] == original
    service.aliases.remove_redirect("旧王女")
    assert service.search.resolve("旧王女") is None


def test_relation_update_preserves_endpoints(project):
    conn, service = project
    first = make_entity(service, "person", "甲")
    second = make_entity(service, "person", "乙")
    relation = service.relations.create(first.id, second.id, "结盟", "结盟")
    service.relations.update(relation.id, label="敌对")
    loaded = service.relations.get(relation.id)
    assert loaded.label == "敌对"
    assert loaded.source_id == first.id and loaded.target_id == second.id


def test_v1_database_migrates_without_losing_rows(tmp_path):
    path = tmp_path / "legacy.aethercod"
    conn = sqlite3.connect(path)
    conn.executescript("""
        CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE project_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE entity_types (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, icon TEXT NOT NULL, is_builtin INTEGER NOT NULL);
        CREATE TABLE entities (id TEXT PRIMARY KEY, type_id TEXT NOT NULL, name TEXT NOT NULL, summary TEXT NOT NULL, notes TEXT NOT NULL, color TEXT NOT NULL, remarks TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
        CREATE TABLE entity_aliases (entity_id TEXT NOT NULL, alias TEXT NOT NULL, normalized TEXT NOT NULL, PRIMARY KEY(entity_id, alias));
        CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, normalized TEXT NOT NULL UNIQUE);
        CREATE TABLE entity_tags (entity_id TEXT NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY(entity_id, tag_id));
        CREATE TABLE entity_type_fields (id TEXT PRIMARY KEY, type_id TEXT NOT NULL, name TEXT NOT NULL, field_type TEXT NOT NULL, required INTEGER NOT NULL);
        CREATE TABLE entity_field_values (entity_id TEXT NOT NULL, field_id TEXT NOT NULL, value_json TEXT NOT NULL, PRIMARY KEY(entity_id, field_id));
        CREATE TABLE relations (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, target_id TEXT NOT NULL, label TEXT NOT NULL, reverse_label TEXT NOT NULL, notes TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE entity_dates (id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, date_kind TEXT NOT NULL, label TEXT NOT NULL, year INTEGER, date_value TEXT);
        INSERT INTO schema_meta VALUES ('version', '1');
        INSERT INTO entity_types VALUES ('person', '人物', '♙', 1);
        INSERT INTO entities VALUES ('123e4567e89b12d3a456426614174000', 'person', '旧人物', '', '', '#7c3aed', '', '2024', '2024', NULL);
        """)
    conn.commit()
    conn.close()
    upgraded = connect(path)
    try:
        assert schema_version(upgraded) == 2
        assert upgraded.execute("SELECT name FROM entities").fetchone()[0] == "旧人物"
        assert upgraded.execute("SELECT 1 FROM alias_redirects").fetchone() is None
    finally:
        upgraded.close()
