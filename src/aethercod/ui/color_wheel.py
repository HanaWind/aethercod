from __future__ import annotations

import math

from PySide6.QtCore import QPointF, QRectF, Qt, Signal
from PySide6.QtGui import QColor, QImage, QPainter, QPen
from PySide6.QtWidgets import (
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QSlider,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)


class ColorWheel(QWidget):
    color_changed = Signal(QColor)

    def __init__(self, initial: str = "#7c3aed", parent=None):
        super().__init__(parent)
        self.setMinimumWidth(330)
        self._color = QColor(initial)
        self._hue = 270.0
        self._sat = 0.82
        self._value = 0.93
        self._sync_from_color(self._color)
        self.wheel = _WheelCanvas(self)
        self.wheel.point_changed.connect(self._set_hs)
        self.brightness = QSlider(Qt.Horizontal)
        self.brightness.setRange(0, 100)
        self.brightness.valueChanged.connect(self._set_value)
        self.swatch = QLabel()
        self.swatch.setFixedSize(48, 30)
        self.hex_edit = QLineEdit()
        self.hex_edit.setPlaceholderText("#RRGGBB")
        self.hex_edit.editingFinished.connect(self._set_hex)
        self.rgb = []
        rgb_layout = QHBoxLayout()
        rgb_layout.addWidget(self.swatch)
        rgb_layout.addWidget(QLabel("Hex"))
        rgb_layout.addWidget(self.hex_edit)
        for label, channel in (("R", 0), ("G", 1), ("B", 2)):
            spin = QSpinBox()
            spin.setRange(0, 255)
            spin.setPrefix(label + " ")
            spin.valueChanged.connect(lambda value, c=channel: self._set_rgb(c, value))
            self.rgb.append(spin)
            rgb_layout.addWidget(spin)
        layout = QVBoxLayout(self)
        layout.addWidget(self.wheel, alignment=Qt.AlignCenter)
        layout.addWidget(QLabel("亮度"))
        layout.addWidget(self.brightness)
        layout.addLayout(rgb_layout)
        self._update_controls()

    def _sync_from_color(self, color: QColor):
        h, s, v, _ = color.getHsvF()
        self._hue = 0.0 if h < 0 else h * 360
        self._sat = s
        self._value = v

    def _set_hs(self, point: QPointF):
        center = QPointF(self.wheel.width() / 2, self.wheel.height() / 2)
        dx, dy = point.x() - center.x(), point.y() - center.y()
        radius = min(self.wheel.width(), self.wheel.height()) / 2 - 8
        distance = min(radius, math.hypot(dx, dy))
        self._hue = (math.degrees(math.atan2(dy, dx)) + 360) % 360
        self._sat = distance / radius
        self._emit_color()

    def _set_value(self, value: int):
        self._value = value / 100
        self._emit_color()

    def _set_hex(self):
        color = QColor(self.hex_edit.text().strip())
        if color.isValid():
            self._color = color
            self._sync_from_color(color)
            self._emit_color()
        else:
            self.hex_edit.setText(self._color.name())

    def _set_rgb(self, channel: int, value: int):
        values = [spin.value() for spin in self.rgb]
        values[channel] = value
        color = QColor(*values)
        self._color = color
        self._sync_from_color(color)
        self._emit_color(skip_rgb=True)

    def _emit_color(self, skip_rgb: bool = False):
        self._color = QColor.fromHsvF(
            self._hue / 360, max(0, min(1, self._sat)), max(0, min(1, self._value))
        )
        self._update_controls(skip_rgb)
        self.wheel.update()
        self.color_changed.emit(self._color)

    def _update_controls(self, skip_rgb: bool = False):
        self.swatch.setStyleSheet(
            f"background: {self._color.name()}; border-radius: 8px; border: 1px solid #98a2b3;"
        )
        self.hex_edit.setText(self._color.name())
        self.brightness.blockSignals(True)
        self.brightness.setValue(round(self._value * 100))
        self.brightness.blockSignals(False)
        if not skip_rgb:
            for spin, value in zip(self.rgb, self._color.getRgb()[:3]):
                spin.blockSignals(True)
                spin.setValue(value)
                spin.blockSignals(False)

    def color(self) -> QColor:
        return self._color

    def set_color(self, color: str | QColor):
        self._color = QColor(color) if isinstance(color, str) else color
        self._sync_from_color(self._color)
        self._update_controls()
        self.wheel.update()


class _WheelCanvas(QWidget):
    point_changed = Signal(QPointF)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumSize(230, 230)
        self.setMaximumSize(260, 260)
        self._image: QImage | None = None

    def paintEvent(self, _event):
        size = min(self.width(), self.height())
        center = QPointF(self.width() / 2, self.height() / 2)
        radius = size / 2 - 8
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)
        if self._image is None or self._image.size() != self.size():
            self._image = QImage(self.size(), QImage.Format_ARGB32)
            self._image.fill(Qt.transparent)
            for x in range(self.width()):
                for y in range(self.height()):
                    dx, dy = x - center.x(), y - center.y()
                    distance = math.hypot(dx, dy)
                    if distance <= radius:
                        hue = (math.degrees(math.atan2(dy, dx)) + 360) % 360
                        saturation = distance / radius
                        self._image.setPixelColor(x, y, QColor.fromHsvF(hue / 360, saturation, 1.0))
            painter.drawImage(0, 0, self._image)
        else:
            painter.drawImage(0, 0, self._image)
        painter.setPen(QPen(Qt.white, 3))
        painter.setBrush(Qt.NoBrush)
        painter.drawEllipse(
            QRectF(center.x() - radius, center.y() - radius, radius * 2, radius * 2)
        )

    def mousePressEvent(self, event):
        self.point_changed.emit(event.position())

    def mouseMoveEvent(self, event):
        if event.buttons() & Qt.LeftButton:
            self.point_changed.emit(event.position())
