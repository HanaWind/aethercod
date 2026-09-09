from __future__ import annotations

import json
from copy import deepcopy
from typing import Any

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDoubleSpinBox,
    QFormLayout,
    QHBoxLayout,
    QListWidget,
    QListWidgetItem,
    QLineEdit,
    QPlainTextEdit,
    QPushButton,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from .date_selector import WorldDateSelector

# Relation presets turn specialized concepts into ordinary Entity + Relation links.
RELATION_PRESETS = {
    "person": [
        ("出生地", "place", "出生于", "是出生地"),
        ("身份/地位（国家）", "polity", "担任", "由其担任"),
        ("身份/地位（机构）", "organization", "任职于", "任职者"),
        ("经历事件", "event", "经历", "参与者"),
    ],
    "polity": [
        ("领袖", "person", "由其领导", "领导"),
        ("首都", "place", "首都是", "是其首都"),
        ("行政区划", "place", "包含行政区", "属于"),
        ("所有城市", "place", "包含城市", "属于"),
    ],
    "place": [
        ("所属国家", "polity", "属于", "包含地区"),
        ("上级行政区", "place", "隶属于", "包含"),
        ("相关事件", "event", "发生过", "发生于"),
    ],
    "organization": [
        ("负责人", "person", "由其负责", "负责"),
        ("成员", "person", "成员包括", "加入"),
        ("总部", "place", "总部位于", "驻有总部"),
        ("分支", "branch", "下设", "隶属"),
    ],
    "branch": [
        ("上级机构", "organization", "隶属于", "下设"),
        ("负责人", "person", "由其负责", "负责"),
        ("驻地", "place", "驻于", "驻有"),
    ],
    "event": [
        ("地点", "place", "发生于", "发生过"),
        ("参与人物", "person", "参与者", "经历"),
        ("参与国家", "polity", "相关国家", "参与"),
        ("参与机构", "organization", "相关机构", "参与"),
    ],
    "item": [
        ("创造者", "person", "由其创造", "创造"),
        ("持有者", "person", "由其持有", "持有"),
        ("来源地", "place", "源于", "出产"),
        ("所属机构", "organization", "属于", "拥有"),
    ],
    "species": [
        ("原生地区", "place", "原生于", "分布有"),
        ("分布国家", "polity", "分布于", "分布有"),
    ],
    "concept": [
        ("使用者", "person", "由其使用", "使用"),
        ("相关机构", "organization", "相关机构", "研究/使用"),
        ("相关事件", "event", "相关事件", "涉及"),
    ],
}

DATE_SPECS = {
    "person": [("出生日期", "birth"), ("死亡日期", "death")],
    "polity": [("建立日期", "founded"), ("终结日期", "dissolved")],
    "place": [("建立/发现日期", "founded")],
    "organization": [("成立日期", "founded"), ("解散日期", "dissolved")],
    "branch": [("成立日期", "founded"), ("解散日期", "dissolved")],
    "event": [("开始日期", "event_start"), ("结束日期", "event_end")],
    "item": [("创造日期", "created")],
}


class OptionalNumber(QWidget):
    """An explicit presence toggle keeps unset distinct from numeric zero."""

    changed = Signal()

    def __init__(self, integer: bool, required: bool = False):
        super().__init__()
        self.present = QCheckBox("已设置")
        self.spin = QSpinBox() if integer else QDoubleSpinBox()
        self.spin.setRange(-2_000_000_000, 2_000_000_000)
        if not integer:
            self.spin.setDecimals(8)
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.present)
        layout.addWidget(self.spin)
        self.present.setChecked(required)
        self.present.setVisible(not required)
        self.spin.setEnabled(required)
        self.present.toggled.connect(self.spin.setEnabled)
        self.present.toggled.connect(self.changed)
        self.spin.valueChanged.connect(self.changed)

    def value(self):
        return self.spin.value() if self.present.isChecked() else None

    def set_value(self, value):
        self.present.setChecked(value is not None)
        try:
            self.spin.setValue(value if value is not None else 0)
        except (TypeError, ValueError, OverflowError):
            self.spin.setValue(0)


class SpecializedForm(QWidget):
    relation_requested = Signal(str, object, str, str)
    changed = Signal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.type_id = ""
        self.fields: dict[str, QWidget] = {}
        self._definitions: dict[str, dict[str, Any]] = {}
        self._entities: list[dict[str, Any]] = []
        self._loading = False
        self._original_values: dict[str, Any] = {}
        self._baseline: dict[str, Any] = {}
        self.date_widgets: dict[str, WorldDateSelector] = {}
        self.date_entries: list[tuple[str, WorldDateSelector]] = []
        self._layout = QVBoxLayout(self)
        self._layout.setContentsMargins(0, 0, 0, 0)
        self.form = QFormLayout()
        self.date_box = QVBoxLayout()
        self.relations = QVBoxLayout()
        self._layout.addLayout(self.form)
        self._layout.addLayout(self.date_box)
        self._layout.addLayout(self.relations)
        self._layout.addStretch()

    def set_type(
        self,
        type_id: str,
        definitions: list[dict[str, Any]] | None = None,
        entities: list[dict[str, Any]] | None = None,
    ) -> None:
        self._loading = True
        self._original_values = {}
        self._baseline = {}
        self.type_id = type_id
        self._entities = entities or []
        self.fields.clear()
        self._definitions.clear()
        self._clear_layout(self.form)
        self._clear_layout(self.date_box)
        self._clear_layout(self.relations)

        seen: set[str] = set()
        for definition in definitions or []:
            key = str(definition.get("key") or definition.get("name", "")).strip()
            if not key or key in seen:
                continue
            seen.add(key)
            definition = dict(definition)
            definition["key"] = key
            widget = self._make_widget(definition)
            self.fields[key] = widget
            self._definitions[key] = definition
            label = str(definition.get("name", key))
            if definition.get("required"):
                label += " *"
            self.form.addRow(label, widget)
            self._connect_field(widget)

        self._set_dates([])

        for label, target_type, relation, reverse in RELATION_PRESETS.get(type_id, []):
            button = QPushButton(f"＋ 添加{label}")
            button.setProperty("class", "secondary")
            button.clicked.connect(
                lambda _=False, l=label, t=target_type, r=relation, rv=reverse: self.relation_requested.emit(
                    l, t, r, rv
                )
            )
            self.relations.addWidget(button)
        self._loading = False
        self.setVisible(bool(self.fields or self.date_entries or RELATION_PRESETS.get(type_id)))

    def _emit_changed(self, *args) -> None:
        if not self._loading:
            self.changed.emit()

    def _connect_field(self, widget) -> None:
        if isinstance(widget, OptionalNumber):
            widget.changed.connect(self._emit_changed)
        elif isinstance(widget, WorldDateSelector):
            widget.date_changed.connect(self._emit_changed)
        elif isinstance(widget, QListWidget):
            widget.itemChanged.connect(self._emit_changed)
        elif isinstance(widget, QCheckBox):
            widget.stateChanged.connect(self._emit_changed)
        elif isinstance(widget, QComboBox):
            if widget.isEditable():
                widget.currentTextChanged.connect(self._emit_changed)
            else:
                widget.currentIndexChanged.connect(self._emit_changed)
        else:
            widget.textChanged.connect(self._emit_changed)

    def _set_dates(self, dates: list[dict[str, Any]]) -> None:
        self._clear_layout(self.date_box)
        self.date_widgets.clear()
        self.date_entries.clear()
        labels = dict((kind, label) for label, kind in DATE_SPECS.get(self.type_id, []))
        for value in dates:
            kind = value.get("date_kind", "custom")
            selector = WorldDateSelector(str(value.get("label") or labels.get(kind, kind)))
            selector.set_value(value)
            selector.date_changed.connect(self._emit_changed)
            self.date_entries.append((kind, selector))
            self.date_widgets.setdefault(kind, selector)
            self.date_box.addWidget(selector)
        for kind, label in labels.items():
            if kind not in self.date_widgets:
                selector = WorldDateSelector(label)
                selector.date_changed.connect(self._emit_changed)
                self.date_widgets[kind] = selector
                self.date_entries.append((kind, selector))
                self.date_box.addWidget(selector)

    def _make_widget(self, definition: dict[str, Any]) -> QWidget:
        kind = str(definition.get("kind") or definition.get("field_type", "text")).lower()
        definition["kind"] = kind
        if kind in {"multiline", "long_text", "textarea"}:
            widget = QPlainTextEdit()
            widget.setMaximumHeight(100)
            return widget
        if kind in {"integer", "int", "number", "float"}:
            return OptionalNumber(kind in {"integer", "int"}, bool(definition.get("required")))
        if kind in {"boolean", "bool"}:
            widget = QCheckBox("是")
            widget.setTristate(not definition.get("required"))
            if widget.isTristate():
                widget.setCheckState(Qt.PartiallyChecked)
            return widget
        if kind == "date":
            return WorldDateSelector("")
        if kind == "json":
            widget = QPlainTextEdit()
            widget.setMaximumHeight(100)
            return widget
        if kind in {"enum", "choice", "select"}:
            widget = QComboBox()
            widget.setEditable(True)
            widget.addItem("", None)
            widget.addItems([str(value) for value in definition.get("options", [])])
            return widget
        if kind in {"entity", "entity_ref", "entity_reference"}:
            widget = QComboBox()
            widget.addItem("未选择", "")
            target_type = definition.get("target_type")
            for entity in self._entities:
                if not target_type or entity.get("type_id") == target_type:
                    widget.addItem(str(entity.get("name", "未命名")), entity.get("id"))
            return widget
        if kind in {"entity_refs", "entity_list", "multi_entity", "multiselect"}:
            widget = QListWidget()
            widget.setMaximumHeight(140)
            if kind == "multiselect":
                options = [(str(value), value) for value in definition.get("options", [])]
            else:
                options = [
                    (str(entity.get("name", "未命名")), entity.get("id"))
                    for entity in self._entities
                    if not definition.get("target_type")
                    or entity.get("type_id") == definition["target_type"]
                ]
            for label, value in options:
                self._add_choice(widget, label, value)
            return widget
        return QLineEdit()

    @staticmethod
    def _add_choice(widget, label, value):
        item = QListWidgetItem(label, widget)
        item.setData(Qt.UserRole, value)
        item.setFlags(item.flags() | Qt.ItemIsUserCheckable)
        item.setCheckState(Qt.Unchecked)
        item.setToolTip(str(value))
        return item

    def _field_value(self, widget):
        if isinstance(widget, OptionalNumber):
            return widget.value()
        if isinstance(widget, WorldDateSelector):
            return widget.date_text()
        if isinstance(widget, QListWidget):
            return [
                widget.item(i).data(Qt.UserRole)
                for i in range(widget.count())
                if widget.item(i).checkState() == Qt.Checked
            ]
        if isinstance(widget, QPlainTextEdit):
            return widget.toPlainText()
        if isinstance(widget, QCheckBox):
            return None if widget.checkState() == Qt.PartiallyChecked else widget.isChecked()
        if isinstance(widget, QComboBox):
            return (
                widget.currentData() if widget.currentData() is not None else widget.currentText()
            )
        return widget.text()

    def values(self) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        """Return detached typed fields and ordered, nonlossy date records.

        Invalid edited JSON/date components raise ValueError; loading never emits changed.
        """
        result = deepcopy(self._original_values)
        for key, widget in self.fields.items():
            value = self._field_value(widget)
            if key in self._baseline and value == self._baseline[key]:
                continue
            if self._definitions[key]["kind"] == "json" and value.strip():
                try:
                    value = json.loads(value)
                except ValueError as exc:
                    raise ValueError(f"Invalid JSON for {key}: {exc}") from exc
                result[key] = value
                continue
            if value not in ("", None, []):
                result[key] = value
            else:
                result.pop(key, None)
        dates = [
            value
            for kind, selector in self.date_entries
            if (value := selector.value(kind)) is not None
        ]
        return result, dates

    def set_values(self, values: dict[str, Any], dates: list[dict[str, Any]]) -> None:
        self._loading = True
        try:
            self._original_values = deepcopy(values)
            for key, widget in self.fields.items():
                value = values.get(key)
                if isinstance(widget, OptionalNumber):
                    widget.set_value(value)
                elif isinstance(widget, WorldDateSelector):
                    widget.set_date_text(value)
                elif isinstance(widget, QListWidget):
                    selected = value if isinstance(value, list) else []
                    for i in range(widget.count()):
                        item = widget.item(i)
                        item.setCheckState(
                            Qt.Checked if item.data(Qt.UserRole) in selected else Qt.Unchecked
                        )
                    known = [widget.item(i).data(Qt.UserRole) for i in range(widget.count())]
                    for ref in selected:
                        if ref not in known:
                            item = self._add_choice(widget, f"未找到: {ref}", ref)
                            item.setCheckState(Qt.Checked)
                            known.append(ref)
                elif isinstance(widget, QPlainTextEdit):
                    text = (
                        json.dumps(value, ensure_ascii=False, indent=2)
                        if self._definitions[key]["kind"] == "json" and key in values
                        else str(value) if value is not None else ""
                    )
                    widget.setPlainText(text)
                elif isinstance(widget, QCheckBox):
                    widget.setCheckState(
                        Qt.PartiallyChecked
                        if value is None and widget.isTristate()
                        else Qt.Checked if value else Qt.Unchecked
                    )
                elif isinstance(widget, QComboBox):
                    if widget.isEditable():
                        widget.setCurrentText(str(value) if value is not None else "")
                    else:
                        index = widget.findData(value or "")
                        if index < 0:
                            widget.addItem(f"未找到: {value}", value)
                            index = widget.count() - 1
                        widget.setCurrentIndex(index)
                else:
                    widget.setText(str(value) if value is not None else "")
            self._baseline = {
                key: deepcopy(self._field_value(widget)) for key, widget in self.fields.items()
            }
            self._set_dates(dates)
            self.setVisible(
                bool(self.fields or self.date_entries or RELATION_PRESETS.get(self.type_id))
            )
        finally:
            self._loading = False

    def set_read_only(self, read_only: bool) -> None:
        self.setEnabled(not read_only)

    @staticmethod
    def _clear_layout(layout) -> None:
        while layout.count():
            item = layout.takeAt(0)
            widget = item.widget()
            if widget:
                widget.deleteLater()
