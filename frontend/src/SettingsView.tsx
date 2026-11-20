import { useActionDialog } from "./ActionDialog";
import Dropdown from "./Dropdown";
import {
  ChevronDown,
  CirclePlus,
  FileCog,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import {
  desktopApi,
  type EntityType,
  type FieldDefinition,
  type ProjectState,
} from "./api";

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
  onError,
}: {
  state: ProjectState;
  initialTab: "library" | "types";
  initialTypeId: string;
  onProjectUpdated: (state: ProjectState) => void;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
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

  useEffect(() => {
    setProject(state.project);
  }, [state.project]);

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
        title: "删除类型",
        message: `删除“${type.name}”？`,
        confirmLabel: "删除",
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
        title: "删除字段",
        message: `删除“${field.name}”及其已保存的值？`,
        confirmLabel: "删除",
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
          <span className="section-kicker">资料库管理</span>
          <h1>设置</h1>
        </div>
        <nav className="settings-tabs" aria-label="设置分类">
          <button
            className={tab === "library" ? "active" : ""}
            onClick={() => setTab("library")}
          >
            <FileCog size={14} />
            资料库
          </button>
          <button
            className={tab === "types" ? "active" : ""}
            onClick={() => setTab("types")}
          >
            <ChevronDown size={14} />
            类型与字段
          </button>
        </nav>
      </header>

      {tab === "library" ? (
        <form
          className="settings-form"
          onSubmit={(event) => void saveProject(event)}
        >
          <section className="settings-section">
            <div className="settings-section-title">
              <div>
                <span className="section-kicker">当前项目</span>
                <h2>资料库信息</h2>
              </div>
              <span className="path-label">{project.path}</span>
            </div>
            <fieldset
              className="settings-field-grid"
              disabled={!state.writable || saving}
            >
              <label>
                资料库名称
                <input
                  value={project.name}
                  onChange={(event) =>
                    setProject({ ...project, name: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                纪年法
                <input
                  value={project.era_name}
                  onChange={(event) =>
                    setProject({ ...project, era_name: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                作者
                <input
                  value={project.author}
                  onChange={(event) =>
                    setProject({ ...project, author: event.target.value })
                  }
                />
              </label>
              <label className="span-all">
                说明
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
                {saving ? "保存中" : "保存资料库设置"}
              </button>
            </div>
          </section>
          <section className="settings-section preference-section">
            <div className="settings-section-title">
              <div>
                <span className="section-kicker">访问状态</span>
                <h2>编辑保护</h2>
              </div>
              <ShieldCheck size={18} />
            </div>
            <p>只读模式会在桥接层拒绝所有项目写入请求。</p>
          </section>
        </form>
      ) : (
        <div className="taxonomy-settings">
          <aside className="taxonomy-list">
            <div className="settings-section-title">
              <div>
                <span className="section-kicker">词条结构</span>
                <h2>类型</h2>
              </div>
            </div>
            {types.map((type) => (
              <button
                className={`taxonomy-choice ${selectedTypeId === type.id ? "selected" : ""}`}
                key={type.id}
                onClick={() => setSelectedTypeId(type.id)}
              >
                <span>{type.icon}</span>
                <strong>{type.name}</strong>
                <small>{type.is_builtin ? "内置" : "自定义"}</small>
              </button>
            ))}
            <form
              className="add-type-form"
              onSubmit={(event) => void createType(event)}
            >
              <input
                aria-label="新类型名称"
                value={newTypeName}
                onChange={(event) => setNewTypeName(event.target.value)}
                placeholder="新类型名称"
                required
                disabled={!state.writable}
              />
              <input
                className="type-icon-input"
                aria-label="类型图标"
                maxLength={2}
                value={newTypeIcon}
                onChange={(event) => setNewTypeIcon(event.target.value)}
                disabled={!state.writable}
              />
              <button
                className="icon-button compact"
                title="创建类型"
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
                      <span className="section-kicker">类型配置</span>
                      <h2>
                        {types.find((type) => type.id === selectedTypeId)?.name}
                      </h2>
                    </div>
                    {!types.find((type) => type.id === selectedTypeId)
                      ?.is_builtin && (
                      <button
                        type="button"
                        className="icon-button"
                        title="删除类型"
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
                  <div className="type-edit-row">
                    <label>
                      名称
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
                      图标
                      <input
                        maxLength={2}
                        value={typeIcon}
                        disabled={!state.writable}
                        onChange={(event) => setTypeIcon(event.target.value)}
                      />
                    </label>
                    <button
                      className="secondary-button"
                      disabled={!state.writable}
                    >
                      保存类型
                    </button>
                  </div>
                </form>
                <div className="settings-section-title field-list-heading">
                  <div>
                    <span className="section-kicker">动态 EAV 字段</span>
                    <h2>
                      自定义字段{" "}
                      <span className="heading-count">{fields.length}</span>
                    </h2>
                  </div>
                </div>
                <div className="field-definitions-list">
                  {fields.map((field) => (
                    <div className="field-definition-row" key={field.id}>
                      <button onClick={() => editField(field)}>
                        <strong>{field.name}</strong>
                        <span>{field.field_type}</span>
                        {field.required && <small>必填</small>}
                      </button>
                      <button
                        className="icon-button compact"
                        title={`删除 ${field.name}`}
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
                          {fieldDraft.id ? "编辑定义" : "新建定义"}
                        </span>
                        <h2>{fieldDraft.id ? fieldDraft.name : "添加字段"}</h2>
                      </div>
                      <button
                        type="button"
                        className="icon-button compact"
                        title="新建字段"
                        onClick={() => editField()}
                      >
                        <CirclePlus size={15} />
                      </button>
                    </div>
                    <div className="field-editor-grid">
                      <label>
                        字段名称
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
                        数据类型
                        <Dropdown
                          label="数据类型"
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
                        说明
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
                          选项
                          <input
                            value={fieldDraft.options}
                            onChange={(event) =>
                              setFieldDraft({
                                ...fieldDraft,
                                options: event.target.value,
                              })
                            }
                            placeholder="用逗号分隔选项"
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
                        必填字段
                      </label>
                    </div>
                    <div className="settings-form-actions">
                      <button
                        className="primary-button"
                        disabled={!state.writable}
                      >
                        <Save size={14} />
                        保存字段
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
