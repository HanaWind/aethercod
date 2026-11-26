from __future__ import annotations

import os
import json
from pathlib import Path
import sys

from .app_identity import set_webview_window_icon
from .bridge_api import BridgeAPI


def run_webview(project_argument: Path | None = None) -> int:
    import webview

    if project_argument is None:
        project_argument = next(
            (Path(value).expanduser() for value in sys.argv[1:] if value.lower().endswith(".aethercod")),
            None,
        )
    api = BridgeAPI()
    startup_error = ""
    if project_argument is not None:
        try:
            candidate = project_argument.resolve(strict=True)
            if not candidate.is_file() or candidate.suffix.lower() != ".aethercod":
                raise ValueError("选择的文件不是有效的 .aethercod 资料库文件")
            api.open_project(str(candidate))
        except (OSError, ValueError, RuntimeError) as error:
            startup_error = str(error)
    dev_url = os.environ.get("AETHERCOD_DEV_URL", "").strip()
    frontend = Path(__file__).resolve().parents[1] / "frontend_dist" / "index.html"
    if dev_url:
        url = dev_url
    elif frontend.is_file():
        url = frontend.as_uri()
    else:
        raise FileNotFoundError(
            "The Aethercod frontend is not built. Run `npm install` and `npm run build` in frontend/."
        )

    window = webview.create_window(
        "Aethercod",
        url=url,
        js_api=api,
        width=1440,
        height=920,
        min_size=(740, 500),
        resizable=True,
        frameless=True,
        easy_drag=False,
        text_select=False,
        background_color="#F4F6F9",
    )
    api.bind_window(window)
    window.events.shown += lambda *_args: set_webview_window_icon(window)
    if startup_error:
        window.events.loaded += lambda *_args: window.run_js(
            "window.__aethercodStartupError = " + json.dumps(startup_error)
        )
    webview.start(debug=bool(dev_url), http_server=False, private_mode=False)
    api.close_project()
    return 0
