from __future__ import annotations

from aethercod.exchange import export_entity, export_library, import_library


def make_entity(service, type_id, name, **kwargs):
    entity = service.new_entity(type_id)
    entity.name = name
    for key, value in kwargs.items():
        setattr(entity, key, value)
    return service.entities.save(entity)


def test_schema_and_entity_metadata_round_trip(project):
    conn, service = project
    type_id = service.taxonomy.list_types()[0].id
    entity = make_entity(
        service,
        type_id,
        "阿尔卡",
        aliases=["首席法师"],
        tags=["法师", "核心"],
        custom_fields={"阵营": "中立"},
        dates=[{"date_kind": "timeline", "year": 120}],
    )
    loaded = service.entities.get(entity.id)
    assert loaded.name == "阿尔卡"
    assert loaded.aliases == ["首席法师"]
    assert set(loaded.tags) == {"法师", "核心"}
    assert loaded.custom_fields == {"阵营": "中立"}
    assert loaded.dates[0]["year"] == 120
    assert service.search.search("首席")[0].id == entity.id


def test_relations_reverse_lookup_and_deleted_validation(project):
    conn, service = project
    type_id = service.taxonomy.list_types()[0].id
    first = make_entity(service, type_id, "王城")
    second = make_entity(service, type_id, "守门人")
    relation = service.relations.create(first.id, second.id, "驻守", "被驻守")
    assert service.relation_rows(second.id)[0]["display_label"] == "被驻守"
    service.entities.soft_delete(first.id)
    assert any(issue.kind == "deleted_relation_target" for issue in service.validation.scan())
    assert relation.id


def test_json_full_and_single_entity_import(project, tmp_path):
    conn, service = project
    type_id = service.taxonomy.list_types()[0].id
    entity = make_entity(service, type_id, "星门", notes="连接 [[missing-id]]")
    full = export_library(conn)
    assert full["format_version"] == 2 and len(full["entities"]) == 1
    single = export_entity(conn, entity.id)
    other_conn = __import__("aethercod.db", fromlist=["connect"]).connect(
        tmp_path / "other.aethercod"
    )
    try:
        result = import_library(other_conn, single)
        assert result["entities"] == 1
        assert other_conn.execute("SELECT name FROM entities").fetchone()[0] == "星门"
    finally:
        other_conn.close()
    assert any(issue.kind == "missing_wikilink" for issue in service.validation.scan())
