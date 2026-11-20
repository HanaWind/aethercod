"""项目管理Backend - 从QmlBackend拆分出来。"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from PySide6.QtCore import QObject, Property, QSettings, Signal, Slot
from PySide6.QtWidgets import QFileDialog

from ..db import connect
from ..exchange import backup_project, export_library, import_library, read_json, write_json
from ..services import ProjectService


class ProjectBackend(QObject):
    """项目和资料库管理Backend。"""

    projectChanged = Signal()
    statusChanged = Signal()

    DEFAULT_PROJECT_META = {
        "name": "Untitled World",
        "era_name": "泰拉纪元",
        "author": "",
        "description": "",
    }

    def __init__(self, parent: QObject | None = None):
        super().__init__(parent)
        self._service: ProjectService | None = None
        self._conn: Any = None
        self._path = ""
        self._project_meta = dict(self.DEFAULT_PROJECT_META)
        self._status = "请选择一个项目文件"

    def _set_status(self, message: str) -> None:
        self._status = str(message)
        self.statusChanged.emit()

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

    @Property(bool, notify=projectChanged)
    def hasProject(self) -> bool:
        return self._service is not None

    @Property(bool, notify=projectChanged)
    def readOnly(self) -> bool:
        return bool(self._service and not self._service.writable)

    def get_service(self) -> ProjectService | None:
        """获取当前项目服务。"""
        return self._service

    def get_connection(self) -> Any:
        """获取当前数据库连接。"""
        return self._conn

    def _load_project_meta(self) -> None:
        """加载项目元数据。"""
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
        """写入项目元数据。"""
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
        """打开项目。"""
        from PySide6.QtCore import QUrl

        path = str(path or "").strip()
        if path.startswith("file:"):
            path = QUrl(path).toLocalFile()
        if not path:
            return False

        return self._open_project_now(path)

    def _open_project_now(self, path: str) -> bool:
        """立即打开项目。"""
        new_conn = None
        try:
            new_conn = connect(path)
            new_service = ProjectService(new_conn)
            old_conn = self._conn
            self._conn = new_conn
            self._service = new_service
            self._path = str(Path(path).expanduser().resolve())
            self._load_project_meta()

            if old_conn is not None:
                old_conn.close()

            self._set_status(f"已打开项目：{Path(self._path).name}")
            self.projectChanged.emit()
            return True
        except Exception as exc:
            if new_conn is not None and new_conn is not self._conn:
                new_conn.close()
            self._set_status(f"打开项目失败：{exc}")
            return False

    @Slot(result=bool)
    def chooseAndOpenProject(self) -> bool:
        """选择并打开项目。"""
        path, _ = QFileDialog.getOpenFileName(
            None,
            "打开 Aethercod 项目",
            str(Path.home()),
            "Aethercod 项目 (*.aethercod);;旧版项目 (*.db *.sqlite *.sqlite3);;所有文件 (*)",
        )
        return self.openProject(path) if path else False

    @Slot(str, str, str, str, result=bool)
    def createProject(
        self, path: str, name: str, era_name: str, author: str, description: str
    ) -> bool:
        """创建新项目。"""
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

        if not self._open_project_now(path):
            return False

        try:
            self._write_project_meta(
                {
                    "name": name,
                    "era_name": era_name,
                    "author": author,
                    "description": description,
                }
            )
            self.projectChanged.emit()
            self._set_status(f"已创建资料库：{name}")
            return True
        except Exception as exc:
            self._set_status(f"创建资料库失败：{exc}")
            return False

    @Slot(str, str, str, str, result=bool)
    def updateProjectSettings(
        self, name: str, era_name: str, author: str, description: str
    ) -> bool:
        """更新项目设置。"""
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
            self._set_status("资料库设置已保存")
            return True
        except Exception as exc:
            self._set_status(f"保存资料库设置失败：{exc}")
            return False

    @Slot()
    def closeProject(self) -> None:
        """关闭项目。"""
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:
                pass

        self._service = None
        self._conn = None
        self._path = ""
        self._project_meta = dict(self.DEFAULT_PROJECT_META)

        self.projectChanged.emit()
        self._set_status("资料库已关闭")

    @Slot(result=bool)
    def chooseAndExportLibrary(self) -> bool:
        """选择并导出资料库。"""
        if not self._service or not self._conn:
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
        """选择并备份资料库。"""
        if not self._service or not self._path:
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

    @Slot(result=bool)
    def chooseAndImportLibrary(self) -> bool:
        """选择并导入资料库。"""
        if not self._service or not self._conn or self.readOnly:
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
            message = "、".join(f"{key} {value}" for key, value in counts.items())
            self._set_status(f"导入完成：{message}")
            return True
        except Exception as exc:
            self._set_status(f"导入失败：{exc}")
            return False

    @staticmethod
    def _safe_filename(value: str) -> str:
        """生成安全的文件名。"""
        import re

        safe = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", str(value)).strip(" .")
        return safe or "词条"
