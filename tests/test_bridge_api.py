from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

import pytest

from aethercod.ui.bridge_api import BridgeAPI


def test_bridge_window_control_toggles_maximize():
    class EventHook:
        def __init__(self):
            self.callbacks = []

        def __iadd__(self, callback):
            self.callbacks.append(callback)
            return self

    class WindowEvents:
        def __init__(self):
            self.maximized = EventHook()
            self.restored = EventHook()

    class FakeWindow:
        def __init__(self):
            self.actions = []
            self.maximized = False
            self.events = WindowEvents()

        def maximize(self):
            self.actions.append("maximize")

        def restore(self):
            self.actions.append("restore")

    api = BridgeAPI()
    window = FakeWindow()
    api.bind_window(window)

    api.window_action("maximize")
    api.window_action("maximize")
    window.events.maximized.callbacks[0](window)
    window.events.restored.callbacks[0](window)

    assert window.actions == ["maximize", "restore"]
    assert api._maximized is False


def test_bridge_creates_project_and_round_trips_entities(tmp_path):
    api = BridgeAPI()
    state = api.create_project(
        str(tmp_path / "bridge.aethercod"),
        "星环世界",
        "星历",
        "作者",
        "桥接测试",
    )

    assert state["project"]["name"] == "星环世界"
    assert state["project"]["era_name"] == "星历"
    assert state["writable"] is True
    person_type = next(item for item in state["types"] if item["id"] == "person")

    first = api.create_entity(person_type["id"])
    first.update(
        {
            "name": "艾琳",
            "summary": "北境的守望者",
            "aliases": ["霜冠"],
            "tags": ["人物", "北境"],
            "custom_fields": {"中文名": "艾琳"},
            "dates": [{"date_kind": "birth", "label": "诞生", "year": 125}],
        }
    )
    saved_first = api.save_entity(first)
    second = api.create_entity(person_type["id"])
    second["name"] = "雾松堡"
    second["notes"] = f"[[{saved_first['id']}|艾琳]]"
    saved_second = api.save_entity(second)
    assert api.resolve_entity("霜冠")["id"] == saved_first["id"]

    relation = api.save_relation(
        {
            "source_id": saved_first["id"],
            "target_id": saved_second["id"],
            "label": "守护",
            "reverse_label": "由其守护",
        }
    )
    details = api.get_entity(saved_first["id"])

    assert details is not None
    assert details["aliases"] == ["霜冠"]
    assert details["tags"] == ["人物", "北境"]
    assert details["custom_fields"]["中文名"] == "艾琳"
    assert details["dates"][0]["year"] == 125
    assert details["relations"][0]["other_name"] == "雾松堡"
    assert details["backlinks"] == [
        {"id": saved_second["id"], "name": "雾松堡", "color": "#7c3aed"}
    ]
    assert api.get_timeline(saved_first["id"])[0]["year"] == 125
    assert api.get_history(saved_first["id"])[0]["change_type"] == "create"
    assert relation["label"] == "守护"
    with ThreadPoolExecutor(max_workers=1) as executor:
        assert executor.submit(api.list_types).result()

    closed = api.close_project()
    assert closed["project"] is None
    assert closed["entities"] == []
    reopened = api.open_project(state["project"]["path"])
    assert reopened["project"]["name"] == "星环世界"
    assert len(reopened["entities"]) == 2
    api.close_project()


def test_bridge_rejects_existing_project_path(tmp_path):
    path = tmp_path / "existing.aethercod"
    path.write_text("keep", encoding="utf-8")
    api = BridgeAPI()

    try:
        api.create_project(str(path), "重复", "纪年")
    except FileExistsError:
        pass
    else:
        raise AssertionError("expected an existing project path to be rejected")

    assert path.read_text(encoding="utf-8") == "keep"


def test_bridge_manages_types_fields_graph_and_read_only_mode(tmp_path):
    api = BridgeAPI()
    api.create_project(str(tmp_path / "management.aethercod"), "管理", "纪年")
    entity_type = api.create_type("秘术", "✧")
    assert api.update_type(entity_type["id"], "秘法")["name"] == "秘法"
    field = api.save_field(
        {
            "type_id": entity_type["id"],
            "name": "代价",
            "field_type": "text",
            "required": True,
            "description": "施术的负担",
            "options": [],
        }
    )
    entity = api.create_entity(entity_type["id"])
    entity.update({"name": "回声术", "custom_fields": {"代价": "记忆"}})
    saved = api.save_entity(entity)
    target = api.save_entity(api.create_entity("person"))
    relation = api.save_relation(
        {"source_id": saved["id"], "target_id": target["id"], "label": "关联"}
    )
    graph = api.get_graph()
    assert {node["id"] for node in graph["nodes"]} == {saved["id"], target["id"]}
    assert graph["edges"][0]["id"] == relation["id"]
    renamed = api.save_field({**field, "name": "施术代价"})
    assert renamed["id"] == field["id"]
    assert api.get_entity(saved["id"])["custom_fields"] == {"施术代价": "记忆"}

    readonly_state = api.set_read_only(True)
    assert readonly_state["read_only"] is True
    assert readonly_state["writable"] is False
    with pytest.raises(PermissionError):
        api.save_entity({**saved, "name": "禁止写入"})
    with pytest.raises(PermissionError):
        api.delete_relation(relation["id"])
    with pytest.raises(PermissionError):
        api.delete_field(field["id"])
    with pytest.raises(PermissionError):
        api.create_type("禁止写入")
    assert api.get_graph() == graph

    writable_state = api.set_read_only(False)
    assert writable_state["read_only"] is False
    assert api.delete_field(field["id"])
    assert api.get_entity(saved["id"])["custom_fields"] == {}
    assert api.delete_entity(target["id"])
    assert api.get_history(target["id"])[0]["change_type"] == "delete"
    assert api.get_graph()["edges"] == []
    empty_type = api.create_type("空类型")
    assert api.delete_type(empty_type["id"])
    api.close_project()
