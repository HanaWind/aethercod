"""Qt Quick adapter for the existing Python project services.

The QML UI deliberately talks to this small QObject facade instead of reaching
into repositories directly.  That keeps persistence and validation in the
existing Python data layer while allowing the visual layer to migrate one
screen at a time.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any

from PySide6.QtCore import (
    QAbstractListModel,
    QModelIndex,
    QObject,
    Property,
    QSettings,
    Qt,
    QUrl,
    Signal,
    Slot,
)
from PySide6.QtWidgets import QFileDialog

from ..db import connect, is_builtin_field
from ..exchange import backup_project, export_library, import_library, read_json, write_json
from ..models import Entity, new_uuid, validate_date_parts
from ..services import ProjectService
from .graph_view import GraphView


class _ListModel(QAbstractListModel):
    """Small reset-based model used by the first QML vertical slice."""

    roles: dict[int, bytes] = {}

    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._rows: list[dict[str, Any]] = []

    def roleNames(self) -> dict[int, bytes]:  # noqa: N802 - Qt API name
        return self.roles

    def rowCount(self, parent: QModelIndex = QModelIndex()) -> int:  # noqa: N802
        return 0 if parent.isValid() else len(self._rows)

    def data(self, index: QModelIndex, role: int = Qt.ItemDataRole.DisplayRole) -> Any:
        if not index.isValid() or not 0 <= index.row() < len(self._rows):
            return None
        key = self.roles.get(role)
        return self._rows[index.row()].get(key.decode()) if key else None

    def replace(self, rows: list[dict[str, Any]]) -> None:
        self.beginResetModel()
        self._rows = rows
        self.endResetModel()


class QmlEntityModel(_ListModel):
    roles = {
        Qt.UserRole + 1: b"id",
        Qt.UserRole + 2: b"name",
        Qt.UserRole + 3: b"typeId",
        Qt.UserRole + 4: b"typeName",
        Qt.UserRole + 5: b"summary",
        Qt.UserRole + 6: b"color",
        Qt.UserRole + 7: b"tagsText",
        Qt.UserRole + 8: b"updatedAt",
    }


class QmlTypeModel(_ListModel):
    roles = {
        Qt.UserRole + 1: b"id",
        Qt.UserRole + 2: b"name",
        Qt.UserRole + 3: b"typeIcon",
        Qt.UserRole + 4: b"isBuiltin",
    }


class QmlRelationModel(_ListModel):
    roles = {
        Qt.UserRole + 1: b"id",
        Qt.UserRole + 2: b"otherId",
        Qt.UserRole + 3: b"otherName",
        Qt.UserRole + 4: b"label",
        Qt.UserRole + 5: b"direction",
        Qt.UserRole + 6: b"notes",
        Qt.UserRole + 7: b"reverseLabel",
    }


class QmlTimelineModel(_ListModel):
    roles = {
        Qt.UserRole + 1: b"id",
        Qt.UserRole + 2: b"entityId",
        Qt.UserRole + 3: b"name",
        Qt.UserRole + 4: b"typeId",
        Qt.UserRole + 5: b"dateKind",
        Qt.UserRole + 6: b"label",
        Qt.UserRole + 7: b"year",
        Qt.UserRole + 8: b"endYear",
        Qt.UserRole + 9: b"dateText",
    }


class QmlDateModel(_ListModel):
    roles = {
        Qt.UserRole + 1: b"id",
        Qt.UserRole + 2: b"dateKind",
        Qt.UserRole + 3: b"label",
        Qt.UserRole + 4: b"year",
        Qt.UserRole + 5: b"endYear",
        Qt.UserRole + 6: b"dateText",
        Qt.UserRole + 7: b"precision",
        Qt.UserRole + 8: b"endDateText",
    }


class QmlGraphModel(_ListModel):
    roles = {
        Qt.UserRole + 1: b"id",
        Qt.UserRole + 2: b"name",
        Qt.UserRole + 3: b"typeName",
        Qt.UserRole + 4: b"nodeColor",
        Qt.UserRole + 5: b"positionX",
        Qt.UserRole + 6: b"positionY",
        Qt.UserRole + 7: b"isCenter",
    }


class QmlValidationModel(_ListModel):
    roles = {
        Qt.UserRole + 1: b"kind",
        Qt.UserRole + 2: b"message",
        Qt.UserRole + 3: b"entityId",
        Qt.UserRole + 4: b"relationId",
    }


class QmlRelationTargetModel(_ListModel):
    roles = {
        Qt.UserRole + 1: b"id",
        Qt.UserRole + 2: b"name",
        Qt.UserRole + 3: b"typeName",
        Qt.UserRole + 4: b"displayName",
    }


class QmlFieldModel(_ListModel):
    roles = {
        Qt.UserRole + 1: b"id",
        Qt.UserRole + 2: b"name",
        Qt.UserRole + 3: b"fieldType",
        Qt.UserRole + 4: b"isRequired",
        Qt.UserRole + 5: b"description",
        Qt.UserRole + 6: b"optionsJson",
        Qt.UserRole + 7: b"valueJson",
        Qt.UserRole + 8: b"valueText",
        Qt.UserRole + 9: b"isBuiltin",
    }


class QmlBackend(QObject):
    """QObject facade exposed as ``backend`` to QML."""

    currentEntityChanged = Signal()
    previewChanged = Signal()
    entitiesChanged = Signal()
    typesChanged = Signal()
    relationsChanged = Signal()
    timelineChanged = Signal()
    datesChanged = Signal()
    graphChanged = Signal()
    validationChanged = Signal()
    fieldsChanged = Signal()
    relationEditorChanged = Signal()
    projectChanged = Signal()
    statusChanged = Signal()
    themeChanged = Signal()
    dirtyChanged = Signal()
    typeFilterChanged = Signal()
    timelineFilterChanged = Signal()
    queryChanged = Signal()
    discardConfirmationRequested = Signal()
    closeWindowRequested = Signal()

    DEFAULT_PROJECT_META = {
        "name": "Untitled World",
        "era_name": "泰拉纪元",
        "author": "",
        "description": "",
    }

    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self.entityModel = QmlEntityModel(self)
        self.typeModel = QmlTypeModel(self)
        self.relationModel = QmlRelationModel(self)
        self.timelineModel = QmlTimelineModel(self)
        self.dateModel = QmlDateModel(self)
        self.graphModel = QmlGraphModel(self)
        self.validationModel = QmlValidationModel(self)
        self.relationTargetModel = QmlRelationTargetModel(self)
        self.fieldModel = QmlFieldModel(self)
        self._service: ProjectService | None = None
        self._conn: Any = None
        self._path = ""
        self._project_meta = dict(self.DEFAULT_PROJECT_META)
        self._types: dict[str, str] = {}
        self._current: Entity | None = None
        self._current_is_new = False
        self._preview: Entity | None = None
        self._query = ""
        self._type_filter = ""
        self._timeline_type_filter = ""
        self._graph_scope = "all"
        self._dirty = False
        settings = QSettings("Aethercod", "Aethercod")
        self._dark = settings.value("ui/dark", False, type=bool)
        self._status = "请选择一个项目文件"
        self._pending_action: tuple[str, str] | None = None
        self._relation_edit_id = ""
        self._relation_target_id = ""
        self._relation_label = ""
        self._relation_reverse_label = ""
        self._relation_notes = ""
        self._graph_json = '{"nodes":[],"edges":[]}'

    def _set_status(self, message: str) -> None:
        self._status = str(message)
        self.statusChanged.emit()

    def _set_dirty(self, value: bool) -> None:
        value = bool(value)
        if value != self._dirty:
            self._dirty = value
            self.dirtyChanged.emit()

    @Property(QObject, constant=True)
    def entityModelObject(self) -> QObject:
        return self.entityModel

    @Property(QObject, constant=True)
    def typeModelObject(self) -> QObject:
        return self.typeModel

    @Property(QObject, constant=True)
    def relationModelObject(self) -> QObject:
        return self.relationModel

    @Property(QObject, constant=True)
    def timelineModelObject(self) -> QObject:
        return self.timelineModel

    @Property(QObject, constant=True)
    def dateModelObject(self) -> QObject:
        return self.dateModel

    @Property(QObject, constant=True)
    def graphModelObject(self) -> QObject:
        return self.graphModel

    @Property(QObject, constant=True)
    def validationModelObject(self) -> QObject:
        return self.validationModel

    @Property(QObject, constant=True)
    def relationTargetModelObject(self) -> QObject:
        return self.relationTargetModel

    @Property(QObject, constant=True)
    def fieldModelObject(self) -> QObject:
        return self.fieldModel

    @Property(str, notify=projectChanged)
    def projectPath(self) -> str:
        return self._path

    @Property(str, notify=projectChanged)
    def projectName(self) -> str:
        if not self._path:
            return "Aethercod"
        return self._project_meta.get("name", "").strip() or Path(self._path).stem

    @Property(str, notify=projectChanged)
    def eraName(self) -> str:
        return self._project_meta.get("era_name", "").strip() or "泰拉纪元"

    @Property(str, notify=projectChanged)
    def projectAuthor(self) -> str:
        return self._project_meta.get("author", "")

    @Property(str, notify=projectChanged)
    def projectDescription(self) -> str:
        return self._project_meta.get("description", "")

    @Property(str, notify=statusChanged)
    def statusMessage(self) -> str:
        return self._status

    @Property(bool, notify=themeChanged)
    def dark(self) -> bool:
        return self._dark

    @Property(bool, notify=dirtyChanged)
    def dirty(self) -> bool:
        return self._dirty

    @Property(bool, notify=currentEntityChanged)
    def currentIsNew(self) -> bool:
        return self._current_is_new

    @Property(bool, notify=projectChanged)
    def hasProject(self) -> bool:
        return self._service is not None

    @Property(bool, notify=projectChanged)
    def readOnly(self) -> bool:
        return bool(self._service and not self._service.writable)

    @Property(str, notify=queryChanged)
    def query(self) -> str:
        return self._query

    @Property(int, notify=entitiesChanged)
    def entityCount(self) -> int:
        return len(self.entityModel._rows)

    @Property(int, notify=relationsChanged)
    def relationCount(self) -> int:
        return len(self.relationModel._rows)

    @Property(int, notify=timelineChanged)
    def timelineCount(self) -> int:
        return len(self.timelineModel._rows)

    @Property(int, notify=datesChanged)
    def dateCount(self) -> int:
        return len(self.dateModel._rows)

    @Property(int, notify=validationChanged)
    def validationCount(self) -> int:
        return len(self.validationModel._rows)

    @Property(int, notify=graphChanged)
    def graphCount(self) -> int:
        return len(self.graphModel._rows)

    @Property(str, notify=graphChanged)
    def graphLayoutJson(self) -> str:
        return self._graph_json

    @Property(str, notify=relationEditorChanged)
    def relationEditId(self) -> str:
        return self._relation_edit_id

    @Property(str, notify=relationEditorChanged)
    def relationTargetId(self) -> str:
        return self._relation_target_id

    @Property(str, notify=relationEditorChanged)
    def relationLabel(self) -> str:
        return self._relation_label

    @Property(str, notify=relationEditorChanged)
    def relationReverseLabel(self) -> str:
        return self._relation_reverse_label

    @Property(str, notify=relationEditorChanged)
    def relationNotes(self) -> str:
        return self._relation_notes

    @Property(str, notify=typeFilterChanged)
    def typeFilter(self) -> str:
        return self._type_filter

    @Property(str, notify=timelineFilterChanged)
    def timelineTypeFilter(self) -> str:
        return self._timeline_type_filter

    @Property(str, notify=graphChanged)
    def graphScope(self) -> str:
        return self._graph_scope

    @Property(str, notify=timelineChanged)
    def timelineBoundsText(self) -> str:
        rows = self.timelineModel._rows
        starts = [row["year"] for row in rows if isinstance(row.get("year"), int)]
        if not starts:
            return "时间范围未定"
        start = min(starts)
        ends = [
            row.get("endYear") if isinstance(row.get("endYear"), int) else row.get("year")
            for row in rows
            if isinstance(row.get("year"), int)
        ]
        end = max(value for value in ends if isinstance(value, int))
        lower = self._format_year(start)
        upper = self._format_year(end)
        return lower if start == end else f"{lower} 至 {upper}"

    def _format_year(self, year: int) -> str:
        era = self.eraName
        return f"{era}前 {abs(year)} 年" if year < 0 else f"{era} {year} 年"

    @Slot(int, result=str)
    def formatYear(self, year: int) -> str:
        return self._format_year(int(year))

    @Property(int, notify=timelineChanged)
    def timelineMinYear(self) -> int:
        values = [
            row["year"] for row in self.timelineModel._rows if isinstance(row.get("year"), int)
        ]
        return min(values) if values else 0

    @Property(int, notify=timelineChanged)
    def timelineMaxYear(self) -> int:
        values = []
        for row in self.timelineModel._rows:
            if isinstance(row.get("year"), int):
                values.append(
                    row.get("endYear") if isinstance(row.get("endYear"), int) else row["year"]
                )
        return max(values) if values else 1

    @Property(str, notify=currentEntityChanged)
    def currentEntityId(self) -> str:
        return self._current.id if self._current else ""

    @Property(str, notify=currentEntityChanged)
    def currentUuid(self) -> str:
        return self._format_uuid(self.currentEntityId)

    @Property(str, notify=currentEntityChanged)
    def currentName(self) -> str:
        return self._current.name if self._current else ""

    @Property(str, notify=currentEntityChanged)
    def currentTypeId(self) -> str:
        return self._current.type_id if self._current else ""

    @Property(str, notify=currentEntityChanged)
    def currentTypeName(self) -> str:
        return self._types.get(self.currentTypeId, "")

    @Property(str, notify=currentEntityChanged)
    def currentSummary(self) -> str:
        return self._current.summary if self._current else ""

    @Property(str, notify=currentEntityChanged)
    def currentNotes(self) -> str:
        return self._current.notes if self._current else ""

    @Property(str, notify=currentEntityChanged)
    def currentAliases(self) -> str:
        return ", ".join(self._current.aliases) if self._current else ""

    @Property(str, notify=currentEntityChanged)
    def currentTags(self) -> str:
        return ", ".join(self._current.tags) if self._current else ""

    @Property(str, notify=currentEntityChanged)
    def currentColor(self) -> str:
        return self._current.color if self._current else "#64748b"

    @Property(str, notify=currentEntityChanged)
    def currentUpdatedAt(self) -> str:
        return self._current.updated_at if self._current else ""

    @Property(str, notify=currentEntityChanged)
    def currentCustomFieldsJson(self) -> str:
        if not self._current:
            return "{}"
        return json.dumps(self._current.custom_fields, ensure_ascii=False, indent=2)

    @Property(str, notify=currentEntityChanged)
    def currentDatesJson(self) -> str:
        return (
            json.dumps(self._current.dates, ensure_ascii=False, indent=2) if self._current else "[]"
        )

    @Property(str, notify=previewChanged)
    def previewEntityId(self) -> str:
        return self._preview.id if self._preview else ""

    @Property(str, notify=previewChanged)
    def previewUuid(self) -> str:
        return self._format_uuid(self.previewEntityId)

    @Property(str, notify=previewChanged)
    def previewName(self) -> str:
        return self._preview.name if self._preview else ""

    @Property(str, notify=previewChanged)
    def previewTypeName(self) -> str:
        return self._types.get(self._preview.type_id, "") if self._preview else ""

    @Property(str, notify=previewChanged)
    def previewSummary(self) -> str:
        return self._preview.summary if self._preview else ""

    @Property(str, notify=previewChanged)
    def previewNotes(self) -> str:
        return self._preview.notes if self._preview else ""

    def _emit_current(self) -> None:
        self.currentEntityChanged.emit()

    @staticmethod
    def _format_uuid(value: str) -> str:
        compact = str(value or "").replace("-", "")
        if len(compact) != 32:
            return compact
        return f"{compact[:8]}-{compact[8:12]}-{compact[12:16]}-{compact[16:20]}-{compact[20:]}"

    def _reload_types(self) -> None:
        if not self._service:
            self._types = {}
            self.typeModel.replace([])
            return
        types = self._service.taxonomy.list_types()
        self._types = {item.id: item.name for item in types}
        self.typeModel.replace(
            [
                {
                    "id": item.id,
                    "name": item.name,
                    "typeIcon": item.icon,
                    "isBuiltin": item.is_builtin,
                }
                for item in types
            ]
        )
        self.typesChanged.emit()

    def _reload_entities(self) -> None:
        if not self._service:
            self.entityModel.replace([])
            self.entitiesChanged.emit()
            return
        rows = self._service.search.search(self._query, type_id=self._type_filter or None)
        self.entityModel.replace(
            [
                {
                    "id": item.id,
                    "name": item.name,
                    "typeId": item.type_id,
                    "typeName": self._types.get(item.type_id, item.type_id),
                    "summary": item.summary,
                    "color": item.color,
                    "tagsText": " · ".join(item.tags),
                    "updatedAt": item.updated_at,
                }
                for item in rows
            ]
        )
        self.entitiesChanged.emit()

    def _reload_relation_targets(self) -> None:
        if not self._service:
            self.relationTargetModel.replace([])
            return
        entities = self._service.search.search("")
        self.relationTargetModel.replace(
            [
                {
                    "id": item.id,
                    "name": item.name,
                    "typeName": self._types.get(item.type_id, item.type_id),
                    "displayName": f"{item.name}  ·  {self._types.get(item.type_id, item.type_id)}",
                }
                for item in entities
                if not self._current or item.id != self._current.id
            ]
        )

    def _reload_fields(self) -> None:
        if not self._service or not self._current:
            self.fieldModel.replace([])
            self.fieldsChanged.emit()
            return
        definitions = self._service.fields.list(self._current.type_id)
        known = {item.name for item in definitions}
        rows = []
        for definition in definitions:
            value = self._current.custom_fields.get(definition.name, definition.default_value)
            rows.append(
                self._field_row(
                    definition.id,
                    definition.name,
                    definition.field_type,
                    definition.required,
                    definition.description,
                    definition.options,
                    value,
                    is_builtin_field(definition.id, definition.type_id, definition.name),
                )
            )
        for name, value in self._current.custom_fields.items():
            if name not in known:
                rows.append(
                    self._field_row("", name, "json", False, "兼容保留的扩展属性", [], value, False)
                )
        self.fieldModel.replace(rows)
        self.fieldsChanged.emit()

    @staticmethod
    def _field_row(
        field_id: str,
        name: str,
        field_type: str,
        required: bool,
        description: str,
        options: list[str],
        value: Any,
        is_builtin: bool,
    ) -> dict[str, Any]:
        value_json = json.dumps(value, ensure_ascii=False, indent=2) if value is not None else ""
        if isinstance(value, (dict, list)):
            value_text = json.dumps(value, ensure_ascii=False)
        elif value is None:
            value_text = ""
        else:
            value_text = str(value)
        return {
            "id": field_id,
            "name": name,
            "fieldType": field_type,
            "isRequired": bool(required),
            "description": description or "",
            "optionsJson": json.dumps(options or [], ensure_ascii=False),
            "valueJson": value_json,
            "valueText": value_text,
            "isBuiltin": is_builtin,
        }

    def _reload_timeline(self) -> None:
        if not self._service:
            self.timelineModel.replace([])
            self.timelineChanged.emit()
            return
        rows = self._service.timeline.entries(type_id=self._timeline_type_filter or None)
        self.timelineModel.replace(
            [
                {
                    "id": row.get("id", ""),
                    "entityId": row.get("entity_id", ""),
                    "name": row.get("name", ""),
                    "typeId": row.get("type_id", ""),
                    "dateKind": row.get("date_kind", ""),
                    "label": row.get("label", "") or row.get("date_kind", ""),
                    "year": row.get("year"),
                    "endYear": row.get("end_year"),
                    "dateText": row.get("date_value", "") or "",
                }
                for row in rows
            ]
        )
        self.timelineChanged.emit()

    def _reload_dates(self) -> None:
        rows = self._current.dates if self._current else []
        prepared = []
        for row in rows:
            value = dict(row)
            year = value.get("year")
            end_year = value.get("end_year")
            date_value = value.get("date_value") or ""
            precision = value.get("precision") or "year"
            if precision == "exact":
                components = re.match(r"^[+-]?\d{1,6}(?:-(\d{2})(?:-(\d{2}))?)?$", date_value)
                precision = (
                    "day"
                    if components and components.group(2)
                    else ("month" if components and components.group(1) else "year")
                )
            if year is None and date_value:
                try:
                    year = self._year_from_date(date_value)
                except ValueError:
                    year = None
            if end_year is None and value.get("end_date_value"):
                try:
                    end_year = self._year_from_date(value["end_date_value"])
                except ValueError:
                    end_year = None
            prepared.append(
                {
                    "id": str(value.get("id") or ""),
                    "dateKind": str(value.get("date_kind") or "custom"),
                    "label": str(value.get("label") or ""),
                    "year": year,
                    "endYear": end_year,
                    "dateText": date_value,
                    "precision": precision,
                    "endDateText": str(value.get("end_date_value") or ""),
                }
            )
        prepared.sort(
            key=lambda row: (row["year"] is None, row["year"] or 0, row["label"].casefold())
        )
        self.dateModel.replace(prepared)
        self.datesChanged.emit()

    @staticmethod
    def _year_from_date(value: str) -> int:
        match = re.match(r"^([+-]?\d{1,6})(?:-|$)", str(value).strip())
        if not match:
            raise ValueError("日期请使用 YYYY、YYYY-MM 或 YYYY-MM-DD")
        return int(match.group(1))

    def _reload_validation(self) -> None:
        if not self._service:
            self.validationModel.replace([])
            self.validationChanged.emit()
            return
        rows = self._service.validation.scan()
        self.validationModel.replace(
            [
                {
                    "kind": issue.kind,
                    "message": issue.message,
                    "entityId": issue.entity_id or "",
                    "relationId": issue.relation_id or "",
                }
                for issue in rows
            ]
        )
        self.validationChanged.emit()

    def _graph_data(self) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        if not self._service:
            return [], []
        center_id = self.currentEntityId
        if self._graph_scope == "neighbors" and center_id:
            node_ids = [center_id]
            related = self._service.relation_rows(center_id)
            node_ids.extend(
                other_id
                for row in related
                if (other_id := str(row.get("other_id") or "")) and other_id not in node_ids
            )
            edge_rows = [
                {
                    "source_id": center_id,
                    "target_id": str(row.get("other_id") or ""),
                    "label": str(row.get("display_label") or row.get("label") or "相关"),
                }
                for row in related
            ]
        else:
            node_ids = [
                row[0]
                for row in self._conn.execute(
                    "SELECT id FROM entities WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE, id"
                ).fetchall()
            ]
            edge_rows = [
                dict(row)
                for row in self._conn.execute(
                    "SELECT source_id, target_id, label FROM relations ORDER BY created_at, id"
                ).fetchall()
            ]
            if center_id in node_ids:
                node_ids.remove(center_id)
                node_ids.insert(0, center_id)
        nodes = []
        count = max(1, len(node_ids))
        for index, entity_id in enumerate(node_ids):
            entity = self._service.entities.get(entity_id)
            if entity is None:
                continue
            if entity_id == center_id:
                x, y = 0.5, 0.5
            else:
                position = index if not center_id or node_ids[0] != center_id else index - 1
                angle = 2 * math.pi * position / count - math.pi / 2
                radius = 0.40 if self._graph_scope == "neighbors" else 0.44
                x = 0.5 + radius * math.cos(angle)
                y = 0.5 + radius * math.sin(angle)
            nodes.append(
                {
                    "id": entity.id,
                    "name": entity.name,
                    "type_name": self._types.get(entity.type_id, entity.type_id),
                    "color": entity.color,
                    "x": x,
                    "y": y,
                    "is_center": entity_id == center_id,
                }
            )
        valid_ids = {row["id"] for row in nodes}
        edges = []
        for row in edge_rows:
            source_id = str(row.get("source_id") or "")
            target_id = str(row.get("target_id") or "")
            if source_id not in valid_ids or target_id not in valid_ids:
                continue
            edges.append(
                {
                    "source_id": source_id,
                    "target_id": target_id,
                    "label": str(row.get("label") or "相关"),
                }
            )
        return nodes, edges

    def _reload_graph(self) -> None:
        nodes, edges = self._graph_data()
        self.graphModel.replace(
            [
                {
                    "id": row["id"],
                    "name": row["name"],
                    "typeName": row["type_name"],
                    "nodeColor": row["color"],
                    "positionX": row["x"],
                    "positionY": row["y"],
                    "isCenter": row["is_center"],
                }
                for row in nodes
            ]
        )
        node_index = {row["id"]: index for index, row in enumerate(nodes)}
        self._graph_json = json.dumps(
            {
                "nodes": [{"x": row["x"], "y": row["y"]} for row in nodes],
                "edges": [
                    {
                        "source": node_index[row["source_id"]],
                        "target": node_index[row["target_id"]],
                        "label": row["label"],
                    }
                    for row in edges
                    if row["source_id"] in node_index and row["target_id"] in node_index
                ],
            }
        )
        self.graphChanged.emit()

    @Slot(str)
    def setGraphScope(self, scope: str) -> None:
        scope = "neighbors" if str(scope) == "neighbors" else "all"
        if scope == self._graph_scope:
            return
        self._graph_scope = scope
        self._reload_graph()

    def _reload_relations(self) -> None:
        if not self._service or not self._current:
            self.relationModel.replace([])
            self.relationsChanged.emit()
            return
        self.relationModel.replace(
            [
                {
                    "id": row.get("id", ""),
                    "otherId": row.get("other_id", ""),
                    "otherName": row.get("other_name", "（无效引用）"),
                    "label": row.get("display_label", row.get("label", "")),
                    "direction": row.get("direction", ""),
                    "notes": row.get("notes", ""),
                    "reverseLabel": row.get("reverse_label", ""),
                }
                for row in self._service.relation_rows(self._current.id)
            ]
        )
        self.relationsChanged.emit()

    def _load_project_meta(self) -> None:
        self._project_meta = dict(self.DEFAULT_PROJECT_META)
        if not self._conn:
            return
        self._project_meta.update(
            {
                str(row["key"]): str(row["value"])
                for row in self._conn.execute("SELECT key, value FROM project_meta").fetchall()
            }
        )

    def _write_project_meta(self, values: dict[str, str]) -> None:
        if not self._conn:
            raise RuntimeError("请先打开资料库")
        with self._conn:
            self._conn.executemany(
                "INSERT INTO project_meta(key,value) VALUES(?,?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                [(key, value) for key, value in values.items()],
            )
        self._project_meta.update(values)

    @Slot(str, result=bool)
    def openProject(self, path: str) -> bool:
        path = str(path or "").strip()
        if path.startswith("file:"):
            path = QUrl(path).toLocalFile()
        if not path:
            return False
        if self._dirty:
            self._pending_action = ("open", path)
            self.discardConfirmationRequested.emit()
            return False
        return self._open_project_now(path)

    def _open_project_now(self, path: str) -> bool:
        new_conn = None
        try:
            new_conn = connect(path)
            new_service = ProjectService(new_conn)
            old_conn = self._conn
            self._conn = new_conn
            self._service = new_service
            self._path = str(Path(path).expanduser().resolve())
            self._load_project_meta()
            self._current = None
            self._current_is_new = False
            self._preview = None
            if self._query:
                self._query = ""
                self.queryChanged.emit()
            if self._type_filter:
                self._type_filter = ""
                self.typeFilterChanged.emit()
            if self._timeline_type_filter:
                self._timeline_type_filter = ""
                self.timelineFilterChanged.emit()
            self._set_dirty(False)
            if old_conn is not None:
                old_conn.close()
            self._reload_types()
            self._reload_entities()
            self._reload_relation_targets()
            self._reload_timeline()
            self._reload_dates()
            self._reload_fields()
            self._reload_validation()
            self._reload_relations()
            self._reload_graph()
            self._emit_current()
            self._set_status(f"已打开项目：{Path(self._path).name}")
            self.projectChanged.emit()
            return True
        except Exception as exc:  # UI boundary: display actionable error, keep app alive.
            if new_conn is not None and new_conn is not self._conn:
                new_conn.close()
            self._set_status(f"打开项目失败：{exc}")
            return False

    @Slot(result=bool)
    def chooseAndOpenProject(self) -> bool:
        path, _ = QFileDialog.getOpenFileName(
            None,
            "打开 Aethercod 项目",
            str(Path.home()),
            "Aethercod 项目 (*.aethercod);;旧版项目 (*.db *.sqlite *.sqlite3);;所有文件 (*)",
        )
        return self.openProject(path) if path else False

    @Slot(result=bool)
    def chooseAndCreateProject(self) -> bool:
        return self.chooseAndCreateProjectWithSettings("新的世界", "泰拉纪元", "", "")

    @Slot(str, str, str, str, result=bool)
    def chooseAndCreateProjectWithSettings(
        self, name: str, era_name: str, author: str, description: str
    ) -> bool:
        name = str(name or "").strip()
        era_name = str(era_name or "").strip()
        if not name:
            self._set_status("资料库名称不能为空")
            return False
        if not era_name:
            self._set_status("纪年法名称不能为空")
            return False
        path, _ = QFileDialog.getSaveFileName(
            None,
            "新建 Aethercod 项目",
            str(Path.home() / f"{self._safe_filename(name)}.aethercod"),
            "Aethercod 项目 (*.aethercod)",
        )
        if not path:
            return False
        return self.createProject(path, name, era_name, author, description)

    @Slot(str, str, str, str, str, result=bool)
    def createProject(
        self, path: str, name: str, era_name: str, author: str, description: str
    ) -> bool:
        path = str(path or "").strip()
        name = str(name or "").strip()
        era_name = str(era_name or "").strip()
        author = str(author or "").strip()
        description = str(description or "").strip()
        if not path or not name or not era_name:
            self._set_status("请填写资料库名称、纪年法名称和保存位置")
            return False
        if Path(path).suffix.lower() != ".aethercod":
            selected = Path(path)
            path = (
                str(selected.with_suffix(".aethercod")) if selected.suffix else f"{path}.aethercod"
            )
        if Path(path).exists():
            self._set_status("项目文件已存在，请选择一个尚不存在的文件名")
            return False
        payload = {
            "path": path,
            "name": name,
            "era_name": era_name,
            "author": author,
            "description": description,
        }
        if self._dirty:
            self._pending_action = ("create", json.dumps(payload, ensure_ascii=False))
            self.discardConfirmationRequested.emit()
            return False
        return self._create_project_now(payload)

    def _create_project_now(self, payload: dict[str, str]) -> bool:
        path = payload["path"]
        if Path(path).exists():
            self._set_status("项目文件已存在，请选择一个尚不存在的文件名")
            return False
        if not self._open_project_now(path):
            return False
        try:
            self._write_project_meta(
                {
                    "name": payload["name"],
                    "era_name": payload["era_name"],
                    "author": payload["author"],
                    "description": payload["description"],
                }
            )
            self.projectChanged.emit()
            self.timelineChanged.emit()
            self._set_status(f"已创建资料库：{payload['name']}")
            return True
        except Exception as exc:
            self._set_status(f"创建资料库失败：{exc}")
            return False

    @Slot(str, str, str, str, result=bool)
    def updateProjectSettings(
        self, name: str, era_name: str, author: str, description: str
    ) -> bool:
        if not self._service or self.readOnly:
            return False
        name = str(name or "").strip()
        era_name = str(era_name or "").strip()
        if not name or not era_name:
            self._set_status("资料库名称和纪年法名称不能为空")
            return False
        try:
            self._write_project_meta(
                {
                    "name": name,
                    "era_name": era_name,
                    "author": str(author or "").strip(),
                    "description": str(description or "").strip(),
                }
            )
            self.projectChanged.emit()
            self.timelineChanged.emit()
            self._set_status("资料库设置已保存")
            return True
        except Exception as exc:
            self._set_status(f"保存资料库设置失败：{exc}")
            return False

    @Slot()
    def closeProject(self) -> None:
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:
                pass
        self._service = None
        self._conn = None
        self._path = ""
        self._project_meta = dict(self.DEFAULT_PROJECT_META)
        self._current = None
        self._current_is_new = False
        self._preview = None
        self._pending_action = None
        if self._timeline_type_filter:
            self._timeline_type_filter = ""
            self.timelineFilterChanged.emit()
        self._set_dirty(False)
        self._reload_types()
        self._reload_entities()
        self._reload_relation_targets()
        self._reload_timeline()
        self._reload_dates()
        self._reload_fields()
        self._reload_validation()
        self._reload_relations()
        self._reload_graph()
        self.projectChanged.emit()
        self._emit_current()
        self._set_status("资料库已关闭")

    @Slot()
    def requestCloseProject(self) -> None:
        if not self._service:
            return
        if self._dirty:
            self._pending_action = ("close_project", "")
            self.discardConfirmationRequested.emit()
            return
        self.closeProject()

    @Slot()
    def refresh(self) -> None:
        if not self._service:
            return
        selected_id = self.currentEntityId
        self._reload_types()
        self._reload_entities()
        self._reload_relation_targets()
        self._reload_timeline()
        self._reload_validation()
        if selected_id and not self._dirty:
            self._load_entity(selected_id)
        else:
            self._reload_relations()
            self._reload_graph()
            if self._dirty:
                self._set_status("列表已刷新；当前未保存的词条保持不变")

    @Slot(str)
    def setQuery(self, value: str) -> None:
        value = str(value or "")
        if value == self._query:
            return
        self._query = value
        self.queryChanged.emit()
        self._reload_entities()

    @Slot(str)
    def setTypeFilter(self, type_id: str) -> None:
        type_id = str(type_id or "")
        if type_id == self._type_filter:
            return
        self._type_filter = type_id
        self.typeFilterChanged.emit()
        self._reload_entities()

    @Slot(str)
    def setTimelineTypeFilter(self, type_id: str) -> None:
        type_id = str(type_id or "")
        if type_id == self._timeline_type_filter:
            return
        self._timeline_type_filter = type_id
        self.timelineFilterChanged.emit()
        self._reload_timeline()

    @Slot(str)
    def selectEntity(self, entity_id: str) -> None:
        if not self._service or not entity_id:
            return
        if self._current and entity_id == self._current.id:
            return
        if self._dirty and self._current and entity_id != self._current.id:
            self._pending_action = ("select", entity_id)
            self.discardConfirmationRequested.emit()
            return
        self._load_entity(entity_id)

    def _load_entity(self, entity_id: str) -> None:
        if not self._service:
            return
        entity = self._service.entities.get(entity_id, include_deleted=False)
        if entity is None:
            self._set_status("词条不存在或已被删除")
            return
        self._current = entity
        self._current_is_new = False
        self._set_dirty(False)
        self._emit_current()
        self._reload_relation_targets()
        self._reload_dates()
        self._reload_fields()
        self._reload_relations()
        self._reload_graph()

    @Slot()
    def newEntity(self) -> None:
        if not self._service:
            self._set_status("请先打开项目")
            return
        if self._dirty and self._current:
            self._pending_action = ("new", "")
            self.discardConfirmationRequested.emit()
            return
        self._create_entity()

    def _create_entity(self) -> None:
        if not self._service:
            return
        type_id = self._type_filter or next(iter(self._types), "")
        if not type_id:
            self._set_status("项目中没有可用词条类型")
            return
        try:
            self._current = self._service.new_entity(type_id)
            self._current_is_new = True
            self._set_dirty(True)
            self._emit_current()
            self._reload_dates()
            self._reload_fields()
            self._reload_relations()
            self._reload_graph()
            self._set_status("正在编辑新词条")
        except Exception as exc:
            self._set_status(f"新建词条失败：{exc}")

    @Slot(str, str)
    def setCurrentField(self, field: str, value: str) -> None:
        if not self._current or self.readOnly:
            return
        field = str(field)
        value = str(value or "")
        if field == "name":
            if self._current.name == value:
                return
            self._current.name = value
        elif field == "summary":
            if self._current.summary == value:
                return
            self._current.summary = value
        elif field == "notes":
            if self._current.notes == value:
                return
            self._current.notes = value
        elif field == "typeId":
            if self._current.type_id == value:
                return
            self._current.type_id = value
            self._reload_fields()
        elif field == "aliases":
            aliases = [part.strip() for part in value.split(",") if part.strip()]
            if self._current.aliases == aliases:
                return
            self._current.aliases = aliases
        elif field == "tags":
            tags = [part.strip() for part in value.split(",") if part.strip()]
            if self._current.tags == tags:
                return
            self._current.tags = tags
        elif field == "customFields":
            try:
                parsed = json.loads(value or "{}")
            except json.JSONDecodeError as exc:
                self._set_status(f"自定义属性 JSON 格式错误：第 {exc.lineno} 行")
                return
            if not isinstance(parsed, dict):
                self._set_status("自定义属性必须是 JSON 对象")
                return
            if self._current.custom_fields == parsed:
                return
            self._current.custom_fields = parsed
        elif field == "color" and value:
            if self._current.color == value:
                return
            self._current.color = value
        else:
            return
        self._set_dirty(True)
        self._emit_current()

    @Slot(str, str)
    def setCustomFieldValue(self, field_name: str, value_json: str) -> None:
        if not self._current or self.readOnly:
            return
        field_name = str(field_name or "").strip()
        if not field_name:
            return
        try:
            value = json.loads(value_json)
        except json.JSONDecodeError as exc:
            self._set_status(f"属性「{field_name}」格式错误：第 {exc.lineno} 行")
            return
        if (
            self._current.custom_fields.get(field_name) == value
            and field_name in self._current.custom_fields
        ):
            return
        self._current.custom_fields[field_name] = value
        self._set_dirty(True)
        self._reload_fields()
        self._emit_current()

    @Slot(str, str, str, bool, str, str, result=bool)
    def saveFieldDefinition(
        self,
        field_id: str,
        name: str,
        field_type: str,
        required: bool,
        description: str,
        options_text: str,
    ) -> bool:
        if not self._service or not self._current or self.readOnly:
            return False
        options = [part.strip() for part in str(options_text or "").split(",") if part.strip()]
        try:
            field_id = str(field_id or "").strip()
            name = str(name or "").strip()
            field_type = str(field_type or "text").strip().lower()
            if not name:
                raise ValueError("属性名称不能为空")
            if field_type in {"choice", "select", "enum", "multiselect"} and not options:
                raise ValueError("选择类型至少需要一个选项")
            if field_id:
                previous = self._service.fields.get(field_id)
                self._service.fields.update(
                    field_id,
                    name=name,
                    field_type=field_type,
                    required=required,
                    description=str(description or "").strip(),
                    options=options,
                )
                if (
                    previous
                    and previous.name != name
                    and previous.name in self._current.custom_fields
                ):
                    self._current.custom_fields[name] = self._current.custom_fields.pop(
                        previous.name
                    )
                message = "属性定义已更新"
            else:
                self._service.fields.create(
                    self._current.type_id,
                    name,
                    field_type,
                    required,
                    str(description or "").strip(),
                    options,
                )
                message = "属性定义已添加"
            if not self._dirty:
                self._current = self._service.entities.get(self._current.id) or self._current
            self._reload_fields()
            self._emit_current()
            self._set_status(message)
            return True
        except Exception as exc:
            self._set_status(f"属性定义保存失败：{exc}")
            return False

    @Slot(str)
    def deleteFieldDefinition(self, field_id: str) -> None:
        if not self._service or not self._current or self.readOnly:
            return
        field_id = str(field_id or "").strip()
        if not field_id:
            return
        try:
            definition = self._service.fields.get(field_id)
            if definition is None:
                return
            self._service.fields.delete(field_id)
            self._current.custom_fields.pop(definition.name, None)
            self._reload_fields()
            self._emit_current()
            self._set_status("自定义属性定义已删除")
        except Exception as exc:
            self._set_status(f"删除属性定义失败：{exc}")

    @Slot(str, str, str, str, str, str, str, str, result=bool)
    def saveDate(
        self,
        date_id: str,
        date_kind: str,
        label: str,
        year_text: str,
        precision: str,
        date_value: str,
        end_year_text: str,
        end_date_value: str,
    ) -> bool:
        if not self._current or self.readOnly:
            return False
        try:
            year = int(year_text) if str(year_text).strip() else None
            end_year = int(end_year_text) if str(end_year_text).strip() else None
            date_value = str(date_value or "").strip() or None
            end_date_value = str(end_date_value or "").strip() or None
            if year is None and date_value:
                year = self._year_from_date(date_value)
            if end_year is None and end_date_value:
                end_year = self._year_from_date(end_date_value)
            precision = str(precision or "year").strip().lower()
            if precision == "year":
                date_value = None
            if precision != "range":
                end_year = None
                end_date_value = None
            elif end_date_value is None and end_year is None:
                raise ValueError("年份范围需要填写结束年份")
            kind = str(date_kind or "custom").strip() or "custom"
            validate_date_parts(year, date_value, precision, end_year, end_date_value)
            new_date = {
                "id": str(date_id or "").strip(),
                "date_kind": kind,
                "label": str(label or "").strip() or kind,
                "year": year,
                "date_value": date_value,
                "precision": precision,
                "end_year": end_year,
                "end_date_value": end_date_value,
            }
            if new_date["id"]:
                found = False
                for index, current in enumerate(self._current.dates):
                    if str(current.get("id") or "") == new_date["id"]:
                        self._current.dates[index] = new_date
                        found = True
                        break
                if not found:
                    new_date["id"] = new_uuid()
                    self._current.dates.append(new_date)
            else:
                new_date["id"] = new_uuid()
                self._current.dates.append(new_date)
            self._set_dirty(True)
            self._reload_dates()
            self._emit_current()
            self._set_status("日期已更新，保存词条后写入项目")
            return True
        except (ValueError, TypeError) as exc:
            self._set_status(f"日期无效：{exc}")
            return False

    @Slot(str)
    def removeDate(self, date_id: str) -> None:
        if not self._current or self.readOnly:
            return
        date_id = str(date_id or "")
        self._current.dates = [
            row for row in self._current.dates if str(row.get("id") or "") != date_id
        ]
        self._set_dirty(True)
        self._reload_dates()
        self._emit_current()

    @Slot(result=bool)
    def saveEntity(self) -> bool:
        if not self._service or not self._current:
            self._set_status("没有正在编辑的词条")
            return False
        try:
            saved = self._service.save_entity(self._current)
            self._current = saved
            self._current_is_new = False
            self._set_dirty(False)
            self._reload_entities()
            self._reload_relation_targets()
            self._reload_timeline()
            self._reload_dates()
            self._reload_fields()
            self._reload_validation()
            self._reload_relations()
            self._reload_graph()
            self._emit_current()
            self._set_status(f"已保存：{saved.name}")
            return True
        except Exception as exc:
            self._set_status(f"保存失败：{exc}")
            return False

    @Slot(result=bool)
    def deleteEntity(self) -> bool:
        if not self._service or not self._current or self.readOnly:
            return False
        if self._dirty:
            self._set_status("请先保存或放弃当前修改，再删除词条")
            return False
        try:
            self._service.entities.soft_delete(self._current.id)
            self._current = None
            self._current_is_new = False
            self._set_dirty(False)
            self._reload_entities()
            self._reload_relation_targets()
            self._reload_timeline()
            self._reload_validation()
            self._reload_relations()
            self._reload_graph()
            self._emit_current()
            self._set_status("词条已移入回收站")
            return True
        except Exception as exc:
            self._set_status(f"删除失败：{exc}")
            return False

    @Slot(str)
    def previewEntity(self, entity_id: str) -> None:
        if not self._service or not entity_id:
            return
        self._preview = self._service.entities.get(entity_id, include_deleted=False)
        self.previewChanged.emit()

    @Slot(str)
    def openRelation(self, other_id: str) -> None:
        self.selectEntity(other_id)

    @Slot(str)
    def prepareRelation(self, relation_id: str = "") -> None:
        self._relation_edit_id = str(relation_id or "")
        self._relation_target_id = ""
        self._relation_label = ""
        self._relation_reverse_label = ""
        self._relation_notes = ""
        if self._service and self._current and self._relation_edit_id:
            relation = self._service.relations.get(self._relation_edit_id)
            if relation:
                if relation.source_id == self._current.id:
                    self._relation_target_id = relation.target_id
                    self._relation_label = relation.label
                    self._relation_reverse_label = relation.reverse_label
                else:
                    self._relation_target_id = relation.source_id
                    self._relation_label = relation.reverse_label or relation.label
                    self._relation_reverse_label = relation.label
                self._relation_notes = relation.notes
        self.relationEditorChanged.emit()

    @Slot(str, str, str, str, result=bool)
    def saveRelation(self, target_id: str, label: str, reverse_label: str, notes: str) -> bool:
        if not self._service or not self._current or self.readOnly:
            return False
        if self._dirty:
            self._set_status("请先保存当前词条修改，再编辑关联")
            return False
        try:
            target_id = str(target_id or "").strip()
            label = str(label or "").strip()
            reverse_label = str(reverse_label or "").strip()
            notes = str(notes or "").strip()
            if not target_id or target_id == self._current.id:
                raise ValueError("请选择另一个词条")
            if not label:
                raise ValueError("请填写关系名称")
            if self._relation_edit_id:
                relation = self._service.relations.get(self._relation_edit_id)
                if relation is None:
                    raise ValueError("该关系已不存在")
                if relation.source_id == self._current.id:
                    self._service.relations.update(
                        relation.id,
                        target_id=target_id,
                        label=label,
                        reverse_label=reverse_label,
                        notes=notes,
                    )
                else:
                    self._service.relations.update(
                        relation.id,
                        source_id=target_id,
                        target_id=self._current.id,
                        label=reverse_label or label,
                        reverse_label=label,
                        notes=notes,
                    )
                result_message = "关联已更新"
            else:
                self._service.new_relation(self._current.id, target_id, label, reverse_label, notes)
                result_message = "关联已创建"
            self._reload_relations()
            self._reload_graph()
            self._reload_validation()
            self._set_status(result_message)
            self.prepareRelation("")
            return True
        except Exception as exc:
            self._set_status(f"关联保存失败：{exc}")
            return False

    @Slot(str)
    def deleteRelation(self, relation_id: str) -> None:
        if not self._service or self.readOnly or self._dirty:
            return
        try:
            self._service.relations.delete(str(relation_id))
            self._reload_relations()
            self._reload_graph()
            self._reload_validation()
            self._set_status("关联已删除")
        except Exception as exc:
            self._set_status(f"删除关联失败：{exc}")

    @Slot()
    def chooseAndExportLibrary(self) -> bool:
        if not self._service or not self._conn or self._dirty:
            if self._dirty:
                self._set_status("请先保存或放弃当前修改，再导出资料库")
            return False
        path, _ = QFileDialog.getSaveFileName(
            None,
            "导出资料库",
            str(Path(self._path).with_suffix(".json")),
            "Aethercod JSON (*.json)",
        )
        if not path:
            return False
        if not Path(path).suffix:
            path += ".json"
        try:
            write_json(export_library(self._conn), path)
            self._set_status(f"已导出资料库：{Path(path).name}")
            return True
        except Exception as exc:
            self._set_status(f"导出失败：{exc}")
            return False

    @Slot(result=bool)
    def chooseAndBackupProject(self) -> bool:
        if not self._service or not self._path or self._dirty:
            if self._dirty:
                self._set_status("请先保存或放弃当前修改，再备份资料库")
            return False
        path, _ = QFileDialog.getSaveFileName(
            None,
            "备份资料库",
            str(Path(self._path).with_name(f"{Path(self._path).stem}.backup.aethercod")),
            "Aethercod 项目 (*.aethercod)",
        )
        if not path:
            return False
        if Path(path).suffix.lower() != ".aethercod":
            path += ".aethercod"
        if Path(path).resolve() == Path(self._path).resolve():
            self._set_status("备份文件不能覆盖当前资料库")
            return False
        try:
            backup_project(self._path, path)
            self._set_status(f"已备份资料库：{Path(path).name}")
            return True
        except Exception as exc:
            self._set_status(f"备份失败：{exc}")
            return False

    @Slot()
    def chooseAndImportLibrary(self) -> bool:
        if not self._service or not self._conn or self.readOnly or self._dirty:
            if self._dirty:
                self._set_status("请先保存或放弃当前修改，再导入资料库")
            return False
        path, _ = QFileDialog.getOpenFileName(
            None,
            "导入 Aethercod JSON",
            str(Path(self._path).parent),
            "Aethercod JSON (*.json);;所有文件 (*)",
        )
        if not path:
            return False
        try:
            counts = import_library(self._conn, read_json(path))
            self._load_project_meta()
            self.projectChanged.emit()
            self._reload_types()
            self._reload_entities()
            self._reload_relation_targets()
            self._reload_timeline()
            self._reload_validation()
            if self._current:
                self._load_entity(self._current.id)
            message = "、".join(f"{key} {value}" for key, value in counts.items())
            self._set_status(f"导入完成：{message}")
            return True
        except Exception as exc:
            self._set_status(f"导入失败：{exc}")
            return False

    @Slot()
    def chooseAndExportGraph(self) -> bool:
        nodes, edges = self._graph_data()
        if not nodes:
            self._set_status("当前资料库没有可导出的关系网络")
            return False
        export_name = self._current.name if self._current else self.projectName
        path, _ = QFileDialog.getSaveFileName(
            None,
            "导出关系图",
            str(Path(self._path).with_name(f"{self._safe_filename(export_name)}-关系图.png")),
            "PNG 图片 (*.png)",
        )
        if not path:
            return False
        if not Path(path).suffix:
            path += ".png"
        return self.exportGraphPng(path)

    @staticmethod
    def _safe_filename(value: str) -> str:
        safe = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", str(value)).strip(" .")
        return safe or "词条"

    @Slot(str, result=bool)
    def exportGraphPng(self, path: str) -> bool:
        nodes, edges = self._graph_data()
        if not nodes:
            self._set_status("请先选择一个词条，再导出其关系网络")
            return False
        view = GraphView()
        view.set_theme(self._dark)
        view.load_graph(nodes, edges)
        try:
            view.export_png(path)
            self._set_status(f"已导出关系图：{Path(path).name}")
            return True
        except Exception as exc:
            self._set_status(f"关系图导出失败：{exc}")
            return False
        finally:
            view._timer.stop()
            view.close()

    @Slot(str, str)
    def openValidationIssue(self, entity_id: str, relation_id: str) -> None:
        entity_id = str(entity_id or "")
        relation_id = str(relation_id or "")
        if not entity_id and relation_id and self._service:
            try:
                relation = self._service.relations.get(relation_id)
                entity_id = relation.source_id if relation else ""
            except ValueError:
                self._set_status("该问题来自无效关系 ID，无法跳转到词条")
                return
        if entity_id:
            try:
                self.selectEntity(entity_id)
            except ValueError:
                self._set_status("该问题引用的词条 ID 无效，无法跳转")

    @Slot()
    def toggleTheme(self) -> None:
        self._dark = not self._dark
        QSettings("Aethercod", "Aethercod").setValue("ui/dark", self._dark)
        self.themeChanged.emit()

    @Slot()
    def closePreview(self) -> None:
        self._preview = None
        self.previewChanged.emit()

    @Slot()
    def discardAndContinue(self) -> None:
        action = self._pending_action
        self._pending_action = None
        self._set_dirty(False)
        if not action:
            return
        if action[0] == "select":
            self._load_entity(action[1])
        elif action[0] == "new":
            self._create_entity()
        elif action[0] == "open":
            self._open_project_now(action[1])
        elif action[0] == "create":
            self._create_project_now(json.loads(action[1]))
        elif action[0] == "close_project":
            self.closeProject()
        elif action[0] == "close":
            self.closeWindowRequested.emit()

    @Slot()
    def saveAndContinue(self) -> None:
        action = self._pending_action
        if not action or not self.saveEntity():
            return
        self._pending_action = None
        if action[0] == "select":
            self._load_entity(action[1])
        elif action[0] == "new":
            self._create_entity()
        elif action[0] == "open":
            self._open_project_now(action[1])
        elif action[0] == "create":
            self._create_project_now(json.loads(action[1]))
        elif action[0] == "close_project":
            self.closeProject()
        elif action[0] == "close":
            self.closeWindowRequested.emit()

    @Slot()
    def cancelPendingAction(self) -> None:
        self._pending_action = None

    @Slot()
    def requestClose(self) -> None:
        if self._dirty:
            self._pending_action = ("close", "")
            self.discardConfirmationRequested.emit()
        else:
            self.closeWindowRequested.emit()

    @Slot()
    def close(self) -> None:
        self.closeProject()
