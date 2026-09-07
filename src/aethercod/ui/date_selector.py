from __future__ import annotations

import calendar
import re
from typing import Any

from PySide6.QtCore import Signal
from PySide6.QtWidgets import QComboBox, QHBoxLayout, QLabel, QSpinBox, QWidget


class WorldDateSelector(QWidget):
    """Range-based world date picker; values cannot be typed manually."""

    date_changed = Signal()
    UNKNOWN_YEAR = -9999

    def __init__(self, label: str = "日期", parent=None):
        super().__init__(parent)
        self.caption = QLabel(label)
        self.precision = QComboBox()
        self.precision.addItem("未知", "unknown")
        self.precision.addItem("仅年份", "year")
        self.precision.addItem("年与月", "month")
        self.precision.addItem("完整日期", "day")
        self.year = QSpinBox()
        self.year.setRange(self.UNKNOWN_YEAR, 9999)
        self.year.setSpecialValueText("选择年份")
        self.year.lineEdit().setReadOnly(True)
        self.year.setValue(self.UNKNOWN_YEAR)
        self.year.setPrefix("")
        self.month = QComboBox()
        self.month.addItem("月份", None)
        for value in range(1, 13):
            self.month.addItem(f"{value:02d} 月", value)
        self.day = QComboBox()
        self.day.addItem("日期", None)
        for value in range(1, 32):
            self.day.addItem(f"{value:02d} 日", value)
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.caption)
        layout.addWidget(self.precision)
        layout.addWidget(self.year, 1)
        layout.addWidget(self.month)
        layout.addWidget(self.day)
        self.precision.currentIndexChanged.connect(self._precision_changed)
        self.year.valueChanged.connect(self._date_part_changed)
        self.month.currentIndexChanged.connect(self._refresh_days)
        self.day.currentIndexChanged.connect(self.date_changed)
        self._precision_changed()

    @staticmethod
    def format_year(year: int) -> str:
        return f"纪元前 {abs(year)} 年" if year < 0 else f"{year} 年"

    def _precision_changed(self) -> None:
        precision = self.precision.currentData()
        self.year.setEnabled(precision != "unknown")
        self.month.setEnabled(precision in {"month", "day"})
        self.day.setEnabled(precision == "day")
        self.date_changed.emit()

    def _date_part_changed(self) -> None:
        self._refresh_days()
        self.date_changed.emit()

    def _refresh_days(self) -> None:
        selected = self.day.currentData()
        year = self.year.value()
        if year == self.UNKNOWN_YEAR or year == 0:
            year = 2000
        month = self.month.currentData() or 1
        days = calendar.monthrange(year, month)[1]
        self.day.blockSignals(True)
        self.day.clear()
        self.day.addItem("日期", None)
        for value in range(1, days + 1):
            self.day.addItem(f"{value:02d} 日", value)
        self.day.setCurrentIndex(max(0, self.day.findData(selected)))
        self.day.blockSignals(False)
        self.date_changed.emit()

    def value(self, date_kind: str, label: str = "") -> dict[str, Any] | None:
        precision = self.precision.currentData()
        year = self.year.value()
        if precision == "unknown" or year == self.UNKNOWN_YEAR:
            return None
        month = self.month.currentData() if precision in {"month", "day"} else None
        day = self.day.currentData() if precision == "day" else None
        date_value = None
        if month is not None:
            date_value = f"{year:+07d}-{month:02d}"
            if day is not None:
                date_value += f"-{day:02d}"
        return {
            "date_kind": date_kind,
            "label": label or self.caption.text(),
            "year": year,
            "date_value": date_value,
            "precision": precision,
        }

    def set_value(self, value: dict[str, Any] | None) -> None:
        self.blockSignals(True)
        if not value:
            self.precision.setCurrentIndex(0)
            self.year.setValue(self.UNKNOWN_YEAR)
            self.month.setCurrentIndex(0)
            self.day.setCurrentIndex(0)
        else:
            precision = value.get("precision") or ("day" if value.get("date_value") else "year")
            self.precision.setCurrentIndex(max(0, self.precision.findData(precision)))
            year = value.get("year")
            self.year.setValue(year if isinstance(year, int) else self.UNKNOWN_YEAR)
            match = re.fullmatch(
                r"([+-]?\d+)-(\d{2})(?:-(\d{2}))?", str(value.get("date_value") or "")
            )
            if match:
                self.month.setCurrentIndex(max(0, self.month.findData(int(match.group(2)))))
                if match.group(3):
                    self.day.setCurrentIndex(max(0, self.day.findData(int(match.group(3)))))
        self.blockSignals(False)
        self._precision_changed()
