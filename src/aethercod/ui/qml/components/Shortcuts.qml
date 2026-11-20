// QML组件 - 快捷键定义

import QtQuick 2.15
import QtQuick.Controls 2.15

Item {
    id: shortcuts

    // 新建实体
    Shortcut {
        sequence: "Ctrl+N"
        onActivated: backend.newEntity()
    }

    // 保存实体
    Shortcut {
        sequence: "Ctrl+S"
        onActivated: backend.saveEntity()
    }

    // 搜索
    Shortcut {
        sequence: "Ctrl+F"
        onActivated: {
            if (searchBar) searchBar.forceActiveFocus()
        }
    }

    // 刷新
    Shortcut {
        sequence: "F5"
        onActivated: backend.refresh()
    }

    // 删除实体
    Shortcut {
        sequence: "Delete"
        enabled: backend.hasProject && backend.currentEntityId
        onActivated: {
            deleteConfirmDialog.open()
        }
    }

    // 关闭预览/对话框
    Shortcut {
        sequence: "Escape"
        onActivated: {
            if (previewDialog && previewDialog.visible) {
                previewDialog.close()
            }
        }
    }

    // 切换主题
    Shortcut {
        sequence: "Ctrl+Shift+T"
        onActivated: backend.toggleTheme()
    }

    // 打开项目
    Shortcut {
        sequence: "Ctrl+O"
        onActivated: backend.chooseAndOpenProject()
    }

    // 导出
    Shortcut {
        sequence: "Ctrl+E"
        onActivated: backend.chooseAndExportLibrary()
    }

    // 命令面板（将来实现）
    Shortcut {
        sequence: "Ctrl+K"
        onActivated: {
            // TODO: 打开命令面板
            console.log("Command palette shortcut triggered")
        }
    }

    // 时间线视图
    Shortcut {
        sequence: "Ctrl+1"
        onActivated: root.page = "timeline"
    }

    // 关系图视图
    Shortcut {
        sequence: "Ctrl+2"
        onActivated: root.page = "graph"
    }

    // 词条列表视图
    Shortcut {
        sequence: "Ctrl+3"
        onActivated: root.page = "entries"
    }

    // 数据校验视图
    Shortcut {
        sequence: "Ctrl+4"
        onActivated: root.page = "validation"
    }
}
