// 增强的词条属性编辑器 - 多样化且易于关联

import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15

Item {
    id: fieldEditor

    property var fieldDefinition: null  // 字段定义
    property var fieldValue: null       // 字段值
    property bool readOnly: false

    signal valueChanged(var newValue)
    signal entityReferenceClicked(string entityId)

    DesignSystem { id: ds }

    implicitHeight: contentLoader.height

    // 根据字段类型加载不同的编辑器
    Loader {
        id: contentLoader
        anchors.fill: parent
        sourceComponent: getEditorComponent()
    }

    function getEditorComponent() {
        if (!fieldDefinition) return null

        var fieldType = fieldDefinition.fieldType.toLowerCase()

        switch (fieldType) {
            case "text":
            case "string":
                return textFieldComponent
            case "textarea":
            case "multiline":
                return textAreaComponent
            case "integer":
            case "int":
            case "number":
            case "float":
                return numberFieldComponent
            case "boolean":
            case "bool":
                return booleanFieldComponent
            case "date":
                return dateFieldComponent
            case "choice":
            case "select":
            case "enum":
                return choiceFieldComponent
            case "multiselect":
                return multiSelectComponent
            case "color":
                return colorFieldComponent
            case "entity":
            case "entity_ref":
            case "entity_reference":
                return entityReferenceComponent
            case "entity_refs":
            case "entity_list":
            case "multi_entity":
                return entityListComponent
            case "json":
                return jsonFieldComponent
            default:
                return textFieldComponent
        }
    }

    // ==================== 文本输入 ====================
    Component {
        id: textFieldComponent

        ColumnLayout {
            spacing: ds.spacing2

            Text {
                text: fieldEditor.fieldDefinition.name
                font.family: ds.fontFamily
                font.pixelSize: ds.fontSize13
                font.weight: ds.fontWeightMedium
                color: ds.textSecondary
            }

            TextField {
                Layout.fillWidth: true
                text: fieldEditor.fieldValue || ""
                readOnly: fieldEditor.readOnly
                placeholderText: fieldEditor.fieldDefinition.description || "请输入..."
                onTextChanged: if (!readOnly) fieldEditor.valueChanged(text)
            }
        }
    }

    // ==================== 多行文本 ====================
    Component {
        id: textAreaComponent

        ColumnLayout {
            spacing: ds.spacing2

            Text {
                text: fieldEditor.fieldDefinition.name
                font.family: ds.fontFamily
                font.pixelSize: ds.fontSize13
                font.weight: ds.fontWeightMedium
                color: ds.textSecondary
            }

            ScrollView {
                Layout.fillWidth: true
                Layout.preferredHeight: 120
                clip: true

                TextArea {
                    text: fieldEditor.fieldValue || ""
                    readOnly: fieldEditor.readOnly
                    placeholderText: fieldEditor.fieldDefinition.description || "请输入..."
                    wrapMode: TextArea.Wrap
                    font.family: ds.fontFamily
                    font.pixelSize: ds.fontSize14
                    color: ds.textPrimary
                    onTextChanged: if (!readOnly) fieldEditor.valueChanged(text)

                    background: Rectangle {
                        radius: ds.radiusMedium
                        color: ds.surface
                        border.width: 1
                        border.color: parent.activeFocus ? ds.primary : ds.border
                    }
                }
            }
        }
    }

    // ==================== 数字输入 ====================
    Component {
        id: numberFieldComponent

        ColumnLayout {
            spacing: ds.spacing2

            Text {
                text: fieldEditor.fieldDefinition.name
                font.family: ds.fontFamily
                font.pixelSize: ds.fontSize13
                font.weight: ds.fontWeightMedium
                color: ds.textSecondary
            }

            SpinBox {
                Layout.preferredWidth: 150
                value: fieldEditor.fieldValue || 0
                from: -999999999
                to: 999999999
                editable: true
                enabled: !fieldEditor.readOnly
                onValueChanged: if (!readOnly) fieldEditor.valueChanged(value)

                contentItem: TextInput {
                    text: parent.textFromValue(parent.value, parent.locale)
                    font.family: ds.fontFamily
                    font.pixelSize: ds.fontSize14
                    color: ds.textPrimary
                    horizontalAlignment: Qt.AlignHCenter
                    verticalAlignment: Qt.AlignVCenter
                    readOnly: !parent.editable
                    validator: parent.validator
                    inputMethodHints: Qt.ImhFormattedNumbersOnly
                }

                background: Rectangle {
                    radius: ds.radiusMedium
                    color: ds.surface
                    border.width: 1
                    border.color: ds.border
                }
            }
        }
    }

    // ==================== 布尔值 ====================
    Component {
        id: booleanFieldComponent

        RowLayout {
            spacing: ds.spacing3

            Text {
                text: fieldEditor.fieldDefinition.name
                font.family: ds.fontFamily
                font.pixelSize: ds.fontSize13
                font.weight: ds.fontWeightMedium
                color: ds.textSecondary
            }

            Switch {
                checked: fieldEditor.fieldValue === true
                enabled: !fieldEditor.readOnly
                onCheckedChanged: if (!readOnly) fieldEditor.valueChanged(checked)
            }
        }
    }

    // ==================== 日期选择 ====================
    Component {
        id: dateFieldComponent

        ColumnLayout {
            spacing: ds.spacing2

            Text {
                text: fieldEditor.fieldDefinition.name
                font.family: ds.fontFamily
                font.pixelSize: ds.fontSize13
                font.weight: ds.fontWeightMedium
                color: ds.textSecondary
            }

            TextField {
                Layout.fillWidth: true
                text: fieldEditor.fieldValue || ""
                readOnly: fieldEditor.readOnly
                placeholderText: "YYYY-MM-DD"
                onTextChanged: if (!readOnly) fieldEditor.valueChanged(text)
            }
        }
    }

    // ==================== 单选下拉 ====================
    Component {
        id: choiceFieldComponent

        ColumnLayout {
            spacing: ds.spacing2

            Text {
                text: fieldEditor.fieldDefinition.name
                font.family: ds.fontFamily
                font.pixelSize: ds.fontSize13
                font.weight: ds.fontWeightMedium
                color: ds.textSecondary
            }

            ComboBox {
                Layout.fillWidth: true
                model: fieldEditor.fieldDefinition.options || []
                currentIndex: {
                    var value = fieldEditor.fieldValue
                    var options = fieldEditor.fieldDefinition.options || []
                    return Math.max(0, options.indexOf(value))
                }
                enabled: !fieldEditor.readOnly
                onCurrentTextChanged: if (!readOnly && currentIndex >= 0) {
                    fieldEditor.valueChanged(currentText)
                }

                contentItem: Text {
                    leftPadding: ds.spacing3
                    text: parent.displayText
                    font.family: ds.fontFamily
                    font.pixelSize: ds.fontSize14
                    color: ds.textPrimary
                    verticalAlignment: Text.AlignVCenter
                    elide: Text.ElideRight
                }

                background: Rectangle {
                    radius: ds.radiusMedium
                    color: ds.surface
                    border.width: 1
                    border.color: parent.activeFocus ? ds.primary : ds.border
                }
            }
        }
    }

    // ==================== 多选 ====================
    Component {
        id: multiSelectComponent

        ColumnLayout {
            spacing: ds.spacing2

            Text {
                text: fieldEditor.fieldDefinition.name
                font.family: ds.fontFamily
                font.pixelSize: ds.fontSize13
                font.weight: ds.fontWeightMedium
                color: ds.textSecondary
            }

            Flow {
                Layout.fillWidth: true
                spacing: ds.spacing2

                Repeater {
                    model: fieldEditor.fieldDefinition.options || []

                    Rectangle {
                        width: checkbox.implicitWidth + ds.spacing3 * 2
                        height: 32
                        radius: ds.radiusMedium
                        color: checkbox.checked ? ds.withOpacity(ds.primary, 0.1) : ds.surface
                        border.width: 1
                        border.color: checkbox.checked ? ds.primary : ds.border

                        CheckBox {
                            id: checkbox
                            anchors.centerIn: parent
                            text: modelData
                            checked: {
                                var values = fieldEditor.fieldValue || []
                                return values.indexOf(modelData) >= 0
                            }
                            enabled: !fieldEditor.readOnly
                            onCheckedChanged: {
                                if (readOnly) return
                                var values = fieldEditor.fieldValue || []
                                if (checked && values.indexOf(modelData) < 0) {
                                    values.push(modelData)
                                } else if (!checked) {
                                    var index = values.indexOf(modelData)
                                    if (index >= 0) values.splice(index, 1)
                                }
                                fieldEditor.valueChanged(values)
                            }
                        }
                    }
                }
            }
        }
    }

    // ==================== 颜色选择 ====================
    Component {
        id: colorFieldComponent

        ColumnLayout {
            spacing: ds.spacing2

            Text {
                text: fieldEditor.fieldDefinition.name
                font.family: ds.fontFamily
                font.pixelSize: ds.fontSize13
                font.weight: ds.fontWeightMedium
                color: ds.textSecondary
            }

            Row {
                spacing: ds.spacing3

                Rectangle {
                    width: 40
                    height: 40
                    radius: ds.radiusMedium
                    color: fieldEditor.fieldValue || "#7c3aed"
                    border.width: 2
                    border.color: ds.border

                    MouseArea {
                        anchors.fill: parent
                        enabled: !fieldEditor.readOnly
                        cursorShape: Qt.PointingHandCursor
                        onClicked: colorDialog.open()
                    }
                }

                TextField {
                    width: 150
                    text: fieldEditor.fieldValue || "#7c3aed"
                    readOnly: fieldEditor.readOnly
                    placeholderText: "#000000"
                    onTextChanged: if (!readOnly) fieldEditor.valueChanged(text)
                }

                // 预设颜色
                Flow {
                    spacing: ds.spacing1

                    Repeater {
                        model: [
                            "#ef4444", "#f59e0b", "#eab308", "#10b981",
                            "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"
                        ]

                        Rectangle {
                            width: 24
                            height: 24
                            radius: 4
                            color: modelData
                            border.width: 1
                            border.color: ds.border

                            MouseArea {
                                anchors.fill: parent
                                enabled: !fieldEditor.readOnly
                                cursorShape: Qt.PointingHandCursor
                                onClicked: fieldEditor.valueChanged(modelData)
                            }
                        }
                    }
                }
            }

            ColorDialog {
                id: colorDialog
                onAccepted: fieldEditor.valueChanged(colorDialog.color.toString())
            }
        }
    }

    // ==================== 实体引用（单个）====================
    Component {
        id: entityReferenceComponent

        ColumnLayout {
            spacing: ds.spacing2

            Text {
                text: fieldEditor.fieldDefinition.name
                font.family: ds.fontFamily
                font.pixelSize: ds.fontSize13
                font.weight: ds.fontWeightMedium
                color: ds.textSecondary
            }

            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 60
                radius: ds.radiusMedium
                color: ds.surface
                border.width: 1
                border.color: entityRefMouseArea.containsMouse ? ds.primary : ds.border

                RowLayout {
                    anchors.fill: parent
                    anchors.margins: ds.spacing3
                    spacing: ds.spacing3

                    Rectangle {
                        width: 40
                        height: 40
                        radius: 20
                        color: ds.primary

                        Text {
                            anchors.centerIn: parent
                            text: getEntityName().substring(0, 1)
                            font.family: ds.fontFamily
                            font.pixelSize: ds.fontSize18
                            font.weight: ds.fontWeightBold
                            color: "#ffffff"
                        }
                    }

                    ColumnLayout {
                        Layout.fillWidth: true
                        spacing: 2

                        Text {
                            text: getEntityName() || "未选择"
                            font.family: ds.fontFamily
                            font.pixelSize: ds.fontSize14
                            font.weight: ds.fontWeightMedium
                            color: ds.textPrimary
                        }

                        Text {
                            text: fieldEditor.fieldValue ? "点击查看详情" : "点击选择实体"
                            font.family: ds.fontFamily
                            font.pixelSize: ds.fontSize12
                            color: ds.textTertiary
                        }
                    }

                    ModernButton {
                        text: fieldEditor.fieldValue ? "更改" : "选择"
                        variant: "outline"
                        size: "small"
                        enabled: !fieldEditor.readOnly
                        onClicked: {
                            // 打开实体选择对话框
                            entitySelectorDialog.open()
                        }
                    }

                    ModernButton {
                        visible: fieldEditor.fieldValue
                        text: "×"
                        variant: "ghost"
                        size: "small"
                        enabled: !fieldEditor.readOnly
                        onClicked: fieldEditor.valueChanged(null)
                    }
                }

                MouseArea {
                    id: entityRefMouseArea
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    enabled: fieldEditor.fieldValue
                    onClicked: {
                        if (fieldEditor.fieldValue) {
                            fieldEditor.entityReferenceClicked(fieldEditor.fieldValue)
                        }
                    }
                }
            }
        }
    }

    // ==================== 实体引用列表 ====================
    Component {
        id: entityListComponent

        ColumnLayout {
            spacing: ds.spacing2

            Row {
                spacing: ds.spacing3

                Text {
                    anchors.verticalCenter: parent.verticalCenter
                    text: fieldEditor.fieldDefinition.name
                    font.family: ds.fontFamily
                    font.pixelSize: ds.fontSize13
                    font.weight: ds.fontWeightMedium
                    color: ds.textSecondary
                }

                ModernButton {
                    text: "+ 添加实体"
                    variant: "outline"
                    size: "small"
                    enabled: !fieldEditor.readOnly
                    onClicked: entitySelectorDialog.open()
                }
            }

            Flow {
                Layout.fillWidth: true
                spacing: ds.spacing2

                Repeater {
                    model: fieldEditor.fieldValue || []

                    Rectangle {
                        width: entityChipRow.implicitWidth + ds.spacing3 * 2
                        height: 32
                        radius: ds.radiusMedium
                        color: ds.surface
                        border.width: 1
                        border.color: ds.border

                        RowLayout {
                            id: entityChipRow
                            anchors.centerIn: parent
                            spacing: ds.spacing2

                            Rectangle {
                                width: 20
                                height: 20
                                radius: 10
                                color: ds.primary

                                Text {
                                    anchors.centerIn: parent
                                    text: getEntityNameById(modelData).substring(0, 1)
                                    font.family: ds.fontFamily
                                    font.pixelSize: ds.fontSize11
                                    font.weight: ds.fontWeightBold
                                    color: "#ffffff"
                                }
                            }

                            Text {
                                text: getEntityNameById(modelData)
                                font.family: ds.fontFamily
                                font.pixelSize: ds.fontSize13
                                color: ds.textPrimary
                            }

                            Text {
                                visible: !fieldEditor.readOnly
                                text: "×"
                                font.family: ds.fontFamily
                                font.pixelSize: ds.fontSize16
                                color: ds.textSecondary

                                MouseArea {
                                    anchors.fill: parent
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: removeEntityFromList(modelData)
                                }
                            }
                        }

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: fieldEditor.entityReferenceClicked(modelData)
                        }
                    }
                }
            }
        }
    }

    // ==================== JSON编辑 ====================
    Component {
        id: jsonFieldComponent

        ColumnLayout {
            spacing: ds.spacing2

            Text {
                text: fieldEditor.fieldDefinition.name
                font.family: ds.fontFamily
                font.pixelSize: ds.fontSize13
                font.weight: ds.fontWeightMedium
                color: ds.textSecondary
            }

            ScrollView {
                Layout.fillWidth: true
                Layout.preferredHeight: 150
                clip: true

                TextArea {
                    text: JSON.stringify(fieldEditor.fieldValue, null, 2) || "{}"
                    readOnly: fieldEditor.readOnly
                    wrapMode: TextArea.Wrap
                    font.family: ds.fontFamilyMono
                    font.pixelSize: ds.fontSize13
                    color: ds.textPrimary
                    onTextChanged: {
                        if (!readOnly) {
                            try {
                                var parsed = JSON.parse(text)
                                fieldEditor.valueChanged(parsed)
                            } catch (e) {
                                // 无效JSON，不更新
                            }
                        }
                    }

                    background: Rectangle {
                        radius: ds.radiusMedium
                        color: ds.surfaceAlt
                        border.width: 1
                        border.color: parent.activeFocus ? ds.primary : ds.border
                    }
                }
            }
        }
    }

    // ==================== 辅助函数 ====================

    function getEntityName() {
        // 从backend获取实体名称
        if (!fieldEditor.fieldValue) return ""
        // TODO: 实现从backend获取实体名称
        return "实体名称"
    }

    function getEntityNameById(entityId) {
        // TODO: 实现
        return "实体" + entityId.substring(0, 6)
    }

    function removeEntityFromList(entityId) {
        var values = fieldEditor.fieldValue || []
        var index = values.indexOf(entityId)
        if (index >= 0) {
            values.splice(index, 1)
            fieldEditor.valueChanged(values)
        }
    }
}
