from __future__ import annotations

from typing import Any

from PySide6.QtCore import QRectF, Qt, Signal
from PySide6.QtGui import QBrush, QColor, QFont, QPainter, QPen
from PySide6.QtWidgets import QGraphicsObject, QGraphicsScene, QGraphicsView


class TimelineEntry(QGraphicsObject):
    activated = Signal(str)

    def __init__(self, entry: dict[str, Any], x: float, y: float, width: float, color: str):
        super().__init__()
        self.entry = entry
        self.width = max(112.0, width)
        self.height = 54.0
        self.setPos(x, y)
        self.color = QColor(color)
        self.setToolTip(
            f"{entry.get('name', '')}\n{entry.get('label', entry.get('date_kind', ''))}"
        )
        self.setAcceptHoverEvents(True)
        self.hovered = False

    def boundingRect(self) -> QRectF:
        return QRectF(0, 0, self.width, self.height)

    def paint(self, painter: QPainter, _option, _widget=None) -> None:
        painter.setRenderHint(QPainter.Antialiasing)
        fill = self.color if self.color.isValid() else QColor("#7c3aed")
        painter.setPen(QPen(QColor("#ffffff") if self.hovered else fill.lighter(120), 2))
        painter.setBrush(QBrush(fill.darker(125) if self.hovered else fill))
        painter.drawRoundedRect(self.boundingRect(), 12, 12)
        painter.setPen(QPen(QColor("#ffffff")))
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

    def mouseDoubleClickEvent(self, event):
        self.activated.emit(str(self.entry.get("entity_id", "")))
        super().mouseDoubleClickEvent(event)


class TimelineView(QGraphicsView):
    entry_activated = Signal(str)

    def __init__(self, parent=None):
        self.timeline_scene = QGraphicsScene()
        super().__init__(self.timeline_scene, parent)
        self.setRenderHint(QPainter.Antialiasing)
        self.setDragMode(QGraphicsView.ScrollHandDrag)
        self.setTransformationAnchor(QGraphicsView.AnchorUnderMouse)
        self.setBackgroundBrush(QColor("#101828"))
        self._entries: list[dict[str, Any]] = []

    def set_entries(self, entries: list[dict[str, Any]]) -> None:
        self._entries = entries
        self.timeline_scene.clear()
        if not entries:
            self.timeline_scene.setSceneRect(0, 0, 900, 300)
            return
        years = [int(entry["year"]) for entry in entries if entry.get("year") is not None]
        if not years:
            return
        start, end = min(years), max(years)
        span = max(1, end - start)
        scale = max(1.0, min(12.0, 1200.0 / span))
        left = 80.0
        axis_y = 200.0
        self.timeline_scene.addLine(
            left, axis_y, left + span * scale + 120, axis_y, QPen(QColor("#98a2b3"), 2)
        )
        tick_step = 1 if span < 12 else max(1, span // 12)
        for year in range(start, end + 1, tick_step):
            x = left + (year - start) * scale
            self.timeline_scene.addLine(x, axis_y - 8, x, axis_y + 8, QPen(QColor("#667085"), 1))
            text = self.timeline_scene.addText(str(year), QFont("Segoe UI", 8))
            text.setDefaultTextColor(QColor("#d0d5dd"))
            text.setPos(x - 18, axis_y + 12)
        occupied: dict[int, int] = {}
        for entry in sorted(entries, key=lambda item: (item.get("year", 0), item.get("name", ""))):
            year = int(entry["year"])
            lane = occupied.get(year, 0)
            occupied[year] = lane + 1
            x = left + (year - start) * scale
            y = axis_y - 72 - lane * 66
            end_year = entry.get("end_year")
            width = ((int(end_year) - year) * scale + 110) if end_year is not None else 130
            item = TimelineEntry(entry, x, y, width, str(entry.get("color", "#7c3aed")))
            item.activated.connect(self.entry_activated)
            self.timeline_scene.addItem(item)
            self.timeline_scene.addLine(
                x + 8, y + 54, x + 8, axis_y, QPen(QColor("#98a2b3"), 1, Qt.DashLine)
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
