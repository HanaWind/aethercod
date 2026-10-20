import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Effects
import QtQuick.Layouts 1.15

ApplicationWindow {
    id: root
    objectName: "workspaceWindow"
    width: 1440
    height: 900
    minimumWidth: 980
    minimumHeight: 640
    visible: true
    title: backend.hasProject ? backend.projectName + " - Aethercod" : "Aethercod"
    property bool darkMode: backend.dark
    property string page: "entries"
    property string pendingRelationId: ""
    property string pendingFieldId: ""

    function terraYear(value) {
        return backend.formatYear(Number(value))
    }

    function prepareNewProject() {
        newProjectName.text = "新的世界"
        newProjectEra.text = "泰拉纪元"
        newProjectAuthor.text = ""
        newProjectDescription.text = ""
        newProjectDialog.open()
    }

    function showProjectSettings() {
        if (!backend.hasProject) return
        settingsNameField.text = backend.projectName
        settingsEraField.text = backend.eraName
        settingsAuthorField.text = backend.projectAuthor
        settingsDescriptionField.text = backend.projectDescription
        root.page = "settings"
    }

    function openPreviewedEntity() {
        var entityId = backend.previewEntityId
        if (!entityId) return
        root.page = "entries"
        backend.openRelation(entityId)
        previewDialog.close()
    }

    function timelineX(value, width) {
        var minYear = Number(backend.timelineMinYear)
        var maxYear = Number(backend.timelineMaxYear)
        if (value === null || value === undefined || maxYear <= minYear) return width - 90
        return Math.max(100, Math.min(width - 100, 70 + (Number(value) - minYear) / (maxYear - minYear) * Math.max(80, width - 150)))
    }

    function openFieldEditor(fieldId, name, fieldType, required, description, optionsJson) {
        fieldIdInput.text = fieldId
        fieldNameInput.text = name
        fieldTypeCombo.currentValue = fieldType || "text"
        fieldRequiredInput.checked = required
        fieldDescriptionInput.text = description
        try { fieldOptionsInput.text = JSON.parse(optionsJson || "[]").join(", ") }
        catch (error) { fieldOptionsInput.text = "" }
        fieldDefinitionDialog.open()
    }

    QtObject {
        id: themeColors
        property color window: root.darkMode ? "#0d1718" : "#eef4f5"
        property color backdrop: root.darkMode ? "#0b1517" : "#eaf1f2"
        property color header: root.darkMode ? "#b3192b30" : "#bcffffff"
        property color panel: root.darkMode ? "#1a2b30" : "#f9fcfc"
        property color panelAlt: root.darkMode ? "#233a40" : "#edf5f5"
        property color glassPanel: root.darkMode ? "#b01a2b30" : "#a6ffffff"
        property color glassInset: root.darkMode ? "#8c1b3038" : "#85f5fbff"
        property color glassClear: root.darkMode ? "#60142129" : "#70f8fcff"
        property color dialog: root.darkMode ? "#d11a2b30" : "#dcffffff"
        property color input: root.darkMode ? "#ed111f20" : "#f2ffffff"
        property color text: root.darkMode ? "#edf6f3" : "#19302d"
        property color muted: root.darkMode ? "#a8bdb6" : "#657c76"
        property color faint: root.darkMode ? "#728a82" : "#839892"
        property color border: root.darkMode ? "#526f67" : "#c8dad5"
        property color accent: root.darkMode ? "#65d4b5" : "#087f68"
        property color accentHover: root.darkMode ? "#83e1c7" : "#056b59"
        property color accentSoft: root.darkMode ? "#3b5d54" : "#d8f0e8"
        property color danger: root.darkMode ? "#ff9c92" : "#b94039"
        property color warning: root.darkMode ? "#f2c776" : "#9f711d"
    }

    color: themeColors.window
    font.family: "Microsoft YaHei UI"
    font.pixelSize: 14
    palette.window: themeColors.panel
    palette.windowText: themeColors.text
    palette.base: themeColors.input
    palette.text: themeColors.text
    palette.button: themeColors.panelAlt
    palette.buttonText: themeColors.text
    palette.placeholderText: themeColors.faint
    palette.highlight: themeColors.accent
    palette.highlightedText: root.darkMode ? "#10211b" : "#ffffff"

    background: Item {
    Canvas {
        id: ambientField
        objectName: "ambientField"
        anchors.fill: parent
        renderTarget: Canvas.Image
        antialiasing: true
        property var particles: []
        property real phase: 0

        function seeded(seed) {
            var value = Math.sin(seed * 47.37) * 10000
            return value - Math.floor(value)
        }

        function resetParticles() {
            if (width <= 0 || height <= 0) return
            var next = []
            for (var i = 0; i < 42; ++i) {
                next.push({
                    x: seeded(i + 1) * width,
                    y: seeded(i + 83) * height,
                    vx: (seeded(i + 161) - 0.5) * 1.2,
                    vy: (seeded(i + 239) - 0.5) * 0.9,
                    radius: 1.8 + seeded(i + 317) * 4.5,
                    alpha: 0.22 + seeded(i + 401) * 0.25,
                    tone: i % 3
                })
            }
            particles = next
            requestPaint()
        }

        onWidthChanged: resetParticles()
        onHeightChanged: resetParticles()
        Component.onCompleted: resetParticles()

        onPaint: {
            var ctx = getContext("2d")
            ctx.clearRect(0, 0, width, height)
            ctx.fillStyle = themeColors.backdrop
            ctx.fillRect(0, 0, width, height)
            var tones = root.darkMode
                ? ["56, 150, 126", "65, 117, 159", "155, 125, 71"]
                : ["75, 177, 149", "99, 159, 196", "210, 181, 119"]
            for (var glowIndex = 0; glowIndex < tones.length; ++glowIndex) {
                var centerX = width * (0.18 + glowIndex * 0.32)
                    + Math.sin(phase + glowIndex * 2.1) * width * 0.06
                var centerY = height * (glowIndex === 1 ? 0.75 : 0.25)
                    + Math.cos(phase * 0.7 + glowIndex * 1.8) * height * 0.08
                var radius = Math.max(width, height) * 0.42
                var glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius)
                glow.addColorStop(0, "rgba(" + tones[glowIndex] + ", " + (root.darkMode ? 0.66 : 0.58) + ")")
                glow.addColorStop(1, "rgba(" + tones[glowIndex] + ", 0)")
                ctx.fillStyle = glow
                ctx.fillRect(0, 0, width, height)
            }
            for (var i = 0; i < particles.length; ++i) {
                var particle = particles[i]
                var color = particle.tone === 0
                    ? (root.darkMode ? "101, 212, 181" : "16, 139, 112")
                    : particle.tone === 1
                    ? (root.darkMode ? "101, 176, 214" : "52, 134, 176")
                    : (root.darkMode ? "217, 180, 111" : "183, 132, 51")
                ctx.beginPath()
                ctx.fillStyle = "rgba(" + color + ", " + particle.alpha + ")"
                ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2)
                ctx.fill()
            }
        }

        Timer {
            interval: 50
            repeat: true
            running: root.visible && root.visibility !== Window.Minimized
            onTriggered: {
                ambientField.phase += 0.006
                for (var i = 0; i < ambientField.particles.length; ++i) {
                    var particle = ambientField.particles[i]
                    particle.x += particle.vx
                    particle.y += particle.vy
                    if (particle.x < -8) particle.x = ambientField.width + 8
                    if (particle.x > ambientField.width + 8) particle.x = -8
                    if (particle.y < -8) particle.y = ambientField.height + 8
                    if (particle.y > ambientField.height + 8) particle.y = -8
                }
                ambientField.requestPaint()
            }
        }
    }

    MultiEffect {
        id: frostedBackdrop
        anchors.fill: ambientField
        source: ambientField
        visible: false
        autoPaddingEnabled: false
        blurEnabled: true
        blur: 0.85
        blurMax: 48
        saturation: -0.12
    }
    }

    component GlassPanel: Item {
        id: glassPanel
        property color tint: themeColors.glassPanel
        property real radius: 12
        property color borderColor: root.darkMode ? "#607faaa9" : "#d9ffffff"
        clip: true
        ShaderEffectSource {
            anchors.fill: parent
            sourceItem: frostedBackdrop
            sourceRect: {
                // Include layout dimensions so sampling follows window resizing.
                var layoutWidth = root.width
                var layoutHeight = root.height
                var localX = glassPanel.x
                var localY = glassPanel.y
                var point = glassPanel.mapToItem(ambientField, 0, 0)
                return Qt.rect(point.x, point.y, glassPanel.width, glassPanel.height)
            }
            live: true
            recursive: false
        }
        Rectangle {
            anchors.fill: parent
            radius: glassPanel.radius
            color: glassPanel.tint
            border.width: 1
            border.color: glassPanel.borderColor
        }
    }

    component DialogHeader: Rectangle {
        required property string titleText
        implicitHeight: 52
        color: "transparent"
        Text {
            anchors.fill: parent
            anchors.leftMargin: 18
            anchors.rightMargin: 18
            text: parent.titleText
            color: themeColors.text
            font.pixelSize: 15
            font.weight: Font.DemiBold
            verticalAlignment: Text.AlignVCenter
            elide: Text.ElideRight
        }
        Rectangle { anchors.left: parent.left; anchors.right: parent.right; anchors.bottom: parent.bottom; height: 1; color: themeColors.border }
    }

    component DialogActions: Control {
        default property alias actions: actionRow.data
        implicitHeight: 64
        leftPadding: 18
        rightPadding: 18
        topPadding: 10
        bottomPadding: 18
        contentItem: RowLayout {
            id: actionRow
            spacing: 8
            Item { Layout.fillWidth: true }
        }
    }

    component FlatButton: Button {
        id: flatButton
        property bool primary: false
        hoverEnabled: true
        implicitHeight: 36
        contentItem: Text {
            text: flatButton.text
            color: flatButton.enabled
                   ? (flatButton.primary ? (root.darkMode ? "#10211b" : "#ffffff") : themeColors.text)
                   : themeColors.faint
            font.pixelSize: 13
            font.weight: flatButton.primary ? Font.DemiBold : Font.Medium
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
            elide: Text.ElideRight
        }
        background: Rectangle {
            radius: 5
            color: !flatButton.enabled ? themeColors.panelAlt
                  : flatButton.primary ? (flatButton.down ? themeColors.accentHover : themeColors.accent)
                  : flatButton.down ? themeColors.accentSoft
                  : flatButton.hovered ? themeColors.panelAlt : "transparent"
            border.width: flatButton.primary ? 0 : 1
            border.color: flatButton.hovered ? themeColors.border : "transparent"
        }
    }

    component IconButton: ToolButton {
        id: iconButton
        property string hint: ""
        hoverEnabled: true
        implicitWidth: 36
        implicitHeight: 36
        palette.window: themeColors.panel
        palette.windowText: themeColors.text
        palette.base: themeColors.panel
        palette.text: themeColors.text
        palette.button: themeColors.panel
        palette.buttonText: themeColors.text
        contentItem: Text {
            text: iconButton.text
            color: iconButton.enabled ? (iconButton.down ? themeColors.accent : themeColors.text) : themeColors.faint
            font.pixelSize: 18
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
        }
        background: Rectangle {
            radius: 5
            color: iconButton.down ? themeColors.accentSoft
                  : iconButton.hovered ? themeColors.panelAlt : "transparent"
            border.color: iconButton.hovered ? themeColors.border : "transparent"
            border.width: 1
        }
        ToolTip.visible: hovered && hint.length > 0
        ToolTip.text: hint
        ToolTip.delay: 500
    }

    header: GlassPanel {
        height: 72
        radius: 0
        tint: themeColors.header

        RowLayout {
            anchors.fill: parent
            anchors.leftMargin: 22
            anchors.rightMargin: 20
            spacing: 14

            Rectangle {
                Layout.preferredWidth: 34
                Layout.preferredHeight: 34
                radius: 8
                color: themeColors.accentSoft
                Text {
                    anchors.centerIn: parent
                    text: "✦"
                    color: themeColors.accent
                    font.pixelSize: 19
                }
            }
            Column {
                Layout.preferredWidth: 190
                spacing: 1
                Text { text: "Aethercod"; color: themeColors.text; font.pixelSize: 16; font.weight: Font.DemiBold }
                Text { text: backend.hasProject ? backend.projectName : "奇幻世界观数据库"; color: themeColors.muted; font.pixelSize: 11; elide: Text.ElideRight }
            }

            Item { Layout.fillWidth: true }

            TextField {
                id: searchBox
                visible: root.page === "entries" && backend.hasProject
                Layout.preferredWidth: 280
                Layout.preferredHeight: 36
                placeholderText: "搜索词条、别名、标签..."
                text: backend.query
                color: themeColors.text
                placeholderTextColor: themeColors.faint
                selectByMouse: true
                onTextEdited: backend.setQuery(text)
                background: Rectangle {
                    radius: 5
                    color: themeColors.input
                    border.color: searchBox.activeFocus ? themeColors.accent : themeColors.border
                    border.width: searchBox.activeFocus ? 2 : 1
                }
            }

            IconButton {
                text: "＋"
                hint: "新建词条"
                enabled: backend.hasProject && !backend.readOnly && !backend.dirty
                onClicked: backend.newEntity()
            }
            IconButton { text: "↻"; hint: "刷新项目"; enabled: backend.hasProject; onClicked: backend.refresh() }
            IconButton {
                text: "⋯"
                hint: "资料库操作"
                onClicked: projectActionsPopup.open()
            }
            Rectangle { Layout.preferredWidth: 1; Layout.preferredHeight: 26; color: themeColors.border }
            FlatButton { text: "打开"; onClicked: backend.chooseAndOpenProject() }
            FlatButton { text: "新建项目"; onClicked: root.prepareNewProject() }
            IconButton {
                text: root.darkMode ? "☼" : "◐"
                hint: root.darkMode ? "切换到日间模式" : "切换到夜间模式"
                onClicked: backend.toggleTheme()
            }
        }
    }

    Popup {
        id: projectActionsPopup
        objectName: "projectActionsPopup"
        x: Math.max(16, root.width - width - 20)
        y: 8
        width: 264
        padding: 10
        closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
        background: GlassPanel { radius: 7; tint: themeColors.dialog }
        contentItem: ColumnLayout {
            spacing: 4
            Text {
                Layout.fillWidth: true
                text: backend.hasProject ? backend.projectName : "资料库"
                color: themeColors.muted
                font.pixelSize: 11
                font.weight: Font.DemiBold
                leftPadding: 10
                rightPadding: 10
                topPadding: 5
                bottomPadding: 5
                elide: Text.ElideRight
            }
            FlatButton { Layout.fillWidth: true; text: "新建资料库"; onClicked: { projectActionsPopup.close(); root.prepareNewProject() } }
            FlatButton { Layout.fillWidth: true; text: "打开资料库"; onClicked: { projectActionsPopup.close(); backend.chooseAndOpenProject() } }
            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; Layout.topMargin: 3; Layout.bottomMargin: 3; color: themeColors.border }
            FlatButton { Layout.fillWidth: true; text: "资料库设置"; enabled: backend.hasProject; onClicked: { projectActionsPopup.close(); root.showProjectSettings() } }
            FlatButton { Layout.fillWidth: true; text: "备份 .aethercod 文件"; enabled: backend.hasProject && !backend.dirty; onClicked: { projectActionsPopup.close(); backend.chooseAndBackupProject() } }
            FlatButton { Layout.fillWidth: true; text: "导出资料库 JSON"; enabled: backend.hasProject && !backend.dirty; onClicked: { projectActionsPopup.close(); backend.chooseAndExportLibrary() } }
            FlatButton { Layout.fillWidth: true; text: "导入并合并 JSON"; enabled: backend.hasProject && !backend.readOnly && !backend.dirty; onClicked: { projectActionsPopup.close(); importConfirmDialog.open() } }
            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; Layout.topMargin: 3; Layout.bottomMargin: 3; color: themeColors.border }
            FlatButton { Layout.fillWidth: true; text: "关闭当前资料库"; enabled: backend.hasProject; onClicked: { projectActionsPopup.close(); backend.requestCloseProject() } }
        }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 10

        RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 12

            GlassPanel {
                Layout.preferredWidth: 208
                Layout.fillHeight: true

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 14
                    spacing: 8

                    Text { text: "工作区"; color: themeColors.faint; font.pixelSize: 11; font.weight: Font.DemiBold; leftPadding: 8; bottomPadding: 5 }
                    FlatButton {
                        Layout.fillWidth: true
                        text: "词条库"
                        onClicked: root.page = "entries"
                        background: Rectangle {
                            radius: 5
                            color: root.page === "entries" ? themeColors.accentSoft : parent.hovered ? themeColors.panelAlt : "transparent"
                        }
                        contentItem: RowLayout {
                            spacing: 10
                            Item { Layout.preferredWidth: 22; Layout.fillHeight: true; Text { anchors.centerIn: parent; text: "▤"; color: root.page === "entries" ? themeColors.accent : themeColors.text; font.pixelSize: 14 } }
                            Text { Layout.fillWidth: true; text: "词条库"; color: root.page === "entries" ? themeColors.accent : themeColors.text; font.pixelSize: 13; font.weight: Font.Medium; verticalAlignment: Text.AlignVCenter }
                        }
                    }
                    FlatButton {
                        Layout.fillWidth: true
                        text: "时间线"
                        onClicked: root.page = "timeline"
                        background: Rectangle {
                            radius: 5
                            color: root.page === "timeline" ? themeColors.accentSoft : parent.hovered ? themeColors.panelAlt : "transparent"
                        }
                        contentItem: RowLayout {
                            spacing: 10
                            Item { Layout.preferredWidth: 22; Layout.fillHeight: true; Text { anchors.centerIn: parent; text: "◷"; color: root.page === "timeline" ? themeColors.accent : themeColors.text; font.pixelSize: 14 } }
                            Text { Layout.fillWidth: true; text: "时间线"; color: root.page === "timeline" ? themeColors.accent : themeColors.text; font.pixelSize: 13; font.weight: Font.Medium; verticalAlignment: Text.AlignVCenter }
                        }
                    }
                    FlatButton {
                        Layout.fillWidth: true
                        text: "关系图"
                        onClicked: root.page = "graph"
                        background: Rectangle { radius: 5; color: root.page === "graph" ? themeColors.accentSoft : parent.hovered ? themeColors.panelAlt : "transparent" }
                        contentItem: RowLayout {
                            spacing: 10
                            Item { Layout.preferredWidth: 22; Layout.fillHeight: true; Text { anchors.centerIn: parent; text: "⌘"; color: root.page === "graph" ? themeColors.accent : themeColors.text; font.pixelSize: 14 } }
                            Text { Layout.fillWidth: true; text: "关系图"; color: root.page === "graph" ? themeColors.accent : themeColors.text; font.pixelSize: 13; font.weight: Font.Medium; verticalAlignment: Text.AlignVCenter }
                        }
                    }
                    FlatButton {
                        Layout.fillWidth: true
                        text: "数据校验"
                        enabled: backend.hasProject
                        onClicked: { backend.refresh(); root.page = "validation" }
                        background: Rectangle { radius: 5; color: root.page === "validation" ? themeColors.accentSoft : parent.hovered ? themeColors.panelAlt : "transparent" }
                        contentItem: RowLayout {
                            spacing: 10
                            Item { Layout.preferredWidth: 22; Layout.fillHeight: true; Text { anchors.centerIn: parent; text: "✓"; color: root.page === "validation" ? themeColors.accent : themeColors.text; font.pixelSize: 14 } }
                            Text { Layout.fillWidth: true; text: "数据校验" + (backend.validationCount ? "  " + backend.validationCount : ""); color: root.page === "validation" ? themeColors.accent : themeColors.text; font.pixelSize: 13; font.weight: Font.Medium; verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight }
                        }
                    }
                    FlatButton {
                        Layout.fillWidth: true
                        text: "资料库设置"
                        enabled: backend.hasProject
                        onClicked: root.showProjectSettings()
                        background: Rectangle { radius: 5; color: root.page === "settings" ? themeColors.accentSoft : parent.hovered ? themeColors.panelAlt : "transparent" }
                        contentItem: RowLayout {
                            spacing: 10
                            Item { Layout.preferredWidth: 22; Layout.fillHeight: true; Text { anchors.centerIn: parent; text: "⚙"; color: root.page === "settings" ? themeColors.accent : themeColors.text; font.pixelSize: 14 } }
                            Text { Layout.fillWidth: true; text: "资料库设置"; color: root.page === "settings" ? themeColors.accent : themeColors.text; font.pixelSize: 13; font.weight: Font.Medium; verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight }
                        }
                    }

                    Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; Layout.topMargin: 10; Layout.bottomMargin: 3; color: themeColors.border }
                    RowLayout {
                        Layout.fillWidth: true
                        visible: root.page === "entries"
                        Text { text: "词条类型"; color: themeColors.faint; font.pixelSize: 11; font.weight: Font.DemiBold; leftPadding: 8 }
                        Item { Layout.fillWidth: true }
                    }
                    FlatButton {
                        Layout.fillWidth: true
                        visible: root.page === "entries"
                        text: "全部词条"
                        leftPadding: 10
                        rightPadding: 10
                        onClicked: backend.setTypeFilter("")
                        background: Rectangle { radius: 5; color: backend.typeFilter === "" ? themeColors.accentSoft : parent.hovered ? themeColors.panelAlt : "transparent" }
                        contentItem: RowLayout {
                            spacing: 10
                            Item { Layout.preferredWidth: 22; Layout.fillHeight: true; Text { anchors.centerIn: parent; text: "▤"; color: backend.typeFilter === "" ? themeColors.accent : themeColors.text; font.pixelSize: 14 } }
                            Text { Layout.fillWidth: true; text: "全部词条"; color: backend.typeFilter === "" ? themeColors.accent : themeColors.text; font.pixelSize: 13; verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight }
                        }
                    }
                    Repeater {
                        model: backend.typeModelObject
                        delegate: FlatButton {
                            required property string id
                            required property string name
                            required property string typeIcon
                            Layout.fillWidth: true
                            visible: root.page === "entries"
                            text: name
                            leftPadding: 10
                            rightPadding: 10
                            onClicked: backend.setTypeFilter(id)
                            background: Rectangle { radius: 5; color: backend.typeFilter === id ? themeColors.accentSoft : parent.hovered ? themeColors.panelAlt : "transparent" }
                            contentItem: RowLayout {
                                spacing: 10
                                Item { Layout.preferredWidth: 22; Layout.fillHeight: true; Text { anchors.centerIn: parent; text: typeIcon; color: backend.typeFilter === id ? themeColors.accent : themeColors.text; font.pixelSize: 14 } }
                                Text { Layout.fillWidth: true; text: name; color: backend.typeFilter === id ? themeColors.accent : themeColors.text; font.pixelSize: 13; verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight }
                            }
                        }
                    }
                    Item { Layout.fillHeight: true }
                    Text {
                        Layout.fillWidth: true
                        visible: backend.hasProject
                        text: backend.readOnly ? "只读项目" : "本地项目 · 自动保存在数据库"
                        color: themeColors.faint
                        font.pixelSize: 11
                        wrapMode: Text.Wrap
                        leftPadding: 8
                    }
                }
            }

            StackLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                currentIndex: root.page === "timeline" ? 1 : root.page === "graph" ? 2 : root.page === "validation" ? 3 : root.page === "settings" ? 4 : 0

                RowLayout {
                    spacing: 12

                    GlassPanel {
                        Layout.preferredWidth: 280
                        Layout.fillHeight: true
                        tint: themeColors.glassInset

                        ColumnLayout {
                            anchors.fill: parent
                            anchors.margins: 15
                            spacing: 10
                            RowLayout {
                                Layout.fillWidth: true
                                Text { text: "词条"; color: themeColors.text; font.pixelSize: 16; font.weight: Font.DemiBold }
                                Item { Layout.fillWidth: true }
                                Text { text: backend.entityCount; color: themeColors.muted; font.pixelSize: 12 }
                            }
                            Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: themeColors.border }
                            ListView {
                                id: entityList
                                Layout.fillWidth: true
                                Layout.fillHeight: true
                                clip: true
                                spacing: 3
                                model: backend.entityModelObject
                                ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }
                                delegate: ItemDelegate {
                                    id: entityDelegate
                                    required property string id
                                    required property string name
                                    required property string typeName
                                    required property string summary
                                    required property string color
                                    required property string tagsText
                                    width: entityList.width
                                    height: 74
                                    hoverEnabled: true
                                    onClicked: backend.selectEntity(id)
                                    background: Rectangle {
                                        radius: 5
                                        color: backend.currentEntityId === entityDelegate.id ? themeColors.accentSoft
                                              : entityDelegate.down ? themeColors.accentSoft
                                              : entityDelegate.hovered ? themeColors.panel : "transparent"
                                    }
                                    contentItem: RowLayout {
                                        spacing: 10
                                        Rectangle { Layout.preferredWidth: 4; Layout.preferredHeight: 42; radius: 2; color: entityDelegate.color }
                                        ColumnLayout {
                                            Layout.fillWidth: true
                                            spacing: 3
                                            Text { Layout.fillWidth: true; text: entityDelegate.name; color: themeColors.text; font.pixelSize: 13; font.weight: Font.DemiBold; elide: Text.ElideRight }
                                            Text { Layout.fillWidth: true; text: entityDelegate.typeName + (entityDelegate.tagsText ? "  ·  " + entityDelegate.tagsText : ""); color: themeColors.muted; font.pixelSize: 11; elide: Text.ElideRight }
                                            Text { Layout.fillWidth: true; text: entityDelegate.summary; color: themeColors.faint; font.pixelSize: 11; elide: Text.ElideRight }
                                        }
                                    }
                                }
                                Text {
                                    anchors.centerIn: parent
                                    visible: backend.hasProject && entityList.count === 0
                                    text: backend.query ? "没有匹配的词条" : "此类型还没有词条"
                                    color: themeColors.muted
                                    font.pixelSize: 12
                                }
                            }
                        }
                    }

                    GlassPanel {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        tint: themeColors.glassClear

                        RowLayout {
                            anchors.fill: parent
                            spacing: 0

                            Item {
                                Layout.fillWidth: true
                                Layout.fillHeight: true

                                ColumnLayout {
                                    anchors.fill: parent
                                    anchors.margins: 30
                                    spacing: 16
                                    visible: backend.hasProject && backend.currentEntityId !== ""

                                    RowLayout {
                                        Layout.fillWidth: true
                                        Text { text: backend.currentIsNew ? "新建词条" : "编辑词条"; color: themeColors.text; font.pixelSize: 20; font.weight: Font.DemiBold }
                                        Item { Layout.fillWidth: true }
                                        Text { text: backend.dirty ? "未保存" : ""; color: themeColors.warning; font.pixelSize: 12 }
                                        FlatButton { text: "删除"; enabled: !backend.readOnly && backend.currentEntityId !== "" && !backend.dirty; onClicked: deleteDialog.open() }
                                        FlatButton { text: "保存"; primary: true; enabled: !backend.readOnly && backend.dirty; onClicked: backend.saveEntity() }
                                    }
                                    RowLayout {
                                        Layout.fillWidth: true
                                        spacing: 8
                                        Text { text: "UUID"; color: themeColors.muted; font.pixelSize: 11 }
                                        TextField {
                                            Layout.fillWidth: true
                                            readOnly: true
                                            selectByMouse: true
                                            text: backend.currentUuid
                                            color: themeColors.faint
                                            font.pixelSize: 11
                                            background: Rectangle { radius: 4; color: themeColors.input; border.color: themeColors.border }
                                        }
                                        Text { text: "可复制"; color: themeColors.faint; font.pixelSize: 10 }
                                    }
                                    Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: themeColors.border }

                                    ScrollView {
                                        Layout.fillWidth: true
                                        Layout.fillHeight: true
                                        clip: true
                                        ScrollBar.vertical.policy: ScrollBar.AsNeeded
                                        ColumnLayout {
                                            width: parent.width
                                            spacing: 15
                                            Text { text: "名称"; color: themeColors.muted; font.pixelSize: 12; font.weight: Font.DemiBold }
                                            TextField {
                                                id: nameField
                                                Layout.fillWidth: true
                                                text: backend.currentName
                                                enabled: !backend.readOnly
                                                placeholderText: "词条名称"
                                                color: themeColors.text
                                                placeholderTextColor: themeColors.faint
                                                font.pixelSize: 18
                                                selectByMouse: true
                                                onEditingFinished: backend.setCurrentField("name", text)
                                                background: Rectangle { radius: 5; color: themeColors.input; border.color: nameField.activeFocus ? themeColors.accent : themeColors.border; border.width: nameField.activeFocus ? 2 : 1 }
                                            }
                                            RowLayout {
                                                Layout.fillWidth: true
                                                spacing: 20
                                                ColumnLayout {
                                                    Layout.fillWidth: true
                                                    Text { text: "类型"; color: themeColors.muted; font.pixelSize: 12; font.weight: Font.DemiBold }
                                                    ComboBox {
                                                        id: typeCombo
                                                        Layout.fillWidth: true
                                                        model: backend.typeModelObject
                                                        textRole: "name"
                                                        valueRole: "id"
                                                        currentValue: backend.currentTypeId
                                                        enabled: !backend.readOnly
                                                        onActivated: backend.setCurrentField("typeId", currentValue)
                                                        palette.window: themeColors.panel
                                                        palette.windowText: themeColors.text
                                                        palette.base: themeColors.input
                                                        palette.text: themeColors.text
                                                        palette.button: themeColors.panel
                                                        palette.buttonText: themeColors.text
                                                        palette.highlight: themeColors.accent
                                                        palette.highlightedText: "#ffffff"
                                                        contentItem: Text { leftPadding: 10; rightPadding: 28; text: typeCombo.displayText; color: themeColors.text; verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight }
                                                        background: Rectangle { radius: 5; color: themeColors.input; border.color: typeCombo.activeFocus ? themeColors.accent : themeColors.border }
                                                        delegate: ItemDelegate {
                                                            width: typeCombo.width
                                                            text: model.name
                                                            highlighted: typeCombo.highlightedIndex === index
                                                            hoverEnabled: true
                                                            contentItem: Text { text: parent.text; color: themeColors.text; font.pixelSize: 13; verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight }
                                                            background: Rectangle { color: parent.highlighted ? themeColors.accentSoft : parent.hovered ? themeColors.panelAlt : themeColors.panel }
                                                        }
                                                        popup: Popup {
                                                            y: typeCombo.height - 1
                                                            width: typeCombo.width
                                                            implicitHeight: Math.min(contentItem.implicitHeight + 2, 320)
                                                            padding: 1
                                                            contentItem: ListView {
                                                                clip: true
                                                                implicitHeight: contentHeight
                                                                model: typeCombo.popup.visible ? typeCombo.delegateModel : null
                                                                currentIndex: typeCombo.highlightedIndex
                                                                ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }
                                                            }
                                                            background: Rectangle { radius: 5; color: themeColors.panel; border.color: themeColors.border }
                                                        }
                                                    }
                                                }
                                                ColumnLayout {
                                                    Layout.fillWidth: true
                                                    Text { text: "标签（逗号分隔）"; color: themeColors.muted; font.pixelSize: 12; font.weight: Font.DemiBold }
                                                    TextField {
                                                        id: tagsField
                                                        Layout.fillWidth: true
                                                        text: backend.currentTags
                                                        enabled: !backend.readOnly
                                                        placeholderText: "重要人物, 北境"
                                                        color: themeColors.text
                                                        placeholderTextColor: themeColors.faint
                                                        selectByMouse: true
                                                        onEditingFinished: backend.setCurrentField("tags", text)
                                                        background: Rectangle { radius: 5; color: themeColors.input; border.color: tagsField.activeFocus ? themeColors.accent : themeColors.border }
                                                    }
                                                }
                                            }
                                            Text { text: "简介"; color: themeColors.muted; font.pixelSize: 12; font.weight: Font.DemiBold }
                                            TextArea {
                                                id: summaryField
                                                Layout.fillWidth: true
                                                Layout.preferredHeight: 86
                                                text: backend.currentSummary
                                                enabled: !backend.readOnly
                                                placeholderText: "用一两句话概括这个词条"
                                                color: themeColors.text
                                                placeholderTextColor: themeColors.faint
                                                wrapMode: TextEdit.Wrap
                                                selectByMouse: true
                                                onActiveFocusChanged: if (!activeFocus) backend.setCurrentField("summary", text)
                                                background: Rectangle { radius: 5; color: themeColors.input; border.color: summaryField.activeFocus ? themeColors.accent : themeColors.border }
                                            }
                                            RowLayout {
                                                Layout.fillWidth: true
                                                Text { text: "别名"; color: themeColors.muted; font.pixelSize: 12; font.weight: Font.DemiBold }
                                                Text { text: "逗号分隔"; color: themeColors.faint; font.pixelSize: 11 }
                                            }
                                            TextField {
                                                id: aliasesField
                                                Layout.fillWidth: true
                                                text: backend.currentAliases
                                                enabled: !backend.readOnly
                                                placeholderText: "别名一, 别名二"
                                                color: themeColors.text
                                                placeholderTextColor: themeColors.faint
                                                selectByMouse: true
                                                onEditingFinished: backend.setCurrentField("aliases", text)
                                                background: Rectangle { radius: 5; color: themeColors.input; border.color: aliasesField.activeFocus ? themeColors.accent : themeColors.border }
                                            }
                                            Text { text: "正文"; color: themeColors.muted; font.pixelSize: 12; font.weight: Font.DemiBold }
                                            TextArea {
                                                id: notesField
                                                Layout.fillWidth: true
                                                Layout.preferredHeight: 180
                                                text: backend.currentNotes
                                                enabled: !backend.readOnly
                                                placeholderText: "记录背景、细节和 [[词条 UUID]] 引用..."
                                                color: themeColors.text
                                                placeholderTextColor: themeColors.faint
                                                wrapMode: TextEdit.Wrap
                                                selectByMouse: true
                                                onActiveFocusChanged: if (!activeFocus) backend.setCurrentField("notes", text)
                                                background: Rectangle { radius: 5; color: themeColors.input; border.color: notesField.activeFocus ? themeColors.accent : themeColors.border }
                                            }
                                            RowLayout {
                                                Layout.fillWidth: true
                                                Text { text: "时间记录"; color: themeColors.muted; font.pixelSize: 12; font.weight: Font.DemiBold }
                                                Text { text: backend.dateCount + " 条"; color: themeColors.faint; font.pixelSize: 11 }
                                                Item { Layout.fillWidth: true }
                                                FlatButton {
                                                    text: "＋ 添加日期"
                                                    enabled: !backend.readOnly
                                                    onClicked: {
                                                        dateIdField.text = ""
                                                        dateKindField.text = "custom"
                                                        dateLabelField.text = ""
                                                        dateYearField.text = "0"
                                                        datePrecision.currentIndex = 0
                                                        dateValueField.text = ""
                                                        dateEndYearField.text = ""
                                                        dateEndValueField.text = ""
                                                        dateDialog.open()
                                                    }
                                                }
                                            }
                                            ListView {
                                                id: dateList
                                                Layout.fillWidth: true
                                                Layout.preferredHeight: Math.min(210, Math.max(52, contentHeight))
                                                clip: true
                                                spacing: 2
                                                model: backend.dateModelObject
                                                delegate: ItemDelegate {
                                                    id: dateDelegate
                                                    required property string id
                                                    required property string dateKind
                                                    required property string label
                                                    required property var year
                                                    required property var endYear
                                                    required property string dateText
                                                    required property string endDateText
                                                    required property string precision
                                                    width: dateList.width
                                                    height: 48
                                                    hoverEnabled: true
                                                    background: Rectangle { radius: 4; color: dateDelegate.down ? themeColors.accentSoft : dateDelegate.hovered ? themeColors.panelAlt : "transparent" }
                                                    contentItem: RowLayout {
                                                        spacing: 8
                                                        ColumnLayout {
                                                            Layout.fillWidth: true
                                                            spacing: 2
                                                            Text { Layout.fillWidth: true; text: dateDelegate.label || dateDelegate.dateKind; color: themeColors.text; font.pixelSize: 12; font.weight: Font.Medium; elide: Text.ElideRight }
                                                            Text {
                                                                Layout.fillWidth: true
                                                                text: dateDelegate.year === null || dateDelegate.year === undefined
                                                                      ? (dateDelegate.dateText || "未定年")
                                                                      : root.terraYear(dateDelegate.year) + (dateDelegate.dateText ? " · " + dateDelegate.dateText.replace(/^[+-]?\d{1,6}-?/, "") : "") + (dateDelegate.endYear !== null && dateDelegate.endYear !== undefined ? " 至 " + root.terraYear(dateDelegate.endYear) : "")
                                                                color: themeColors.muted
                                                                font.pixelSize: 10
                                                                elide: Text.ElideRight
                                                            }
                                                        }
                                                        IconButton {
                                                            text: "✎"
                                                            hint: "编辑日期"
                                                            enabled: !backend.readOnly
                                                            onClicked: {
                                                                dateIdField.text = dateDelegate.id
                                                                dateKindField.text = dateDelegate.dateKind
                                                                dateLabelField.text = dateDelegate.label
                                                                dateYearField.text = dateDelegate.year === null || dateDelegate.year === undefined ? "" : String(dateDelegate.year)
                                                                datePrecision.currentIndex = Math.max(0, ["year", "month", "day", "range"].indexOf(dateDelegate.precision))
                                                                dateValueField.text = dateDelegate.dateText
                                                                dateEndYearField.text = dateDelegate.endYear === null || dateDelegate.endYear === undefined ? "" : String(dateDelegate.endYear)
                                                                dateEndValueField.text = dateDelegate.endDateText
                                                                dateDialog.open()
                                                            }
                                                        }
                                                        IconButton { text: "×"; hint: "删除日期"; enabled: !backend.readOnly; onClicked: backend.removeDate(dateDelegate.id) }
                                                    }
                                                }
                                                Text { anchors.centerIn: parent; visible: dateList.count === 0; text: "暂无时间记录"; color: themeColors.faint; font.pixelSize: 11 }
                                            }
                                            RowLayout {
                                                Layout.fillWidth: true
                                                Text { text: "类型属性"; color: themeColors.muted; font.pixelSize: 12; font.weight: Font.DemiBold }
                                                Item { Layout.fillWidth: true }
                                                FlatButton { text: "＋ 添加属性"; enabled: !backend.readOnly; onClicked: openFieldEditor("", "", "text", false, "", "[]") }
                                            }
                                            Repeater {
                                                model: backend.fieldModelObject
                                                delegate: ColumnLayout {
                                                    id: fieldDelegate
                                                    required property string id
                                                    required property string name
                                                    required property string fieldType
                                                    required property bool isRequired
                                                    required property string description
                                                    required property string optionsJson
                                                    required property string valueJson
                                                    required property string valueText
                                                    required property bool isBuiltin
                                                    Layout.fillWidth: true
                                                    spacing: 5
                                                    IntValidator { id: fieldIntegerValidator }
                                                    DoubleValidator { id: fieldNumberValidator; decimals: 8 }
                                                    RowLayout {
                                                        Layout.fillWidth: true
                                                        Text { Layout.fillWidth: true; text: fieldDelegate.name + (fieldDelegate.isRequired ? "  *" : ""); color: themeColors.muted; font.pixelSize: 11; font.weight: Font.DemiBold; elide: Text.ElideRight }
                                                        IconButton {
                                                            visible: !fieldDelegate.isBuiltin && fieldDelegate.id !== ""
                                                            text: "✎"
                                                            hint: "编辑属性定义"
                                                            enabled: !backend.readOnly
                                                            onClicked: openFieldEditor(fieldDelegate.id, fieldDelegate.name, fieldDelegate.fieldType, fieldDelegate.isRequired, fieldDelegate.description, fieldDelegate.optionsJson)
                                                        }
                                                        IconButton {
                                                            visible: !fieldDelegate.isBuiltin && fieldDelegate.id !== ""
                                                            text: "×"
                                                            hint: "删除属性定义"
                                                            enabled: !backend.readOnly
                                                            onClicked: { pendingFieldId = fieldDelegate.id; fieldDeleteDialog.open() }
                                                        }
                                                    }
                                                    Text { Layout.fillWidth: true; visible: fieldDelegate.description !== ""; text: fieldDelegate.description; color: themeColors.faint; font.pixelSize: 10; wrapMode: Text.Wrap }
                                                    TextField {
                                                        Layout.fillWidth: true
                                                        visible: ["text", "string", "integer", "int", "number", "float", "date", "color", "url"].indexOf(fieldDelegate.fieldType) >= 0
                                                        text: fieldDelegate.valueText
                                                        enabled: !backend.readOnly
                                                        placeholderText: fieldDelegate.fieldType === "date" ? "YYYY-MM-DD 或" + backend.eraName + "年份" : "填写" + fieldDelegate.name
                                                        validator: ["integer", "int"].indexOf(fieldDelegate.fieldType) >= 0 ? fieldIntegerValidator : (["number", "float"].indexOf(fieldDelegate.fieldType) >= 0 ? fieldNumberValidator : null)
                                                        color: themeColors.text
                                                        selectByMouse: true
                                                        onEditingFinished: {
                                                            var raw = text
                                                            if (["integer", "int", "number", "float"].indexOf(fieldDelegate.fieldType) < 0) raw = JSON.stringify(text)
                                                            else if (!text.trim()) raw = "null"
                                                            backend.setCustomFieldValue(fieldDelegate.name, raw)
                                                        }
                                                        background: Rectangle { radius: 4; color: themeColors.input; border.color: parent.activeFocus ? themeColors.accent : themeColors.border }
                                                    }
                                                    TextArea {
                                                        Layout.fillWidth: true
                                                        Layout.preferredHeight: 72
                                                        visible: ["textarea", "multiline", "long_text"].indexOf(fieldDelegate.fieldType) >= 0
                                                        text: fieldDelegate.valueText
                                                        enabled: !backend.readOnly
                                                        color: themeColors.text
                                                        placeholderText: "填写" + fieldDelegate.name
                                                        wrapMode: TextEdit.Wrap
                                                        selectByMouse: true
                                                        onActiveFocusChanged: if (!activeFocus) backend.setCustomFieldValue(fieldDelegate.name, JSON.stringify(text))
                                                        background: Rectangle { radius: 4; color: themeColors.input; border.color: parent.activeFocus ? themeColors.accent : themeColors.border }
                                                    }
                                                    TextArea {
                                                        Layout.fillWidth: true
                                                        Layout.preferredHeight: 90
                                                        visible: ["json", "entity_refs", "entity_list", "multi_entity", "multiselect"].indexOf(fieldDelegate.fieldType) >= 0
                                                        text: fieldDelegate.valueJson
                                                        enabled: !backend.readOnly
                                                        color: themeColors.text
                                                        font.family: "Cascadia Code, Consolas, monospace"
                                                        font.pixelSize: 11
                                                        placeholderText: fieldDelegate.fieldType === "json" ? "{} 或 []" : "以 JSON 数组填写引用 ID"
                                                        wrapMode: TextEdit.Wrap
                                                        selectByMouse: true
                                                        onActiveFocusChanged: if (!activeFocus && text.trim()) backend.setCustomFieldValue(fieldDelegate.name, text)
                                                        background: Rectangle { radius: 4; color: themeColors.input; border.color: parent.activeFocus ? themeColors.accent : themeColors.border }
                                                    }
                                                    ComboBox {
                                                        id: referenceField
                                                        Layout.fillWidth: true
                                                        visible: ["entity", "entity_ref", "entity_reference"].indexOf(fieldDelegate.fieldType) >= 0
                                                        model: backend.relationTargetModelObject
                                                        textRole: "displayName"
                                                        valueRole: "id"
                                                        currentValue: fieldDelegate.valueText
                                                        enabled: !backend.readOnly
                                                        contentItem: Text { leftPadding: 9; rightPadding: 24; text: referenceField.displayText; color: themeColors.text; verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight }
                                                        background: Rectangle { radius: 4; color: themeColors.input; border.color: themeColors.border }
                                                        delegate: ItemDelegate {
                                                            required property string displayName
                                                            required property int index
                                                            width: referenceField.width
                                                            highlighted: referenceField.highlightedIndex === index
                                                            hoverEnabled: true
                                                            contentItem: Text { text: displayName; color: themeColors.text; font.pixelSize: 12; verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight }
                                                            background: Rectangle { color: parent.highlighted ? themeColors.accentSoft : parent.hovered ? themeColors.panelAlt : themeColors.panel }
                                                        }
                                                        popup: Popup {
                                                            y: referenceField.height - 1
                                                            width: referenceField.width
                                                            implicitHeight: Math.min(contentItem.implicitHeight + 2, 300)
                                                            padding: 1
                                                            contentItem: ListView { clip: true; implicitHeight: contentHeight; model: referenceField.popup.visible ? referenceField.delegateModel : null; currentIndex: referenceField.highlightedIndex; ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded } }
                                                            background: Rectangle { radius: 4; color: themeColors.panel; border.color: themeColors.border }
                                                        }
                                                        onActivated: backend.setCustomFieldValue(fieldDelegate.name, JSON.stringify(currentValue))
                                                    }
                                                    ComboBox {
                                                        id: choiceField
                                                        Layout.fillWidth: true
                                                        visible: ["choice", "select"].indexOf(fieldDelegate.fieldType) >= 0
                                                        model: JSON.parse(fieldDelegate.optionsJson || "[]")
                                                        currentIndex: model.indexOf(fieldDelegate.valueText)
                                                        enabled: !backend.readOnly
                                                        contentItem: Text { leftPadding: 9; text: choiceField.displayText; color: themeColors.text; verticalAlignment: Text.AlignVCenter }
                                                        background: Rectangle { radius: 4; color: themeColors.input; border.color: themeColors.border }
                                                        delegate: ItemDelegate {
                                                            width: choiceField.width
                                                            text: modelData
                                                            highlighted: choiceField.highlightedIndex === index
                                                            hoverEnabled: true
                                                            contentItem: Text { text: parent.text; color: themeColors.text; font.pixelSize: 12; verticalAlignment: Text.AlignVCenter }
                                                            background: Rectangle { color: parent.highlighted ? themeColors.accentSoft : parent.hovered ? themeColors.panelAlt : themeColors.panel }
                                                        }
                                                        popup: Popup {
                                                            y: choiceField.height - 1
                                                            width: choiceField.width
                                                            implicitHeight: Math.min(contentItem.implicitHeight + 2, 240)
                                                            padding: 1
                                                            contentItem: ListView { clip: true; implicitHeight: contentHeight; model: choiceField.popup.visible ? choiceField.delegateModel : null; currentIndex: choiceField.highlightedIndex; ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded } }
                                                            background: Rectangle { radius: 4; color: themeColors.panel; border.color: themeColors.border }
                                                        }
                                                        onActivated: backend.setCustomFieldValue(fieldDelegate.name, JSON.stringify(currentText))
                                                    }
                                                    CheckBox {
                                                        visible: ["boolean", "bool"].indexOf(fieldDelegate.fieldType) >= 0
                                                        text: "是"
                                                        checked: fieldDelegate.valueJson === "true"
                                                        enabled: !backend.readOnly
                                                        onToggled: backend.setCustomFieldValue(fieldDelegate.name, String(checked))
                                                        palette.text: themeColors.text
                                                    }
                                                    Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: themeColors.border; opacity: 0.55 }
                                                }
                                            }
                                            Text { text: backend.currentUpdatedAt ? "最后修改：" + backend.currentUpdatedAt : "新建词条"; color: themeColors.faint; font.pixelSize: 11; Layout.bottomMargin: 12 }
                                        }
                                    }
                                }

                                ColumnLayout {
                                    anchors.centerIn: parent
                                    width: Math.min(parent.width - 64, 440)
                                    spacing: 14
                                    visible: !backend.hasProject || backend.currentEntityId === ""
                                    Text { text: !backend.hasProject ? "开始构建你的世界" : "选择一个词条"; color: themeColors.text; font.pixelSize: 23; font.weight: Font.DemiBold }
                                    Text {
                                        Layout.fillWidth: true
                                        text: !backend.hasProject ? "打开已有项目，或创建一个新的本地世界观数据库。" : "从左侧列表选择词条查看和编辑，或创建一个新的通用词条。"
                                        color: themeColors.muted
                                        font.pixelSize: 14
                                        wrapMode: Text.Wrap
                                    }
                                    RowLayout {
                                        spacing: 9
                                        visible: !backend.hasProject
                                        FlatButton { text: "打开项目"; primary: true; onClicked: backend.chooseAndOpenProject() }
                                        FlatButton { text: "新建项目"; onClicked: backend.chooseAndCreateProject() }
                                    }
                                    FlatButton { text: "＋  新建词条"; visible: backend.hasProject; enabled: !backend.readOnly; primary: true; onClicked: backend.newEntity() }
                                }
                            }

                            Rectangle {
                                Layout.preferredWidth: 280
                                Layout.fillHeight: true
                                color: themeColors.panel
                                border.color: themeColors.border
                                border.width: 1
                                visible: backend.hasProject && backend.currentEntityId !== "" && root.width >= 1180

                                ColumnLayout {
                                    anchors.fill: parent
                                    anchors.margins: 18
                                    spacing: 12
                                    RowLayout {
                                        Layout.fillWidth: true
                                        Text { text: "关联词条"; color: themeColors.text; font.pixelSize: 15; font.weight: Font.DemiBold }
                                        Item { Layout.fillWidth: true }
                                        Text { text: backend.relationCount; color: themeColors.muted; font.pixelSize: 12 }
                                        IconButton { text: "＋"; hint: "添加关联"; enabled: !backend.readOnly && !backend.dirty; onClicked: { backend.prepareRelation(""); relationDialog.open() } }
                                    }
                                    Text { Layout.fillWidth: true; text: "与「" + backend.currentName + "」有关联的内容"; color: themeColors.muted; font.pixelSize: 11; elide: Text.ElideRight }
                                    Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: themeColors.border }
                                    ListView {
                                        id: relationList
                                        Layout.fillWidth: true
                                        Layout.fillHeight: true
                                        model: backend.relationModelObject
                                        clip: true
                                        spacing: 4
                                        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }
                                        delegate: ItemDelegate {
                                            id: relationDelegate
                                            required property string id
                                            required property string otherId
                                            required property string otherName
                                            required property string label
                                            required property string direction
                                            required property string reverseLabel
                                            required property string notes
                                            width: relationList.width
                                            height: 66
                                            hoverEnabled: true
                                            onClicked: { backend.previewEntity(otherId); previewDialog.open() }
                                            background: Rectangle { radius: 5; color: relationDelegate.down ? themeColors.accentSoft : relationDelegate.hovered ? themeColors.panelAlt : "transparent" }
                                            contentItem: RowLayout {
                                                spacing: 5
                                                ColumnLayout {
                                                    Layout.fillWidth: true
                                                    spacing: 3
                                                    Text { Layout.fillWidth: true; text: relationDelegate.label + (relationDelegate.direction === "in" ? "  ·  反向" : ""); color: themeColors.accent; font.pixelSize: 10; elide: Text.ElideRight }
                                                    Text { Layout.fillWidth: true; text: relationDelegate.otherName; color: themeColors.text; font.pixelSize: 12; font.weight: Font.Medium; elide: Text.ElideRight }
                                                }
                                                IconButton { text: "✎"; hint: "编辑关联"; enabled: !backend.readOnly && !backend.dirty; onClicked: { backend.prepareRelation(relationDelegate.id); relationDialog.open() } }
                                                IconButton { text: "×"; hint: "删除关联"; enabled: !backend.readOnly && !backend.dirty; onClicked: { pendingRelationId = relationDelegate.id; relationDeleteDialog.open() } }
                                            }
                                        }
                                        Text { anchors.centerIn: parent; visible: relationList.count === 0; text: "暂无关联"; color: themeColors.faint; font.pixelSize: 12 }
                                    }
                                }
                            }
                        }
                    }
                }

                GlassPanel {
                    tint: themeColors.glassClear
                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 28
                        spacing: 18
                        RowLayout {
                            Layout.fillWidth: true
                            ColumnLayout {
                                spacing: 4
                                Text { text: "世界时间线"; color: themeColors.text; font.pixelSize: 21; font.weight: Font.DemiBold }
                                Text { text: backend.timelineBoundsText; color: themeColors.muted; font.pixelSize: 12 }
                            }
                            Item { Layout.fillWidth: true }
                            ComboBox {
                                id: timelineTypeFilter
                                Layout.preferredWidth: 160
                                Layout.preferredHeight: 34
                                model: backend.typeModelObject
                                textRole: "name"
                                valueRole: "id"
                                currentValue: backend.timelineTypeFilter
                                contentItem: Text { leftPadding: 9; rightPadding: 22; text: backend.timelineTypeFilter ? timelineTypeFilter.displayText : "全部类型"; color: themeColors.text; verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight }
                                background: Rectangle { radius: 4; color: themeColors.input; border.color: themeColors.border }
                                delegate: ItemDelegate {
                                    required property string name
                                    required property int index
                                    width: timelineTypeFilter.width
                                    highlighted: timelineTypeFilter.highlightedIndex === index
                                    hoverEnabled: true
                                    contentItem: Text { text: name; color: themeColors.text; font.pixelSize: 12; verticalAlignment: Text.AlignVCenter }
                                    background: Rectangle { color: parent.highlighted ? themeColors.accentSoft : parent.hovered ? themeColors.panelAlt : themeColors.panel }
                                }
                                popup: Popup {
                                    y: timelineTypeFilter.height - 1
                                    width: timelineTypeFilter.width
                                    implicitHeight: Math.min(contentItem.implicitHeight + 2, 300)
                                    padding: 1
                                    contentItem: ListView { clip: true; implicitHeight: contentHeight; model: timelineTypeFilter.popup.visible ? timelineTypeFilter.delegateModel : null; currentIndex: timelineTypeFilter.highlightedIndex; ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded } }
                                    background: Rectangle { radius: 4; color: themeColors.panel; border.color: themeColors.border }
                                }
                                onActivated: backend.setTimelineTypeFilter(currentValue)
                            }
                            IconButton { visible: backend.timelineTypeFilter !== ""; text: "×"; hint: "清除类型筛选"; onClicked: backend.setTimelineTypeFilter("") }
                            Text { text: backend.timelineCount + " 条"; color: themeColors.muted; font.pixelSize: 12 }
                            Rectangle { Layout.preferredWidth: 1; Layout.preferredHeight: 24; color: themeColors.border }
                            IconButton { text: "−"; hint: "缩小时间尺度"; onClicked: timelineViewport.timelineScale = Math.max(0.6, timelineViewport.timelineScale - 0.2) }
                            FlatButton {
                                text: Math.round(timelineViewport.timelineScale * 100) + "%"
                                onClicked: timelineViewport.timelineScale = Math.max(0.6, timelineViewport.width / 1200)
                            }
                            IconButton { text: "+"; hint: "放大时间尺度"; onClicked: timelineViewport.timelineScale = Math.min(5, timelineViewport.timelineScale + 0.2) }
                        }
                        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: themeColors.border }
                        Flickable {
                            id: timelineViewport
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            clip: true
                            property real timelineScale: 1
                            contentWidth: Math.max(width, 1200 * timelineScale)
                            contentHeight: Math.max(height, 390)
                            boundsBehavior: Flickable.StopAtBounds
                            GlassPanel {
                                id: timelineSurface
                                width: timelineViewport.contentWidth
                                height: timelineViewport.contentHeight
                                tint: themeColors.glassInset
                                radius: 7
                                Canvas {
                                    id: timelineCanvas
                                    anchors.fill: parent
                                    onPaint: {
                                        var ctx = getContext("2d")
                                        ctx.clearRect(0, 0, width, height)
                                        var axisY = 68
                                        ctx.strokeStyle = root.darkMode ? "#557066" : "#9fb5ad"
                                        ctx.lineWidth = 2
                                        ctx.beginPath(); ctx.moveTo(50, axisY); ctx.lineTo(width - 50, axisY); ctx.stroke()
                                        var minYear = Number(backend.timelineMinYear)
                                        var maxYear = Number(backend.timelineMaxYear)
                                        var tickCount = Math.max(6, Math.min(24, Math.floor(width / 180)))
                                        for (var i = 0; i <= tickCount; ++i) {
                                            var value = minYear + (maxYear - minYear) * i / tickCount
                                            var x = 70 + (width - 150) * i / tickCount
                                            ctx.strokeStyle = root.darkMode ? "#334942" : "#d5e0dc"
                                            ctx.lineWidth = 1
                                            ctx.beginPath(); ctx.moveTo(x, axisY - 8); ctx.lineTo(x, height - 26); ctx.stroke()
                                            ctx.fillStyle = root.darkMode ? "#a9beb7" : "#60736d"
                                            ctx.font = "11px sans-serif"
                                            ctx.fillText(root.terraYear(Math.round(value)), x - 34, axisY - 14)
                                        }
                                    }
                                }
                                Repeater {
                                    id: timelineRepeater
                                    model: backend.timelineModelObject
                                    delegate: Item {
                                        objectName: "timelineEvent"
                                        required property int index
                                        required property string entityId
                                        required property string name
                                        required property string label
                                        required property string dateKind
                                        required property string dateText
                                        required property var year
                                        required property var endYear
                                        property int lane: index % 4
                                        width: 190
                                        height: 78
                                        x: root.timelineX(year, timelineSurface.width) - width / 2
                                        y: 92 + lane * 82
                                        Rectangle {
                                            anchors.fill: parent
                                            radius: 6
                                            color: eventMouse.containsMouse ? themeColors.accentSoft : themeColors.panel
                                            border.color: themeColors.accent
                                            border.width: 1
                                        }
                                        Rectangle {
                                            width: 10; height: 10; radius: 5
                                            anchors.horizontalCenter: parent.horizontalCenter
                                            anchors.top: parent.top; anchors.topMargin: -29
                                            color: themeColors.accent
                                            border.color: themeColors.panelAlt; border.width: 2
                                        }
                                        Column {
                                            anchors.fill: parent; anchors.margins: 9; spacing: 3
                                            Text { width: parent.width; text: name; color: themeColors.text; font.pixelSize: 12; font.weight: Font.DemiBold; elide: Text.ElideRight }
                                            Text { width: parent.width; text: label || dateKind || "未命名日期"; color: themeColors.accent; font.pixelSize: 11; elide: Text.ElideRight }
                                            Text { width: parent.width; text: year === null || year === undefined ? (dateText || "未定年") : root.terraYear(year) + (endYear !== null && endYear !== undefined && endYear !== year ? " 至 " + root.terraYear(endYear) : ""); color: themeColors.muted; font.pixelSize: 10; elide: Text.ElideRight }
                                        }
                                        MouseArea {
                                            id: eventMouse
                                            anchors.fill: parent
                                            hoverEnabled: true
                                            cursorShape: Qt.PointingHandCursor
                                            onClicked: { backend.previewEntity(entityId); previewDialog.open() }
                                            onDoubleClicked: { root.page = "entries"; backend.openRelation(entityId); previewDialog.close() }
                                        }
                                    }
                                }
                                Text { anchors.centerIn: parent; visible: backend.timelineCount === 0; text: backend.hasProject ? "暂无已记录的日期" : "打开项目后查看时间线"; color: themeColors.muted; font.pixelSize: 13 }
                            }
                            ScrollBar.horizontal: ScrollBar { policy: ScrollBar.AsNeeded }
                            ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }
                        }
                    }
                }

                GlassPanel {
                    tint: themeColors.glassClear
                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 26
                        spacing: 14
                        RowLayout {
                            Layout.fillWidth: true
                            ColumnLayout {
                                spacing: 3
                                Text { text: "关系网络"; color: themeColors.text; font.pixelSize: 20; font.weight: Font.DemiBold }
                                Text { text: backend.graphScope === "all" ? "完整关系网 · 拖动节点调整布局，双击预览词条" : "当前词条的直接关联 · 双击预览词条"; color: themeColors.muted; font.pixelSize: 12; elide: Text.ElideRight }
                            }
                            Item { Layout.fillWidth: true }
                            FlatButton { text: "全网"; primary: backend.graphScope === "all"; onClicked: backend.setGraphScope("all") }
                            FlatButton { text: "当前词条"; primary: backend.graphScope === "neighbors"; enabled: backend.currentEntityId !== ""; onClicked: backend.setGraphScope("neighbors") }
                            Text { text: backend.graphCount + " 个词条"; color: themeColors.muted; font.pixelSize: 12 }
                            FlatButton { text: "添加关联"; enabled: backend.currentEntityId !== "" && !backend.readOnly && !backend.dirty; onClicked: { backend.prepareRelation(""); relationDialog.open() } }
                            IconButton { text: "⇩"; hint: "导出关系图 PNG"; enabled: backend.graphCount > 0; onClicked: backend.chooseAndExportGraph() }
                        }
                        GlassPanel {
                            id: graphSurface
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            tint: themeColors.glassInset
                            radius: 5
                            clip: true
                            property real graphScale: 1
                            property real floatPhase: 0
                            onFloatPhaseChanged: graphCanvas.requestPaint()
                            NumberAnimation on floatPhase {
                                from: 0
                                to: Math.PI * 2
                                duration: 14000
                                loops: Animation.Infinite
                                running: root.visible && root.page === "graph" && backend.graphCount > 0
                            }
                            Canvas {
                                id: graphCanvas
                                anchors.fill: parent
                                onPaint: {
                                    var ctx = getContext("2d")
                                    ctx.clearRect(0, 0, width, height)
                                    var layout = JSON.parse(backend.graphLayoutJson || '{"nodes":[],"edges":[]}')
                                    ctx.strokeStyle = root.darkMode ? "#53665f" : "#aabbb3"
                                    ctx.lineWidth = 1.5
                                    for (var i = 0; i < layout.edges.length; ++i) {
                                        var edge = layout.edges[i]
                                        var sourceNode = graphRepeater.itemAt(edge.source)
                                        var targetNode = graphRepeater.itemAt(edge.target)
                                        if (!sourceNode || !targetNode) continue
                                        var sourcePoint = sourceNode.mapToItem(graphSurface, sourceNode.width / 2, sourceNode.height / 2)
                                        var targetPoint = targetNode.mapToItem(graphSurface, targetNode.width / 2, targetNode.height / 2)
                                        var sourceX = sourcePoint.x
                                        var sourceY = sourcePoint.y
                                        var targetX = targetPoint.x
                                        var targetY = targetPoint.y
                                        ctx.beginPath()
                                        ctx.moveTo(sourceX, sourceY)
                                        ctx.lineTo(targetX, targetY)
                                        ctx.stroke()
                                        if (edge.label) {
                                            ctx.fillStyle = root.darkMode ? "#b7c9c2" : "#63766f"
                                            ctx.font = "10px sans-serif"
                                            ctx.fillText(edge.label, (sourceX + targetX) / 2 + 4, (sourceY + targetY) / 2 - 4)
                                        }
                                    }
                                }
                            }
                            Repeater {
                                id: graphRepeater
                                model: backend.graphModelObject
                                delegate: Rectangle {
                                    id: graphNode
                                    required property int index
                                    required property string id
                                    required property string name
                                    required property string typeName
                                    required property string nodeColor
                                    required property real positionX
                                    required property real positionY
                                    required property bool isCenter
                                    width: Math.min(190, Math.max(132, graphSurface.width * 0.22))
                                    height: isCenter ? 70 : 62
                                    x: graphSurface.width / 2 + (graphSurface.width * positionX - graphSurface.width / 2) * graphSurface.graphScale - width / 2
                                    y: graphSurface.height / 2 + (graphSurface.height * positionY - graphSurface.height / 2) * graphSurface.graphScale - height / 2
                                    radius: 5
                                    color: isCenter ? themeColors.accentSoft : themeColors.panel
                                    border.width: isCenter ? 2 : 1
                                    border.color: isCenter ? themeColors.accent : nodeColor
                                    transform: Translate {
                                        x: Math.sin(graphSurface.floatPhase + graphNode.index * 1.73) * (graphNode.isCenter ? 2.2 : 4.2)
                                        y: Math.cos(graphSurface.floatPhase * 0.82 + graphNode.index * 2.11) * (graphNode.isCenter ? 1.8 : 3.4)
                                    }
                                    onXChanged: graphCanvas.requestPaint()
                                    onYChanged: graphCanvas.requestPaint()
                                    Column {
                                        anchors.fill: parent
                                        anchors.margins: 10
                                        spacing: 4
                                        Text { width: parent.width; text: name; color: themeColors.text; font.pixelSize: 12; font.weight: Font.DemiBold; elide: Text.ElideRight; horizontalAlignment: Text.AlignHCenter }
                                        Text { width: parent.width; text: isCenter ? "当前词条" : typeName; color: isCenter ? themeColors.accent : themeColors.muted; font.pixelSize: 10; elide: Text.ElideRight; horizontalAlignment: Text.AlignHCenter }
                                    }
                                    MouseArea {
                                        anchors.fill: parent
                                        cursorShape: Qt.PointingHandCursor
                                        drag.target: graphNode
                                        drag.minimumX: 0
                                        drag.maximumX: graphSurface.width - graphNode.width
                                        drag.minimumY: 0
                                        drag.maximumY: graphSurface.height - graphNode.height
                                        onDoubleClicked: { backend.previewEntity(id); previewDialog.open() }
                                        onClicked: if (mouse.modifiers & Qt.ControlModifier) backend.selectEntity(id)
                                    }
                                }
                            }
                            Row {
                                anchors.right: parent.right
                                anchors.top: parent.top
                                anchors.margins: 10
                                spacing: 5
                                FlatButton { text: "−"; onClicked: graphSurface.graphScale = Math.max(0.55, graphSurface.graphScale - 0.15) }
                                FlatButton { text: "适合"; onClicked: graphSurface.graphScale = 1 }
                                FlatButton { text: "+"; onClicked: graphSurface.graphScale = Math.min(2.2, graphSurface.graphScale + 0.15) }
                            }
                            Text { anchors.centerIn: parent; visible: backend.graphCount === 0; text: backend.hasProject ? "此项目还没有可展示的词条或关联" : "打开项目后查看关系网络"; color: themeColors.muted; font.pixelSize: 13 }
                        }
                    }
                    Connections { target: backend; function onGraphChanged() { graphCanvas.requestPaint() } }
                }

                GlassPanel {
                    tint: themeColors.glassClear
                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 28
                        spacing: 14
                        RowLayout {
                            Layout.fillWidth: true
                            ColumnLayout {
                                spacing: 3
                                Text { text: "数据校验"; color: themeColors.text; font.pixelSize: 20; font.weight: Font.DemiBold }
                                Text { text: "检查关系端点、别名和词条引用等数据完整性"; color: themeColors.muted; font.pixelSize: 12 }
                            }
                            Item { Layout.fillWidth: true }
                            Text { text: backend.validationCount ? "发现 " + backend.validationCount + " 项" : "数据正常"; color: backend.validationCount ? themeColors.warning : themeColors.accent; font.pixelSize: 12; font.weight: Font.DemiBold }
                            FlatButton { text: "重新检查"; enabled: backend.hasProject; onClicked: backend.refresh() }
                        }
                        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: themeColors.border }
                        ListView {
                            id: validationList
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            model: backend.validationModelObject
                            clip: true
                            spacing: 3
                            ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }
                            delegate: ItemDelegate {
                                id: validationDelegate
                                required property string kind
                                required property string message
                                required property string entityId
                                required property string relationId
                                width: validationList.width
                                height: 58
                                hoverEnabled: true
                                onClicked: { root.page = "entries"; backend.openValidationIssue(entityId, relationId) }
                                background: Rectangle { radius: 4; color: validationDelegate.down ? themeColors.accentSoft : validationDelegate.hovered ? themeColors.panelAlt : "transparent" }
                                contentItem: RowLayout {
                                    spacing: 12
                                    Rectangle { Layout.preferredWidth: 4; Layout.preferredHeight: 34; radius: 2; color: themeColors.warning }
                                    ColumnLayout {
                                        Layout.fillWidth: true
                                        spacing: 3
                                        Text { Layout.fillWidth: true; text: validationDelegate.message; color: themeColors.text; font.pixelSize: 12; elide: Text.ElideRight }
                                        Text { Layout.fillWidth: true; text: validationDelegate.kind; color: themeColors.faint; font.pixelSize: 10; elide: Text.ElideRight }
                                    }
                                    Text { text: validationDelegate.entityId ? "打开词条  ›" : "查看  ›"; color: themeColors.accent; font.pixelSize: 11 }
                                }
                            }
                            Text { anchors.centerIn: parent; visible: backend.hasProject && validationList.count === 0; text: "未发现数据完整性问题"; color: themeColors.muted; font.pixelSize: 13 }
                        }
                    }
                }

                GlassPanel {
                    id: settingsPage
                    tint: themeColors.glassClear
                    onVisibleChanged: if (visible && backend.hasProject) {
                        settingsNameField.text = backend.projectName
                        settingsEraField.text = backend.eraName
                        settingsAuthorField.text = backend.projectAuthor
                        settingsDescriptionField.text = backend.projectDescription
                    }
                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 32
                        spacing: 18
                        RowLayout {
                            Layout.fillWidth: true
                            ColumnLayout {
                                spacing: 4
                                Text { text: "资料库设置"; color: themeColors.text; font.pixelSize: 21; font.weight: Font.DemiBold }
                                Text { text: "这些参数保存在当前 .aethercod 文件中，并随 JSON 导出。"; color: themeColors.muted; font.pixelSize: 12 }
                            }
                            Item { Layout.fillWidth: true }
                            FlatButton {
                                text: "保存设置"
                                primary: true
                                enabled: backend.hasProject && !backend.readOnly
                                onClicked: backend.updateProjectSettings(settingsNameField.text, settingsEraField.text, settingsAuthorField.text, settingsDescriptionField.text)
                            }
                        }
                        Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: themeColors.border }
                        GridLayout {
                            Layout.fillWidth: true
                            Layout.maximumWidth: 820
                            columns: 2
                            columnSpacing: 18
                            rowSpacing: 14
                            Text { text: "资料库名称"; color: themeColors.muted; font.pixelSize: 12 }
                            TextField { id: settingsNameField; Layout.fillWidth: true; placeholderText: "例如：北境纪事"; color: themeColors.text; background: Rectangle { radius: 4; color: themeColors.input; border.color: settingsNameField.activeFocus ? themeColors.accent : themeColors.border } }
                            Text { text: "纪年法名称"; color: themeColors.muted; font.pixelSize: 12 }
                            TextField { id: settingsEraField; Layout.fillWidth: true; placeholderText: "例如：泰拉纪元"; color: themeColors.text; background: Rectangle { radius: 4; color: themeColors.input; border.color: settingsEraField.activeFocus ? themeColors.accent : themeColors.border } }
                            Text { text: "创作者 / 整理者"; color: themeColors.muted; font.pixelSize: 12 }
                            TextField { id: settingsAuthorField; Layout.fillWidth: true; placeholderText: "可选"; color: themeColors.text; background: Rectangle { radius: 4; color: themeColors.input; border.color: settingsAuthorField.activeFocus ? themeColors.accent : themeColors.border } }
                            Text { text: "资料库说明"; color: themeColors.muted; font.pixelSize: 12; Layout.alignment: Qt.AlignTop; topPadding: 9 }
                            TextArea { id: settingsDescriptionField; Layout.fillWidth: true; Layout.preferredHeight: 120; placeholderText: "世界设定范围、创作目的或版本说明"; color: themeColors.text; wrapMode: TextEdit.Wrap; background: Rectangle { radius: 4; color: themeColors.input; border.color: settingsDescriptionField.activeFocus ? themeColors.accent : themeColors.border } }
                            Text { text: "文件位置"; color: themeColors.muted; font.pixelSize: 12 }
                            TextField { Layout.fillWidth: true; readOnly: true; selectByMouse: true; text: backend.projectPath; color: themeColors.faint; background: Rectangle { radius: 4; color: themeColors.input; border.color: themeColors.border } }
                        }
                        GlassPanel {
                            Layout.fillWidth: true
                            Layout.maximumWidth: 820
                            Layout.preferredHeight: 76
                            tint: themeColors.glassInset
                            radius: 6
                            RowLayout {
                                anchors.fill: parent
                                anchors.margins: 14
                                ColumnLayout {
                                    Layout.fillWidth: true
                                    spacing: 3
                                    Text { text: "纪年预览"; color: themeColors.faint; font.pixelSize: 10 }
                                    Text { text: (settingsEraField.text || "纪元") + "前 42 年  ·  " + (settingsEraField.text || "纪元") + " 125 年"; color: themeColors.text; font.pixelSize: 13 }
                                }
                                FlatButton { text: "备份资料库"; enabled: backend.hasProject && !backend.dirty; onClicked: backend.chooseAndBackupProject() }
                            }
                        }
                        Item { Layout.fillHeight: true }
                    }
                }
            }
        }

        GlassPanel {
            Layout.fillWidth: true
            Layout.preferredHeight: 30
            radius: 8
            tint: themeColors.header
            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 16
                anchors.rightMargin: 16
                Text { Layout.fillWidth: true; text: backend.statusMessage; color: themeColors.muted; font.pixelSize: 11; elide: Text.ElideRight }
                Text { text: backend.hasProject ? (backend.readOnly ? "只读" : "本地数据库") : ""; color: themeColors.faint; font.pixelSize: 11 }
            }
        }
    }

    Dialog {
        id: newProjectDialog
        objectName: "newProjectDialog"
        modal: true
        padding: 16
        title: "创建资料库"
        header: DialogHeader { titleText: newProjectDialog.title }
        standardButtons: Dialog.NoButton
        anchors.centerIn: parent
        width: Math.min(root.width - 48, 600)
        background: GlassPanel { radius: 12; tint: themeColors.dialog }
        contentItem: ColumnLayout {
            spacing: 12
            RowLayout {
                Layout.fillWidth: true
                spacing: 12
                ColumnLayout {
                    Layout.fillWidth: true
                    Text { text: "资料库名称"; color: themeColors.muted; font.pixelSize: 11 }
                    TextField { id: newProjectName; Layout.fillWidth: true; placeholderText: "例如：北境纪事"; color: themeColors.text; background: Rectangle { radius: 4; color: themeColors.input; border.color: newProjectName.activeFocus ? themeColors.accent : themeColors.border } }
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    Text { text: "纪年法名称"; color: themeColors.muted; font.pixelSize: 11 }
                    TextField { id: newProjectEra; Layout.fillWidth: true; placeholderText: "例如：泰拉纪元"; color: themeColors.text; background: Rectangle { radius: 4; color: themeColors.input; border.color: newProjectEra.activeFocus ? themeColors.accent : themeColors.border } }
                }
            }
            ColumnLayout {
                Layout.fillWidth: true
                Text { text: "创作者 / 整理者"; color: themeColors.muted; font.pixelSize: 11 }
                TextField { id: newProjectAuthor; Layout.fillWidth: true; placeholderText: "可选"; color: themeColors.text; background: Rectangle { radius: 4; color: themeColors.input; border.color: newProjectAuthor.activeFocus ? themeColors.accent : themeColors.border } }
            }
            ColumnLayout {
                Layout.fillWidth: true
                Text { text: "资料库说明"; color: themeColors.muted; font.pixelSize: 11 }
                TextArea { id: newProjectDescription; Layout.fillWidth: true; Layout.preferredHeight: 92; placeholderText: "世界设定范围、题材或当前版本说明"; color: themeColors.text; wrapMode: TextEdit.Wrap; background: Rectangle { radius: 4; color: themeColors.input; border.color: newProjectDescription.activeFocus ? themeColors.accent : themeColors.border } }
            }
            Text { Layout.fillWidth: true; text: "下一步将选择 .aethercod 文件的保存位置。"; color: themeColors.faint; font.pixelSize: 10 }
        }
        footer: DialogActions {
            FlatButton { text: "取消"; onClicked: newProjectDialog.close() }
            FlatButton {
                text: "选择位置并创建"
                primary: true
                enabled: newProjectName.text.trim().length > 0 && newProjectEra.text.trim().length > 0
                onClicked: {
                    if (backend.chooseAndCreateProjectWithSettings(newProjectName.text, newProjectEra.text, newProjectAuthor.text, newProjectDescription.text)) {
                        newProjectDialog.close()
                        root.page = "entries"
                    }
                }
            }
        }
    }

    Dialog {
        id: fieldDefinitionDialog
        modal: true
        padding: 16
        title: fieldIdInput.text ? "编辑属性定义" : "添加属性定义"
        header: DialogHeader { titleText: fieldDefinitionDialog.title }
        standardButtons: Dialog.NoButton
        anchors.centerIn: parent
        width: Math.min(root.width - 48, 520)
        background: GlassPanel { radius: 12; tint: themeColors.dialog }
        contentItem: ColumnLayout {
            spacing: 10
            TextField { id: fieldIdInput; visible: false }
            ColumnLayout {
                Layout.fillWidth: true
                Text { text: "属性名称"; color: themeColors.muted; font.pixelSize: 11 }
                TextField { id: fieldNameInput; Layout.fillWidth: true; placeholderText: "例如：家族、信仰、来源"; color: themeColors.text; background: Rectangle { radius: 4; color: themeColors.input; border.color: themeColors.border } }
            }
            ColumnLayout {
                Layout.fillWidth: true
                Text { text: "数据类型"; color: themeColors.muted; font.pixelSize: 11 }
                ComboBox {
                    id: fieldTypeCombo
                    Layout.fillWidth: true
                    textRole: "label"
                    valueRole: "value"
                    model: ListModel {
                        ListElement { label: "短文本"; value: "text" }
                        ListElement { label: "多行文本"; value: "textarea" }
                        ListElement { label: "整数"; value: "integer" }
                        ListElement { label: "数字"; value: "number" }
                        ListElement { label: "布尔"; value: "boolean" }
                        ListElement { label: "枚举选择"; value: "choice" }
                        ListElement { label: "纪年日期"; value: "date" }
                        ListElement { label: "JSON"; value: "json" }
                        ListElement { label: "词条引用 ID"; value: "entity_ref" }
                        ListElement { label: "词条引用列表"; value: "entity_refs" }
                    }
                    contentItem: Text { leftPadding: 10; text: fieldTypeCombo.displayText; color: themeColors.text; verticalAlignment: Text.AlignVCenter }
                    background: Rectangle { radius: 4; color: themeColors.input; border.color: themeColors.border }
                    delegate: ItemDelegate {
                        required property string label
                        required property int index
                        width: fieldTypeCombo.width
                        highlighted: fieldTypeCombo.highlightedIndex === index
                        contentItem: Text { text: label; color: themeColors.text; font.pixelSize: 12; verticalAlignment: Text.AlignVCenter }
                        background: Rectangle { color: parent.highlighted ? themeColors.accentSoft : parent.hovered ? themeColors.panelAlt : themeColors.panel }
                    }
                    popup: Popup {
                        y: fieldTypeCombo.height - 1
                        width: fieldTypeCombo.width
                        implicitHeight: Math.min(contentItem.implicitHeight + 2, 300)
                        padding: 1
                        contentItem: ListView { clip: true; implicitHeight: contentHeight; model: fieldTypeCombo.popup.visible ? fieldTypeCombo.delegateModel : null; currentIndex: fieldTypeCombo.highlightedIndex; ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded } }
                        background: Rectangle { radius: 4; color: themeColors.panel; border.color: themeColors.border }
                    }
                }
            }
            ColumnLayout {
                Layout.fillWidth: true
                visible: fieldTypeCombo.currentValue === "choice"
                Text { text: "选项（逗号分隔）"; color: themeColors.muted; font.pixelSize: 11 }
                TextField { id: fieldOptionsInput; Layout.fillWidth: true; placeholderText: "王国, 帝国, 共和国"; color: themeColors.text; background: Rectangle { radius: 4; color: themeColors.input; border.color: themeColors.border } }
            }
            ColumnLayout {
                Layout.fillWidth: true
                Text { text: "说明"; color: themeColors.muted; font.pixelSize: 11 }
                TextField { id: fieldDescriptionInput; Layout.fillWidth: true; placeholderText: "字段用途"; color: themeColors.text; background: Rectangle { radius: 4; color: themeColors.input; border.color: themeColors.border } }
            }
            CheckBox { id: fieldRequiredInput; text: "必填属性"; palette.text: themeColors.text }
        }
        footer: DialogActions {
            FlatButton { text: "取消"; onClicked: fieldDefinitionDialog.close() }
            FlatButton { text: "保存定义"; primary: true; onClicked: if (backend.saveFieldDefinition(fieldIdInput.text, fieldNameInput.text, fieldTypeCombo.currentValue, fieldRequiredInput.checked, fieldDescriptionInput.text, fieldOptionsInput.text)) fieldDefinitionDialog.close() }
        }
    }

    Dialog {
        id: fieldDeleteDialog
        modal: true
        padding: 16
        title: "删除属性定义"
        header: DialogHeader { titleText: fieldDeleteDialog.title }
        standardButtons: Dialog.NoButton
        anchors.centerIn: parent
        width: Math.min(root.width - 48, 420)
        background: GlassPanel { radius: 12; tint: themeColors.dialog }
        contentItem: Text { text: "删除此自定义属性定义及该字段的所有值？"; color: themeColors.text; wrapMode: Text.Wrap; padding: 8 }
        footer: DialogActions {
            FlatButton { text: "取消"; onClicked: fieldDeleteDialog.close() }
            FlatButton { text: "删除属性"; primary: true; onClicked: { backend.deleteFieldDefinition(pendingFieldId); pendingFieldId = ""; fieldDeleteDialog.close() } }
        }
    }

    Dialog {
        id: dateDialog
        modal: true
        padding: 16
        title: dateIdField.text ? "编辑时间记录" : "添加时间记录"
        header: DialogHeader { titleText: dateDialog.title }
        standardButtons: Dialog.NoButton
        anchors.centerIn: parent
        width: Math.min(root.width - 48, 560)
        closePolicy: Popup.CloseOnEscape
        background: GlassPanel { radius: 12; tint: themeColors.dialog }
        contentItem: ColumnLayout {
            spacing: 10
            TextField { id: dateIdField; visible: false }
            RowLayout {
                Layout.fillWidth: true
                ColumnLayout {
                    Layout.fillWidth: true
                    Text { text: "日期类型"; color: themeColors.muted; font.pixelSize: 11 }
                    TextField { id: dateKindField; Layout.fillWidth: true; text: "custom"; color: themeColors.text; background: Rectangle { radius: 4; color: themeColors.input; border.color: themeColors.border } }
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    Text { text: "显示名称"; color: themeColors.muted; font.pixelSize: 11 }
                    TextField { id: dateLabelField; Layout.fillWidth: true; placeholderText: "出生、建国、战役..."; color: themeColors.text; background: Rectangle { radius: 4; color: themeColors.input; border.color: themeColors.border } }
                }
            }
            ColumnLayout {
                Layout.fillWidth: true
                Text { text: "精度"; color: themeColors.muted; font.pixelSize: 11 }
                ComboBox {
                    id: datePrecision
                    Layout.fillWidth: true
                    textRole: "label"
                    valueRole: "value"
                    model: ListModel {
                        ListElement { label: "仅年份"; value: "year" }
                        ListElement { label: "年与月"; value: "month" }
                        ListElement { label: "完整日期"; value: "day" }
                        ListElement { label: "年份范围"; value: "range" }
                    }
                    palette.window: themeColors.panel
                    palette.windowText: themeColors.text
                    palette.base: themeColors.input
                    palette.text: themeColors.text
                    background: Rectangle { radius: 4; color: themeColors.input; border.color: themeColors.border }
                    contentItem: Text { leftPadding: 10; text: datePrecision.displayText; color: themeColors.text; verticalAlignment: Text.AlignVCenter }
                    delegate: ItemDelegate {
                        required property string label
                        required property int index
                        width: datePrecision.width
                        highlighted: datePrecision.highlightedIndex === index
                        hoverEnabled: true
                        contentItem: Text { text: label; color: themeColors.text; font.pixelSize: 12; verticalAlignment: Text.AlignVCenter }
                        background: Rectangle { color: parent.highlighted ? themeColors.accentSoft : parent.hovered ? themeColors.panelAlt : themeColors.panel }
                    }
                    popup: Popup {
                        y: datePrecision.height - 1
                        width: datePrecision.width
                        implicitHeight: Math.min(contentItem.implicitHeight + 2, 240)
                        padding: 1
                        contentItem: ListView {
                            clip: true
                            implicitHeight: contentHeight
                            model: datePrecision.popup.visible ? datePrecision.delegateModel : null
                            currentIndex: datePrecision.highlightedIndex
                            ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }
                        }
                        background: Rectangle { radius: 4; color: themeColors.panel; border.color: themeColors.border }
                    }
                }
            }
            RowLayout {
                Layout.fillWidth: true
                ColumnLayout {
                    Layout.fillWidth: true
                    visible: datePrecision.currentValue !== "year"
                    Text { text: "详细日期（YYYY-MM-DD）"; color: themeColors.muted; font.pixelSize: 11 }
                    TextField { id: dateValueField; Layout.fillWidth: true; placeholderText: "完整日期 YYYY-MM-DD，年份需匹配"; color: themeColors.text; background: Rectangle { radius: 4; color: themeColors.input; border.color: themeColors.border } }
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    Text { text: backend.eraName + "年份"; color: themeColors.muted; font.pixelSize: 11 }
                    TextField {
                        id: dateYearField
                        Layout.fillWidth: true
                        placeholderText: "可直接输入正数或负数"
                        validator: IntValidator { bottom: -999999; top: 999999 }
                        color: themeColors.text
                        background: Rectangle { radius: 4; color: themeColors.input; border.color: dateYearField.activeFocus ? themeColors.accent : themeColors.border }
                    }
                }
            }
            RowLayout {
                Layout.fillWidth: true
                visible: datePrecision.currentValue === "range"
                ColumnLayout {
                    Layout.fillWidth: true
                    Text { text: "结束年份"; color: themeColors.muted; font.pixelSize: 11 }
                    TextField {
                        id: dateEndYearField
                        Layout.fillWidth: true
                        placeholderText: "结束" + backend.eraName + "年份"
                        validator: IntValidator { bottom: -999999; top: 999999 }
                        color: themeColors.text
                        background: Rectangle { radius: 4; color: themeColors.input; border.color: themeColors.border }
                    }
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    Text { text: "结束详细日期（可选）"; color: themeColors.muted; font.pixelSize: 11 }
                    TextField { id: dateEndValueField; Layout.fillWidth: true; placeholderText: "YYYY-MM-DD"; color: themeColors.text; background: Rectangle { radius: 4; color: themeColors.input; border.color: themeColors.border } }
                }
            }
            Text { Layout.fillWidth: true; text: "年份可输入正数或负数，例如 42、-42；详细日期请填写完整 YYYY-MM-DD，并与年份一致。"; color: themeColors.faint; font.pixelSize: 10; wrapMode: Text.Wrap }
        }
        footer: DialogActions {
            FlatButton { text: "取消"; onClicked: dateDialog.close() }
            FlatButton {
                text: "保存日期"
                primary: true
                onClicked: {
                    if (backend.saveDate(dateIdField.text, dateKindField.text, dateLabelField.text,
                                         dateYearField.text, datePrecision.currentValue, dateValueField.text,
                                         dateEndYearField.text, dateEndValueField.text)) dateDialog.close()
                }
            }
        }
    }

    Dialog {
        id: relationDialog
        modal: true
        padding: 16
        title: backend.relationEditId ? "编辑关联" : "添加关联"
        header: DialogHeader { titleText: relationDialog.title }
        standardButtons: Dialog.NoButton
        anchors.centerIn: parent
        width: Math.min(root.width - 48, 560)
        background: GlassPanel { radius: 12; tint: themeColors.dialog }
        onOpened: {
            relationTarget.currentValue = backend.relationTargetId
            relationLabelField.text = backend.relationLabel
            relationReverseField.text = backend.relationReverseLabel
            relationNotesField.text = backend.relationNotes
        }
        contentItem: ColumnLayout {
            spacing: 10
            ColumnLayout {
                Layout.fillWidth: true
                Text { text: "关联词条"; color: themeColors.muted; font.pixelSize: 11 }
                ComboBox {
                    id: relationTarget
                    Layout.fillWidth: true
                    model: backend.relationTargetModelObject
                    textRole: "displayName"
                    valueRole: "id"
                    palette.window: themeColors.panel
                    palette.windowText: themeColors.text
                    palette.base: themeColors.input
                    palette.text: themeColors.text
                    contentItem: Text { leftPadding: 10; rightPadding: 28; text: relationTarget.displayText; color: themeColors.text; verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight }
                    background: Rectangle { radius: 4; color: themeColors.input; border.color: themeColors.border }
                    delegate: ItemDelegate {
                        required property string displayName
                        required property int index
                        width: relationTarget.width
                        highlighted: relationTarget.highlightedIndex === index
                        hoverEnabled: true
                        contentItem: Text { text: displayName; color: themeColors.text; font.pixelSize: 12; verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight }
                        background: Rectangle { color: parent.highlighted ? themeColors.accentSoft : parent.hovered ? themeColors.panelAlt : themeColors.panel }
                    }
                    popup: Popup {
                        y: relationTarget.height - 1
                        width: relationTarget.width
                        implicitHeight: Math.min(contentItem.implicitHeight + 2, 320)
                        padding: 1
                        contentItem: ListView {
                            clip: true
                            implicitHeight: contentHeight
                            model: relationTarget.popup.visible ? relationTarget.delegateModel : null
                            currentIndex: relationTarget.highlightedIndex
                            ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }
                        }
                        background: Rectangle { radius: 4; color: themeColors.panel; border.color: themeColors.border }
                    }
                }
            }
            RowLayout {
                Layout.fillWidth: true
                ColumnLayout {
                    Layout.fillWidth: true
                    Text { text: "当前词条 → 关联词条"; color: themeColors.muted; font.pixelSize: 11 }
                    TextField { id: relationLabelField; Layout.fillWidth: true; placeholderText: "例如：效忠、位于、持有"; color: themeColors.text; background: Rectangle { radius: 4; color: themeColors.input; border.color: themeColors.border } }
                }
                ColumnLayout {
                    Layout.fillWidth: true
                    Text { text: "反向名称（可选）"; color: themeColors.muted; font.pixelSize: 11 }
                    TextField { id: relationReverseField; Layout.fillWidth: true; placeholderText: "例如：效忠者、包含"; color: themeColors.text; background: Rectangle { radius: 4; color: themeColors.input; border.color: themeColors.border } }
                }
            }
            ColumnLayout {
                Layout.fillWidth: true
                Text { text: "关系说明"; color: themeColors.muted; font.pixelSize: 11 }
                TextArea { id: relationNotesField; Layout.fillWidth: true; Layout.preferredHeight: 80; placeholderText: "可选的上下文或来源"; color: themeColors.text; wrapMode: TextEdit.Wrap; background: Rectangle { radius: 4; color: themeColors.input; border.color: themeColors.border } }
            }
        }
        footer: DialogActions {
            FlatButton { text: "取消"; onClicked: relationDialog.close() }
            FlatButton {
                text: "保存关联"
                primary: true
                onClicked: if (backend.saveRelation(relationTarget.currentValue, relationLabelField.text, relationReverseField.text, relationNotesField.text)) relationDialog.close()
            }
        }
    }

    Dialog {
        id: relationDeleteDialog
        modal: true
        padding: 16
        title: "删除关联"
        header: DialogHeader { titleText: relationDeleteDialog.title }
        standardButtons: Dialog.NoButton
        anchors.centerIn: parent
        width: Math.min(root.width - 48, 420)
        background: GlassPanel { radius: 12; tint: themeColors.dialog }
        contentItem: Text { text: "删除这条双向可见的关联？词条本身不会删除。"; color: themeColors.text; wrapMode: Text.Wrap; padding: 8 }
        footer: DialogActions {
            FlatButton { text: "取消"; onClicked: relationDeleteDialog.close() }
            FlatButton { text: "删除关联"; primary: true; onClicked: { backend.deleteRelation(pendingRelationId); pendingRelationId = ""; relationDeleteDialog.close() } }
        }
    }

    Dialog {
        id: importConfirmDialog
        modal: true
        padding: 16
        title: "导入资料库"
        header: DialogHeader { titleText: importConfirmDialog.title }
        standardButtons: Dialog.NoButton
        anchors.centerIn: parent
        width: Math.min(root.width - 48, 460)
        background: GlassPanel { radius: 12; tint: themeColors.dialog }
        contentItem: Text { text: "导入会按 UUID 合并词条、关系和类型定义。已有同 ID 内容将更新，无法撤销。"; color: themeColors.text; wrapMode: Text.Wrap; padding: 8 }
        footer: DialogActions {
            FlatButton { text: "取消"; onClicked: importConfirmDialog.close() }
            FlatButton { text: "选择 JSON"; primary: true; onClicked: { importConfirmDialog.close(); backend.chooseAndImportLibrary() } }
        }
    }

    Dialog {
        id: previewDialog
        modal: true
        padding: 16
        title: "词条预览"
        header: DialogHeader { titleText: previewDialog.title }
        standardButtons: Dialog.NoButton
        anchors.centerIn: parent
        width: Math.min(root.width - 48, 520)
        onClosed: backend.closePreview()
        background: GlassPanel { radius: 12; tint: themeColors.dialog }
        contentItem: ColumnLayout {
            spacing: 12
            Text { text: backend.previewName; color: themeColors.text; font.pixelSize: 19; font.weight: Font.DemiBold; wrapMode: Text.Wrap; Layout.fillWidth: true }
            Text { text: backend.previewTypeName; color: themeColors.accent; font.pixelSize: 12 }
            TextField {
                Layout.fillWidth: true
                readOnly: true
                selectByMouse: true
                text: "UUID  ·  " + backend.previewUuid
                color: themeColors.faint
                font.pixelSize: 10
                background: Rectangle { radius: 4; color: themeColors.input; border.color: themeColors.border }
            }
            Text { text: backend.previewSummary || "暂无简介"; color: themeColors.muted; font.pixelSize: 13; wrapMode: Text.Wrap; Layout.fillWidth: true }
            Text { text: backend.previewNotes; color: themeColors.text; font.pixelSize: 12; wrapMode: Text.Wrap; Layout.fillWidth: true; maximumLineCount: 8; elide: Text.ElideRight }
        }
        footer: DialogActions {
            FlatButton { text: "关闭"; onClicked: previewDialog.close() }
            FlatButton { text: "打开词条"; primary: true; onClicked: root.openPreviewedEntity() }
        }
    }

    Dialog {
        id: deleteDialog
        modal: true
        padding: 16
        title: "删除词条"
        header: DialogHeader { titleText: deleteDialog.title }
        standardButtons: Dialog.NoButton
        anchors.centerIn: parent
        width: Math.min(root.width - 48, 420)
        background: GlassPanel { radius: 12; tint: themeColors.dialog }
        contentItem: Text { text: "将「" + backend.currentName + "」移入回收站？"; color: themeColors.text; wrapMode: Text.Wrap; padding: 8 }
        footer: DialogActions {
            FlatButton { text: "取消"; onClicked: deleteDialog.close() }
            FlatButton { text: "移入回收站"; primary: true; onClicked: { backend.deleteEntity(); deleteDialog.close() } }
        }
    }

    Dialog {
        id: unsavedDialog
        modal: true
        padding: 16
        title: "未保存的修改"
        header: DialogHeader { titleText: unsavedDialog.title }
        standardButtons: Dialog.NoButton
        anchors.centerIn: parent
        width: Math.min(root.width - 48, 520)
        closePolicy: Popup.NoAutoClose
        background: GlassPanel { radius: 12; tint: themeColors.dialog }
        contentItem: ColumnLayout {
            spacing: 14
            Text { text: "当前词条有未保存的修改。"; color: themeColors.text; wrapMode: Text.Wrap; Layout.fillWidth: true }
            RowLayout {
                Layout.fillWidth: true
                Item { Layout.fillWidth: true }
                FlatButton { text: "继续编辑"; onClicked: { backend.cancelPendingAction(); unsavedDialog.close() } }
                FlatButton { text: "放弃修改"; onClicked: { backend.discardAndContinue(); unsavedDialog.close() } }
                FlatButton { text: "保存并继续"; primary: true; onClicked: { backend.saveAndContinue(); if (!backend.dirty) unsavedDialog.close() } }
            }
        }
    }

    Connections {
        target: backend
        function onCurrentEntityChanged() {
            if (!nameField.activeFocus) nameField.text = backend.currentName
            if (!tagsField.activeFocus) tagsField.text = backend.currentTags
            if (!summaryField.activeFocus) summaryField.text = backend.currentSummary
            if (!aliasesField.activeFocus) aliasesField.text = backend.currentAliases
            if (!notesField.activeFocus) notesField.text = backend.currentNotes
        }
        function onDiscardConfirmationRequested() { unsavedDialog.open() }
        function onCloseWindowRequested() { root.close() }
    }

    onClosing: function(close) {
        if (backend.dirty) {
            close.accepted = false
            backend.requestClose()
        }
    }
}
