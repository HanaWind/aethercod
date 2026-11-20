from __future__ import annotations

from dataclasses import asdict, fields
from functools import wraps
import json
import math
from pathlib import Path
import re
import sqlite3
from threading import RLock
from typing import Any, Callable, TypeVar

from ..db import connect, is_builtin_field
from ..history import EntityHistory
from ..models import Entity
from ..repositories import atomic, normalize
from ..services import ProjectService

_T = TypeVar("_T")
_WIKILINK = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]")


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

    @staticmethod
    def _project_meta(conn: sqlite3.Connection) -> dict[str, str]:
        return {row[0]: row[1] for row in conn.execute("SELECT key,value FROM project_meta")}

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

    @_serialized
    def get_state(self) -> dict[str, Any]:
        if self._service is None or self._conn is None:
            return {
                "project": None,
                "types": [],
                "entities": [],
                "writable": False,
                "read_only": False,
            }
        meta = self._project_meta(self._conn)
        types = [asdict(item) for item in self._service.taxonomy.list_types()]
        entities = self._service.search.search()
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
                }
                for entity in entities
            ],
            "writable": bool(self._service.writable and not self._read_only),
            "read_only": self._read_only,
        }

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
        entities = service.search.search(str(query or ""), str(type_id or "") or None)
        return [
            {
                "id": entity.id,
                "type_id": entity.type_id,
                "name": entity.name,
                "summary": entity.summary,
                "color": entity.color,
            }
            for entity in entities
        ]

    @_serialized
    def get_entity(self, entity_id: str) -> dict[str, Any] | None:
        service = self._require_service()
        entity = service.entities.get(str(entity_id), include_deleted=False)
        if entity is None:
            return None
        data = self._entity_dict(entity)
        entity_type = service.taxonomy.get(entity.type_id)
        data["type"] = asdict(entity_type) if entity_type else None
        data["fields"] = [asdict(item) for item in service.fields.list(entity.type_id)]
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
        definitions = service.fields.list(entity.type_id)
        entity.custom_fields = {
            field.name: field.default_value
            for field in definitions
            if field.default_value is not None
        }
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
                history.save_snapshot(
                    saved,
                    change_type,
                    f"{'新建' if change_type == 'create' else '更新'}词条「{saved.name}」",
                    commit=False,
                )
        return self.get_entity(saved.id) or self._entity_dict(saved)

    @_serialized
    def delete_entity(self, entity_id: str) -> bool:
        service = self._ensure_writable()
        entity = service.entities.get(str(entity_id), include_deleted=False)
        if entity is None:
            return False
        assert self._conn is not None and self._history is not None
        with atomic(self._conn):
            service.entities.soft_delete(entity.id, commit=False)
            deleted = service.entities.get(entity.id)
            if deleted is not None:
                self._history.save_snapshot(
                    deleted, "delete", f"删除词条「{deleted.name}」", commit=False
                )
        return True

    @_serialized
    def list_types(self) -> list[dict[str, Any]]:
        return [asdict(item) for item in self._require_service().taxonomy.list_types()]

    @_serialized
    def create_type(self, name: str, icon: str = "✦") -> dict[str, Any]:
        service = self._ensure_writable()
        return asdict(service.taxonomy.create_type(str(name), str(icon or "✦")))

    @_serialized
    def update_type(self, type_id: str, name: str, icon: str = "") -> dict[str, Any]:
        service = self._ensure_writable()
        return asdict(
            service.taxonomy.update_type(
                str(type_id),
                name=str(name),
                icon=str(icon) if icon else None,
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
            for item in self._require_service().fields.list(str(type_id))
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
        if relation_id:
            relation = service.relations.update(
                relation_id,
                source_id=data.get("source_id"),
                target_id=data.get("target_id"),
                label=data.get("label"),
                reverse_label=data.get("reverse_label"),
                notes=data.get("notes"),
            )
        else:
            relation = service.new_relation(
                str(data.get("source_id", "")),
                str(data.get("target_id", "")),
                str(data.get("label", "")),
                str(data.get("reverse_label", "")),
                str(data.get("notes", "")),
            )
        return asdict(relation)

    @_serialized
    def delete_relation(self, relation_id: str) -> bool:
        service = self._ensure_writable()
        service.relations.delete(str(relation_id))
        return True

    @_serialized
    def get_timeline(self, entity_id: str = "") -> list[dict[str, Any]]:
        return self._require_service().timeline.entries(entity_id=str(entity_id or "") or None)

    @_serialized
    def get_graph(self) -> dict[str, list[dict[str, Any]]]:
        service = self._require_service()
        assert self._conn is not None
        entities = service.entities.list()
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
                    "x": 0.5 + radius * math.cos(angle),
                    "y": 0.5 + radius * math.sin(angle),
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
    def get_history(self, entity_id: str) -> list[dict[str, Any]]:
        if self._history is None:
            self._require_service()
        assert self._history is not None
        return self._history.get_history(str(entity_id))
