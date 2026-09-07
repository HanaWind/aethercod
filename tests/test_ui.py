from __future__ import annotations

import os
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

import pytest
from PySide6.QtWidgets import QApplication

from aethercod.ui.color_wheel import ColorWheel
from aethercod.ui.date_selector import WorldDateSelector
from aethercod.ui.graph_view import GraphView
from aethercod.ui.main_window import MainWindow
from aethercod.ui.timeline_view import TimelineView


@pytest.fixture(scope="session")
def qapp():
    app = QApplication.instance() or QApplication([])
    yield app
    app.processEvents()


def test_color_wheel_and_date_selector(qapp):
    wheel = ColorWheel("#ff0000")
    assert wheel.color().name() == "#ff0000"
    selector = WorldDateSelector("出生日期")
    selector.precision.setCurrentIndex(selector.precision.findData("year"))
    selector.year.setValue(-42)
    assert selector.value("birth")["year"] == -42
    wheel.close()
    selector.close()


def test_graph_timeline_png_and_activation(qapp, tmp_path):
    graph = GraphView()
    graph.load_graph(
        [
            {"id": "123e4567e89b12d3a456426614174000", "name": "甲"},
            {"id": "123e4567e89b12d3a456426614174001", "name": "乙"},
        ],
        [
            {
                "source_id": "123e4567e89b12d3a456426614174000",
                "target_id": "123e4567e89b12d3a456426614174001",
                "label": "关联",
            }
        ],
    )
    path = tmp_path / "graph.png"
    graph.export_png(str(path))
    assert path.exists() and path.stat().st_size > 100
    timeline = TimelineView()
    timeline.set_entries(
        [
            {
                "entity_id": "123e4567e89b12d3a456426614174000",
                "name": "甲",
                "year": -42,
                "label": "出生",
            },
            {
                "entity_id": "123e4567e89b12d3a456426614174001",
                "name": "乙",
                "year": 12,
                "end_year": 18,
                "label": "战争",
            },
        ]
    )
    assert len(timeline.timeline_scene.items()) > 0
    graph.close()
    timeline.close()


def test_main_window_read_only_and_icon(qapp, tmp_path):
    window = MainWindow()
    window._open_conn(str(tmp_path / "ui.aethercod"))
    assert not window.windowIcon().isNull()
    window.new_entity()
    assert window.current_id
    window.toggle_mode(True)
    assert not window.new_button.isEnabled()
    assert not window.import_action.isEnabled()
    assert not window.specialized.isEnabled()
    window.close()
