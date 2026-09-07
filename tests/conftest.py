from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from aethercod.db import connect
from aethercod.services import ProjectService


@pytest.fixture
def project(tmp_path):
    conn = connect(tmp_path / "test.aethercod")
    yield conn, ProjectService(conn)
    conn.close()
