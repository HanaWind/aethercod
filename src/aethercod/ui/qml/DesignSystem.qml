// 统一的设计系统和主题配置 - 现代扁平风格

import QtQuick 2.15

QtObject {
    id: designSystem

    // ==================== 颜色系统 ====================

    property bool isDark: false  // 由外部控制（去掉readonly）

    // 主色调 - 柔和的青绿色系
    readonly property color primary: isDark ? "#5eead4" : "#14b8a6"
    readonly property color primaryHover: isDark ? "#7df4e0" : "#0d9488"
    readonly property color primaryLight: isDark ? "#2dd4bf" : "#99f6e4"
    readonly property color primaryDark: isDark ? "#2c7a7b" : "#115e59"

    // 次要色 - 紫色系
    readonly property color secondary: isDark ? "#a78bfa" : "#8b5cf6"
    readonly property color secondaryHover: isDark ? "#c4b5fd" : "#7c3aed"

    // 中性色
    readonly property color background: isDark ? "#0f172a" : "#f8fafc"
    readonly property color surface: isDark ? "#1e293b" : "#ffffff"
    readonly property color surfaceAlt: isDark ? "#334155" : "#f1f5f9"
    readonly property color border: isDark ? "#475569" : "#e2e8f0"
    readonly property color borderHover: isDark ? "#64748b" : "#cbd5e1"

    // 文字颜色
    readonly property color textPrimary: isDark ? "#f1f5f9" : "#0f172a"
    readonly property color textSecondary: isDark ? "#cbd5e1" : "#475569"
    readonly property color textTertiary: isDark ? "#94a3b8" : "#64748b"
    readonly property color textDisabled: isDark ? "#64748b" : "#94a3b8"

    // 语义化颜色
    readonly property color success: isDark ? "#34d399" : "#10b981"
    readonly property color successBg: isDark ? "#064e3b" : "#d1fae5"
    readonly property color warning: isDark ? "#fbbf24" : "#f59e0b"
    readonly property color warningBg: isDark ? "#78350f" : "#fef3c7"
    readonly property color danger: isDark ? "#f87171" : "#ef4444"
    readonly property color dangerBg: isDark ? "#7f1d1d" : "#fee2e2"
    readonly property color info: isDark ? "#60a5fa" : "#3b82f6"
    readonly property color infoBg: isDark ? "#1e3a8a" : "#dbeafe"

    // 覆盖层和阴影
    readonly property color overlay: isDark ? "#0f172a99" : "#0f172a66"
    readonly property color shadowColor: isDark ? "#00000066" : "#00000022"

    // 渐变背景 - 保留但更现代
    readonly property var gradientStops: isDark ? [
        {"pos": 0.0, "color": "#0f172a"},
        {"pos": 0.5, "color": "#1e293b"},
        {"pos": 1.0, "color": "#0f172a"}
    ] : [
        {"pos": 0.0, "color": "#f8fafc"},
        {"pos": 0.5, "color": "#f1f5f9"},
        {"pos": 1.0, "color": "#f8fafc"}
    ]

    // ==================== 间距系统 ====================

    readonly property int spacing1: 4
    readonly property int spacing2: 8
    readonly property int spacing3: 12
    readonly property int spacing4: 16
    readonly property int spacing5: 20
    readonly property int spacing6: 24
    readonly property int spacing8: 32
    readonly property int spacing10: 40
    readonly property int spacing12: 48
    readonly property int spacing16: 64

    // ==================== 圆角系统 ====================

    readonly property int radiusNone: 0
    readonly property int radiusSmall: 4
    readonly property int radiusMedium: 8
    readonly property int radiusLarge: 12
    readonly property int radiusXLarge: 16
    readonly property int radiusFull: 9999

    // ==================== 阴影系统 ====================

    // 小阴影 - 用于卡片
    readonly property var shadowSmall: ({
        "horizontalOffset": 0,
        "verticalOffset": 1,
        "radius": 3,
        "samples": 6,
        "color": shadowColor
    })

    // 中等阴影 - 用于悬浮元素
    readonly property var shadowMedium: ({
        "horizontalOffset": 0,
        "verticalOffset": 4,
        "radius": 6,
        "samples": 12,
        "color": shadowColor
    })

    // 大阴影 - 用于对话框
    readonly property var shadowLarge: ({
        "horizontalOffset": 0,
        "verticalOffset": 10,
        "radius": 15,
        "samples": 24,
        "color": shadowColor
    })

    // ==================== 字体系统 ====================

    readonly property string fontFamily: "Microsoft YaHei UI"
    readonly property string fontFamilyMono: "Consolas"

    readonly property int fontSize10: 10
    readonly property int fontSize11: 11
    readonly property int fontSize12: 12
    readonly property int fontSize13: 13
    readonly property int fontSize14: 14  // 基础
    readonly property int fontSize16: 16
    readonly property int fontSize18: 18
    readonly property int fontSize20: 20
    readonly property int fontSize24: 24
    readonly property int fontSize28: 28
    readonly property int fontSize32: 32

    readonly property int fontWeightNormal: Font.Normal
    readonly property int fontWeightMedium: Font.Medium
    readonly property int fontWeightBold: Font.Bold

    // ==================== 动画时长 ====================

    readonly property int durationInstant: 100
    readonly property int durationFast: 150
    readonly property int durationNormal: 200
    readonly property int durationSlow: 300
    readonly property int durationSlower: 500

    // ==================== Z-Index 层级 ====================

    readonly property int zIndexBase: 0
    readonly property int zIndexDropdown: 100
    readonly property int zIndexSticky: 200
    readonly property int zIndexFixed: 300
    readonly property int zIndexOverlay: 400
    readonly property int zIndexModal: 500
    readonly property int zIndexPopover: 600
    readonly property int zIndexTooltip: 700
    readonly property int zIndexToast: 800

    // ==================== 交互状态 ====================

    readonly property real opacityDisabled: 0.4
    readonly property real opacitySubtle: 0.6
    readonly property real opacityNormal: 1.0

    readonly property real scalePressed: 0.95
    readonly property real scaleHover: 1.02

    // ==================== 类型颜色映射 ====================

    readonly property var typeColors: ({
        "person": "#8b5cf6",      // 紫色
        "polity": "#f59e0b",      // 橙色
        "place": "#10b981",       // 绿色
        "organization": "#3b82f6", // 蓝色
        "branch": "#06b6d4",      // 青色
        "event": "#f43f5e",       // 粉红
        "item": "#eab308",        // 黄色
        "species": "#a855f7",     // 紫罗兰
        "concept": "#6366f1"      // 靛蓝
    })

    // ==================== 工具函数 ====================

    function getTypeColor(typeId) {
        return typeColors[typeId] || primary
    }

    function withOpacity(color, opacity) {
        return Qt.rgba(color.r, color.g, color.b, opacity)
    }

    // 根据背景色自动选择文字颜色
    function getContrastColor(backgroundColor) {
        var r = backgroundColor.r
        var g = backgroundColor.g
        var b = backgroundColor.b
        var luminance = 0.299 * r + 0.587 * g + 0.114 * b
        return luminance > 0.5 ? "#0f172a" : "#f1f5f9"
    }
}
