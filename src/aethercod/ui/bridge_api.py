from __future__ import annotations

from dataclasses import asdict, fields
from functools import wraps
import json
import math
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
from threading import RLock
from typing import Any, Callable, TypeVar
from urllib.parse import urlparse
import webbrowser

from ..db import connect, is_builtin_field
from ..exchange import export_library, import_library, read_json, write_json
from ..history import EntityHistory
from ..models import Entity, utc_now
from ..repositories import atomic, normalize
from ..services import ProjectService

_T = TypeVar("_T")
_WIKILINK = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]")
_RETIRED_TEMPLATE_FIELDS = {
    "polity": {"正式名称", "定位/身份", "核心特征"},
    "place": {
        "正式名称",
        "定位/身份",
        "核心特征",
        "地位",
        "面积",
        "地理概述",
        "经济文化与特色",
    },
}

_ENTITY_CHANGE_LABELS = {
    "name": "名称",
    "summary": "摘要",
    "notes": "正文",
    "color": "主题色",
    "is_favorite": "收藏状态",
    "remarks": "备注",
    "aliases": "别名",
    "tags": "分类",
    "dates": "日期",
    "type_id": "词条类型",
}


def _serialized(method: Callable[..., _T]) -> Callable[..., _T]:
    @wraps(method)
    def call(self: BridgeAPI, *args: Any, **kwargs: Any) -> _T:
        with self._lock:
            return method(self, *args, **kwargs)

    return call


class BridgeAPI:
    """JSON-friendly desktop API exposed to the local pywebview window."""

    def __init__(self) -> None:
        self._lock = RLock()
        self._window: Any = None
        self._conn: sqlite3.Connection | None = None
        self._service: ProjectService | None = None
        self._history: EntityHistory | None = None
        self._path = ""
        self._maximized = False
        self._read_only = False

    def bind_window(self, window: Any) -> None:
        self._window = window
        self._maximized = bool(window.maximized)
        window.events.maximized += self._mark_maximized
        window.events.restored += self._mark_restored

    def _mark_maximized(self, *_args: Any) -> None:
        self._maximized = True

    def _mark_restored(self, *_args: Any) -> None:
        self._maximized = False

    def window_maximized(self) -> bool:
        return self._maximized

    @_serialized
    def window_action(self, action: str) -> None:
        if self._window is None:
            return
        if action == "minimize":
            self._window.minimize()
        elif action == "maximize":
            if self._maximized:
                self._window.restore()
                self._maximized = False
            else:
                self._window.maximize()
                self._maximized = True
        elif action == "restore":
            self._window.restore()
            self._maximized = False
        elif action == "close":
            self._window.destroy()

    def _require_service(self) -> ProjectService:
        if self._service is None:
            raise RuntimeError("No project is open")
        return self._service

    def _ensure_writable(self) -> ProjectService:
        service = self._require_service()
        if not service.writable or self._read_only:
            raise PermissionError("Project is read-only")
        return service

    def _choose_path(self, *, save: bool = False, filename: str = "") -> str:
        if self._window is None:
            return ""
        import webview

        dialog_type = webview.FileDialog.SAVE if save else webview.FileDialog.OPEN
        selected = self._window.create_file_dialog(
            dialog_type,
            directory=str(Path.home()),
            save_filename=filename,
            file_types=(
                "Aethercod project (*.aethercod)",
                "SQLite database (*.db;*.sqlite;*.sqlite3)",
            ),
        )
        return str(selected[0]) if selected else ""

    def _choose_json_path(self, *, save: bool = False) -> str:
        if self._window is None:
            return ""
        import webview

        selected = self._window.create_file_dialog(
            webview.FileDialog.SAVE if save else webview.FileDialog.OPEN,
            directory=str(Path.home()),
            save_filename="aethercod-export.json" if save else "",
            file_types=("JSON 文件 (*.json)",),
        )
        return str(selected[0]) if selected else ""

    @staticmethod
    def _project_meta(conn: sqlite3.Connection) -> dict[str, str]:
        return {row[0]: row[1] for row in conn.execute("SELECT key,value FROM project_meta")}

    def _hidden_type_ids(self) -> set[str]:
        if self._conn is None:
            return set()
        row = self._conn.execute(
            "SELECT value FROM project_meta WHERE key='hidden_entity_types'"
        ).fetchone()
        if row is None:
            return set()
        try:
            values = json.loads(row[0])
        except (TypeError, json.JSONDecodeError):
            return set()
        return {str(value) for value in values} if isinstance(values, list) else set()

    def _type_dict(self, entity_type: Any) -> dict[str, Any]:
        return {**asdict(entity_type), "hidden": entity_type.id in self._hidden_type_ids()}

    def _fields_for_ui(self, type_id: str) -> list[Any]:
        service = self._require_service()
        retired = _RETIRED_TEMPLATE_FIELDS.get(type_id, set())
        return [field for field in service.fields.list(type_id) if field.name not in retired]

    def _replace_project(self, conn: sqlite3.Connection, path: str) -> None:
        old_conn = self._conn
        self._conn = conn
        self._service = ProjectService(conn)
        self._history = EntityHistory(conn)
        self._path = str(Path(path).expanduser().resolve())
        self._read_only = False
        if old_conn is not None:
            old_conn.close()

    @staticmethod
    def _entity_dict(entity: Entity) -> dict[str, Any]:
        return asdict(entity)

    @staticmethod
    def _change_value(value: Any) -> str:
        rendered = json.dumps(value, ensure_ascii=False, sort_keys=True)
        return rendered if len(rendered) <= 48 else f"{rendered[:45]}..."

    def _entity_change_description(self, before: Entity | None, after: Entity) -> str:
        if before is None:
            return f"新建词条「{after.name}」"
        old_values = self._entity_dict(before)
        new_values = self._entity_dict(after)
        changes = []
        for key, label in _ENTITY_CHANGE_LABELS.items():
            old_value, new_value = old_values.get(key), new_values.get(key)
            if old_value != new_value:
                changes.append(
                    f"{label}「{self._change_value(old_value)}」→「{self._change_value(new_value)}」"
                )
        old_fields = before.custom_fields
        new_fields = after.custom_fields
        for field_name in dict.fromkeys((*old_fields, *new_fields)):
            old_value = old_fields.get(field_name)
            new_value = new_fields.get(field_name)
            if old_value != new_value or (field_name in old_fields) != (field_name in new_fields):
                changes.append(
                    f"属性「{field_name}」「{self._change_value(old_value)}」→「{self._change_value(new_value)}」"
                )
        return f"更新「{after.name}」：" + ("、".join(changes) or "词条属性")

    def _relation_snapshot(self, entity_id: str) -> list[dict[str, Any]]:
        assert self._conn is not None
        return [
            dict(row)
            for row in self._conn.execute(
                "SELECT id,source_id,target_id,label,reverse_label,notes,created_at "
                "FROM relations WHERE source_id=? OR target_id=? ORDER BY created_at,id",
                (entity_id, entity_id),
            ).fetchall()
        ]

    def _save_entity_snapshot(
        self,
        entity: Entity,
        change_type: str,
        description: str,
        *,
        commit: bool = False,
    ) -> None:
        assert self._conn is not None and self._history is not None
        self._history.save_snapshot(entity, change_type, description, commit=commit)
        snapshot = self._history.get_version(
            entity.id,
            self._history._get_next_version(entity.id) - 1,
        )
        if snapshot is None:
            raise RuntimeError("Unable to read the saved history snapshot")
        snapshot["relations"] = self._relation_snapshot(entity.id)
        self._conn.execute(
            "UPDATE entity_history SET snapshot=? WHERE entity_id=? AND version=?",
            (
                json.dumps(snapshot, ensure_ascii=False),
                entity.id,
                self._history._get_next_version(entity.id) - 1,
            ),
        )

    @_serialized
    def get_state(self) -> dict[str, Any]:
        if self._service is None or self._conn is None:
            return {
                "project": None,
                "types": [],
                "entities": [],
                "writable": False,
                "read_only": False,
                "save_mode": "realtime",
                "save_interval": 1,
            }
        meta = self._project_meta(self._conn)
        try:
            save_interval = max(1, min(1440, int(meta.get("save_interval", "1") or "1")))
        except ValueError:
            save_interval = 1
        hidden_types = self._hidden_type_ids()
        types = [self._type_dict(item) for item in self._service.taxonomy.list_types()]
        entities = [
            entity for entity in self._service.search.search() if entity.type_id not in hidden_types
        ]
        return {
            "project": {
                "path": self._path,
                "name": meta.get("name", "").strip() or Path(self._path).stem,
                "era_name": meta.get("era_name", "").strip() or "泰拉纪元",
                "author": meta.get("author", ""),
                "description": meta.get("description", ""),
            },
            "types": types,
            "entities": [
                {
                    "id": entity.id,
                    "type_id": entity.type_id,
                    "name": entity.name,
                    "summary": entity.summary,
                    "color": entity.color,
                    "is_favorite": entity.is_favorite,
                }
                for entity in entities
            ],
            "writable": bool(self._service.writable and not self._read_only),
            "read_only": self._read_only,
            "save_mode": meta.get("save_mode", "realtime"),
            "save_interval": save_interval,
        }

    @_serialized
    def update_save_settings(self, save_mode: str, save_interval: int) -> dict[str, Any]:
        service = self._ensure_writable()
        if save_mode not in {"manual", "interval", "realtime"}:
            raise ValueError("Unsupported save mode")
        interval = max(1, min(1440, int(save_interval)))
        assert self._conn is not None
        self._conn.executemany(
            "INSERT INTO project_meta(key,value) VALUES(?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (("save_mode", save_mode), ("save_interval", str(interval))),
        )
        self._conn.commit()
        return self.get_state()

    @_serialized
    def open_project(self, path: str = "") -> dict[str, Any]:
        selected_path = str(path or "").strip() or self._choose_path()
        if not selected_path:
            return self.get_state()
        new_conn = connect(Path(selected_path).expanduser(), check_same_thread=False)
        try:
            self._replace_project(new_conn, selected_path)
        except Exception:
            new_conn.close()
            raise
        return self.get_state()

    @_serialized
    def create_project(
        self,
        path: str = "",
        name: str = "新的世界",
        era_name: str = "泰拉纪元",
        author: str = "",
        description: str = "",
    ) -> dict[str, Any]:
        name = str(name or "").strip()
        era_name = str(era_name or "").strip()
        if not name or not era_name:
            raise ValueError("资料库名称和纪年法名称不能为空")
        selected_path = str(path or "").strip()
        if not selected_path:
            safe_name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip(" .") or "世界"
            selected_path = self._choose_path(save=True, filename=f"{safe_name}.aethercod")
        if not selected_path:
            return self.get_state()
        target = Path(selected_path).expanduser()
        if target.suffix.lower() != ".aethercod":
            target = (
                target.with_suffix(".aethercod")
                if target.suffix
                else target.with_name(f"{target.name}.aethercod")
            )
        if target.exists():
            raise FileExistsError("项目文件已存在，请选择一个尚不存在的文件名")

        new_conn = connect(target, check_same_thread=False)
        try:
            new_conn.executemany(
                "INSERT INTO project_meta(key,value) VALUES(?,?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                [
                    ("name", name),
                    ("era_name", era_name),
                    ("author", str(author or "").strip()),
                    ("description", str(description or "").strip()),
                ],
            )
            new_conn.commit()
            self._replace_project(new_conn, str(target))
        except Exception:
            new_conn.close()
            raise
        return self.get_state()

    @_serialized
    def close_project(self) -> dict[str, Any]:
        if self._conn is not None:
            self._conn.close()
        self._conn = None
        self._service = None
        self._history = None
        self._path = ""
        self._read_only = False
        return self.get_state()

    @_serialized
    def update_project(self, data: dict[str, Any]) -> dict[str, Any]:
        self._ensure_writable()
        name = str(data.get("name", "")).strip()
        era_name = str(data.get("era_name", "")).strip()
        if not name or not era_name:
            raise ValueError("资料库名称和纪年法名称不能为空")
        assert self._conn is not None
        with self._conn:
            self._conn.executemany(
                "INSERT INTO project_meta(key,value) VALUES(?,?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                [
                    ("name", name),
                    ("era_name", era_name),
                    ("author", str(data.get("author", "")).strip()),
                    ("description", str(data.get("description", "")).strip()),
                ],
            )
        return self.get_state()

    @_serialized
    def set_read_only(self, enabled: bool) -> dict[str, Any]:
        service = self._require_service()
        if not service.writable and not enabled:
            raise PermissionError("Project cannot be made writable")
        self._read_only = bool(enabled)
        return self.get_state()

    @_serialized
    def list_entities(self, query: str = "", type_id: str = "") -> list[dict[str, Any]]:
        service = self._require_service()
        hidden_types = self._hidden_type_ids()
        entities = [
            entity
            for entity in service.search.search(str(query or ""), str(type_id or "") or None)
            if entity.type_id not in hidden_types
        ]
        return [
            {
                "id": entity.id,
                "type_id": entity.type_id,
                "name": entity.name,
                "summary": entity.summary,
                "color": entity.color,
                "is_favorite": entity.is_favorite,
            }
            for entity in entities
        ]

    @_serialized
    def get_entity(self, entity_id: str, include_deleted: bool = False) -> dict[str, Any] | None:
        service = self._require_service()
        entity = service.entities.get(str(entity_id), include_deleted=include_deleted)
        if entity is None:
            return None
        data = self._entity_dict(entity)
        entity_type = service.taxonomy.get(entity.type_id)
        data["type"] = asdict(entity_type) if entity_type else None
        data["fields"] = [asdict(item) for item in self._fields_for_ui(entity.type_id)]
        data["relations"] = service.relation_rows(entity.id)
        data["backlinks"] = self._backlinks(entity.id)
        return data

    @_serialized
    def resolve_entity(self, value: str) -> dict[str, Any] | None:
        service = self._require_service()
        value = str(value).strip()
        entity = service.search.resolve(value, include_deleted=False)
        if entity is None:
            normalized = normalize(value)
            entity = next(
                (
                    candidate
                    for candidate in service.search.search(value)
                    if normalize(candidate.name) == normalized
                    or any(normalize(alias) == normalized for alias in candidate.aliases)
                ),
                None,
            )
        if entity is None:
            return None
        return {
            "id": entity.id,
            "type_id": entity.type_id,
            "name": entity.name,
            "summary": entity.summary,
            "color": entity.color,
            "is_favorite": entity.is_favorite,
        }

    def _backlinks(self, entity_id: str) -> list[dict[str, str]]:
        assert self._conn is not None
        matches = []
        rows = self._conn.execute(
            "SELECT id,name,color,notes FROM entities "
            "WHERE deleted_at IS NULL AND notes LIKE '%[[%' AND id<>?",
            (entity_id,),
        ).fetchall()
        for row in rows:
            if any(
                token.replace("-", "").lower() == entity_id
                for token in _WIKILINK.findall(row["notes"])
            ):
                matches.append({"id": row["id"], "name": row["name"], "color": row["color"]})
        return matches

    @_serialized
    def create_entity(self, type_id: str) -> dict[str, Any]:
        service = self._ensure_writable()
        entity = service.new_entity(str(type_id))
        definitions = self._fields_for_ui(entity.type_id)
        entity.custom_fields = {
            field.name: field.default_value
            for field in definitions
            if field.default_value is not None
        }
        if entity.type_id == "place":
            entity.custom_fields.setdefault("地点类别", "其他")
        return {
            **self._entity_dict(entity),
            "type": asdict(service.taxonomy.get(entity.type_id)),
            "fields": [asdict(field) for field in definitions],
        }

    @_serialized
    def save_entity(self, data: dict[str, Any]) -> dict[str, Any]:
        service = self._ensure_writable()
        allowed = {field.name for field in fields(Entity)}
        entity = Entity(**{key: value for key, value in data.items() if key in allowed})
        existing = service.entities.get(entity.id)
        if existing and existing.deleted_at:
            raise ValueError("该词条已移入回收站")
        history = self._history
        assert self._conn is not None and history is not None
        change_type = "create" if existing is None else "update"
        changed = existing is None or any(
            self._entity_dict(existing).get(key) != self._entity_dict(entity).get(key)
            for key in allowed - {"created_at", "updated_at"}
        )
        with atomic(self._conn):
            saved = service.save_entity(entity, data.get("redirects"))
            if changed:
                self._save_entity_snapshot(
                    saved,
                    change_type,
                    self._entity_change_description(existing, saved),
                )
        return self.get_entity(saved.id) or self._entity_dict(saved)

    @_serialized
    def delete_entity(self, entity_id: str) -> bool:
        return self.delete_graph_node(entity_id)

    @_serialized
    def delete_graph_node(self, entity_id: str) -> bool:
        service = self._ensure_writable()
        entity = service.entities.get(str(entity_id), include_deleted=False)
        if entity is None:
            return False
        assert self._conn is not None and self._history is not None
        relations = self._relation_snapshot(entity.id)
        related_ids = {
            endpoint
            for relation in relations
            for endpoint in (relation["source_id"], relation["target_id"])
            if endpoint != entity.id
        }
        with atomic(self._conn):
            self._save_entity_snapshot(
                entity,
                "delete",
                f"永久删除词条「{entity.name}」及其 {len(relations)} 条关联",
            )
            self._conn.execute(
                "DELETE FROM relations WHERE source_id=? OR target_id=?",
                (entity.id, entity.id),
            )
            for related_id in related_ids:
                related = service.entities.get(related_id, include_deleted=False)
                if related is not None:
                    self._save_entity_snapshot(
                        related,
                        "relation",
                        f"删除关联词条「{entity.name}」的全部关系",
                    )
            for table in (
                "entity_aliases",
                "entity_tags",
                "entity_field_values",
                "entity_dates",
            ):
                self._conn.execute(f"DELETE FROM {table} WHERE entity_id=?", (entity.id,))
            self._conn.execute("DELETE FROM alias_redirects WHERE entity_id=?", (entity.id,))
            self._conn.execute("DELETE FROM entities WHERE id=?", (entity.id,))
        return True

    @_serialized
    def list_types(self) -> list[dict[str, Any]]:
        service = self._require_service()
        return [self._type_dict(item) for item in service.taxonomy.list_types()]

    @_serialized
    def set_type_hidden(self, type_id: str, hidden: bool) -> dict[str, Any]:
        service = self._ensure_writable()
        if service.taxonomy.get(str(type_id)) is None:
            raise ValueError("Unknown entity type")
        assert self._conn is not None
        hidden_types = self._hidden_type_ids()
        if hidden:
            hidden_types.add(str(type_id))
        else:
            hidden_types.discard(str(type_id))
        self._conn.execute(
            "INSERT INTO project_meta(key,value) VALUES('hidden_entity_types',?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (json.dumps(sorted(hidden_types), ensure_ascii=False),),
        )
        self._conn.commit()
        return self.get_state()

    @_serialized
    def reveal_project_file(self) -> None:
        self._require_service()
        path = Path(self._path)
        if not path.is_file():
            raise FileNotFoundError("当前资料库文件已移动或删除")
        if sys.platform == "win32":
            # Explorer expects the path quoted after the comma, rather than the whole switch.
            command = f'explorer.exe /select,"{path}"'
        elif sys.platform == "darwin":
            command = ["open", "-R", str(path)]
        else:
            command = ["xdg-open", str(path.parent)]
        subprocess.Popen(command)

    @_serialized
    def open_external_url(self, url: str) -> bool:
        parsed = urlparse(str(url))
        if (
            parsed.scheme != "https"
            or parsed.hostname != "github.com"
            or not (
                parsed.path == "/HanaWind/aethercod"
                or parsed.path.startswith("/HanaWind/aethercod/")
            )
        ):
            raise ValueError("Only the Aethercod GitHub repository can be opened externally")
        return bool(webbrowser.open(parsed.geturl(), new=2))

    @_serialized
    def create_type(self, name: str, icon: str = "✦") -> dict[str, Any]:
        service = self._ensure_writable()
        return self._type_dict(service.taxonomy.create_type(str(name), str(icon or "✦")))

    @_serialized
    def update_type(self, type_id: str, name: str, icon: str = "") -> dict[str, Any]:
        service = self._ensure_writable()
        return self._type_dict(
            service.taxonomy.update_type(
                str(type_id), name=str(name), icon=str(icon) if icon else None
            )
        )

    @_serialized
    def delete_type(self, type_id: str) -> bool:
        self._ensure_writable().taxonomy.delete_type(str(type_id))
        return True

    @_serialized
    def list_fields(self, type_id: str) -> list[dict[str, Any]]:
        return [
            {**asdict(item), "protected": is_builtin_field(item.id, item.type_id, item.name)}
            for item in self._fields_for_ui(str(type_id))
        ]

    @_serialized
    def save_field(self, data: dict[str, Any]) -> dict[str, Any]:
        service = self._ensure_writable()
        field_id = str(data.get("id", "")).strip()
        name = str(data.get("name", "")).strip()
        field_type = str(data.get("field_type", "text")).strip()
        options = list(dict.fromkeys(str(option).strip() for option in data.get("options", [])))
        options = [option for option in options if option]
        if not name:
            raise ValueError("字段名称不能为空")
        if field_type in {"choice", "select", "multiselect"} and not options:
            raise ValueError("选择类型至少需要一个选项")
        if field_id:
            definition = service.fields.update(
                field_id,
                name=name,
                field_type=field_type,
                required=bool(data.get("required", False)),
                description=str(data.get("description", "")),
                options=options,
            )
        else:
            definition = service.fields.create(
                str(data.get("type_id", "")),
                name,
                field_type,
                bool(data.get("required", False)),
                str(data.get("description", "")),
                options,
            )
        return asdict(definition)

    @_serialized
    def delete_field(self, field_id: str) -> bool:
        self._ensure_writable().fields.delete(str(field_id))
        return True

    @_serialized
    def save_relation(self, data: dict[str, Any]) -> dict[str, Any]:
        service = self._ensure_writable()
        relation_id = str(data.get("id", "")).strip()
        old_relation = service.relations.get(relation_id) if relation_id else None
        old_source = service.entities.get(old_relation.source_id) if old_relation else None
        old_target = service.entities.get(old_relation.target_id) if old_relation else None
        affected_ids = {
            entity_id
            for entity_id in (
                data.get("source_id"),
                data.get("target_id"),
                old_relation.source_id if old_relation else None,
                old_relation.target_id if old_relation else None,
            )
            if entity_id
        }
        before = {entity_id: service.entities.get(entity_id) for entity_id in affected_ids}
        assert self._conn is not None
        with atomic(self._conn):
            if relation_id:
                relation = service.relations.update(
                    relation_id,
                    source_id=data.get("source_id"),
                    target_id=data.get("target_id"),
                    label=data.get("label"),
                    reverse_label=data.get("reverse_label"),
                    notes=data.get("notes"),
                    commit=False,
                )
            else:
                relation = service.new_relation(
                    str(data.get("source_id", "")),
                    str(data.get("target_id", "")),
                    str(data.get("label", "")),
                    str(data.get("reverse_label", "")),
                    str(data.get("notes", "")),
                    commit=False,
                )
            source = service.entities.get(relation.source_id)
            target = service.entities.get(relation.target_id)
            if old_relation:
                relation_changes = []
                for label, old_value, new_value in (
                    (
                        "起点",
                        old_source.name if old_source else "已删除词条",
                        source.name if source else "已删除词条",
                    ),
                    ("关系名称", old_relation.label, relation.label),
                    (
                        "终点",
                        old_target.name if old_target else "已删除词条",
                        target.name if target else "已删除词条",
                    ),
                    ("反向关系", old_relation.reverse_label, relation.reverse_label),
                    ("备注", old_relation.notes, relation.notes),
                ):
                    if old_value != new_value:
                        relation_changes.append(
                            f"{label}「{self._change_value(old_value)}」"
                            f"→「{self._change_value(new_value)}」"
                        )
                description = "更新关联：" + ("、".join(relation_changes) or "关联属性")
            else:
                description_parts = [
                    f"新增关联：{source.name if source else '已删除词条'} — "
                    f"{relation.label} → {target.name if target else '已删除词条'}"
                ]
                if relation.reverse_label:
                    description_parts.append(f"反向关系「{relation.reverse_label}」")
                if relation.notes:
                    description_parts.append(f"备注「{self._change_value(relation.notes)}」")
                description = "；".join(description_parts)
            for entity_id in affected_ids:
                entity = service.entities.get(entity_id, include_deleted=False)
                previous = before.get(entity_id)
                if entity and previous:
                    self._save_entity_snapshot(
                        entity,
                        "relation",
                        description,
                    )
        return asdict(relation)

    @_serialized
    def delete_relation(self, relation_id: str) -> bool:
        service = self._ensure_writable()
        relation = service.relations.get(str(relation_id))
        if relation is None:
            return False
        before = {
            entity_id: service.entities.get(entity_id)
            for entity_id in {relation.source_id, relation.target_id}
        }
        assert self._conn is not None
        source = service.entities.get(relation.source_id)
        target = service.entities.get(relation.target_id)
        description = (
            f"删除关联：{source.name if source else '已删除词条'} — "
            f"{relation.label} → {target.name if target else '已删除词条'}"
        )
        with atomic(self._conn):
            service.relations.delete(relation.id, commit=False)
            for entity_id, previous in before.items():
                entity = service.entities.get(entity_id, include_deleted=False)
                if entity and previous:
                    self._save_entity_snapshot(
                        entity,
                        "relation",
                        description,
                    )
        return True

    @_serialized
    def get_timeline(self, entity_id: str = "") -> list[dict[str, Any]]:
        service = self._require_service()
        hidden_types = self._hidden_type_ids()
        return [
            entry
            for entry in service.timeline.entries(entity_id=str(entity_id or "") or None)
            if entry["type_id"] not in hidden_types
        ]

    @_serialized
    def get_graph(self) -> dict[str, list[dict[str, Any]]]:
        service = self._require_service()
        assert self._conn is not None
        hidden_types = self._hidden_type_ids()
        saved_positions = {
            row["entity_id"]: (float(row["x"]), float(row["y"]))
            for row in self._conn.execute(
                "SELECT entity_id,x,y FROM entity_graph_positions"
            )
        }
        entities = [
            entity for entity in service.entities.list() if entity.type_id not in hidden_types
        ]
        count = max(1, len(entities))
        nodes = []
        for index, entity in enumerate(entities):
            angle = 2 * math.pi * index / count - math.pi / 2
            radius = 0.39 if count > 1 else 0
            nodes.append(
                {
                    "id": entity.id,
                    "name": entity.name,
                    "type_id": entity.type_id,
                    "color": entity.color,
                    "summary": entity.summary,
                    "is_favorite": entity.is_favorite,
                    "position_saved": entity.id in saved_positions,
                    "x": saved_positions.get(
                        entity.id,
                        (0.5 + radius * math.cos(angle), 0.5 + radius * math.sin(angle)),
                    )[0],
                    "y": saved_positions.get(
                        entity.id,
                        (0.5 + radius * math.cos(angle), 0.5 + radius * math.sin(angle)),
                    )[1],
                }
            )
        node_ids = {node["id"] for node in nodes}
        edges = [
            dict(row)
            for row in self._conn.execute(
                "SELECT id,source_id,target_id,label FROM relations ORDER BY created_at,id"
            ).fetchall()
            if row["source_id"] in node_ids and row["target_id"] in node_ids
        ]
        return {"nodes": nodes, "edges": edges}

    @_serialized
    def save_graph_layout(self, positions: dict[str, dict[str, float]]) -> bool:
        self._ensure_writable()
        assert self._conn is not None
        with self._conn:
            for entity_id, point in positions.items():
                row = self._conn.execute(
                    "SELECT 1 FROM entities WHERE id=? AND deleted_at IS NULL", (entity_id,)
                ).fetchone()
                if row is None:
                    continue
                x = max(0.04, min(0.96, float(point["x"])))
                y = max(0.06, min(0.9, float(point["y"])))
                self._conn.execute(
                    "INSERT INTO entity_graph_positions(entity_id,x,y) VALUES(?,?,?) "
                    "ON CONFLICT(entity_id) DO UPDATE SET x=excluded.x,y=excluded.y",
                    (entity_id, x, y),
                )
        return True

    @_serialized
    def export_json(self) -> bool:
        self._require_service()
        assert self._conn is not None
        path = self._choose_json_path(save=True)
        if not path:
            return False
        destination = Path(path)
        if destination.suffix.lower() != ".json":
            destination = destination.with_suffix(".json")
        write_json(export_library(self._conn), destination)
        return True

    @_serialized
    def import_json(self) -> dict[str, Any]:
        self._ensure_writable()
        assert self._conn is not None
        path = self._choose_json_path()
        if not path:
            return self.get_state()
        import_library(self._conn, read_json(path))
        return self.get_state()

    @_serialized
    def get_history(self, entity_id: str) -> list[dict[str, Any]]:
        if self._history is None:
            self._require_service()
        assert self._history is not None
        return self._history.get_history(str(entity_id), limit=None)

    @_serialized
    def restore_entity_version(self, entity_id: str, version: int) -> dict[str, Any]:
        service = self._ensure_writable()
        if self._history is None or self._conn is None:
            raise RuntimeError("No project is open")
        snapshot = self._history.get_version(str(entity_id), int(version))
        if snapshot is None:
            raise ValueError("历史版本不存在")
        entity = self._history._dict_to_entity(snapshot)
        entity.deleted_at = snapshot.get("deleted_at")
        desired_relations = snapshot.get("relations", [])
        with atomic(self._conn):
            self._conn.execute(
                "DELETE FROM entity_history WHERE entity_id=? AND version>?",
                (entity.id, int(version)),
            )
            if "relations" in snapshot:
                self._conn.execute(
                    "DELETE FROM relations WHERE source_id=? OR target_id=?",
                    (entity.id, entity.id),
                )
            service.entities.save(entity, commit=False, preserve_timestamps=True)
            for relation in desired_relations:
                source = service.entities.get(relation["source_id"])
                target = service.entities.get(relation["target_id"])
                if source is None or target is None:
                    raise ValueError("历史关联引用的词条不存在")
                self._conn.execute(
                    "INSERT INTO relations(id,source_id,target_id,label,reverse_label,notes,created_at) "
                    "VALUES(?,?,?,?,?,?,?)",
                    (
                        relation["id"],
                        relation["source_id"],
                        relation["target_id"],
                        relation["label"],
                        relation.get("reverse_label", ""),
                        relation.get("notes", ""),
                        relation.get("created_at", utc_now()),
                    ),
                )
            restored = service.entities.get(entity.id, include_deleted=True)
            assert restored is not None
        return self.get_entity(entity.id, include_deleted=True) or self._entity_dict(restored)
