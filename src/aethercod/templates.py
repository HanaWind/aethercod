"""实体模板系统。"""

from __future__ import annotations

import json
import sqlite3
from typing import Any

from .models import Entity, new_uuid, normalize_uuid, utc_now


class EntityTemplate:
    """实体模板。"""

    def __init__(
        self,
        id: str,
        name: str,
        type_id: str,
        description: str = "",
        default_fields: dict[str, Any] | None = None,
        default_tags: list[str] | None = None,
        auto_relations: list[dict[str, str]] | None = None,
    ):
        self.id = id
        self.name = name
        self.type_id = type_id
        self.description = description
        self.default_fields = default_fields or {}
        self.default_tags = default_tags or []
        self.auto_relations = auto_relations or []

    def apply_to_entity(self, entity: Entity) -> Entity:
        """应用模板到实体。

        Args:
            entity: 目标实体

        Returns:
            应用模板后的实体
        """
        # 应用默认字段值
        for field, value in self.default_fields.items():
            if field not in entity.custom_fields:
                entity.custom_fields[field] = value

        # 应用默认标签
        for tag in self.default_tags:
            if tag not in entity.tags:
                entity.tags.append(tag)

        return entity


class TemplateManager:
    """模板管理器。"""

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self._init_tables()

    def _init_tables(self) -> None:
        """初始化模板表。"""
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS entity_templates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type_id TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                default_fields TEXT NOT NULL DEFAULT '{}',
                default_tags TEXT NOT NULL DEFAULT '[]',
                auto_relations TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_templates_type ON entity_templates(type_id)"
        )
        self.conn.commit()

    def create(
        self,
        name: str,
        type_id: str,
        description: str = "",
        default_fields: dict[str, Any] | None = None,
        default_tags: list[str] | None = None,
        auto_relations: list[dict[str, str]] | None = None,
    ) -> EntityTemplate:
        """创建模板。

        Args:
            name: 模板名称
            type_id: 实体类型ID
            description: 模板描述
            default_fields: 默认字段值
            default_tags: 默认标签
            auto_relations: 自动创建的关系

        Returns:
            创建的模板
        """
        template_id = new_uuid()
        now = utc_now()

        self.conn.execute(
            """
            INSERT INTO entity_templates
            (id, name, type_id, description, default_fields, default_tags, auto_relations, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                template_id,
                name,
                type_id,
                description,
                json.dumps(default_fields or {}, ensure_ascii=False),
                json.dumps(default_tags or [], ensure_ascii=False),
                json.dumps(auto_relations or [], ensure_ascii=False),
                now,
                now,
            ),
        )
        self.conn.commit()

        return EntityTemplate(
            template_id,
            name,
            type_id,
            description,
            default_fields,
            default_tags,
            auto_relations,
        )

    def get(self, template_id: str) -> EntityTemplate | None:
        """获取模板。

        Args:
            template_id: 模板ID

        Returns:
            模板对象，不存在返回None
        """
        row = self.conn.execute(
            "SELECT * FROM entity_templates WHERE id = ?", (normalize_uuid(template_id),)
        ).fetchone()

        if not row:
            return None

        return self._row_to_template(row)

    def list(self, type_id: str | None = None) -> list[EntityTemplate]:
        """列出模板。

        Args:
            type_id: 可选的类型ID过滤

        Returns:
            模板列表
        """
        if type_id:
            rows = self.conn.execute(
                "SELECT * FROM entity_templates WHERE type_id = ? ORDER BY name",
                (type_id,),
            ).fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM entity_templates ORDER BY type_id, name"
            ).fetchall()

        return [self._row_to_template(row) for row in rows]

    def update(
        self,
        template_id: str,
        name: str | None = None,
        description: str | None = None,
        default_fields: dict[str, Any] | None = None,
        default_tags: list[str] | None = None,
        auto_relations: list[dict[str, str]] | None = None,
    ) -> EntityTemplate:
        """更新模板。

        Args:
            template_id: 模板ID
            name: 新名称（可选）
            description: 新描述（可选）
            default_fields: 新默认字段（可选）
            default_tags: 新默认标签（可选）
            auto_relations: 新自动关系（可选）

        Returns:
            更新后的模板

        Raises:
            ValueError: 模板不存在
        """
        template = self.get(template_id)
        if not template:
            raise ValueError(f"模板不存在: {template_id}")

        updates = []
        params = []

        if name is not None:
            updates.append("name = ?")
            params.append(name)

        if description is not None:
            updates.append("description = ?")
            params.append(description)

        if default_fields is not None:
            updates.append("default_fields = ?")
            params.append(json.dumps(default_fields, ensure_ascii=False))

        if default_tags is not None:
            updates.append("default_tags = ?")
            params.append(json.dumps(default_tags, ensure_ascii=False))

        if auto_relations is not None:
            updates.append("auto_relations = ?")
            params.append(json.dumps(auto_relations, ensure_ascii=False))

        if updates:
            updates.append("updated_at = ?")
            params.append(utc_now())
            params.append(normalize_uuid(template_id))

            self.conn.execute(
                f"UPDATE entity_templates SET {', '.join(updates)} WHERE id = ?", params
            )
            self.conn.commit()

        return self.get(template_id)  # type: ignore

    def delete(self, template_id: str) -> None:
        """删除模板。

        Args:
            template_id: 模板ID
        """
        self.conn.execute(
            "DELETE FROM entity_templates WHERE id = ?", (normalize_uuid(template_id),)
        )
        self.conn.commit()

    def save_from_entity(self, entity: Entity, template_name: str, description: str = "") -> EntityTemplate:
        """将实体保存为模板。

        Args:
            entity: 源实体
            template_name: 模板名称
            description: 模板描述

        Returns:
            创建的模板
        """
        return self.create(
            name=template_name,
            type_id=entity.type_id,
            description=description,
            default_fields=entity.custom_fields.copy(),
            default_tags=entity.tags.copy(),
        )

    def create_entity_from_template(self, template_id: str, name: str = "") -> Entity:
        """从模板创建实体。

        Args:
            template_id: 模板ID
            name: 实体名称（可选）

        Returns:
            创建的实体

        Raises:
            ValueError: 模板不存在
        """
        template = self.get(template_id)
        if not template:
            raise ValueError(f"模板不存在: {template_id}")

        entity = Entity(
            id="",
            type_id=template.type_id,
            name=name or f"新{template.name}",
            custom_fields=template.default_fields.copy(),
            tags=template.default_tags.copy(),
        )

        return entity

    @staticmethod
    def _row_to_template(row: sqlite3.Row) -> EntityTemplate:
        """将数据库行转换为模板对象。"""
        return EntityTemplate(
            id=row["id"],
            name=row["name"],
            type_id=row["type_id"],
            description=row["description"],
            default_fields=json.loads(row["default_fields"]),
            default_tags=json.loads(row["default_tags"]),
            auto_relations=json.loads(row["auto_relations"]),
        )
