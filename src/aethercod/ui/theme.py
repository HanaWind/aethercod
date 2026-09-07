from __future__ import annotations

from PySide6.QtGui import QColor, QPalette
from PySide6.QtWidgets import QApplication


def apply_theme(app: QApplication, dark: bool) -> None:
    palette = QPalette()
    if dark:
        palette.setColor(QPalette.Window, QColor("#14171c"))
        palette.setColor(QPalette.WindowText, QColor("#eef1f5"))
        palette.setColor(QPalette.Base, QColor("#1d2229"))
        palette.setColor(QPalette.AlternateBase, QColor("#252b34"))
        palette.setColor(QPalette.Text, QColor("#eef1f5"))
        palette.setColor(QPalette.Button, QColor("#252b34"))
        palette.setColor(QPalette.ButtonText, QColor("#eef1f5"))
        palette.setColor(QPalette.Highlight, QColor("#7c3aed"))
        palette.setColor(QPalette.HighlightedText, QColor("#ffffff"))
    else:
        palette.setColor(QPalette.Window, QColor("#f6f7fb"))
        palette.setColor(QPalette.WindowText, QColor("#20242b"))
        palette.setColor(QPalette.Base, QColor("#ffffff"))
        palette.setColor(QPalette.AlternateBase, QColor("#f0f2f6"))
        palette.setColor(QPalette.Text, QColor("#20242b"))
        palette.setColor(QPalette.Button, QColor("#ffffff"))
        palette.setColor(QPalette.ButtonText, QColor("#20242b"))
        palette.setColor(QPalette.Highlight, QColor("#6d28d9"))
        palette.setColor(QPalette.HighlightedText, QColor("#ffffff"))
    app.setPalette(palette)
    app.setStyleSheet("""
        QMainWindow { background: palette(window); }
        QToolBar { padding: 6px; spacing: 5px; border: 0; }
        QGroupBox { font-weight: 600; border: 1px solid palette(mid); border-radius: 6px; margin-top: 10px; padding-top: 12px; }
        QGroupBox::title { subcontrol-origin: margin; left: 10px; padding: 0 4px; }
        QListWidget, QTreeWidget, QTableWidget, QPlainTextEdit, QTextBrowser, QLineEdit, QComboBox { border: 1px solid palette(mid); border-radius: 5px; padding: 4px; }
        QPushButton { padding: 6px 10px; border: 1px solid palette(mid); border-radius: 5px; }
        QPushButton:hover { border-color: #7c3aed; }
        QStatusBar { border-top: 1px solid palette(mid); }
    """)
