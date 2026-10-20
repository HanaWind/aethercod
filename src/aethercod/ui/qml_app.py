from __future__ import annotations

import sys
from pathlib import Path

from PySide6.QtGui import QFont
from PySide6.QtQuickControls2 import QQuickStyle
from PySide6.QtQml import QQmlApplicationEngine
from PySide6.QtWidgets import QApplication

from .app_identity import application_icon, configure_process_identity
from .qml_backend import QmlBackend
from .theme import apply_theme


def run_qml() -> int:
    configure_process_identity()
    QQuickStyle.setStyle("Basic")
    app = QApplication(sys.argv)
    app.setFont(QFont("Microsoft YaHei UI", 10))
    app.setApplicationName("Aethercod")
    app.setOrganizationName("Aethercod")
    icon = application_icon()
    if not icon.isNull():
        app.setWindowIcon(icon)

    backend = QmlBackend()
    apply_theme(app, backend.dark)
    backend.themeChanged.connect(lambda: apply_theme(app, backend.dark))
    engine = QQmlApplicationEngine()
    engine.rootContext().setContextProperty("backend", backend)
    qml_file = Path(__file__).resolve().parent / "qml" / "Main.qml"
    engine.load(qml_file.as_uri())
    if not engine.rootObjects():
        backend.close()
        return 1
    if not icon.isNull():
        engine.rootObjects()[0].setIcon(icon)
    app.aboutToQuit.connect(backend.close)
    return app.exec()
