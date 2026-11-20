// 统一的按钮组件 - 现代扁平风格

import QtQuick 2.15
import QtQuick.Controls 2.15

Button {
    id: control

    // 变体类型
    property string variant: "primary"  // primary, secondary, outline, ghost, danger
    property string size: "medium"      // small, medium, large
    property bool isLoading: false
    property string iconSource: ""
    property int iconSize: 16

    DesignSystem { id: ds }

    // 尺寸配置
    readonly property var sizeConfig: ({
        "small": {"height": 32, "padding": ds.spacing3, "fontSize": ds.fontSize12},
        "medium": {"height": 40, "padding": ds.spacing4, "fontSize": ds.fontSize14},
        "large": {"height": 48, "padding": ds.spacing5, "fontSize": ds.fontSize16}
    })

    implicitWidth: Math.max(100, contentItem.implicitWidth + leftPadding + rightPadding)
    implicitHeight: sizeConfig[size].height
    leftPadding: sizeConfig[size].padding
    rightPadding: sizeConfig[size].padding
    spacing: ds.spacing2

    // 变体样式配置
    readonly property var variantStyles: ({
        "primary": {
            "bg": ds.primary,
            "bgHover": ds.primaryHover,
            "bgPressed": ds.primaryDark,
            "text": "#ffffff",
            "border": "transparent"
        },
        "secondary": {
            "bg": ds.secondary,
            "bgHover": ds.secondaryHover,
            "bgPressed": Qt.darker(ds.secondary, 1.2),
            "text": "#ffffff",
            "border": "transparent"
        },
        "outline": {
            "bg": "transparent",
            "bgHover": ds.withOpacity(ds.primary, 0.1),
            "bgPressed": ds.withOpacity(ds.primary, 0.2),
            "text": ds.primary,
            "border": ds.primary
        },
        "ghost": {
            "bg": "transparent",
            "bgHover": ds.surfaceAlt,
            "bgPressed": ds.border,
            "text": ds.textPrimary,
            "border": "transparent"
        },
        "danger": {
            "bg": ds.danger,
            "bgHover": Qt.lighter(ds.danger, 1.1),
            "bgPressed": Qt.darker(ds.danger, 1.1),
            "text": "#ffffff",
            "border": "transparent"
        }
    })

    contentItem: Row {
        spacing: control.spacing

        // 加载指示器
        BusyIndicator {
            anchors.verticalCenter: parent.verticalCenter
            visible: control.isLoading
            running: control.isLoading
            width: control.iconSize
            height: control.iconSize
        }

        // 图标
        Image {
            anchors.verticalCenter: parent.verticalCenter
            visible: !control.isLoading && control.iconSource !== ""
            source: control.iconSource
            width: control.iconSize
            height: control.iconSize
            sourceSize: Qt.size(control.iconSize, control.iconSize)
        }

        // 文字
        Text {
            anchors.verticalCenter: parent.verticalCenter
            text: control.text
            font.family: ds.fontFamily
            font.pixelSize: sizeConfig[control.size].fontSize
            font.weight: ds.fontWeightMedium
            color: control.enabled ? variantStyles[control.variant].text : ds.textDisabled
            opacity: control.enabled ? 1.0 : ds.opacityDisabled
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
        }
    }

    background: Rectangle {
        radius: ds.radiusMedium
        color: {
            if (!control.enabled) return ds.surfaceAlt
            if (control.pressed) return variantStyles[control.variant].bgPressed
            if (control.hovered) return variantStyles[control.variant].bgHover
            return variantStyles[control.variant].bg
        }
        border.width: variantStyles[control.variant].border !== "transparent" ? 1 : 0
        border.color: variantStyles[control.variant].border

        Behavior on color {
            ColorAnimation { duration: ds.durationFast }
        }

        Behavior on border.color {
            ColorAnimation { duration: ds.durationFast }
        }
    }

    // 按下动画
    scale: control.pressed ? ds.scalePressed : 1.0
    Behavior on scale {
        NumberAnimation { duration: ds.durationFast; easing.type: Easing.OutCubic }
    }

    // 禁用时的光标
    MouseArea {
        anchors.fill: parent
        enabled: !control.enabled
        cursorShape: Qt.ForbiddenCursor
        onPressed: mouse.accepted = false
    }
}
