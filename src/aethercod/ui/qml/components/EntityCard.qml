// QML组件 - 实体卡片

import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15

Item {
    id: entityCard

    property string entityId: ""
    property string entityName: ""
    property string typeName: ""
    property string summary: ""
    property string color: "#7c3aed"
    property string tagsText: ""
    property string updatedAt: ""

    signal clicked()
    signal rightClicked()

    width: 260
    height: 180

    Rectangle {
        id: cardBackground
        anchors.fill: parent
        radius: 12
        color: themeColors.panel
        border.width: 1
        border.color: themeColors.border

        // 悬停效果
        Behavior on border.color {
            ColorAnimation { duration: 150 }
        }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 16
        spacing: 8

        // 顶部：类型和颜色指示器
        RowLayout {
            Layout.fillWidth: true
            spacing: 8

            Rectangle {
                width: 4
                height: 24
                radius: 2
                color: entityCard.color
            }

            Text {
                Layout.fillWidth: true
                text: entityCard.typeName
                font.pixelSize: 12
                font.weight: Font.Medium
                color: themeColors.muted
                elide: Text.ElideRight
            }
        }

        // 名称
        Text {
            Layout.fillWidth: true
            text: entityCard.entityName
            font.pixelSize: 16
            font.weight: Font.DemiBold
            color: themeColors.text
            elide: Text.ElideRight
            maximumLineCount: 2
            wrapMode: Text.Wrap
        }

        // 摘要
        Text {
            Layout.fillWidth: true
            Layout.fillHeight: true
            text: entityCard.summary || "无摘要"
            font.pixelSize: 13
            color: entityCard.summary ? themeColors.text : themeColors.faint
            elide: Text.ElideRight
            maximumLineCount: 3
            wrapMode: Text.WordWrap
        }

        // 底部：标签和更新时间
        RowLayout {
            Layout.fillWidth: true
            spacing: 8

            Text {
                Layout.fillWidth: true
                text: entityCard.tagsText || ""
                font.pixelSize: 11
                color: themeColors.faint
                elide: Text.ElideRight
                visible: entityCard.tagsText
            }

            Text {
                text: entityCard.updatedAt ? Qt.formatDateTime(new Date(entityCard.updatedAt), "MM-dd") : ""
                font.pixelSize: 11
                color: themeColors.faint
                visible: entityCard.updatedAt
            }
        }
    }

    // 悬停状态
    MouseArea {
        id: mouseArea
        anchors.fill: parent
        hoverEnabled: true
        acceptedButtons: Qt.LeftButton | Qt.RightButton

        onEntered: {
            cardBackground.border.color = themeColors.accent
            cardBackground.scale = 1.02
        }

        onExited: {
            cardBackground.border.color = themeColors.border
            cardBackground.scale = 1.0
        }

        onClicked: function(mouse) {
            if (mouse.button === Qt.RightButton) {
                entityCard.rightClicked()
            } else {
                entityCard.clicked()
            }
        }

        // 提示信息
        ToolTip.visible: hovered && entityCard.summary
        ToolTip.text: entityCard.summary
        ToolTip.delay: 500
    }

    // 动画效果
    Behavior on scale {
        NumberAnimation { duration: 150; easing.type: Easing.OutCubic }
    }
}
