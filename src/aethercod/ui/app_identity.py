from __future__ import annotations

import ctypes
import sys
from pathlib import Path

WINDOWS_APP_ID = "Aethercod.WorldbuildingDatabase"
_WINDOW_ICON_HANDLES: list[int] = []
DWMWA_WINDOW_CORNER_PREFERENCE = 33
DWMWCP_DONOTROUND = 1
DWMWCP_ROUND = 2


def set_webview_window_corners(window, maximized: bool) -> None:
    """Apply the Windows 11 corner preference to the actual native window."""
    if sys.platform != "win32":
        return
    try:
        from ctypes import wintypes

        native = getattr(window, "native", None)
        if native is None:
            return
        set_attribute = ctypes.windll.dwmapi.DwmSetWindowAttribute
        set_attribute.argtypes = [
            wintypes.HWND, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD,
        ]
        set_attribute.restype = ctypes.c_long
        preference = ctypes.c_int(DWMWCP_DONOTROUND if maximized else DWMWCP_ROUND)
        set_attribute(
            native.Handle.ToInt64(), DWMWA_WINDOW_CORNER_PREFERENCE,
            ctypes.byref(preference), ctypes.sizeof(preference),
        )
    except (AttributeError, OSError, TypeError, ValueError):
        return


def configure_process_identity() -> None:
    """Give Windows a stable taskbar identity instead of python.exe's identity."""
    if sys.platform != "win32":
        return
    try:
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(WINDOWS_APP_ID)
    except (AttributeError, OSError):
        pass


def application_icon():
    from PySide6.QtGui import QIcon

    resources = Path(__file__).resolve().parent.parent / "resources"
    for filename in ("aethercod.ico", "aethercod.png", "aethercod.svg"):
        path = resources / filename
        if path.exists():
            return QIcon(str(path))
    return QIcon()


def application_icon_path() -> Path:
    resources = Path(__file__).resolve().parent.parent / "resources"
    return resources / "aethercod.ico"


def set_webview_window_icon(window) -> None:
    """Apply the packaged ICO to the native WinForms window and taskbar entry."""
    if sys.platform != "win32":
        return
    try:
        import ctypes

        native = getattr(window, "native", None)
        handle = int(native.Handle.ToInt64()) if native is not None else 0
        if not handle:
            return
        load_image = ctypes.windll.user32.LoadImageW
        load_image.argtypes = [
            ctypes.c_void_p,
            ctypes.c_wchar_p,
            ctypes.c_uint,
            ctypes.c_int,
            ctypes.c_int,
            ctypes.c_uint,
        ]
        load_image.restype = ctypes.c_void_p
        send_message = ctypes.windll.user32.SendMessageW
        send_message.argtypes = [
            ctypes.c_void_p,
            ctypes.c_uint,
            ctypes.c_size_t,
            ctypes.c_void_p,
        ]
        send_message.restype = ctypes.c_void_p
        for size, icon_kind in ((16, 0), (32, 1)):
            icon = load_image(
                None,
                str(application_icon_path()),
                1,
                size,
                size,
                0x0010,
            )
            if icon:
                send_message(handle, 0x0080, icon_kind, icon)
                _WINDOW_ICON_HANDLES.append(int(icon))
    except (AttributeError, OSError, TypeError, ValueError):
        return
