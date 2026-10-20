from __future__ import annotations

import os
import sys

from PySide6.QtWidgets import QApplication

from .app_identity import application_icon, configure_process_identity
from .main_window import MainWindow


def run() -> int:
    configure_process_identity()
    if os.environ.get("AETHERCOD_UI", "qml").strip().lower() != "widgets":
        try:
            from .qml_app import run_qml
        except ImportError:
            pass
        else:
            return run_qml()

    app = QApplication(sys.argv)
    app.setApplicationName("Aethercod")
    app.setOrganizationName("Aethercod")
    icon = application_icon()
    if not icon.isNull():
        app.setWindowIcon(icon)
    window = MainWindow()
    if not icon.isNull():
        window.setWindowIcon(icon)
    window.show()
    return app.exec()
