from __future__ import annotations

from PySide6.QtGui import QColor, QPalette
from PySide6.QtWidgets import QApplication

ACCENT = "#7c3aed"
ACCENT_HOVER = "#6d28d9"


def apply_theme(app: QApplication, dark: bool) -> None:
    palette = QPalette()
    if dark:
        colors = {
            "window": "#0b1020",
            "panel": "#121a2b",
            "alternate": "#182236",
            "text": "#f2f4f7",
            "muted": "#98a2b3",
            "border": "#344054",
        }
    else:
        colors = {
            "window": "#f4f6fb",
            "panel": "#ffffff",
            "alternate": "#eef2f8",
            "text": "#101828",
            "muted": "#667085",
            "border": "#d0d5dd",
        }
    palette.setColor(QPalette.Window, QColor(colors["window"]))
    palette.setColor(QPalette.WindowText, QColor(colors["text"]))
    palette.setColor(QPalette.Base, QColor(colors["panel"]))
    palette.setColor(QPalette.AlternateBase, QColor(colors["alternate"]))
    palette.setColor(QPalette.Text, QColor(colors["text"]))
    palette.setColor(QPalette.Button, QColor(colors["panel"]))
    palette.setColor(QPalette.ButtonText, QColor(colors["text"]))
    palette.setColor(QPalette.PlaceholderText, QColor(colors["muted"]))
    palette.setColor(QPalette.Highlight, QColor(ACCENT))
    palette.setColor(QPalette.HighlightedText, QColor("#ffffff"))
    app.setPalette(palette)
    app.setStyleSheet(f"""
        * {{ font-family: "Segoe UI", "Microsoft YaHei UI", sans-serif; font-size: 13px; }}
        QMainWindow {{ background: {colors['window']}; }}
        QToolBar {{ background: {colors['panel']}; padding: 9px; spacing: 5px; border: none; border-bottom: 1px solid {colors['border']}; }}
        QToolButton {{ padding: 7px 10px; border-radius: 9px; color: {colors['text']}; }}
        QToolButton:hover {{ background: {colors['alternate']}; }}
        QGroupBox {{ font-weight: 600; border: 1px solid {colors['border']}; border-radius: 14px; margin-top: 12px; padding: 14px 10px 10px 10px; background: {colors['panel']}; }}
        QGroupBox::title {{ subcontrol-origin: margin; left: 14px; padding: 0 6px; color: {colors['text']}; }}
        QListWidget, QTreeWidget, QTableWidget, QPlainTextEdit, QTextBrowser,
        QLineEdit, QComboBox, QSpinBox, QDoubleSpinBox {{
            background: {colors['panel']}; color: {colors['text']}; border: 1px solid {colors['border']};
            border-radius: 10px; padding: 7px; selection-background-color: {ACCENT};
        }}
        QListWidget::item {{ padding: 9px 8px; margin: 2px; border-radius: 8px; }}
        QListWidget::item:hover {{ background: {colors['alternate']}; }}
        QListWidget::item:selected {{ background: {ACCENT}; color: white; }}
        QTabWidget::pane {{ border: 1px solid {colors['border']}; border-radius: 12px; background: {colors['panel']}; }}
        QTabBar::tab {{ padding: 9px 18px; margin-right: 3px; border-radius: 9px; background: {colors['alternate']}; }}
        QTabBar::tab:selected {{ background: {ACCENT}; color: white; }}
        QPushButton {{ background: {ACCENT}; color: white; padding: 8px 14px; border: none; border-radius: 10px; font-weight: 600; }}
        QPushButton:hover {{ background: {ACCENT_HOVER}; }}
        QPushButton:disabled {{ background: {colors['alternate']}; color: {colors['muted']}; }}
        QSplitter::handle {{ background: {colors['border']}; width: 1px; }}
        QStatusBar {{ background: {colors['panel']}; border-top: 1px solid {colors['border']}; color: {colors['muted']}; }}
        QLabel {{ color: {colors['text']}; }}
        QScrollBar:vertical {{ background: transparent; width: 10px; }}
        QScrollBar::handle:vertical {{ background: {colors['border']}; border-radius: 5px; min-height: 30px; }}
        """)
