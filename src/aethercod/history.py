"""实体变更历史记录和版本控制。"""

from __future__ import annotations

import json
import sqlite3
from typing import Any

from .models import Entity, new_uuid, normalize_uuid, utc_now


class EntityHistory:
    """实体变更历史管理器。"""

    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self._init_tables()

    def _init_tables(self) -> None:
        """初始化历史记录表。"""
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS entity_history (
                id TEXT PRIMARY KEY,
                entity_id TEXT NOT NULL,
                version INTEGER NOT NULL,
                snapshot TEXT NOT NULL,
                changed_by TEXT,
                changed_at TEXT NOT NULL,
                change_type TEXT NOT NULL,
                change_description TEXT,
                UNIQUE(entity_id, version)
            )
        """)
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_history_entity ON entity_history(entity_id, version DESC)"
        )

    def save_snapshot(
        self,
        entity: Entity,
        change_type: str,
        description: str = "",
        changed_by: str = "",
        *,
        commit: bool = True,
    ) -> None:
        """保存实体快照。

        Args:
            entity: 实体对象
            change_type: 变更类型 (create, update, delete, restore)
            description: 变更描述
            changed_by: 变更人
        """
        version = self._get_next_version(entity.id)
        snapshot = self._entity_to_dict(entity)

        self.conn.execute(
            """
            INSERT INTO entity_history
            (id, entity_id, version, snapshot, changed_by, changed_at, change_type, change_description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                new_uuid(),
                entity.id,
                version,
                json.dumps(snapshot, ensure_ascii=False),
                changed_by,
                utc_now(),
                change_type,
                description,
            ),
        )
        if commit:
            self.conn.commit()

    def _get_next_version(self, entity_id: str) -> int:
        """获取下一个版本号。"""
        result = self.conn.execute(
            "SELECT MAX(version) FROM entity_history WHERE entity_id = ?",
            (normalize_uuid(entity_id),),
        ).fetchone()
        return (result[0] or 0) + 1

    def get_history(self, entity_id: str, limit: int | None = 50) -> list[dict[str, Any]]:
        """获取实体历史记录。

        Args:
            entity_id: 实体ID
            limit: 返回记录数量

        Returns:
            历史记录列表，按版本倒序
        """
        query = """
            SELECT id, version, changed_by, changed_at, change_type, change_description
            FROM entity_history
            WHERE entity_id = ?
            ORDER BY version DESC
        """
        parameters: tuple[Any, ...] = (normalize_uuid(entity_id),)
        if limit is not None:
            query += " LIMIT ?"
            parameters = (*parameters, max(0, int(limit)))
        rows = self.conn.execute(query, parameters).fetchall()

        return [
            {
                "id": row["id"],
                "version": row["version"],
                "changed_by": row["changed_by"] or "",
                "changed_at": row["changed_at"],
                "change_type": row["change_type"],
                "description": row["change_description"] or "",
            }
            for row in rows
        ]

    def get_version(self, entity_id: str, version: int) -> dict[str, Any] | None:
        """获取指定版本的实体快照。

        Args:
            entity_id: 实体ID
            version: 版本号

        Returns:
            实体快照字典，如果版本不存在返回None
        """
        row = self.conn.execute(
            "SELECT snapshot FROM entity_history WHERE entity_id = ? AND version = ?",
            (normalize_uuid(entity_id), version),
        ).fetchone()

        if row:
            return json.loads(row["snapshot"])
        return None

    def restore_version(self, entity_id: str, version: int) -> Entity:
        """恢复到指定版本。

        Args:
            entity_id: 实体ID
            version: 要恢复的版本号

        Returns:
            恢复后的实体对象

        Raises:
            ValueError: 版本不存在
        """
        snapshot = self.get_version(entity_id, version)
        if not snapshot:
            raise ValueError(f"版本 {version} 不存在")

        entity = self._dict_to_entity(snapshot)
        entity.updated_at = utc_now()

        # 保存恢复操作为新版本
        self.save_snapshot(entity, "restore", f"恢复到版本 {version}")

        return entity

    def compare_versions(self, entity_id: str, version1: int, version2: int) -> dict[str, Any]:
        """比较两个版本的差异。

        Args:
            entity_id: 实体ID
            version1: 第一个版本号
            version2: 第二个版本号

        Returns:
            差异字典，包含added, removed, modified字段
        """
        snap1 = self.get_version(entity_id, version1)
        snap2 = self.get_version(entity_id, version2)

        if not snap1 or not snap2:
            raise ValueError("版本不存在")

        diff = {"added": {}, "removed": {}, "modified": {}}

        all_keys = set(snap1.keys()) | set(snap2.keys())

        for key in all_keys:
            if key not in snap1:
                diff["added"][key] = snap2[key]
            elif key not in snap2:
                diff["removed"][key] = snap1[key]
            elif snap1[key] != snap2[key]:
                diff["modified"][key] = {"old": snap1[key], "new": snap2[key]}

        return diff

    def delete_history(self, entity_id: str) -> None:
        """删除实体的所有历史记录。

        Args:
            entity_id: 实体ID
        """
        self.conn.execute(
            "DELETE FROM entity_history WHERE entity_id = ?", (normalize_uuid(entity_id),)
        )
        self.conn.commit()

    def prune_old_versions(self, entity_id: str, keep_versions: int = 10) -> int:
        """清理旧版本，只保留最新的N个版本。

        Args:
            entity_id: 实体ID
            keep_versions: 保留的版本数

        Returns:
            删除的版本数量
        """
        result = self.conn.execute(
            """
            DELETE FROM entity_history
            WHERE entity_id = ?
            AND version NOT IN (
                SELECT version FROM entity_history
                WHERE entity_id = ?
                ORDER BY version DESC
                LIMIT ?
            )
        """,
            (normalize_uuid(entity_id), normalize_uuid(entity_id), keep_versions),
        )
        self.conn.commit()
        return result.rowcount

    @staticmethod
    def _entity_to_dict(entity: Entity) -> dict[str, Any]:
        """将实体转换为字典。"""
        return {
            "id": entity.id,
            "type_id": entity.type_id,
            "name": entity.name,
            "summary": entity.summary,
            "notes": entity.notes,
            "color": entity.color,
            "remarks": entity.remarks,
            "aliases": entity.aliases,
            "tags": entity.tags,
            "custom_fields": entity.custom_fields,
            "dates": entity.dates,
            "created_at": entity.created_at,
            "updated_at": entity.updated_at,
            "deleted_at": entity.deleted_at,
        }

    @staticmethod
    def _dict_to_entity(data: dict[str, Any]) -> Entity:
        """将字典转换为实体。"""
        return Entity(
            id=data.get("id", ""),
            type_id=data.get("type_id", ""),
            name=data.get("name", ""),
            summary=data.get("summary", ""),
            notes=data.get("notes", ""),
            color=data.get("color", "#7c3aed"),
            remarks=data.get("remarks", ""),
            created_at=data.get("created_at", ""),
            updated_at=data.get("updated_at", ""),
            deleted_at=data.get("deleted_at"),
            aliases=data.get("aliases", []),
            tags=data.get("tags", []),
            custom_fields=data.get("custom_fields", {}),
            dates=data.get("dates", []),
        )
