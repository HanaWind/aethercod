// 增强的关系图组件 - 提升可读性和交互性

import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15

Item {
    id: graph

    property var nodes: []  // 节点数据
    property var edges: []  // 边数据
    property string layoutMode: "force"  // force, radial, hierarchical, circular
    property real zoomLevel: 1.0
    property bool showLabels: true
    property bool showMinimap: true
    property string centerNodeId: ""

    signal nodeClicked(string nodeId)
    signal nodeDoubleClicked(string nodeId)
    signal edgeClicked(string sourceId, string targetId)

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

            // 布局模式选择
            Row {
                spacing: ds.spacing2

                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: "布局："
                    font.family: ds.fontFamily
                    font.pixelSize: ds.fontSize13
                    color: ds.textSecondary
                }

                Repeater {
                    model: [
                        {text: "力导向", value: "force"},
                        {text: "放射状", value: "radial"},
                        {text: "层级", value: "hierarchical"},
                        {text: "环形", value: "circular"}
                    ]

                    ModernButton {
                        text: modelData.text
                        variant: graph.layoutMode === modelData.value ? "primary" : "ghost"
                        size: "small"
                        onClicked: graph.layoutMode = modelData.value
                    }
                }
            }

            Rectangle {
                width: 1
                height: 24
                color: ds.border
            }

            // 显示选项
            Row {
                spacing: ds.spacing2

                CheckBox {
                    id: labelsCheckbox
                    text: "显示标签"
                    checked: graph.showLabels
                    onCheckedChanged: graph.showLabels = checked
                }

                CheckBox {
                    text: "显示小地图"
                    checked: graph.showMinimap
                    onCheckedChanged: graph.showMinimap = checked
                }
            }

            Item { Layout.fillWidth: true }

            // 统计信息
            Rectangle {
                Layout.preferredWidth: 150
                Layout.preferredHeight: 32
                radius: ds.radiusMedium
                color: ds.surfaceAlt

                Text {
                    anchors.centerIn: parent
                    text: graph.nodes.length + " 节点 · " + graph.edges.length + " 连接"
                    font.family: ds.fontFamily
                    font.pixelSize: ds.fontSize13
                    color: ds.textSecondary
                }
            }

            // 缩放控制
            Row {
                spacing: ds.spacing2

                ModernButton {
                    text: "−"
                    variant: "ghost"
                    size: "small"
                    onClicked: graph.zoomLevel = Math.max(0.2, graph.zoomLevel - 0.2)
                }

                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: Math.round(graph.zoomLevel * 100) + "%"
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
                    onClicked: graph.zoomLevel = Math.min(3.0, graph.zoomLevel + 0.2)
                }
            }

            // 操作按钮
            ModernButton {
                text: "居中"
                variant: "outline"
                size: "small"
                onClicked: centerView()
            }

            ModernButton {
                text: "适配"
                variant: "outline"
                size: "small"
                onClicked: fitToContent()
            }
        }
    }

    // ==================== 图谱主体 ====================

    Rectangle {
        id: graphContainer
        anchors.top: toolbar.bottom
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        color: ds.background

        // 滚动和缩放容器
        Flickable {
            id: flickable
            anchors.fill: parent
            contentWidth: graphCanvas.width
            contentHeight: graphCanvas.height
            clip: true
            boundsBehavior: Flickable.StopAtBounds

            // 图谱画布
            Item {
                id: graphCanvas
                width: 2000 * graph.zoomLevel
                height: 2000 * graph.zoomLevel

                // 背景网格
                Canvas {
                    id: gridCanvas
                    anchors.fill: parent

                    onPaint: {
                        var ctx = getContext("2d")
                        ctx.clearRect(0, 0, width, height)

                        // 绘制网格
                        ctx.strokeStyle = ds.withOpacity(ds.border, 0.3)
                        ctx.lineWidth = 1

                        var gridSize = 50 * graph.zoomLevel
                        for (var x = 0; x < width; x += gridSize) {
                            ctx.beginPath()
                            ctx.moveTo(x, 0)
                            ctx.lineTo(x, height)
                            ctx.stroke()
                        }

                        for (var y = 0; y < height; y += gridSize) {
                            ctx.beginPath()
                            ctx.moveTo(0, y)
                            ctx.lineTo(width, y)
                            ctx.stroke()
                        }
                    }

                    Connections {
                        target: graph
                        function onZoomLevelChanged() { gridCanvas.requestPaint() }
                    }
                }

                // 连线层
                Canvas {
                    id: edgesCanvas
                    anchors.fill: parent
                    z: 1

                    onPaint: {
                        var ctx = getContext("2d")
                        ctx.clearRect(0, 0, width, height)

                        // 绘制所有边
                        graph.edges.forEach(function(edge) {
                            var sourceNode = findNode(edge.sourceId)
                            var targetNode = findNode(edge.targetId)

                            if (sourceNode && targetNode) {
                                drawEdge(ctx, sourceNode, targetNode, edge)
                            }
                        })
                    }

                    function drawEdge(ctx, source, target, edge) {
                        var x1 = source.x * graph.zoomLevel
                        var y1 = source.y * graph.zoomLevel
                        var x2 = target.x * graph.zoomLevel
                        var y2 = target.y * graph.zoomLevel

                        // 计算箭头
                        var angle = Math.atan2(y2 - y1, x2 - x1)
                        var nodeRadius = 40 * graph.zoomLevel

                        // 终点偏移到节点边缘
                        var endX = x2 - nodeRadius * Math.cos(angle)
                        var endY = y2 - nodeRadius * Math.sin(angle)

                        // 绘制线条
                        ctx.strokeStyle = ds.border
                        ctx.lineWidth = 2
                        ctx.beginPath()
                        ctx.moveTo(x1, y1)
                        ctx.lineTo(endX, endY)
                        ctx.stroke()

                        // 绘制箭头
                        var arrowSize = 10 * graph.zoomLevel
                        ctx.fillStyle = ds.border
                        ctx.beginPath()
                        ctx.moveTo(endX, endY)
                        ctx.lineTo(
                            endX - arrowSize * Math.cos(angle - Math.PI / 6),
                            endY - arrowSize * Math.sin(angle - Math.PI / 6)
                        )
                        ctx.lineTo(
                            endX - arrowSize * Math.cos(angle + Math.PI / 6),
                            endY - arrowSize * Math.sin(angle + Math.PI / 6)
                        )
                        ctx.closePath()
                        ctx.fill()

                        // 绘制标签
                        if (graph.showLabels && edge.label) {
                            var midX = (x1 + endX) / 2
                            var midY = (y1 + endY) / 2

                            ctx.fillStyle = ds.surface
                            ctx.fillRect(midX - 30, midY - 10, 60, 20)

                            ctx.fillStyle = ds.textSecondary
                            ctx.font = (12 * graph.zoomLevel) + "px " + ds.fontFamily
                            ctx.textAlign = "center"
                            ctx.textBaseline = "middle"
                            ctx.fillText(edge.label, midX, midY)
                        }
                    }

                    Connections {
                        target: graph
                        function onNodesChanged() { edgesCanvas.requestPaint() }
                        function onEdgesChanged() { edgesCanvas.requestPaint() }
                        function onZoomLevelChanged() { edgesCanvas.requestPaint() }
                        function onShowLabelsChanged() { edgesCanvas.requestPaint() }
                    }
                }

                // 节点层
                Repeater {
                    model: graph.nodes

                    GraphNode {
                        x: modelData.x * graph.zoomLevel - width / 2
                        y: modelData.y * graph.zoomLevel - height / 2
                        width: 80 * graph.zoomLevel
                        height: 80 * graph.zoomLevel

                        nodeData: modelData
                        isCenterNode: modelData.id === graph.centerNodeId
                        zoomLevel: graph.zoomLevel
                        showLabel: graph.showLabels

                        onClicked: graph.nodeClicked(nodeData.id)
                        onDoubleClicked: graph.nodeDoubleClicked(nodeData.id)

                        // 允许拖动
                        onPositionChanged: {
                            if (dragActive) {
                                updateNodePosition(nodeData.id, x, y)
                                edgesCanvas.requestPaint()
                            }
                        }

                        z: isCenterNode ? 100 : 10
                    }
                }
            }

            // 滚动条
            ScrollBar.horizontal: ScrollBar { policy: ScrollBar.AlwaysOn }
            ScrollBar.vertical: ScrollBar { policy: ScrollBar.AlwaysOn }
        }

        // 缩放手势
        PinchArea {
            anchors.fill: parent
            pinch.minimumScale: 0.2
            pinch.maximumScale: 3.0
            onPinchUpdated: {
                graph.zoomLevel = pinch.scale
            }
        }

        // 滚轮缩放
        MouseArea {
            anchors.fill: parent
            acceptedButtons: Qt.NoButton
            onWheel: {
                if (wheel.modifiers & Qt.ControlModifier) {
                    var delta = wheel.angleDelta.y / 120
                    graph.zoomLevel = Math.max(0.2, Math.min(3.0, graph.zoomLevel + delta * 0.1))
                    wheel.accepted = true
                }
            }
        }
    }

    // ==================== 迷你地图 ====================

    Rectangle {
        visible: graph.showMinimap
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.margins: ds.spacing4
        width: 200
        height: 150
        radius: ds.radiusMedium
        color: ds.surface
        border.width: 1
        border.color: ds.border
        z: 20

        // 迷你图内容
        Item {
            anchors.fill: parent
            anchors.margins: ds.spacing2

            // 节点
            Repeater {
                model: graph.nodes
                Rectangle {
                    x: modelData.x / 10
                    y: modelData.y / 10
                    width: 6
                    height: 6
                    radius: 3
                    color: ds.getTypeColor(modelData.typeId)
                }
            }

            // 可视区域指示
            Rectangle {
                width: parent.width / 2
                height: parent.height / 2
                color: "transparent"
                border.width: 2
                border.color: ds.primary
            }
        }
    }

    // ==================== 辅助函数 ====================

    function findNode(nodeId) {
        for (var i = 0; i < graph.nodes.length; i++) {
            if (graph.nodes[i].id === nodeId) {
                return graph.nodes[i]
            }
        }
        return null
    }

    function updateNodePosition(nodeId, x, y) {
        // 更新节点位置
        for (var i = 0; i < graph.nodes.length; i++) {
            if (graph.nodes[i].id === nodeId) {
                graph.nodes[i].x = x / graph.zoomLevel
                graph.nodes[i].y = y / graph.zoomLevel
                break
            }
        }
    }

    function centerView() {
        if (graph.centerNodeId) {
            var node = findNode(graph.centerNodeId)
            if (node) {
                flickable.contentX = node.x * graph.zoomLevel - flickable.width / 2
                flickable.contentY = node.y * graph.zoomLevel - flickable.height / 2
            }
        } else {
            flickable.contentX = (flickable.contentWidth - flickable.width) / 2
            flickable.contentY = (flickable.contentHeight - flickable.height) / 2
        }
    }

    function fitToContent() {
        // 计算所有节点的边界
        if (graph.nodes.length === 0) return

        var minX = Infinity, maxX = -Infinity
        var minY = Infinity, maxY = -Infinity

        graph.nodes.forEach(function(node) {
            minX = Math.min(minX, node.x)
            maxX = Math.max(maxX, node.x)
            minY = Math.min(minY, node.y)
            maxY = Math.max(maxY, node.y)
        })

        var rangeX = maxX - minX
        var rangeY = maxY - minY

        // 计算合适的缩放级别
        var zoomX = flickable.width / (rangeX + 200)
        var zoomY = flickable.height / (rangeY + 200)
        graph.zoomLevel = Math.min(zoomX, zoomY, 2.0)

        // 居中
        centerView()
    }
}

// ==================== 图节点组件 ====================

Rectangle {
    id: nodeItem

    property var nodeData: null
    property bool isCenterNode: false
    property real zoomLevel: 1.0
    property bool showLabel: true
    property bool dragActive: false

    signal clicked()
    signal doubleClicked()
    signal positionChanged()

    DesignSystem { id: ds }

    radius: width / 2
    color: nodeData ? ds.getTypeColor(nodeData.typeId) : ds.primary
    border.width: isCenterNode ? 4 : 2
    border.color: isCenterNode ? ds.secondary : ds.surface

    // 悬停和选中效果
    scale: nodeMouseArea.containsMouse || isCenterNode ? 1.1 : 1.0
    Behavior on scale {
        NumberAnimation { duration: ds.durationFast; easing.type: Easing.OutCubic }
    }

    // 阴影
    layer.enabled: true
    layer.effect: DropShadow {
        horizontalOffset: 0
        verticalOffset: isCenterNode ? 4 : 2
        radius: isCenterNode ? 12 : 6
        samples: isCenterNode ? 24 : 12
        color: ds.shadowColor
    }

    // 节点内容
    ColumnLayout {
        anchors.centerIn: parent
        width: parent.width * 0.8
        spacing: 2

        // 图标或首字母
        Text {
            Layout.alignment: Qt.AlignHCenter
            text: nodeData ? nodeData.name.substring(0, 1) : ""
            font.family: ds.fontFamily
            font.pixelSize: 24 * zoomLevel
            font.weight: ds.fontWeightBold
            color: "#ffffff"
        }
    }

    // 标签
    Rectangle {
        visible: showLabel
        anchors.top: parent.bottom
        anchors.topMargin: 4 * zoomLevel
        anchors.horizontalCenter: parent.horizontalCenter
        width: labelText.implicitWidth + 12 * zoomLevel
        height: 24 * zoomLevel
        radius: ds.radiusMedium
        color: ds.surface
        border.width: 1
        border.color: ds.border

        Text {
            id: labelText
            anchors.centerIn: parent
            text: nodeData ? nodeData.name : ""
            font.family: ds.fontFamily
            font.pixelSize: 12 * zoomLevel
            font.weight: ds.fontWeightMedium
            color: ds.textPrimary
            elide: Text.ElideRight
            maximumLineCount: 1
        }
    }

    // 鼠标交互
    MouseArea {
        id: nodeMouseArea
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        drag.target: parent
        drag.axis: Drag.XAndYAxis

        onClicked: nodeItem.clicked()
        onDoubleClicked: nodeItem.doubleClicked()
        onPressed: nodeItem.dragActive = true
        onReleased: nodeItem.dragActive = false
        onPositionChanged: {
            if (drag.active) {
                nodeItem.positionChanged()
            }
        }
    }

    // 提示信息
    ToolTip {
        visible: nodeMouseArea.containsMouse
        text: nodeData ? (nodeData.name + "\n" + nodeData.typeName +
              (nodeData.summary ? "\n" + nodeData.summary : "")) : ""
        delay: 500
    }
}
