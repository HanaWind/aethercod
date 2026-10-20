from __future__ import annotations

import os
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

import pytest
from PySide6.QtCore import Qt, QUrl
from PySide6.QtQml import QQmlApplicationEngine, QQmlExpression
from PySide6.QtQuickControls2 import QQuickStyle
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication

from aethercod.ui.app_identity import application_icon
from aethercod.ui.qml_backend import QmlBackend


@pytest.fixture
def qapp():
    return QApplication.instance() or QApplication([])


@pytest.fixture
def qml_backend(qapp):
    backend = QmlBackend(qapp)
    yield backend
    backend.closeProject()


def test_qml_facade_round_trips_entity_models_and_keeps_open_project(qml_backend, tmp_path):
    backend = qml_backend
    project_path = tmp_path / "world.db"
    assert backend.openProject(str(project_path))

    backend.newEntity()
    backend.setCurrentField("name", "北境守望者")
    backend.setCurrentField("tags", "人物, 北境")
    backend.setCurrentField("customFields", '{"血统": "霜裔"}')
    backend._current.dates = [{"date_kind": "birth", "label": "出生", "year": 125}]
    assert backend.saveEntity()
    first_id = backend.currentEntityId

    backend.newEntity()
    backend.setCurrentField("name", "雪松要塞")
    assert backend.saveEntity()
    second_id = backend.currentEntityId

    backend.newEntity()
    backend.setCurrentField("name", "星陨荒原")
    assert backend.saveEntity()
    third_id = backend.currentEntityId
    assert third_id not in (first_id, second_id)
    backend._service.new_relation(first_id, second_id, "驻守于", "驻守者")
    backend.selectEntity(first_id)

    entity_index = backend.entityModel.index(0, 0)
    entity_role = next(
        role for role, name in backend.entityModel.roleNames().items() if name == b"name"
    )
    assert backend.entityModel.data(entity_index, entity_role) == "北境守望者"
    assert backend.entityCount == 3
    assert backend.timelineCount == 1
    assert backend.relationCount == 1
    assert backend.graphCount == 3
    assert (
        backend.currentUuid
        == f"{first_id[:8]}-{first_id[8:12]}-{first_id[12:16]}-{first_id[16:20]}-{first_id[20:]}"
    )
    backend.setGraphScope("neighbors")
    assert backend.graphCount == 2
    backend.setGraphScope("all")
    assert backend.graphCount == 3
    assert backend.timelineModel.data(backend.timelineModel.index(0, 0), Qt.UserRole + 7) == 125
    assert (
        backend.relationModel.data(backend.relationModel.index(0, 0), Qt.UserRole + 3) == "雪松要塞"
    )

    invalid_path = tmp_path / "invalid.db"
    invalid_path.write_text("not a database", encoding="utf-8")
    assert not backend.openProject(str(invalid_path))
    assert backend.hasProject
    assert backend.projectPath == str(project_path)
    assert backend.entityCount == 3


def test_qml_editor_saves_terra_years_ranges_and_bidirectional_relations(qml_backend, tmp_path):
    backend = qml_backend
    project_path = tmp_path / "terra-world.aethercod"
    assert backend.openProject(str(project_path))

    backend.newEntity()
    backend.setCurrentField("name", "苍穹女王")
    assert backend.saveDate("", "birth", "诞生", "42", "year", "", "", "")
    assert backend.saveDate("", "reign", "统治时期", "-42", "range", "", "-12", "")
    assert backend.saveEntity()
    first_id = backend.currentEntityId
    assert (
        backend.currentUuid
        == f"{first_id[:8]}-{first_id[8:12]}-{first_id[12:16]}-{first_id[16:20]}-{first_id[20:]}"
    )

    backend.newEntity()
    backend.setCurrentField("name", "星辰王国")
    assert backend.saveEntity()
    second_id = backend.currentEntityId

    backend.selectEntity(first_id)
    backend.prepareRelation("")
    assert backend.saveRelation(second_id, "统治", "受其统治", "王权记录")
    relation_id = backend._service.relation_rows(first_id)[0]["id"]
    backend.selectEntity(second_id)
    backend.prepareRelation(relation_id)
    assert backend.relationLabel == "受其统治"
    assert backend.relationReverseLabel == "统治"
    assert backend.saveRelation(first_id, "反抗", "镇压", "政权更替")
    backend.previewEntity(first_id)
    assert (
        backend.previewUuid
        == f"{first_id[:8]}-{first_id[8:12]}-{first_id[12:16]}-{first_id[16:20]}-{first_id[20:]}"
    )

    first_relation = backend._service.relation_rows(first_id)[0]
    second_relation = backend._service.relation_rows(second_id)[0]
    assert first_relation["display_label"] == "镇压"
    assert second_relation["display_label"] == "反抗"
    assert backend.timelineCount == 2
    assert backend.timelineModel._rows[0]["year"] == -42
    assert backend.timelineModel._rows[-1]["year"] == 42
    assert "泰拉纪元前 42 年" in backend.timelineBoundsText
    other_type = next(type_id for type_id in backend._types if type_id != backend._current.type_id)
    backend.setTypeFilter(other_type)
    assert backend.timelineCount == 2
    backend.setTimelineTypeFilter(other_type)
    assert backend.timelineCount == 0
    backend.setTimelineTypeFilter("")
    assert backend.timelineCount == 2
    backend.setTypeFilter("")

    graph_path = tmp_path / "network.png"
    assert backend.exportGraphPng(str(graph_path))
    assert graph_path.exists() and graph_path.stat().st_size > 100


def test_project_metadata_persists_and_controls_calendar_labels(qml_backend, tmp_path):
    backend = qml_backend
    project_path = tmp_path / "northern-chronicle.aethercod"
    assert backend.createProject(
        str(project_path),
        "北境纪事",
        "星历",
        "档案官",
        "记录北境诸国、人物与历史事件。",
    )
    assert backend.projectName == "北境纪事"
    assert backend.eraName == "星历"
    assert backend.projectAuthor == "档案官"
    assert backend.projectDescription.startswith("记录北境")
    assert backend.formatYear(-42) == "星历前 42 年"
    assert backend.formatYear(125) == "星历 125 年"

    assert backend.updateProjectSettings("北境总志", "王国历", "修订者", "第二版")
    backend.closeProject()
    assert backend.openProject(str(project_path))
    assert backend.projectName == "北境总志"
    assert backend.eraName == "王国历"
    assert backend.projectAuthor == "修订者"
    assert backend.projectDescription == "第二版"


def test_graph_export_without_selection_and_backup_source_guard(qml_backend, tmp_path, monkeypatch):
    backend = qml_backend
    project_path = tmp_path / "archive.aethercod"
    assert backend.createProject(str(project_path), "群星档案", "星历", "", "")
    backend.newEntity()
    backend.setCurrentField("name", "晨星港")
    assert backend.saveEntity()
    backend._current = None
    backend._reload_graph()

    graph_path = tmp_path / "archive-network.png"
    monkeypatch.setattr(
        "aethercod.ui.qml_backend.QFileDialog.getSaveFileName",
        lambda *args, **kwargs: (str(graph_path), "PNG 图片 (*.png)"),
    )
    assert backend.chooseAndExportGraph()
    assert graph_path.exists() and graph_path.stat().st_size > 100

    monkeypatch.setattr(
        "aethercod.ui.qml_backend.QFileDialog.getSaveFileName",
        lambda *args, **kwargs: (str(project_path), "Aethercod 项目 (*.aethercod)"),
    )
    assert not backend.chooseAndBackupProject()
    assert backend.statusMessage == "备份文件不能覆盖当前资料库"
    assert application_icon().isNull() is False


def test_qml_typed_properties_are_generic_and_the_qml_screen_loads(qml_backend, tmp_path):
    backend = qml_backend
    assert backend.openProject(str(tmp_path / "typed-properties.aethercod"))
    backend.newEntity()
    backend.setCurrentField("name", "Frostborn Envoy")
    assert backend.saveDate("", "birth", "Arrival", "42", "year", "", "", "")
    assert backend.saveEntity()
    assert backend.saveFieldDefinition(
        "", "Lineage", "choice", True, "Character origin", "Frostborn, Starborn"
    )
    definition = next(
        item
        for item in backend._service.fields.list(backend.currentTypeId)
        if item.name == "Lineage"
    )
    backend.setCustomFieldValue("Lineage", '"Frostborn"')
    assert backend.saveEntity()
    assert backend._current.custom_fields["Lineage"] == "Frostborn"
    assert backend.saveFieldDefinition(
        definition.id, "Lineage", "text", False, "Character origin", ""
    )
    assert backend._current.custom_fields["Lineage"] == "Frostborn"
    first_id = backend.currentEntityId
    entity_type = backend.currentTypeId

    backend.newEntity()
    backend.setCurrentField("name", "Northern Hold")
    assert backend.saveEntity()
    target_id = backend.currentEntityId
    backend.selectEntity(first_id)
    assert backend.saveFieldDefinition("", "Home", "entity_ref", False, "Home location", "")
    backend.setCustomFieldValue("Home", f'"{target_id}"')
    assert backend.saveEntity()
    assert backend.currentTypeId == entity_type

    QQuickStyle.setStyle("Basic")
    engine = QQmlApplicationEngine()
    errors = []
    engine.warnings.connect(
        lambda warnings: errors.extend(warning.toString() for warning in warnings)
    )
    engine.rootContext().setContextProperty("backend", backend)
    qml_path = Path(__file__).parents[1] / "src" / "aethercod" / "ui" / "qml" / "Main.qml"
    engine.load(QUrl.fromLocalFile(str(qml_path.resolve())))
    QApplication.instance().processEvents()
    assert engine.rootObjects()
    root = engine.rootObjects()[0]
    root.setProperty("page", "timeline")
    QTest.qWait(100)
    context = engine.contextForObject(root)
    for expression, expected in (
        ("timelineRepeater.count", 1),
        ("timelineRepeater.itemAt(0).index", 0),
        ("timelineRepeater.itemAt(0).lane", 0),
    ):
        evaluation = QQmlExpression(context, root, expression)
        value, undefined = evaluation.evaluate()
        assert not evaluation.hasError(), evaluation.error().toString()
        assert not undefined and value == expected
    for expression in (
        "projectActionsPopup.open()",
        "projectActionsPopup.close()",
        "root.prepareNewProject()",
        "newProjectDialog.close()",
        "timelineTypeFilter.popup.open()",
        "timelineTypeFilter.popup.close()",
        "timelineViewport.timelineScale = 1.8",
        "root.page = 'entries'",
        "fieldDefinitionDialog.open()",
        "fieldTypeCombo.popup.open()",
        "fieldTypeCombo.popup.close()",
        "fieldDefinitionDialog.close()",
        "dateDialog.open()",
        "datePrecision.popup.open()",
        "datePrecision.popup.close()",
        "dateDialog.close()",
        "backend.prepareRelation('')",
        "relationDialog.open()",
        "relationTarget.popup.open()",
        "relationTarget.popup.close()",
        "relationDialog.close()",
        "root.page = 'graph'",
        "root.page = 'validation'",
        "root.showProjectSettings()",
    ):
        evaluation = QQmlExpression(context, root, expression)
        evaluation.evaluate()
        assert not evaluation.hasError(), evaluation.error().toString()
        QTest.qWait(20)
    scale_expression = QQmlExpression(context, root, "timelineViewport.timelineScale")
    scale, undefined = scale_expression.evaluate()
    assert not scale_expression.hasError(), scale_expression.error().toString()
    assert not undefined and scale == pytest.approx(1.8)
    assert root.property("page") == "settings"
    assert backend.fieldModel.rowCount() > 0
    assert not errors
    engine.deleteLater()
