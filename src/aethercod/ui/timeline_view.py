from __future__ import annotations

import re
from typing import Any

from PySide6.QtCore import QRectF, Qt, Signal
from PySide6.QtGui import QBrush, QColor, QFont, QPainter, QPen
from PySide6.QtWidgets import QGraphicsObject, QGraphicsScene, QGraphicsView

TIMELINE_THEME_DARK = {
    "background": "#101828",
    "axis": "#98a2b3",
    "tick": "#667085",
    "tick_label": "#eef1f5",
    "empty_text": "#d0d5dd",
}

TIMELINE_THEME_LIGHT = {
    "background": "#f6f8fa",
    "axis": "#475467",
    "tick": "#98a2b3",
    "tick_label": "#101828",
    "empty_text": "#344054",
}


def format_terra_year(year: int) -> str:
    """Keep signed years readable while making the calendar explicit."""
    return f"TE -{abs(year)}" if year < 0 else f"TE {year}"


def format_terra_date(value: str) -> str:
    match = re.fullmatch(r"([+-]?\d{1,6})(?:-(\d{2})(?:-(\d{2}))?)?", str(value))
    if not match:
        return str(value)
    result = format_terra_year(int(match.group(1)))
    if match.group(2):
        result += f"-{match.group(2)}"
    if match.group(3):
        result += f"-{match.group(3)}"
    return result


class TimelineEntry(QGraphicsObject):
    activated = Signal(str)

    def __init__(self, entry: dict[str, Any], x: float, y: float, width: float, color: str):
        super().__init__()
        self.entry = entry
        self.width = max(112.0, width)
        self.height = 54.0
        self.setPos(x, y)
        self.color = QColor(color)
        self.text_color = (
            QColor("#ffffff") if self.color.lightnessF() < 0.58 else QColor("#17212b")
        )
        precision = str(entry.get("precision") or "")
        date_text = (
            format_terra_date(str(entry.get("date_value")))
            if entry.get("date_value")
            else format_terra_year(int(entry["year"]))
            if entry.get("year") is not None
            else "未知年份"
        )
        end_text = format_terra_date(str(entry["end_date_value"])) if entry.get("end_date_value") else None
        if end_text is None and entry.get("end_year") is not None:
            end_text = format_terra_year(int(entry["end_year"]))
        if end_text is not None:
            date_text += f" – {end_text}"
        self.setToolTip(
            f"{entry.get('name', '')}\n{entry.get('label', entry.get('date_kind', ''))}\n{date_text} {precision}"
        )
        self.setAcceptHoverEvents(True)
        self.setAcceptedMouseButtons(Qt.LeftButton)
        self.hovered = False

    def boundingRect(self) -> QRectF:
        return QRectF(0, 0, self.width, self.height)

    def paint(self, painter: QPainter, _option, _widget=None) -> None:
        painter.setRenderHint(QPainter.Antialiasing)
        fill = self.color if self.color.isValid() else QColor("#7c3aed")
        painter.setPen(QPen(QColor("#ffffff") if self.hovered else fill.lighter(120), 2))
        painter.setBrush(QBrush(fill.darker(125) if self.hovered else fill))
        painter.drawRoundedRect(self.boundingRect(), 5, 5)
        painter.setPen(QPen(self.text_color))
        painter.setFont(QFont("Segoe UI", 9, QFont.Bold))
        name = str(self.entry.get("name", "未命名"))
        label = str(self.entry.get("label") or self.entry.get("date_kind", ""))
        painter.drawText(QRectF(10, 7, self.width - 20, 19), Qt.AlignLeft | Qt.TextSingleLine, name)
        painter.setFont(QFont("Segoe UI", 8))
        painter.drawText(
            QRectF(10, 29, self.width - 20, 17), Qt.AlignLeft | Qt.TextSingleLine, label
        )

    def hoverEnterEvent(self, event):
        self.hovered = True
        self.update()
        super().hoverEnterEvent(event)

    def hoverLeaveEvent(self, event):
        self.hovered = False
        self.update()
        super().hoverLeaveEvent(event)

    def mousePressEvent(self, event):
        event.accept()

    def mouseDoubleClickEvent(self, event):
        self.activated.emit(str(self.entry.get("entity_id", "")))
        event.accept()


class TimelineView(QGraphicsView):
    entry_activated = Signal(str)

    def __init__(self, parent=None):
        self.timeline_scene = QGraphicsScene()
        super().__init__(self.timeline_scene, parent)
        self.setRenderHint(QPainter.Antialiasing)
        self.setDragMode(QGraphicsView.ScrollHandDrag)
        self.setTransformationAnchor(QGraphicsView.AnchorUnderMouse)
        self._theme = dict(TIMELINE_THEME_DARK)
        self.setBackgroundBrush(QColor(self._theme["background"]))
        self._entries: list[dict[str, Any]] = []

    def set_theme(self, dark: bool) -> None:
        self._theme = dict(TIMELINE_THEME_DARK if dark else TIMELINE_THEME_LIGHT)
        self.setBackgroundBrush(QColor(self._theme["background"]))
        self.set_entries(self._entries)

    def set_entries(self, entries: list[dict[str, Any]]) -> None:
        self._entries = list(entries)
        self.timeline_scene.clear()
        positioned = []
        for entry in self._entries:
            try:
                entry = dict(entry)
                if entry.get("year") is None and entry.get("date_value"):
                    match = re.match(r"^([+-]?\d{1,6})(?:-|$)", str(entry["date_value"]))
                    if match:
                        entry["year"] = int(match.group(1))
                if entry.get("end_year") is None and entry.get("end_date_value"):
                    match = re.match(r"^([+-]?\d{1,6})(?:-|$)", str(entry["end_date_value"]))
                    if match:
                        entry["end_year"] = int(match.group(1))
                if entry.get("year") is not None:
                    entry["year"] = int(entry["year"])
                    if entry.get("end_year") is not None:
                        entry["end_year"] = int(entry["end_year"])
                    positioned.append(entry)
            except (TypeError, ValueError):
                continue
        if not positioned:
            self.timeline_scene.setSceneRect(0, 0, 900, 300)
            message = self.timeline_scene.addText(
                "暂无可定位年份的日期\n请先选择年份或调整筛选条件。", QFont("Segoe UI", 14)
            )
            message.setDefaultTextColor(QColor(self._theme["empty_text"]))
            message.setPos(260, 125)
            return
        years = [int(entry["year"]) for entry in positioned]
        end_years = [
            int(entry["end_year"]) for entry in positioned if entry.get("end_year") is not None
        ]
        start, end = min(years), max(years + end_years)
        span = max(1, end - start)
        available_width = max(720.0, float(self.viewport().width() - 80))
        scale = max(0.02, min(24.0, available_width / span))
        axis_width = max(available_width, span * scale + 120.0)
        left = 80.0
        axis_y = 200.0
        self.timeline_scene.addLine(
            left, axis_y, left + axis_width, axis_y, QPen(QColor(self._theme["axis"]), 2)
        )
        tick_step = 1 if span < 12 else max(1, span // 12)
        for year in range(start, end + 1, tick_step):
            x = left + (year - start) * scale
            self.timeline_scene.addLine(
                x, axis_y - 8, x, axis_y + 8, QPen(QColor(self._theme["tick"]), 1)
            )
            text = self.timeline_scene.addText(format_terra_year(year), QFont("Segoe UI", 8))
            text.setDefaultTextColor(QColor(self._theme["tick_label"]))
            text.setPos(x - text.boundingRect().width() / 2, axis_y + 12)
        occupied: dict[int, int] = {}
        for entry in sorted(positioned, key=lambda item: (int(item["year"]), item.get("name", ""))):
            year = int(entry["year"])
            lane = occupied.get(year, 0)
            occupied[year] = lane + 1
            x = left + (year - start) * scale
            y = axis_y - 72 - lane * 66
            end_year = entry.get("end_year")
            width = ((int(end_year) - year) * scale + 110) if end_year is not None else 130
            width = max(112.0, min(720.0, width))
            item = TimelineEntry(entry, x, y, width, str(entry.get("color", "#7c3aed")))
            item.activated.connect(self.entry_activated)
            self.timeline_scene.addItem(item)
            self.timeline_scene.addLine(
                x + 8, y + 54, x + 8, axis_y, QPen(QColor(self._theme["axis"]), 1, Qt.DashLine)
            )
        rect = self.timeline_scene.itemsBoundingRect().adjusted(-80, -80, 80, 80)
        self.timeline_scene.setSceneRect(rect)
        self.fitInView(rect, Qt.KeepAspectRatio)

    def wheelEvent(self, event) -> None:
        factor = 1.2 if event.angleDelta().y() > 0 else 1 / 1.2
        self.scale(factor, factor)

    def reset_zoom(self) -> None:
        rect = self.timeline_scene.itemsBoundingRect().adjusted(-80, -80, 80, 80)
        self.fitInView(rect, Qt.KeepAspectRatio)
