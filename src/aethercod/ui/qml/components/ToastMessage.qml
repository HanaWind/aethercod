// QML组件 - Toast消息

import QtQuick 2.15
import QtQuick.Controls 2.15

Rectangle {
    id: toast
    property string message: ""
    property string toastType: "info"  // success, error, warning, info
    property int duration: 3000

    width: Math.min(messageText.implicitWidth + 48, parent.width * 0.8)
    height: 48
    radius: 8

    x: (parent.width - width) / 2
    y: parent.height - height - 80

    opacity: 0
    visible: opacity > 0

    color: {
        switch(toastType) {
            case "success": return root.darkMode ? "#10b981" : "#059669"
            case "error": return root.darkMode ? "#ef4444" : "#dc2626"
            case "warning": return root.darkMode ? "#f59e0b" : "#d97706"
            default: return root.darkMode ? "#3b82f6" : "#2563eb"
        }
    }

    // 阴影效果
    layer.enabled: true
    layer.effect: DropShadow {
        horizontalOffset: 0
        verticalOffset: 4
        radius: 12
        samples: 16
        color: "#40000000"
    }

    Row {
        anchors.centerIn: parent
        spacing: 12

        // 图标
        Text {
            anchors.verticalCenter: parent.verticalCenter
            text: {
                switch(toastType) {
                    case "success": return "✓"
                    case "error": return "✕"
                    case "warning": return "⚠"
                    default: return "ℹ"
                }
            }
            font.pixelSize: 18
            font.bold: true
            color: "white"
        }

        Text {
            id: messageText
            anchors.verticalCenter: parent.verticalCenter
            text: toast.message
            font.pixelSize: 14
            color: "white"
            maximumLineCount: 2
            elide: Text.ElideRight
        }
    }

    // 显示动画
    PropertyAnimation {
        id: showAnimation
        target: toast
        property: "opacity"
        from: 0
        to: 1
        duration: 200
        easing.type: Easing.OutCubic
    }

    // 隐藏动画
    PropertyAnimation {
        id: hideAnimation
        target: toast
        property: "opacity"
        from: 1
        to: 0
        duration: 200
        easing.type: Easing.InCubic
        onStopped: toast.destroy()
    }

    Timer {
        id: hideTimer
        interval: toast.duration
        onTriggered: hideAnimation.start()
    }

    function show() {
        showAnimation.start()
        hideTimer.start()
    }

    // 点击关闭
    MouseArea {
        anchors.fill: parent
        onClicked: {
            hideTimer.stop()
            hideAnimation.start()
        }
    }
}
