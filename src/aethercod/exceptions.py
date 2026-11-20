"""自定义异常类，提供更精确的错误处理。"""

from __future__ import annotations


class AethercodError(Exception):
    """Aethercod基础异常类。"""

    pass


class EntityNotFoundError(AethercodError):
    """实体不存在异常。"""

    def __init__(self, entity_id: str, message: str | None = None):
        self.entity_id = entity_id
        super().__init__(message or f"实体不存在: {entity_id}")


class RelationNotFoundError(AethercodError):
    """关系不存在异常。"""

    def __init__(self, relation_id: str, message: str | None = None):
        self.relation_id = relation_id
        super().__init__(message or f"关系不存在: {relation_id}")


class ValidationError(AethercodError):
    """数据验证失败异常。"""

    def __init__(self, message: str, field: str | None = None, value: str | None = None):
        self.field = field
        self.value = value
        super().__init__(message)


class DatabaseError(AethercodError):
    """数据库操作失败异常。"""

    pass


class ProjectError(AethercodError):
    """项目操作失败异常。"""

    pass


class DuplicateEntityError(AethercodError):
    """重复实体异常。"""

    def __init__(self, field: str, value: str):
        self.field = field
        self.value = value
        super().__init__(f"重复的{field}: {value}")


class PermissionError(AethercodError):
    """权限不足异常。"""

    pass


class SchemaVersionError(AethercodError):
    """Schema版本不兼容异常。"""

    def __init__(self, current: int, required: int):
        self.current = current
        self.required = required
        super().__init__(f"Schema版本不兼容: 当前{current}, 需要{required}")
