# Aethercod

Aethercod 是一个本地优先的奇幻世界观百科与关系图谱工具。它把世界观拆成统一 UUID 词条（Entity）和任意关系（Relation），用单个 SQLite 文件保存一个独立世界观。

当前版本已经从基础 MVP 扩展为可运行的第二阶段工作台：人物、国家/政权、地区/地点等类型有专用字段和关联入口；关系图、可视化时间线、RGB 色轮、类型属性管理器、别名重定向和 Markdown 交换都已接入。

## 功能概览

### 词条与类型

- 所有词条使用 UUID v4；数据库兼容历史项目使用的 32 位小写十六进制 UUID。
- 界面显示 RFC 4122 形式的 UUID，例如 `123e4567-e89b-12d3-a456-426614174000`。
- 内置类型：人物、国家/政权、地区/地点、机构/组织、部分/分支、事件、物品、种族、概念/魔法。
- 通用字段：名称、摘要、别名、标签、颜色、Markdown 详细笔记、备注、创建时间、修改时间。
- 词条支持软删除、回收站恢复和颜色标记。

### 特化词条

- 人物：中文名、英文名、称号、性别/代词、种族、出生/死亡日期、出生地、身份/地位、经历事件。
- 国家/政权：正式名称、英文名、制度、面积、人口、地理概述、文化与经济、建立/终结日期、领袖、首都、行政区划、城市。
- 地区/地点：正式名称、英文名、地点类别、别称、地位、面积、人口、地理概述、经济文化与地区特色、所属国家、上级行政区。
- 机构/组织：宗旨、职能、负责人、成员、总部、分支、成立/解散日期。
- 事件：前因、经过、结果、起止日期、地点、参与人物、参与国家、参与机构。
- 物品：类别、材料、能力、历史、创造者、持有者、来源地、所属机构。
- 种族与概念/魔法也有对应的专用字段和关系入口。

跨词条信息使用关系保存，而不是把名称写死在文本里。例如人物的出生地连接到地区，地区再通过“所属国家”连接到国家；国家的领袖连接到人物，首都和城市连接到地区。

### 关系图与时间线

- 关系图使用 Qt 原生 Graphics View，支持节点拖动、缩放、平移、悬停关系高亮、双击打开词条和动态力导向布局。
- 节点颜色来自词条颜色，节点同时显示实体类型图标；关系边显示名称和方向箭头。
- 关系图可以导出为 PNG。
- 时间线使用可缩放的水平可视化时间轴，支持同年事件错层、日期区间、负年份和双击跳转词条。
- 日期通过年份范围选择器、月份和日期下拉控件选择，不允许直接输入自由文本；支持仅年份、年月和完整日期精度。

### 编辑与交换

- Markdown 正文实时预览，`[[UUID]]` 和 `[[UUID|显示文本]]` 会渲染成可点击内部链接。
- 结构化别名重定向可以把旧名称映射到目标词条；搜索别名时可解析到目标。
- 类型与属性定义管理器支持新增自定义类型、重命名用户类型、新增/编辑/删除属性定义。
- 属性支持文本、多行文本、整数、小数、布尔、枚举、日期和实体引用。
- 支持全库 JSON、单词条 JSON、Markdown 目录导出和 Markdown 导入。
- `.aethercod` 文件可复制备份；备份使用 SQLite backup API，包含 WAL 中尚未合并的数据。
- 数据校验检查 UUID、关系端点、Markdown 引用、重复别名、别名重定向、必填/类型错误字段、日期和重复关系。
- 编辑模式和全局只读预览模式可切换。只读模式保留搜索、查看、图谱、时间线和导出，禁用新建、导入、删除、关系修改和类型管理。

## 安装

推荐使用 Python 3.11 或更新版本。Windows PowerShell 示例：

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -e ".[dev]"
```

如果 PySide6 从配置的镜像下载时返回 `403`，可以临时使用官方 PyPI：

```powershell
python -m pip install --index-url https://pypi.org/simple PySide6 Markdown pytest black
```

验证环境：

```powershell
python -c "from PySide6.QtWidgets import QApplication; print('PySide6 ready')"
pytest -q
```

## 启动

```powershell
python -m aethercod
```

也可以使用安装后的命令：

```powershell
aethercod
```

程序图标资源位于 `src/aethercod/resources/aethercod.svg`，Windows 多尺寸图标位于同目录的 `aethercod.ico`。图标也会随 setuptools package-data 安装。

## 项目文件与迁移

每个 `.aethercod` 文件都是独立 SQLite 数据库，默认启用外键检查和 WAL。当前 schema 版本为 v2：第一次打开旧 v1 文件时会自动添加结构化别名、字段定义扩展和日期范围字段，不会删除现有实体、关系或正文。

建议在批量导入或大规模重构前使用“备份项目”。JSON 导入先规范化和校验 payload，再使用 savepoint 写入；发生错误时会回滚本次导入。

## UUID 与 Markdown 引用

生成的实体、关系、类型、自定义字段和日期 ID 采用统一 UUID 工具。历史 32 位无连字符形式仍可读取，导入时会规范化。Markdown 内部引用推荐使用：

```markdown
[[123e4567e89b12d3a456426614174000|王都]]
```

也可以使用带连字符的 UUID。校验工具会提示不存在或已删除的引用。

## 开发

源码位于 `src/aethercod`：

- `db.py`：SQLite schema 和 v1→v2 迁移
- `models.py`：领域 DTO、UUID 和日期校验
- `repositories.py`：实体、关系、字段、别名仓储
- `services.py`：搜索、时间线和校验服务
- `exchange.py`：JSON、Markdown 项目交换和一致性备份
- `ui/main_window.py`：桌面工作台
- `ui/graph_view.py`：动态关系图和 PNG 导出
- `ui/timeline_view.py`：可视化时间线
- `ui/specialized_forms.py`：人物、国家、地区等特化表单
- `ui/type_manager.py`：类型与属性管理器
- `ui/color_wheel.py`：RGB/Hue/Saturation 圆形色轮

常用检查：

```powershell
pytest -q
python -m compileall -q src tests
black --check --target-version py311 src tests
```

无显示器环境下可以使用：

```powershell
$env:QT_QPA_PLATFORM = "offscreen"
python -m aethercod
```

## 当前边界

富文本以 Markdown 为持久化真相，当前没有引入重量级 WYSIWYG 编辑器。关系图采用本地 Qt 力导向视图；大规模数万节点库需要进一步增加分页、图谱范围限制和缓存。字段定义已经支持实体引用类型，但更复杂的多值关系仍建议使用 Relation，以保持数据网络的一致性。
