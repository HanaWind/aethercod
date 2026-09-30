from __future__ import annotations

from PySide6.QtGui import QColor, QPalette
from PySide6.QtWidgets import QApplication

ACCENT = "#0f766e"
ACCENT_HOVER = "#115e59"
ACCENT_PRESSED = "#134e4a"


def apply_theme(app: QApplication, dark: bool) -> None:
    palette = QPalette()
    if dark:
        colors = {
            "window": "#111827",
            "panel": "#1f2937",
            "alternate": "#273449",
            "text": "#f9fafb",
            "muted": "#a8b3c2",
            "border": "#3b4758",
            "input": "#182333",
        }
    else:
        colors = {
            "window": "#f6f8fa",
            "panel": "#ffffff",
            "alternate": "#edf2f3",
            "text": "#17212b",
            "muted": "#64748b",
            "border": "#d5dde3",
            "input": "#ffffff",
        }
    palette.setColor(QPalette.Window, QColor(colors["window"]))
    palette.setColor(QPalette.WindowText, QColor(colors["text"]))
    palette.setColor(QPalette.Base, QColor(colors["panel"]))
    palette.setColor(QPalette.AlternateBase, QColor(colors["alternate"]))
    palette.setColor(QPalette.Text, QColor(colors["text"]))
    palette.setColor(QPalette.Button, QColor(colors["panel"]))
    palette.setColor(QPalette.ButtonText, QColor(colors["text"]))
    palette.setColor(QPalette.PlaceholderText, QColor(colors["muted"]))
    palette.setColor(QPalette.ToolTipBase, QColor(colors["panel"]))
    palette.setColor(QPalette.ToolTipText, QColor(colors["text"]))
    palette.setColor(QPalette.Highlight, QColor(ACCENT))
    palette.setColor(QPalette.HighlightedText, QColor("#ffffff"))
    for group in (QPalette.Disabled, QPalette.Inactive):
        palette.setColor(group, QPalette.Window, QColor(colors["window"]))
        palette.setColor(group, QPalette.Base, QColor(colors["panel"]))
        palette.setColor(group, QPalette.Text, QColor(colors["muted"]))
        palette.setColor(group, QPalette.WindowText, QColor(colors["muted"]))
        palette.setColor(group, QPalette.ButtonText, QColor(colors["muted"]))
    app.setPalette(palette)
    app.setStyleSheet(f"""
        * {{ font-family: "Segoe UI", "Microsoft YaHei UI", sans-serif; font-size: 13px; }}
        QMainWindow {{ background: {colors['window']}; }}
        QDialog, QMessageBox, QInputDialog {{ background: {colors['window']}; color: {colors['text']}; }}
        QMenu {{ background: {colors['panel']}; color: {colors['text']}; border: 1px solid {colors['border']}; }}
        QMenu::item {{ padding: 6px 22px 6px 10px; }}
        QMenu::item:selected {{ background: {ACCENT}; color: #ffffff; }}
        QToolTip {{ background: {colors['panel']}; color: {colors['text']}; border: 1px solid {colors['border']}; padding: 5px; }}
        QToolBar {{ background: {colors['panel']}; padding: 6px; spacing: 4px; border: none; border-bottom: 1px solid {colors['border']}; }}
        QToolButton {{ padding: 6px 9px; border-radius: 4px; color: {colors['text']}; border: 1px solid transparent; }}
        QToolButton:hover {{ background: {colors['alternate']}; border-color: {colors['border']}; }}
        QToolButton:pressed {{ background: {ACCENT_PRESSED}; color: #ffffff; }}
        QToolButton:checked {{ background: {ACCENT}; color: #ffffff; }}
        QGroupBox {{ font-weight: 600; border: 1px solid {colors['border']}; border-radius: 6px; margin-top: 10px; padding: 12px 9px 9px 9px; background: {colors['panel']}; }}
        QGroupBox::title {{ subcontrol-origin: margin; left: 10px; padding: 0 5px; color: {colors['text']}; }}
        QListWidget, QTreeWidget, QTableWidget, QPlainTextEdit, QTextBrowser,
        QLineEdit, QComboBox, QSpinBox, QDoubleSpinBox {{
            background: {colors['input']}; color: {colors['text']}; border: 1px solid {colors['border']};
            border-radius: 4px; padding: 6px; selection-background-color: {ACCENT};
        }}
        QListWidget::item {{ padding: 8px 7px; margin: 1px; border-radius: 3px; }}
        QListWidget::item:hover {{ background: {colors['alternate']}; }}
        QListWidget::item:selected {{ background: {ACCENT}; color: white; }}
        QTabWidget::pane {{ border: 1px solid {colors['border']}; border-radius: 5px; background: {colors['panel']}; }}
        QTabBar::tab {{ padding: 8px 16px; margin-right: 2px; border-radius: 4px; background: {colors['alternate']}; color: {colors['muted']}; }}
        QTabBar::tab:selected {{ background: {ACCENT}; color: white; }}
        QPushButton, QDialogButtonBox QPushButton {{ background: {ACCENT}; color: white; padding: 7px 12px; border: 1px solid {ACCENT}; border-radius: 4px; font-weight: 600; }}
        QPushButton:hover {{ background: {ACCENT_HOVER}; }}
        QPushButton:pressed, QDialogButtonBox QPushButton:pressed {{ background: {ACCENT_PRESSED}; border-color: {ACCENT_PRESSED}; }}
        QPushButton[class="secondary"] {{ background: {colors['alternate']}; color: {colors['text']}; border-color: {colors['border']}; }}
        QPushButton[class="secondary"]:hover {{ background: {colors['border']}; }}
        QPushButton[class="secondary"]:pressed {{ background: {colors['border']}; }}
        QPushButton[class="danger"] {{ background: #b42318; border-color: #b42318; }}
        QPushButton[class="danger"]:hover {{ background: #912018; border-color: #912018; }}
        QPushButton[class="danger"]:pressed {{ background: #7a271a; border-color: #7a271a; }}
        QPushButton:focus, QToolButton:focus, QComboBox:focus, QLineEdit:focus, QPlainTextEdit:focus, QListWidget:focus {{ border: 1px solid {ACCENT}; }}
        QPushButton:disabled {{ background: {colors['alternate']}; color: {colors['muted']}; }}
        QCheckBox, QRadioButton {{ color: {colors['text']}; spacing: 6px; }}
        QCheckBox::indicator, QRadioButton::indicator {{ width: 15px; height: 15px; }}
        QComboBox QAbstractItemView {{ background: {colors['panel']}; color: {colors['text']}; selection-background-color: {ACCENT}; }}
        QHeaderView::section {{ background: {colors['alternate']}; color: {colors['text']}; border: none; padding: 6px; }}
        QDialogButtonBox QPushButton {{ min-width: 78px; }}
        QSplitter::handle {{ background: {colors['border']}; width: 2px; }}
        QStatusBar {{ background: {colors['panel']}; border-top: 1px solid {colors['border']}; color: {colors['muted']}; }}
        QLabel {{ color: {colors['text']}; }}
        QScrollBar:vertical {{ background: transparent; width: 10px; }}
        QScrollBar::handle:vertical {{ background: {colors['border']}; border-radius: 3px; min-height: 30px; }}
        QScrollBar:horizontal {{ background: transparent; height: 10px; }}
        QScrollBar::handle:horizontal {{ background: {colors['border']}; border-radius: 3px; min-width: 30px; }}
        """)
