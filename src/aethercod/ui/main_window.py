from __future__ import annotations

import html
import json
from pathlib import Path

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QAction, QColor
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
from .theme import apply_theme

try:
    import markdown
except ImportError:  # pragma: no cover
    markdown = None


class RelationDialog(QDialog):
    def __init__(self, entities: list[Entity], current_id: str, parent=None):
        super().__init__(parent)
        self.setWindowTitle("新建关系")
        self.setMinimumWidth(420)
        self.target = QComboBox()
        self.target.addItem("选择对端词条", "")
        for entity in entities:
            if entity.id != current_id:
                self.target.addItem(entity.name, entity.id)
        self.label = QLineEdit()
        self.label.setPlaceholderText("例如：效忠、位于、持有")
        self.reverse = QLineEdit()
        self.reverse.setPlaceholderText("可选的反向关系名称")
        self.notes = QPlainTextEdit()
        self.notes.setMaximumHeight(80)
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


class MainWindow(QMainWindow):
    project_changed = Signal()

    def __init__(self):
        super().__init__()
        self.setWindowTitle("Aethercod · 世界观资料库")
        self.resize(1440, 860)
        self.conn = None
        self.service = None
        self.project_path: Path | None = None
        self.current_id: str | None = None
        self.read_only = False
        self.dark = False
        self._build_actions()
        self._build_ui()
        self._set_enabled(False)
        self.statusBar().showMessage("请新建或打开一个 .aethercod 项目")

    def _build_actions(self):
        toolbar = QToolBar("主工具栏")
        toolbar.setMovable(False)
        self.addToolBar(toolbar)
        for text, slot in (
            ("新建", self.new_project),
            ("打开", self.open_project),
            ("保存", self.save_entity),
        ):
            action = QAction(text, self)
            action.triggered.connect(slot)
            toolbar.addAction(action)
        toolbar.addSeparator()
        self.import_action = QAction("导入 JSON", self)
        self.import_action.triggered.connect(self.import_json)
        toolbar.addAction(self.import_action)
        self.export_action = QAction("导出 JSON", self)
        self.export_action.triggered.connect(self.export_json)
        toolbar.addAction(self.export_action)
        self.backup_action = QAction("备份项目", self)
        self.backup_action.triggered.connect(self.backup)
        toolbar.addAction(self.backup_action)
        self.validate_action = QAction("校验引用", self)
        self.validate_action.triggered.connect(self.show_validation)
        toolbar.addAction(self.validate_action)
        self.timeline_action = QAction("时间线", self)
        self.timeline_action.triggered.connect(self.show_timeline)
        toolbar.addAction(self.timeline_action)
        toolbar.addSeparator()
        self.mode_action = QAction("只读预览", self)
        self.mode_action.setCheckable(True)
        self.mode_action.toggled.connect(self.toggle_mode)
        toolbar.addAction(self.mode_action)
        self.theme_action = QAction("深色主题", self)
        self.theme_action.setCheckable(True)
        self.theme_action.toggled.connect(self.toggle_theme)
        toolbar.addAction(self.theme_action)
        self.search = QLineEdit()
        self.search.setPlaceholderText("搜索名称、别名或摘要…")
        self.search.setMinimumWidth(260)
        self.search.textChanged.connect(self.refresh_entities)
        toolbar.addWidget(self.search)
        self.type_filter = QComboBox()
        self.type_filter.setMinimumWidth(150)
        self.type_filter.currentIndexChanged.connect(self.refresh_entities)
        toolbar.addWidget(self.type_filter)

    def _build_ui(self):
        self.left = QWidget()
        left_layout = QVBoxLayout(self.left)
        left_layout.setContentsMargins(8, 8, 8, 8)
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
        center_layout.setContentsMargins(8, 8, 8, 8)
        center_layout.addWidget(QLabel("词条"))
        center_layout.addWidget(self.entity_list, 1)

        self.detail = QWidget()
        detail_layout = QVBoxLayout(self.detail)
        detail_layout.setContentsMargins(8, 8, 8, 8)
        header = QHBoxLayout()
        self.name_edit = QLineEdit()
        self.name_edit.setPlaceholderText("显示名称")
        self.type_edit = QComboBox()
        self.color_edit = QLineEdit("#7c3aed")
        self.color_edit.setMaximumWidth(100)
        header.addWidget(self.name_edit, 2)
        header.addWidget(self.type_edit, 1)
        header.addWidget(self.color_edit)
        detail_layout.addLayout(header)
        self.summary_edit = QLineEdit()
        self.summary_edit.setPlaceholderText("简短摘要")
        detail_layout.addWidget(self.summary_edit)
        meta = QHBoxLayout()
        self.alias_edit = QLineEdit()
        self.alias_edit.setPlaceholderText("别名，用逗号分隔")
        self.tags_edit = QLineEdit()
        self.tags_edit.setPlaceholderText("标签，用逗号分隔")
        meta.addWidget(self.alias_edit)
        meta.addWidget(self.tags_edit)
        detail_layout.addLayout(meta)
        self.notes_tabs = QTabWidget()
        self.notes_edit = QPlainTextEdit()
        self.notes_edit.setPlaceholderText(
            "使用 Markdown 编写详细设定；内部引用格式：[[实体UUID|显示文本]]"
        )
        self.preview = QTextBrowser()
        self.notes_tabs.addTab(self.notes_edit, "Markdown")
        self.notes_tabs.addTab(self.preview, "预览")
        self.notes_edit.textChanged.connect(self.update_preview)
        detail_layout.addWidget(self.notes_tabs, 3)
        custom_row = QHBoxLayout()
        custom_row.addWidget(QLabel("自定义属性 JSON"))
        self.custom_edit = QLineEdit()
        self.custom_edit.setPlaceholderText('{"阵营":"中立","等级":3}')
        custom_row.addWidget(self.custom_edit)
        detail_layout.addLayout(custom_row)
        date_row = QHBoxLayout()
        date_row.addWidget(QLabel("时间线年份"))
        self.date_edit = QLineEdit()
        self.date_edit.setPlaceholderText("事件开始或人物出生年份，例如 120")
        date_row.addWidget(self.date_edit)
        detail_layout.addLayout(date_row)
        self.remarks_edit = QPlainTextEdit()
        self.remarks_edit.setPlaceholderText("自定义备注")
        self.remarks_edit.setMaximumHeight(75)
        detail_layout.addWidget(self.remarks_edit)
        buttons = QHBoxLayout()
        self.save_button = QPushButton("保存词条")
        self.save_button.clicked.connect(self.save_entity)
        self.delete_button = QPushButton("移入回收区")
        self.delete_button.clicked.connect(self.delete_entity)
        buttons.addWidget(self.save_button)
        buttons.addWidget(self.delete_button)
        buttons.addStretch()
        detail_layout.addLayout(buttons)
        relations_box = QGroupBox("关系网络")
        relations_layout = QVBoxLayout(relations_box)
        self.relation_list = QListWidget()
        relations_layout.addWidget(self.relation_list)
        self.relation_add = QPushButton("＋ 添加关系")
        self.relation_add.clicked.connect(self.add_relation)
        relations_layout.addWidget(self.relation_add)
        detail_layout.addWidget(relations_box, 1)

        splitter = QSplitter(Qt.Horizontal)
        splitter.addWidget(self.left)
        splitter.addWidget(center)
        splitter.addWidget(self.detail)
        splitter.setSizes([220, 330, 760])
        self.setCentralWidget(splitter)

    def _set_enabled(self, enabled: bool):
        for widget in (self.left, self.entity_list, self.detail):
            widget.setEnabled(enabled)
        for action in (
            self.import_action,
            self.export_action,
            self.backup_action,
            self.validate_action,
            self.timeline_action,
        ):
            action.setEnabled(enabled)

    def _open_conn(self, path: str):
        if self.conn:
            self.conn.close()
        self.conn = connect(path)
        self.service = ProjectService(self.conn)
        self.project_path = Path(path)
        self._set_enabled(True)
        self._populate_types()
        self.refresh_entities()
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
        for type_ in types:
            self.type_filter.addItem(f"{type_.icon}  {type_.name}", type_.id)
            item = QListWidgetItem(f"{type_.icon}  {type_.name}")
            item.setData(Qt.UserRole, type_.id)
            self.type_list.addItem(item)
        self.type_filter.blockSignals(False)
        self.type_list.blockSignals(False)
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

    def load_entity(self, entity_id: str):
        entity = self.service.entities.get(entity_id)
        if not entity:
            return
        self.current_id = entity.id
        self.name_edit.setText(entity.name)
        self.summary_edit.setText(entity.summary)
        self.alias_edit.setText(", ".join(entity.aliases))
        self.tags_edit.setText(", ".join(entity.tags))
        self.notes_edit.setPlainText(entity.notes)
        self.remarks_edit.setPlainText(entity.remarks)
        self.color_edit.setText(entity.color)
        self.custom_edit.setText(json.dumps(entity.custom_fields, ensure_ascii=False))
        self.date_edit.setText(
            str(next((d.get("year") for d in entity.dates if d.get("year") is not None), ""))
        )
        self.type_edit.clear()
        for type_ in self.service.taxonomy.list_types():
            self.type_edit.addItem(f"{type_.icon}  {type_.name}", type_.id)
        self.type_edit.setCurrentIndex(max(0, self.type_edit.findData(entity.type_id)))
        self.update_preview()
        self.refresh_relations()
        self._apply_mode()

    def clear_detail(self):
        self.current_id = None
        for widget in (
            self.name_edit,
            self.summary_edit,
            self.alias_edit,
            self.tags_edit,
            self.color_edit,
            self.custom_edit,
            self.date_edit,
        ):
            widget.clear()
        self.notes_edit.clear()
        self.remarks_edit.clear()
        self.preview.clear()
        self.relation_list.clear()

    def new_entity(self):
        if not self.service:
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
        entity.color = self.color_edit.text().strip() or "#7c3aed"
        try:
            entity.custom_fields = json.loads(self.custom_edit.text() or "{}")
        except json.JSONDecodeError:
            QMessageBox.warning(self, "属性格式错误", "自定义属性必须是有效 JSON 对象。")
            return
        year = self.date_edit.text().strip()
        entity.dates = (
            [{"date_kind": "timeline", "label": "世界观时间线", "year": int(year)}] if year else []
        )
        self.service.entities.save(entity)
        self.refresh_entities()
        self.load_entity(entity.id)
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

    def update_preview(self):
        text = self.notes_edit.toPlainText()
        rendered = (
            markdown.markdown(text, extensions=["extra", "tables", "fenced_code"])
            if markdown
            else f"<pre>{html.escape(text)}</pre>"
        )
        self.preview.setHtml(rendered)

    def toggle_mode(self, enabled):
        self.read_only = enabled
        self.mode_action.setText("编辑模式" if enabled else "只读预览")
        self._apply_mode()

    def _apply_mode(self):
        editable = not self.read_only
        for widget in (
            self.name_edit,
            self.type_edit,
            self.color_edit,
            self.summary_edit,
            self.alias_edit,
            self.tags_edit,
            self.notes_edit,
            self.remarks_edit,
            self.custom_edit,
            self.date_edit,
            self.save_button,
            self.delete_button,
            self.relation_add,
        ):
            widget.setEnabled(editable)
        if self.read_only:
            self.notes_tabs.setCurrentIndex(1)

    def toggle_theme(self, enabled):
        self.dark = enabled
        apply_theme(self.app_instance(), enabled)

    def app_instance(self):
        from PySide6.QtWidgets import QApplication

        return QApplication.instance()

    def export_json(self):
        if not self.conn:
            return
        path, _ = QFileDialog.getSaveFileName(
            self, "导出 JSON", "aethercod-export.json", "JSON 文件 (*.json)"
        )
        if path:
            write_json(
                (
                    export_entity(self.conn, self.current_id)
                    if self.current_id
                    else export_library(self.conn)
                ),
                path,
            )
            self.statusBar().showMessage("JSON 已导出", 2500)

    def import_json(self):
        if not self.conn:
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
                f"已导入 {result['entities']} 个词条和 {result['relations']} 条关系。",
            )
        except (OSError, ValueError, KeyError, TypeError) as exc:
            QMessageBox.critical(self, "导入失败", str(exc))

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

    def show_validation(self):
        issues = self.service.validation.scan() if self.service else []
        text = (
            "未发现无效引用或重复别名。"
            if not issues
            else "\n".join(f"• {issue.message}" for issue in issues)
        )
        QMessageBox.information(self, "数据校验", text)

    def show_timeline(self):
        entries = self.service.timeline.entries() if self.service else []
        text = (
            "\n".join(
                f"{row['year']}  ·  {row['name']}  ·  {row['label'] or row['date_kind']}"
                for row in entries
            )
            or "还没有带年份的事件或人物日期。"
        )
        QMessageBox.information(self, "世界观时间线", text)

    def closeEvent(self, event):
        if self.conn:
            self.conn.close()
        event.accept()
