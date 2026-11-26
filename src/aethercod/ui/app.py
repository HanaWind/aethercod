from __future__ import annotations

import os
import sys
from pathlib import Path

from .app_identity import configure_process_identity


def run() -> int:
    configure_process_identity()
    interface = os.environ.get("AETHERCOD_UI", "webview").strip().lower()
    if interface == "widgets":
        from PySide6.QtWidgets import QApplication

        from .app_identity import application_icon
        from .main_window import MainWindow

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

    from .webview_app import run_webview

    project_argument = next(
        (Path(value).expanduser() for value in sys.argv[1:] if value.lower().endswith(".aethercod")),
        None,
    )
    return run_webview(project_argument)
