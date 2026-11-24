import { useActionDialog } from "./ActionDialog";
import { AnimatePresence, motion } from "framer-motion";
import Dropdown from "./Dropdown";
import {
  ChevronDown,
  CirclePlus,
  Eye,
  EyeOff,
  ExternalLink,
  FileCog,
  Github,
  Plus,
  Clock3,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useLayoutEffect, useState, type FormEvent } from "react";
import {
  desktopApi,
  type EntityType,
  type FieldDefinition,
  type ProjectState,
} from "./api";
import TypeIconPicker, { getTypeIcon } from "./TypeIconPicker";
import { displayFieldName, displayTypeName, translate, type Language } from "./i18n";

const FIELD_TYPES = [
  "text",
  "textarea",
  "integer",
  "number",
  "boolean",
  "date",
  "choice",
  "multiselect",
  "json",
  "entity_ref",
  "entity_refs",
];

type FieldDraft = {
  id?: string;
  type_id: string;
  name: string;
  field_type: string;
  required: boolean;
  description: string;
  options: string;
};

const emptyField = (typeId: string): FieldDraft => ({
  type_id: typeId,
  name: "",
  field_type: "text",
  required: false,
  description: "",
  options: "",
});

export default function SettingsView({
  state,
  initialTab,
  initialTypeId,
  onProjectUpdated,
  onChanged,
  onDirtyChange,
  language,
  onLanguageChange,
  onError,
  particlesEnabled,
  transitionsEnabled,
  onParticlesChange,
  onTransitionsChange,
}: {
  state: ProjectState;
  initialTab: "library" | "types";
  initialTypeId: string;
  onProjectUpdated: (state: ProjectState) => void;
  onChanged: () => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onError: (message: string) => void;
  particlesEnabled: boolean;
  transitionsEnabled: boolean;
  onParticlesChange: (enabled: boolean) => void;
  onTransitionsChange: (enabled: boolean) => void;
}) {
  const actionDialog = useActionDialog();
  const [tab, setTab] = useState<"library" | "types">(initialTab);
  const [project, setProject] = useState(state.project);
  const [types, setTypes] = useState(state.types);
  const [selectedTypeId, setSelectedTypeId] = useState(
    initialTypeId || state.types[0]?.id || "",
  );
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [typeName, setTypeName] = useState("");
  const [typeIcon, setTypeIcon] = useState("✦");
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeIcon, setNewTypeIcon] = useState("✦");
  const [fieldDraft, setFieldDraft] = useState<FieldDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMode, setSaveMode] = useState(state.save_mode);
  const [saveInterval, setSaveInterval] = useState(state.save_interval);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [saveNotice, setSaveNotice] = useState(0);

  const selectedType = types.find((type) => type.id === selectedTypeId);
  const savedField = fields.find((field) => field.id === fieldDraft?.id);
  const hasFieldChanges = fieldDraft !== null && (
    fieldDraft.name !== (savedField?.name ?? "") ||
    fieldDraft.field_type !== (savedField?.field_type ?? "text") ||
    fieldDraft.required !== (savedField?.required ?? false) ||
    fieldDraft.description !== (savedField?.description ?? "") ||
    fieldDraft.options !== (savedField?.options.join(", ") ?? "")
  );
  const hasChanges =
    (project !== null && state.project !== null && (
      project.name !== state.project.name ||
      project.era_name !== state.project.era_name ||
      project.author !== state.project.author ||
      project.description !== state.project.description
    )) ||
    saveMode !== state.save_mode ||
    (saveMode === "interval" && saveInterval !== state.save_interval) ||
    (selectedType !== undefined && (typeName !== selectedType.name || typeIcon !== selectedType.icon)) ||
    newTypeName !== "" || hasFieldChanges;
  useLayoutEffect(() => {
    onDirtyChange(hasChanges);
    return () => onDirtyChange(false);
  }, [hasChanges, onDirtyChange]);

  useEffect(() => {
    if (!saveNotice) return;
    const timeout = window.setTimeout(() => setSaveNotice(0), 3_000);
    return () => window.clearTimeout(timeout);
  }, [saveNotice]);

  useEffect(() => {
    setProject(state.project);
  }, [state.project]);

  useEffect(() => {
    setSaveMode(state.save_mode);
    setSaveInterval(state.save_interval);
  }, [state.save_interval, state.save_mode]);

  useEffect(() => {
    setTypes(state.types);
    setSelectedTypeId((current) =>
      state.types.some((type) => type.id === current)
        ? current
        : (state.types[0]?.id ?? ""),
    );
  }, [state.types]);

  useEffect(() => {
    const selected = types.find((type) => type.id === selectedTypeId);
    setTypeName(selected?.name ?? "");
    setTypeIcon(selected?.icon ?? "✦");
    setFieldDraft(selected ? emptyField(selected.id) : null);
    if (!selected) {
      setFields([]);
      return;
    }
    let current = true;
    setFields([]);
    desktopApi()
      ?.list_fields(selected.id)
      .then((items) => {
        if (current) setFields(items);
      })
      .catch((reason: Error) => {
        if (current) onError(reason.message);
      });
    return () => {
      current = false;
    };
  }, [selectedTypeId, types, onError]);

  if (!project) return null;

  const saveProject = async (event: FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true);
      const next = await desktopApi()?.update_project(project);
      if (next) onProjectUpdated(next);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  const saveSaveSettings = async () => {
    setSavingPolicy(true);
    try {
      const next = await desktopApi()?.update_save_settings(
        saveMode,
        Math.max(1, saveInterval),
      );
      if (next) {
        onProjectUpdated(next);
        setSaveNotice((current) => current + 1);
      }
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSavingPolicy(false);
    }
  };

  const saveType = async (event: FormEvent) => {
    event.preventDefault();
    const selected = types.find((type) => type.id === selectedTypeId);
    if (!selected) return;
    try {
      const updated = await desktopApi()?.update_type(
        selected.id,
        typeName,
        typeIcon,
      );
      if (updated) {
        setTypes((current) =>
          current.map((type) => (type.id === updated.id ? updated : type)),
        );
        await onChanged();
      }
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const createType = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const created = await desktopApi()?.create_type(newTypeName, newTypeIcon);
      if (created) {
        setNewTypeName("");
        setTypes((current) => [...current, created]);
        setSelectedTypeId(created.id);
        await onChanged();
      }
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const deleteType = async (type: EntityType) => {
    if (
      type.is_builtin ||
      (await actionDialog({
        title: translate(language, "删除类型"),
        message: `${translate(language, "删除类型确认前缀")}${displayTypeName(language, type)}${translate(language, "删除类型确认后缀")}`,
        confirmLabel: translate(language, "删除"),
        danger: true,
      })) === null
    )
      return;
    try {
      await desktopApi()?.delete_type(type.id);
      const next = types.filter((item) => item.id !== type.id);
      setTypes(next);
      setSelectedTypeId(next[0]?.id ?? "");
      await onChanged();
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const toggleTypeHidden = async (type: EntityType) => {
    try {
      const next = await desktopApi()?.set_type_hidden(type.id, !type.hidden);
      if (next) {
        setTypes(next.types);
        await onChanged();
      }
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const editField = (field?: FieldDefinition) => {
    setFieldDraft(
      field
        ? {
            id: field.id,
            type_id: field.type_id,
            name: field.name,
            field_type: field.field_type,
            required: field.required,
            description: field.description,
            options: field.options.join(", "),
          }
        : emptyField(selectedTypeId),
    );
  };

  const saveField = async (event: FormEvent) => {
    event.preventDefault();
    if (!fieldDraft) return;
    try {
      const saved = await desktopApi()?.save_field({
        ...fieldDraft,
        options: fieldDraft.options
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      });
      if (saved) {
        setFields((current) =>
          current.some((item) => item.id === saved.id)
            ? current.map((item) => (item.id === saved.id ? saved : item))
            : [...current, saved],
        );
        setFieldDraft(emptyField(selectedTypeId));
        await onChanged();
      }
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const deleteField = async (field: FieldDefinition) => {
    if (
      (await actionDialog({
        title: translate(language, "删除字段"),
        message: `${translate(language, "删除字段确认前缀")}${displayFieldName(language, field)}${translate(language, "删除字段确认后缀")}`,
        confirmLabel: translate(language, "删除"),
        danger: true,
      })) === null
    )
      return;
    try {
      await desktopApi()?.delete_field(field.id);
      setFields((current) => current.filter((item) => item.id !== field.id));
      if (fieldDraft?.id === field.id)
        setFieldDraft(emptyField(selectedTypeId));
      await onChanged();
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return (
    <div className="settings-page">
      <header className="view-header">
        <div>
          <span className="section-kicker">{translate(language, "资料库管理")}</span>
          <h1>{translate(language, "设置")}</h1>
        </div>
        <nav className="settings-tabs" aria-label={translate(language, "设置分类")}>
          <button
            className={tab === "library" ? "active" : ""}
            onClick={() => setTab("library")}
          >
            <FileCog size={14} />
            {translate(language, "资料库")}
          </button>
          <button
            className={tab === "types" ? "active" : ""}
            onClick={() => setTab("types")}
          >
            <ChevronDown size={14} />
            {translate(language, "类型与字段")}
          </button>
        </nav>
      </header>

      <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={tab}
        className="settings-tab-content"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      >
      {tab === "library" ? (
        <form
          className="settings-form"
          onSubmit={(event) => void saveProject(event)}
        >
          <section className="settings-section">
            <div className="settings-section-title">
              <div>
                <span className="section-kicker">{translate(language, "当前项目")}</span>
                <h2>{translate(language, "资料库信息")}</h2>
              </div>
              <button
                type="button"
                className="path-label"
                aria-label={`${translate(language, "在文件管理器中显示资料库")} ${project.path}`}
                title={project.path}
                onClick={() => void desktopApi()?.reveal_project_file().catch((reason: Error) => onError(reason.message))}
              >
                {project.path}
              </button>
            </div>
            <fieldset
              className="settings-field-grid"
              disabled={!state.writable || saving}
            >
              <label>
                {translate(language, "资料库名称")}
                <input
                  value={project.name}
                  onChange={(event) =>
                    setProject({ ...project, name: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                {translate(language, "纪年法")}
                <input
                  value={project.era_name}
                  onChange={(event) =>
                    setProject({ ...project, era_name: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                {translate(language, "作者")}
                <input
                  value={project.author}
                  onChange={(event) =>
                    setProject({ ...project, author: event.target.value })
                  }
                />
              </label>
              <label className="span-all">
                {translate(language, "说明")}
                <textarea
                  rows={4}
                  value={project.description}
                  onChange={(event) =>
                    setProject({ ...project, description: event.target.value })
                  }
                />
              </label>
            </fieldset>
            <div className="settings-form-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={!state.writable || saving}
              >
                <Save size={14} />
                {translate(language, saving ? "正在保存" : "保存资料库设置")}
              </button>
            </div>
          </section>
          <section className="settings-section language-section">
            <div className="settings-section-title">
              <div>
                <span className="section-kicker">Language</span>
                <h2>{language === "en" ? "Language" : "语言设置"}</h2>
              </div>
              <Dropdown
                label="Language"
                value={language}
                onChange={(next) => onLanguageChange(next as Language)}
                options={[
                  { value: "zh", label: "中文" },
                  { value: "en", label: "English" },
                ]}
              />
            </div>
          </section>
          <section className="settings-section save-settings-section">
            <div className="settings-section-title">
              <div>
                <span className="section-kicker">{translate(language, "保存机制")}</span>
                <h2>{translate(language, "编辑保存策略")}</h2>
              </div>
              <Clock3 size={18} />
            </div>
            <div className="save-mode-options" role="radiogroup" aria-label={translate(language, "保存机制")}>
              {([
                ["manual", translate(language, "手动保存"), translate(language, "仅在点击保存或按 Ctrl+S 时写入资料库")],
                ["interval", translate(language, "定时自动保存"), translate(language, "按设定的分钟间隔保存未提交修改")],
                ["realtime", translate(language, "实时自动保存"), translate(language, "编辑后短暂等待并同步到资料库")],
              ] as const).map(([mode, label, description]) => (
                <button
                  type="button"
                  key={mode}
                  className={`save-mode-option ${saveMode === mode ? "selected" : ""}`}
                  role="radio"
                  aria-checked={saveMode === mode}
                  disabled={!state.writable}
                  onClick={() => setSaveMode(mode)}
                >
                  <span className="save-mode-radio" />
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                </button>
              ))}
            </div>
            <AnimatePresence initial={false}>
              {saveMode === "interval" && (
                <motion.div
                  key="save-interval"
                  className="save-interval-region"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                >
                  <label className="save-interval-field">
                    {translate(language, "自动保存间隔（分钟）")}
                    <input
                      type="number"
                      min={1}
                      max={1440}
                      step={1}
                      value={saveInterval}
                      disabled={!state.writable}
                      onChange={(event) =>
                        setSaveInterval(Math.max(1, Number(event.target.value) || 1))
                      }
                    />
                  </label>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="settings-form-actions">
              <button
                className="primary-button"
                type="button"
                disabled={!state.writable || savingPolicy}
                onClick={() => void saveSaveSettings()}
              >
                <Save size={14} />
                {translate(language, "保存")}
              </button>
            </div>
          </section>
          <section className="settings-section visual-settings">
            <div className="settings-section-title"><h2>{translate(language, "视觉动效与性能")}</h2></div>
            <label>
              <span>{translate(language, "背景粒子")}</span>
              <input type="checkbox" checked={particlesEnabled}
                onChange={(event) => onParticlesChange(event.target.checked)} />
            </label>
            <label>
              <span>{translate(language, "界面过渡动画")}</span>
              <input type="checkbox" checked={transitionsEnabled}
                onChange={(event) => onTransitionsChange(event.target.checked)} />
            </label>
          </section>
          <section className="settings-section preference-section">
            <div className="settings-section-title">
              <div>
                <span className="section-kicker">{translate(language, "访问状态")}</span>
                <h2>
                  {translate(language, state.read_only
                    ? "当前状态：只读锁定模式"
                    : state.writable
                      ? "当前状态：正常可编辑（读写模式）"
                      : "当前状态：资料库不可写")}
                </h2>
              </div>
              <ShieldCheck size={18} />
            </div>
            <p>
              {translate(language, state.read_only
                ? "正文、属性和关联均已锁定，关闭只读模式后可继续编辑。"
                : state.writable
                  ? "词条正文、属性、关联和资料库设置均可写入本地数据库。"
                  : "当前资料库权限不允许写入，设置和词条内容无法保存。")}
            </p>
          </section>
          <section className="settings-section feedback-section">
            <div className="settings-section-title">
              <div>
                <span className="section-kicker">{translate(language, "反馈与开源")}</span>
                <h2>{translate(language, "参与 Aethercod")}</h2>
              </div>
              <Github size={18} />
            </div>
            <p>{translate(language, "欢迎提交问题反馈、功能建议或代码贡献。")}</p>
            <a
              className="secondary-button github-button"
              href="https://github.com/HanaWind/aethercod"
              target="_blank"
              rel="noreferrer"
              onClick={(event) => {
                const api = desktopApi();
                if (!api) return;
                event.preventDefault();
                void api
                  .open_external_url("https://github.com/HanaWind/aethercod")
                  .catch((reason: Error) => onError(reason.message));
              }}
            >
              <ExternalLink size={14} />
              {translate(language, "项目 GitHub")}
            </a>
          </section>
        </form>
      ) : (
        <div className="taxonomy-settings">
          <aside className="taxonomy-list">
            <div className="settings-section-title">
              <div>
                <span className="section-kicker">{translate(language, "词条结构")}</span>
                <h2>{translate(language, "类型")}</h2>
              </div>
            </div>
            {types.filter((type) => !type.hidden).map((type) => (
              <button
                className={`taxonomy-choice ${selectedTypeId === type.id ? "selected" : ""}`}
                key={type.id}
                onClick={() => setSelectedTypeId(type.id)}
              >
                <span>
                  {(() => {
                    const Icon = getTypeIcon(type.icon);
                    return Icon ? <Icon size={15} /> : type.icon;
                  })()}
                </span>
                <strong>{displayTypeName(language, type)}</strong>
                <small>{translate(language, type.is_builtin ? "内置" : "自定义")}</small>
              </button>
            ))}
            {types.some((type) => type.hidden) && (
              <section className="hidden-types-section">
                <div className="hidden-types-heading">
                  <span>{translate(language, "已隐藏的词条类型")}</span>
                  <span>{types.filter((type) => type.hidden).length}</span>
                </div>
                {types.filter((type) => type.hidden).map((type) => (
                  <div className="hidden-type-row" key={type.id}>
                    <button
                      className={`taxonomy-choice ${selectedTypeId === type.id ? "selected" : ""}`}
                      onClick={() => setSelectedTypeId(type.id)}
                    >
                      <span>
                        {(() => {
                          const Icon = getTypeIcon(type.icon);
                          return Icon ? <Icon size={15} /> : type.icon;
                        })()}
                      </span>
                      <strong>{displayTypeName(language, type)}</strong>
                    </button>
                    <button
                      className="icon-button compact"
                      title={`${translate(language, "恢复显示")} ${displayTypeName(language, type)}`}
                      disabled={!state.writable}
                      onClick={() => void toggleTypeHidden(type)}
                    >
                      <Eye size={14} />
                    </button>
                  </div>
                ))}
              </section>
            )}
            <form
              className="add-type-form"
              onSubmit={(event) => void createType(event)}
            >
              <input
                aria-label={translate(language, "新类型名称")}
                value={newTypeName}
                onChange={(event) => setNewTypeName(event.target.value)}
                placeholder={translate(language, "新类型名称")}
                required
                disabled={!state.writable}
              />
              <TypeIconPicker
                value={newTypeIcon}
                onChange={setNewTypeIcon}
                disabled={!state.writable}
              />
              <button
                className="icon-button compact"
                title={translate(language, "创建类型")}
                disabled={!state.writable}
              >
                <Plus size={14} />
              </button>
            </form>
          </aside>
          <section className="fields-settings">
            {types.find((type) => type.id === selectedTypeId) && (
              <>
                <form
                  className="type-settings-form"
                  onSubmit={(event) => void saveType(event)}
                >
                  <div className="settings-section-title">
                    <div>
                      <span className="section-kicker">{translate(language, "类型配置")}</span>
                      <h2>
                        {selectedType && displayTypeName(language, selectedType)}
                      </h2>
                    </div>
                    <div className="type-header-actions">
                      <button
                        type="button"
                        className="icon-button"
                        title={
                          types.find((type) => type.id === selectedTypeId)?.hidden
                            ? translate(language, "恢复显示类型")
                            : translate(language, "隐藏类型")
                        }
                        disabled={!state.writable}
                        onClick={() => {
                          const selected = types.find(
                            (type) => type.id === selectedTypeId,
                          );
                          if (selected) void toggleTypeHidden(selected);
                        }}
                      >
                        {types.find((type) => type.id === selectedTypeId)?.hidden ? (
                          <Eye size={15} />
                        ) : (
                          <EyeOff size={15} />
                        )}
                      </button>
                      {!types.find((type) => type.id === selectedTypeId)
                        ?.is_builtin && (
                      <button
                        type="button"
                        className="icon-button"
                        title={translate(language, "删除类型")}
                        disabled={!state.writable}
                        onClick={() =>
                          void deleteType(
                            types.find((type) => type.id === selectedTypeId)!,
                          )
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                    </div>
                  </div>
                  <div className="type-edit-row">
                    <label>
                      {translate(language, "名称")}
                      <input
                        value={typeName}
                        disabled={
                          !state.writable ||
                          Boolean(
                            types.find((type) => type.id === selectedTypeId)
                              ?.is_builtin,
                          )
                        }
                        onChange={(event) => setTypeName(event.target.value)}
                      />
                    </label>
                    <label className="type-icon-field">
                      {translate(language, "图标")}
                      <TypeIconPicker
                        value={typeIcon}
                        onChange={setTypeIcon}
                        disabled={!state.writable}
                      />
                    </label>
                    <button
                      className="secondary-button"
                      disabled={!state.writable}
                    >
                      {translate(language, "保存类型")}
                    </button>
                  </div>
                </form>
                <div className="settings-section-title field-list-heading">
                  <div>
                    <span className="section-kicker">{translate(language, "动态 EAV 字段")}</span>
                    <h2>
                      {translate(language, "自定义字段")}{" "}
                      <span className="heading-count">{fields.length}</span>
                    </h2>
                  </div>
                </div>
                <div className="field-definitions-list">
                  {fields.map((field) => (
                    <div className="field-definition-row" key={field.id}>
                      <button onClick={() => editField(field)}>
                        <strong>{displayFieldName(language, field)}</strong>
                        <span>{field.field_type}</span>
                        {field.required && <small>{translate(language, "必填")}</small>}
                      </button>
                      <button
                        className="icon-button compact"
                        title={`${translate(language, "删除")} ${displayFieldName(language, field)}`}
                        disabled={!state.writable || field.protected}
                        onClick={() => void deleteField(field)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                {fieldDraft && (
                  <form
                    className="field-editor-form"
                    onSubmit={(event) => void saveField(event)}
                  >
                    <div className="settings-section-title">
                      <div>
                        <span className="section-kicker">
                          {translate(language, fieldDraft.id ? "编辑定义" : "新建定义")}
                        </span>
                        <h2>{fieldDraft.id ? (savedField ? displayFieldName(language, savedField) : fieldDraft.name) : translate(language, "添加字段")}</h2>
                      </div>
                      <button
                        type="button"
                        className="icon-button compact"
                        title={translate(language, "新建字段")}
                        onClick={() => editField()}
                      >
                        <CirclePlus size={15} />
                      </button>
                    </div>
                    <div className="field-editor-grid">
                      <label>
                        {translate(language, "字段名称")}
                        <input
                          value={fieldDraft.name}
                          onChange={(event) =>
                            setFieldDraft({
                              ...fieldDraft,
                              name: event.target.value,
                            })
                          }
                          required
                          disabled={!state.writable}
                        />
                      </label>
                      <label>
                        {translate(language, "数据类型")}
                        <Dropdown
                          label={translate(language, "数据类型")}
                          value={fieldDraft.field_type}
                          options={[
                            ...new Set([...FIELD_TYPES, fieldDraft.field_type]),
                          ].map((value) => ({ value, label: value }))}
                          onChange={(field_type) =>
                            setFieldDraft({ ...fieldDraft, field_type })
                          }
                          disabled={!state.writable}
                        />
                      </label>
                      <label className="span-all">
                        {translate(language, "说明")}
                        <input
                          value={fieldDraft.description}
                          onChange={(event) =>
                            setFieldDraft({
                              ...fieldDraft,
                              description: event.target.value,
                            })
                          }
                          disabled={!state.writable}
                        />
                      </label>
                      {["choice", "select", "multiselect"].includes(
                        fieldDraft.field_type,
                      ) && (
                        <label className="span-all">
                          {translate(language, "选项")}
                          <input
                            value={fieldDraft.options}
                            onChange={(event) =>
                              setFieldDraft({
                                ...fieldDraft,
                                options: event.target.value,
                              })
                            }
                            placeholder={translate(language, "用逗号分隔选项")}
                            disabled={!state.writable}
                          />
                        </label>
                      )}
                      <label className="required-setting">
                        <input
                          type="checkbox"
                          checked={fieldDraft.required}
                          onChange={(event) =>
                            setFieldDraft({
                              ...fieldDraft,
                              required: event.target.checked,
                            })
                          }
                          disabled={!state.writable}
                        />
                        {translate(language, "必填字段")}
                      </label>
                    </div>
                    <div className="settings-form-actions">
                      <button
                        className="primary-button"
                        disabled={!state.writable}
                      >
                        <Save size={14} />
                        {translate(language, "保存字段")}
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </section>
        </div>
      )}
      </motion.div>
      </AnimatePresence>
      <AnimatePresence>
        {saveNotice > 0 && (
          <motion.div
            key={saveNotice}
            role="status"
            className="settings-save-toast glass-menu"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <motion.path
                d="m5 12 4 4L19 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.32, ease: "easeOut" }}
              />
            </svg>
            {language === "en" ? "Save behavior updated" : "保存机制已更新"}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
