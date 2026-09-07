from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from PySide6.QtCore import QPointF, QTimer, Qt, Signal, QRectF
from PySide6.QtGui import QBrush, QColor, QFont, QImage, QPainter, QPainterPath, QPen
from PySide6.QtWidgets import (
    QGraphicsItem,
    QGraphicsObject,
    QGraphicsPathItem,
    QGraphicsScene,
    QGraphicsView,
)


@dataclass(slots=True)
class GraphNodeData:
    id: str
    name: str
    color: str = "#7c3aed"
    icon: str = "✦"
    type_name: str = ""


class GraphNode(QGraphicsObject):
    activated = Signal(str)

    def __init__(self, data: GraphNodeData, radius: float = 34.0):
        super().__init__()
        self.data = data
        self.radius = radius
        self.edges: list[GraphEdge] = []
        self.setAcceptHoverEvents(True)
        self.setFlag(QGraphicsItem.ItemIsMovable, True)
        self.setFlag(QGraphicsItem.ItemSendsGeometryChanges, True)
        self.setToolTip(f"{data.name}\n{data.type_name}\n{data.id}")
        self._hovered = False

    def boundingRect(self) -> QRectF:
        return QRectF(
            -self.radius - 2, -self.radius - 2, (self.radius + 2) * 2, (self.radius + 2) * 2 + 30
        )

    def paint(self, painter: QPainter, _option, _widget=None) -> None:
        color = QColor(self.data.color)
        if not color.isValid():
            color = QColor("#7c3aed")
        painter.setRenderHint(QPainter.Antialiasing)
        painter.setPen(
            QPen(
                QColor("#ffffff") if self._hovered else color.lighter(125),
                3 if self._hovered else 2,
            )
        )
        painter.setBrush(QBrush(color))
        painter.drawEllipse(QRectF(-self.radius, -self.radius, self.radius * 2, self.radius * 2))
        painter.setPen(QPen(QColor("#ffffff")))
        painter.setFont(QFont("Segoe UI Symbol", 16))
        painter.drawText(
            QRectF(-self.radius, -12, self.radius * 2, 24), Qt.AlignCenter, self.data.icon
        )
        painter.setPen(QPen(QColor("#eef1f5")))
        painter.setFont(QFont("Segoe UI", 9, QFont.Bold))
        name = self.data.name if len(self.data.name) <= 18 else self.data.name[:17] + "…"
        painter.drawText(QRectF(-90, self.radius + 5, 180, 22), Qt.AlignCenter, name)

    def itemChange(self, change, value):
        if change == QGraphicsItem.ItemPositionHasChanged:
            for edge in self.edges:
                edge.update_path()
        return super().itemChange(change, value)

    def hoverEnterEvent(self, event) -> None:
        self._hovered = True
        self.update()
        for edge in self.edges:
            edge.set_highlight(True)
        super().hoverEnterEvent(event)

    def hoverLeaveEvent(self, event) -> None:
        self._hovered = False
        self.update()
        for edge in self.edges:
            edge.set_highlight(False)
        super().hoverLeaveEvent(event)

    def mouseDoubleClickEvent(self, event) -> None:
        self.activated.emit(self.data.id)
        super().mouseDoubleClickEvent(event)


class GraphEdge(QGraphicsPathItem):
    def __init__(self, source: GraphNode, target: GraphNode, label: str = ""):
        super().__init__()
        self.source = source
        self.target = target
        self.label = label
        self._highlighted = False
        self.setZValue(-1)
        self.setAcceptedMouseButtons(Qt.NoButton)
        source.edges.append(self)
        target.edges.append(self)
        self.update_path()

    def update_path(self) -> None:
        start, end = self.source.pos(), self.target.pos()
        vector = end - start
        length = math.hypot(vector.x(), vector.y()) or 1.0
        normal = QPointF(-vector.y() / length, vector.x() / length)
        control = (start + end) / 2 + normal * min(42.0, length * 0.18)
        path = QPainterPath(start)
        path.quadTo(control, end)
        self.setPath(path)
        self.update()

    def set_highlight(self, enabled: bool) -> None:
        self._highlighted = enabled
        self.update()

    def paint(self, painter: QPainter, _option, _widget=None) -> None:
        painter.setRenderHint(QPainter.Antialiasing)
        pen = QPen(
            QColor("#a78bfa") if self._highlighted else QColor("#667085"),
            3 if self._highlighted else 1.5,
        )
        painter.setPen(pen)
        painter.setBrush(Qt.NoBrush)
        painter.drawPath(self.path())
        if self.path().length() > 0:
            point = self.path().pointAtPercent(0.96)
            tangent = self.path().pointAtPercent(0.94) - point
            angle = math.atan2(tangent.y(), tangent.x())
            arrow = QPainterPath()
            size = 8.0
            arrow.moveTo(point)
            arrow.lineTo(
                point + QPointF(math.cos(angle + 0.55) * size, math.sin(angle + 0.55) * size)
            )
            arrow.lineTo(
                point + QPointF(math.cos(angle - 0.55) * size, math.sin(angle - 0.55) * size)
            )
            arrow.closeSubpath()
            painter.setBrush(pen.color())
            painter.drawPath(arrow)
        if self.label:
            midpoint = self.path().pointAtPercent(0.5)
            painter.setPen(QPen(QColor("#d0d5dd")))
            painter.setFont(QFont("Segoe UI", 8))
            painter.drawText(
                QRectF(midpoint.x() - 70, midpoint.y() - 18, 140, 18), Qt.AlignCenter, self.label
            )


class GraphView(QGraphicsView):
    node_activated = Signal(str)

    def __init__(self, parent=None):
        self.graph_scene = QGraphicsScene()
        super().__init__(self.graph_scene, parent)
        self.setRenderHint(QPainter.Antialiasing)
        self.setViewportUpdateMode(QGraphicsView.FullViewportUpdate)
        self.setDragMode(QGraphicsView.ScrollHandDrag)
        self.setTransformationAnchor(QGraphicsView.AnchorUnderMouse)
        self.setBackgroundBrush(QColor("#111827"))
        self._nodes: dict[str, GraphNode] = {}
        self._edges: list[GraphEdge] = []
        self._phase = 0.0
        self._timer = QTimer(self)
        self._timer.timeout.connect(self._relax)
        self._timer.start(70)

    def load_graph(self, nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> None:
        self.graph_scene.clear()
        self._nodes.clear()
        self._edges.clear()
        converted: list[GraphNodeData] = [
            GraphNodeData(
                str(item["id"]),
                str(item.get("name", "未命名")),
                str(item.get("color", "#7c3aed")),
                str(item.get("icon", "✦")),
                str(item.get("type_name", "")),
            )
            for item in nodes
        ]
        count = max(1, len(converted))
        radius = max(160.0, count * 35.0)
        for index, data in enumerate(converted):
            item = GraphNode(data)
            angle = 2 * math.pi * index / count
            item.setPos(math.cos(angle) * radius, math.sin(angle) * radius)
            item.activated.connect(self.node_activated)
            self.graph_scene.addItem(item)
            self._nodes[data.id] = item
        for edge in edges:
            source = self._nodes.get(str(edge.get("source_id")))
            target = self._nodes.get(str(edge.get("target_id")))
            if source and target:
                relation = GraphEdge(source, target, str(edge.get("label", "")))
                self.graph_scene.addItem(relation)
                self._edges.append(relation)
        self.graph_scene.setSceneRect(
            self.graph_scene.itemsBoundingRect().adjusted(-120, -120, 120, 120)
        )
        if self._nodes:
            self.fitInView(
                self.graph_scene.itemsBoundingRect().adjusted(-80, -80, 80, 80), Qt.KeepAspectRatio
            )

    def _relax(self) -> None:
        if len(self._nodes) < 2:
            return
        self._phase += 0.035
        nodes = list(self._nodes.values())
        forces = {node: QPointF(0, 0) for node in nodes}
        for i, first in enumerate(nodes):
            for second in nodes[i + 1 :]:
                delta = first.pos() - second.pos()
                distance = max(30.0, math.hypot(delta.x(), delta.y()))
                push = min(2.0, 900.0 / (distance * distance))
                unit = delta / distance
                forces[first] += unit * push
                forces[second] -= unit * push
        for edge in self._edges:
            delta = edge.target.pos() - edge.source.pos()
            distance = max(1.0, math.hypot(delta.x(), delta.y()))
            pull = max(-1.2, min(1.2, (distance - 190.0) * 0.0015))
            unit = delta / distance
            forces[edge.source] += unit * pull
            forces[edge.target] -= unit * pull
        for index, node in enumerate(nodes):
            if node.isSelected() or node.isUnderMouse():
                continue
            drift = QPointF(
                math.cos(self._phase + index) * 0.16, math.sin(self._phase + index) * 0.16
            )
            node.setPos(node.pos() + forces[node] + drift)

    def wheelEvent(self, event) -> None:
        factor = 1.18 if event.angleDelta().y() > 0 else 1 / 1.18
        self.scale(factor, factor)

    def reset_layout(self) -> None:
        self.load_graph(
            [
                (
                    node.data.__dict__
                    if hasattr(node.data, "__dict__")
                    else {
                        "id": node.data.id,
                        "name": node.data.name,
                        "color": node.data.color,
                        "icon": node.data.icon,
                        "type_name": node.data.type_name,
                    }
                )
                for node in self._nodes.values()
            ],
            [
                {
                    "source_id": edge.source.data.id,
                    "target_id": edge.target.data.id,
                    "label": edge.label,
                }
                for edge in self._edges
            ],
        )

    def export_png(self, path: str, scale: int = 2) -> None:
        rect = self.graph_scene.itemsBoundingRect().adjusted(-50, -50, 50, 50)
        size = rect.size().toSize() * scale
        image = QImage(size, QImage.Format_ARGB32_Premultiplied)
        image.fill(QColor("#111827"))
        painter = QPainter(image)
        painter.setRenderHint(QPainter.Antialiasing)
        painter.scale(scale, scale)
        painter.translate(-rect.left(), -rect.top())
        self.graph_scene.render(painter, QRectF(), rect)
        painter.end()
        if not image.save(path):
            raise OSError(f"无法写入关系图：{path}")
