from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMessageBox,
    QPushButton,
    QVBoxLayout,
)


class ValidationDialog(QDialog):
    entity_requested = Signal(str)

    def __init__(self, service, parent=None):
        super().__init__(parent)
        self.service = service
        self.setWindowTitle("数据校验")
        self.resize(680, 430)
        self.summary = QLabel()
        self.list = QListWidget()
        self.list.itemDoubleClicked.connect(self._open_entity)
        self.open_button = QPushButton("跳转词条")
        self.remove_relation_button = QPushButton("删除无效关系")
        self.refresh_button = QPushButton("重新扫描")
        self.open_button.clicked.connect(self._open_entity)
        self.remove_relation_button.clicked.connect(self._remove_relation)
        self.refresh_button.clicked.connect(self.reload)
        action_row = QHBoxLayout()
        action_row.addWidget(self.open_button)
        action_row.addWidget(self.remove_relation_button)
        action_row.addWidget(self.refresh_button)
        action_row.addStretch()
        buttons = QDialogButtonBox(QDialogButtonBox.Close)
        buttons.rejected.connect(self.reject)
        layout = QVBoxLayout(self)
        layout.addWidget(self.summary)
        layout.addWidget(self.list)
        layout.addLayout(action_row)
        layout.addWidget(buttons)
        self.reload()

    def reload(self) -> None:
        self.list.clear()
        issues = self.service.validation.scan()
        self.summary.setText(
            "未发现问题。" if not issues else f"发现 {len(issues)} 个需要处理的问题。"
        )
        for issue in issues:
            item = QListWidgetItem(issue.message)
            item.setData(Qt.UserRole, issue)
            item.setToolTip(issue.kind)
            self.list.addItem(item)
        has_issues = bool(issues)
        self.open_button.setEnabled(has_issues)
        self.remove_relation_button.setEnabled(has_issues)

    def _selected_issue(self):
        item = self.list.currentItem()
        return item.data(Qt.UserRole) if item else None

    def _open_entity(self, *_args) -> None:
        issue = self._selected_issue()
        if issue and issue.entity_id:
            self.entity_requested.emit(issue.entity_id)
            self.accept()

    def _remove_relation(self) -> None:
        issue = self._selected_issue()
        if not issue or not issue.relation_id:
            QMessageBox.information(self, "无法修复", "当前问题不包含可删除的关系。")
            return
        if QMessageBox.question(self, "删除关系", "确定删除导致此问题的关系？") == QMessageBox.Yes:
            self.service.relations.delete(issue.relation_id)
            self.reload()
