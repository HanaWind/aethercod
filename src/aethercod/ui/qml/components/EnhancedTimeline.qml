// 增强的时间线组件 - 提升可读性和交互性

import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15

Item {
    id: timeline

    property var events: []  // 事件数据
    property int minYear: -1000
    property int maxYear: 2000
    property real zoomLevel: 1.0
    property int centerYear: 0
    property string eraName: "泰拉纪元"

    signal eventClicked(string eventId)
    signal eventDoubleClicked(string eventId)
    signal yearClicked(int year)

    DesignSystem { id: ds }

    // ==================== 顶部工具栏 ====================

    Rectangle {
        id: toolbar
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.right: parent.right
        height: 56
        color: ds.surface
        border.width: 1
        border.color: ds.border
        z: 10

        RowLayout {
            anchors.fill: parent
            anchors.margins: ds.spacing4
            spacing: ds.spacing3

            // 时间范围显示
            Rectangle {
                Layout.preferredWidth: 200
                Layout.preferredHeight: 32
                radius: ds.radiusMedium
                color: ds.surfaceAlt
                border.width: 1
                border.color: ds.border

                Text {
                    anchors.centerIn: parent
                    text: formatYearRange(timeline.minYear, timeline.maxYear)
                    font.family: ds.fontFamily
                    font.pixelSize: ds.fontSize13
                    font.weight: ds.fontWeightMedium
                    color: ds.textSecondary
                }
            }

            Item { Layout.fillWidth: true }

            // 缩放控制
            Row {
                spacing: ds.spacing2

                ModernButton {
                    text: "−"
                    variant: "ghost"
                    size: "small"
                    onClicked: timeline.zoomLevel = Math.max(0.1, timeline.zoomLevel - 0.2)
                }

                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: Math.round(timeline.zoomLevel * 100) + "%"
                    font.family: ds.fontFamily
                    font.pixelSize: ds.fontSize13
                    color: ds.textSecondary
                    width: 50
                    horizontalAlignment: Text.AlignHCenter
                }

                ModernButton {
                    text: "+"
                    variant: "ghost"
                    size: "small"
                    onClicked: timeline.zoomLevel = Math.min(5.0, timeline.zoomLevel + 0.2)
                }
            }

            // 适配按钮
            ModernButton {
                text: "适配全部"
                variant: "outline"
                size: "small"
                onClicked: fitToContent()
            }

            // 今天按钮
            ModernButton {
                text: "回到中心"
                variant: "ghost"
                size: "small"
                onClicked: scrollToYear(Math.floor((timeline.minYear + timeline.maxYear) / 2))
            }
        }
    }

    // ==================== 时间轴主体 ====================

    Rectangle {
        id: timelineContainer
        anchors.top: toolbar.bottom
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: minimap.top
        color: ds.background

        // 滚动视图
        Flickable {
            id: flickable
            anchors.fill: parent
            contentWidth: timelineCanvas.width
            contentHeight: timelineCanvas.height
            clip: true
            boundsBehavior: Flickable.StopAtBounds

            // 时间轴画布
            Item {
                id: timelineCanvas
                width: Math.max(flickable.width, (timeline.maxYear - timeline.minYear) * yearWidth * timeline.zoomLevel)
                height: flickable.height

                property real yearWidth: 80  // 每年的像素宽度

                // 背景网格
                Canvas {
                    id: gridCanvas
                    anchors.fill: parent

                    onPaint: {
                        var ctx = getContext("2d")
                        ctx.clearRect(0, 0, width, height)

                        var yearWidth = timelineCanvas.yearWidth * timeline.zoomLevel
                        var startYear = timeline.minYear
                        var endYear = timeline.maxYear
                        var totalYears = endYear - startYear

                        // 绘制年份刻度
                        ctx.strokeStyle = ds.border
                        ctx.lineWidth = 1

                        for (var year = startYear; year <= endYear; year += 10) {
                            var x = (year - startYear) * yearWidth

                            // 主刻度线
                            ctx.beginPath()
                            ctx.moveTo(x, 0)
                            ctx.lineTo(x, height)
                            ctx.stroke()

                            // 年份标签
                            ctx.fillStyle = ds.textTertiary
                            ctx.font = ds.fontSize12 + "px " + ds.fontFamily
                            ctx.fillText(formatYear(year), x + 4, 20)
                        }

                        // 中心线（年份0）
                        if (startYear <= 0 && endYear >= 0) {
                            var zeroX = (0 - startYear) * yearWidth
                            ctx.strokeStyle = ds.primary
                            ctx.lineWidth = 2
                            ctx.beginPath()
                            ctx.moveTo(zeroX, 0)
                            ctx.lineTo(zeroX, height)
                            ctx.stroke()
                        }
                    }

                    Connections {
                        target: timeline
                        function onZoomLevelChanged() { gridCanvas.requestPaint() }
                    }
                }

                // 事件展示
                Repeater {
                    model: timeline.events

                    delegate: TimelineEvent {
                        x: calculateEventX(modelData.year)
                        y: calculateEventY(index)
                        width: calculateEventWidth(modelData.year, modelData.endYear)
                        height: 60

                        eventData: modelData
                        zoomLevel: timeline.zoomLevel

                        onClicked: timeline.eventClicked(eventData.id)
                        onDoubleClicked: timeline.eventDoubleClicked(eventData.id)
                    }
                }
            }

            // 滚动条
            ScrollBar.horizontal: ScrollBar {
                policy: ScrollBar.AlwaysOn
                minimumSize: 0.1
            }
        }

        // 缩放手势
        PinchArea {
            anchors.fill: parent
            pinch.minimumScale: 0.1
            pinch.maximumScale: 5.0
            onPinchUpdated: {
                timeline.zoomLevel = pinch.scale
            }
        }

        // 滚轮缩放
        MouseArea {
            anchors.fill: parent
            acceptedButtons: Qt.NoButton
            onWheel: {
                if (wheel.modifiers & Qt.ControlModifier) {
                    var delta = wheel.angleDelta.y / 120
                    timeline.zoomLevel = Math.max(0.1, Math.min(5.0, timeline.zoomLevel + delta * 0.1))
                    wheel.accepted = true
                }
            }
        }
    }

    // ==================== 迷你地图 ====================

    Rectangle {
        id: minimap
        anchors.bottom: parent.bottom
        anchors.left: parent.left
        anchors.right: parent.right
        height: 60
        color: ds.surface
        border.width: 1
        border.color: ds.border

        // 迷你时间轴
        Rectangle {
            anchors.fill: parent
            anchors.margins: ds.spacing3
            color: ds.surfaceAlt
            radius: ds.radiusSmall

            // 可视区域指示器
            Rectangle {
                x: calculateMinimapX()
                y: 0
                width: calculateMinimapWidth()
                height: parent.height
                color: ds.withOpacity(ds.primary, 0.3)
                border.width: 2
                border.color: ds.primary
                radius: ds.radiusSmall

                MouseArea {
                    anchors.fill: parent
                    drag.target: parent
                    drag.axis: Drag.XAxis
                    drag.minimumX: 0
                    drag.maximumX: minimap.width - parent.width - ds.spacing3 * 2
                    cursorShape: Qt.SizeHorCursor

                    onPositionChanged: {
                        if (drag.active) {
                            updateScrollFromMinimap()
                        }
                    }
                }
            }

            // 事件点
            Repeater {
                model: timeline.events
                delegate: Rectangle {
                    x: (modelData.year - timeline.minYear) / (timeline.maxYear - timeline.minYear) * (parent.width - 4) + 2
                    y: parent.height / 2 - 2
                    width: 4
                    height: 4
                    radius: 2
                    color: ds.getTypeColor(modelData.typeId)
                }
            }
        }
    }

    // ==================== 辅助函数 ====================

    function formatYear(year) {
        if (year < 0) {
            return timeline.eraName + "前 " + Math.abs(year) + " 年"
        } else if (year === 0) {
            return timeline.eraName + " 元年"
        } else {
            return timeline.eraName + " " + year + " 年"
        }
    }

    function formatYearRange(start, end) {
        return formatYear(start) + " 至 " + formatYear(end)
    }

    function calculateEventX(year) {
        var yearWidth = timelineCanvas.yearWidth * timeline.zoomLevel
        return (year - timeline.minYear) * yearWidth
    }

    function calculateEventY(index) {
        // 错层显示，避免重叠
        var baseY = 40
        var layer = index % 4
        return baseY + layer * 70
    }

    function calculateEventWidth(startYear, endYear) {
        if (!endYear || endYear === startYear) {
            return 120 * timeline.zoomLevel
        }
        var yearWidth = timelineCanvas.yearWidth * timeline.zoomLevel
        return Math.max(120, (endYear - startYear) * yearWidth)
    }

    function calculateMinimapX() {
        return (flickable.contentX / flickable.contentWidth) * (minimap.width - ds.spacing3 * 2)
    }

    function calculateMinimapWidth() {
        return (flickable.width / flickable.contentWidth) * (minimap.width - ds.spacing3 * 2)
    }

    function updateScrollFromMinimap() {
        // 从迷你地图更新主视图滚动位置
        var minimapContent = minimap.width - ds.spacing3 * 2
        var ratio = flickable.contentWidth / minimapContent
        // 实现具体逻辑
    }

    function scrollToYear(year) {
        var yearWidth = timelineCanvas.yearWidth * timeline.zoomLevel
        var x = (year - timeline.minYear) * yearWidth - flickable.width / 2
        flickable.contentX = Math.max(0, Math.min(x, flickable.contentWidth - flickable.width))
    }

    function fitToContent() {
        if (timeline.events.length === 0) return

        var totalRange = timeline.maxYear - timeline.minYear
        var targetZoom = flickable.width / (totalRange * timelineCanvas.yearWidth)
        timeline.zoomLevel = Math.max(0.1, Math.min(2.0, targetZoom))
        flickable.contentX = 0
    }
}

// ==================== 时间线事件组件 ====================

Rectangle {
    id: eventItem

    property var eventData: null
    property real zoomLevel: 1.0

    signal clicked()
    signal doubleClicked()

    DesignSystem { id: ds }

    radius: ds.radiusMedium
    color: ds.surface
    border.width: 2
    border.color: eventData ? ds.getTypeColor(eventData.typeId) : ds.border

    // 悬停效果
    scale: eventMouseArea.containsMouse ? 1.05 : 1.0
    Behavior on scale {
        NumberAnimation { duration: ds.durationFast; easing.type: Easing.OutCubic }
    }

    // 阴影
    layer.enabled: true
    layer.effect: DropShadow {
        horizontalOffset: ds.shadowSmall.horizontalOffset
        verticalOffset: ds.shadowSmall.verticalOffset
        radius: ds.shadowSmall.radius
        samples: ds.shadowSmall.samples
        color: ds.shadowSmall.color
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: ds.spacing3
        spacing: ds.spacing1

        // 类型标签
        Rectangle {
            Layout.preferredHeight: 20
            Layout.preferredWidth: typeLabel.implicitWidth + ds.spacing3 * 2
            radius: ds.radiusFull
            color: ds.withOpacity(ds.getTypeColor(eventData ? eventData.typeId : ""), 0.2)

            Text {
                id: typeLabel
                anchors.centerIn: parent
                text: eventData ? eventData.typeName : ""
                font.family: ds.fontFamily
                font.pixelSize: ds.fontSize11
                font.weight: ds.fontWeightMedium
                color: ds.getTypeColor(eventData ? eventData.typeId : "")
            }
        }

        // 事件名称
        Text {
            Layout.fillWidth: true
            text: eventData ? eventData.name : ""
            font.family: ds.fontFamily
            font.pixelSize: ds.fontSize14
            font.weight: ds.fontWeightBold
            color: ds.textPrimary
            elide: Text.ElideRight
            maximumLineCount: 1
        }

        // 日期
        Text {
            Layout.fillWidth: true
            text: eventData ? eventData.dateText : ""
            font.family: ds.fontFamily
            font.pixelSize: ds.fontSize12
            color: ds.textSecondary
            elide: Text.ElideRight
        }
    }

    // 范围事件的视觉指示
    Rectangle {
        visible: eventData && eventData.endYear && eventData.endYear !== eventData.year
        anchors.top: parent.top
        anchors.bottom: parent.bottom
        anchors.left: parent.left
        width: 4
        color: ds.getTypeColor(eventData ? eventData.typeId : "")
        radius: 2
    }

    MouseArea {
        id: eventMouseArea
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: eventItem.clicked()
        onDoubleClicked: eventItem.doubleClicked()
    }

    // 提示信息
    ToolTip {
        visible: eventMouseArea.containsMouse
        text: eventData ? (eventData.name + "\n" + eventData.summary) : ""
        delay: 500
    }
}
