from __future__ import annotations

import sqlite3

import pytest

from aethercod import db
from aethercod.db import connect, initialize, schema_version
from aethercod.models import Entity, new_uuid, validate_date_parts
from aethercod.exchange import read_json
from aethercod.exchange import export_library, import_library
from aethercod.services import ProjectService


def test_future_schema_rejected_without_mutation(tmp_path):
    path = tmp_path / "future.db"
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    conn.execute("INSERT INTO schema_meta VALUES ('version', '99')")
    conn.commit()
    conn.close()
    with pytest.raises(RuntimeError):
        connect(path)
    check = sqlite3.connect(path)
    assert check.execute("SELECT value FROM schema_meta WHERE key='version'").fetchone()[0] == "99"
    assert (
        check.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='entities'"
        ).fetchone()
        is None
    )
    check.close()


def test_tags_and_aliases_are_normalized_and_collisions_rejected(tmp_path):
    conn = connect(tmp_path / "project.db")
    service = ProjectService(conn)
    first = service.new_entity("person")
    first.name = "First"
    first.tags = [" Mage ", "mage"]
    first.aliases = ["Old Name"]
    service.save_entity(first, ["Redirect"])
    assert service.entities.get(first.id).tags == ["Mage"]
    second = service.new_entity("person")
    second.name = "Second"
    with pytest.raises(ValueError):
        service.save_entity(second, [" redirect "])
    assert service.entities.get(second.id) is None
    conn.close()


def test_builtin_field_cannot_be_deleted(tmp_path):
    conn = connect(tmp_path / "project.db")
    service = ProjectService(conn)
    field = next(item for item in service.fields.list("person") if item.name == "中文名")
    with pytest.raises(ValueError):
        service.fields.delete(field.id)
    assert service.fields.get(field.id) is not None
    conn.close()


def test_failed_import_is_atomic(tmp_path):
    source = connect(tmp_path / "source.db")
    service = ProjectService(source)
    entity = service.new_entity("person")
    entity.name = "Historical"
    entity.created_at = "2000-01-01T00:00:00+00:00"
    entity.updated_at = "2001-01-01T00:00:00+00:00"
    service.save_entity(entity)
    payload = export_library(source, format_version=2)
    payload["entities"][0]["dates"] = [{"date_kind": "bad", "precision": "month", "year": 2020}]
    target = connect(tmp_path / "target.db")
    with pytest.raises(ValueError):
        import_library(target, payload)
    assert target.execute("SELECT COUNT(*) FROM entities").fetchone()[0] == 0
    source.close()
    target.close()


def test_v2_import_preserves_timestamps(tmp_path):
    source = connect(tmp_path / "source.db")
    service = ProjectService(source)
    entity = service.new_entity("person")
    entity.name = "Historical"
    entity.created_at = "2000-01-01T00:00:00+00:00"
    entity.updated_at = "2001-01-01T00:00:00+00:00"
    service.save_entity(entity)
    payload = export_library(source, format_version=2)
    target = connect(tmp_path / "target.db")
    import_library(target, payload)
    row = target.execute(
        "SELECT created_at,updated_at FROM entities WHERE id=?", (entity.id,)
    ).fetchone()
    assert tuple(row) == (entity.created_at, entity.updated_at)
    source.close()
    target.close()


def test_reference_and_date_validation(tmp_path):
    conn = connect(tmp_path / "project.db")
    service = ProjectService(conn)
    field = service.fields.create("person", "Related", "entity_ref")
    entity = service.new_entity("person")
    entity.name = "A"
    entity.custom_fields = {field.name: new_uuid()}
    with pytest.raises(ValueError):
        service.save_entity(entity)
    with pytest.raises(ValueError):
        validate_date_parts(2020, "2020-02-30", "day")
    conn.close()


def test_read_json_accepts_bom(tmp_path):
    path = tmp_path / "payload.json"
    path.write_bytes(b'\xef\xbb\xbf{"format_version": 2}')
    assert read_json(path)["format_version"] == 2


def test_migration_failure_rolls_back_ddl_and_data(tmp_path, monkeypatch):
    conn = sqlite3.connect(tmp_path / "legacy.db")
    conn.executescript("""
        CREATE TABLE schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        INSERT INTO schema_meta VALUES ('version', '1');
        CREATE TABLE entity_type_fields (
            id TEXT PRIMARY KEY, type_id TEXT, name TEXT, field_type TEXT, required INTEGER);
        CREATE TABLE entity_dates (
            id TEXT PRIMARY KEY, entity_id TEXT, date_kind TEXT, label TEXT, year INTEGER, date_value TEXT);
    """)
    before = list(conn.iterdump())
    original = db.migrate_v1_to_v2

    def fail_after_migration(connection):
        original(connection)
        raise RuntimeError("injected migration failure")

    monkeypatch.setattr(db, "migrate_v1_to_v2", fail_after_migration)
    with pytest.raises(RuntimeError, match="injected"):
        initialize(conn)
    assert list(conn.iterdump()) == before
    monkeypatch.setattr(db, "migrate_v1_to_v2", original)
    initialize(conn)
    assert schema_version(conn) == 2
    assert "precision" in {row[1] for row in conn.execute("PRAGMA table_info(entity_dates)")}
    conn.close()


def test_initialization_rolls_back_new_schema_on_seed_failure(tmp_path, monkeypatch):
    conn = sqlite3.connect(tmp_path / "new.db")

    def fail(connection):
        raise RuntimeError("seed failure")

    monkeypatch.setattr(db, "_seed_builtin_fields", fail)
    with pytest.raises(RuntimeError):
        initialize(conn)
    assert not list(conn.execute("SELECT name FROM sqlite_master"))
    conn.close()


def test_legacy_builtin_seed_preserves_id_and_values(project):
    conn, service = project
    field = next(f for f in service.fields.list("person") if f.name == "中文名")
    legacy_id = new_uuid()
    conn.execute("UPDATE entity_type_fields SET id=? WHERE id=?", (legacy_id, field.id))
    conn.commit()
    entity = Entity(new_uuid(), "person", "A", custom_fields={"中文名": "kept"})
    service.save_entity(entity)
    initialize(conn)
    initialize(conn)
    matching = [f for f in service.fields.list("person") if f.name == "中文名"]
    assert len(matching) == 1 and matching[0].id == legacy_id
    with pytest.raises(ValueError):
        service.fields.delete(legacy_id)
    assert service.entities.get(entity.id).custom_fields["中文名"] == "kept"


def test_service_save_rolls_back_all_children_and_retains_redirects(project):
    conn, service = project
    first = service.save_entity(Entity(new_uuid(), "person", "A", tags=["old"]), ["Old"])
    second = service.save_entity(Entity(new_uuid(), "person", "B"), ["Taken"])
    before = export_library(conn)
    first.name = "changed"
    first.tags = ["new"]
    first.aliases = ["new alias"]
    first.dates = [{"date_kind": "birth", "year": -42}]
    with pytest.raises(ValueError):
        service.save_entity(first, ["fresh", "taken"])
    assert export_library(conn) == before
    assert service.aliases.resolve("taken") == second.id
    service.save_entity(service.entities.get(first.id), None)
    assert service.aliases.resolve("old") == first.id
    original = service.aliases.list(first.id)[0]
    service.save_entity(service.entities.get(first.id), [" OLD ", "old"])
    assert service.aliases.list(first.id) == [original]
    service.save_entity(service.entities.get(first.id), [])
    assert service.aliases.list(first.id) == []


@pytest.mark.parametrize("alias", ["Taken", " taken ", "TAKEN"])
def test_redirect_never_reassigns_normalized_alias(project, alias):
    conn, service = project
    first = service.save_entity(Entity(new_uuid(), "person", "A"))
    second = service.save_entity(Entity(new_uuid(), "person", "B"))
    original = service.aliases.add_redirect("Taken", first.id, "2000")
    assert service.aliases.add_redirect(alias, first.id) == original
    with pytest.raises(ValueError):
        service.aliases.add_redirect(alias, second.id)
    assert service.aliases.resolve(alias) == first.id
    second.aliases = [alias]
    with pytest.raises(ValueError):
        service.save_entity(second)


@pytest.mark.parametrize(
    "field_type",
    ["entity", "entity_ref", "entity_reference", "entity_refs", "entity_list", "multi_entity"],
)
def test_reference_types_validate_existence_and_shapes(project, field_type):
    conn, service = project
    field = service.fields.create("person", "Ref", field_type)
    target = service.save_entity(Entity(new_uuid(), "person", "Target"))
    multiple = field_type in {"entity_refs", "entity_list", "multi_entity"}
    valid = [target.id] if multiple else target.id
    missing = [new_uuid()] if multiple else new_uuid()
    service.fields.validate_value(field, valid)
    for invalid in (missing, [42] if multiple else 42, "bad" if multiple else []):
        with pytest.raises(ValueError):
            service.fields.validate_value(field, invalid)
    with pytest.raises(ValueError):
        service.fields.update(field.id, default_value=missing, set_default=True)


@pytest.mark.parametrize(
    "parts",
    [
        (True, None, "year"),
        (2020, False, "exact"),
        (2020, "2021-01-01", "day"),
        (None, "2020-13", "month"),
        (None, "1900-02-29", "day"),
        (None, "nonsense", "exact"),
        (2020, None, "month"),
        (2020, None, "range"),
        (2020, "2020-06-01", "range", 2020, "2020-05-31"),
        (None, "2020-06", "range", None, "2019-12"),
    ],
)
def test_invalid_dates_are_rejected(parts):
    with pytest.raises(ValueError):
        validate_date_parts(*parts)


@pytest.mark.parametrize(
    "parts",
    [
        (-42, None, "year"),
        (-42, "-000042-02-28", "day"),
        (12000, "+012000-02-29", "day"),
        (None, "2000-02-29", "exact"),
        (2020, "2020-01", "range", 2020, "2020-02"),
    ],
)
def test_valid_signed_and_partial_dates(parts):
    validate_date_parts(*parts)


def test_import_and_service_preserve_caller_transaction(project):
    conn, service = project
    original_name = conn.execute("SELECT value FROM project_meta WHERE key='name'").fetchone()[0]
    conn.execute("UPDATE project_meta SET value='pending' WHERE key='name'")
    entity = Entity(new_uuid(), "person", "Pending")
    service.save_entity(entity, ["Pending alias"])
    import_library(conn, {"format_version": 2, "project": {"description": "imported"}})
    assert conn.in_transaction
    conn.rollback()
    assert service.entities.get(entity.id) is None
    assert (
        conn.execute("SELECT value FROM project_meta WHERE key='name'").fetchone()[0]
        == original_name
    )
    assert (
        conn.execute("SELECT value FROM project_meta WHERE key='description'").fetchone()[0] == ""
    )
    conn.execute("UPDATE project_meta SET value='still pending' WHERE key='name'")
    with pytest.raises(ValueError):
        import_library(
            conn,
            {
                "project": {"name": "bad"},
                "alias_redirects": [{"alias": "x", "entity_id": new_uuid()}],
            },
        )
    assert conn.in_transaction
    assert (
        conn.execute("SELECT value FROM project_meta WHERE key='name'").fetchone()[0]
        == "still pending"
    )
    conn.rollback()


def test_default_v2_round_trip_preserves_references_metadata_and_timestamps(project, tmp_path):
    conn, service = project
    kind = service.taxonomy.create_type("Custom", "C")
    first = service.save_entity(Entity(new_uuid(), kind.id, "A"))
    second = service.save_entity(Entity(new_uuid(), kind.id, "B"))
    service.fields.create(
        kind.id, "Peer", "entity_ref", description="Reference", default_value=second.id
    )
    service.fields.create(kind.id, "Flag", "boolean", default_value=False)
    first.custom_fields = {"Peer": second.id, "Flag": False}
    second.custom_fields = {"Peer": first.id}
    first.dates = [{"date_kind": "birth", "year": -42, "precision": "y"}]
    service.save_entity(first, ["  Ancient Name  "])
    service.save_entity(second)
    service.new_relation(first.id, second.id, "knows")
    conn.execute("UPDATE entities SET created_at='2000',updated_at='2001' WHERE id=?", (first.id,))
    conn.execute("UPDATE alias_redirects SET created_at='1999'")
    conn.commit()
    payload = export_library(conn)
    assert payload["format_version"] == 2
    assert export_library(conn, format_version=1)["format_version"] == 1
    assert payload["entities"][0]["dates"][0]["precision"] == "year"
    target = connect(tmp_path / "roundtrip.db")
    try:
        import_library(target, payload)
        assert not target.in_transaction
        assert export_library(target) == payload
        import_library(target, payload)
        assert export_library(target) == payload
    finally:
        target.close()


def test_import_redirect_collision_rolls_back_and_ignores_supplied_normalized(project):
    conn, service = project
    first = service.save_entity(Entity(new_uuid(), "person", "A"), ["Taken"])
    second = service.save_entity(Entity(new_uuid(), "person", "B"))
    before = export_library(conn)
    with pytest.raises(ValueError):
        import_library(
            conn,
            {
                "project": {"name": "changed"},
                "alias_redirects": [
                    {"alias": " taken ", "normalized": "fake", "entity_id": second.id}
                ],
            },
        )
    assert export_library(conn) == before
    import_library(
        conn,
        {"alias_redirects": [{"alias": "New Name", "normalized": "fake", "entity_id": first.id}]},
    )
    assert service.aliases.resolve("new name") == first.id
    assert service.aliases.resolve("fake") is None


def test_project_service_writable_guard(project):
    conn, writable_service = project
    entity = writable_service.save_entity(Entity(new_uuid(), "person", "A"))
    service = ProjectService(conn, writable=False)
    with pytest.raises(PermissionError):
        service.new_entity("person")
    with pytest.raises(PermissionError):
        service.save_entity(entity, [])
    with pytest.raises(PermissionError):
        service.new_relation(entity.id, entity.id, "self")
    assert service.entities.get(entity.id).name == "A"
