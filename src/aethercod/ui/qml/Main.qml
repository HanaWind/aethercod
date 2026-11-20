import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Effects
import QtQuick.Layouts 1.15

ApplicationWindow {
    id: root
    objectName: "workspaceWindow"
    width: 1440
    height: 900
    minimumWidth: 1000
    minimumHeight: 640
    visible: true
    title: backend.hasProject ? backend.projectName + " — Aethercod" : "Aethercod"
    property bool darkMode: backend.dark
    property string page: "entries"
    property string pendingRelationId: ""
    property string pendingFieldId: ""
    property bool projectNameEditing: false
    property string projectNameDraft: ""

    onPageChanged: {
        if (backend.animationsEnabled) {
            pageReveal.restart()
        } else {
            pageReveal.stop()
            workspaceStack.opacity = 1
            workspaceStack.scale = 1
        }
    }

    // ── 页面切换动画 ──────────────────────────────────────────
    ParallelAnimation {
        id: pageReveal
        NumberAnimation { target: workspaceStack; property: "opacity"; from: 0.0; to: 1; duration: 180; easing.type: Easing.OutCubic }
        NumberAnimation { target: workspaceStack; property: "scale"; from: 0.985; to: 1; duration: 220; easing.type: Easing.OutCubic }
    }

    Connections {
        target: backend
        function onUiPreferencesChanged() {
            ambientField.requestPaint()
            if (!backend.animationsEnabled) {
                pageReveal.stop()
                workspaceStack.opacity = 1
                workspaceStack.scale = 1
            }
        }
    }

    // ── 颜色令牌 ─────────────────────────────────────────────
    QtObject {
        id: clr
        // 背景层
        property color bg:         darkMode ? "#10191a" : "#f2f6f4"
        property color surface:    darkMode ? "#172426" : "#fbfdfc"
        property color surfaceHigh:darkMode ? "#203235" : "#edf4f1"
        property color surfaceBorder: darkMode ? "#2a4140" : "#d8e5df"
        // 文字
        property color textPrimary:   darkMode ? "#e7f2ef" : "#172a26"
        property color textSecondary: darkMode ? "#a2b8b0" : "#536b63"
        property color textMuted:     darkMode ? "#738a81" : "#82968e"
        property color accent:        darkMode ? "#62d5b5" : "#087f68"
        property color accentHover:   darkMode ? "#83e5c9" : "#066a57"
        property color accentSoft:    darkMode ? "#24483f" : "#d9f0e8"
        property color accentBorder:  darkMode ? "#397260" : "#a7d7c6"
        // 语义色
        property color green:   darkMode ? "#52d69b" : "#16845d"
        property color greenSoft: darkMode ? "#0a2a14" : "#dcfce7"
        property color red:     darkMode ? "#ff8e83" : "#b9433d"
        property color redSoft: darkMode ? "#2a0e0e" : "#fee2e2"
        property color amber:   darkMode ? "#f2c776" : "#9f711d"
        property color amberSoft: darkMode ? "#2a1f00" : "#fef3c7"
        // 边框、分隔线
        property color border:  darkMode ? "#36504e" : "#d3e1db"
        property color divider: darkMode ? "#263a39" : "#e6eeea"
        // 输入框背景
        property color input:   darkMode ? "#111c1d" : "#ffffff"
        property color inputBorder: darkMode ? "#3a5350" : "#cbdad3"
        // 类型颜色
        readonly property var typeAccent: ({
            "person":       darkMode ? "#c2a7ff" : "#7651a8",
            "polity":       darkMode ? "#ffc078" : "#b56d2c",
            "place":        darkMode ? "#69d9b0" : "#188268",
            "organization": darkMode ? "#83baf2" : "#326fa8",
            "branch":       darkMode ? "#64d2d5" : "#16838a",
            "event":        darkMode ? "#f59ab6" : "#b54568",
            "item":         darkMode ? "#ebca6f" : "#9b7a1f",
            "species":      darkMode ? "#a9d887" : "#548c38",
            "concept":      darkMode ? "#aaacee" : "#5b65a8"
        })
        function typeColor(typeId) {
            return typeAccent[typeId] || (darkMode ? "#8b949e" : "#6b7280")
        }
        function withAlpha(color, a) {
            return Qt.rgba(color.r, color.g, color.b, a)
        }
    }

    // ── 全局字体 ──────────────────────────────────────────────
    font.family: "Microsoft YaHei UI"
    font.pixelSize: 13

    // ── 窗口调色板 ────────────────────────────────────────────
    color: clr.bg
    palette.window: clr.surface
    palette.windowText: clr.textPrimary
    palette.base: clr.input
    palette.text: clr.textPrimary
    palette.button: clr.surfaceHigh
    palette.buttonText: clr.textPrimary
    palette.placeholderText: clr.textMuted
    palette.highlight: clr.accent
    palette.accent: clr.accent
    palette.highlightedText: "#ffffff"

    // ── 辅助函数 ──────────────────────────────────────────────
    function terraYear(v) { return backend.formatYear(Number(v)) }

    function prepareNewProject() {
        newProjectName.text = "新的世界"
        newProjectEra.text = "泰拉纪元"
        newProjectAuthor.text = ""
        newProjectDescription.text = ""
        newProjectDialog.open()
    }

    function beginProjectNameEdit() {
        projectNameDraft = backend.projectName
        projectNameEditing = true
    }

    function saveProjectNameEdit() {
        if (backend.updateProjectSettings(projectNameDraft, backend.eraName, backend.projectAuthor, backend.projectDescription))
            projectNameEditing = false
    }

    function cancelProjectNameEdit() {
        projectNameDraft = backend.projectName
        projectNameEditing = false
    }

    function formatHistoryTime(value) {
        return String(value || "").replace("T", " ").slice(0, 19)
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
        var id = backend.previewEntityId
        if (!id) return
        root.page = "entries"
        backend.openRelation(id)
        previewDialog.close()
    }

    function timelineX(value, width) {
        if (value === null || value === undefined) return width - 90
        var span = timelineViewport.visibleYearSpan()
        var start = timelineViewport.timelineCenterYear - span / 2
        return 60 + (Number(value) - start) / span * Math.max(80, width - 120)
    }

    function openFieldEditor(fieldId, name, fieldType, required, description, optionsJson) {
        fieldIdInput.text = fieldId
        fieldNameInput.text = name
        fieldTypeCombo.currentValue = fieldType || "text"
        fieldRequiredInput.checked = required
        fieldDescriptionInput.text = description
        try { fieldOptionsInput.text = JSON.parse(optionsJson || "[]").join(", ") }
        catch (e) { fieldOptionsInput.text = "" }
        fieldDefinitionDialog.open()
    }

    // ── 动态背景（保留原有粒子效果） ─────────────────────────
    background: Item {
        Canvas {
            id: ambientField
            objectName: "ambientField"
            anchors.fill: parent
            renderTarget: Canvas.Image
            antialiasing: true
            property var particles: []
            property real phase: 0

            function seeded(s) { var v = Math.sin(s * 47.37)*10000; return v - Math.floor(v) }
            function resetParticles() {
                if (width <= 0 || height <= 0) return
                var next = []
                for (var i = 0; i < 96; ++i) {
                    next.push({ x: seeded(i+1)*width, y: seeded(i+83)*height,
                        vx: (seeded(i+161)-0.5)*1.3, vy: (seeded(i+239)-0.5)*0.95,
                        radius: 1.2+seeded(i+317)*4.0, maxAlpha: 0.12+seeded(i+401)*0.25,
                        life: seeded(i+463)*Math.PI*2, lifeSpeed: 0.032+seeded(i+521)*0.05,
                        tone: i%3 })
                }
                particles = next; requestPaint()
            }
            onWidthChanged: resetParticles()
            onHeightChanged: resetParticles()
            Component.onCompleted: resetParticles()

            Connections {
                target: root
                function onDarkModeChanged() { ambientField.requestPaint() }
            }

            onPaint: {
                var ctx = getContext("2d")
                ctx.clearRect(0,0,width,height)
                ctx.fillStyle = clr.bg
                ctx.fillRect(0,0,width,height)
                var driftX = Math.cos(phase * 0.55) * width * 0.32
                var driftY = Math.sin(phase * 0.55) * height * 0.32
                var sweep = ctx.createLinearGradient(width/2-driftX, height/2-driftY,
                                                     width/2+driftX, height/2+driftY)
                if (darkMode) {
                    sweep.addColorStop(0, "rgba(27, 83, 71, 0.56)")
                    sweep.addColorStop(0.5, "rgba(37, 65, 77, 0.38)")
                    sweep.addColorStop(1, "rgba(99, 73, 43, 0.42)")
                } else {
                    sweep.addColorStop(0, "rgba(153, 218, 195, 0.52)")
                    sweep.addColorStop(0.5, "rgba(170, 207, 221, 0.42)")
                    sweep.addColorStop(1, "rgba(232, 203, 153, 0.46)")
                }
                ctx.fillStyle = sweep
                ctx.fillRect(0, 0, width, height)
                // 粒子
            if (backend.backgroundEffectsEnabled) {
                for (var i = 0; i < particles.length; ++i) {
                    var p = particles[i]
                    var col = p.tone===0 ? (darkMode?"98,213,181":"16,132,104")
                                : p.tone===1 ? (darkMode?"119,176,207":"50,127,163")
                                : (darkMode?"230,190,122":"181,132,60")
                    var lf = Math.max(0,Math.sin(p.life*0.5))
                    ctx.beginPath()
                    ctx.fillStyle = "rgba("+col+","+(p.maxAlpha*lf*lf)+")"
                    ctx.arc(p.x,p.y,p.radius*(0.2+lf*0.8),0,Math.PI*2)
                    ctx.fill()
                }
                }
            }

            Timer {
                interval: 50; repeat: true
                running: root.visible && root.visibility !== Window.Minimized && backend.backgroundEffectsEnabled
                onTriggered: {
                    ambientField.phase += 0.012
                    for (var i = 0; i < ambientField.particles.length; ++i) {
                        var p = ambientField.particles[i]
                        p.x+=p.vx; p.y+=p.vy; p.life+=p.lifeSpeed
                        if (p.life >= Math.PI*2) {
                            p.life=0; p.x=Math.random()*ambientField.width; p.y=Math.random()*ambientField.height
                            p.vx=(Math.random()-0.5)*1.3; p.vy=(Math.random()-0.5)*0.95
                        }
                        if (p.x<-8) p.x=ambientField.width+8
                        if (p.x>ambientField.width+8) p.x=-8
                        if (p.y<-8) p.y=ambientField.height+8
                        if (p.y>ambientField.height+8) p.y=-8
                    }
                    ambientField.requestPaint()
                }
            }
        }
        MultiEffect {
            anchors.fill: ambientField
            source: ambientField
            visible: false
            id: frostedBackdrop
            autoPaddingEnabled: false
            blurEnabled: true; blur: 0.9; blurMax: 48; saturation: -0.08
        }
    }

    // ── 可复用组件 ───────────────────────────────────────────

    // 毛玻璃面板
    component GlassPane: Item {
        id: gp
        property real radius: 10
        property color tint: clr.withAlpha(clr.surface, darkMode ? 0.56 : 0.68)
        property color borderColor: darkMode ? Qt.rgba(1, 1, 1, 0.12) : Qt.rgba(0, 0, 0, 0.07)
        clip: true
        ShaderEffectSource { anchors.fill: parent; sourceItem: frostedBackdrop; live: true; recursive: false
            sourceRect: { var pt = gp.mapToItem(ambientField,0,0); return Qt.rect(pt.x,pt.y,gp.width,gp.height) }
        }
        Rectangle { anchors.fill: parent; radius: gp.radius; color: gp.tint; border.width:1; border.color: gp.borderColor }
        Rectangle {
            anchors.fill: parent
            radius: gp.radius
            color: "transparent"
            gradient: Gradient {
                orientation: Gradient.Vertical
                GradientStop { position: 0; color: Qt.rgba(1, 1, 1, darkMode ? 0.12 : 0.22) }
                GradientStop { position: 0.24; color: Qt.rgba(1, 1, 1, darkMode ? 0.035 : 0.08) }
                GradientStop { position: 1; color: "transparent" }
            }
        }
        Rectangle {
            id: liquidHighlight
            width: Math.max(80, gp.width * 0.24)
            height: gp.height * 1.8
            y: -gp.height * 0.4
            rotation: 18
            opacity: darkMode ? 0.11 : 0.16
            gradient: Gradient {
                orientation: Gradient.Horizontal
                GradientStop { position: 0; color: "transparent" }
                GradientStop { position: 0.46; color: "transparent" }
                GradientStop { position: 0.5; color: "#ffffff" }
                GradientStop { position: 0.54; color: "transparent" }
                GradientStop { position: 1; color: "transparent" }
            }
            NumberAnimation on x {
                from: -liquidHighlight.width
                to: gp.width
                duration: 7800
                loops: Animation.Infinite
                easing.type: Easing.Linear
                running: gp.visible && backend.backgroundEffectsEnabled
            }
        }
        Rectangle {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            height: 1
            color: Qt.rgba(1, 1, 1, darkMode ? 0.16 : 0.58)
        }
    }

    // 弹窗动画
    component PopupIn: Transition {
        ParallelAnimation {
            NumberAnimation { property:"opacity"; from:0;to:1;duration:160;easing.type:Easing.OutCubic }
            NumberAnimation { property:"scale"; from:0.96;to:1;duration:180;easing.type:Easing.OutCubic }
        }
    }
    component PopupOut: Transition {
        ParallelAnimation {
            NumberAnimation { property:"opacity"; from:1;to:0;duration:120;easing.type:Easing.InCubic }
            NumberAnimation { property:"scale"; from:1;to:0.97;duration:120;easing.type:Easing.InCubic }
        }
    }

    // 通用对话框头部
    component DlgHeader: Item {
        required property string titleText
        implicitHeight: 54
        Text {
            anchors.left:parent.left; anchors.right:parent.right; anchors.leftMargin:20; anchors.rightMargin:20; anchors.verticalCenter:parent.verticalCenter
            text: parent.titleText
            color: clr.textPrimary; font.pixelSize:15; font.weight:Font.DemiBold; elide:Text.ElideRight
        }
        Rectangle { anchors.left:parent.left; anchors.right:parent.right; anchors.bottom:parent.bottom; height:1; color:clr.border }
    }

    // 对话框底部操作区
    component DlgFooter: Control {
        default property alias actions: row.data
        implicitHeight: 60; leftPadding:16; rightPadding:16; topPadding:8; bottomPadding:14
        contentItem: RowLayout { id:row; spacing:8; Item{Layout.fillWidth:true} }
    }

    // 主要按钮
    component PrimaryBtn: Button {
        id: pb
        property bool danger: false
        hoverEnabled: true
        implicitHeight: 34
        implicitWidth: Math.max(88, contentItem.implicitWidth + 28)
        scale: down ? 0.95 : 1
        Behavior on scale { NumberAnimation { duration:80; easing.type:Easing.OutCubic } }
        contentItem: Text {
            text: pb.text
            color: pb.enabled ? "#ffffff" : clr.textMuted
            font.pixelSize:13; font.weight:Font.Medium
            horizontalAlignment:Text.AlignHCenter; verticalAlignment:Text.AlignVCenter
        }
        background: Rectangle {
            radius: 7
            color: !pb.enabled  ? clr.surfaceHigh
                 : pb.danger    ? (pb.down ? Qt.darker(clr.red,1.15) : pb.hovered ? Qt.lighter(clr.red,1.1) : clr.red)
                 : (pb.down ? clr.accentHover : pb.hovered ? Qt.lighter(clr.accent,1.08) : clr.accent)
            Behavior on color { ColorAnimation { duration:120 } }
        }
    }

    // 次要按钮
    component SecondaryBtn: Button {
        id: sb
        hoverEnabled: true
        implicitHeight: 34
        implicitWidth: Math.max(72, contentItem.implicitWidth + 24)
        scale: down ? 0.95 : 1
        Behavior on scale { NumberAnimation { duration:80; easing.type:Easing.OutCubic } }
        contentItem: Text {
            text: sb.text; color: sb.enabled ? clr.textPrimary : clr.textMuted
            font.pixelSize:13; horizontalAlignment:Text.AlignHCenter; verticalAlignment:Text.AlignVCenter
        }
        background: Rectangle {
            radius:7
            color: !sb.enabled ? clr.surfaceHigh : sb.down ? clr.border : sb.hovered ? clr.surfaceHigh : "transparent"
            border.width:1; border.color: sb.hovered ? clr.border : clr.withAlpha(clr.border,0.6)
            Behavior on color { ColorAnimation { duration:120 } }
        }
    }

    // 文字/幽灵按钮（侧边栏导航等）
    component GhostBtn: Button {
        id: gb
        hoverEnabled: true
        implicitHeight: 34
        implicitWidth: contentItem.implicitWidth + 24
        scale: down ? 0.96 : 1
        Behavior on scale { NumberAnimation { duration:80; easing.type:Easing.OutCubic } }
        contentItem: Text {
            text: gb.text; color: gb.enabled ? clr.textPrimary : clr.textMuted
            font.pixelSize:13; font.weight:Font.Medium
            horizontalAlignment:Text.AlignHCenter; verticalAlignment:Text.AlignVCenter
        }
        background: Rectangle {
            radius:7
            color: !gb.enabled ? "transparent" : gb.down ? clr.accentSoft : gb.hovered ? clr.surfaceHigh : "transparent"
            Behavior on color { ColorAnimation { duration:100 } }
        }
    }

    // 图标按钮
    component IconBtn: ToolButton {
        id: ib
        property string hint: ""
        property color tint: clr.textSecondary
        hoverEnabled: true
        implicitWidth: 34; implicitHeight: 34
        scale: down ? 0.90 : 1
        Behavior on scale { NumberAnimation { duration:80; easing.type:Easing.OutCubic } }
        contentItem: Text {
            text: ib.text
            color: ib.enabled ? (ib.down ? clr.accent : ib.tint) : clr.textMuted
            font.pixelSize:16; horizontalAlignment:Text.AlignHCenter; verticalAlignment:Text.AlignVCenter
        }
        background: Rectangle {
            radius:7
            color: ib.down ? clr.accentSoft : ib.hovered ? clr.surfaceHigh : "transparent"
            border.width: ib.hovered ? 1 : 0; border.color: clr.border
            Behavior on color { ColorAnimation { duration:100 } }
        }
        ToolTip.visible: hovered && hint.length > 0
        ToolTip.text: hint; ToolTip.delay: 600
    }

    // 通用 TextField 样式
    component StyledField: TextField {
        id: sf
        color: clr.textPrimary
        placeholderTextColor: clr.textMuted
        selectByMouse: true
        implicitHeight: 36
        leftPadding: 10; rightPadding: 10
        background: Rectangle {
            radius:7; color: clr.input
            border.width: sf.activeFocus ? 2 : 1
            border.color: sf.activeFocus ? clr.accent : clr.inputBorder
            Behavior on border.color { ColorAnimation { duration:120 } }
        }
    }

    // 通用 TextArea 样式
    component StyledArea: TextArea {
        id: sa
        color: clr.textPrimary
        placeholderTextColor: clr.textMuted
        selectByMouse: true
        wrapMode: TextArea.Wrap
        padding: 10
        background: Rectangle {
            radius:7; color: clr.input
            border.width: sa.activeFocus ? 2 : 1
            border.color: sa.activeFocus ? clr.accent : clr.inputBorder
            Behavior on border.color { ColorAnimation { duration:120 } }
        }
    }

    // 侧边栏导航项
    component NavItem: ItemDelegate {
        id: ni
        property string navIcon: ""
        property bool active: false
        property int badge: 0
        hoverEnabled: true
        implicitHeight: 38
        Layout.fillWidth: true
        scale: pressed ? 0.97 : 1
        Behavior on scale { enabled: backend.animationsEnabled; SpringAnimation { spring:3.2; damping:0.24; mass:0.72; epsilon:0.001 } }
        background: Rectangle {
            radius:8
            color: ni.active ? clr.accentSoft : ni.hovered ? clr.surfaceHigh : "transparent"
            Behavior on color { ColorAnimation { duration:120 } }
        }
        contentItem: RowLayout {
            spacing: 8
            Text {
                text: ni.navIcon; font.pixelSize:15
                color: ni.active ? clr.accent : clr.textSecondary
                verticalAlignment: Text.AlignVCenter
                horizontalAlignment: Text.AlignHCenter
                Layout.preferredWidth: 24
            }
            Text {
                Layout.fillWidth: true
                text: ni.text; font.pixelSize:13; font.weight:Font.Medium
                color: ni.active ? clr.accent : clr.textPrimary
                verticalAlignment: Text.AlignVCenter; elide: Text.ElideRight
            }
            Rectangle {
                visible: ni.badge > 0
                width: Math.max(20, badgeTxt.implicitWidth+8); height:18; radius:9
                color: clr.red
                Text {
                    id: badgeTxt
                    anchors.centerIn: parent; text: ni.badge
                    font.pixelSize:10; font.weight:Font.Bold; color:"#ffffff"
                }
            }
        }
    }

    // ── 顶部标题栏 ────────────────────────────────────────────
    header: Rectangle {
        height: 56
        color: clr.withAlpha(clr.surface, darkMode ? 0.90 : 0.95)
        border.width: 0
        // 底部微线
        Rectangle { anchors.left:parent.left; anchors.right:parent.right; anchors.bottom:parent.bottom; height:1; color:clr.border }

        RowLayout {
            anchors.fill:parent; anchors.leftMargin:16; anchors.rightMargin:16
            spacing: 12

            // Logo + 项目名
            RowLayout {
                spacing: 10
                // Logo图标
                Rectangle {
                    width:34; height:34; radius:9
                    color: clr.accentSoft; border.width:1; border.color:clr.accentBorder
                    Text { anchors.centerIn:parent; text:"✦"; color:clr.accent; font.pixelSize:17 }
                }
                Column {
                    spacing: 1
                    Text { text:"Aethercod"; color:clr.textPrimary; font.pixelSize:15; font.weight:Font.DemiBold }
                    Text {
                        text: backend.hasProject ? backend.projectName : "奇幻世界观数据库"
                        color: clr.textSecondary; font.pixelSize:11
                        elide: Text.ElideRight; width: 160
                    }
                }
            }

            Item { Layout.fillWidth: true }

            // 搜索框
            Rectangle {
                visible: root.page === "entries" && backend.hasProject
                Layout.preferredWidth: 300; height: 34
                radius: 8; color: clr.input
                border.width: searchInput.activeFocus ? 2 : 1
                border.color: searchInput.activeFocus ? clr.accent : clr.inputBorder
                Behavior on border.color { ColorAnimation { duration:120 } }
                Row {
                    anchors.left:parent.left; anchors.right:parent.right; anchors.verticalCenter:parent.verticalCenter; anchors.leftMargin:10; anchors.rightMargin:8
                    spacing: 6
                    Text { text:"⌕"; color:clr.textMuted; font.pixelSize:15; anchors.verticalCenter:parent.verticalCenter }
                    TextField {
                        id: searchInput
                        width: parent.width - 30
                        text: backend.query
                        placeholderText: "搜索词条、别名、标签..."
                        color: clr.textPrimary
                        placeholderTextColor: clr.textMuted
                        selectByMouse: true
                        background: Item {}
                        onTextEdited: backend.setQuery(text)
                    }
                }
            }

            // 新建词条
            PrimaryBtn {
                text: "+ 新词条"
                enabled: backend.hasProject && !backend.readOnly && !backend.dirty
                onClicked: backend.newEntity()
            }

            IconBtn { text:"↻"; hint:"刷新"; enabled:backend.hasProject; onClicked:backend.refresh() }
            IconBtn { text:"⋯"; hint:"资料库操作"; onClicked:projectActionsPopup.open() }

            Rectangle { width:1; height:22; color:clr.border }

            GhostBtn { text:"打开"; onClicked:backend.chooseAndOpenProject() }
            GhostBtn { text:"新建"; onClicked:root.prepareNewProject() }

            // 明暗切换
            Rectangle {
                width:34; height:34; radius:8
                color: themeBtnArea.containsMouse ? clr.surfaceHigh : "transparent"
                Behavior on color { ColorAnimation { duration:100 } }
                Text { anchors.centerIn:parent; text:darkMode?"☼":"◑"; color:clr.textSecondary; font.pixelSize:16 }
                MouseArea { id:themeBtnArea; anchors.fill:parent; hoverEnabled:true; cursorShape:Qt.PointingHandCursor; onClicked:backend.toggleTheme() }
                ToolTip.visible: themeBtnArea.containsMouse; ToolTip.text:darkMode?"切换日间模式":"切换夜间模式"; ToolTip.delay:600
            }
        }
    }

    // ── 资料库操作弹出菜单 ────────────────────────────────────
    Popup {
        id: projectActionsPopup
        objectName: "projectActionsPopup"
        enter: PopupIn {}
        exit: PopupOut {}
        x: root.width - width - 16; y: 8
        width: 240; padding: 8
        closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
        background: Rectangle { radius:10; color:clr.surface; border.width:1; border.color:clr.border }

        contentItem: ColumnLayout {
            spacing: 2
            Text {
                text: backend.hasProject ? backend.projectName : "资料库"
                color:clr.textMuted; font.pixelSize:11; font.weight:Font.DemiBold
                leftPadding:10; topPadding:4; bottomPadding:6
                elide:Text.ElideRight; Layout.fillWidth:true
            }
            Rectangle { height:1; color:clr.divider; Layout.fillWidth:true; Layout.leftMargin:4; Layout.rightMargin:4 }
            GhostBtn { text:"  新建资料库"; Layout.fillWidth:true; onClicked:{projectActionsPopup.close();root.prepareNewProject()} }
            GhostBtn { text:"  打开资料库"; Layout.fillWidth:true; onClicked:{projectActionsPopup.close();backend.chooseAndOpenProject()} }
            Rectangle { height:1; color:clr.divider; Layout.fillWidth:true; Layout.leftMargin:4; Layout.rightMargin:4; Layout.topMargin:2; Layout.bottomMargin:2 }
            GhostBtn { text:"  资料库设置"; enabled:backend.hasProject; Layout.fillWidth:true; onClicked:{projectActionsPopup.close();root.showProjectSettings()} }
            GhostBtn { text:"  备份 .aethercod"; enabled:backend.hasProject&&!backend.dirty; Layout.fillWidth:true; onClicked:{projectActionsPopup.close();backend.chooseAndBackupProject()} }
            GhostBtn { text:"  导出 JSON"; enabled:backend.hasProject&&!backend.dirty; Layout.fillWidth:true; onClicked:{projectActionsPopup.close();backend.chooseAndExportLibrary()} }
            GhostBtn { text:"  导入并合并 JSON"; enabled:backend.hasProject&&!backend.readOnly&&!backend.dirty; Layout.fillWidth:true; onClicked:{projectActionsPopup.close();importConfirmDialog.open()} }
            Rectangle { height:1; color:clr.divider; Layout.fillWidth:true; Layout.leftMargin:4; Layout.rightMargin:4; Layout.topMargin:2; Layout.bottomMargin:2 }
            GhostBtn { text:"  关闭当前资料库"; enabled:backend.hasProject; Layout.fillWidth:true; onClicked:{projectActionsPopup.close();backend.requestCloseProject()} }
        }
    }

    // ── 主体布局 ─────────────────────────────────────────────
    RowLayout {
        anchors.fill:parent; anchors.margins:0
        spacing: 0

        // ── 侧边导航栏 ───────────────────────────────────────
        Rectangle {
            Layout.preferredWidth: 200
            Layout.fillHeight: true
            color: clr.withAlpha(clr.surface, darkMode ? 0.85 : 0.92)
            Rectangle { anchors.right:parent.right; anchors.top:parent.top; anchors.bottom:parent.bottom; width:1; color:clr.border }

            ColumnLayout {
                anchors.fill:parent; anchors.margins:12
                spacing: 4

                Text { text:"工作区"; color:clr.textMuted; font.pixelSize:11; font.weight:Font.DemiBold; leftPadding:8; bottomPadding:6 }

                NavItem { id: entriesNavItem; text:"词条库"; navIcon:"▤"; active:root.page==="entries"; onClicked:root.page="entries" }
                NavItem { id: timelineNavItem; text:"时间线"; navIcon:"◷"; active:root.page==="timeline"; onClicked:root.page="timeline" }
                NavItem { id: graphNavItem; text:"关系图"; navIcon:"◇"; active:root.page==="graph"; onClicked:root.page="graph" }
                NavItem { id: validationNavItem; text:"数据校验"; navIcon:"✓"; active:root.page==="validation"; badge:backend.validationCount; onClicked:{backend.refresh();root.page="validation"} }
                NavItem { id: settingsNavItem; text:"资料库设置"; navIcon:"⚙"; active:root.page==="settings"; onClicked:root.showProjectSettings() }
                NavItem { id: historyNavItem; text:"编辑记录"; navIcon:"↺"; active:root.page==="history"; onClicked:root.page="history" }

                Item { Layout.fillHeight: true }

                // 项目信息卡片
                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 100
                    radius: 8; color: clr.surfaceHigh
                    border.width: 1; border.color: clr.border
                    ColumnLayout {
                        anchors.fill:parent; anchors.margins:10
                        spacing: 2
                        Text { text:"当前资料库"; color:clr.textMuted; font.pixelSize:10 }
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 2
                            TextField {
                                id: projectNameInlineField
                                visible: root.projectNameEditing
                                Layout.fillWidth: true
                                Layout.minimumWidth: 0
                                implicitHeight: 28
                                text: root.projectNameDraft
                                selectByMouse: true
                                readOnly: backend.readOnly
                                color: clr.textPrimary
                                background: Rectangle { radius:5; color:clr.input; border.width:1; border.color:clr.inputBorder }
                                onTextEdited: root.projectNameDraft = text
                            }
                            Text {
                                visible: !root.projectNameEditing
                                Layout.fillWidth: true
                                text:backend.hasProject?backend.projectName:"未打开"
                                color:clr.textPrimary; font.pixelSize:13; font.weight:Font.Medium; elide:Text.ElideRight
                            }
                            IconBtn {
                                visible: backend.hasProject && !root.projectNameEditing
                                enabled: !backend.readOnly
                                text:"✎"; hint:"修改资料库名称"; tint:clr.accent
                                implicitWidth:26; implicitHeight:26
                                onClicked: root.beginProjectNameEdit()
                            }
                            IconBtn {
                                visible: root.projectNameEditing
                                text:"✓"; hint:"应用资料库名称"; tint:clr.green
                                implicitWidth:24; implicitHeight:26
                                onClicked: root.saveProjectNameEdit()
                            }
                            IconBtn {
                                visible: root.projectNameEditing
                                text:"×"; hint:"取消修改"; tint:clr.red
                                implicitWidth:24; implicitHeight:26
                                onClicked: root.cancelProjectNameEdit()
                            }
                        }
                        RowLayout {
                            spacing: 6
                            Rectangle {
                                width:6; height:6; radius:3
                                color: backend.hasProject ? (backend.readOnly ? clr.amber : clr.green) : clr.textMuted
                            }
                            Text { Layout.fillWidth: true; text: backend.hasProject ? (backend.readOnly?"只读":"可编辑") : "无项目"; color:clr.textSecondary; font.pixelSize:10 }
                            Switch {
                                objectName: "readOnlyModeSwitch"
                                checked: backend.readOnly
                                enabled: backend.projectWritable
                                scale: 0.78
                                Layout.preferredWidth: 42
                                Layout.preferredHeight: 28
                                onToggled: backend.setReadOnlyMode(checked)
                                palette.highlight: clr.accent
                                palette.accent: clr.accent
                            }
                        }
                    }
                }
            }

            Rectangle {
                id: workspaceSelectionMarker
                width: 3
                height: 20
                radius: 2
                color: clr.accent
                x: 12
                y: {
                    var item = root.page === "timeline" ? timelineNavItem
                             : root.page === "graph" ? graphNavItem
                             : root.page === "validation" ? validationNavItem
                             : root.page === "settings" ? settingsNavItem
                             : root.page === "history" ? historyNavItem
                             : entriesNavItem
                    return item.mapToItem(workspaceSelectionMarker.parent, 0, 0).y + (item.height - height) / 2
                }
                Behavior on y {
                    enabled: backend.animationsEnabled
                    SpringAnimation { spring:2.4; damping:0.26; mass:0.78; epsilon:0.1 }
                }
            }
        }

        // ── 主工作区 ────────────────────────────────────────
        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            color: "transparent"

            StackLayout {
                id: workspaceStack
                anchors.fill: parent
                anchors.margins: 16
                currentIndex: root.page==="timeline" ? 1 : root.page==="graph" ? 2 : root.page==="validation" ? 3 : root.page==="settings" ? 4 : root.page==="history" ? 5 : 0

                // ════════ 0. 词条库页面 ════════
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 12

                    // 左：词条列表
                    GlassPane {
                        Layout.preferredWidth: 320
                        Layout.fillHeight: true

                        ColumnLayout {
                            anchors.fill: parent
                            anchors.margins: 0
                            spacing: 0

                            // 列表头部
                            Rectangle {
                                Layout.fillWidth: true
                                height: 44
                                color: "transparent"
                                Text { anchors.left:parent.left; anchors.leftMargin:16; anchors.verticalCenter:parent.verticalCenter; text:"词条"; color:clr.textPrimary; font.pixelSize:14; font.weight:Font.DemiBold }
                                Text { anchors.right:parent.right; anchors.rightMargin:16; anchors.verticalCenter:parent.verticalCenter; text:backend.entityCount; color:clr.textMuted; font.pixelSize:12 }
                                Rectangle { anchors.bottom:parent.bottom; anchors.left:parent.left; anchors.right:parent.right; height:1; color:clr.border }
                            }

                            // 类型筛选
                            ScrollView {
                                id: entityTypeFilter
                                Layout.fillWidth: true
                                Layout.preferredHeight: 88
                                Layout.minimumHeight: 64
                                leftPadding: 10; rightPadding: 10
                                topPadding: 4; bottomPadding: 4
                                ScrollBar.horizontal.policy: ScrollBar.AlwaysOff
                                ScrollBar.vertical.policy: ScrollBar.AsNeeded
                                clip: true
                                Flow {
                                    width: entityTypeFilter.availableWidth
                                    spacing: 6
                                    Button {
                                        checkable: true; checked: backend.typeFilter === ""
                                        text: "全部"
                                        onClicked: backend.setTypeFilter("")
                                        implicitHeight: 26
                                        contentItem: Text { text:parent.text; color:parent.checked?"#ffffff":clr.textSecondary; font.pixelSize:11; font.weight:parent.checked?Font.Medium:Font.Normal; horizontalAlignment:Text.AlignHCenter; verticalAlignment:Text.AlignVCenter }
                                        background: Rectangle { radius:6; color: parent.checked?clr.accent: (parent.hovered?clr.surfaceHigh:"transparent"); border.width: parent.checked?0:1; border.color:clr.border; Behavior on color { ColorAnimation { duration:100 } } }
                                    }
                                    Repeater {
                                        model: backend.typeModelObject
                                        Button {
                                            checkable: true; checked: backend.typeFilter === model.id
                                            text: model.name
                                            onClicked: backend.setTypeFilter(model.id)
                                            implicitHeight: 26
                                            contentItem: Text { text:parent.text; color:parent.checked?"#ffffff":clr.textSecondary; font.pixelSize:11; font.weight:parent.checked?Font.Medium:Font.Normal; horizontalAlignment:Text.AlignHCenter; verticalAlignment:Text.AlignVCenter }
                                            background: Rectangle { radius:6; color: parent.checked?clr.typeColor(model.id): (parent.hovered?clr.surfaceHigh:"transparent"); border.width: parent.checked?0:1; border.color:clr.border; Behavior on color { ColorAnimation { duration:100 } } }
                                        }
                                    }
                                }
                            }

                            Rectangle { Layout.fillWidth: true; height:1; color:clr.border }

                            // 词条列表
                            ListView {
                                id: entityList
                                Layout.fillWidth: true
                                Layout.fillHeight: true
                                clip: true
                                model: backend.entityModelObject
                                currentIndex: -1
                                ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded; contentItem: Rectangle { implicitWidth:6; color: clr.border; radius:3 } }
                                spacing: 2
                                leftMargin: 6; rightMargin: 6; topMargin: 6; bottomMargin: 6

                                delegate: ItemDelegate {
                                    id: entityDelegate
                                    width: entityList.width - 12
                                    implicitHeight: backend.compactMode ? 46 : 58
                                    hoverEnabled: true
                                    highlighted: backend.currentEntityId === model.id
                                    scale: down ? 0.985 : highlighted ? 1.018 : hovered ? 1.006 : 1
                                    Behavior on scale { enabled: backend.animationsEnabled; SpringAnimation { spring:3.6; damping:0.22; mass:0.72; epsilon:0.001 } }
                                    onClicked: backend.selectEntity(model.id)

                                    background: Rectangle {
                                        radius: 7
                                        color: entityDelegate.highlighted ? clr.accentSoft : entityDelegate.hovered ? clr.surfaceHigh : "transparent"
                                        Behavior on color { ColorAnimation { duration:100 } }
                                        Rectangle {
                                            visible: entityDelegate.highlighted
                                            width:3; height:24; radius:2; color:clr.accent
                                            anchors.left:parent.left; anchors.leftMargin:2; anchors.verticalCenter:parent.verticalCenter
                                        }
                                    }

                                    contentItem: RowLayout {
                                        spacing: 8
                                        // 类型颜色条
                                        Rectangle {
                                            width: 4; height: 32; radius: 2
                                            color: clr.typeColor(model.typeId)
                                        }
                                        ColumnLayout {
                                            Layout.fillWidth: true
                                            spacing: 1
                                            RowLayout {
                                                spacing: 6
                                                Text { text: model.name; color: entityDelegate.highlighted?clr.accent:clr.textPrimary; font.pixelSize:13; font.weight:Font.Medium; elide:Text.ElideRight; Layout.fillWidth:true }
                                                Text { text: model.typeName; color: clr.textMuted; font.pixelSize:10; }
                                            }
                                            Text {
                                                Layout.fillWidth: true
                                                text: model.summary || "（无摘要）"
                                                color: model.summary?clr.textSecondary:clr.textMuted
                                                font.pixelSize:11
                                                elide: Text.ElideRight
                                                maximumLineCount: 1
                                            }
                                        }
                                    }
                                }
                            }

                            // 空状态
                            Text {
                                Layout.fillWidth: true; Layout.fillHeight: true
                                visible: !backend.hasProject
                                text: "未打开任何资料库\n点击右上角“打开”或“新建”"
                                color: clr.textMuted; font.pixelSize:12
                                horizontalAlignment: Text.AlignHCenter
                                verticalAlignment: Text.AlignVCenter
                            }
                        }
                    }

                    // 右：编辑区
                    GlassPane {
                        objectName: "entryEditorPanel"
                        Layout.fillWidth: true
                        Layout.fillHeight: true

                        ColumnLayout {
                            anchors.fill: parent
                            anchors.margins: 0
                            spacing: 0

                            // 编辑区头部
                            Rectangle {
                                Layout.fillWidth: true
                                height: 48
                                color: "transparent"
                                Rectangle { anchors.bottom:parent.bottom; anchors.left:parent.left; anchors.right:parent.right; height:1; color:clr.border }
                                RowLayout {
                                    anchors.fill:parent; anchors.leftMargin:16; anchors.rightMargin:12
                                    spacing: 8

                                    Text {
                                        text: backend.readOnly ? "只读阅读" : backend.currentEntityId ? "编辑词条" : "词条详情"
                                        color: clr.textPrimary; font.pixelSize:14; font.weight:Font.DemiBold
                                        Layout.alignment: Qt.AlignVCenter
                                    }

                                    Item { Layout.fillWidth: true }

                                    SecondaryBtn { text:"保存"; enabled:backend.hasProject&&backend.currentEntityId&&!backend.readOnly; onClicked:backend.saveEntity() }
                                    SecondaryBtn { text:"删除"; enabled:!backend.readOnly&&backend.currentEntityId!==""&&!backend.dirty; onClicked:deleteDialog.open() }
                                }
                            }

                            // 空状态
                            Item {
                                Layout.fillWidth: true; Layout.fillHeight: true
                                visible: !backend.hasProject || !backend.currentEntityId
                                ColumnLayout {
                                    anchors.centerIn: parent
                                    spacing: 10
                                    Text {
                                        text: !backend.hasProject ? "📁" : "✦"
                                        font.pixelSize: 48; color: clr.textMuted
                                        Layout.alignment: Qt.AlignHCenter
                                    }
                                    Text {
                                        text: !backend.hasProject ? "请先打开或创建资料库" : "选择左侧词条查看详情"
                                        color: clr.textMuted; font.pixelSize:13
                                        Layout.alignment: Qt.AlignHCenter
                                    }
                                }
                            }

                            ScrollView {
                                id: structuredReader
                                Layout.fillWidth: true
                                Layout.fillHeight: true
                                visible: backend.hasProject && backend.currentEntityId && backend.readOnly
                                clip: true
                                contentWidth: availableWidth
                                ColumnLayout {
                                    width: structuredReader.availableWidth
                                    spacing: 16
                                    Item { Layout.fillWidth:true; height:4 }
                                    ColumnLayout {
                                        Layout.fillWidth:true; Layout.leftMargin:20; Layout.rightMargin:20
                                        spacing:8
                                        RowLayout {
                                            Layout.fillWidth:true; spacing:10
                                            Rectangle {
                                                Layout.preferredWidth:44; Layout.preferredHeight:44
                                                radius:10; color:clr.withAlpha(backend.currentColor,0.18); border.width:1; border.color:backend.currentColor
                                                Text { anchors.centerIn:parent; text:backend.currentTypeName.slice(0,1); color:backend.currentColor; font.pixelSize:20; font.weight:Font.DemiBold }
                                            }
                                            ColumnLayout {
                                                Layout.fillWidth:true; spacing:2
                                                Text { Layout.fillWidth:true; text:backend.currentName; color:clr.textPrimary; font.pixelSize:20; font.weight:Font.DemiBold; wrapMode:Text.Wrap }
                                                Text { text:backend.currentTypeName; color:backend.currentColor; font.pixelSize:12; font.weight:Font.Medium }
                                            }
                                        }
                                        Text { Layout.fillWidth:true; text:backend.currentSummary || "暂无简介"; color:backend.currentSummary?clr.textSecondary:clr.textMuted; font.pixelSize:13; wrapMode:Text.Wrap }
                                    }
                                    Rectangle { Layout.fillWidth:true; Layout.leftMargin:20; Layout.rightMargin:20; height:1; color:clr.divider }
                                    ColumnLayout {
                                        Layout.fillWidth:true; Layout.leftMargin:20; Layout.rightMargin:20; spacing:8
                                        Text { text:"词条信息"; color:clr.textPrimary; font.pixelSize:13; font.weight:Font.DemiBold }
                                        GridLayout {
                                            Layout.fillWidth:true; columns:2; columnSpacing:16; rowSpacing:8
                                            Text { text:"别名"; color:clr.textMuted; font.pixelSize:11 }
                                            Text { Layout.fillWidth:true; text:backend.currentAliases || "暂无"; color:clr.textSecondary; font.pixelSize:12; wrapMode:Text.Wrap }
                                            Text { text:"标签"; color:clr.textMuted; font.pixelSize:11 }
                                            Text { Layout.fillWidth:true; text:backend.currentTags || "暂无"; color:clr.textSecondary; font.pixelSize:12; wrapMode:Text.Wrap }
                                            Text { text:"UUID"; color:clr.textMuted; font.pixelSize:11 }
                                            Text { Layout.fillWidth:true; text:backend.currentUuid; color:clr.textSecondary; font.pixelSize:11; font.family:"Consolas"; wrapMode:Text.WrapAnywhere }
                                            Text { text:"最后更新"; color:clr.textMuted; font.pixelSize:11 }
                                            Text { Layout.fillWidth:true; text:backend.currentUpdatedAt; color:clr.textSecondary; font.pixelSize:11 }
                                        }
                                    }
                                    ColumnLayout {
                                        Layout.fillWidth:true; Layout.leftMargin:20; Layout.rightMargin:20; spacing:8
                                        Text { text:"类型属性"; color:clr.textPrimary; font.pixelSize:13; font.weight:Font.DemiBold }
                                        Repeater {
                                            model:backend.fieldModelObject
                                            delegate:RowLayout {
                                                required property string name
                                                required property string valueText
                                                visible:valueText !== ""
                                                Layout.fillWidth:true; spacing:12
                                                Text { Layout.preferredWidth:150; text:parent.name; color:clr.textMuted; font.pixelSize:11; wrapMode:Text.Wrap }
                                                Text { Layout.fillWidth:true; text:parent.valueText; color:clr.textSecondary; font.pixelSize:12; wrapMode:Text.Wrap; textFormat:Text.PlainText }
                                            }
                                        }
                                    }
                                    ColumnLayout {
                                        Layout.fillWidth:true; Layout.leftMargin:20; Layout.rightMargin:20; spacing:8
                                        RowLayout {
                                            Layout.fillWidth:true
                                            Text { text:"纪年记录"; color:clr.textPrimary; font.pixelSize:13; font.weight:Font.DemiBold }
                                            Item { Layout.fillWidth:true }
                                            Text { text:backend.dateCount + " 条"; color:clr.textMuted; font.pixelSize:11 }
                                        }
                                        Repeater {
                                            model:backend.dateModelObject
                                            delegate:RowLayout {
                                                required property string label
                                                required property string dateKind
                                                required property var year
                                                required property var endYear
                                                required property string dateText
                                                Layout.fillWidth:true; spacing:8
                                                Rectangle { width:3; height:24; radius:2; color:clr.accent }
                                                Text { Layout.fillWidth:true; text:parent.label || parent.dateKind; color:clr.textSecondary; font.pixelSize:12; elide:Text.ElideRight }
                                                Text { text:terraYear(parent.year) + (parent.endYear !== null && parent.endYear !== undefined ? " 至 " + terraYear(parent.endYear) : "") + (parent.dateText ? " · " + parent.dateText : ""); color:clr.textMuted; font.pixelSize:11; elide:Text.ElideRight }
                                            }
                                        }
                                        Text { visible:backend.dateCount===0; text:"暂无纪年记录"; color:clr.textMuted; font.pixelSize:11 }
                                    }
                                    ColumnLayout {
                                        Layout.fillWidth:true; Layout.leftMargin:20; Layout.rightMargin:20; spacing:8
                                        RowLayout {
                                            Layout.fillWidth:true
                                            Text { text:"词条关联"; color:clr.textPrimary; font.pixelSize:13; font.weight:Font.DemiBold }
                                            Item { Layout.fillWidth:true }
                                            Text { text:backend.relationCount + " 条"; color:clr.textMuted; font.pixelSize:11 }
                                        }
                                        Repeater {
                                            model:backend.relationModelObject
                                            delegate:ItemDelegate {
                                                required property string otherId
                                                required property string otherName
                                                required property string label
                                                Layout.fillWidth:true; implicitHeight:42; hoverEnabled:true
                                                onClicked:{backend.previewEntity(otherId);previewDialog.open()}
                                                background:Rectangle { radius:6; color:parent.hovered?clr.surfaceHigh:"transparent"; Behavior on color { ColorAnimation { duration:120 } } }
                                                contentItem:RowLayout {
                                                    Text { text:parent.parent.label; color:clr.accent; font.pixelSize:11 }
                                                    Text { text:parent.parent.otherName; color:clr.textSecondary; font.pixelSize:12; elide:Text.ElideRight; Layout.fillWidth:true }
                                                    Text { text:"↗"; color:clr.textMuted; font.pixelSize:13 }
                                                }
                                            }
                                        }
                                        Text { visible:backend.relationCount===0; text:"暂无关联词条"; color:clr.textMuted; font.pixelSize:11 }
                                    }
                                    ColumnLayout {
                                        Layout.fillWidth:true; Layout.leftMargin:20; Layout.rightMargin:20; spacing:8
                                        Text { text:"正文"; color:clr.textPrimary; font.pixelSize:13; font.weight:Font.DemiBold }
                                        Text { Layout.fillWidth:true; text:backend.currentNotes || "暂无正文"; color:backend.currentNotes?clr.textSecondary:clr.textMuted; font.pixelSize:12; wrapMode:Text.Wrap; textFormat:Text.PlainText }
                                    }
                                    Item { Layout.fillWidth:true; height:20 }
                                }
                            }

                            // 编辑表单
                                    ScrollView {
                                        id: entityEditorScroll
                                        Layout.fillWidth: true; Layout.fillHeight: true
                                        visible: backend.hasProject && backend.currentEntityId && !backend.readOnly
                                clip: true
                                contentWidth: availableWidth
                                ColumnLayout {
                                    id: entityEditorForm
                                    width: entityEditorScroll.availableWidth
                                    spacing: 14

                                    Item { Layout.fillWidth: true; height: 4 }

                                    // 名称
                                    ColumnLayout {
                                        Layout.fillWidth: true; Layout.leftMargin:20; Layout.rightMargin:20
                                        spacing: 4
                                        Text { text:"名称"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                                        TextField {
                                            id: nameField
                                            Layout.fillWidth: true; implicitHeight: 36
                                            text: backend.currentName; placeholderText: "未命名词条"
                                            readOnly: backend.readOnly
                                            color: clr.textPrimary; placeholderTextColor: clr.textMuted; selectByMouse: true
                                            onTextEdited: backend.setCurrentField("name", text)
                                            background: Rectangle { radius:7; color:clr.input; border.width: nameField.activeFocus?2:1; border.color: nameField.activeFocus?clr.accent:clr.inputBorder; Behavior on border.color { ColorAnimation { duration:120 } } }
                                        }
                                    }

                                    // 类型 + 颜色
                                    RowLayout {
                                        Layout.fillWidth: true; Layout.leftMargin:20; Layout.rightMargin:20
                                        spacing: 12
                                        ColumnLayout {
                                            Layout.fillWidth: true; spacing: 4
                                            Text { text:"类型"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                                            ComboBox {
                                                id: typeCombo
                                                objectName: "typeEditorCombo"
                                                Layout.fillWidth: true; implicitHeight: 36
                                                enabled: !backend.readOnly
                                                model: backend.typeModelObject; textRole: "name"; valueRole: "id"
                                                onActivated: backend.setCurrentField("typeId", currentValue)
                                                contentItem: Text { leftPadding:10; rightPadding:30; text: typeCombo.displayText; color:clr.textPrimary; font.pixelSize:13; verticalAlignment:Text.AlignVCenter; elide:Text.ElideRight }
                                                background: Rectangle { radius:7; color:clr.input; border.width:1; border.color:clr.inputBorder }
                                                indicator: Text { anchors.right:parent.right; anchors.rightMargin:10; anchors.verticalCenter:parent.verticalCenter; text:"▾"; color:clr.textMuted; font.pixelSize:11 }
                                                delegate: ItemDelegate {
                                                    id: typeComboDelegate
                                                    required property int index
                                                    required property string id
                                                    required property string name
                                                    width: typeCombo.width
                                                    hoverEnabled: true
                                                    contentItem: RowLayout { spacing:6; Rectangle{width:4;height:16;radius:2;color:clr.typeColor(typeComboDelegate.id)} Text{text:typeComboDelegate.name;color:clr.textPrimary;font.pixelSize:13;Layout.fillWidth:true;elide:Text.ElideRight} }
                                                    background: Rectangle { color: parent.hovered?clr.surfaceHigh:"transparent"; radius:4 }
                                                }
                                                popup: Popup {
                                                    id: typeComboPopup
                                                    enter: PopupIn {}
                                                    exit: PopupOut {}
                                                    y: typeCombo.height; width: typeCombo.width
                                                    implicitHeight: Math.min(contentItem.implicitHeight+4, 280)
                                                    padding: 4
                                                    contentItem: ListView { clip:true; implicitHeight:contentHeight; model: typeComboPopup.visible ? typeCombo.delegateModel : null; currentIndex: typeComboPopup.visible ? typeCombo.highlightedIndex : -1; ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded } }
                                                    background: Rectangle { radius:7; color:clr.surface; border.width:1; border.color:clr.border }
                                                }
                                            }
                                        }
                                        ColumnLayout {
                                            Layout.preferredWidth: 80; spacing: 4
                                            Text { text:"颜色"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                                            Rectangle {
                                                Layout.fillWidth: true; implicitHeight:36; radius:7
                                                color: backend.currentColor; border.width:1; border.color:clr.inputBorder
                                                MouseArea {
                                                    anchors.fill: parent; cursorShape: Qt.PointingHandCursor
                                                    enabled: !backend.readOnly
                                                    onClicked: colorPicker.open()
                                                    Popup {
                                                        id: colorPicker; enter: PopupIn {}
                                                        exit: PopupOut {}
                                                    y: -100; x: -20
                                                    width: 232; padding: 10
                                                        background: Rectangle { radius:8; color:clr.surface; border.width:1; border.color:clr.border }
                                                    contentItem: ColumnLayout {
                                                        spacing:8
                                                        Text { text:"快速选择"; color:clr.textMuted; font.pixelSize:10; font.weight:Font.DemiBold }
                                                        Flow {
                                                            Layout.fillWidth:true
                                                            spacing:6
                                                            Repeater {
                                                                model: ["#8b5cf6","#7c3aed","#6366f1","#3b82f6","#0ea5e9","#14b8a6","#10b981","#84cc16","#eab308","#f59e0b","#f97316","#ef4444","#ec4899","#f43f5e","#6b7280","#000000"]
                                                                Rectangle {
                                                                    id: colorSwatchDelegate
                                                                    required property string modelData
                                                                    width:24; height:24; radius:5
                                                                    color:modelData; border.width:1; border.color:clr.border
                                                                    MouseArea { anchors.fill:parent; cursorShape:Qt.PointingHandCursor; onClicked:{backend.setCurrentField("color", colorSwatchDelegate.modelData);colorPicker.close()} }
                                                                }
                                                            }
                                                        }
                                                        SecondaryBtn {
                                                            Layout.fillWidth:true
                                                            text:"调色盘 / RGB…"
                                                            onClicked: {
                                                                var color = backend.chooseCustomColor(backend.currentColor)
                                                                if (color) backend.setCurrentField("color", color)
                                                                colorPicker.close()
                                                            }
                                                            }
                                                    }
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    // 摘要
                                    ColumnLayout {
                                        Layout.fillWidth: true; Layout.leftMargin:20; Layout.rightMargin:20
                                        spacing: 4
                                        Text { text:"摘要"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                                        TextArea {
                                            id: summaryField
                                            readOnly: backend.readOnly
                                            Layout.fillWidth: true; Layout.preferredHeight: 70
                                            text: backend.currentSummary; placeholderText: "一句话说明"
                                            color: clr.textPrimary; placeholderTextColor: clr.textMuted; selectByMouse: true; wrapMode: TextArea.Wrap
                                            onTextEdited: backend.setCurrentField("summary", text)
                                            background: Rectangle { radius:7; color:clr.input; border.width: summaryField.activeFocus?2:1; border.color: summaryField.activeFocus?clr.accent:clr.inputBorder; Behavior on border.color { ColorAnimation { duration:120 } } }
                                        }
                                    }

                                    // 别名
                                    ColumnLayout {
                                        Layout.fillWidth: true; Layout.leftMargin:20; Layout.rightMargin:20
                                        spacing: 4
                                        Text { text:"别名（逗号分隔）"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                                        TextField {
                                            id: aliasesField
                                            readOnly: backend.readOnly
                                            Layout.fillWidth: true; implicitHeight: 36
                                            text: backend.currentAliases; placeholderText: "曾用名、外号、译名"
                                            color: clr.textPrimary; placeholderTextColor: clr.textMuted; selectByMouse: true
                                            onTextEdited: backend.setCurrentField("aliases", text)
                                            background: Rectangle { radius:7; color:clr.input; border.width: aliasesField.activeFocus?2:1; border.color: aliasesField.activeFocus?clr.accent:clr.inputBorder; Behavior on border.color { ColorAnimation { duration:120 } } }
                                        }
                                    }

                                    // 标签
                                    ColumnLayout {
                                        Layout.fillWidth: true; Layout.leftMargin:20; Layout.rightMargin:20
                                        spacing: 4
                                        Text { text:"标签（逗号分隔）"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                                        TextField {
                                            id: tagsField
                                            readOnly: backend.readOnly
                                            Layout.fillWidth: true; implicitHeight: 36
                                            text: backend.currentTags; placeholderText: "主角、反派、重要"
                                            color: clr.textPrimary; placeholderTextColor: clr.textMuted; selectByMouse: true
                                            onTextEdited: backend.setCurrentField("tags", text)
                                            background: Rectangle { radius:7; color:clr.input; border.width: tagsField.activeFocus?2:1; border.color: tagsField.activeFocus?clr.accent:clr.inputBorder; Behavior on border.color { ColorAnimation { duration:120 } } }
                                        }
                                    }

                                    // 正文
                                    ColumnLayout {
                                        Layout.fillWidth: true; Layout.leftMargin:20; Layout.rightMargin:20
                                        spacing: 4
                                        Text { text:"正文"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                                        TextArea {
                                            id: notesField
                                            readOnly: backend.readOnly
                                            Layout.fillWidth: true; Layout.preferredHeight: 140
                                            text: backend.currentNotes; placeholderText: "支持 [[UUID|显示文本]] 内部引用"
                                            color: clr.textPrimary; placeholderTextColor: clr.textMuted; selectByMouse: true; wrapMode: TextArea.Wrap
                                            onTextEdited: backend.setCurrentField("notes", text)
                                            background: Rectangle { radius:7; color:clr.input; border.width: notesField.activeFocus?2:1; border.color: notesField.activeFocus?clr.accent:clr.inputBorder; Behavior on border.color { ColorAnimation { duration:120 } } }
                                        }
                                    }

                                    // UUID 信息条
                                    Rectangle {
                                        Layout.fillWidth: true; Layout.leftMargin:20; Layout.rightMargin:20
                                        implicitHeight: 30; radius: 6
                                        color: clr.surfaceHigh; border.width: 1; border.color: clr.border
                                        RowLayout {
                                            anchors.fill:parent; anchors.leftMargin:10; anchors.rightMargin:10
                                            Text { text:"UUID"; color:clr.textMuted; font.pixelSize:10; font.weight:Font.DemiBold }
                                            Text { Layout.fillWidth:true; text:backend.currentUuid; color:clr.textSecondary; font.pixelSize:11; elide:Text.ElideRight }
                                            Text { text:"更新 "+backend.currentUpdatedAt; color:clr.textMuted; font.pixelSize:10 }
                                        }
                                    }

                                    // 自定义属性
                                    ColumnLayout {
                                        Layout.fillWidth: true; Layout.leftMargin:20; Layout.rightMargin:20
                                        spacing: 6
                                        RowLayout {
                                            Layout.fillWidth: true
                                            Text { text:"自定义属性"; color:clr.textPrimary; font.pixelSize:13; font.weight:Font.DemiBold; Layout.fillWidth:true }
                                            SecondaryBtn { text:"+ 属性"; enabled:backend.hasProject&&backend.currentEntityId&&!backend.readOnly; onClicked: root.openFieldEditor("", "", "text", false, "", "[]") }
                                        }
                                        Repeater {
                                            id: fieldRepeater
                                            model: backend.fieldModelObject
                                            delegate: ColumnLayout {
                                                id: fieldDelegate
                                                required property int index
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
                                                spacing: 4
                                                Rectangle {
                                                    Layout.fillWidth: true; height:1; color:clr.divider
                                                    visible: index > 0
                                                }
                                                RowLayout {
                                                    Layout.fillWidth: true
                                                    spacing: 6
                                                    Text {
                                                        text: fieldDelegate.name + (fieldDelegate.isRequired?" *":"")
                                                        color: clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium
                                                        Layout.fillWidth: true
                                                    }
                                                    Text {
                                                        text: "(" + fieldDelegate.fieldType + ")"
                                                        color: clr.textMuted; font.pixelSize:10
                                                    }
                                                    Text {
                                                        text: fieldDelegate.isBuiltin ? "内置" : ""
                                                        color: clr.accent; font.pixelSize:10
                                                        visible: fieldDelegate.isBuiltin
                                                    }
                                                    IconBtn { text:"✎"; hint:"编辑属性定义"; enabled:backend.hasProject&&backend.currentEntityId&&!backend.readOnly; onClicked: root.openFieldEditor(fieldDelegate.id, fieldDelegate.name, fieldDelegate.fieldType, fieldDelegate.isRequired, fieldDelegate.description, fieldDelegate.optionsJson) }
                                                    IconBtn { text:"×"; hint:"删除属性定义"; enabled:backend.hasProject&&backend.currentEntityId&&!backend.readOnly&&!fieldDelegate.isBuiltin; onClicked: { pendingFieldId = fieldDelegate.id; fieldDeleteDialog.open() } }
                                                }

                                                // 根据类型渲染不同编辑器
                                                TextField {
                                                    Layout.fillWidth: true; implicitHeight: 34
                                                    visible: fieldDelegate.fieldType === "text" || fieldDelegate.fieldType === "string" || fieldDelegate.fieldType === "url"
                                                    text: fieldDelegate.valueText
                                                    readOnly: backend.readOnly
                                                    placeholderText: fieldDelegate.description || "输入值..."
                                                    color: clr.textPrimary; placeholderTextColor: clr.textMuted; selectByMouse: true
                                                    onTextEdited: backend.setCustomFieldValue(fieldDelegate.name, JSON.stringify(text))
                                                    background: Rectangle { radius:6; color:clr.input; border.width: parent.activeFocus?2:1; border.color: parent.activeFocus?clr.accent:clr.inputBorder; Behavior on border.color { ColorAnimation { duration:120 } } }
                                                }
                                                TextArea {
                                                    Layout.fillWidth: true; Layout.preferredHeight: 80
                                                    visible: fieldDelegate.fieldType === "textarea" || fieldDelegate.fieldType === "multiline"
                                                    text: fieldDelegate.valueText
                                                    readOnly: backend.readOnly
                                                    placeholderText: fieldDelegate.description || "输入内容..."
                                                    color: clr.textPrimary; placeholderTextColor: clr.textMuted; selectByMouse: true; wrapMode: TextArea.Wrap
                                                    onTextEdited: backend.setCustomFieldValue(fieldDelegate.name, JSON.stringify(text))
                                                    background: Rectangle { radius:6; color:clr.input; border.width: parent.activeFocus?2:1; border.color: parent.activeFocus?clr.accent:clr.inputBorder; Behavior on border.color { ColorAnimation { duration:120 } } }
                                                }
                                                SpinBox {
                                                    Layout.preferredWidth: 160
                                                    visible: fieldDelegate.fieldType === "integer" || fieldDelegate.fieldType === "int"
                                                    enabled: !backend.readOnly
                                                    value: parseInt(fieldDelegate.valueText || "0")
                                                    from: -999999999; to: 999999999; editable: !backend.readOnly
                                                    onValueModified: backend.setCustomFieldValue(fieldDelegate.name, JSON.stringify(value))
                                                    contentItem: TextInput { text: parent.textFromValue(parent.value, parent.locale); font.pixelSize:13; color:clr.textPrimary; horizontalAlignment:Qt.AlignHCenter; verticalAlignment:Qt.AlignVCenter; readOnly: !parent.editable || backend.readOnly; validator: parent.validator }
                                                    background: Rectangle { radius:6; color:clr.input; border.width:1; border.color:clr.inputBorder }
                                                }
                                                TextField {
                                                    Layout.preferredWidth: 160
                                                    visible: fieldDelegate.fieldType === "number" || fieldDelegate.fieldType === "float"
                                                    text: fieldDelegate.valueText
                                                    readOnly: backend.readOnly
                                                    validator: DoubleValidator { decimals: 8; notation: DoubleValidator.StandardNotation }
                                                    color: clr.textPrimary; placeholderTextColor: clr.textMuted; selectByMouse: true
                                                    onTextEdited: backend.setCustomFieldValue(fieldDelegate.name, JSON.stringify(parseFloat(text) || 0))
                                                    background: Rectangle { radius:6; color:clr.input; border.width: parent.activeFocus?2:1; border.color: parent.activeFocus?clr.accent:clr.inputBorder; Behavior on border.color { ColorAnimation { duration:120 } } }
                                                }
                                                Switch {
                                                    visible: fieldDelegate.fieldType === "boolean" || fieldDelegate.fieldType === "bool"
                                                    enabled: !backend.readOnly
                                                    checked: fieldDelegate.valueText === "true"
                                                    onCheckedChanged: backend.setCustomFieldValue(fieldDelegate.name, JSON.stringify(checked))
                                                }
                                                ComboBox {
                                                    id: fieldChoiceCombo
                                                    objectName: "fieldChoiceCombo"
                                                    Layout.fillWidth: true; implicitHeight: 34
                                                    visible: fieldDelegate.fieldType === "choice" || fieldDelegate.fieldType === "select" || fieldDelegate.fieldType === "enum"
                                                    enabled: !backend.readOnly
                                                    model: JSON.parse(fieldDelegate.optionsJson || "[]")
                                                    currentIndex: fieldDelegate.valueText ? Math.max(0, (JSON.parse(fieldDelegate.optionsJson || "[]")).indexOf(fieldDelegate.valueText)) : -1
                                                    onActivated: backend.setCustomFieldValue(fieldDelegate.name, JSON.stringify(currentText))
                                                    contentItem: Text { leftPadding:10; rightPadding:30; text: parent.displayText; color:clr.textPrimary; font.pixelSize:13; verticalAlignment:Text.AlignVCenter; elide:Text.ElideRight }
                                                    background: Rectangle { radius:6; color:clr.input; border.width:1; border.color:clr.inputBorder }
                                                    indicator: Text { anchors.right:parent.right; anchors.rightMargin:10; anchors.verticalCenter:parent.verticalCenter; text:"▾"; color:clr.textMuted; font.pixelSize:11 }
                                                delegate: ItemDelegate {
                                                    required property int index
                                                    required property string modelData
                                                    width: fieldChoiceCombo.width; hoverEnabled: true
                                                    contentItem: Text { text: modelData; color:clr.textPrimary; font.pixelSize:13; verticalAlignment:Text.AlignVCenter }
                                                    background: Rectangle { color: parent.hovered?clr.surfaceHigh:"transparent"; radius:4 }
                                                    }
                                                    popup: Popup {
                                                        id: fieldChoicePopup
                                                        objectName: "fieldChoicePopup"
                                                        enter: PopupIn {}
                                                        exit: PopupOut {}
                                                        y: fieldChoiceCombo.height; width: fieldChoiceCombo.width
                                                        implicitHeight: Math.min(contentItem.implicitHeight+4, 240)
                                                        padding: 4
                                                        contentItem: ListView { clip:true; implicitHeight:contentHeight; model: fieldChoicePopup.visible ? fieldChoiceCombo.delegateModel : null; currentIndex: fieldChoicePopup.visible ? fieldChoiceCombo.highlightedIndex : -1; ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded } }
                                                        background: Rectangle { radius:7; color:clr.surface; border.width:1; border.color:clr.border }
                                                    }
                                                }
                                                // 实体引用
                                                TextField {
                                                    Layout.fillWidth: true; implicitHeight: 34
                                                    visible: fieldDelegate.fieldType === "entity_ref" || fieldDelegate.fieldType === "entity_reference" || fieldDelegate.fieldType === "entity"
                                                    text: fieldDelegate.valueText
                                                    readOnly: backend.readOnly
                                                    placeholderText: "输入 UUID"
                                                    color: clr.textPrimary; placeholderTextColor: clr.textMuted; selectByMouse: true
                                                    onTextEdited: backend.setCustomFieldValue(fieldDelegate.name, JSON.stringify(text))
                                                    background: Rectangle { radius:6; color:clr.input; border.width: parent.activeFocus?2:1; border.color: parent.activeFocus?clr.accent:clr.inputBorder; Behavior on border.color { ColorAnimation { duration:120 } } }
                                                }
                                                // JSON 编辑
                                                TextArea {
                                                    Layout.fillWidth: true; Layout.preferredHeight: 100
                                                    visible: fieldDelegate.fieldType === "json" || fieldDelegate.fieldType === "date"
                                                    text: fieldDelegate.valueJson || fieldDelegate.valueText
                                                    readOnly: backend.readOnly
                                                    color: clr.textPrimary; placeholderTextColor: clr.textMuted; selectByMouse: true; wrapMode: TextArea.Wrap
                                                    font.family: "Consolas"; font.pixelSize: 11
                                                    onTextEdited: {
                                                        try { backend.setCustomFieldValue(fieldDelegate.name, text) }
                                                        catch (e) { }
                                                    }
                                                    background: Rectangle { radius:6; color:clr.surfaceHigh; border.width:1; border.color:clr.border }
                                                }
                                            }
                                        }
                                    }

                                    // 日期列表
                                    ColumnLayout {
                                        Layout.fillWidth: true; Layout.leftMargin:20; Layout.rightMargin:20
                                        spacing: 6
                                        RowLayout {
                                            Layout.fillWidth: true
                                            Text { text:"日期记录"; color:clr.textPrimary; font.pixelSize:13; font.weight:Font.DemiBold; Layout.fillWidth:true }
                                            SecondaryBtn { text:"+ 日期"; enabled:backend.hasProject&&backend.currentEntityId&&!backend.readOnly; onClicked: { dateIdField.text=""; dateKindField.text="custom"; dateLabelField.text=""; dateYearField.text=""; dateValueField.text=""; dateEndYearField.text=""; dateEndValueField.text=""; dateDialog.open() } }
                                        }
                                        Repeater {
                                            model: backend.dateModelObject
                                            delegate: Rectangle {
                                                Layout.fillWidth: true
                                                implicitHeight: 44; radius: 7
                                                color: clr.surfaceHigh; border.width:1; border.color:clr.border
                                                RowLayout {
                                                    anchors.fill:parent; anchors.leftMargin:10; anchors.rightMargin:8
                                                    spacing: 8
                                                    Rectangle { width:3; height:20; radius:2; color:clr.accent }
                                                    ColumnLayout {
                                                        Layout.fillWidth: true; spacing: 1
                                                        Text { text: model.label || model.dateKind; color:clr.textPrimary; font.pixelSize:12; font.weight:Font.Medium; elide:Text.ElideRight; Layout.fillWidth:true }
                                                        Text { text: terraYear(model.year) + (model.endYear ? " 至 " + terraYear(model.endYear) : "") + (model.dateText && model.precision!=="year" ? "  " + model.dateText : ""); color:clr.textSecondary; font.pixelSize:11; elide:Text.ElideRight }
                                                    }
                                                    IconBtn { text:"✎"; hint:"编辑日期"; enabled:backend.hasProject&&backend.currentEntityId&&!backend.readOnly; onClicked: { dateIdField.text=model.id; dateKindField.text=model.dateKind; dateLabelField.text=model.label; dateYearField.text=model.year?String(model.year):""; datePrecision.currentValue=model.precision; dateValueField.text=model.dateText; dateEndYearField.text=model.endYear?String(model.endYear):""; dateEndValueField.text=model.endDateText; dateDialog.open() } }
                                                    IconBtn { text:"×"; hint:"删除日期"; enabled:backend.hasProject&&backend.currentEntityId&&!backend.readOnly; onClicked: backend.removeDate(model.id) }
                                                }
                                            }
                                        }
                                    }

                                    // 关联关系
                                    ColumnLayout {
                                        Layout.fillWidth: true; Layout.leftMargin:20; Layout.rightMargin:20
                                        spacing: 6
                                        RowLayout {
                                            Layout.fillWidth: true
                                            Text { text:"关联关系"; color:clr.textPrimary; font.pixelSize:13; font.weight:Font.DemiBold; Layout.fillWidth:true }
                                            SecondaryBtn { text:"+ 关联"; enabled:backend.currentEntityId!==""&&!backend.readOnly&&!backend.dirty; onClicked: { backend.prepareRelation(""); relationDialog.open() } }
                                        }
                                        Repeater {
                                            model: backend.relationModelObject
                                            delegate: Rectangle {
                                                Layout.fillWidth: true
                                                implicitHeight: 48; radius: 7
                                                color: clr.surfaceHigh; border.width:1; border.color:clr.border
                                                RowLayout {
                                                    anchors.fill:parent; anchors.leftMargin:10; anchors.rightMargin:8
                                                    spacing: 8
                                                    ColumnLayout {
                                                        Layout.fillWidth: true; spacing: 1
                                                        Text { text: model.label; color:clr.textPrimary; font.pixelSize:12; font.weight:Font.Medium; elide:Text.ElideRight; Layout.fillWidth:true }
                                                        Text { text: model.otherName; color:clr.textSecondary; font.pixelSize:11; elide:Text.ElideRight }
                                                    }
                                                    IconBtn { text:"↗"; hint:"查看关联词条"; onClicked: { backend.previewEntity(model.otherId); previewDialog.open() } }
                                                    IconBtn { text:"✎"; hint:"编辑关联"; enabled:backend.hasProject&&!backend.readOnly&&!backend.dirty; onClicked: { backend.prepareRelation(model.id); relationDialog.open() } }
                                                    IconBtn { text:"×"; hint:"删除关联"; enabled:backend.hasProject&&!backend.readOnly&&!backend.dirty; onClicked: { pendingRelationId = model.id; relationDeleteDialog.open() } }
                                                }
                                            }
                                        }

                                        Text {
                                            Layout.fillWidth: true
                                            visible: backend.relationCount === 0
                                            text: "尚无关联关系，点击右上角添加"
                                            color: clr.textMuted; font.pixelSize: 11
                                            horizontalAlignment: Text.AlignHCenter
                                            topPadding: 12; bottomPadding: 12
                                        }
                                    }

                                    Item { Layout.fillWidth: true; height: 20 }
                                }
                            }
                        }
                    }
                }

                // ════════ 1. 时间线页面 ════════
                GlassPane {
                    radius: 12
                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 0
                        spacing: 0

                        // 顶部工具栏
                        Rectangle {
                            Layout.fillWidth: true
                            height: 48
                            color: "transparent"
                            Rectangle { anchors.bottom:parent.bottom; anchors.left:parent.left; anchors.right:parent.right; height:1; color:clr.border }
                            RowLayout {
                                anchors.fill:parent; anchors.leftMargin:16; anchors.rightMargin:16
                                spacing: 8
                                Text { text:"时间线"; color:clr.textPrimary; font.pixelSize:14; font.weight:Font.DemiBold }
                                Text { text: backend.timelineBoundsText; color:clr.textSecondary; font.pixelSize:12 }
                                Item { Layout.fillWidth: true }
                                Text { text: backend.timelineCount + " 条记录"; color:clr.textMuted; font.pixelSize:11 }
                                IconBtn { text:"−"; hint:"缩小时间范围"; enabled:timelineViewport.timelineScale>0.2; onClicked:timelineViewport.zoomAt(timelineViewport.timelineScale/1.2,timelineViewport.width/2) }
                                Text { text:Math.round(timelineViewport.timelineScale*100)+"%"; color:clr.textSecondary; font.pixelSize:11; Layout.preferredWidth:38; horizontalAlignment:Text.AlignHCenter }
                                IconBtn { text:"+"; hint:"放大时间范围"; enabled:timelineViewport.timelineScale<12; onClicked:timelineViewport.zoomAt(timelineViewport.timelineScale*1.2,timelineViewport.width/2) }
                                IconBtn { text:"⌗"; hint:"适配全部日期"; enabled:backend.timelineCount>0; onClicked:timelineViewport.fitTimeline() }
                            }
                        }

                        // 类型筛选
                        RowLayout {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 40
                            Layout.leftMargin: 12
                            Layout.rightMargin: 12
                            spacing: 8
                            Text { text:"类型筛选"; color:clr.textSecondary; font.pixelSize:11 }
                            ComboBox {
                                id: timelineTypeFilter
                                Layout.preferredWidth: 190
                                Layout.preferredHeight: 30
                                model: backend.typeModelObject
                                textRole: "name"
                                valueRole: "id"
                                currentIndex: backend.timelineTypeFilter === "" ? -1 : indexOfValue(backend.timelineTypeFilter)
                                onActivated: backend.setTimelineTypeFilter(currentValue)
                                contentItem: Text {
                                    leftPadding: 9
                                    text: timelineTypeFilter.currentIndex < 0 ? "全部类型" : timelineTypeFilter.displayText
                                    color: clr.textPrimary
                                    font.pixelSize: 11
                                    verticalAlignment: Text.AlignVCenter
                                    elide: Text.ElideRight
                                }
                                background: Rectangle { radius:6; color:clr.input; border.width:1; border.color:clr.inputBorder }
                                delegate: ItemDelegate {
                                    required property string name
                                    required property int index
                                    width: timelineTypeFilter.width
                                    highlighted: timelineTypeFilter.highlightedIndex === index
                                    contentItem: Text { text:parent.name; color:clr.textPrimary; font.pixelSize:11; verticalAlignment:Text.AlignVCenter }
                                    background: Rectangle { radius:4; color:parent.hovered?clr.surfaceHigh:"transparent" }
                                }
                                popup: Popup {
                                    y: timelineTypeFilter.height
                                    width: timelineTypeFilter.width
                                    implicitHeight: Math.min(contentItem.implicitHeight + 8, 320)
                                    padding: 4
                                    contentItem: ListView {
                                        clip: true
                                        implicitHeight: contentHeight
                                        model: timelineTypeFilter.popup.visible ? timelineTypeFilter.delegateModel : null
                                        currentIndex: timelineTypeFilter.highlightedIndex
                                        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }
                                    }
                                    background: Rectangle { radius:7; color:clr.surface; border.width:1; border.color:clr.border }
                                }
                            }
                            IconBtn {
                                visible: backend.timelineTypeFilter !== ""
                                text:"×"; hint:"清除类型筛选"
                                onClicked: backend.setTimelineTypeFilter("")
                            }
                            Item { Layout.fillWidth: true }
                        }

                        Rectangle { Layout.fillWidth: true; height:1; color:clr.border }

                        // 时间线主体
                        Item {
                            id: timelineViewport
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            clip: true
                            property real timelineScale: 1
                            property real timelineCenterYear: (Number(backend.timelineMinYear) + Number(backend.timelineMaxYear)) / 2

                            function visibleYearSpan() {
                                return Math.max(10, Number(backend.timelineMaxYear) - Number(backend.timelineMinYear)) * 1.12 / timelineScale
                            }

                            function zoomAt(targetScale, positionX) {
                                var previousSpan = visibleYearSpan()
                                var fraction = Math.max(0, Math.min(1, positionX / Math.max(1, width)))
                                var anchor = timelineCenterYear + (fraction - 0.5) * previousSpan
                                var nextScale = Math.max(0.2, Math.min(12, targetScale))
                                var nextSpan = Math.max(10, Number(backend.timelineMaxYear) - Number(backend.timelineMinYear)) * 1.12 / nextScale
                                timelineCenterYear = anchor + (0.5 - fraction) * nextSpan
                                timelineScale = nextScale
                                timelineCanvas.requestPaint()
                            }

                            function fitTimeline() {
                                timelineScale = 1
                                timelineCenterYear = (Number(backend.timelineMinYear) + Number(backend.timelineMaxYear)) / 2
                                timelineCanvas.requestPaint()
                            }

                            Connections {
                                target: backend
                                function onTimelineChanged() {
                                    if (timelineViewport.timelineScale === 1)
                                        timelineViewport.timelineCenterYear = (Number(backend.timelineMinYear) + Number(backend.timelineMaxYear)) / 2
                                    timelineCanvas.requestPaint()
                                }
                            }

                            MouseArea {
                                anchors.fill: parent
                                acceptedButtons: Qt.NoButton
                                onWheel: function(event) {
                                    var factor = event.angleDelta.y > 0 ? 1.15 : 1 / 1.15
                                    timelineViewport.zoomAt(timelineViewport.timelineScale * factor, event.x)
                                    event.accepted = true
                                }
                            }

                            Canvas {
                                id: timelineCanvas
                                anchors.fill: parent
                                antialiasing: true
                                onPaint: {
                                    var ctx = getContext("2d")
                                    ctx.clearRect(0,0,width,height)
                                    // 中轴
                                    var midY = height / 2
                                    ctx.strokeStyle = clr.border
                                    ctx.lineWidth = 1
                                    ctx.beginPath(); ctx.moveTo(0,midY); ctx.lineTo(width,midY); ctx.stroke()
                                    // 年份刻度
                                    var range = timelineViewport.visibleYearSpan()
                                    var start = timelineViewport.timelineCenterYear - range / 2
                                    var end = start + range
                                    if (range > 0) {
                                        var step = range > 1600 ? 200 : range > 800 ? 100 : range > 320 ? 50 : range > 120 ? 20 : range > 48 ? 10 : range > 20 ? 5 : 1
                                        for (var y = Math.ceil(start/step)*step; y <= end; y += step) {
                                            var x = timelineX(y, width)
                                            ctx.strokeStyle = clr.divider
                                            ctx.beginPath(); ctx.moveTo(x, midY-10); ctx.lineTo(x, midY+10); ctx.stroke()
                                            ctx.fillStyle = clr.textMuted
                                            ctx.font = "11px 'Microsoft YaHei UI'"
                                            var lbl = y < 0 ? backend.eraName+"前 "+Math.abs(y)+"年" : y === 0 ? backend.eraName+"元年" : backend.eraName+" "+y+"年"
                                            ctx.fillText(lbl, x+4, midY+22)
                                        }
                                        // 0年标记
                                        if (start <= 0 && end >= 0) {
                                            var zx = timelineX(0, width)
                                            ctx.strokeStyle = clr.accent; ctx.lineWidth = 2
                                            ctx.setLineDash([4,4])
                                            ctx.beginPath(); ctx.moveTo(zx, 0); ctx.lineTo(zx, height); ctx.stroke()
                                            ctx.setLineDash([])
                                        }
                                    }
                                    }


                                Connections {
                                    target: root
                                    function onDarkModeChanged() { timelineCanvas.requestPaint() }
                                }
                            }

                            // 事件节点
                            Repeater {
                                id: timelineRepeater
                                model: backend.timelineModelObject
                                delegate: Item {
                                    required property string entityId
                                    required property string name
                                    required property string typeId
                                    required property string dateKind
                                    required property string label
                                    required property var year
                                    required property var endYear
                                    required property string dateText
                                    required property int index
                                    property int lane: index % 3
                                    x: timelineX(year, timelineViewport.width) - width/2
                                    y: timelineViewport.height/2 - height/2 + (lane === 0 ? -88 : lane === 1 ? 88 : 0)
                                    width: 180; height: 56

                                    Rectangle {
                                        id: timelineEventCard
                                        anchors.fill: parent
                                        radius: 8
                                        color: eventMouse.containsMouse ? clr.surfaceHigh : clr.surface
                                        border.width:1
                                        border.color:eventMouse.containsMouse ? clr.accent : clr.border
                                        scale:eventMouse.containsMouse ? 1.025 : 1
                                        Behavior on scale { NumberAnimation { duration:110; easing.type:Easing.OutCubic } }
                                        Behavior on color { ColorAnimation { duration:110 } }
                                        Behavior on border.color { ColorAnimation { duration:110 } }
                                        Rectangle { anchors.left:parent.left; anchors.top:parent.top; anchors.bottom:parent.bottom; width:3; color:clr.typeColor(typeId); radius:2 }
                                        Column {
                                            anchors.fill:parent; anchors.leftMargin:10; anchors.rightMargin:8; anchors.topMargin:8; anchors.bottomMargin:8
                                            spacing: 1
                                            Text { text: name; color:clr.textPrimary; font.pixelSize:12; font.weight:Font.Medium; elide:Text.ElideRight; width: parent.width-10 }
                                            Text { text: (label || dateKind) + " · " + terraYear(year); color:clr.textSecondary; font.pixelSize:10; elide:Text.ElideRight; width: parent.width-10 }
                                        }
                                        // 连线
                                        Rectangle {
                                            x: parent.width/2 - 1; width: 2
                                            color: clr.border
                                            y: lane === 0 ? parent.height : -Math.max(0, parent.y - timelineViewport.height/2)
                                            height: lane === 0 ? Math.max(0, timelineViewport.height/2 - parent.y - parent.height) : Math.max(0, parent.y - timelineViewport.height/2)
                                            visible: lane !== 2
                                        }
                                    }
                                    MouseArea {
                                        id: eventMouse
                                        anchors.fill: parent; hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: timelinePreviewTimer.restart()
                                        onDoubleClicked: {
                                            timelinePreviewTimer.stop()
                                            root.page = "entries"
                                            backend.openRelation(entityId)
                                            previewDialog.close()
                                        }
                                    }
                                    Timer {
                                        id: timelinePreviewTimer
                                        interval: 260
                                        repeat: false
                                        onTriggered: { backend.previewEntity(entityId); previewDialog.open() }
                                    }
                                    ToolTip.visible: eventMouse.containsMouse
                                    ToolTip.text: name + "\n" + (label || dateKind) + "\n" + terraYear(year) + (endYear ? " - " + terraYear(endYear) : "") + (dateText ? " · " + dateText : "")
                                    ToolTip.delay: 400
                                }
                            }

                            // 空状态
                            Text {
                                anchors.centerIn: parent
                                visible: backend.timelineCount === 0
                                text: "暂无日期记录\n请在词条中添加日期"
                                color: clr.textMuted; font.pixelSize: 12
                                horizontalAlignment: Text.AlignHCenter
                            }
                        }
                    }
                }

                // ════════ 2. 关系图页面 ════════
                GlassPane {
                    radius: 12
                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 0
                        spacing: 0

                        Rectangle {
                            Layout.fillWidth: true; height: 48; color: "transparent"
                            Rectangle { anchors.bottom:parent.bottom; anchors.left:parent.left; anchors.right:parent.right; height:1; color:clr.border }
                            RowLayout {
                                anchors.fill:parent; anchors.leftMargin:16; anchors.rightMargin:16
                                spacing: 8
                                Text { text:"关系图"; color:clr.textPrimary; font.pixelSize:14; font.weight:Font.DemiBold }
                                Item { Layout.fillWidth: true }
                                // 切换范围
                                Button {
                                    checkable: true; checked: backend.graphScope === "neighbors"
                                    text: checked ? "当前词条关联" : "完整关系网"
                                    onClicked: backend.setGraphScope(checked ? "neighbors" : "all")
                                    implicitHeight: 28
                                    contentItem: Text { text:parent.text; color:clr.textPrimary; font.pixelSize:11; font.weight:Font.Medium; horizontalAlignment:Text.AlignHCenter; verticalAlignment:Text.AlignVCenter }
                                    background: Rectangle { radius:6; color: parent.hovered?clr.surfaceHigh:"transparent"; border.width:1; border.color:clr.border; Behavior on color { ColorAnimation { duration:100 } } }
                                }
                                SecondaryBtn { text:"添加关联"; enabled:backend.currentEntityId!==""&&!backend.readOnly&&!backend.dirty; onClicked: { backend.prepareRelation(""); relationDialog.open() } }
                                SecondaryBtn { text:"导出 PNG"; enabled:backend.graphCount>0; onClicked: backend.chooseAndExportGraph() }
                            }
                        }

                        // 图谱主体
                        Item {
                            id: graphSurface
                            Layout.fillWidth: true; Layout.fillHeight: true
                            clip: true
                            property real graphScale: 1
                            property real floatPhase: 0
                            onFloatPhaseChanged: graphCanvas.requestPaint()

                            NumberAnimation on floatPhase {
                                from: 0
                                to: Math.PI * 2
                                duration: 22000
                                loops: Animation.Infinite
                                easing.type: Easing.Linear
                                running: root.visible && root.page === "graph" && backend.graphCount > 0 && backend.graphMotionEnabled
                            }

                            Canvas {
                                id: graphCanvas
                                anchors.fill: parent
                                antialiasing: true
                                onPaint: {
                                    var ctx = getContext("2d")
                                    ctx.clearRect(0,0,width,height)
                                    var layout = JSON.parse(backend.graphLayoutJson || '{"nodes":[],"edges":[]}')
                                    for (var i = 0; i < layout.edges.length; ++i) {
                                        var edge = layout.edges[i]
                                        var source = graphRepeater.itemAt(edge.source)
                                        var target = graphRepeater.itemAt(edge.target)
                                        if (!source || !target) continue
                                        var start = source.mapToItem(graphSurface, source.width/2, source.height/2)
                                        var end = target.mapToItem(graphSurface, target.width/2, target.height/2)
                                        ctx.strokeStyle = clr.withAlpha(clr.textSecondary, 0.65)
                                        ctx.lineWidth = 1.4
                                        ctx.beginPath()
                                        ctx.moveTo(start.x, start.y)
                                        ctx.lineTo(end.x, end.y)
                                        ctx.stroke()
                                        if (edge.label) {
                                            ctx.fillStyle = clr.textSecondary
                                            ctx.font = "11px 'Microsoft YaHei UI'"
                                            ctx.textAlign = "center"
                                            ctx.fillText(edge.label, (start.x + end.x) / 2, (start.y + end.y) / 2 - 5)
                                        }
                                    }
                                }
                                Connections { target: backend; function onGraphChanged() { graphCanvas.requestPaint() } }
                                Connections { target: root; function onDarkModeChanged() { graphCanvas.requestPaint() } }
                            }

                            MouseArea {
                                anchors.fill: parent
                                acceptedButtons: Qt.NoButton
                                onWheel: function(event) {
                                    var factor = event.angleDelta.y > 0 ? 1.12 : 1 / 1.12
                                    graphSurface.graphScale = Math.max(0.55, Math.min(2.2, graphSurface.graphScale * factor))
                                    event.accepted = true
                                }
                            }

                            Repeater {
                                id: graphRepeater
                                model: backend.graphModelObject
                                delegate: Item {
                                    id: graphNodeItem
                                    required property int index
                                    required property string id
                                    required property string name
                                    required property string typeId
                                    required property string typeName
                                    required property string nodeColor
                                    required property real positionX
                                    required property real positionY
                                    required property bool isCenter
                                    x: graphSurface.width/2 + (positionX - 0.5) * graphSurface.width * graphSurface.graphScale - width/2
                                    y: graphSurface.height/2 + (positionY - 0.5) * graphSurface.height * graphSurface.graphScale - height/2
                                    width: isCenter ? 176 : 156
                                    height: isCenter ? 76 : 68
                                    transform: Translate {
                                        x: Math.sin(graphSurface.floatPhase + graphNodeItem.index * 1.73) * (graphNodeItem.isCenter ? 9 : 16)
                                        y: Math.cos(graphSurface.floatPhase * 2 + graphNodeItem.index * 2.11) * (graphNodeItem.isCenter ? 7 : 13)
                                    }
                                    onXChanged: graphCanvas.requestPaint()
                                    onYChanged: graphCanvas.requestPaint()

                                    Rectangle {
                                        id: graphNodeBody
                                        anchors.fill: parent
                                        radius: height/2
                                        color: clr.withAlpha(clr.surface, 0.96)
                                        border.width: graphNodeItem.isCenter ? 2 : 1
                                        border.color: graphNodeItem.isCenter ? clr.accent : clr.typeColor(graphNodeItem.typeId)
                                        scale: graphNodeArea.containsMouse ? 1.06 : 1
                                        Behavior on scale { NumberAnimation { duration:120; easing.type:Easing.OutCubic } }
                                        ColumnLayout {
                                            anchors.fill: parent
                                            anchors.leftMargin: 16
                                            anchors.rightMargin: 16
                                            anchors.topMargin: 10
                                            anchors.bottomMargin: 10
                                            spacing: 3
                                            Text {
                                                Layout.fillWidth: true
                                                text: graphNodeItem.name
                                                color: clr.textPrimary
                                                font.pixelSize: 12
                                                font.weight: Font.DemiBold
                                                horizontalAlignment: Text.AlignHCenter
                                                elide: Text.ElideRight
                                            }
                                            Text {
                                                Layout.fillWidth: true
                                                text: graphNodeItem.isCenter ? "当前词条" : graphNodeItem.typeName
                                                color: graphNodeItem.isCenter ? clr.accent : clr.textSecondary
                                                font.pixelSize: 10
                                                horizontalAlignment: Text.AlignHCenter
                                                elide: Text.ElideRight
                                            }
                                        }
                                    }
                                    MouseArea {
                                        id: graphNodeArea
                                        anchors.fill: parent; hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
                                        drag.target: graphNodeItem
                                        drag.minimumX: -graphNodeItem.width * 0.25
                                        drag.maximumX: graphSurface.width - graphNodeItem.width * 0.75
                                        drag.minimumY: -graphNodeItem.height * 0.25
                                        drag.maximumY: graphSurface.height - graphNodeItem.height * 0.75
                                        onClicked: function(event) {
                                            if (event.modifiers & Qt.ControlModifier) {
                                                backend.selectEntity(graphNodeItem.id)
                                            }
                                        }
                                        onDoubleClicked: {
                                            backend.previewEntity(graphNodeItem.id)
                                            previewDialog.open()
                                        }
                                        ToolTip.visible: containsMouse
                                        ToolTip.text: graphNodeItem.name + " · " + graphNodeItem.typeName
                                        ToolTip.delay: 400
                                    }
                                }
                            }

                            Row {
                                anchors.right: parent.right
                                anchors.top: parent.top
                                anchors.margins: 10
                                spacing: 4
                                IconBtn { text:"−"; hint:"缩小关系图"; onClicked:graphSurface.graphScale=Math.max(0.55,graphSurface.graphScale/1.15) }
                                IconBtn { text:"+"; hint:"放大关系图"; onClicked:graphSurface.graphScale=Math.min(2.2,graphSurface.graphScale*1.15) }
                                IconBtn { text:"⌂"; hint:"适配关系网"; onClicked:graphSurface.graphScale=1 }
                            }

                            Text {
                                anchors.centerIn: parent
                                visible: backend.graphCount === 0
                                text: backend.hasProject ? "暂无可展示的词条" : "打开资料库后查看关系网"
                                color: clr.textMuted; font.pixelSize: 12
                                horizontalAlignment: Text.AlignHCenter
                            }
                        }
                    }
                }

                // ════════ 3. 数据校验页面 ════════
                GlassPane {
                    radius: 12
                    ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 0
                        spacing: 0

                        Rectangle {
                            Layout.fillWidth: true; height: 48; color: "transparent"
                            Rectangle { anchors.bottom:parent.bottom; anchors.left:parent.left; anchors.right:parent.right; height:1; color:clr.border }
                            RowLayout {
                                anchors.fill:parent; anchors.leftMargin:16; anchors.rightMargin:16
                                spacing: 8
                                Text { text:"数据校验"; color:clr.textPrimary; font.pixelSize:14; font.weight:Font.DemiBold }
                                Item { Layout.fillWidth: true }
                                Text {
                                    text: backend.validationCount === 0 ? "✓ 全部通过" : backend.validationCount + " 项问题"
                                    color: backend.validationCount === 0 ? clr.green : clr.red
                                    font.pixelSize: 12; font.weight: Font.Medium
                                }
                                SecondaryBtn { text:"重新校验"; onClicked: backend.refresh() }
                            }
                        }

                        ListView {
                            id: validationList
                            Layout.fillWidth: true; Layout.fillHeight: true
                            clip: true; spacing: 4
                            leftMargin: 12; rightMargin: 12; topMargin: 12; bottomMargin: 12
                            ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }
                            model: backend.validationModelObject

                            delegate: Rectangle {
                                width: validationList.width - 24
                                implicitHeight: 52; radius: 7
                                color: clr.surfaceHigh; border.width:1; border.color:clr.border
                                MouseArea {
                                    anchors.fill: parent; cursorShape: Qt.PointingHandCursor
                                    onClicked: { root.page="entries"; backend.openValidationIssue(model.entityId, model.relationId) }
                                }
                                RowLayout {
                                    anchors.fill:parent; anchors.leftMargin:12; anchors.rightMargin:12
                                    spacing: 8
                                    Rectangle { width:3; height:24; radius:2; color:clr.red }
                                    ColumnLayout {
                                        Layout.fillWidth: true; spacing: 1
                                        Text { text: model.kind; color:clr.textSecondary; font.pixelSize:10; font.weight:Font.DemiBold; elide:Text.ElideRight }
                                        Text { text: model.message; color:clr.textPrimary; font.pixelSize:12; wrapMode:Text.Wrap; Layout.fillWidth:true; maximumLineCount:2; elide:Text.ElideRight }
                                    }
                                    Text { text:"→"; color:clr.textMuted; font.pixelSize:16 }
                                }
                            }
                        }

                        Text {
                            Layout.fillWidth: true; Layout.fillHeight: true
                            visible: backend.validationCount === 0
                            text: "✓ 所有数据校验通过，未发现问题"
                            color: clr.green; font.pixelSize: 13; font.weight: Font.Medium
                            horizontalAlignment: Text.AlignHCenter
                            verticalAlignment: Text.AlignVCenter
                        }
                    }
                }

                // ════════ 4. 资料库设置页面 ════════
                GlassPane {
                    radius: 12
                    ScrollView {
                        anchors.fill: parent
                        clip: true
                        ColumnLayout {
                            width: parent.width
                            spacing: 14

                            Item { Layout.fillWidth: true; height: 4 }

                            Text {
                                Layout.leftMargin: 24; text: "资料库设置"
                                color: clr.textPrimary; font.pixelSize: 14; font.weight: Font.DemiBold
                            }

                            ColumnLayout {
                                Layout.leftMargin: 24; Layout.rightMargin: 24; Layout.fillWidth: true
                                spacing: 4
                                Text { text:"资料库名称"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                                TextField {
                                    id: settingsNameField; Layout.fillWidth: true; implicitHeight: 36
                                    readOnly: backend.readOnly
                                    placeholderText: "例如：北境纪事"
                                    color: clr.textPrimary; placeholderTextColor: clr.textMuted; selectByMouse: true
                                    background: Rectangle { radius:7; color:clr.input; border.width: parent.activeFocus?2:1; border.color: parent.activeFocus?clr.accent:clr.inputBorder; Behavior on border.color { ColorAnimation { duration:120 } } }
                                }
                            }
                            ColumnLayout {
                                Layout.leftMargin: 24; Layout.rightMargin: 24; Layout.fillWidth: true
                                spacing: 4
                                Text { text:"纪年法名称"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                                TextField {
                                    id: settingsEraField; Layout.fillWidth: true; implicitHeight: 36
                                    readOnly: backend.readOnly
                                    placeholderText: "例如：泰拉纪元"
                                    color: clr.textPrimary; placeholderTextColor: clr.textMuted; selectByMouse: true
                                    background: Rectangle { radius:7; color:clr.input; border.width: parent.activeFocus?2:1; border.color: parent.activeFocus?clr.accent:clr.inputBorder; Behavior on border.color { ColorAnimation { duration:120 } } }
                                }
                            }
                            ColumnLayout {
                                Layout.leftMargin: 24; Layout.rightMargin: 24; Layout.fillWidth: true
                                spacing: 4
                                Text { text:"创作者 / 整理者"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                                TextField {
                                    id: settingsAuthorField; Layout.fillWidth: true; implicitHeight: 36
                                    readOnly: backend.readOnly
                                    placeholderText: "可选"
                                    color: clr.textPrimary; placeholderTextColor: clr.textMuted; selectByMouse: true
                                    background: Rectangle { radius:7; color:clr.input; border.width: parent.activeFocus?2:1; border.color: parent.activeFocus?clr.accent:clr.inputBorder; Behavior on border.color { ColorAnimation { duration:120 } } }
                                }
                            }
                            ColumnLayout {
                                Layout.leftMargin: 24; Layout.rightMargin: 24; Layout.fillWidth: true
                                spacing: 4
                                Text { text:"资料库说明"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                                TextArea {
                                    id: settingsDescriptionField; Layout.fillWidth: true; Layout.preferredHeight: 100
                                    readOnly: backend.readOnly
                                    placeholderText: "世界设定范围、创作目的或版本说明"
                                    color: clr.textPrimary; placeholderTextColor: clr.textMuted; selectByMouse: true; wrapMode: TextArea.Wrap
                                    background: Rectangle { radius:7; color:clr.input; border.width: parent.activeFocus?2:1; border.color: parent.activeFocus?clr.accent:clr.inputBorder; Behavior on border.color { ColorAnimation { duration:120 } } }
                                }
                            }

                            RowLayout {
                                Layout.leftMargin: 24; Layout.rightMargin: 24; Layout.fillWidth: true
                                spacing: 8
                                Item { Layout.fillWidth: true }
                                PrimaryBtn {
                                    text: "保存设置"
                                    enabled: backend.hasProject && !backend.readOnly
                                    onClicked: backend.updateProjectSettings(settingsNameField.text, settingsEraField.text, settingsAuthorField.text, settingsDescriptionField.text)
                                }
                            }

                            Rectangle { Layout.leftMargin:24; Layout.rightMargin:24; Layout.fillWidth:true; height:1; color:clr.divider }
                            ColumnLayout {
                                Layout.leftMargin:24; Layout.rightMargin:24; Layout.fillWidth:true
                                spacing:8
                                Text { text:"界面偏好"; color:clr.textPrimary; font.pixelSize:13; font.weight:Font.DemiBold }
                                Text { text:"这些选项保存在本机，不会修改资料库文件。"; color:clr.textMuted; font.pixelSize:11; wrapMode:Text.Wrap }
                                RowLayout {
                                    Layout.fillWidth:true
                                    Text { Layout.fillWidth:true; text:"页面与控件动画"; color:clr.textSecondary; font.pixelSize:12 }
                                    Switch { checked:backend.animationsEnabled; onToggled:backend.setUIPreferences(checked,backend.backgroundEffectsEnabled,backend.compactMode,backend.graphMotionEnabled) }
                                }
                                RowLayout {
                                    Layout.fillWidth:true
                                    Text { Layout.fillWidth:true; text:"背景渐变与粒子"; color:clr.textSecondary; font.pixelSize:12 }
                                    Switch { checked:backend.backgroundEffectsEnabled; onToggled:backend.setUIPreferences(backend.animationsEnabled,checked,backend.compactMode,backend.graphMotionEnabled) }
                                }
                                RowLayout {
                                    Layout.fillWidth:true
                                    Text { Layout.fillWidth:true; text:"紧凑列表间距"; color:clr.textSecondary; font.pixelSize:12 }
                                    Switch { checked:backend.compactMode; onToggled:backend.setUIPreferences(backend.animationsEnabled,backend.backgroundEffectsEnabled,checked,backend.graphMotionEnabled) }
                                }
                                RowLayout {
                                    Layout.fillWidth:true
                                    Text { Layout.fillWidth:true; text:"关系网节点浮动"; color:clr.textSecondary; font.pixelSize:12 }
                                    Switch { checked:backend.graphMotionEnabled; onToggled:backend.setUIPreferences(backend.animationsEnabled,backend.backgroundEffectsEnabled,backend.compactMode,checked) }
                                }
                            }

                            Item { Layout.fillWidth: true; height: 20 }
                        }
                    }
                }

                // 编辑记录
                GlassPane {
                    radius:12
                    ColumnLayout {
                        anchors.fill:parent
                        anchors.margins:0
                        spacing:0
                        Rectangle {
                            Layout.fillWidth:true
                            height:52
                            color:"transparent"
                            Rectangle { anchors.left:parent.left; anchors.right:parent.right; anchors.bottom:parent.bottom; height:1; color:clr.border }
                            RowLayout {
                                anchors.fill:parent; anchors.leftMargin:18; anchors.rightMargin:18; spacing:10
                                ColumnLayout {
                                    spacing:2
                                    Text { text:"编辑记录"; color:clr.textPrimary; font.pixelSize:14; font.weight:Font.DemiBold }
                                    Text { text:"记录每次成功保存的词条变更"; color:clr.textMuted; font.pixelSize:11 }
                                }
                                Item { Layout.fillWidth:true }
                                Text { text:backend.historyCount + " 条记录"; color:clr.textSecondary; font.pixelSize:11 }
                            }
                        }
                        ListView {
                            id: historyList
                            Layout.fillWidth:true; Layout.fillHeight:true
                            clip:true; spacing:4
                            leftMargin:12; rightMargin:12; topMargin:12; bottomMargin:12
                            model:backend.historyModelObject
                            ScrollBar.vertical:ScrollBar { policy:ScrollBar.AsNeeded }
                            delegate:ItemDelegate {
                                required property string id
                                required property string entityId
                                required property string entityName
                                required property int version
                                required property string changedAt
                                required property string changeType
                                required property string description
                                width:historyList.width-24
                                height:backend.compactMode?54:68
                                hoverEnabled:true
                                onClicked:{root.page="entries";backend.selectEntity(entityId)}
                                background:Rectangle {
                                    radius:6
                                    color:down?clr.accentSoft:hovered?clr.surfaceHigh:"transparent"
                                    Behavior on color { ColorAnimation { duration:110 } }
                                }
                                contentItem:RowLayout {
                                    spacing:12
                                    Rectangle { Layout.preferredWidth:3; Layout.fillHeight:true; Layout.topMargin:10; Layout.bottomMargin:10; radius:2; color:changeType==="create"?clr.green:clr.accent }
                                    ColumnLayout {
                                        Layout.fillWidth:true; spacing:3
                                        Text { Layout.fillWidth:true; text:"["+root.formatHistoryTime(changedAt)+"]  "+description; color:clr.textPrimary; font.pixelSize:12; font.weight:Font.Medium; elide:Text.ElideRight }
                                        Text { Layout.fillWidth:true; text:entityName+"  ·  版本 "+version; color:clr.textMuted; font.pixelSize:10; elide:Text.ElideRight }
                                    }
                                    Text { text:"↗"; color:clr.textMuted; font.pixelSize:15 }
                                }
                            }
                            Text {
                                anchors.centerIn:parent
                                visible:backend.historyCount===0
                                text:backend.hasProject?"保存词条后，变更记录会显示在这里":"打开资料库后查看编辑记录"
                                color:clr.textMuted; font.pixelSize:12
                            }
                        }
                    }
                }
            }

            // ── 状态栏 ─────────────────────────────────────────
            Rectangle {
                anchors.bottom: parent.bottom; anchors.left: parent.left; anchors.right: parent.right
                height: 28; color: clr.withAlpha(clr.surface, 0.92)
                Rectangle { anchors.top:parent.top; anchors.left:parent.left; anchors.right:parent.right; height:1; color:clr.border }
                RowLayout {
                    anchors.fill:parent; anchors.leftMargin:16; anchors.rightMargin:16
                    Text { text: backend.statusMessage; color: clr.textSecondary; font.pixelSize: 11; elide: Text.ElideRight; Layout.fillWidth: true }
                    Text { text: backend.hasProject ? (backend.readOnly ? "只读" : "本地数据库") : ""; color: clr.textMuted; font.pixelSize: 11 }
                }
            }
        }
    }


    // ── 对话框区域 ───────────────────────────────────────────

    Dialog {
        id: newProjectDialog; objectName: "newProjectDialog"
        enter: PopupIn {}
        exit: PopupOut {}
        modal: true; padding: 20; title: "创建资料库"
        header: DlgHeader { titleText: newProjectDialog.title }
        standardButtons: Dialog.NoButton
        anchors.centerIn: parent; width: Math.min(root.width - 48, 560)
        background: Rectangle { radius:12; color:clr.surface; border.width:1; border.color:clr.border }
        contentItem: ColumnLayout {
            spacing: 14
            RowLayout {
                Layout.fillWidth: true; spacing: 12
                ColumnLayout { Layout.fillWidth: true; spacing: 4
                    Text { text:"资料库名称"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                    TextField { id: newProjectName; Layout.fillWidth: true; implicitHeight:36; placeholderText:"例如：北境纪事"; color:clr.textPrimary; placeholderTextColor:clr.textMuted; selectByMouse:true; background: Rectangle { radius:7; color:clr.input; border.width: parent.activeFocus?2:1; border.color: parent.activeFocus?clr.accent:clr.inputBorder; Behavior on border.color { ColorAnimation { duration:120 } } } }
                }
                ColumnLayout { Layout.fillWidth: true; spacing: 4
                    Text { text:"纪年法名称"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                    TextField { id: newProjectEra; Layout.fillWidth: true; implicitHeight:36; placeholderText:"例如：泰拉纪元"; color:clr.textPrimary; placeholderTextColor:clr.textMuted; selectByMouse:true; background: Rectangle { radius:7; color:clr.input; border.width: parent.activeFocus?2:1; border.color: parent.activeFocus?clr.accent:clr.inputBorder; Behavior on border.color { ColorAnimation { duration:120 } } } }
                }
            }
            ColumnLayout { Layout.fillWidth: true; spacing: 4
                Text { text:"创作者 / 整理者"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                TextField { id: newProjectAuthor; Layout.fillWidth: true; implicitHeight:36; placeholderText:"可选"; color:clr.textPrimary; placeholderTextColor:clr.textMuted; selectByMouse:true; background: Rectangle { radius:7; color:clr.input; border.width: parent.activeFocus?2:1; border.color: parent.activeFocus?clr.accent:clr.inputBorder; Behavior on border.color { ColorAnimation { duration:120 } } } }
            }
            ColumnLayout { Layout.fillWidth: true; spacing: 4
                Text { text:"资料库说明"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                TextArea { id: newProjectDescription; Layout.fillWidth: true; Layout.preferredHeight:80; placeholderText:"世界设定范围、题材或版本说明"; color:clr.textPrimary; placeholderTextColor:clr.textMuted; selectByMouse:true; wrapMode:TextArea.Wrap; background: Rectangle { radius:7; color:clr.input; border.width: parent.activeFocus?2:1; border.color: parent.activeFocus?clr.accent:clr.inputBorder; Behavior on border.color { ColorAnimation { duration:120 } } } }
            }
            Text { text:"下一步将选择 .aethercod 文件保存位置"; color:clr.textMuted; font.pixelSize:10 }
        }
        footer: DlgFooter {
            SecondaryBtn { text:"取消"; onClicked:newProjectDialog.close() }
            PrimaryBtn { text:"选择位置并创建"; enabled: newProjectName.text.trim().length>0 && newProjectEra.text.trim().length>0
                onClicked: { if (backend.chooseAndCreateProjectWithSettings(newProjectName.text, newProjectEra.text, newProjectAuthor.text, newProjectDescription.text)) { newProjectDialog.close(); root.page="entries" } }
            }
        }
    }

    Dialog {
        id: fieldDefinitionDialog
        enter: PopupIn {}
        exit: PopupOut {}
        modal: true; padding: 20; title: fieldIdInput.text ? "编辑属性定义" : "添加属性定义"
        header: DlgHeader { titleText: fieldDefinitionDialog.title }
        standardButtons: Dialog.NoButton
        anchors.centerIn: parent; width: Math.min(root.width - 48, 500)
        background: Rectangle { radius:12; color:clr.surface; border.width:1; border.color:clr.border }
        contentItem: ColumnLayout {
            spacing: 12
            TextField { id: fieldIdInput; visible: false }
            ColumnLayout { Layout.fillWidth: true; spacing: 4
                Text { text:"属性名称"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                TextField { id: fieldNameInput; Layout.fillWidth: true; implicitHeight:36; placeholderText:"例如：家族、信仰、来源"; color:clr.textPrimary; placeholderTextColor:clr.textMuted; selectByMouse:true; background: Rectangle { radius:7; color:clr.input; border.width:1; border.color:clr.inputBorder } }
            }
            ColumnLayout { Layout.fillWidth: true; spacing: 4
                Text { text:"数据类型"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                ComboBox {
                    id: fieldTypeCombo; Layout.fillWidth: true; implicitHeight: 36; textRole:"label"; valueRole:"value"
                    model: ListModel {
                        ListElement { label:"短文本"; value:"text" }
                        ListElement { label:"多行文本"; value:"textarea" }
                        ListElement { label:"整数"; value:"integer" }
                        ListElement { label:"数字"; value:"number" }
                        ListElement { label:"布尔"; value:"boolean" }
                        ListElement { label:"枚举选择"; value:"choice" }
                        ListElement { label:"纪年日期"; value:"date" }
                        ListElement { label:"JSON"; value:"json" }
                        ListElement { label:"词条引用 ID"; value:"entity_ref" }
                        ListElement { label:"词条引用列表"; value:"entity_refs" }
                    }
                    contentItem: Text { leftPadding:10; text: fieldTypeCombo.displayText; color:clr.textPrimary; font.pixelSize:13; verticalAlignment:Text.AlignVCenter }
                    background: Rectangle { radius:7; color:clr.input; border.width:1; border.color:clr.inputBorder }
                    indicator: Text { anchors.right:parent.right; anchors.rightMargin:10; anchors.verticalCenter:parent.verticalCenter; text:"▾"; color:clr.textMuted; font.pixelSize:11 }
                    delegate: ItemDelegate { required property string label; required property int index; width: fieldTypeCombo.width; hoverEnabled: true; contentItem: Text { text: label; color:clr.textPrimary; font.pixelSize:13; verticalAlignment:Text.AlignVCenter }
                    background: Rectangle { color: parent.hovered?clr.surfaceHigh:"transparent"; radius:4 } }
                    popup: Popup { enter: PopupIn {}
                    exit: PopupOut {}
                    y: fieldTypeCombo.height; width: fieldTypeCombo.width; implicitHeight: Math.min(contentItem.implicitHeight+4, 300); padding: 4; contentItem: ListView { clip:true; implicitHeight:contentHeight; model: fieldTypeCombo.popup.visible?fieldTypeCombo.delegateModel:null; currentIndex: fieldTypeCombo.highlightedIndex; ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded } }
                    background: Rectangle { radius:7; color:clr.surface; border.width:1; border.color:clr.border } }
                }
            }
            ColumnLayout { Layout.fillWidth: true; spacing: 4; visible: fieldTypeCombo.currentValue==="choice"
                Text { text:"选项（逗号分隔）"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                TextField { id: fieldOptionsInput; Layout.fillWidth: true; implicitHeight:36; placeholderText:"王国, 帝国, 共和国"; color:clr.textPrimary; selectByMouse:true; background: Rectangle { radius:7; color:clr.input; border.width:1; border.color:clr.inputBorder } }
            }
            ColumnLayout { Layout.fillWidth: true; spacing: 4
                Text { text:"说明（可选）"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                TextField { id: fieldDescriptionInput; Layout.fillWidth: true; implicitHeight:36; placeholderText:"字段用途"; color:clr.textPrimary; selectByMouse:true; background: Rectangle { radius:7; color:clr.input; border.width:1; border.color:clr.inputBorder } }
            }
            CheckBox { id: fieldRequiredInput; text:"必填属性"; palette.text:clr.textPrimary }
        }
        footer: DlgFooter {
            SecondaryBtn { text:"取消"; onClicked:fieldDefinitionDialog.close() }
            PrimaryBtn { text:"保存定义"; onClicked: if (backend.saveFieldDefinition(fieldIdInput.text, fieldNameInput.text, fieldTypeCombo.currentValue, fieldRequiredInput.checked, fieldDescriptionInput.text, fieldOptionsInput.text)) fieldDefinitionDialog.close() }
        }
    }

    Dialog {
        id: fieldDeleteDialog
        enter: PopupIn {}
        exit: PopupOut {}
        modal: true; padding: 20; title: "删除属性定义"
        header: DlgHeader { titleText: fieldDeleteDialog.title }
        standardButtons: Dialog.NoButton
        anchors.centerIn: parent; width: Math.min(root.width - 48, 400)
        background: Rectangle { radius:12; color:clr.surface; border.width:1; border.color:clr.border }
        contentItem: Text { text:"删除此自定义属性定义及该字段所有值？此操作不可撤销。"; color:clr.textPrimary; wrapMode:Text.Wrap; padding:4 }
        footer: DlgFooter { SecondaryBtn { text:"取消"; onClicked:fieldDeleteDialog.close() }
        PrimaryBtn { text:"删除属性"; danger:true; onClicked: { backend.deleteFieldDefinition(pendingFieldId); pendingFieldId=""; fieldDeleteDialog.close() } } }
    }

    Dialog {
        id: dateDialog
        enter: PopupIn {}
        exit: PopupOut {}
        modal: true; padding: 20; title: dateIdField.text ? "编辑时间记录" : "添加时间记录"
        header: DlgHeader { titleText: dateDialog.title }
        standardButtons: Dialog.NoButton
        anchors.centerIn: parent; width: Math.min(root.width - 48, 540); closePolicy: Popup.CloseOnEscape
        background: Rectangle { radius:12; color:clr.surface; border.width:1; border.color:clr.border }
        contentItem: ColumnLayout {
            spacing: 12
            TextField { id: dateIdField; visible: false }
            RowLayout { Layout.fillWidth: true; spacing: 12
                ColumnLayout { Layout.fillWidth: true; spacing: 4; Text { text:"日期类型"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                TextField { id: dateKindField; Layout.fillWidth: true; implicitHeight:36; text:"custom"; color:clr.textPrimary; selectByMouse:true; background: Rectangle { radius:7; color:clr.input; border.width:1; border.color:clr.inputBorder } } }
                ColumnLayout { Layout.fillWidth: true; spacing: 4; Text { text:"显示名称"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                TextField { id: dateLabelField; Layout.fillWidth: true; implicitHeight:36; placeholderText:"出生、建国..."; color:clr.textPrimary; placeholderTextColor:clr.textMuted; selectByMouse:true; background: Rectangle { radius:7; color:clr.input; border.width:1; border.color:clr.inputBorder } } }
            }
            ColumnLayout { Layout.fillWidth: true; spacing: 4
                Text { text:"精度"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                ComboBox {
                    id: datePrecision; Layout.fillWidth: true; implicitHeight: 36; textRole:"label"; valueRole:"value"
                    model: ListModel { ListElement { label:"仅年份"; value:"year" }
                    ListElement { label:"年与月"; value:"month" }
                    ListElement { label:"完整日期"; value:"day" }
                    ListElement { label:"年份范围"; value:"range" } }
                    contentItem: Text { leftPadding:10; text: datePrecision.displayText; color:clr.textPrimary; font.pixelSize:13; verticalAlignment:Text.AlignVCenter }
                    background: Rectangle { radius:7; color:clr.input; border.width:1; border.color:clr.inputBorder }
                    indicator: Text { anchors.right:parent.right; anchors.rightMargin:10; anchors.verticalCenter:parent.verticalCenter; text:"▾"; color:clr.textMuted; font.pixelSize:11 }
                    delegate: ItemDelegate { required property string label; required property int index; width: datePrecision.width; hoverEnabled: true; contentItem: Text { text: label; color:clr.textPrimary; font.pixelSize:13; verticalAlignment:Text.AlignVCenter }
                    background: Rectangle { color: parent.hovered?clr.surfaceHigh:"transparent"; radius:4 } }
                    popup: Popup { enter: PopupIn {}
                    exit: PopupOut {}
                    y: datePrecision.height; width: datePrecision.width; implicitHeight: Math.min(contentItem.implicitHeight+4, 240); padding: 4; contentItem: ListView { clip:true; implicitHeight:contentHeight; model: datePrecision.popup.visible?datePrecision.delegateModel:null; currentIndex: datePrecision.highlightedIndex; ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded } }
                    background: Rectangle { radius:7; color:clr.surface; border.width:1; border.color:clr.border } }
                }
            }
            RowLayout { Layout.fillWidth: true; spacing: 12
                ColumnLayout { Layout.fillWidth: true; spacing: 4; visible: datePrecision.currentValue !== "year"; Text { text:"详细日期（YYYY-MM-DD）"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                TextField { id: dateValueField; Layout.fillWidth: true; implicitHeight:36; placeholderText:"年份需与下方一致"; color:clr.textPrimary; placeholderTextColor:clr.textMuted; selectByMouse:true; background: Rectangle { radius:7; color:clr.input; border.width:1; border.color:clr.inputBorder } } }
                ColumnLayout { Layout.fillWidth: true; spacing: 4; Text { text: backend.eraName + " 年份"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                TextField { id: dateYearField; Layout.fillWidth: true; implicitHeight:36; placeholderText:"可正可负"; validator: IntValidator { bottom:-999999; top:999999 }
                color:clr.textPrimary; placeholderTextColor:clr.textMuted; selectByMouse:true; background: Rectangle { radius:7; color:clr.input; border.width: parent.activeFocus?2:1; border.color: parent.activeFocus?clr.accent:clr.inputBorder; Behavior on border.color { ColorAnimation { duration:120 } } } } }
            }
            RowLayout { Layout.fillWidth: true; spacing: 12; visible: datePrecision.currentValue==="range"
                ColumnLayout { Layout.fillWidth: true; spacing: 4; Text { text:"结束年份"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                TextField { id: dateEndYearField; Layout.fillWidth: true; implicitHeight:36; validator: IntValidator { bottom:-999999; top:999999 }
                color:clr.textPrimary; selectByMouse:true; background: Rectangle { radius:7; color:clr.input; border.width:1; border.color:clr.inputBorder } } }
                ColumnLayout { Layout.fillWidth: true; spacing: 4; Text { text:"结束详细日期（可选）"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                TextField { id: dateEndValueField; Layout.fillWidth: true; implicitHeight:36; placeholderText:"YYYY-MM-DD"; color:clr.textPrimary; selectByMouse:true; background: Rectangle { radius:7; color:clr.input; border.width:1; border.color:clr.inputBorder } } }
            }
            Text { text:"年份可输入正数或负数，如 42、-42；日期格式 YYYY-MM-DD 且与年份一致。"; color:clr.textMuted; font.pixelSize:10; wrapMode:Text.Wrap }
        }
        footer: DlgFooter {
            SecondaryBtn { text:"取消"; onClicked:dateDialog.close() }
            PrimaryBtn { text:"保存日期"; onClicked: { if (backend.saveDate(dateIdField.text, dateKindField.text, dateLabelField.text, dateYearField.text, datePrecision.currentValue, dateValueField.text, dateEndYearField.text, dateEndValueField.text)) dateDialog.close() } }
        }
    }

    Dialog {
        id: relationDialog
        enter: PopupIn {}
        exit: PopupOut {}
        modal: true; padding: 20; title: backend.relationEditId ? "编辑关联" : "添加关联"
        header: DlgHeader { titleText: relationDialog.title }
        standardButtons: Dialog.NoButton
        anchors.centerIn: parent; width: Math.min(root.width - 48, 540)
        background: Rectangle { radius:12; color:clr.surface; border.width:1; border.color:clr.border }
        onOpened: { relationTarget.currentValue = backend.relationTargetId; relationLabelField.text = backend.relationLabel; relationReverseField.text = backend.relationReverseLabel; relationNotesField.text = backend.relationNotes }
        contentItem: ColumnLayout {
            spacing: 12
            ColumnLayout { Layout.fillWidth: true; spacing: 4
                Text { text:"关联词条"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                ComboBox {
                    id: relationTarget; Layout.fillWidth: true; implicitHeight: 36
                    model: backend.relationTargetModelObject; textRole:"displayName"; valueRole:"id"
                    contentItem: Text { leftPadding:10; rightPadding:30; text: relationTarget.displayText; color:clr.textPrimary; font.pixelSize:13; verticalAlignment:Text.AlignVCenter; elide:Text.ElideRight }
                    background: Rectangle { radius:7; color:clr.input; border.width:1; border.color:clr.inputBorder }
                    indicator: Text { anchors.right:parent.right; anchors.rightMargin:10; anchors.verticalCenter:parent.verticalCenter; text:"▾"; color:clr.textMuted; font.pixelSize:11 }
                    delegate: ItemDelegate { required property string displayName; required property int index; width: relationTarget.width; hoverEnabled: true; contentItem: Text { text: displayName; color:clr.textPrimary; font.pixelSize:13; verticalAlignment:Text.AlignVCenter; elide:Text.ElideRight }
                    background: Rectangle { color: parent.hovered?clr.surfaceHigh:"transparent"; radius:4 } }
                    popup: Popup { enter: PopupIn {}
                    exit: PopupOut {}
                    y: relationTarget.height; width: relationTarget.width; implicitHeight: Math.min(contentItem.implicitHeight+4, 320); padding: 4; contentItem: ListView { clip:true; implicitHeight:contentHeight; model: relationTarget.popup.visible?relationTarget.delegateModel:null; currentIndex: relationTarget.highlightedIndex; ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded } }
                    background: Rectangle { radius:7; color:clr.surface; border.width:1; border.color:clr.border } }
                }
            }
            RowLayout { Layout.fillWidth: true; spacing: 12
                ColumnLayout { Layout.fillWidth: true; spacing: 4; Text { text:"当前词条 → 关联词条"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                TextField { id: relationLabelField; Layout.fillWidth: true; implicitHeight:36; placeholderText:"效忠、位于、持有"; color:clr.textPrimary; placeholderTextColor:clr.textMuted; selectByMouse:true; background: Rectangle { radius:7; color:clr.input; border.width:1; border.color:clr.inputBorder } } }
                ColumnLayout { Layout.fillWidth: true; spacing: 4; Text { text:"反向名称（可选）"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
                TextField { id: relationReverseField; Layout.fillWidth: true; implicitHeight:36; placeholderText:"效忠者、包含"; color:clr.textPrimary; placeholderTextColor:clr.textMuted; selectByMouse:true; background: Rectangle { radius:7; color:clr.input; border.width:1; border.color:clr.inputBorder } } }
            }
            ColumnLayout { Layout.fillWidth: true; spacing: 4; Text { text:"关系说明（可选）"; color:clr.textSecondary; font.pixelSize:11; font.weight:Font.Medium }
            TextArea { id: relationNotesField; Layout.fillWidth: true; Layout.preferredHeight:80; placeholderText:"上下文或来源"; color:clr.textPrimary; placeholderTextColor:clr.textMuted; selectByMouse:true; wrapMode:TextArea.Wrap; background: Rectangle { radius:7; color:clr.input; border.width:1; border.color:clr.inputBorder } } }
        }
        footer: DlgFooter {
            SecondaryBtn { text:"取消"; onClicked:relationDialog.close() }
            PrimaryBtn { text:"保存关联"; onClicked: if (backend.saveRelation(relationTarget.currentValue, relationLabelField.text, relationReverseField.text, relationNotesField.text)) relationDialog.close() }
        }
    }

    Dialog {
        id: relationDeleteDialog
        enter: PopupIn {}
        exit: PopupOut {}
        modal: true; padding: 20; title: "删除关联"
        header: DlgHeader { titleText: relationDeleteDialog.title }
        standardButtons: Dialog.NoButton
        anchors.centerIn: parent; width: Math.min(root.width - 48, 400)
        background: Rectangle { radius:12; color:clr.surface; border.width:1; border.color:clr.border }
        contentItem: Text { text:"删除这条双向可见的关联？词条本身不会被删除。"; color:clr.textPrimary; wrapMode:Text.Wrap; padding:4 }
        footer: DlgFooter { SecondaryBtn { text:"取消"; onClicked:relationDeleteDialog.close() }
        PrimaryBtn { text:"删除关联"; danger:true; onClicked: { backend.deleteRelation(pendingRelationId); pendingRelationId=""; relationDeleteDialog.close() } } }
    }

    Dialog {
        id: importConfirmDialog
        enter: PopupIn {}
        exit: PopupOut {}
        modal: true; padding: 20; title: "导入资料库"
        header: DlgHeader { titleText: importConfirmDialog.title }
        standardButtons: Dialog.NoButton
        anchors.centerIn: parent; width: Math.min(root.width - 48, 440)
        background: Rectangle { radius:12; color:clr.surface; border.width:1; border.color:clr.border }
        contentItem: Text { text:"导入会按 UUID 合并词条、关系和类型定义。已有同 ID 内容将更新，无法撤销。建议先备份。"; color:clr.textPrimary; wrapMode:Text.Wrap; padding:4 }
        footer: DlgFooter { SecondaryBtn { text:"取消"; onClicked:importConfirmDialog.close() }
        PrimaryBtn { text:"选择 JSON 文件"; onClicked: { importConfirmDialog.close(); backend.chooseAndImportLibrary() } } }
    }

    Dialog {
        id: previewDialog
        enter: PopupIn {}
        exit: PopupOut {}
        modal: true; padding: 20; title: "词条预览"
        header: DlgHeader { titleText: previewDialog.title }
        standardButtons: Dialog.NoButton
        anchors.centerIn: parent; width: Math.min(root.width - 48, 500)
        onClosed: backend.closePreview()
        background: Rectangle { radius:12; color:clr.surface; border.width:1; border.color:clr.border }
        contentItem: ColumnLayout {
            spacing: 12
            RowLayout { spacing: 10
                Rectangle { width: 42; height: 42; radius: 8; color: clr.surfaceHigh; border.width:2; border.color:clr.border
                    Text { anchors.centerIn:parent; text:backend.previewName.substring(0,1); color:clr.accent; font.pixelSize:20; font.weight:Font.Bold }
                }
                ColumnLayout { spacing: 2; Text { text: backend.previewName; color:clr.textPrimary; font.pixelSize:18; font.weight:Font.DemiBold; wrapMode:Text.Wrap }
                Text { text: backend.previewTypeName; color:clr.accent; font.pixelSize:11; font.weight:Font.Medium } }
            }
            TextField { Layout.fillWidth:true; readOnly:true; selectByMouse:true; text: backend.previewUuid; color:clr.textMuted; font.pixelSize:10; background: Rectangle { radius:6; color:clr.surfaceHigh; border.width:1; border.color:clr.border } }
            Text { Layout.fillWidth:true; text: backend.previewSummary||"暂无简介"; color: backend.previewSummary?clr.textSecondary:clr.textMuted; font.pixelSize:13; wrapMode:Text.Wrap }
            Text { Layout.fillWidth:true; text: backend.previewNotes; color:clr.textPrimary; font.pixelSize:12; wrapMode:Text.Wrap; maximumLineCount:8; elide:Text.ElideRight }
        }
        footer: DlgFooter { SecondaryBtn { text:"关闭"; onClicked:previewDialog.close() }
        PrimaryBtn { text:"打开词条"; onClicked:root.openPreviewedEntity() } }
    }

    Dialog {
        id: deleteDialog
        enter: PopupIn {}
        exit: PopupOut {}
        modal: true; padding: 20; title: "删除词条"
        header: DlgHeader { titleText: deleteDialog.title }
        standardButtons: Dialog.NoButton
        anchors.centerIn: parent; width: Math.min(root.width - 48, 400)
        background: Rectangle { radius:12; color:clr.surface; border.width:1; border.color:clr.border }
        contentItem: Text { text:"将「" + backend.currentName + "」移入回收站？"; color:clr.textPrimary; wrapMode:Text.Wrap; padding:4 }
        footer: DlgFooter { SecondaryBtn { text:"取消"; onClicked:deleteDialog.close() }
        PrimaryBtn { text:"移入回收站"; danger:true; onClicked: { backend.deleteEntity(); deleteDialog.close() } } }
    }

    Dialog {
        id: unsavedDialog
        enter: PopupIn {}
        exit: PopupOut {}
        modal: true; padding: 20; title: "未保存的修改"
        header: DlgHeader { titleText: unsavedDialog.title }
        standardButtons: Dialog.NoButton
        anchors.centerIn: parent; width: Math.min(root.width - 48, 500)
        closePolicy: Popup.NoAutoClose
        background: Rectangle { radius:12; color:clr.surface; border.width:1; border.color:clr.border }
        contentItem: Text { text:"当前词条有未保存的修改，是否保存后继续？"; color:clr.textPrimary; wrapMode:Text.Wrap; padding:4 }
        footer: DlgFooter {
            SecondaryBtn { text:"继续编辑"; onClicked: { backend.cancelPendingAction(); unsavedDialog.close() } }
            SecondaryBtn { text:"放弃修改"; onClicked: { backend.discardAndContinue(); unsavedDialog.close() } }
            PrimaryBtn { text:"保存并继续"; onClicked: { backend.saveAndContinue(); if (!backend.dirty) unsavedDialog.close() } }
        }
    }

    // ── 状态同步 ─────────────────────────────────────────────
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
        if (backend.dirty) { close.accepted = false; backend.requestClose() }
    }
}
