from __future__ import annotations

from PySide6.QtCore import Qt

from .animated import AnimatedDialog
from PySide6.QtWidgets import (
    QComboBox,
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QVBoxLayout,
)


class TypeManagerDialog(AnimatedDialog):
    """Manage custom entity types and their typed property definitions."""

    def __init__(self, taxonomy, parent=None):
        super().__init__(parent)
        self.taxonomy = taxonomy
        self.setWindowTitle("类型与属性定义管理器")
        self.resize(820, 540)
        self.types = QListWidget()
        self.fields = QListWidget()
        self.add_type = QPushButton("＋ 新建类型")
        self.rename_type = QPushButton("重命名")
        self.add_field = QPushButton("＋ 新建属性")
        self.edit_field = QPushButton("编辑属性")
        self.remove_field = QPushButton("删除属性")
        self.add_type.clicked.connect(self._add_type)
        self.rename_type.clicked.connect(self._rename_type)
        self.add_field.clicked.connect(self._add_field)
        self.edit_field.clicked.connect(self._edit_field)
        self.remove_field.clicked.connect(self._remove_field)
        self.types.currentItemChanged.connect(self._load_fields)

        left = QVBoxLayout()
        left.addWidget(QLabel("词条类型"))
        left.addWidget(self.types)
        type_actions = QHBoxLayout()
        type_actions.addWidget(self.add_type)
        type_actions.addWidget(self.rename_type)
        left.addLayout(type_actions)
        right = QVBoxLayout()
        right.addWidget(QLabel("属性定义"))
        right.addWidget(self.fields)
        field_actions = QHBoxLayout()
        field_actions.addWidget(self.add_field)
        field_actions.addWidget(self.edit_field)
        field_actions.addWidget(self.remove_field)
        right.addLayout(field_actions)
        content = QHBoxLayout()
        content.addLayout(left, 1)
        content.addLayout(right, 2)
        buttons = QDialogButtonBox(QDialogButtonBox.Close)
        buttons.rejected.connect(self.reject)
        layout = QVBoxLayout(self)
        layout.addLayout(content)
        layout.addWidget(buttons)
        self.reload()

    def reload(self):
        selected = self.current_type_id()
        self.types.blockSignals(True)
        self.types.clear()
        for type_ in self.taxonomy.list_types():
            item = QListWidgetItem(f"{type_.icon}  {type_.name}")
            item.setData(Qt.UserRole, type_.id)
            item.setData(Qt.UserRole + 1, type_.is_builtin)
            self.types.addItem(item)
            if type_.id == selected:
                self.types.setCurrentItem(item)
        self.types.blockSignals(False)
        if self.types.currentRow() < 0 and self.types.count():
            self.types.setCurrentRow(0)
        self._load_fields()

    def current_type_id(self):
        return self.types.currentItem().data(Qt.UserRole) if self.types.currentItem() else None

    def _load_fields(self, *_):
        self.fields.clear()
        type_id = self.current_type_id()
        if not type_id:
            return
        for field in self.taxonomy.fields(type_id):
            label = f"{field.name}  ·  {field.field_type}"
            if field.required:
                label += "  ·  必填"
            item = QListWidgetItem(label)
            item.setData(Qt.UserRole, field.id)
            item.setData(Qt.UserRole + 1, field)
            self.fields.addItem(item)

    def _add_type(self):
        name, ok = QInputDialog.getText(self, "新建词条类型", "显示名称")
        if ok and name.strip():
            try:
                self.taxonomy.create_type(name.strip())
                self.reload()
            except ValueError as exc:
                QMessageBox.warning(self, "无法创建类型", str(exc))

    def _rename_type(self):
        item = self.types.currentItem()
        if not item:
            return
        if item.data(Qt.UserRole + 1):
            QMessageBox.information(self, "内置类型", "内置类型名称用于兼容现有项目，不能重命名。")
            return
        old = item.text().split("  ", 1)[-1]
        name, ok = QInputDialog.getText(self, "重命名类型", "显示名称", text=old)
        if ok and name.strip():
            try:
                self.taxonomy.update_type(item.data(Qt.UserRole), name=name.strip())
                self.reload()
            except ValueError as exc:
                QMessageBox.warning(self, "无法重命名类型", str(exc))

    def _add_field(self):
        type_id = self.current_type_id()
        if not type_id:
            return
        dialog = FieldDialog(parent=self)
        if dialog.exec():
            try:
                self.taxonomy.create_field(type_id=type_id, **dialog.values())
                self._load_fields()
            except ValueError as exc:
                QMessageBox.warning(self, "无法创建属性", str(exc))

    def _edit_field(self):
        item = self.fields.currentItem()
        if not item:
            return
        field = item.data(Qt.UserRole + 1)
        dialog = FieldDialog(field, self)
        if dialog.exec():
            try:
                self.taxonomy.update_field(field.id, **dialog.values())
                self._load_fields()
            except ValueError as exc:
                QMessageBox.warning(self, "无法更新属性", str(exc))

    def _remove_field(self):
        item = self.fields.currentItem()
        if not item:
            return
        if (
            QMessageBox.question(self, "删除属性", "删除此属性定义及所有词条中的对应值？")
            == QMessageBox.Yes
        ):
            self.taxonomy.delete_field(item.data(Qt.UserRole))
            self._load_fields()


class FieldDialog(AnimatedDialog):
    TYPES = [
        ("单行文本", "text"),
        ("多行文本", "textarea"),
        ("整数", "integer"),
        ("小数", "number"),
        ("布尔", "boolean"),
        ("枚举", "choice"),
        ("日期", "date"),
        ("单词条引用", "entity_ref"),
        ("多词条引用", "entity_refs"),
    ]

    def __init__(self, field=None, parent=None):
        super().__init__(parent)
        self.setWindowTitle("属性定义")
        self.name = QLineEdit()
        self.kind = QComboBox()
        for label, value in self.TYPES:
            self.kind.addItem(label, value)
        self.required = QComboBox()
        self.required.addItem("可选", False)
        self.required.addItem("必填", True)
        self.description = QLineEdit()
        self.options = QLineEdit()
        self.options.setPlaceholderText("枚举选项，用逗号分隔")
        if field:
            self.name.setText(field.name)
            self.kind.setCurrentIndex(max(0, self.kind.findData(field.field_type)))
            self.required.setCurrentIndex(1 if field.required else 0)
            self.description.setText(field.description)
            self.options.setText(", ".join(field.options))
        form = QFormLayout()
        form.addRow("属性名称", self.name)
        form.addRow("类型", self.kind)
        form.addRow("必要性", self.required)
        form.addRow("描述", self.description)
        form.addRow("枚举选项", self.options)
        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout = QVBoxLayout(self)
        layout.addLayout(form)
        layout.addWidget(buttons)

    def values(self):
        return {
            "name": self.name.text().strip(),
            "field_type": self.kind.currentData(),
            "required": self.required.currentData(),
            "description": self.description.text().strip(),
            "options": [value.strip() for value in self.options.text().split(",") if value.strip()],
        }

    def accept(self):
        if not self.name.text().strip():
            QMessageBox.warning(self, "信息不完整", "请输入属性名称。")
            return
        super().accept()
