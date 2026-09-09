from __future__ import annotations

import html
import json
import re
from pathlib import Path

from PySide6.QtCore import QSettings, Qt, Signal
from PySide6.QtGui import QAction, QColor, QIcon, QKeySequence
from PySide6.QtWidgets import (
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFileDialog,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMessageBox,
    QPlainTextEdit,
    QPushButton,
    QScrollArea,
    QSpinBox,
    QSplitter,
    QTabWidget,
    QTextBrowser,
    QToolBar,
    QVBoxLayout,
    QWidget,
)

from ..db import connect
from ..exchange import (
    backup_project,
    export_entity,
    export_library,
    import_library,
    read_json,
    write_json,
)
from ..models import Entity
from ..services import ProjectService
from .animated import AnimatedDialog
from .color_wheel import ColorWheel
from .graph_view import GraphView
from .specialized_forms import SpecializedForm
from .theme import apply_theme
from .timeline_view import TimelineView
from .type_manager import TypeManagerDialog
from .validation_dialog import ValidationDialog

try:
    import markdown
except ImportError:  # pragma: no cover
    markdown = None

APP_ICON = Path(__file__).resolve().parent.parent / "resources" / "aethercod.svg"
WIKILINK = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")


class RelationDialog(AnimatedDialog):
    def __init__(
        self,
        entities: list[Entity],
        current_id: str,
        parent=None,
        target_type: str | None = None,
        title: str = "新建关系",
    ):
        super().__init__(parent)
        self.setWindowTitle(title)
        self.setMinimumWidth(430)
        self.target = QComboBox()
        self.target.addItem("选择对端词条", "")
        for entity in entities:
            if entity.id != current_id and (target_type is None or entity.type_id == target_type):
                self.target.addItem(entity.name, entity.id)
        self.label = QLineEdit()
        self.reverse = QLineEdit()
        self.notes = QPlainTextEdit()
        self.notes.setMaximumHeight(80)
        self.label.setPlaceholderText("例如：效忠、位于、持有")
        self.reverse.setPlaceholderText("可选的反向关系名称")
        form = QFormLayout()
        form.addRow("对端词条", self.target)
        form.addRow("关系名称", self.label)
        form.addRow("反向名称", self.reverse)
        form.addRow("说明", self.notes)
        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout = QVBoxLayout(self)
        layout.addLayout(form)
        layout.addWidget(buttons)

    def values(self):
        return (
            self.target.currentData(),
            self.label.text().strip(),
            self.reverse.text().strip(),
            self.notes.toPlainText().strip(),
        )

    def accept(self):
        target, label, _, _ = self.values()
        if not target or not label:
            QMessageBox.warning(self, "信息不完整", "请选择对端词条并填写关系名称。")
            return
        super().accept()


class ColorDialog(AnimatedDialog):
    def __init__(self, color: str, parent=None):
        super().__init__(parent)
        self.setWindowTitle("选择词条颜色")
        self.wheel = ColorWheel(color)
        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout = QVBoxLayout(self)
        layout.addWidget(self.wheel)
        layout.addWidget(buttons)

    def color(self) -> str:
        return self.wheel.color().name()


class MainWindow(QMainWindow):
    project_changed = Signal()

    def __init__(self):
        super().__init__()
        self.setWindowTitle("Aethercod · 世界观资料库")
        self.resize(1500, 900)
        self.setWindowIcon(QIcon(str(APP_ICON)) if APP_ICON.exists() else QIcon())
        self.settings = QSettings("Aethercod", "Aethercod")
        self.conn = None
        self.service = None
        self.project_path: Path | None = None
        self.current_id: str | None = None
        self.read_only = False
        self.dark = bool(self.settings.value("dark_theme", False, type=bool))
        self.current_color = "#7c3aed"
        self._loading_entity = False
        self.dirty = False
        self._page_refreshing = False
        self._build_actions()
        self._build_ui()
        self._apply_theme()
        self._set_enabled(False)
        self.statusBar().showMessage("请新建或打开一个 .aethercod 项目")

    def _build_actions(self):
        toolbar = QToolBar("主工具栏")
        toolbar.setMovable(False)
        self.addToolBar(toolbar)
        self.save_action = QAction("保存", self)
        self.save_action.setShortcut(QKeySequence.Save)
        self.save_action.triggered.connect(self.save_entity)
        self.search_action = QAction("快速搜索", self)
        self.search_action.setShortcut(QKeySequence("Ctrl+P"))
        self.search_action.triggered.connect(
            lambda: (self.search.setFocus(), self.search.selectAll())
        )
        self.addAction(self.search_action)
        for text, slot in (("新建", self.new_project), ("打开", self.open_project)):
            action = QAction(text, self)
            action.triggered.connect(slot)
            toolbar.addAction(action)
        toolbar.addAction(self.save_action)
        toolbar.addSeparator()
        self.import_action = QAction("导入 JSON", self)
        self.import_action.triggered.connect(self.import_json)
        toolbar.addAction(self.import_action)
        self.export_action = QAction("导出 JSON", self)
        self.export_action.triggered.connect(self.export_json)
        toolbar.addAction(self.export_action)
        self.markdown_export_action = QAction("导出 Markdown", self)
        self.markdown_export_action.triggered.connect(self.export_markdown)
        toolbar.addAction(self.markdown_export_action)
        self.markdown_import_action = QAction("导入 Markdown", self)
        self.markdown_import_action.triggered.connect(self.import_markdown)
        toolbar.addAction(self.markdown_import_action)
        self.backup_action = QAction("备份项目", self)
        self.backup_action.triggered.connect(self.backup)
        toolbar.addAction(self.backup_action)
        self.recycle_action = QAction("回收站", self)
        self.recycle_action.triggered.connect(self.show_recycle_bin)
        toolbar.addAction(self.recycle_action)
        self.validate_action = QAction("校验引用", self)
        self.validate_action.triggered.connect(self.show_validation)
        toolbar.addAction(self.validate_action)
        self.timeline_action = QAction("时间线", self)
        self.timeline_action.triggered.connect(self.show_timeline)
        toolbar.addAction(self.timeline_action)
        self.graph_action = QAction("关系图", self)
        self.graph_action.triggered.connect(self.show_graph)
        toolbar.addAction(self.graph_action)
        self.type_manager_action = QAction("类型与属性", self)
        self.type_manager_action.triggered.connect(self.show_type_manager)
        toolbar.addAction(self.type_manager_action)
        toolbar.addSeparator()
        self.mode_action = QAction("进入只读", self)
        self.mode_action.setCheckable(True)
        self.mode_action.toggled.connect(self.toggle_mode)
        toolbar.addAction(self.mode_action)
        self.theme_action = QAction("深色主题", self)
        self.theme_action.setCheckable(True)
        self.theme_action.setChecked(self.dark)
        self.theme_action.toggled.connect(self.toggle_theme)
        toolbar.addAction(self.theme_action)
        self.search = QLineEdit()
        self.search.setPlaceholderText("搜索名称、别名、正文或属性…")
        self.search.setMinimumWidth(280)
        self.search.textChanged.connect(self.refresh_entities)
        toolbar.addWidget(self.search)
        self.type_filter = QComboBox()
        self.type_filter.setMinimumWidth(160)
        self.type_filter.currentIndexChanged.connect(self.refresh_entities)
        toolbar.addWidget(self.type_filter)

    def _build_ui(self):
        self.left = QWidget()
        left_layout = QVBoxLayout(self.left)
        left_layout.setContentsMargins(10, 10, 10, 10)
        left_layout.addWidget(QLabel("分类浏览"))
        self.type_list = QListWidget()
        self.type_list.currentRowChanged.connect(self.type_row_changed)
        left_layout.addWidget(self.type_list, 1)
        left_layout.addWidget(QLabel("标签"))
        self.tag_list = QListWidget()
        self.tag_list.currentRowChanged.connect(self.tag_row_changed)
        left_layout.addWidget(self.tag_list, 1)
        self.new_button = QPushButton("＋ 新建词条")
        self.new_button.clicked.connect(self.new_entity)
        left_layout.addWidget(self.new_button)
        self.entity_list = QListWidget()
        self.entity_list.currentItemChanged.connect(self.entity_selected)
        center = QWidget()
        center_layout = QVBoxLayout(center)
        center_layout.setContentsMargins(10, 10, 10, 10)
        center_layout.addWidget(QLabel("词条列表"))
        center_layout.addWidget(self.entity_list, 1)
        self.detail = QWidget()
        detail_layout = QVBoxLayout(self.detail)
        detail_layout.setContentsMargins(10, 10, 10, 10)
        identity = QGroupBox("词条身份")
        identity_layout = QVBoxLayout(identity)
        name_row = QHBoxLayout()
        self.name_edit = QLineEdit()
        self.name_edit.setPlaceholderText("显示名称")
        self.type_edit = QComboBox()
        self.type_edit.currentIndexChanged.connect(self.editor_type_changed)
        self.color_button = QPushButton("颜色")
        self.color_button.clicked.connect(self.choose_color)
        self.uuid_label = QLabel("UUID：—")
        self.uuid_copy = QPushButton("复制")
        self.uuid_copy.clicked.connect(self.copy_uuid)
        name_row.addWidget(self.name_edit, 2)
        name_row.addWidget(self.type_edit, 1)
        name_row.addWidget(self.color_button)
        identity_layout.addLayout(name_row)
        uuid_row = QHBoxLayout()
        uuid_row.addWidget(self.uuid_label)
        uuid_row.addWidget(self.uuid_copy)
        uuid_row.addStretch()
        identity_layout.addLayout(uuid_row)
        detail_layout.addWidget(identity)
        self.summary_edit = QLineEdit()
        self.summary_edit.setPlaceholderText("简短摘要")
        detail_layout.addWidget(self.summary_edit)
        meta = QHBoxLayout()
        self.alias_edit = QLineEdit()
        self.alias_edit.setPlaceholderText("别名，用逗号分隔")
        self.redirect_edit = QLineEdit()
        self.redirect_edit.setPlaceholderText("别名重定向，用逗号分隔")
        self.tags_edit = QLineEdit()
        self.tags_edit.setPlaceholderText("标签，用逗号分隔")
        meta.addWidget(self.alias_edit)
        meta.addWidget(self.redirect_edit)
        meta.addWidget(self.tags_edit)
        detail_layout.addLayout(meta)
        self.specialized = SpecializedForm()
        self.specialized.relation_requested.connect(self.add_specialized_relation)
        self.specialized.changed.connect(self.mark_dirty)
        detail_layout.addWidget(self.specialized)
        self.notes_tabs = QTabWidget()
        self.notes_edit = QPlainTextEdit()
        self.notes_edit.setPlaceholderText(
            "使用 Markdown 编写详细设定；内部引用：[[实体UUID|显示文本]]"
        )
        self.preview = QTextBrowser()
        self.preview.anchorClicked.connect(self.wikilink_clicked)
        self.notes_tabs.addTab(self.notes_edit, "Markdown")
        self.notes_tabs.addTab(self.preview, "预览")
        self.notes_edit.textChanged.connect(self.update_preview)
        self.notes_edit.textChanged.connect(self.mark_dirty)
        for editor in (
            self.name_edit,
            self.summary_edit,
            self.alias_edit,
            self.redirect_edit,
            self.tags_edit,
        ):
            editor.textChanged.connect(self.mark_dirty)
        detail_layout.addWidget(self.notes_tabs, 2)
        self.remarks_edit = QPlainTextEdit()
        self.remarks_edit.setPlaceholderText("自定义备注")
        self.remarks_edit.setMaximumHeight(70)
        self.remarks_edit.textChanged.connect(self.mark_dirty)
        detail_layout.addWidget(self.remarks_edit)
        button_row = QHBoxLayout()
        self.save_button = QPushButton("保存词条")
        self.save_button.clicked.connect(self.save_entity)
        self.delete_button = QPushButton("移入回收区")
        self.delete_button.clicked.connect(self.delete_entity)
        button_row.addWidget(self.save_button)
        button_row.addWidget(self.delete_button)
        button_row.addStretch()
        detail_layout.addLayout(button_row)
        relation_box = QGroupBox("关系面板")
        relation_layout = QVBoxLayout(relation_box)
        self.relation_list = QListWidget()
        self.relation_list.itemDoubleClicked.connect(self.edit_relation)
        relation_layout.addWidget(self.relation_list)
        relation_buttons = QHBoxLayout()
        self.relation_add = QPushButton("＋ 添加关系")
        self.relation_add.clicked.connect(self.add_relation)
        self.relation_delete = QPushButton("删除关系")
        self.relation_delete.clicked.connect(self.delete_relation)
        relation_buttons.addWidget(self.relation_add)
        relation_buttons.addWidget(self.relation_delete)
        relation_layout.addLayout(relation_buttons)
        detail_layout.addWidget(relation_box, 1)
        self.content_tabs = QTabWidget()
        self.content_tabs.setDocumentMode(True)
        editor_page = QWidget()
        editor_layout = QVBoxLayout(editor_page)
        editor_layout.setContentsMargins(0, 0, 0, 0)
        editor_scroll = QScrollArea()
        editor_scroll.setWidgetResizable(True)
        editor_scroll.setFrameShape(QScrollArea.NoFrame)
        editor_scroll.setWidget(self.detail)
        editor_layout.addWidget(editor_scroll)
        graph_page = QWidget()
        graph_layout = QVBoxLayout(graph_page)
        graph_controls = QHBoxLayout()
        self.graph_scope = QComboBox()
        self.graph_scope.addItem("全库", "all")
        self.graph_scope.addItem("当前筛选", "filtered")
        self.graph_scope.addItem("当前词条邻域", "current")
        self.graph_depth = QSpinBox()
        self.graph_depth.setRange(1, 4)
        self.graph_depth.setValue(2)
        self.graph_type_filter = QComboBox()
        self.graph_type_filter.addItem("全部类型", "")
        graph_refresh = QPushButton("重新布局")
        graph_refresh.clicked.connect(self.show_graph)
        graph_export = QPushButton("导出 PNG")
        graph_export.clicked.connect(self.export_graph_png)
        graph_controls.addWidget(self.graph_scope)
        graph_controls.addWidget(QLabel("层级"))
        graph_controls.addWidget(self.graph_depth)
        graph_controls.addWidget(self.graph_type_filter)
        graph_controls.addWidget(graph_refresh)
        graph_controls.addWidget(graph_export)
        graph_layout.addLayout(graph_controls)
        self.graph_view = GraphView()
        self.graph_view.node_activated.connect(self.graph_node_opened)
        graph_layout.addWidget(self.graph_view)
        timeline_page = QWidget()
        timeline_layout = QVBoxLayout(timeline_page)
        timeline_controls = QHBoxLayout()
        self.timeline_type_filter = QComboBox()
        self.timeline_type_filter.addItem("全部类型", "")
        self.timeline_kind_filter = QComboBox()
        self.timeline_kind_filter.addItem("全部日期", "")
        self.timeline_kind_filter.addItem("出生", "birth")
        self.timeline_kind_filter.addItem("死亡", "death")
        self.timeline_kind_filter.addItem("事件开始", "event_start")
        self.timeline_kind_filter.addItem("事件结束", "event_end")
        self.timeline_kind_filter.addItem("建立", "founded")
        self.timeline_kind_filter.addItem("终结", "dissolved")
        self.timeline_kind_filter.addItem("创造", "created")
        timeline_refresh = QPushButton("刷新")
        timeline_refresh.clicked.connect(self.show_timeline)
        timeline_controls.addWidget(self.timeline_type_filter)
        timeline_controls.addWidget(self.timeline_kind_filter)
        timeline_controls.addWidget(timeline_refresh)
        timeline_controls.addStretch()
        timeline_layout.addLayout(timeline_controls)
        self.timeline_view = TimelineView()
        self.timeline_view.entry_activated.connect(self.timeline_entry_opened)
        timeline_layout.addWidget(self.timeline_view)
        self.content_tabs.addTab(editor_page, "词条编辑")
        self.content_tabs.addTab(graph_page, "关系图")
        self.content_tabs.addTab(timeline_page, "时间线")
        self.content_tabs.currentChanged.connect(self.page_changed)
        splitter = QSplitter(Qt.Horizontal)
        splitter.addWidget(self.left)
        splitter.addWidget(center)
        splitter.addWidget(self.content_tabs)
        splitter.setSizes([230, 340, 930])
        self.setCentralWidget(splitter)

    def _set_enabled(self, enabled: bool):
        for widget in (self.left, self.entity_list, self.detail):
            widget.setEnabled(enabled)
        for action in (
            self.import_action,
            self.export_action,
            self.markdown_export_action,
            self.markdown_import_action,
            self.backup_action,
            self.recycle_action,
            self.validate_action,
            self.timeline_action,
            self.graph_action,
            self.type_manager_action,
        ):
            action.setEnabled(enabled)
        self._apply_read_only()

    def _open_conn(self, path: str):
        if self.conn:
            self.conn.close()
        self.conn = connect(path)
        self.service = ProjectService(self.conn)
        self.project_path = Path(path)
        self._set_enabled(True)
        self._populate_types()
        self.refresh_entities()
        self.settings.setValue("last_project", str(path))
        self.statusBar().showMessage(f"已打开：{self.project_path.name}")

    def new_project(self):
        path, _ = QFileDialog.getSaveFileName(
            self, "新建 Aethercod 项目", "world.aethercod", "Aethercod 项目 (*.aethercod)"
        )
        if path:
            self._open_conn(path)

    def open_project(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "打开 Aethercod 项目", "", "Aethercod 项目 (*.aethercod);;SQLite 数据库 (*.db)"
        )
        if path:
            self._open_conn(path)

    def _populate_types(self):
        types = self.service.taxonomy.list_types()
        self.type_filter.blockSignals(True)
        self.type_filter.clear()
        self.type_filter.addItem("全部类型", "")
        self.type_list.blockSignals(True)
        self.type_list.clear()
        self.type_list.addItem("全部词条")
        self.graph_type_filter.blockSignals(True)
        self.graph_type_filter.clear()
        self.graph_type_filter.addItem("全部类型", "")
        self.timeline_type_filter.blockSignals(True)
        self.timeline_type_filter.clear()
        self.timeline_type_filter.addItem("全部类型", "")
        for type_ in types:
            self.type_filter.addItem(f"{type_.icon}  {type_.name}", type_.id)
            item = QListWidgetItem(f"{type_.icon}  {type_.name}")
            item.setData(Qt.UserRole, type_.id)
            self.type_list.addItem(item)
            self.graph_type_filter.addItem(type_.name, type_.id)
            self.timeline_type_filter.addItem(type_.name, type_.id)
        self.type_filter.blockSignals(False)
        self.type_list.blockSignals(False)
        self.graph_type_filter.blockSignals(False)
        self.timeline_type_filter.blockSignals(False)
        self.type_list.setCurrentRow(0)
        self._populate_tags()

    def _populate_tags(self):
        current = self.active_tag()
        self.tag_list.blockSignals(True)
        self.tag_list.clear()
        self.tag_list.addItem("全部标签")
        for row in self.conn.execute("SELECT name FROM tags ORDER BY name COLLATE NOCASE"):
            self.tag_list.addItem(row[0])
        if current:
            for index in range(self.tag_list.count()):
                if self.tag_list.item(index).text() == current:
                    self.tag_list.setCurrentRow(index)
                    break
        self.tag_list.blockSignals(False)

    def type_row_changed(self, row):
        self.type_filter.blockSignals(True)
        self.type_filter.setCurrentIndex(max(0, row))
        self.type_filter.blockSignals(False)
        self.refresh_entities()

    def tag_row_changed(self, _row):
        self.refresh_entities()

    def active_tag(self):
        return (
            None
            if self.tag_list.currentRow() <= 0 or not self.tag_list.currentItem()
            else self.tag_list.currentItem().text()
        )

    def refresh_entities(self):
        if not self.service:
            return
        entities = self.service.search.search(
            self.search.text(), self.type_filter.currentData() or None, self.active_tag()
        )
        self.entity_list.blockSignals(True)
        self.entity_list.clear()
        for entity in entities:
            item = QListWidgetItem(entity.name)
            item.setData(Qt.UserRole, entity.id)
            item.setToolTip(f"{entity.summary}\n{', '.join(entity.tags)}")
            item.setForeground(QColor(entity.color))
            self.entity_list.addItem(item)
        self.entity_list.blockSignals(False)
        if entities:
            self.entity_list.setCurrentRow(0)
        else:
            self.clear_detail()
        self._populate_tags()
        self.statusBar().showMessage(f"{len(entities)} 个词条")

    def entity_selected(self, current, _previous):
        if current:
            self.load_entity(current.data(Qt.UserRole))

    def mark_dirty(self, *_args) -> None:
        if self._loading_entity or not self.current_id or self.read_only:
            return
        if not self.dirty:
            self.dirty = True
            self.setWindowTitle("* Aethercod · 世界观资料库")

    def clear_dirty(self) -> None:
        self.dirty = False
        self.setWindowTitle("Aethercod · 世界观资料库")

    def load_entity(self, entity_id: str):
        self._loading_entity = True
        entity = self.service.entities.get(entity_id)
        if not entity:
            self._loading_entity = False
            return
        self.current_id = entity.id
        self.current_color = entity.color
        self._loading_entity = True
        self.name_edit.setText(entity.name)
        self.summary_edit.setText(entity.summary)
        self.alias_edit.setText(", ".join(entity.aliases))
        self.tags_edit.setText(", ".join(entity.tags))
        self.notes_edit.setPlainText(entity.notes)
        self.remarks_edit.setPlainText(entity.remarks)
        self.color_button.setStyleSheet(f"background: {entity.color}; border-radius: 8px;")
        self.uuid_label.setText(f"UUID：{self.display_uuid(entity.id)}")
        self.uuid_label.setToolTip(entity.id)
        self.redirect_edit.setText(
            ", ".join(item.alias for item in self.service.aliases.list(entity.id))
        )
        self.type_edit.clear()
        for type_ in self.service.taxonomy.list_types():
            self.type_edit.addItem(f"{type_.icon}  {type_.name}", type_.id)
        self.type_edit.setCurrentIndex(max(0, self.type_edit.findData(entity.type_id)))
        entity_options = [
            {"id": item.id, "name": item.name, "type_id": item.type_id}
            for item in self.service.entities.list()
        ]
        self.specialized.set_type(
            entity.type_id,
            [self.field_to_dict(field) for field in self.service.fields.list(entity.type_id)],
            entity_options,
        )
        self.specialized.set_values(entity.custom_fields, entity.dates)
        self.update_preview()
        self.refresh_relations()
        self._apply_read_only()
        self._loading_entity = False
        self.clear_dirty()

    def editor_type_changed(self, _index):
        type_id = self.type_edit.currentData()
        if not self.service or not type_id:
            return
        current_values, current_dates = (
            self.specialized.values() if self.specialized.type_id == type_id else ({}, [])
        )
        entity_options = [
            {"id": item.id, "name": item.name, "type_id": item.type_id}
            for item in self.service.entities.list()
        ]
        self.specialized.set_type(
            type_id,
            [self.field_to_dict(field) for field in self.service.fields.list(type_id)],
            entity_options,
        )
        self.specialized.set_values(current_values, current_dates)

    @staticmethod
    def field_to_dict(field):
        return {
            "key": field.name,
            "name": field.name,
            "kind": field.field_type,
            "field_type": field.field_type,
            "options": field.options,
            "required": field.required,
            "description": field.description,
        }

    @staticmethod
    def display_uuid(value: str) -> str:
        raw = value.replace("-", "").lower()
        return (
            f"{raw[:8]}-{raw[8:12]}-{raw[12:16]}-{raw[16:20]}-{raw[20:]}"
            if len(raw) == 32
            else value
        )

    def clear_detail(self):
        self.current_id = None
        self.current_color = "#7c3aed"
        self.uuid_label.setText("UUID：—")
        self.redirect_edit.clear()
        for widget in (self.name_edit, self.summary_edit, self.alias_edit, self.tags_edit):
            widget.clear()
        self.notes_edit.clear()
        self.remarks_edit.clear()
        self.relation_list.clear()
        self.specialized.setVisible(False)

    def new_entity(self):
        if not self.service or self.read_only:
            return
        entity = self.service.new_entity(
            self.type_filter.currentData() or self.service.taxonomy.list_types()[0].id
        )
        self.service.entities.save(entity)
        self.refresh_entities()
        self.load_entity(entity.id)
        self.name_edit.selectAll()
        self.name_edit.setFocus()

    def save_entity(self):
        if not self.service or not self.current_id or self.read_only:
            return
        entity = self.service.entities.get(self.current_id)
        entity.name = self.name_edit.text().strip() or "未命名词条"
        entity.type_id = self.type_edit.currentData() or entity.type_id
        entity.summary = self.summary_edit.text().strip()
        entity.aliases = [x.strip() for x in self.alias_edit.text().split(",") if x.strip()]
        entity.tags = [x.strip() for x in self.tags_edit.text().split(",") if x.strip()]
        entity.notes = self.notes_edit.toPlainText()
        entity.remarks = self.remarks_edit.toPlainText()
        entity.color = self.current_color
        custom, dates = self.specialized.values()
        entity.custom_fields = custom
        entity.dates = dates
        sync_field = (
            "中文名"
            if entity.type_id == "person"
            else "正式名称" if entity.type_id in {"polity", "place"} else None
        )
        if sync_field and not entity.custom_fields.get(sync_field):
            entity.custom_fields[sync_field] = entity.name
        try:
            self.service.entities.save(entity)
        except ValueError as exc:
            QMessageBox.warning(self, "无法保存", str(exc))
            return
        requested_redirects = [x.strip() for x in self.redirect_edit.text().split(",") if x.strip()]
        existing_redirects = {item.alias for item in self.service.aliases.list(entity.id)}
        for alias in existing_redirects - set(requested_redirects):
            self.service.aliases.remove_redirect(alias)
        for alias in requested_redirects:
            self.service.aliases.add_redirect(alias, entity.id)
        self.refresh_entities()
        self.load_entity(entity.id)
        self.clear_dirty()
        self.statusBar().showMessage("词条已保存", 2500)

    def delete_entity(self):
        if (
            self.service
            and self.current_id
            and not self.read_only
            and QMessageBox.question(self, "移入回收区", "保留关系并软删除当前词条？")
            == QMessageBox.Yes
        ):
            self.service.entities.soft_delete(self.current_id)
            self.refresh_entities()
            self.clear_detail()

    def refresh_relations(self):
        self.relation_list.clear()
        if not self.current_id:
            return
        for row in self.service.relation_rows(self.current_id):
            item = QListWidgetItem(f"{row['display_label']}  ·  {row['other_name']}")
            item.setData(Qt.UserRole, row["id"])
            self.relation_list.addItem(item)

    def add_relation(self):
        if not self.service or not self.current_id or self.read_only:
            return
        dialog = RelationDialog(self.service.entities.list(), self.current_id, self)
        if dialog.exec():
            target, label, reverse, notes = dialog.values()
            self.service.relations.create(self.current_id, target, label, reverse, notes)
            self.refresh_relations()

    def add_specialized_relation(
        self, label: str, target_type: str | None, relation: str, reverse: str
    ):
        if not self.service or not self.current_id or self.read_only:
            return
        dialog = RelationDialog(
            self.service.entities.list(), self.current_id, self, target_type, f"添加{label}"
        )
        if dialog.exec():
            target, _, _, notes = dialog.values()
            self.service.relations.create(self.current_id, target, relation, reverse, notes)
            self.refresh_relations()

    def edit_relation(self, item):
        if self.read_only:
            return
        row = next(
            (
                row
                for row in self.service.relation_rows(self.current_id)
                if row["id"] == item.data(Qt.UserRole)
            ),
            None,
        )
        if not row:
            return
        dialog = RelationDialog(
            self.service.entities.list(), self.current_id, self, title="编辑关系"
        )
        dialog.label.setText(row["label"])
        dialog.reverse.setText(row["reverse_label"])
        dialog.notes.setPlainText(row["notes"])
        index = dialog.target.findData(row["other_id"])
        dialog.target.setCurrentIndex(index)
        if dialog.exec():
            target, label, reverse, notes = dialog.values()
            source_id = self.current_id if row["direction"] == "out" else target
            target_id = target if row["direction"] == "out" else self.current_id
            self.service.relations.update(
                row["id"],
                source_id=source_id,
                target_id=target_id,
                label=label,
                reverse_label=reverse,
                notes=notes,
            )
            self.refresh_relations()

    def delete_relation(self):
        item = self.relation_list.currentItem()
        if (
            item
            and not self.read_only
            and QMessageBox.question(self, "删除关系", "确定删除当前关系？") == QMessageBox.Yes
        ):
            self.service.relations.delete(item.data(Qt.UserRole))
            self.refresh_relations()

    def update_preview(self):
        text = self.notes_edit.toPlainText()
        rendered = (
            markdown.markdown(text, extensions=["extra", "tables", "fenced_code"])
            if markdown
            else f"<pre>{html.escape(text)}</pre>"
        )
        rendered = WIKILINK.sub(
            lambda match: f'<a href="aether://{html.escape(match.group(1))}">{html.escape(match.group(2) or match.group(1))}</a>',
            rendered,
        )
        self.preview.setHtml(rendered)

    def wikilink_clicked(self, url):
        if url.scheme() == "aether":
            token = url.host() or url.path().lstrip("/")
            target = self.service.search.resolve(token) if self.service else None
            if target:
                self.load_entity(target.id)
                self.content_tabs.setCurrentIndex(0)

    def choose_color(self):
        if self.read_only:
            return
        dialog = ColorDialog(
            self.color_button.styleSheet().split("background: ")[-1].split(";")[0] or "#7c3aed",
            self,
        )
        if dialog.exec():
            self.current_color = dialog.color()
            self.color_button.setStyleSheet(
                f"background: {self.current_color}; border-radius: 8px;"
            )

    def copy_uuid(self):
        if self.current_id:
            self.app_instance().clipboard().setText(self.display_uuid(self.current_id))
            self.statusBar().showMessage("UUID 已复制", 1500)

    def app_instance(self):
        from PySide6.QtWidgets import QApplication

        return QApplication.instance()

    def toggle_mode(self, enabled):
        self.read_only = enabled
        self.mode_action.setText("退出只读" if enabled else "进入只读")
        self._apply_read_only()

    def _apply_read_only(self):
        editable = bool(self.service) and not self.read_only
        for widget in (
            self.name_edit,
            self.type_edit,
            self.summary_edit,
            self.alias_edit,
            self.redirect_edit,
            self.tags_edit,
            self.notes_edit,
            self.remarks_edit,
            self.color_button,
            self.save_button,
            self.delete_button,
            self.relation_add,
            self.relation_delete,
        ):
            widget.setEnabled(editable)
        self.specialized.set_read_only(not editable)
        self.new_button.setEnabled(editable)
        self.type_manager_action.setEnabled(bool(self.service) and editable)
        self.import_action.setEnabled(bool(self.service) and editable)
        self.markdown_import_action.setEnabled(bool(self.service) and editable)
        self.recycle_action.setEnabled(bool(self.service) and editable)
        self.save_action.setEnabled(editable)
        self.uuid_copy.setEnabled(bool(self.current_id))
        self.notes_tabs.setCurrentIndex(
            1 if self.read_only else min(self.notes_tabs.currentIndex(), 1)
        )

    def toggle_theme(self, enabled):
        self.dark = enabled
        self.settings.setValue("dark_theme", enabled)
        self._apply_theme()

    def _apply_theme(self):
        apply_theme(self.app_instance(), self.dark)

    def page_changed(self, index):
        if self._page_refreshing:
            return
        if index == 1:
            self.show_graph(select_page=False)
        elif index == 2:
            self.show_timeline(select_page=False)

    def show_graph(self, _checked=False, *, select_page=True):
        if select_page:
            self._page_refreshing = True
            self.content_tabs.setCurrentIndex(1)
            self._page_refreshing = False
        if not self.service:
            return
        types = {item.id: item for item in self.service.taxonomy.list_types()}
        all_entities = self.service.entities.list()
        selected_type = self.graph_type_filter.currentData() or None
        if self.graph_scope.currentData() == "filtered":
            entities = self.service.search.search(
                self.search.text(), self.type_filter.currentData() or None, self.active_tag()
            )
        elif self.graph_scope.currentData() == "current" and self.current_id:
            visible = {self.current_id}
            frontier = {self.current_id}
            for _ in range(self.graph_depth.value()):
                next_frontier = set()
                for entity_id in frontier:
                    next_frontier.update(
                        row["other_id"] for row in self.service.relations.for_entity(entity_id)
                    )
                visible.update(next_frontier)
                frontier = next_frontier
            entities = [item for item in all_entities if item.id in visible]
        else:
            entities = all_entities
        if selected_type:
            entities = [item for item in entities if item.type_id == selected_type]
        ids = {item.id for item in entities}
        nodes = [
            {
                "id": e.id,
                "name": e.name,
                "color": e.color,
                "icon": types.get(e.type_id).icon if e.type_id in types else "✦",
                "type_name": types.get(e.type_id).name if e.type_id in types else "",
            }
            for e in entities
        ]
        edges = (
            [
                dict(row)
                for row in self.conn.execute(
                    "SELECT * FROM relations WHERE source_id IN ({}) AND target_id IN ({})".format(
                        ",".join("?" for _ in ids) or "NULL", ",".join("?" for _ in ids) or "NULL"
                    ),
                    tuple(ids) + tuple(ids),
                )
            ]
            if ids
            else []
        )
        self.graph_view.load_graph(nodes, edges)
        if select_page:
            self.content_tabs.setCurrentIndex(1)

    def graph_node_opened(self, entity_id: str):
        self.load_entity(entity_id)
        self.content_tabs.setCurrentIndex(0)

    def export_graph_png(self):
        path, _ = QFileDialog.getSaveFileName(
            self, "导出关系图", "aethercod-graph.png", "PNG 图片 (*.png)"
        )
        if path:
            self.graph_view.export_png(path)
            self.statusBar().showMessage("关系图已导出", 2500)

    def timeline_entry_opened(self, entity_id: str):
        self.load_entity(entity_id)
        self.content_tabs.setCurrentIndex(0)

    def show_timeline(self, _checked=False, *, select_page=True):
        if select_page:
            self._page_refreshing = True
            self.content_tabs.setCurrentIndex(2)
            self._page_refreshing = False
        if not self.service:
            return
        entries = self.service.timeline.entries(
            type_id=self.timeline_type_filter.currentData() or None,
            date_kind=self.timeline_kind_filter.currentData() or None,
        )
        types = {item.id: item for item in self.service.taxonomy.list_types()}
        for entry in entries:
            entity = self.service.entities.get(entry["entity_id"])
            entry["color"] = entity.color if entity else "#7c3aed"
            entry["type_name"] = (
                types.get(entry["type_id"]).name if entry["type_id"] in types else ""
            )
        self.timeline_view.set_entries(entries)
        if select_page:
            self.content_tabs.setCurrentIndex(2)

    def show_type_manager(self):
        if self.service and not self.read_only:
            TypeManagerDialog(self.service.taxonomy, self).exec()
            self._populate_types()
            self.refresh_entities()

    def show_validation(self):
        if not self.service:
            return
        dialog = ValidationDialog(self.service, self, read_only=self.read_only)
        dialog.entity_requested.connect(self.load_entity)
        dialog.exec()

    def export_json(self):
        if not self.conn:
            return
        path, _ = QFileDialog.getSaveFileName(
            self, "导出 JSON", "aethercod-export.json", "JSON 文件 (*.json)"
        )
        if path:
            write_json(
                (
                    export_entity(self.conn, self.current_id, format_version=2)
                    if self.current_id
                    else export_library(self.conn, format_version=2)
                ),
                path,
            )
            self.statusBar().showMessage("JSON 已导出", 2500)

    def import_json(self):
        if not self.conn or self.read_only:
            return
        path, _ = QFileDialog.getOpenFileName(self, "导入 JSON", "", "JSON 文件 (*.json)")
        if not path:
            return
        try:
            result = import_library(self.conn, read_json(path))
            self.refresh_entities()
            QMessageBox.information(
                self,
                "导入完成",
                f"导入 {result['entities']} 个词条，{result['relations']} 条关系。",
            )
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
            QMessageBox.critical(self, "导入失败", str(exc))

    def export_markdown(self):
        if not self.service:
            return
        directory = QFileDialog.getExistingDirectory(self, "导出 Markdown 目录")
        if directory:
            target = Path(directory)
            for entity in self.service.entities.list():
                (target / f"{entity.id}.md").write_text(
                    f"---\nid: {self.display_uuid(entity.id)}\ntype: {entity.type_id}\nname: {entity.name}\n---\n\n{entity.notes}\n",
                    encoding="utf-8",
                )
            self.statusBar().showMessage("Markdown 已导出", 2500)

    def import_markdown(self):
        if not self.service or self.read_only:
            return
        path, _ = QFileDialog.getOpenFileName(
            self, "导入 Markdown", "", "Markdown 文件 (*.md *.markdown)"
        )
        if not path:
            return
        text = Path(path).read_text(encoding="utf-8")
        name = Path(path).stem
        type_id = self.type_filter.currentData() or "concept"
        if text.startswith("---"):
            parts = text.split("---", 2)
            if len(parts) == 3:
                metadata = {}
                for line in parts[1].splitlines():
                    if ":" in line:
                        key, value = line.split(":", 1)
                        metadata[key.strip()] = value.strip()
                name = metadata.get("name", name)
                type_id = metadata.get("type", type_id)
                text = parts[2].lstrip()
        try:
            entity = self.service.new_entity(type_id)
            entity.name = name
            entity.notes = text
            self.service.entities.save(entity)
            self.refresh_entities()
            self.load_entity(entity.id)
        except ValueError as exc:
            QMessageBox.warning(self, "导入失败", str(exc))

    def show_recycle_bin(self):
        if not self.service or self.read_only:
            return
        deleted = [
            item for item in self.service.entities.list(include_deleted=True) if item.deleted_at
        ]
        if not deleted:
            QMessageBox.information(self, "回收站", "回收站为空。")
            return
        labels = [f"{item.name}  ·  {self.display_uuid(item.id)}" for item in deleted]
        selected, ok = __import__(
            "PySide6.QtWidgets", fromlist=["QInputDialog"]
        ).QInputDialog.getItem(self, "回收站", "选择要恢复的词条", labels, 0, False)
        if ok:
            self.service.entities.restore(deleted[labels.index(selected)].id)
            self.refresh_entities()

    def backup(self):
        if not self.project_path:
            return
        path, _ = QFileDialog.getSaveFileName(
            self,
            "备份项目",
            self.project_path.stem + ".backup.aethercod",
            "Aethercod 项目 (*.aethercod)",
        )
        if path:
            backup_project(self.project_path, path)
            self.statusBar().showMessage("项目已备份", 2500)

    def closeEvent(self, event):
        if self.dirty and not self.read_only:
            answer = QMessageBox.question(
                self,
                "未保存的修改",
                "当前词条有未保存修改，是否保存？",
                QMessageBox.Save | QMessageBox.Discard | QMessageBox.Cancel,
                QMessageBox.Save,
            )
            if answer == QMessageBox.Cancel:
                event.ignore()
                return
            if answer == QMessageBox.Save:
                self.save_entity()
        if self.conn:
            self.conn.close()
        self.settings.setValue("window_geometry", self.saveGeometry())
        event.accept()
