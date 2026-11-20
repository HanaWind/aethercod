"""批量操作工具集。"""

from __future__ import annotations

import sqlite3
from typing import Any

from .models import Entity, Relation, new_uuid
from .repositories import EntityRepository, RelationRepository, atomic


class BatchOperations:
    """批量操作工具类。"""

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.entities = EntityRepository(conn)
        self.relations = RelationRepository(conn)

    def batch_update_field(
        self, entity_ids: list[str], field_name: str, value: Any
    ) -> dict[str, int]:
        """批量更新自定义字段。

        Args:
            entity_ids: 实体ID列表
            field_name: 字段名称
            value: 新值

        Returns:
            操作结果统计 {"success": 成功数, "failed": 失败数}
        """
        success = 0
        failed = 0

        with atomic(self.conn):
            for entity_id in entity_ids:
                try:
                    entity = self.entities.get(entity_id)
                    if entity:
                        entity.custom_fields[field_name] = value
                        self.entities.save(entity)
                        success += 1
                    else:
                        failed += 1
                except Exception:
                    failed += 1

        return {"success": success, "failed": failed}

    def batch_add_tags(self, entity_ids: list[str], tags: list[str]) -> dict[str, int]:
        """批量添加标签。

        Args:
            entity_ids: 实体ID列表
            tags: 要添加的标签列表

        Returns:
            操作结果统计
        """
        success = 0
        failed = 0

        with atomic(self.conn):
            for entity_id in entity_ids:
                try:
                    entity = self.entities.get(entity_id)
                    if entity:
                        for tag in tags:
                            if tag not in entity.tags:
                                entity.tags.append(tag)
                        self.entities.save(entity)
                        success += 1
                    else:
                        failed += 1
                except Exception:
                    failed += 1

        return {"success": success, "failed": failed}

    def batch_remove_tags(self, entity_ids: list[str], tags: list[str]) -> dict[str, int]:
        """批量移除标签。

        Args:
            entity_ids: 实体ID列表
            tags: 要移除的标签列表

        Returns:
            操作结果统计
        """
        success = 0
        failed = 0

        with atomic(self.conn):
            for entity_id in entity_ids:
                try:
                    entity = self.entities.get(entity_id)
                    if entity:
                        entity.tags = [t for t in entity.tags if t not in tags]
                        self.entities.save(entity)
                        success += 1
                    else:
                        failed += 1
                except Exception:
                    failed += 1

        return {"success": success, "failed": failed}

    def batch_set_color(self, entity_ids: list[str], color: str) -> dict[str, int]:
        """批量设置颜色。

        Args:
            entity_ids: 实体ID列表
            color: 颜色值（十六进制）

        Returns:
            操作结果统计
        """
        success = 0
        failed = 0

        with atomic(self.conn):
            for entity_id in entity_ids:
                try:
                    entity = self.entities.get(entity_id)
                    if entity:
                        entity.color = color
                        self.entities.save(entity)
                        success += 1
                    else:
                        failed += 1
                except Exception:
                    failed += 1

        return {"success": success, "failed": failed}

    def batch_create_relations(
        self,
        source_ids: list[str],
        target_id: str,
        label: str,
        reverse_label: str = "",
        notes: str = "",
    ) -> dict[str, int]:
        """批量创建关系（多个源实体指向同一目标）。

        Args:
            source_ids: 源实体ID列表
            target_id: 目标实体ID
            label: 关系标签
            reverse_label: 反向标签
            notes: 关系说明

        Returns:
            操作结果统计
        """
        success = 0
        failed = 0

        with atomic(self.conn):
            for source_id in source_ids:
                try:
                    if source_id != target_id:
                        relation = Relation(
                            id="",
                            source_id=source_id,
                            target_id=target_id,
                            label=label,
                            reverse_label=reverse_label,
                            notes=notes,
                        )
                        self.relations.save(relation)
                        success += 1
                    else:
                        failed += 1
                except Exception:
                    failed += 1

        return {"success": success, "failed": failed}

    def batch_delete_relations(self, relation_ids: list[str]) -> dict[str, int]:
        """批量删除关系。

        Args:
            relation_ids: 关系ID列表

        Returns:
            操作结果统计
        """
        success = 0
        failed = 0

        with atomic(self.conn):
            for relation_id in relation_ids:
                try:
                    self.relations.delete(relation_id)
                    success += 1
                except Exception:
                    failed += 1

        return {"success": success, "failed": failed}

    def batch_soft_delete(self, entity_ids: list[str]) -> dict[str, int]:
        """批量软删除实体。

        Args:
            entity_ids: 实体ID列表

        Returns:
            操作结果统计
        """
        success = 0
        failed = 0

        with atomic(self.conn):
            for entity_id in entity_ids:
                try:
                    self.entities.soft_delete(entity_id)
                    success += 1
                except Exception:
                    failed += 1

        return {"success": success, "failed": failed}

    def batch_restore(self, entity_ids: list[str]) -> dict[str, int]:
        """批量恢复已删除的实体。

        Args:
            entity_ids: 实体ID列表

        Returns:
            操作结果统计
        """
        success = 0
        failed = 0

        with atomic(self.conn):
            for entity_id in entity_ids:
                try:
                    self.entities.restore(entity_id)
                    success += 1
                except Exception:
                    failed += 1

        return {"success": success, "failed": failed}

    def merge_entities(
        self,
        primary_id: str,
        secondary_ids: list[str],
        strategy: str = "keep_primary",
    ) -> Entity:
        """合并多个实体。

        Args:
            primary_id: 主实体ID（保留）
            secondary_ids: 次要实体ID列表（将被合并）
            strategy: 合并策略
                - "keep_primary": 保留主实体的所有数据
                - "merge_fields": 合并自定义字段
                - "merge_tags": 合并标签

        Returns:
            合并后的实体

        Raises:
            ValueError: 主实体不存在
        """
        primary = self.entities.get(primary_id)
        if not primary:
            raise ValueError(f"主实体不存在: {primary_id}")

        with atomic(self.conn):
            for secondary_id in secondary_ids:
                secondary = self.entities.get(secondary_id)
                if not secondary:
                    continue

                # 合并字段
                if strategy in ("merge_fields", "merge_tags"):
                    for key, value in secondary.custom_fields.items():
                        if key not in primary.custom_fields:
                            primary.custom_fields[key] = value

                # 合并标签
                if strategy == "merge_tags":
                    for tag in secondary.tags:
                        if tag not in primary.tags:
                            primary.tags.append(tag)

                # 转移关系
                # 将指向次要实体的关系改为指向主实体
                self.conn.execute(
                    "UPDATE relations SET target_id = ? WHERE target_id = ?",
                    (primary_id, secondary_id),
                )
                self.conn.execute(
                    "UPDATE relations SET source_id = ? WHERE source_id = ?",
                    (primary_id, secondary_id),
                )

                # 删除次要实体
                self.entities.soft_delete(secondary_id)

            # 保存更新后的主实体
            primary = self.entities.save(primary)

        return primary

    def duplicate_entity(
        self, entity_id: str, new_name: str = "", include_relations: bool = False
    ) -> Entity:
        """复制实体。

        Args:
            entity_id: 源实体ID
            new_name: 新实体名称（留空则自动添加"副本"后缀）
            include_relations: 是否复制关系

        Returns:
            复制的新实体

        Raises:
            ValueError: 源实体不存在
        """
        source = self.entities.get(entity_id)
        if not source:
            raise ValueError(f"实体不存在: {entity_id}")

        with atomic(self.conn):
            # 创建副本
            new_entity = Entity(
                id="",
                type_id=source.type_id,
                name=new_name or f"{source.name} (副本)",
                summary=source.summary,
                notes=source.notes,
                color=source.color,
                aliases=[],  # 不复制别名，避免冲突
                tags=source.tags.copy(),
                custom_fields=source.custom_fields.copy(),
                dates=source.dates.copy(),
            )
            new_entity = self.entities.save(new_entity)

            # 复制关系
            if include_relations:
                relations = self.relations.list_by_entity(entity_id)
                for rel in relations:
                    new_relation = Relation(
                        id="",
                        source_id=new_entity.id
                        if rel.source_id == entity_id
                        else rel.source_id,
                        target_id=new_entity.id
                        if rel.target_id == entity_id
                        else rel.target_id,
                        label=rel.label,
                        reverse_label=rel.reverse_label,
                        notes=rel.notes,
                    )
                    self.relations.save(new_relation)

        return new_entity
