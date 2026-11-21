from __future__ import annotations

import sqlite3

import pytest

from aethercod.db import BUILTIN_FIELDS, connect, schema_version
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


def test_new_database_seeds_current_schema_and_builtin_fields(project):
    conn, service = project
    assert schema_version(conn) == 5
    assert {item.id for item in service.taxonomy.list_types()} >= {"person", "polity", "place"}
    assert {field.name for field in service.fields.list("person")} >= {"中文名", "英文名", "称号"}


def test_polity_and_place_templates_exclude_generic_fields():
    polity_names = {field[0] for field in BUILTIN_FIELDS["polity"]}
    place_names = {field[0] for field in BUILTIN_FIELDS["place"]}
    assert not {"正式名称", "定位/身份", "核心特征"} & polity_names
    assert not {"正式名称", "定位/身份", "核心特征", "地位", "面积"} & place_names
    category = next(field for field in BUILTIN_FIELDS["place"] if field[0] == "地点类别")
    assert category[2] is True


def test_v3_database_migrates_favorite_and_graph_layout_without_losing_place_rows(tmp_path):
    path = tmp_path / "v3-library.aethercod"
    legacy = sqlite3.connect(path)
    legacy.executescript(
        """
        CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO schema_meta VALUES ('version', '3');
        CREATE TABLE entity_types (
            id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, icon TEXT NOT NULL, is_builtin INTEGER NOT NULL);
        CREATE TABLE entities (
            id TEXT PRIMARY KEY, type_id TEXT NOT NULL, name TEXT NOT NULL,
            summary TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
            color TEXT NOT NULL DEFAULT '#7c3aed', remarks TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
        CREATE TABLE entity_type_fields (
            id TEXT PRIMARY KEY, type_id TEXT NOT NULL, name TEXT NOT NULL,
            field_type TEXT NOT NULL, required INTEGER NOT NULL,
            description TEXT NOT NULL DEFAULT '', options_json TEXT NOT NULL DEFAULT '[]', default_json TEXT);
        CREATE TABLE entity_field_values (
            entity_id TEXT NOT NULL, field_id TEXT NOT NULL, value_json TEXT NOT NULL,
            PRIMARY KEY(entity_id,field_id));
        INSERT INTO entity_types VALUES ('place', '地区/地点', '⌂', 1);
        INSERT INTO entities VALUES (
            '123e4567e89b12d3a456426614174000', 'place', '旧地区', '', '',
            '#7c3aed', '', '2024', '2024', NULL);
        INSERT INTO entity_type_fields VALUES (
            '123e4567e89b12d3a456426614174001', 'place', '地点类别', 'choice', 0, '', '[]', NULL);
        """
    )
    legacy.commit()
    legacy.close()

    migrated = connect(path)
    try:
        assert schema_version(migrated) == 5
        assert migrated.execute(
            "SELECT is_favorite FROM entities WHERE id='123e4567e89b12d3a456426614174000'"
        ).fetchone()[0] == 0
        assert migrated.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='entity_graph_positions'"
        ).fetchone()
        category = migrated.execute(
            "SELECT value_json FROM entity_field_values WHERE entity_id=?",
            ('123e4567e89b12d3a456426614174000',),
        ).fetchone()
        assert category[0] == '"其他"'
        assert migrated.execute(
            "SELECT required FROM entity_type_fields WHERE type_id='place' AND name='地点类别'"
        ).fetchone()[0] == 1
    finally:
        migrated.close()


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
        assert schema_version(upgraded) == 5
        assert upgraded.execute("SELECT name FROM entities").fetchone()[0] == "旧人物"
        assert upgraded.execute("SELECT 1 FROM alias_redirects").fetchone() is None
    finally:
        upgraded.close()


def test_v2_date_migration_adds_description_without_changing_existing_dates(tmp_path):
    path = tmp_path / "v2-project.aethercod"
    conn = sqlite3.connect(path)
    conn.executescript("""
        CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE project_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE entity_types (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, icon TEXT NOT NULL, is_builtin INTEGER NOT NULL);
        CREATE TABLE entities (id TEXT PRIMARY KEY, type_id TEXT NOT NULL, name TEXT NOT NULL, summary TEXT NOT NULL, notes TEXT NOT NULL, color TEXT NOT NULL, remarks TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
        CREATE TABLE entity_dates (id TEXT PRIMARY KEY, entity_id TEXT NOT NULL, date_kind TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', year INTEGER, date_value TEXT, precision TEXT NOT NULL DEFAULT 'exact', end_year INTEGER, end_date_value TEXT);
        INSERT INTO schema_meta VALUES ('version', '2');
        INSERT INTO project_meta VALUES ('name', '旧资料库');
        INSERT INTO entity_types VALUES ('person', '人物', '♙', 1);
        INSERT INTO entities VALUES ('123e4567e89b12d3a456426614174000', 'person', '旧词条', '', '', '#7c3aed', '', '2024', '2024', NULL);
        INSERT INTO entity_dates(id,entity_id,date_kind,label,year,precision) VALUES ('123e4567e89b12d3a456426614174001','123e4567e89b12d3a456426614174000','custom','旧事件',42,'year');
    """)
    conn.commit()
    conn.close()

    upgraded = connect(path)
    try:
        assert schema_version(upgraded) == 5
        row = upgraded.execute("SELECT label,year,description FROM entity_dates").fetchone()
        assert tuple(row) == ("旧事件", 42, "")
    finally:
        upgraded.close()
