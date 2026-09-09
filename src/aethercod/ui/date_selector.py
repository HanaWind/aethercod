from __future__ import annotations

import calendar
import re
from copy import deepcopy
from typing import Any

from PySide6.QtCore import Signal
from PySide6.QtWidgets import QComboBox, QHBoxLayout, QLabel, QSpinBox, QWidget


class WorldDateSelector(QWidget):
    """Noneditable world date picker with lossless, silent loading."""

    date_changed = Signal()
    MIN_YEAR = -999_999
    MAX_YEAR = 999_999
    UNKNOWN_YEAR = MIN_YEAR - 1

    def __init__(self, label: str = "日期", parent=None):
        super().__init__(parent)
        self._loading = True
        self._original = None
        self._baseline = None
        self.caption = QLabel(label)
        self.precision = QComboBox()
        for text, value in (
            ("未知", "unknown"),
            ("仅年份", "year"),
            ("年与月", "month"),
            ("完整日期", "day"),
        ):
            self.precision.addItem(text, value)
        self.year = QSpinBox()
        self.year.setRange(self.UNKNOWN_YEAR, self.MAX_YEAR)
        self.year.setSpecialValueText("选择年份")
        self.year.lineEdit().setReadOnly(True)
        self.year_step = QComboBox()
        self.year_step.setToolTip("年份步长")
        for step in (1, 10, 100, 1000, 10000, 100000):
            self.year_step.addItem(str(step), step)
        self.year_step.currentIndexChanged.connect(
            lambda: self.year.setSingleStep(self.year_step.currentData())
        )
        self.month = QComboBox()
        self.month.addItem("月份", None)
        for value in range(1, 13):
            self.month.addItem(f"{value:02d} 月", value)
        self.day = QComboBox()
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        for widget in (
            self.caption,
            self.precision,
            self.year,
            self.year_step,
            self.month,
            self.day,
        ):
            layout.addWidget(widget)
        self.precision.currentIndexChanged.connect(self._precision_changed)
        self.year.valueChanged.connect(self._date_part_changed)
        self.month.currentIndexChanged.connect(self._date_part_changed)
        self.day.currentIndexChanged.connect(self._emit_changed)
        self.set_value(None)

    @staticmethod
    def format_year(year: int) -> str:
        return f"纪元前 {abs(year)} 年" if year < 0 else f"{year} 年"

    def _precision_changed(self) -> None:
        precision = self.precision.currentData()
        self.year.setEnabled(precision != "unknown")
        self.year_step.setEnabled(precision != "unknown")
        self.month.setEnabled(precision in {"month", "day"})
        self.day.setEnabled(precision == "day")
        if not self._loading:
            self._loading = True
            if precision != "unknown" and self.year.value() == self.UNKNOWN_YEAR:
                self.year.setValue(0)
            if precision in {"month", "day"} and self.month.currentData() is None:
                self.month.setCurrentIndex(1)
            if precision == "day" and self.day.currentData() is None:
                self.day.setCurrentIndex(1)
            self._loading = False
            self._emit_changed()

    def _emit_changed(self) -> None:
        if not self._loading:
            self.date_changed.emit()

    def _date_part_changed(self) -> None:
        self._refresh_days()
        self._emit_changed()

    def _refresh_days(self) -> None:
        selected = self.day.currentData()
        year = self.year.value()
        if year == self.UNKNOWN_YEAR:
            year = 2000
        days = calendar.monthrange(year, self.month.currentData() or 1)[1]
        blocked = self.day.blockSignals(True)
        self.day.clear()
        self.day.addItem("日期", None)
        for value in range(1, days + 1):
            self.day.addItem(f"{value:02d} 日", value)
        self.day.setCurrentIndex(self.day.findData(min(selected, days)) if selected else 0)
        self.day.blockSignals(blocked)

    def _state(self) -> tuple:
        return (
            self.precision.currentData(),
            self.year.value(),
            self.month.currentData(),
            self.day.currentData(),
        )

    def value(self, date_kind: str, label: str = "") -> dict[str, Any] | None:
        if self._state() == self._baseline:
            return deepcopy(self._original)
        precision = self.precision.currentData()
        year = self.year.value()
        if precision == "unknown" or year == self.UNKNOWN_YEAR:
            return None
        month = self.month.currentData() if precision in {"month", "day"} else None
        day = self.day.currentData() if precision == "day" else None
        if not self.MIN_YEAR <= year <= self.MAX_YEAR:
            raise ValueError("Date year must be between -999999 and 999999")
        if (precision in {"month", "day"} and month is None) or (
            precision == "day" and day is None
        ):
            raise ValueError("Select all components of the date")
        date_value = None
        if month is not None:
            date_value = f"{year:+07d}-{month:02d}"
            if day is not None:
                date_value += f"-{day:02d}"
        result = deepcopy(self._original) if self._original is not None else {}
        result.update(
            {
                "date_kind": date_kind,
                "label": label or result.get("label", self.caption.text()),
                "year": year,
                "date_value": date_value,
                "precision": "range" if result.get("precision") == "range" else precision,
            }
        )
        return result

    def set_value(self, value: dict[str, Any] | None) -> None:
        self._loading = True
        self._original = deepcopy(value)
        self.year.setRange(self.UNKNOWN_YEAR, self.MAX_YEAR)
        self.year.setSpecialValueText("选择年份")
        self.year.setToolTip("")
        self.precision.setCurrentIndex(0)
        self.year.setValue(self.UNKNOWN_YEAR)
        self.month.setCurrentIndex(0)
        self._refresh_days()
        self.day.setCurrentIndex(0)
        if value is not None:
            match = re.fullmatch(
                r"([+-]?\d+)(?:-(\d{2})(?:-(\d{2}))?)?", str(value.get("date_value") or "")
            )
            precision = value.get("precision")
            if precision not in {"year", "month", "day"}:
                precision = (
                    "day"
                    if match and match.group(3)
                    else "month" if match and match.group(2) else "year"
                )
            self.precision.setCurrentIndex(self.precision.findData(precision))
            year = value.get("year")
            if year is None and match:
                year = int(match.group(1))
            # Legacy years are retained even when outside the domain or Qt's integer range.
            if type(year) is int and -2_147_483_648 <= year <= 2_147_483_647:
                self.year.setRange(min(self.UNKNOWN_YEAR, year), max(self.MAX_YEAR, year))
                if year <= self.UNKNOWN_YEAR:
                    self.year.setSpecialValueText("")
                self.year.setValue(year)
            self.year.setToolTip(str(year) if year is not None else "")
            if match and match.group(2):
                self.month.setCurrentIndex(max(0, self.month.findData(int(match.group(2)))))
                self._refresh_days()
                if match.group(3):
                    self.day.setCurrentIndex(max(0, self.day.findData(int(match.group(3)))))
        self._precision_changed()
        self._baseline = self._state()
        self._loading = False

    def set_date_text(self, value: str | None) -> None:
        """Load a custom date string silently."""
        self.set_value({"date_value": value} if value else None)

    def date_text(self) -> str | None:
        """Return YYYY, YYYY-MM, or YYYY-MM-DD for a custom date field."""
        value = self.value("custom")
        if value is None:
            return None
        return value.get("date_value") or str(value["year"])
