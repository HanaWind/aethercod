"""数据库性能优化索引。"""

# 添加到 db.py 的额外优化索引
OPTIMIZED_INDEXES = """
-- 复合索引优化常见查询
CREATE INDEX IF NOT EXISTS idx_entities_type_deleted ON entities(type_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_entities_updated ON entities(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_entities_deleted ON entities(deleted_at) WHERE deleted_at IS NOT NULL;

-- 关系查询优化
CREATE INDEX IF NOT EXISTS idx_relations_both ON relations(source_id, target_id);
CREATE INDEX IF NOT EXISTS idx_relations_created ON relations(created_at DESC);

-- 标签查询优化
CREATE INDEX IF NOT EXISTS idx_entity_tags_entity ON entity_tags(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_tags_tag ON entity_tags(tag_id);

-- 别名查询优化
CREATE INDEX IF NOT EXISTS idx_entity_aliases_normalized ON entity_aliases(normalized);

-- 字段值查询优化
CREATE INDEX IF NOT EXISTS idx_field_values_entity ON entity_field_values(entity_id);
CREATE INDEX IF NOT EXISTS idx_field_values_field ON entity_field_values(field_id);

-- 日期查询优化
CREATE INDEX IF NOT EXISTS idx_dates_entity ON entity_dates(entity_id);
CREATE INDEX IF NOT EXISTS idx_dates_year_range ON entity_dates(year, end_year);
"""


def add_optimized_indexes(conn) -> None:
    """添加性能优化索引。

    Args:
        conn: 数据库连接
    """
    for statement in OPTIMIZED_INDEXES.split(";"):
        if statement.strip():
            conn.execute(statement)
    conn.commit()
