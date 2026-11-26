from collections import Counter, deque
from pathlib import Path

from aethercod.db import connect
from aethercod.services import ProjectService
from aethercod.ui.bridge_api import BridgeAPI


def test_demo_sample_covers_all_types_dates_connected_relations_and_validation():
    path = Path(__file__).parents[1] / "samples" / "Aethercod_Demo.aethercod"
    assert path.is_file()
    conn = connect(path)
    try:
        service = ProjectService(conn, writable=False)
        types = service.taxonomy.list_types()
        entities = service.entities.list()
        counts = Counter(entity.type_id for entity in entities)
        assert counts.keys() == {entity_type.id for entity_type in types}
        assert all(counts[entity_type.id] >= 3 for entity_type in types)
        assert all(
            entity.summary and entity.aliases and entity.tags and entity.custom_fields and entity.notes
            for entity in entities
        )
        assert all(entity.dates for entity in entities)

        adjacency = {entity.id: set() for entity in entities}
        for entity in entities:
            for relation in service.relation_rows(entity.id):
                adjacency[entity.id].add(relation["other_id"])
        assert all(adjacency.values())
        visited = set()
        queue = deque([entities[0].id])
        while queue:
            entity_id = queue.popleft()
            if entity_id in visited:
                continue
            visited.add(entity_id)
            queue.extend(adjacency[entity_id] - visited)
        assert visited == set(adjacency)
        assert service.validation.scan() == []
    finally:
        conn.close()

    api = BridgeAPI()
    state = api.open_project(str(path))
    assert state["project"]["name"] == "Aethercod 演示世界"
    assert len(state["entities"]) == 27
    api.close_project()
