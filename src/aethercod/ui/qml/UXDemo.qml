import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import Qt5Compat.GraphicalEffects
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
                layer.enabled: true
                layer.effect: DropShadow {
                    horizontalOffset: ds.shadowMedium.horizontalOffset
                    verticalOffset: ds.shadowMedium.verticalOffset
                    radius: ds.shadowMedium.radius
                    samples: ds.shadowMedium.samples
                    color: ds.shadowMedium.color
                }

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
                layer.enabled: true
                layer.effect: DropShadow {
                    horizontalOffset: ds.shadowSmall.horizontalOffset
                    verticalOffset: ds.shadowSmall.verticalOffset
                    radius: ds.shadowSmall.radius
                    samples: ds.shadowSmall.samples
                    color: ds.shadowSmall.color
                }

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

            // 第二部分：输入框组件
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: inputSection.implicitHeight + ds.spacing6 * 2
                color: ds.surface
                radius: ds.radiusLarge
                layer.enabled: true
                layer.effect: DropShadow {
                    horizontalOffset: ds.shadowSmall.horizontalOffset
                    verticalOffset: ds.shadowSmall.verticalOffset
                    radius: ds.shadowSmall.radius
                    samples: ds.shadowSmall.samples
                    color: ds.shadowSmall.color
                }

                ColumnLayout {
                    id: inputSection
                    anchors.fill: parent
                    anchors.margins: ds.spacing6
                    spacing: ds.spacing4

                    Text {
                        text: "2. 现代化输入框"
                        font.family: ds.fontFamily
                        font.pixelSize: ds.fontSize18
                        font.weight: ds.fontWeightBold
                        color: ds.textPrimary
                    }

                    Text {
                        text: "支持标签、验证、图标、清除按钮"
                        font.family: ds.fontFamily
                        font.pixelSize: ds.fontSize13
                        color: ds.textSecondary
                    }

                    GridLayout {
                        Layout.fillWidth: true
                        columns: 2
                        rowSpacing: ds.spacing4
                        columnSpacing: ds.spacing4

                        TextField {
                            Layout.fillWidth: true
                            placeholderText: "基础输入框"
                            showClearButton: true
                        }

                        TextField {
                            Layout.fillWidth: true
                            placeholderText: "搜索..."
                            showClearButton: true
                        }

                        TextField {
                            Layout.fillWidth: true
                            Layout.columnSpan: 2
                            placeholderText: "带错误提示的输入框"
                            hasError: text.length > 0 && text.length < 3
                        }
                    }
                }
            }

            // 第三部分：实体卡片
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: cardSection.implicitHeight + ds.spacing6 * 2
                color: ds.surface
                radius: ds.radiusLarge
                layer.enabled: true
                layer.effect: DropShadow {
                    horizontalOffset: ds.shadowSmall.horizontalOffset
                    verticalOffset: ds.shadowSmall.verticalOffset
                    radius: ds.shadowSmall.radius
                    samples: ds.shadowSmall.samples
                    color: ds.shadowSmall.color
                }

                ColumnLayout {
                    id: cardSection
                    anchors.fill: parent
                    anchors.margins: ds.spacing6
                    spacing: ds.spacing4

                    Text {
                        text: "3. 实体卡片展示"
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

            // 第四部分：颜色系统
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: colorSection.implicitHeight + ds.spacing6 * 2
                color: ds.surface
                radius: ds.radiusLarge
                layer.enabled: true
                layer.effect: DropShadow {
                    horizontalOffset: ds.shadowSmall.horizontalOffset
                    verticalOffset: ds.shadowSmall.verticalOffset
                    radius: ds.shadowSmall.radius
                    samples: ds.shadowSmall.samples
                    color: ds.shadowSmall.color
                }

                ColumnLayout {
                    id: colorSection
                    anchors.fill: parent
                    anchors.margins: ds.spacing6
                    spacing: ds.spacing4

                    Text {
                        text: "4. 类型颜色系统"
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
                        text: "💡 如何集成到主程序"
                        font.family: ds.fontFamily
                        font.pixelSize: ds.fontSize14
                        font.weight: ds.fontWeightBold
                        color: ds.textPrimary
                    }

                    Text {
                        Layout.fillWidth: true
                        text: "1. 在 Main.qml 顶部引入 DesignSystem.qml\n" +
                              "2. 替换现有的 Button 为 ModernButton\n" +
                              "3. 替换现有的 TextField 为 ModernInput\n" +
                              "4. 使用 EnhancedTimeline 替换时间线\n" +
                              "5. 使用 EnhancedGraph 替换关系图\n" +
                              "6. 运行程序查看效果"
                        font.family: ds.fontFamily
                        font.pixelSize: ds.fontSize13
                        color: ds.textSecondary
                        wrapMode: Text.WordWrap
                    }
                }
            }
        }
    }

    // 快捷键
    Shortcuts {
        property var searchBar: null
    }
}
