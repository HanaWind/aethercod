from __future__ import annotations

from PySide6.QtCore import QEasingCurve, QPropertyAnimation
from PySide6.QtWidgets import QDialog, QGraphicsOpacityEffect


class AnimatedDialog(QDialog):
    """A lightweight fade-in dialog that also works with ``exec()``."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._opacity_effect = QGraphicsOpacityEffect(self)
        self.setGraphicsEffect(self._opacity_effect)
        self._fade = QPropertyAnimation(self._opacity_effect, b"opacity", self)
        self._fade.setDuration(160)
        self._fade.setEasingCurve(QEasingCurve.OutCubic)

    def showEvent(self, event) -> None:
        super().showEvent(event)
        self._fade.stop()
        self._opacity_effect.setOpacity(0.0)
        self._fade.setStartValue(0.0)
        self._fade.setEndValue(1.0)
        self._fade.start()
