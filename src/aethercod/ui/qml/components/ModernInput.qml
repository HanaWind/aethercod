// 统一的输入框组件 - 现代扁平风格

import QtQuick 2.15
import QtQuick.Controls 2.15

TextField {
    id: control

    property string label: ""
    property string helperText: ""
    property string errorText: ""
    property bool hasError: false
    property string leftIcon: ""
    property string rightIcon: ""
    property bool showClearButton: false

    signal rightIconClicked()

    DesignSystem { id: ds }

    implicitHeight: 40
    leftPadding: leftIcon ? 40 : ds.spacing4
    rightPadding: (showClearButton || rightIcon) ? 40 : ds.spacing4

    font.family: ds.fontFamily
    font.pixelSize: ds.fontSize14
    color: ds.textPrimary
    placeholderTextColor: ds.textTertiary
    selectionColor: ds.primary
    selectedTextColor: "#ffffff"

    background: Rectangle {
        radius: ds.radiusMedium
        color: control.enabled ? ds.surface : ds.surfaceAlt
        border.width: 1
        border.color: {
            if (control.hasError) return ds.danger
            if (control.activeFocus) return ds.primary
            if (control.hovered) return ds.borderHover
            return ds.border
        }

        Behavior on border.color {
            ColorAnimation { duration: ds.durationFast }
        }

        // 聚焦时的外发光
        Rectangle {
            anchors.fill: parent
            anchors.margins: -2
            radius: parent.radius + 2
            color: "transparent"
            border.width: 2
            border.color: ds.withOpacity(control.hasError ? ds.danger : ds.primary, 0.3)
            opacity: control.activeFocus ? 1 : 0
            Behavior on opacity {
                NumberAnimation { duration: ds.durationFast }
            }
        }
    }

    // 左侧图标
    Item {
        anchors.left: parent.left
        anchors.leftMargin: ds.spacing3
        anchors.verticalCenter: parent.verticalCenter
        width: 20
        height: 20
        visible: control.leftIcon

        Image {
            anchors.centerIn: parent
            source: control.leftIcon
            width: 16
            height: 16
            sourceSize: Qt.size(16, 16)
        }
    }

    // 右侧图标或清除按钮
    Item {
        anchors.right: parent.right
        anchors.rightMargin: ds.spacing2
        anchors.verticalCenter: parent.verticalCenter
        width: 24
        height: 24
        visible: control.showClearButton || control.rightIcon

        // 清除按钮
        Rectangle {
            visible: control.showClearButton && control.text.length > 0
            anchors.centerIn: parent
            width: 20
            height: 20
            radius: ds.radiusFull
            color: clearMouseArea.containsMouse ? ds.surfaceAlt : "transparent"

            Text {
                anchors.centerIn: parent
                text: "×"
                font.pixelSize: ds.fontSize16
                font.weight: ds.fontWeightBold
                color: ds.textSecondary
            }

            MouseArea {
                id: clearMouseArea
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: control.text = ""
            }
        }

        // 自定义右侧图标
        Rectangle {
            visible: control.rightIcon && !control.showClearButton
            anchors.centerIn: parent
            width: 20
            height: 20
            radius: ds.radiusFull
            color: iconMouseArea.containsMouse ? ds.surfaceAlt : "transparent"

            Image {
                anchors.centerIn: parent
                source: control.rightIcon
                width: 16
                height: 16
                sourceSize: Qt.size(16, 16)
            }

            MouseArea {
                id: iconMouseArea
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: control.rightIconClicked()
            }
        }
    }
}

// 完整的带标签的输入框包装
Item {
    id: wrapper

    property alias textField: inputField
    property alias text: inputField.text
    property alias placeholderText: inputField.placeholderText
    property string label: ""
    property string helperText: ""
    property string errorText: ""
    property bool hasError: false
    property bool required: false

    implicitHeight: labelText.height + inputField.height + helperTextItem.height + ds.spacing2 * 2
    implicitWidth: 300

    DesignSystem { id: ds }

    Column {
        anchors.fill: parent
        spacing: ds.spacing2

        // 标签
        Row {
            width: parent.width
            spacing: ds.spacing1
            visible: wrapper.label

            Text {
                id: labelText
                text: wrapper.label
                font.family: ds.fontFamily
                font.pixelSize: ds.fontSize13
                font.weight: ds.fontWeightMedium
                color: ds.textSecondary
            }

            Text {
                visible: wrapper.required
                text: "*"
                font.family: ds.fontFamily
                font.pixelSize: ds.fontSize13
                color: ds.danger
            }
        }

        // 输入框
        TextField {
            id: inputField
            width: parent.width
            hasError: wrapper.hasError
        }

        // 辅助文本或错误文本
        Text {
            id: helperTextItem
            width: parent.width
            text: wrapper.hasError ? wrapper.errorText : wrapper.helperText
            font.family: ds.fontFamily
            font.pixelSize: ds.fontSize12
            color: wrapper.hasError ? ds.danger : ds.textTertiary
            wrapMode: Text.WordWrap
            visible: text.length > 0
        }
    }
}
