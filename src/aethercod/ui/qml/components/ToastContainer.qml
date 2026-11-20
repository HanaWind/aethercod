// QML组件 - Toast通知组件

import QtQuick 2.15
import QtQuick.Controls 2.15

Item {
    id: toastContainer
    anchors.fill: parent
    z: 1000

    // 显示Toast
    function show(message, type, duration) {
        var component = Qt.createComponent("ToastMessage.qml")
        if (component.status === Component.Ready) {
            var toast = component.createObject(toastContainer, {
                "message": message,
                "toastType": type || "info",
                "duration": duration || 3000
            })
            toast.show()
        }
    }

    function success(message, duration) {
        show(message, "success", duration)
    }

    function error(message, duration) {
        show(message, "error", duration)
    }

    function warning(message, duration) {
        show(message, "warning", duration)
    }

    function info(message, duration) {
        show(message, "info", duration)
    }
}
