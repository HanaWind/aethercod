// 简化版演示 - 不依赖GraphicalEffects

import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import "components"

ApplicationWindow {
    id: demoWindow
    visible: true
    width: 1200
    height: 800
    title: "Aethercod UI/UX 改进演示"

    // 引入设计系统
    DesignSystem {
        id: ds
        isDark: darkModeSwitch.checked
    }

    // 渐变背景
    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0.0; color: ds.isDark ? "#0f172a" : "#f8fafc" }
            GradientStop { position: 0.5; color: ds.isDark ? "#1e293b" : "#f1f5f9" }
            GradientStop { position: 1.0; color: ds.isDark ? "#0f172a" : "#f8fafc" }
        }
    }

    // Toast容器
    ToastContainer {
        id: toast
        anchors.fill: parent
    }

    // 主内容
    ScrollView {
        anchors.fill: parent
        clip: true

        ColumnLayout {
            width: demoWindow.width - 100
            anchors.horizontalCenter: parent.horizontalCenter
            spacing: ds.spacing6

            // 顶部标题栏
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 80
                Layout.topMargin: ds.spacing6
                color: ds.surface
                radius: ds.radiusLarge
                border.width: 1
                border.color: ds.border

                RowLayout {
                    anchors.fill: parent
                    anchors.margins: ds.spacing5
                    spacing: ds.spacing4

                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: ds.spacing1

                        Text {
                            text: "Aethercod UI/UX 改进演示"
                            font.family: ds.fontFamily
                            font.pixelSize: ds.fontSize24
                            font.weight: ds.fontWeightBold
                            color: ds.textPrimary
                        }

                        Text {
                            text: "统一设计系统 · 现代扁平风格 · 增强交互体验"
                            font.family: ds.fontFamily
                            font.pixelSize: ds.fontSize13
                            color: ds.textSecondary
                        }
                    }

                    Switch {
                        id: darkModeSwitch
                        text: "暗色模式"
                        checked: false
                    }
                }
            }

            // 第一部分：按钮组件
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: buttonSection.implicitHeight + ds.spacing6 * 2
                color: ds.surface
                radius: ds.radiusLarge
                border.width: 1
                border.color: ds.border

                ColumnLayout {
                    id: buttonSection
                    anchors.fill: parent
                    anchors.margins: ds.spacing6
                    spacing: ds.spacing4

                    Text {
                        text: "1. 统一的按钮组件"
                        font.family: ds.fontFamily
                        font.pixelSize: ds.fontSize18
                        font.weight: ds.fontWeightBold
                        color: ds.textPrimary
                    }

                    Text {
                        text: "5种变体 × 3种尺寸，支持图标和加载状态"
                        font.family: ds.fontFamily
                        font.pixelSize: ds.fontSize13
                        color: ds.textSecondary
                    }

                    // 不同变体
                    Flow {
                        Layout.fillWidth: true
                        spacing: ds.spacing3

                        ModernButton {
                            text: "Primary"
                            variant: "primary"
                            onClicked: toast.success("Primary按钮被点击")
                        }

                        ModernButton {
                            text: "Secondary"
                            variant: "secondary"
                            onClicked: toast.info("Secondary按钮被点击")
                        }

                        ModernButton {
                            text: "Outline"
                            variant: "outline"
                            onClicked: toast.info("Outline按钮被点击")
                        }

                        ModernButton {
                            text: "Ghost"
                            variant: "ghost"
                            onClicked: toast.info("Ghost按钮被点击")
                        }

                        ModernButton {
                            text: "Danger"
                            variant: "danger"
                            onClicked: toast.warning("Danger按钮被点击")
                        }
                    }

                    // 不同尺寸
                    Flow {
                        Layout.fillWidth: true
                        spacing: ds.spacing3

                        ModernButton {
                            text: "Small"
                            variant: "primary"
                            size: "small"
                        }

                        ModernButton {
                            text: "Medium"
                            variant: "primary"
                            size: "medium"
                        }

                        ModernButton {
                            text: "Large"
                            variant: "primary"
                            size: "large"
                        }
                    }

                    // 特殊状态
                    Flow {
                        Layout.fillWidth: true
                        spacing: ds.spacing3

                        ModernButton {
                            text: "禁用状态"
                            variant: "primary"
                            enabled: false
                        }

                        ModernButton {
                            text: "加载中..."
                            variant: "primary"
                            isLoading: true
                        }
                    }
                }
            }

            // 第二部分：实体卡片
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: cardSection.implicitHeight + ds.spacing6 * 2
                color: ds.surface
                radius: ds.radiusLarge
                border.width: 1
                border.color: ds.border

                ColumnLayout {
                    id: cardSection
                    anchors.fill: parent
                    anchors.margins: ds.spacing6
                    spacing: ds.spacing4

                    Text {
                        text: "2. 实体卡片展示"
                        font.family: ds.fontFamily
                        font.pixelSize: ds.fontSize18
                        font.weight: ds.fontWeightBold
                        color: ds.textPrimary
                    }

                    Text {
                        text: "卡片式布局，颜色编码，悬停效果"
                        font.family: ds.fontFamily
                        font.pixelSize: ds.fontSize13
                        color: ds.textSecondary
                    }

                    Flow {
                        Layout.fillWidth: true
                        spacing: ds.spacing4

                        EntityCard {
                            entityName: "主角"
                            typeName: "人物"
                            summary: "故事的主人公，勇敢而善良"
                            color: ds.getTypeColor("person")
                            tagsText: "主角 · 英雄"
                            onClicked: toast.info("点击了：主角")
                        }

                        EntityCard {
                            entityName: "王国首都"
                            typeName: "地点"
                            summary: "繁荣的都市，文化中心"
                            color: ds.getTypeColor("place")
                            tagsText: "城市 · 重要"
                            onClicked: toast.info("点击了：王国首都")
                        }

                        EntityCard {
                            entityName: "建国大典"
                            typeName: "事件"
                            summary: "王国建立的标志性时刻"
                            color: ds.getTypeColor("event")
                            tagsText: "历史 · 重要"
                            onClicked: toast.info("点击了：建国大典")
                        }

                        EntityCard {
                            entityName: "圣剑"
                            typeName: "物品"
                            summary: "传说中的神器"
                            color: ds.getTypeColor("item")
                            tagsText: "神器 · 武器"
                            onClicked: toast.info("点击了：圣剑")
                        }
                    }
                }
            }

            // 第三部分：颜色系统
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: colorSection.implicitHeight + ds.spacing6 * 2
                color: ds.surface
                radius: ds.radiusLarge
                border.width: 1
                border.color: ds.border

                ColumnLayout {
                    id: colorSection
                    anchors.fill: parent
                    anchors.margins: ds.spacing6
                    spacing: ds.spacing4

                    Text {
                        text: "3. 类型颜色系统"
                        font.family: ds.fontFamily
                        font.pixelSize: ds.fontSize18
                        font.weight: ds.fontWeightBold
                        color: ds.textPrimary
                    }

                    Text {
                        text: "9种实体类型，各有专属颜色"
                        font.family: ds.fontFamily
                        font.pixelSize: ds.fontSize13
                        color: ds.textSecondary
                    }

                    Flow {
                        Layout.fillWidth: true
                        spacing: ds.spacing3

                        Repeater {
                            model: [
                                {type: "person", name: "人物"},
                                {type: "polity", name: "政权"},
                                {type: "place", name: "地点"},
                                {type: "organization", name: "组织"},
                                {type: "branch", name: "分支"},
                                {type: "event", name: "事件"},
                                {type: "item", name: "物品"},
                                {type: "species", name: "种族"},
                                {type: "concept", name: "概念"}
                            ]

                            Rectangle {
                                width: 100
                                height: 60
                                radius: ds.radiusMedium
                                color: ds.getTypeColor(modelData.type)

                                Text {
                                    anchors.centerIn: parent
                                    text: modelData.name
                                    font.family: ds.fontFamily
                                    font.pixelSize: ds.fontSize14
                                    font.weight: ds.fontWeightMedium
                                    color: "#ffffff"
                                }
                            }
                        }
                    }
                }
            }

            // 底部说明
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: infoSection.implicitHeight + ds.spacing4 * 2
                Layout.bottomMargin: ds.spacing6
                color: ds.withOpacity(ds.primary, 0.1)
                radius: ds.radiusMedium
                border.width: 1
                border.color: ds.primary

                ColumnLayout {
                    id: infoSection
                    anchors.fill: parent
                    anchors.margins: ds.spacing4
                    spacing: ds.spacing2

                    Text {
                        text: "💡 演示说明"
                        font.family: ds.fontFamily
                        font.pixelSize: ds.fontSize14
                        font.weight: ds.fontWeightBold
                        color: ds.textPrimary
                    }

                    Text {
                        Layout.fillWidth: true
                        text: "• 点击按钮查看Toast通知\n" +
                              "• 切换暗色模式开关\n" +
                              "• 悬停在卡片上查看效果\n" +
                              "• 查看集成指南.md了解如何应用到主程序"
                        font.family: ds.fontFamily
                        font.pixelSize: ds.fontSize13
                        color: ds.textSecondary
                        wrapMode: Text.WordWrap
                    }
                }
            }
        }
    }
}
