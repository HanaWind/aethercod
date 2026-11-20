from __future__ import annotations

import os
import sys

from .app_identity import configure_process_identity


def run() -> int:
    configure_process_identity()
    interface = os.environ.get("AETHERCOD_UI", "webview").strip().lower()
    if interface == "qml":
        try:
            from .qml_app import run_qml
        except ImportError:
            pass
        else:
            return run_qml()
    if interface == "webview":
        from .webview_app import run_webview

        return run_webview()

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
