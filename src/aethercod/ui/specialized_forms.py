from __future__ import annotations

from typing import Any

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDoubleSpinBox,
    QFormLayout,
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


class SpecializedForm(QWidget):
    relation_requested = Signal(str, object, str, str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.type_id = ""
        self.fields: dict[str, QWidget] = {}
        self._definitions: dict[str, dict[str, Any]] = {}
        self._entities: list[dict[str, Any]] = []
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

        self.date_widgets: dict[str, WorldDateSelector] = {}
        for label, kind in DATE_SPECS.get(type_id, []):
            selector = WorldDateSelector(label)
            self.date_widgets[kind] = selector
            self.date_box.addWidget(selector)

        for label, target_type, relation, reverse in RELATION_PRESETS.get(type_id, []):
            button = QPushButton(f"＋ 添加{label}")
            button.setProperty("class", "secondary")
            button.clicked.connect(
                lambda _=False, l=label, t=target_type, r=relation, rv=reverse: self.relation_requested.emit(
                    l, t, r, rv
                )
            )
            self.relations.addWidget(button)
        self.setVisible(bool(self.fields or self.date_widgets or RELATION_PRESETS.get(type_id)))

    def _make_widget(self, definition: dict[str, Any]) -> QWidget:
        kind = str(definition.get("kind") or definition.get("field_type", "text"))
        if kind in {"multiline", "long_text", "textarea"}:
            widget = QPlainTextEdit()
            widget.setMaximumHeight(100)
            return widget
        if kind in {"integer", "int"}:
            widget = QSpinBox()
            widget.setRange(-2_000_000_000, 2_000_000_000)
            return widget
        if kind in {"number", "float"}:
            widget = QDoubleSpinBox()
            widget.setRange(-1_000_000_000.0, 1_000_000_000.0)
            widget.setDecimals(3)
            return widget
        if kind in {"boolean", "bool"}:
            return QCheckBox("是")
        if kind in {"enum", "choice", "select"}:
            widget = QComboBox()
            widget.setEditable(True)
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
        if kind in {"entity_refs", "entity_list", "multi_entity"}:
            widget = QLineEdit()
            widget.setPlaceholderText("多个实体 UUID，以逗号分隔")
            return widget
        return QLineEdit()

    def values(self) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        result: dict[str, Any] = {}
        for key, widget in self.fields.items():
            if isinstance(widget, QPlainTextEdit):
                value: Any = widget.toPlainText().strip()
            elif isinstance(widget, QSpinBox):
                value = widget.value()
            elif isinstance(widget, QDoubleSpinBox):
                value = widget.value()
            elif isinstance(widget, QCheckBox):
                value = widget.isChecked()
            elif isinstance(widget, QComboBox):
                value = (
                    widget.currentData()
                    if widget.currentData() is not None
                    else widget.currentText()
                )
            else:
                value = widget.text().strip()
                if self._definitions[key].get("field_type") in {
                    "entity_refs",
                    "entity_list",
                    "multi_entity",
                }:
                    value = [item.strip() for item in value.split(",") if item.strip()]
            if value not in ("", None, []):
                result[key] = value
        dates = [
            value for kind, selector in self.date_widgets.items() if (value := selector.value(kind))
        ]
        return result, dates

    def set_values(self, values: dict[str, Any], dates: list[dict[str, Any]]) -> None:
        for key, widget in self.fields.items():
            value = values.get(key, "")
            if isinstance(widget, QPlainTextEdit):
                widget.setPlainText(str(value))
            elif isinstance(widget, QSpinBox):
                widget.setValue(int(value or 0))
            elif isinstance(widget, QDoubleSpinBox):
                widget.setValue(float(value or 0))
            elif isinstance(widget, QCheckBox):
                widget.setChecked(bool(value))
            elif isinstance(widget, QComboBox):
                index = widget.findData(value)
                if index >= 0:
                    widget.setCurrentIndex(index)
                else:
                    widget.setCurrentText(str(value))
            else:
                widget.setText(", ".join(value) if isinstance(value, list) else str(value))
        by_kind = {item.get("date_kind"): item for item in dates}
        for kind, selector in self.date_widgets.items():
            selector.set_value(by_kind.get(kind))

    def set_read_only(self, read_only: bool) -> None:
        self.setEnabled(not read_only)

    @staticmethod
    def _clear_layout(layout) -> None:
        while layout.count():
            item = layout.takeAt(0)
            widget = item.widget()
            if widget:
                widget.deleteLater()
