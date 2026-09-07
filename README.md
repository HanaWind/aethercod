# Aethercod

Aethercod 是一个本地优先的奇幻世界观资料库。它使用 SQLite 单文件保存独立世界观，以统一 UUID 词条和任意自定义关系构建可检索的设定网络。

## 当前 MVP

- `.aethercod` 项目文件（SQLite）
- 人物、国家/政权、地区/地点、机构/组织、部分/分支、事件、物品等实体类型
- UUID、别名、摘要、Markdown 详情、标签、颜色、备注和时间线日期
- 任意实体间的自定义双向关系
- 全局搜索、类型/标签筛选、关系面板、反向引用和运行时数据校验
- JSON 全库/单词条导入导出
- 编辑/只读预览模式与浅色/深色主题

## 启动

```bash
python -m venv .venv
.venv\\Scripts\\activate
pip install -e ".[dev]"
python -m aethercod
```

也可以直接运行 `aethercod`。首次启动后通过“新建项目”创建 `.aethercod` 文件。

## 测试

```bash
pytest
```

## 数据约定

详情正文以 Markdown 保存。内部引用使用 `[[实体UUID]]` 或 `[[实体UUID|显示文本]]`，导入后可通过校验面板发现无效引用。每个 `.aethercod` 文件天然是相互独立的世界观库，可直接复制备份。
