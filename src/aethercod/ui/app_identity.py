from __future__ import annotations

import ctypes
import sys
from pathlib import Path

from PySide6.QtGui import QIcon

WINDOWS_APP_ID = "Aethercod.WorldbuildingDatabase"


def configure_process_identity() -> None:
    """Give Windows a stable taskbar identity instead of python.exe's identity."""
    if sys.platform != "win32":
        return
    try:
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(WINDOWS_APP_ID)
    except (AttributeError, OSError):
        pass


def application_icon() -> QIcon:
    resources = Path(__file__).resolve().parent.parent / "resources"
    for filename in ("aethercod.ico", "aethercod.png", "aethercod.svg"):
        path = resources / filename
        if path.exists():
            return QIcon(str(path))
    return QIcon()
