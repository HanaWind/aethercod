from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import pytest

from aethercod.ui.bridge_api import BridgeAPI


def test_bridge_empty_state_includes_save_defaults():
    state = BridgeAPI().get_state()
    assert state["project"] is None
    assert state["save_mode"] == "realtime"
    assert state["save_interval"] == 1


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
    assert api.window_maximized() is True
    api.window_action("maximize")
    assert api.window_maximized() is False
    window.events.maximized.callbacks[0](window)
    assert api.window_maximized() is True
    window.events.restored.callbacks[0](window)

    assert window.actions == ["maximize", "restore"]
    assert api._maximized is False


def test_old_location_template_keeps_values_when_new_fields_are_seeded(tmp_path):
    api = BridgeAPI()
    path = tmp_path / "old-location.aethercod"
    api.create_project(str(path), "位置模板", "纪年")
    entity = api.create_entity("place")
    entity["aliases"] = ["旧港"]
    entity["custom_fields"] = {"地点类别": "城市", "经济文化与特色": "旧版城市记录"}
    saved = api.save_entity(entity)
    # Simulate a v3 project created before the conditional fields existed.
    api._conn.execute("DELETE FROM entity_type_fields WHERE type_id='place' AND name='遗迹特征'")
    api._conn.commit()
    api.close_project()

    api.open_project(str(path))
    reopened = api.get_entity(saved["id"])
    assert reopened["aliases"] == ["旧港"]
    assert reopened["custom_fields"]["经济文化与特色"] == "旧版城市记录"
    assert "遗迹特征" in {field["name"] for field in reopened["fields"]}
    api.close_project()


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
            "dates": [
                {
                    "date_kind": "birth",
                    "label": "诞生",
                    "description": "在海港灯塔下出生。",
                    "year": 125,
                }
            ],
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
    assert details["dates"][0]["description"] == "在海港灯塔下出生。"
    assert api.get_timeline(saved_first["id"])[0]["description"] == "在海港灯塔下出生。"
    assert details["relations"][0]["other_name"] == "雾松堡"
    assert details["backlinks"] == [
        {"id": saved_second["id"], "name": "雾松堡", "color": "#7c3aed"}
    ]
    assert api.get_timeline(saved_first["id"])[0]["year"] == 125
    history = api.get_history(saved_first["id"])
    assert any(item["change_type"] == "create" for item in history)
    assert any(item["change_type"] == "relation" for item in history)
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


def test_bridge_records_detailed_history_and_restores_entity_and_relations(tmp_path):
    api = BridgeAPI()
    api.create_project(str(tmp_path / "history.aethercod"), "历史", "纪年")
    first = api.create_entity("person")
    first.update({"name": "黎明", "summary": "最初的记录"})
    original = api.save_entity(first)
    first.update({"name": "晨光", "summary": "修改后的记录", "color": "#2582c4"})
    updated = api.save_entity(first)
    details = api.get_history(updated["id"])
    update_entry = next(item for item in details if item["change_type"] == "update")
    assert "名称" in update_entry["description"]
    assert "摘要" in update_entry["description"]
    changed_at = datetime.fromisoformat(update_entry["changed_at"])
    assert changed_at.tzinfo is not None
    assert changed_at.microsecond % 1000 == 0

    second = api.create_entity("place")
    second["name"] = "雾城"
    target = api.save_entity(second)
    relation = api.save_relation(
        {"source_id": updated["id"], "target_id": target["id"], "label": "驻守"}
    )
    relation_version = next(
        item["version"]
        for item in api.get_history(updated["id"])
        if item["change_type"] == "relation"
    )
    api.save_relation(
        {
            **relation,
            "label": "守护",
            "reverse_label": "庇护",
            "notes": "彼此守望",
        }
    )
    relation_update = next(
        item
        for item in api.get_history(updated["id"])
        if item["change_type"] == "relation" and "更新关联" in item["description"]
    )
    assert "驻守" in relation_update["description"]
    assert "守护" in relation_update["description"]
    assert "彼此守望" in relation_update["description"]
    api.delete_relation(relation["id"])
    restored = api.restore_entity_version(updated["id"], relation_version)
    assert restored["name"] == "晨光"
    assert restored["color"] == "#2582c4"
    assert restored["relations"][0]["other_name"] == "雾城"
    remaining_history = api.get_history(updated["id"])
    assert remaining_history[0]["version"] == relation_version
    assert all(item["version"] <= relation_version for item in remaining_history)
    assert all(item["change_type"] != "restore" for item in remaining_history)

    api.restore_entity_version(original["id"], 1)
    rolled_back = api.get_entity(original["id"])
    assert rolled_back["name"] == "黎明"
    assert rolled_back["relations"] == []
    assert [item["version"] for item in api.get_history(original["id"])] == [1]
    assert api.get_history(original["id"])[0]["change_type"] == "create"

    many_versions = api.create_entity("person")
    many_versions["name"] = "长历史"
    many_versions = api.save_entity(many_versions)
    for version in range(55):
        many_versions["summary"] = str(version)
        many_versions = api.save_entity(many_versions)
    assert len(api.get_history(many_versions["id"])) == 56
    api.close_project()


def test_bridge_hides_and_restores_entity_types_without_removing_data(tmp_path):
    api = BridgeAPI()
    api.create_project(str(tmp_path / "hidden-types.aethercod"), "隐藏类型", "纪年")
    entity_type = api.create_type("秘藏")
    entity = api.create_entity(entity_type["id"])
    entity["name"] = "隐秘词条"
    entity["dates"] = [{"date_kind": "custom", "label": "隐秘纪年", "year": 80}]
    saved = api.save_entity(entity)

    hidden_state = api.set_type_hidden(entity_type["id"], True)
    assert next(item for item in hidden_state["types"] if item["id"] == entity_type["id"])["hidden"]
    assert saved["id"] not in {item["id"] for item in hidden_state["entities"]}
    assert api.list_entities() == []
    assert api.get_timeline() == []
    assert api.get_graph()["nodes"] == []
    with pytest.raises(ValueError, match="cannot be deleted|Cannot be deleted"):
        api.delete_type("person")

    project_path = str(tmp_path / "hidden-types.aethercod")
    api.close_project()
    api.open_project(project_path)
    reopened_state = api.get_state()
    assert saved["id"] not in {item["id"] for item in reopened_state["entities"]}

    visible_state = api.set_type_hidden(entity_type["id"], False)
    assert not next(item for item in visible_state["types"] if item["id"] == entity_type["id"])[
        "hidden"
    ]
    assert saved["id"] in {item["id"] for item in visible_state["entities"]}
    assert api.get_timeline()[0]["label"] == "隐秘纪年"
    assert api.get_graph()["nodes"][0]["id"] == saved["id"]
    api.close_project()


def test_bridge_opens_only_project_github_links_externally(tmp_path, monkeypatch):
    api = BridgeAPI()
    api.create_project(str(tmp_path / "external-link.aethercod"), "外链", "纪年")
    opened = []
    monkeypatch.setattr(
        "aethercod.ui.bridge_api.webbrowser.open",
        lambda url, new: opened.append((url, new)) or True,
    )
    assert api.open_external_url("https://github.com/HanaWind/aethercod/issues") is True
    assert opened == [("https://github.com/HanaWind/aethercod/issues", 2)]
    with pytest.raises(ValueError):
        api.open_external_url("https://example.org/")
    api.close_project()


def test_bridge_permanently_deletes_graph_node_and_all_relationship_data(tmp_path):
    api = BridgeAPI()
    api.create_project(str(tmp_path / "graph-delete.aethercod"), "图谱删除", "纪年")
    source = api.create_entity("person")
    source.update(
        {
            "name": "被删节点",
            "aliases": ["旧称"],
            "tags": ["遗迹"],
            "dates": [{"date_kind": "custom", "label": "旧纪", "year": 4}],
        }
    )
    source = api.save_entity(source)
    target = api.create_entity("place")
    target["name"] = "留存节点"
    target = api.save_entity(target)
    relation = api.save_relation(
        {"source_id": source["id"], "target_id": target["id"], "label": "守望"}
    )
    assert api.delete_graph_node(source["id"]) is True
    assert api.get_entity(source["id"]) is None
    assert api.get_entity(target["id"])["relations"] == []
    assert api.get_graph()["edges"] == []
    assert (
        api._conn.execute("SELECT COUNT(*) FROM entities WHERE id=?", (source["id"],)).fetchone()[0]
        == 0
    )
    assert (
        api._conn.execute(
            "SELECT COUNT(*) FROM relations WHERE id=?", (relation["id"],)
        ).fetchone()[0]
        == 0
    )
    assert api.get_history(source["id"])[0]["change_type"] == "delete"
    api.close_project()


def test_bridge_persists_save_mode_per_project(tmp_path):
    api = BridgeAPI()
    path = tmp_path / "save-policy.aethercod"
    state = api.create_project(str(path), "保存策略", "纪年")
    assert state["save_mode"] == "realtime"
    state = api.update_save_settings("interval", 12)
    assert state["save_mode"] == "interval"
    assert state["save_interval"] == 12
    state = api.update_save_settings("manual", 0)
    assert state["save_mode"] == "manual"
    assert state["save_interval"] == 1
    api.close_project()
    reopened = api.open_project(str(path))
    assert reopened["save_mode"] == "manual"
    assert reopened["save_interval"] == 1
    with pytest.raises(ValueError, match="Unsupported"):
        api.update_save_settings("invalid", 5)
    api.close_project()
