import { ActionDialogProvider, useActionDialog } from "./ActionDialog";
import { AnimatePresence, LayoutGroup, MotionConfig, MotionGlobalConfig, motion, useReducedMotion } from "framer-motion";
import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleHelp,
  Command,
  Ellipsis,
  FilePlus2,
  FolderOpen,
  Gem,
  History,
  Link2,
  LockKeyhole,
  Copy,
  Minus,
  Moon,
  Network,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  Search,
  Save,
  Star,
  Settings2,
  Sparkles,
  Square,
  Sun,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  desktopApi,
  type Entity,
  type EntityDate,
  type EntitySummary,
  type EntityType,
  type FieldDefinition,
  type GraphData,
  type HistoryEntry,
  type ProjectState,
  type TimelineEntry,
} from "./api";
import ColorPicker from "./ColorPicker";
import AmbientParticles from "./AmbientParticles";
import Dropdown from "./Dropdown";
import { formatWorldDate } from "./worldDate";
import GraphView from "./GraphView";
import SettingsView from "./SettingsView";
import TimelineView from "./TimelineView";
import ElasticScroll from "./ElasticScroll";
import { propertyLayout } from "./propertyLayout";
import TypeIconPicker, { getTypeIcon } from "./TypeIconPicker";
import brandMark from "../../src/aethercod/resources/aethercod-mark.svg";

const TYPE_ICONS: Record<string, typeof UserRound> = {
  person: UserRound,
  polity: Gem,
  place: BookOpen,
  organization: Sparkles,
  branch: Link2,
  event: CalendarDays,
  item: Gem,
  species: UserRound,
  concept: Sparkles,
};

function TypeIcon({ type, size = 15 }: { type: EntityType; size?: number }) {
  const Icon = getTypeIcon(type.icon) ?? TYPE_ICONS[type.id] ?? Sparkles;
  return <Icon size={size} strokeWidth={1.7} />;
}

function App() {
  const [particlesEnabled, setParticlesEnabled] = useState(
    () => localStorage.getItem("aethercod-particles") !== "off",
  );
  const [transitionsEnabled, setTransitionsEnabled] = useState(
    () => localStorage.getItem("aethercod-transitions") !== "off",
  );
  const prefersReducedMotion = useReducedMotion();
  const motionEnabled = transitionsEnabled && !prefersReducedMotion;

  useLayoutEffect(() => {
    MotionGlobalConfig.skipAnimations = !motionEnabled;
    return () => { MotionGlobalConfig.skipAnimations = false; };
  }, [motionEnabled]);

  return (
    <MotionConfig reducedMotion={motionEnabled ? "never" : "always"}>
      <ActionDialogProvider>
        <Workspace
          motionEnabled={motionEnabled}
          particlesEnabled={particlesEnabled}
          transitionsEnabled={transitionsEnabled}
          onParticlesChange={(enabled) => {
            localStorage.setItem("aethercod-particles", enabled ? "on" : "off");
            setParticlesEnabled(enabled);
          }}
          onTransitionsChange={(enabled) => {
            localStorage.setItem("aethercod-transitions", enabled ? "on" : "off");
            setTransitionsEnabled(enabled);
          }}
        />
      </ActionDialogProvider>
    </MotionConfig>
  );
}

function Workspace({
  motionEnabled,
  particlesEnabled,
  transitionsEnabled,
  onParticlesChange,
  onTransitionsChange,
}: {
  motionEnabled: boolean;
  particlesEnabled: boolean;
  transitionsEnabled: boolean;
  onParticlesChange: (enabled: boolean) => void;
  onTransitionsChange: (enabled: boolean) => void;
}) {
  const actionDialog = useActionDialog();
  const [state, setState] = useState<ProjectState>({
    project: null,
    types: [],
    entities: [],
    writable: false,
    read_only: false,
    save_mode: "realtime",
    save_interval: 1,
  });
  const [activeView, setActiveView] = useState<
    "entries" | "timeline" | "graph" | "favorites" | "settings"
  >("entries");
  const [settingsTab, setSettingsTab] = useState<"library" | "types">(
    "library",
  );
  const [settingsTypeId, setSettingsTypeId] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    localStorage.getItem("aethercod-theme") === "dark" ? "dark" : "light",
  );
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Entity | null>(null);
  const [activeTypeId, setActiveTypeId] = useState("");
  const [openTypeIds, setOpenTypeIds] = useState<Record<string, boolean>>({});
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [windowMaximized, setWindowMaximized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusToast, setStatusToast] = useState<{
    message: string;
    kind: "success" | "error";
    key: number;
  } | null>(null);
  const [intervalSaveCycle, setIntervalSaveCycle] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [compactWindow, setCompactWindow] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [typeCreateOpen, setTypeCreateOpen] = useState(false);
  const [typeCreateValues, setTypeCreateValues] = useState({
    name: "",
    icon: "Sparkles",
  });
  const [typeCreateSubmitting, setTypeCreateSubmitting] = useState(false);
  const [createValues, setCreateValues] = useState({
    name: "",
    era_name: "泰拉纪元",
    author: "",
    description: "",
  });
  const [error, setError] = useState("");
  const [paletteNoMatch, setPaletteNoMatch] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [globalTimeline, setGlobalTimeline] = useState<TimelineEntry[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [categoryEditing, setCategoryEditing] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [graphFilterIds, setGraphFilterIds] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    kind: "type" | "entity" | "library";
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [showRelationForm, setShowRelationForm] = useState(false);
  const [relationValues, setRelationValues] = useState({
    target_id: "",
    label: "",
    reverse_label: "",
  });
  const [newDate, setNewDate] = useState({
    label: "",
    year: "",
    date_value: null as string | null,
    precision: "year",
    description: "",
  });
  const [revision, setRevision] = useState(0);
  const revisionRef = useRef(0);
  const projectPath = useRef<string | undefined>(undefined);
  const entityRequest = useRef(0);
  const historyEntity = useRef("");
  const pendingDrafts = useRef(new Map<string, { entity: Entity; version: number }>());
  const pendingSaves = useRef(
    new Map<string, { promise: Promise<void>; version: number }>(),
  );
  const paletteInput = useRef<HTMLInputElement>(null);
  const statusToastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    localStorage.setItem("aethercod-theme", theme);
  }, [theme]);

  useEffect(
    () => () => window.clearTimeout(statusToastTimer.current),
    [],
  );

  const refreshWindowState = useCallback(async () => {
    const api = desktopApi();
    if (api) setWindowMaximized(await api.window_maximized());
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refreshWindowState().catch(() => undefined), 80);
    };
    schedule();
    window.addEventListener("pywebviewready", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("focus", schedule);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pywebviewready", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("focus", schedule);
    };
  }, [refreshWindowState]);

  useEffect(() => {
    const resize = () => {
      const compact = window.innerWidth < 900;
      setCompactWindow(compact);
      if (compact) setSidebarOpen(false);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const syncState = useCallback((next: ProjectState) => {
    setState(next);
    const path = next.project?.path;
    if (path !== projectPath.current || !next.project) {
      projectPath.current = path;
      entityRequest.current += 1;
      pendingDrafts.current.clear();
      pendingSaves.current.clear();
      setDirty(false);
      setOpenTypeIds({});
      setActiveTypeId("");
      setSelectedId("");
      setDraft(null);
      setTimeline([]);
      setGlobalTimeline([]);
      setGraph({ nodes: [], edges: [] });
      setGraphFilterIds([]);
      setHistory([]);
      historyEntity.current = "";
      setActiveView("entries");
    } else {
      setSelectedId((current) =>
        next.entities.some((entity) => entity.id === current) ? current : "",
      );
      setDraft((current) =>
        current && !next.entities.some((entity) => entity.id === current.id)
          ? null
          : current,
      );
    }
  }, []);

  useEffect(() => {
    const api = desktopApi();
    if (api) {
      api
        .get_state()
        .then(syncState)
        .catch((reason: Error) => setError(reason.message));
      return;
    }
    const onReady = () => {
      desktopApi()
        ?.get_state()
        .then(syncState)
        .catch((reason: Error) => setError(reason.message));
    };
    window.addEventListener("pywebviewready", onReady, { once: true });
    return () => window.removeEventListener("pywebviewready", onReady);
  }, [syncState]);

  const loadEntity = useCallback(async (id: string, reveal = true) => {
    const api = desktopApi();
    if (!api) return;
    const request = ++entityRequest.current;
    const [entity, events, versions] = await Promise.all([
      api.get_entity(id),
      api.get_timeline(id),
      api.get_history(id),
    ]);
    if (request !== entityRequest.current) return;
    if (reveal) setActiveView("entries");
    setSelectedId(id);
    const pending = pendingDrafts.current.get(id);
    setDraft(pending?.entity ?? entity);
    if (entity && reveal) {
      setActiveTypeId(entity.type_id);
      setOpenTypeIds((current) => ({ ...current, [entity.type_id]: true }));
    }
    setDirty(pendingDrafts.current.size > 0);
    setShowRelationForm(false);
    setTimeline(events);
    setHistory(versions);
    historyEntity.current = id;
  }, []);

  const flushDraft = useCallback(async () => {
    const api = desktopApi();
    if (!api) return false;
    while (pendingDrafts.current.size > 0) {
      const [entityId, change] = pendingDrafts.current.entries().next().value as [
        string,
        { entity: Entity; version: number },
      ];
      if (!pendingSaves.current.has(entityId)) {
        const path = projectPath.current;
        setSaving(true);
        const promise = api
          .save_entity(change.entity)
          .then(async (saved) => {
            if (projectPath.current !== path) return;
            setState((current) => ({
              ...current,
              entities: [
                ...current.entities.filter((item) => item.id !== saved.id),
                saved,
              ].sort((left, right) => left.name.localeCompare(right.name)),
            }));
            if (pendingDrafts.current.get(entityId)?.version === change.version) {
              pendingDrafts.current.delete(entityId);
              if (selectedId === saved.id) setDraft(saved);
              setDirty(pendingDrafts.current.size > 0);
              setTimeline(
                saved.dates.map((date) => ({
                  id: date.id ?? "",
                  entity_id: saved.id,
                  name: saved.name,
                  type_id: saved.type_id,
                  date_kind: date.date_kind,
                  label: date.label ?? "",
                  description: date.description ?? "",
                  year: date.year ?? null,
                  date_value: date.date_value ?? null,
                  precision: date.precision ?? "exact",
                  end_year: date.end_year ?? null,
                  end_date_value: date.end_date_value ?? null,
                })),
              );
            }
            setError("");
            if (historyEntity.current === saved.id)
              setHistory(await api.get_history(saved.id));
          })
          .finally(() => {
            pendingSaves.current.delete(entityId);
            setSaving(false);
          });
        pendingSaves.current.set(entityId, { promise, version: change.version });
      }
      const attempt = pendingSaves.current.get(entityId)!;
      try {
        await attempt.promise;
      } catch (reason) {
        if (
          pendingDrafts.current.has(entityId) &&
          pendingDrafts.current.get(entityId)?.version !== attempt.version
        )
          continue;
        setError(reason instanceof Error ? reason.message : String(reason));
        return false;
      }
    }
    return true;
  }, [selectedId]);

  const showStatusToast = useCallback(
    (message: string, kind: "success" | "error") => {
      window.clearTimeout(statusToastTimer.current);
      setStatusToast({ message, kind, key: Date.now() });
      statusToastTimer.current = window.setTimeout(() => setStatusToast(null), 3000);
    },
    [],
  );

  const manualSave = useCallback(async () => {
    if (!state.project || !state.writable) return;
    if (await flushDraft()) {
      setIntervalSaveCycle((cycle) => cycle + 1);
      showStatusToast("已保存至本地资料库", "success");
    }
  }, [flushDraft, showStatusToast, state.project, state.writable]);

  const showIssueToast = (message: string) =>
    showStatusToast(message, "error");

  const navigateTo = async (
    view: "entries" | "timeline" | "graph" | "favorites" | "settings",
  ) => {
    setContextMenu(null);
    setActiveView(view);
    const api = desktopApi();
    if (!api || !state.project) return;
    try {
      if (view === "timeline") setGlobalTimeline(await api.get_timeline());
      if (view === "graph") setGraph(await api.get_graph());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const refreshProject = useCallback(async () => {
    const api = desktopApi();
    if (!api) return;
    const next = await api.get_state();
    syncState(next);
    if (selectedId && next.entities.some((entity) => entity.id === selectedId))
      await loadEntity(selectedId, false);
  }, [loadEntity, selectedId, syncState]);

  const toggleReadOnly = async () => {
    const api = desktopApi();
    if (!api) return;
    try {
      if (!state.read_only && !(await flushDraft())) return;
      setShowRelationForm(false);
      syncState(await api.set_read_only(!state.read_only));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const restoreVersion = async (version: number) => {
    const api = desktopApi();
    if (!api || !state.writable || !draft || !(await flushDraft())) return;
    try {
      await api.restore_entity_version(draft.id, version);
      await refreshProject();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const showRelatedGraph = async () => {
    if (!draft) return;
    if (!(await flushDraft())) return;
    setGraphFilterIds([draft.id]);
    await navigateTo("graph");
  };

  const toggleFavorite = () => {
    if (!draft || !state.writable) return;
    const isFavorite = !draft.is_favorite;
    updateDraft((current) => ({ ...current, is_favorite: isFavorite }));
    setState((current) => ({
      ...current,
      entities: current.entities.map((item) =>
        item.id === draft.id ? { ...item, is_favorite: isFavorite } : item,
      ),
    }));
    showStatusToast(
      isFavorite ? "已加入收藏夹" : "已移出收藏夹",
      "success",
    );
  };

  const exportJson = async () => {
    try {
      await desktopApi()?.export_json();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const importJson = async () => {
    const api = desktopApi();
    if (!api || !state.writable || !(await flushDraft())) return;
    try {
      const next = await api.import_json();
      syncState(next);
      setGraph(await api.get_graph());
      setGlobalTimeline(await api.get_timeline());
      if (selectedId && next.entities.some((entity) => entity.id === selectedId))
        await loadEntity(selectedId, false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const openContextMenu = (
    event: React.MouseEvent,
    kind: "type" | "entity" | "library",
    id: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    setContextMenu((current) =>
      current?.kind === kind && current.id === id
        ? null
        : {
            kind,
            id,
            x: Math.min(
              event.type === "contextmenu" ? event.clientX : bounds.left,
              window.innerWidth - 205,
            ),
            y: Math.min(
              event.type === "contextmenu" ? event.clientY : bounds.bottom + 4,
              window.innerHeight - 155,
            ),
          },
    );
  };

  const renameType = async (typeId: string) => {
    const type = state.types.find((item) => item.id === typeId);
    if (!type || type.is_builtin) return;
    const name = await actionDialog({
      title: "类型名称",
      initialValue: type.name,
      confirmLabel: "重命名",
    });
    if (!name || name === type.name) return;
    try {
      await desktopApi()?.update_type(type.id, name, type.icon);
      await refreshProject();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const createType = async () => {
    if (!state.writable || !(await flushDraft())) return;
    setTypeCreateValues({ name: "", icon: "Sparkles" });
    setTypeCreateOpen(true);
  };

  const submitCreateType = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      !state.writable ||
      typeCreateSubmitting ||
      !typeCreateValues.name.trim()
    )
      return;
    setTypeCreateSubmitting(true);
    try {
      const created = await desktopApi()?.create_type(
        typeCreateValues.name.trim(),
        typeCreateValues.icon,
      );
      if (created) {
        setTypeCreateOpen(false);
        await refreshProject();
        setSettingsTab("types");
        setSettingsTypeId(created.id);
        await navigateTo("settings");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setTypeCreateSubmitting(false);
    }
  };

  const deleteType = async (typeId: string) => {
    const type = state.types.find((item) => item.id === typeId);
    if (
      !type ||
      type.is_builtin ||
      (await actionDialog({
        title: "删除类型",
        message: `删除“${type.name}”？`,
        confirmLabel: "删除",
        danger: true,
      })) === null
    )
      return;
    try {
      await desktopApi()?.delete_type(type.id);
      setActiveTypeId("");
      await refreshProject();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const renameEntity = async (entityId: string) => {
    if (!state.writable || !(await flushDraft())) return;
    const entity = await desktopApi()?.get_entity(entityId);
    if (!entity) return;
    const name = await actionDialog({
      title: "词条名称",
      initialValue: entity.name,
      confirmLabel: "重命名",
    });
    if (!name || name === entity.name) return;
    try {
      const saved = await desktopApi()?.save_entity({ ...entity, name });
      if (saved) {
        setState((current) => ({
          ...current,
          entities: current.entities.map((item) =>
            item.id === saved.id ? saved : item,
          ),
        }));
        if (selectedId === saved.id) setDraft(saved);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  useEffect(() => {
    if (selectedId || !state.entities.length || activeView !== "entries")
      return;
    void loadEntity(state.entities[0].id).catch((reason: Error) =>
      setError(reason.message),
    );
  }, [activeView, state.entities, loadEntity, selectedId]);

  useEffect(() => {
    if (!state.project || !state.writable || state.save_mode !== "interval") return;
    const timer = window.setInterval(
      () => {
        if (pendingDrafts.current.size) void flushDraft();
      },
      Math.max(1, state.save_interval) * 60_000,
    );
    return () => window.clearInterval(timer);
  }, [
    flushDraft,
    intervalSaveCycle,
    state.project,
    state.save_interval,
    state.save_mode,
    state.writable,
  ]);

  useEffect(() => {
    if (!dirty || !state.writable || state.save_mode !== "realtime") return;
    const timer = window.setTimeout(() => void flushDraft(), 360);
    return () => window.clearTimeout(timer);
  }, [dirty, flushDraft, revision, state.save_mode, state.writable]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        setPaletteQuery("");
        setPaletteIndex(0);
        setPaletteNoMatch(false);
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void manualSave();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        if (activeView !== "entries" || !draft) return;
        event.preventDefault();
        toggleFavorite();
      } else if (event.key === "Escape") {
        setPaletteOpen(false);
        setCreateOpen(false);
        setTypeCreateOpen(false);
        setContextMenu(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeView, draft, manualSave, toggleFavorite]);

  useEffect(() => {
    if (paletteOpen) window.setTimeout(() => paletteInput.current?.focus(), 40);
  }, [paletteOpen]);

  const paletteItems = useMemo(() => {
    const normalized = paletteQuery.trim().toLocaleLowerCase();
    return state.entities.filter(
      (item) =>
        !normalized ||
        `${item.name} ${item.summary}`.toLocaleLowerCase().includes(normalized),
    );
  }, [paletteQuery, state.entities]);

  const onPaletteKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setPaletteIndex((index) => Math.min(index + 1, paletteItems.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setPaletteIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (paletteItems[paletteIndex]) {
        void selectEntity(paletteItems[paletteIndex]);
        setPaletteOpen(false);
      } else {
        setPaletteNoMatch(true);
      }
    }
  };

  const updateDraft = (update: (current: Entity) => Entity) => {
    const current = (draft && pendingDrafts.current.get(draft.id)?.entity) ?? draft;
    if (!current || !state.writable) return;
    const entity = update(current);
    const version = ++revisionRef.current;
    pendingDrafts.current.set(entity.id, { entity, version });
    setDraft(entity);
    setRevision(version);
    setDirty(true);
  };

  const selectEntity = async (entity: EntitySummary) => {
    try {
      await loadEntity(entity.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const selectById = (id: string) => {
    const entity = state.entities.find((item) => item.id === id);
    if (entity) void selectEntity(entity);
  };

  const changeWindow = async (action: "minimize" | "maximize") => {
    const api = desktopApi();
    if (!api) return;
    const workspace = document.querySelector(".workspace");
    let animation: Animation | undefined;
    try {
      if (workspace && motionEnabled) {
        animation = workspace.animate(
          [
            { transform: "scale(1)", opacity: 1 },
            {
              transform: action === "minimize" ? "scale(0.96)" : "scale(0.984)",
              opacity: action === "minimize" ? 0.25 : 0.83,
            },
          ],
          { duration: 150, easing: "ease-in-out", fill: "forwards" },
        );
        await animation.finished;
      }
      await api.window_action(action);
      if (action === "maximize") await refreshWindowState();
      if (action === "maximize" && animation) {
        animation.reverse();
        await animation.finished;
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      animation?.cancel();
    }
  };

  const openProject = async () => {
    if (!(await flushDraft())) return;
    try {
      const next = await desktopApi()?.open_project();
      if (next) {
        syncState(next);
        setError("");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const closeProject = async () => {
    if (!(await flushDraft())) return;
    try {
      const next = await desktopApi()?.close_project();
      if (next) syncState(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const promptForProject = () =>
    void actionDialog({
      title: "需要打开资料库",
      message: "请先新建或打开一个资料库后再访问此功能。",
      confirmLabel: "知道了",
    });

  const switchTheme = () => {
    const shell = document.querySelector(".app-shell");
    shell?.classList.add("theme-transition");
    setTheme((current) => (current === "light" ? "dark" : "light"));
    window.setTimeout(() => shell?.classList.remove("theme-transition"), 340);
  };

  const createProject = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!(await flushDraft())) return;
    try {
      const next = await desktopApi()?.create_project(
        "",
        createValues.name,
        createValues.era_name,
        createValues.author,
        createValues.description,
      );
      if (next) {
        syncState(next);
        setCreateOpen(false);
        setError("");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const createEntity = async (type: EntityType) => {
    const api = desktopApi();
    if (!api || !state.writable) return;
    try {
      const entity = await api.create_entity(type.id);
      entity.name = `未命名${type.name}`;
      const missingRequired = entity.fields?.some(
        (field) =>
          field.required &&
          (entity.custom_fields[field.name] === undefined ||
            entity.custom_fields[field.name] === ""),
      );
      if (missingRequired) {
        const version = ++revisionRef.current;
        setRevision(version);
        pendingDrafts.current.set(entity.id, { entity, version });
        setSelectedId(entity.id);
        setDraft(entity);
        setActiveView("entries");
        setTimeline([]);
        setDirty(true);
        setError("请填写必填属性后保存词条");
      } else {
        const version = ++revisionRef.current;
        setRevision(version);
        pendingDrafts.current.set(entity.id, { entity, version });
        setSelectedId(entity.id);
        setDraft(entity);
        setActiveView("entries");
        setTimeline([]);
        setDirty(true);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const addDate = () => {
    if (!newDate.year || !draft || !state.writable) return;
    const year = Number(newDate.year);
    if (!Number.isInteger(year)) return;
    const date: EntityDate = {
      date_kind: "custom",
      label: newDate.label.trim() || "历史节点",
      description: newDate.description.trim(),
      year,
      date_value: newDate.date_value,
      precision: newDate.precision,
    };
    updateDraft((current) => ({ ...current, dates: [...current.dates, date] }));
    setNewDate({ label: "", year: "", date_value: null, precision: "year", description: "" });
  };

  const addRelation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      !draft ||
      !state.writable ||
      !relationValues.target_id ||
      !relationValues.label.trim() ||
      !(await flushDraft())
    )
      return;
    try {
      await desktopApi()?.save_relation({
        source_id: draft.id,
        target_id: relationValues.target_id,
        label: relationValues.label.trim(),
        reverse_label: relationValues.reverse_label.trim(),
      });
      const refreshed = await desktopApi()?.get_entity(draft.id);
      if (refreshed) setDraft(refreshed);
      setRelationValues({ target_id: "", label: "", reverse_label: "" });
      setShowRelationForm(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const removeRelation = async (relationId: string) => {
    if (!draft || !state.writable || !(await flushDraft())) return;
    const relation = draft.relations?.find((item) => item.id === relationId);
    if (
      !relation ||
      (await actionDialog({
        title: "删除关联",
        message: `删除与“${relation.other_name}”之间的关联？`,
        confirmLabel: "删除关联",
        danger: true,
      })) === null
    )
      return;
    try {
      await desktopApi()?.delete_relation(relationId);
      const refreshed = await desktopApi()?.get_entity(draft.id);
      if (refreshed) setDraft(refreshed);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const removeEntity = async (entityId: string, entityName: string) => {
    if (
      !state.writable ||
      (await actionDialog({
        title: "永久删除词条",
        message: `永久删除“${entityName}”及其全部关联数据？此操作无法撤销。`,
        confirmLabel: "永久删除",
        danger: true,
      })) === null
    )
      return;
    try {
      if (selectedId === entityId) {
        pendingDrafts.current.delete(entityId);
        setDirty(pendingDrafts.current.size > 0);
        await pendingSaves.current.get(entityId)?.promise.catch(() => undefined);
      }
      await desktopApi()?.delete_entity(entityId);
      setState((current) => ({
        ...current,
        entities: current.entities.filter((entity) => entity.id !== entityId),
      }));
      if (selectedId === entityId) {
        setSelectedId("");
        setDraft(null);
        setTimeline([]);
      }
      if (activeView === "timeline")
        setGlobalTimeline((await desktopApi()?.get_timeline()) ?? []);
      if (activeView === "graph")
        setGraph((await desktopApi()?.get_graph()) ?? { nodes: [], edges: [] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const deleteEntity = async () => {
    if (draft) await removeEntity(draft.id, draft.name);
  };

  useEffect(() => {
    const onDeleteKey = (event: KeyboardEvent) => {
      if (event.key !== "Delete" || activeView !== "entries" || !draft) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("input, textarea, select, [contenteditable='true'], .editable-view, [role='textbox']")
      ) return;
      event.preventDefault();
      void deleteEntity();
    };
    window.addEventListener("keydown", onDeleteKey);
    return () => window.removeEventListener("keydown", onDeleteKey);
  }, [activeView, draft, selectedId, state.writable]);

  const deleteGraphNode = async (entityId: string, name: string) => {
    if (
      !state.writable ||
      !(await flushDraft()) ||
      (await actionDialog({
        title: "永久删除词条",
        message: `永久删除“${name}”及其全部关联数据？此操作无法撤销。`,
        confirmLabel: "永久删除",
        danger: true,
      })) === null
    )
      return;
    try {
      await desktopApi()?.delete_graph_node(entityId);
      setState((current) => ({
        ...current,
        entities: current.entities.filter((entity) => entity.id !== entityId),
      }));
      if (selectedId === entityId) {
        setSelectedId("");
        setDraft(null);
        setTimeline([]);
      }
      const api = desktopApi();
      if (api) {
        setGraph(await api.get_graph());
        setGlobalTimeline(await api.get_timeline());
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const typeById = (id: string) => state.types.find((type) => type.id === id);
  const reportError = useCallback((message: string) => setError(message), []);
  const properties = draft ? propertyLayout(draft) : null;
  const renderProperty = (field: FieldDefinition) => (
    <PropertyEditor
      key={field.id}
      field={field}
      value={draft?.custom_fields[field.name]}
      disabled={!state.writable}
      entities={state.entities}
      onIssue={showIssueToast}
      allowEmpty={draft?.type_id !== "place" || field.name !== "地点类别"}
      onChange={(value) =>
        updateDraft((current) => ({
          ...current,
          custom_fields: { ...current.custom_fields, [field.name]: value },
        }))
      }
    />
  );
  const updateAliases = (aliases: string[]) =>
    updateDraft((current) => ({ ...current, aliases }));

  return (
    <div
      className={`app-shell theme-${theme}${motionEnabled ? "" : " motion-disabled"}`}
      style={{ "--accent": draft?.color || "#7C3AED" } as React.CSSProperties}
      onClick={() => contextMenu && setContextMenu(null)}
    >
      {particlesEnabled && <AmbientParticles theme={theme} />}
      <header className="titlebar pywebview-drag-region">
        <div className="brand-lockup pywebview-drag-region">
          <div className="brand-mark">
            <img src={brandMark} alt="" aria-hidden="true" />
          </div>
          <span>AETHERCOD</span>
          {state.project && (
            <>
              <span className="brand-divider" />
              <span className="title-project">{state.project.name}</span>
            </>
          )}
        </div>
        <div className="titlebar-actions no-drag">
          {state.project && (
            <div className={`save-indicator ${saving ? "is-saving" : ""}`}>
              <span />
              {saving ? "正在同步" : dirty ? "尚未保存" : "已同步至本地库"}
            </div>
          )}
          {state.project && state.writable && (
            <button
              className="topbar-save"
              disabled={!dirty || saving}
              title="保存所有未保存修改（Ctrl+S）"
              onClick={() => void manualSave()}
            >
              <Save size={13} />
              保存
            </button>
          )}
          {state.project && (
            <button
              className="close-library-pill"
              title="关闭当前资料库"
              onClick={() => void closeProject()}
            >
              <FolderOpen size={13} />
              <span>关闭资料库</span>
            </button>
          )}
          {state.project && (
            <button
              className={`readonly-toggle ${state.read_only ? "active" : ""}`}
              title={state.read_only ? "关闭只读模式" : "开启只读模式"}
              onClick={() => void toggleReadOnly()}
            >
              <LockKeyhole size={14} />
              <span>{state.read_only ? "只读模式" : "编辑模式"}</span>
            </button>
          )}
          <button
            className="icon-button theme-toggle"
            title={theme === "light" ? "切换到深色主题" : "切换到浅色主题"}
            onClick={switchTheme}
          >
            {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
          </button>
          <button
            className="icon-button window-control"
            title="最小化"
            onClick={() => void changeWindow("minimize")}
          >
            <Minus size={16} aria-hidden="true" />
          </button>
          <button
            className="icon-button window-control"
            title={windowMaximized ? "还原窗口" : "最大化窗口"}
            aria-label={windowMaximized ? "还原窗口" : "最大化窗口"}
            onClick={() => void changeWindow("maximize")}
          >
            {windowMaximized ? <Copy size={13} aria-hidden="true" /> : <Square size={12} aria-hidden="true" />}
          </button>
          <button
            className="icon-button window-control close-control"
            title="关闭"
            onClick={() =>
              void flushDraft().then((saved) => {
                if (saved) return desktopApi()?.window_action("close");
              })
            }
          >
            <X size={15} />
          </button>
        </div>
      </header>

      <div className="workspace">
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.aside
              className="sidebar"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 258, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 340, damping: 38 }}
            >
              <div className="sidebar-top">
                <button
                  className="library-selector"
                  onClick={(event) => openContextMenu(event, "library", "")}
                  title="资料库菜单"
                  aria-haspopup="menu"
                  aria-expanded={contextMenu?.kind === "library"}
                >
                  <div className="library-icon">
                    <BookOpen size={16} />
                  </div>
                  <div className="library-copy">
                    <span className="muted-label">当前资料库</span>
                    <strong>{state.project?.name ?? "选择资料库"}</strong>
                  </div>
                  <ChevronDown size={15} className="quiet-icon" />
                </button>
                <button
                  className="search-trigger"
                  onClick={() => {
                    setPaletteOpen(true);
                    setPaletteQuery("");
                  }}
                >
                  <Search size={15} />
                  <span className="sidebar-action-label">搜索词条</span>
                  <kbd>
                    <Command size={11} /> K
                  </kbd>
                </button>
                <div className="library-actions">
                  <button
                    className="subtle-action"
                    onClick={() => void openProject()}
                  >
                    <FolderOpen size={14} />
                    <span className="sidebar-action-label">打开资料库</span>
                  </button>
                  <button
                    className="subtle-action"
                    onClick={() => setCreateOpen(true)}
                  >
                    <FilePlus2 size={14} />
                    <span className="sidebar-action-label">新建</span>
                  </button>
                  <button
                    className="subtle-action workspace-settings-action"
                    onClick={() => {
                      if (!state.project) {
                        promptForProject();
                        return;
                      }
                      setSettingsTypeId("");
                      setSettingsTab("library");
                      void navigateTo("settings");
                    }}
                  >
                    <Settings2 size={14} />
                    <span className="sidebar-action-label">设置</span>
                  </button>
                </div>
                <nav className="workspace-nav" aria-label="工作区">
                  <button
                    className={activeView === "entries" ? "active" : ""}
                    onClick={() => void navigateTo("entries")}
                  >
                    <BookOpen size={15} />
                    <span className="sidebar-action-label">词条</span>
                  </button>
                  <button
                    className={activeView === "timeline" ? "active" : ""}
                    aria-disabled={!state.project}
                    onClick={() =>
                      state.project
                        ? void navigateTo("timeline")
                        : promptForProject()
                    }
                  >
                    <CalendarDays size={15} />
                    <span className="sidebar-action-label">时间线</span>
                  </button>
                  <button
                    className={activeView === "graph" ? "active" : ""}
                    aria-disabled={!state.project}
                    onClick={() =>
                      state.project
                        ? void navigateTo("graph")
                        : promptForProject()
                    }
                  >
                    <Network size={15} />
                    <span className="sidebar-action-label">关系图谱</span>
                  </button>
                  <button
                    className={activeView === "favorites" ? "active" : ""}
                    aria-disabled={!state.project}
                    onClick={() =>
                      state.project
                        ? void navigateTo("favorites")
                        : promptForProject()
                    }
                  >
                    <Star size={15} />
                    <span className="sidebar-action-label">收藏夹</span>
                  </button>
                </nav>
              </div>

              <div className="sidebar-section-heading">
                <span>词条分类</span>
                <div className="category-actions">
                  {state.project && (
                    <button
                      className="icon-button compact"
                      title="新建词条类型"
                      disabled={!state.writable}
                      onClick={() => void createType()}
                    >
                      <Plus size={15} />
                    </button>
                  )}
                  <button
                    className="icon-button compact"
                    title="显示全部词条"
                    onClick={() => {
                      setActiveTypeId("");
                      setOpenTypeIds(
                        Object.fromEntries(
                          state.types.map((type) => [type.id, true]),
                        ),
                      );
                    }}
                  >
                    <ChevronsUpDown size={14} />
                  </button>
                </div>
              </div>
              <ElasticScroll className="type-list">
                <LayoutGroup id="entity-navigation">
                  {state.types.map((type) => {
                    const entries = state.entities.filter(
                      (entity) => entity.type_id === type.id,
                    );
                    return (
                      <section className="type-section" key={type.id}>
                        <div
                          className={`type-heading ${activeTypeId === type.id ? "active-type" : ""}`}
                        >
                          <button
                            aria-expanded={openTypeIds[type.id] !== false}
                            onClick={() => {
                              setActiveTypeId(type.id);
                              setOpenTypeIds((current) => ({
                                ...current,
                                [type.id]: current[type.id] === false,
                              }));
                            }}
                            onContextMenu={(event) =>
                              openContextMenu(event, "type", type.id)
                            }
                          >
                            <TypeIcon type={type} size={14} />
                            <span className="sidebar-action-label">{type.name}</span>
                            <span className="type-count">
                              {
                                state.entities.filter(
                                  (entity) => entity.type_id === type.id,
                                ).length
                              }
                            </span>
                            <ChevronRight
                              className="category-chevron"
                              size={12}
                            />
                          </button>
                          <button
                            className="add-type-entry"
                            disabled={!state.writable}
                            title={`新建${type.name}`}
                            onClick={() => void createEntity(type)}
                          >
                            <Plus size={14} />
                          </button>
                          <button
                            className="type-more-button"
                            title={`${type.name}选项`}
                            onClick={(event) =>
                              openContextMenu(event, "type", type.id)
                            }
                          >
                            <Ellipsis size={15} />
                          </button>
                        </div>
                        <AnimatePresence initial={false}>
                          {openTypeIds[type.id] !== false &&
                            entries.length > 0 && (
                              <motion.div
                                className="entry-list"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{
                                  type: "spring",
                                  stiffness: 360,
                                  damping: 35,
                                }}
                              >
                                {entries.map((entity) => (
                                  <button
                                    key={entity.id}
                                    className={`entry-nav ${selectedId === entity.id ? "selected" : ""}`}
                                    onClick={() => void selectEntity(entity)}
                                    onContextMenu={(event) =>
                                      openContextMenu(
                                        event,
                                        "entity",
                                        entity.id,
                                      )
                                    }
                                  >
                                    {selectedId === entity.id && (
                                      <motion.span
                                        className="entry-active-bg"
                                        layoutId="entry-active-bg"
                                        transition={{
                                          type: "spring",
                                          stiffness: 480,
                                          damping: 38,
                                        }}
                                      />
                                    )}
                                    {selectedId === entity.id && (
                                      <motion.span
                                        className="entry-active-bar"
                                        layoutId="entry-active-bar"
                                        transition={{
                                          type: "spring",
                                          stiffness: 480,
                                          damping: 38,
                                        }}
                                      />
                                    )}
                                    <span
                                      className="entity-dot"
                                      style={{ background: entity.color }}
                                    />
                                    <span className="entry-name">
                                      {entity.name}
                                    </span>
                                    <span
                                      className="entry-more-button"
                                      title={`${entity.name}选项`}
                                      onClick={(event) =>
                                        openContextMenu(
                                          event,
                                          "entity",
                                          entity.id,
                                        )
                                      }
                                    >
                                      <Ellipsis size={14} />
                                    </span>
                                  </button>
                                ))}
                              </motion.div>
                            )}
                        </AnimatePresence>
                      </section>
                    );
                  })}
                </LayoutGroup>
                {!state.types.length && (
                  <div className="sidebar-empty">
                    打开或创建资料库以浏览词条
                  </div>
                )}
              </ElasticScroll>

              <div className="sidebar-bottom">
                <div className="library-count">
                  <span className="status-square" />
                  {state.entities.length} 个词条
                  <span className="bottom-separator">·</span>本地数据库
                </div>
                <div className="profile-row">
                  <div className="profile-avatar">
                    {state.project?.author?.slice(0, 1) || "A"}
                  </div>
                  <div className="profile-copy">
                    <strong>{state.project?.author || "Aethercod"}</strong>
                    <span>
                      {state.project ? state.project.era_name : "个人工作区"}
                    </span>
                  </div>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <main className="main-panel">
          <div className="toolbar">
            <div className="breadcrumb">
              <button
                className="icon-button"
                title={sidebarOpen ? "收起侧栏" : "展开侧栏"}
                onClick={() => setSidebarOpen((open) => !open)}
              >
                {sidebarOpen ? (
                  <ChevronLeft size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
              </button>
              <span className="crumb-muted">
                {activeView === "timeline"
                  ? "时间线"
                  : activeView === "graph"
                    ? "关系图谱"
                    : activeView === "favorites"
                      ? "收藏夹"
                    : activeView === "settings"
                      ? "资料库设置"
                      : (draft?.type?.name ?? "典籍")}
              </span>
              {activeView === "entries" && draft && (
                <>
                  <ChevronRight size={13} className="quiet-icon" />
                  <span className="crumb-current">{draft.name}</span>
                </>
              )}
            </div>
            <div className="toolbar-right">
              {activeView === "entries" &&
                state.project &&
                draft &&
                state.writable && (
                  <button
                    className="icon-button"
                    title="删除词条"
                    onClick={() => void deleteEntity()}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              {activeView === "entries" && draft && (
                <button
                  className="icon-button"
                  title="查看全库时间线"
                  onClick={() => void navigateTo("timeline")}
                >
                  <CalendarDays size={15} />
                </button>
              )}
              {activeView === "entries" && draft && (
                <motion.button
                  className={`favorite-toggle ${draft.is_favorite ? "active" : ""}`}
                  title={draft.is_favorite ? "取消收藏（Ctrl+D）" : "加入收藏（Ctrl+D）"}
                  aria-label={draft.is_favorite ? "取消收藏" : "加入收藏"}
                  aria-pressed={Boolean(draft.is_favorite)}
                  disabled={!state.writable}
                  whileHover={motionEnabled ? { scale: 1.08 } : undefined}
                  whileTap={motionEnabled ? { scale: 0.9 } : undefined}
                  onClick={toggleFavorite}
                >
                  <Star size={16} fill={draft.is_favorite ? "currentColor" : "none"} />
                </motion.button>
              )}
              {activeView === "entries" && draft && (
                <button
                  className={`toolbar-text-action ${compactWindow ? "compact" : ""}`}
                  title="查看当前词条及其直接关联图谱"
                  onClick={() => void showRelatedGraph()}
                >
                  <Network size={14} />
                  {!compactWindow && <span>关联图谱</span>}
                </button>
              )}
              {activeView === "entries" && (
                <button
                  className="icon-button"
                  title={inspectorOpen ? "收起检视栏" : "展开检视栏"}
                  onClick={() => setInspectorOpen((open) => !open)}
                >
                  {inspectorOpen ? (
                    <PanelRightClose size={16} />
                  ) : (
                    <PanelRightOpen size={16} />
                  )}
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="error-banner">
              <CircleHelp size={15} />
              <span>{error}</span>
              <button title="关闭提示" onClick={() => setError("")}>
                <X size={14} />
              </button>
            </div>
          )}

          {activeView === "settings" && state.project ? (
            <SettingsView
              key={`${state.project.path}-${settingsTab}-${settingsTypeId}`}
              state={state}
              initialTab={settingsTab}
              initialTypeId={settingsTypeId}
              onProjectUpdated={syncState}
              onChanged={refreshProject}
              onError={reportError}
              particlesEnabled={particlesEnabled}
              transitionsEnabled={transitionsEnabled}
              onParticlesChange={onParticlesChange}
              onTransitionsChange={onTransitionsChange}
            />
          ) : activeView === "timeline" && state.project ? (
            <TimelineView
              events={globalTimeline}
              types={state.types}
              era={state.project.era_name}
              onSelect={selectById}
              onRelatedGraph={(entityId) => {
                setGraphFilterIds([entityId]);
                void navigateTo("graph");
              }}
            />
          ) : activeView === "graph" && state.project ? (
            <GraphView
              graph={graph}
              types={state.types}
              entities={state.entities}
              selectedIds={graphFilterIds}
              onFilterChange={setGraphFilterIds}
              motionEnabled={motionEnabled}
              writable={state.writable}
              onSelect={selectById}
              onDelete={(id, name) => void deleteGraphNode(id, name)}
              onError={reportError}
            />
          ) : activeView === "favorites" && state.project ? (
            <ElasticScroll className="favorites-page-scroll">
              <section className="favorites-page">
                <header className="view-header">
                  <div>
                    <span className="section-kicker">已收藏的设定</span>
                    <h1>收藏夹</h1>
                  </div>
                  <span className="heading-count">
                    {state.entities.filter((entity) => entity.is_favorite).length}
                  </span>
                </header>
                <div className="favorites-list">
                  {state.entities.filter((entity) => entity.is_favorite).map((entity) => (
                    <button
                      className="favorite-row"
                      key={entity.id}
                      onClick={() => void selectEntity(entity)}
                    >
                      <span className="entity-dot" style={{ background: entity.color }} />
                      <span className="favorite-row-copy">
                        <strong>{entity.name}</strong>
                        <small>{entity.summary || typeById(entity.type_id)?.name}</small>
                      </span>
                      <Star size={15} fill="currentColor" />
                      <ChevronRight size={14} />
                    </button>
                  ))}
                  {!state.entities.some((entity) => entity.is_favorite) && (
                    <div className="empty-view">
                      <Star size={22} />
                      <strong>收藏夹为空</strong>
                      <span>在词条详情页点亮星标后，词条会列在这里。</span>
                    </div>
                  )}
                </div>
              </section>
            </ElasticScroll>
          ) : !state.project ? (
            <section className="welcome-state">
              <div className="welcome-glyph">
                <Sparkles size={25} />
              </div>
              <h1>打开一卷世界</h1>
              <p>从本地资料库继续构建你的世界观。</p>
              <div className="welcome-actions">
                <button
                  className="primary-button"
                  onClick={() => void openProject()}
                >
                  <FolderOpen size={16} />
                  打开资料库
                </button>
                <button
                  className="secondary-button"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus size={16} />
                  创建资料库
                </button>
              </div>
            </section>
          ) : !draft ? (
            <section className="welcome-state compact-welcome">
              <div className="welcome-glyph">
                <BookOpen size={23} />
              </div>
              <h1>选择一个词条</h1>
              <p>从左侧分类中打开一条设定，或创建新词条。</p>
            </section>
          ) : (
            <ElasticScroll className="document-scroll">
              <AnimatePresence mode="wait" initial={false}>
                <motion.article
                  key={draft.id}
                  className="document"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                >
                  <div className="document-glow" />
                  <motion.div
                    key={state.writable ? "edit" : "read"}
                    className="document-content"
                    initial={motionEnabled ? { opacity: 0.18, y: 4 } : false}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.24, ease: "easeOut" }}
                  >
                    <div className="document-eyebrow">
                      <span
                        className="type-badge"
                        style={{
                          color: draft.color,
                          background: `${draft.color}19`,
                          borderColor: `${draft.color}42`,
                        }}
                      >
                        <TypeIcon
                          type={
                            draft.type ?? {
                              id: "",
                              name: "",
                              icon: "",
                              is_builtin: true,
                            }
                          }
                          size={13}
                        />
                        {draft.type?.name}
                      </span>
                      <span className="eyebrow-dot">·</span>
                      {categoryEditing && state.writable ? (
                        <input
                          className="category-input"
                          autoFocus
                          aria-label="词条分类"
                          value={categoryDraft}
                          placeholder="添加分类"
                          onChange={(event) =>
                            setCategoryDraft(event.target.value)
                          }
                          onBlur={() => {
                            setCategoryEditing(false);
                            const tags = categoryDraft
                              .split(/[，,]/)
                              .map((item) => item.trim())
                              .filter(Boolean);
                            if (tags.join("\0") !== draft.tags.join("\0"))
                              updateDraft((current) => ({ ...current, tags }));
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter")
                              event.currentTarget.blur();
                            if (event.key === "Escape") {
                              setCategoryDraft(draft.tags.join("，"));
                              event.currentTarget.blur();
                            }
                          }}
                        />
                      ) : (
                        <button
                          className={`category-label ${draft.tags.length ? "" : "empty"}`}
                          title={state.writable ? "编辑分类" : "词条分类"}
                          onClick={() => {
                            if (!state.writable) return;
                            setCategoryDraft(draft.tags.join("，"));
                            setCategoryEditing(true);
                          }}
                        >
                          {draft.tags.join(" · ") ||
                            (state.writable ? "+ 添加分类" : "尚未设置分类")}
                        </button>
                      )}
                    </div>
                    <EditableText
                      key={`${draft.id}-name`}
                      kind="title"
                      value={draft.name}
                      placeholder="词条名称"
                      disabled={!state.writable}
                      onChange={(value) =>
                        updateDraft((current) => ({ ...current, name: value }))
                      }
                    />
                    <EditableText
                      key={`${draft.id}-summary`}
                      kind="summary"
                      value={draft.summary}
                      placeholder="为这个词条写一段简短摘要"
                      disabled={!state.writable}
                      onChange={(value) =>
                        updateDraft((current) => ({
                          ...current,
                          summary: value,
                        }))
                      }
                    />

                    <div className="doc-divider" />

                    {!properties?.aliasesInGrid && (
                      <label className="metadata-line">
                        <span>别名</span>
                        <AliasInput aliases={draft.aliases} disabled={!state.writable} onChange={updateAliases} />
                      </label>
                    )}
                    {properties && (properties.aliasesInGrid || properties.fields.length > 0) && (
                      <section className="document-section properties-section">
                        <div className="section-heading">
                          <div>
                            <span className="section-kicker">结构化资料</span>
                            <h2>属性</h2>
                          </div>
                          <button
                            className="icon-button compact"
                            title={propertiesOpen ? "折叠属性" : "展开属性"}
                            onClick={() => setPropertiesOpen((open) => !open)}
                          >
                            <ChevronDown size={15} />
                          </button>
                        </div>
                        <AnimatePresence initial={false}>
                          {propertiesOpen && (
                            <motion.div
                              className="property-grid"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{
                                type: "spring",
                                stiffness: 360,
                                damping: 36,
                              }}
                            >
                              {properties.aliasesInGrid && (
                                <label className="property-cell">
                                  <span>别名</span>
                                  <AliasInput aliases={draft.aliases} disabled={!state.writable} onChange={updateAliases} />
                                </label>
                              )}
                              {properties.fields.map(renderProperty)}
                              {properties.additional.length > 0 && (
                                <details className="additional-properties">
                                  <summary>其他属性</summary>
                                  <div className="property-grid">
                                    {properties.additional.map(renderProperty)}
                                  </div>
                                </details>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </section>
                    )}

                    <section className="document-section prose-section">
                      <div className="section-heading">
                        <div>
                          <span className="section-kicker">世界设定</span>
                          <h2>正文</h2>
                        </div>
                        <span className="markdown-label">MARKDOWN</span>
                      </div>
                      <EditableText
                        key={`${draft.id}-notes`}
                        kind="notes"
                        value={draft.notes}
                        placeholder="在这里书写这个词条的故事…… 支持 Markdown 与 [[词条引用]]。"
                        disabled={!state.writable}
                        onChange={(value) =>
                          updateDraft((current) => ({
                            ...current,
                            notes: value,
                          }))
                        }
                        suggestions={state.entities}
                        onResolve={async (value) => {
                          const target =
                            await desktopApi()?.resolve_entity(value);
                          if (target) await selectEntity(target);
                        }}
                      />
                    </section>

                    <div className="lower-grid">
                      <section className="document-section relation-section">
                        <div className="section-heading">
                          <div>
                            <span className="section-kicker">相互连接</span>
                            <h2>
                              关联词条{" "}
                              <span className="heading-count">
                                {draft.relations?.length ?? 0}
                              </span>
                            </h2>
                          </div>
                          <button
                            className="icon-button compact"
                            title="添加关联"
                            disabled={!state.writable}
                            onClick={() => setShowRelationForm((open) => !open)}
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                        <div className="relation-pills">
                          {draft.relations?.map((relation) => {
                            const target = state.entities.find(
                              (item) => item.id === relation.other_id,
                            );
                            const targetType = target
                              ? typeById(target.type_id)
                              : undefined;
                            return (
                              <motion.button
                                key={relation.id}
                                className="relation-pill"
                                whileHover={{ y: -1 }}
                                onClick={() => {
                                  if (target) void selectEntity(target);
                                }}
                              >
                                <span
                                  className="entity-dot"
                                  style={{
                                    background: target?.color ?? "#7C3AED",
                                  }}
                                />
                                <span>{relation.other_name}</span>
                                <span className="relation-label">
                                  {relation.display_label}
                                </span>
                                <span className="relation-preview">
                                  <strong>{relation.other_name}</strong>
                                  <small>
                                    {target?.summary ||
                                      targetType?.name ||
                                      "词条"}
                                  </small>
                                </span>
                                {state.writable && (
                                  <span
                                    className="pill-remove"
                                    role="button"
                                    title="删除关联"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void removeRelation(relation.id);
                                    }}
                                  >
                                    <X size={12} />
                                  </span>
                                )}
                              </motion.button>
                            );
                          })}
                          {!draft.relations?.length && (
                            <span className="empty-inline">尚无关联</span>
                          )}
                        </div>
                        <AnimatePresence initial={false}>
                          {showRelationForm && state.writable && (
                            <motion.form
                              className="relation-form"
                              onSubmit={(event) => void addRelation(event)}
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                            >
                              <Dropdown
                                label="关联词条"
                                placeholder="选择关联词条"
                                value={relationValues.target_id}
                                options={state.entities
                                  .filter((entity) => entity.id !== draft.id)
                                  .map((entity) => ({
                                    value: entity.id,
                                    label: entity.name,
                                  }))}
                                onChange={(target_id) =>
                                  setRelationValues((value) => ({
                                    ...value,
                                    target_id,
                                  }))
                                }
                                disabled={!state.writable}
                              />
                              <div className="relation-form-row">
                                <input
                                  value={relationValues.label}
                                  onChange={(event) =>
                                    setRelationValues((value) => ({
                                      ...value,
                                      label: event.target.value,
                                    }))
                                  }
                                  placeholder="关系名称"
                                  required
                                  disabled={!state.writable}
                                />
                                <input
                                  value={relationValues.reverse_label}
                                  onChange={(event) =>
                                    setRelationValues((value) => ({
                                      ...value,
                                      reverse_label: event.target.value,
                                    }))
                                  }
                                  placeholder="反向名称"
                                  disabled={!state.writable}
                                />
                              </div>
                              <button className="small-submit" type="submit">
                                保存关联
                              </button>
                            </motion.form>
                          )}
                        </AnimatePresence>
                      </section>

                      <section className="document-section timeline-section">
                        <div className="section-heading">
                          <div>
                            <span className="section-kicker">
                              纪年法 · {state.project.era_name}
                            </span>
                            <h2>
                              时间线{" "}
                              <span className="heading-count">
                                {draft.dates.length}
                              </span>
                            </h2>
                          </div>
                        </div>
                        <div className="timeline-list">
                          {draft.dates.map((date, index) => (
                            <div className="timeline-item timeline-editor-item" key={date.id ?? index}>
                              <span className="timeline-node" />
                              <div className="timeline-date-edit-grid">
                                <input
                                  aria-label="事件名称"
                                  value={date.label ?? ""}
                                  placeholder="事件名称"
                                  disabled={!state.writable}
                                  onChange={(event) =>
                                    updateDraft((current) => ({
                                      ...current,
                                      dates: current.dates.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? { ...item, label: event.target.value }
                                          : item,
                                      ),
                                    }))
                                  }
                                />
                                <DatePrecisionEditor
                                  value={date}
                                  disabled={!state.writable}
                                  onIssue={showIssueToast}
                                  onChange={(value) =>
                                    updateDraft((current) => ({
                                      ...current,
                                      dates: current.dates.map((item, itemIndex) =>
                                        itemIndex === index ? { ...item, ...value } : item,
                                      ),
                                    }))
                                  }
                                />
                                {state.writable && (
                                  <button
                                    className="icon-button compact"
                                    title="删除时间节点"
                                    onClick={() =>
                                      updateDraft((current) => ({
                                        ...current,
                                        dates: current.dates.filter(
                                          (_, itemIndex) => itemIndex !== index,
                                        ),
                                      }))
                                    }
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                                <textarea
                                  className="timeline-description-input"
                                  aria-label="事件具体说明"
                                  value={date.description ?? ""}
                                  placeholder="事件具体说明"
                                  rows={2}
                                  disabled={!state.writable}
                                  onChange={(event) =>
                                    updateDraft((current) => ({
                                      ...current,
                                      dates: current.dates.map((item, itemIndex) =>
                                        itemIndex === index
                                          ? { ...item, description: event.target.value }
                                          : item,
                                      ),
                                    }))
                                  }
                                />
                              </div>
                            </div>
                          ))}
                          {!draft.dates.length && (
                            <span className="empty-inline">暂无纪年节点</span>
                          )}
                        </div>
                        {state.writable && (
                          <div className="date-entry">
                            <input
                              value={newDate.label}
                              onChange={(event) =>
                                setNewDate((value) => ({
                                  ...value,
                                  label: event.target.value,
                                }))
                              }
                              placeholder="节点名称"
                            />
                            <DatePrecisionEditor
                              value={{
                                year: newDate.year ? Number(newDate.year) : null,
                                date_value: newDate.date_value,
                                precision: newDate.precision,
                              }}
                              disabled={!state.writable}
                              onIssue={showIssueToast}
                              onChange={(value) =>
                                setNewDate((current) => ({
                                  ...current,
                                  year: value.year == null ? "" : String(value.year),
                                  date_value: value.date_value ?? null,
                                  precision: value.precision ?? "year",
                                }))
                              }
                            />
                            <textarea
                              className="new-date-description"
                              aria-label="事件具体说明"
                              value={newDate.description}
                              onChange={(event) =>
                                setNewDate((value) => ({
                                  ...value,
                                  description: event.target.value,
                                }))
                              }
                              placeholder="事件具体说明"
                              rows={2}
                            />
                            <button
                              className="icon-button compact"
                              title="添加时间节点"
                              disabled={!state.writable}
                              onClick={addDate}
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        )}
                      </section>
                    </div>

                    <footer className="document-footer">
                      <span>
                        UUID <code>{formatUuid(draft.id)}</code>
                      </span>
                      <span>创建于 {formatDate(draft.created_at)}</span>
                      <span>更新于 {formatDate(draft.updated_at)}</span>
                    </footer>
                  </motion.div>
                </motion.article>
              </AnimatePresence>
            </ElasticScroll>
          )}
        </main>

        <AnimatePresence initial={false}>
          {inspectorOpen &&
            activeView === "entries" &&
            state.project &&
            draft && (
              <motion.aside
                className="inspector"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 254, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 340, damping: 38 }}
              >
                <div className="inspector-header">
                  <span>检视器</span>
                  <button
                    className="icon-button compact"
                    title="关闭检视栏"
                    onClick={() => setInspectorOpen(false)}
                  >
                    <X size={14} />
                  </button>
                </div>
                <section className="inspector-section">
                  <div className="inspector-heading">
                    <Link2 size={14} />
                    <span>反向引用</span>
                    <span className="count-badge">
                      {draft.backlinks?.length ?? 0}
                    </span>
                  </div>
                  <div className="backlink-list">
                    {draft.backlinks?.map((item) => (
                      <button
                        className="backlink-row"
                        key={item.id}
                        onClick={() => {
                          const entity = state.entities.find(
                            (value) => value.id === item.id,
                          );
                          if (entity) void selectEntity(entity);
                        }}
                      >
                        <span
                          className="entity-dot"
                          style={{ background: item.color }}
                        />
                        {item.name}
                        <ChevronRight size={13} />
                      </button>
                    ))}
                    {!draft.backlinks?.length && (
                      <p className="inspector-empty">没有词条引用此处</p>
                    )}
                  </div>
                </section>
                <section className="inspector-section history-section">
                  <button
                    className="inspector-heading history-heading"
                    aria-expanded={historyOpen}
                    onClick={() => setHistoryOpen((open) => !open)}
                  >
                    <History size={14} />
                    <span>编辑历史</span>
                    <span className="count-badge">{history.length}</span>
                    <ChevronDown size={13} />
                  </button>
                  <AnimatePresence initial={false}>
                    {historyOpen && (
                      <motion.div
                        className="history-list"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 340, damping: 34 }}
                      >
                        {history.map((entry) => (
                          <button
                            className="history-entry"
                            key={entry.id}
                            disabled={!state.writable}
                            title={
                              state.writable
                                ? `回退到版本 ${entry.version}`
                                : "只读模式下无法回退历史版本"
                            }
                            onClick={() => void restoreVersion(entry.version)}
                          >
                            <span className="history-entry-top">
                              <strong>版本 {entry.version}</strong>
                              <time>{formatTimestamp(entry.changed_at)}</time>
                            </span>
                            <span className="history-description">
                              {entry.description || entry.change_type}
                            </span>
                          </button>
                        ))}
                        {!history.length && (
                          <p className="inspector-empty">暂无编辑记录</p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
                <section className="inspector-section">
                  <div className="inspector-heading">
                    <CalendarDays size={14} />
                    <span>纪年节点</span>
                    <span className="count-badge">{timeline.length}</span>
                  </div>
                  {timeline.slice(0, 6).map((event) => (
                    <div className="inspector-date" key={event.id}>
                      <span>
                        {formatWorldDate(event, state.project?.era_name ?? "")}
                      </span>
                      <strong>{event.label || event.date_kind}</strong>
                    </div>
                  ))}
                  {!timeline.length && (
                    <p className="inspector-empty">尚无时间记录</p>
                  )}
                </section>
                <section className="inspector-section entity-info">
                  <div className="inspector-heading">
                    <Sparkles size={14} />
                    <span>词条信息</span>
                  </div>
                  <div className="info-row">
                    <span>类型</span>
                    <span>{draft.type?.name}</span>
                  </div>
                  <div className="info-row">
                    <span>颜色</span>
                    <ColorPicker
                      value={draft.color}
                      disabled={!state.writable}
                      onChange={(color) =>
                        updateDraft((current) => ({ ...current, color }))
                      }
                    />
                  </div>
                  <div className="info-row">
                    <span>属性数</span>
                    <span>{Object.keys(draft.custom_fields).length}</span>
                  </div>
                  <div className="info-row">
                    <span>关联数</span>
                    <span>{draft.relations?.length ?? 0}</span>
                  </div>
                </section>
                <div className="inspector-bottom">
                  <span className="inspector-status-dot" />
                  本地 SQLite 资料库
                </div>
              </motion.aside>
            )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {contextMenu && (
          <motion.div
            className="context-menu glass-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            initial={{ opacity: 0, scale: 0.96, y: 3 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 2 }}
            transition={{ duration: 0.14 }}
            onClick={(event) => {
              event.stopPropagation();
              if ((event.target as Element).closest("button"))
                setContextMenu(null);
            }}
            onContextMenu={(event) => event.preventDefault()}
          >
            {contextMenu.kind === "library" ? (
              <>
                <button onClick={() => void openProject()}>
                  <FolderOpen size={14} />
                  打开资料库
                </button>
                <button onClick={() => setCreateOpen(true)}>
                  <FilePlus2 size={14} />
                  新建资料库
                </button>
                {state.project && (
                  <button
                    onClick={() => {
                      setSettingsTab("library");
                      setSettingsTypeId("");
                      void navigateTo("settings");
                    }}
                  >
                    <Settings2 size={14} />
                    资料库设置
                  </button>
                )}
                {state.project && (
                  <>
                    <button onClick={() => void exportJson()}>
                      <Save size={14} />
                      导出为 JSON
                    </button>
                    <button disabled={!state.writable} onClick={() => void importJson()}>
                      <FolderOpen size={14} />
                      导入 JSON
                    </button>
                  </>
                )}
              </>
            ) : contextMenu.kind === "type" ? (
              (() => {
                const type = state.types.find(
                  (item) => item.id === contextMenu.id,
                );
                if (!type) return null;
                return (
                  <>
                    <button
                      disabled={!state.writable}
                      onClick={() => void createEntity(type)}
                    >
                      <Plus size={14} />
                      新建词条
                    </button>
                    <button
                      onClick={() => {
                        setSettingsTab("types");
                        setSettingsTypeId(type.id);
                        setContextMenu(null);
                        void navigateTo("settings");
                      }}
                    >
                      <Settings2 size={14} />
                      管理类型与字段
                    </button>
                    <button
                      disabled={!state.writable || type.is_builtin}
                      onClick={() => void renameType(type.id)}
                    >
                      重命名类型
                    </button>
                    <button
                      className="danger-menu-item"
                      disabled={!state.writable || type.is_builtin}
                      onClick={() => void deleteType(type.id)}
                    >
                      <Trash2 size={14} />
                      删除类型
                    </button>
                  </>
                );
              })()
            ) : (
              (() => {
                const entity = state.entities.find(
                  (item) => item.id === contextMenu.id,
                );
                if (!entity) return null;
                return (
                  <>
                    <button onClick={() => void selectEntity(entity)}>
                      <BookOpen size={14} />
                      打开词条
                    </button>
                    <button
                      disabled={!state.writable}
                      onClick={() => void renameEntity(entity.id)}
                    >
                      <Pencil size={14} />
                      重命名词条
                    </button>
                    <button
                      className="danger-menu-item"
                      disabled={!state.writable}
                      onClick={() => void removeEntity(entity.id, entity.name)}
                    >
                      <Trash2 size={14} />
                      删除词条
                    </button>
                  </>
                );
              })()
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {paletteOpen && (
          <motion.div
            className="modal-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={() => setPaletteOpen(false)}
          >
            <motion.div
              className="command-palette"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 4 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="palette-search">
                <Search size={18} />
                <input
                  ref={paletteInput}
                  value={paletteQuery}
                  onChange={(event) => {
                    setPaletteQuery(event.target.value);
                    setPaletteIndex(0);
                    setPaletteNoMatch(false);
                  }}
                  onKeyDown={onPaletteKeyDown}
                  placeholder="搜索词条或跳转到…"
                />
                <kbd>ESC</kbd>
              </div>
              <div className="palette-label">
                词条 <span>{paletteItems.length}</span>
              </div>
              <div className="palette-results">
                {paletteItems.slice(0, 12).map((entity, index) => {
                  const type = typeById(entity.type_id);
                  return (
                    <button
                      key={entity.id}
                      className={`palette-result ${paletteIndex === index ? "highlighted" : ""}`}
                      onMouseEnter={() => setPaletteIndex(index)}
                      onClick={() => {
                        void selectEntity(entity);
                        setPaletteOpen(false);
                      }}
                    >
                      <span
                        className="palette-type-icon"
                        style={{ color: entity.color }}
                      >
                        {type && <TypeIcon type={type} size={16} />}
                      </span>
                      <span className="palette-result-copy">
                        <strong>{entity.name}</strong>
                        <small>{entity.summary || type?.name}</small>
                      </span>
                      <span className="result-category">{type?.name}</span>
                    </button>
                  );
                })}
                {!paletteItems.length && (
                  <div
                    className={`palette-empty ${paletteNoMatch ? "palette-no-match" : ""}`}
                    role={paletteNoMatch ? "alert" : undefined}
                  >
                    {paletteNoMatch ? "未找到匹配内容" : "没有匹配的词条"}
                  </div>
                )}
              </div>
              <div className="palette-footer">
                <span>
                  <kbd>↑</kbd>
                  <kbd>↓</kbd>选择
                </span>
                <span>
                  <kbd>↵</kbd>打开
                </span>
                <span>
                  <kbd>ESC</kbd>关闭
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {typeCreateOpen && (
          <motion.div
            className="modal-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={() => setTypeCreateOpen(false)}
          >
            <motion.form
              className="create-dialog"
              onSubmit={(event) => void submitCreateType(event)}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="dialog-heading">
                <div>
                  <span className="section-kicker">词条结构</span>
                  <h2>新建词条类型</h2>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  title="关闭"
                  onClick={() => setTypeCreateOpen(false)}
                >
                  <X size={16} />
                </button>
              </div>
              <label>
                类型名称
                <input
                  autoFocus
                  value={typeCreateValues.name}
                  onChange={(event) =>
                    setTypeCreateValues((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="例如：魔法体系"
                  required
                />
              </label>
              <label className="type-create-icon-field">
                类型图标
                <TypeIconPicker
                  value={typeCreateValues.icon}
                  onChange={(icon) =>
                    setTypeCreateValues((current) => ({ ...current, icon }))
                  }
                />
              </label>
              <div className="dialog-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setTypeCreateOpen(false)}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={typeCreateSubmitting}
                >
                  <Plus size={15} />
                  {typeCreateSubmitting ? "创建中" : "创建类型"}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {createOpen && (
          <motion.div
            className="modal-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={() => setCreateOpen(false)}
          >
            <motion.form
              className="create-dialog"
              onSubmit={(event) => void createProject(event)}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="dialog-heading">
                <div>
                  <span className="section-kicker">本地资料库</span>
                  <h2>创建新世界</h2>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  title="关闭"
                  onClick={() => setCreateOpen(false)}
                >
                  <X size={16} />
                </button>
              </div>
              <label>
                资料库名称
                <input
                  autoFocus
                  value={createValues.name}
                  onChange={(event) =>
                    setCreateValues((value) => ({
                      ...value,
                      name: event.target.value,
                    }))
                  }
                  placeholder="例如：星环纪事"
                  required
                />
              </label>
              <label>
                纪年法名称
                <input
                  value={createValues.era_name}
                  onChange={(event) =>
                    setCreateValues((value) => ({
                      ...value,
                      era_name: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                作者
                <input
                  value={createValues.author}
                  onChange={(event) =>
                    setCreateValues((value) => ({
                      ...value,
                      author: event.target.value,
                    }))
                  }
                  placeholder="可选"
                />
              </label>
              <label>
                说明
                <textarea
                  value={createValues.description}
                  onChange={(event) =>
                    setCreateValues((value) => ({
                      ...value,
                      description: event.target.value,
                    }))
                  }
                  placeholder="可选"
                  rows={2}
                />
              </label>
              <div className="dialog-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setCreateOpen(false)}
                >
                  取消
                </button>
                <button type="submit" className="primary-button">
                  <Plus size={15} />
                  选择位置并创建
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {statusToast && (
          <motion.div
            key={statusToast.key}
            className={`status-toast glass-menu ${statusToast.kind}`}
            role="status"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {statusToast.kind === "success" ? (
                <motion.path
                  d="m5 12.5 4.5 4.5L19 7"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.34, ease: "easeOut" }}
                />
              ) : (
                <motion.path
                  d="m7 7 10 10M17 7 7 17"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.24, ease: "easeOut" }}
                />
              )}
            </svg>
            <span>{statusToast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AliasInput({
  aliases,
  disabled,
  onChange,
}: {
  aliases: string[];
  disabled: boolean;
  onChange: (aliases: string[]) => void;
}) {
  const [input, setInput] = useState<string | null>(null);
  return (
    <input
      className="inline-input"
      value={input ?? aliases.join("，")}
      placeholder="添加别名"
      disabled={disabled}
      onBlur={() => setInput(null)}
      onChange={(event) => {
        const text = event.target.value;
        setInput(text);
        onChange(text.split(/[，,]/).map((alias) => alias.trim()).filter(Boolean));
      }}
    />
  );
}

type DateParts = {
  year?: number | null;
  date_value?: string | null;
  precision?: string;
};

function readDateParts(value: DateParts | string | null | undefined): DateParts {
  const stored = typeof value === "string" ? value : value?.date_value ?? "";
  const match = stored.match(/^([+-]?\d{1,6})(?:-(\d{2})(?:-(\d{2}))?)?$/);
  const fallbackYear = typeof value === "object" && value ? value.year : null;
  if (!match)
    return {
      year: fallbackYear ?? null,
      date_value: null,
      precision: "year",
    };
  const year = Number(match[1]);
  const month = match[2];
  const day = match[3];
  return {
    year,
    date_value: month ? `${match[1]}-${month}${day ? `-${day}` : ""}` : null,
    precision: day ? "day" : month ? "month" : "year",
  };
}

function dateYearText(year: number) {
  const digits = String(Math.abs(year)).padStart(4, "0");
  return year < 0 ? `-${digits}` : digits;
}

function dateValue(year: number | null, month: number | null, day: number | null) {
  if (year === null) return { year: null, date_value: null, precision: "year" };
  const yearText = dateYearText(year);
  if (month === null) return { year, date_value: null, precision: "year" };
  const monthText = String(month).padStart(2, "0");
  if (day === null)
    return { year, date_value: `${yearText}-${monthText}`, precision: "month" };
  return {
    year,
    date_value: `${yearText}-${monthText}-${String(day).padStart(2, "0")}`,
    precision: "day",
  };
}

function daysInWorldMonth(year: number, month: number) {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function DatePrecisionEditor({
  value,
  disabled,
  onChange,
  onIssue,
}: {
  value: DateParts;
  disabled: boolean;
  onChange: (value: DateParts) => void;
  onIssue: (message: string) => void;
}) {
  const parsed = readDateParts(value);
  const year = parsed.year ?? null;
  const components = parsed.date_value?.match(/^[+-]?\d{1,6}-(\d{2})(?:-(\d{2}))?$/);
  const month = components ? Number(components[1]) : null;
  const day = components?.[2] ? Number(components[2]) : null;
  const days = year !== null && month !== null
    ? daysInWorldMonth(year, month)
    : 31;

  const write = (year: number | null, nextMonth: number | null, nextDay: number | null) =>
    onChange(dateValue(year, nextMonth, nextDay));

  return (
    <div className="world-date-editor" role="group" aria-label="日期精度">
      <input
        aria-label="年份"
        type="number"
        inputMode="numeric"
        min={-999999}
        max={999999}
        value={year ?? ""}
        placeholder="年"
        disabled={disabled}
        onChange={(event) => {
          const raw = event.target.value;
          if (!raw) {
            write(null, null, null);
            return;
          }
          const year = Number(raw);
          if (!Number.isInteger(year) || Math.abs(year) > 999999) {
            onIssue("年份需为 -999999 至 999999 之间的整数");
            return;
          }
          let nextDay = day;
          if (month !== null && day !== null && day > daysInWorldMonth(year, month)) {
            nextDay = null;
            onIssue("该年份的公历日期无效，已清除日字段");
          }
          write(year, month, nextDay);
        }}
      />
      <select
        aria-label="月份"
        value={month ?? ""}
        disabled={disabled}
        onChange={(event) => {
          if (year === null) {
            onIssue("请先填写年份，再选择月份");
            return;
          }
          const nextMonth = event.target.value ? Number(event.target.value) : null;
          let nextDay = nextMonth === month ? day : null;
          if (nextMonth !== null && day !== null && day > daysInWorldMonth(year, nextMonth)) {
            nextDay = null;
            onIssue("该月份没有这一天，已清除日字段");
          }
          write(year, nextMonth, nextDay);
        }}
      >
        <option value="">月</option>
        {Array.from({ length: 12 }, (_, index) => index + 1).map((item) => (
          <option value={item} key={item}>{item} 月</option>
        ))}
      </select>
      <select
        aria-label="日"
        value={day ?? ""}
        disabled={disabled}
        onChange={(event) => {
          if (year === null || month === null) {
            onIssue(year === null ? "请先填写年份，再选择日期" : "请先填写月份，再选择日期");
            return;
          }
          const nextDay = event.target.value ? Number(event.target.value) : null;
          if (nextDay !== null && (nextDay < 1 || nextDay > daysInWorldMonth(year, month))) {
            onIssue("该日期不符合公历大小月或闰年规则");
            return;
          }
          write(year, month, nextDay);
        }}
      >
        <option value="">日</option>
        {Array.from({ length: days }, (_, index) => index + 1).map((item) => (
          <option value={item} key={item}>{item} 日</option>
        ))}
      </select>
    </div>
  );
}

function WorldDateInput({
  value,
  disabled,
  onChange,
  onIssue,
}: {
  value: unknown;
  disabled: boolean;
  onChange: (value: unknown) => void;
  onIssue: (message: string) => void;
}) {
  const parsed = readDateParts(typeof value === "string" ? value : value as DateParts | null);
  return (
    <DatePrecisionEditor
      value={parsed}
      disabled={disabled}
      onIssue={onIssue}
      onChange={(next) =>
        onChange(next.date_value ?? (next.year == null ? "" : dateYearText(next.year)))
      }
    />
  );
}

function PropertyEditor({
  field,
  value,
  disabled,
  entities,
  onIssue,
  allowEmpty = true,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  disabled: boolean;
  entities: EntitySummary[];
  onIssue: (message: string) => void;
  allowEmpty?: boolean;
  onChange: (value: unknown) => void;
}) {
  const textValue = value === null || value === undefined ? "" : String(value);
  let control: React.ReactNode;
  if (["choice", "select"].includes(field.field_type)) {
    control = (
      <Dropdown
        label={field.name}
        placeholder={allowEmpty ? "未设置" : "请选择地点类别"}
        value={textValue}
        onChange={(value) => onChange(value || undefined)}
        disabled={disabled}
        options={[
          ...(allowEmpty ? [{ value: "", label: "未设置" }] : []),
          ...field.options.map((option) => ({ value: option, label: option })),
        ]}
      />
    );
  } else if (field.field_type === "boolean" || field.field_type === "bool") {
    control = (
      <label className="toggle-control">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
        />
        <span>{value ? "是" : "否"}</span>
      </label>
    );
  } else if (field.field_type === "date") {
    control = (
      <WorldDateInput
        value={value}
        disabled={disabled}
        onIssue={onIssue}
        onChange={onChange}
      />
    );
  } else if (
    ["entity_refs", "entity_list", "multi_entity", "multiselect"].includes(
      field.field_type,
    )
  ) {
    const options =
      field.field_type === "multiselect"
        ? field.options.map((option) => ({ label: option, value: option }))
        : entities.map((entity) => ({ label: entity.name, value: entity.id }));
    control = (
      <Dropdown
        multiple
        label={field.name}
        value={Array.isArray(value) ? value.map(String) : []}
        onChange={onChange}
        options={options}
        disabled={disabled}
      />
    );
  } else if (
    ["entity", "entity_ref", "entity_reference"].includes(field.field_type)
  ) {
    control = (
      <Dropdown
        label={field.name}
        value={textValue}
        onChange={(value) => onChange(value || undefined)}
        options={[
          { label: "未设置", value: "" },
          ...entities.map((entity) => ({
            label: entity.name,
            value: entity.id,
          })),
        ]}
        disabled={disabled}
      />
    );
  } else if (field.field_type === "textarea" || field.field_type === "json") {
    control = (
      <textarea
        value={textValue}
        onChange={(event) => onChange(event.target.value)}
        placeholder="未设置"
        disabled={disabled}
        rows={2}
      />
    );
  } else {
    const integer =
      field.field_type === "integer" || field.field_type === "int";
    const numeric =
      integer || field.field_type === "number" || field.field_type === "float";
    control = (
      <input
        type={numeric ? "number" : "text"}
        step={integer ? "1" : "any"}
        value={textValue}
        onChange={(event) =>
          onChange(
            numeric && event.target.value
              ? Number(event.target.value)
              : event.target.value,
          )
        }
        placeholder="未设置"
        disabled={disabled}
      />
    );
  }
  return (
    <label className="property-cell">
      <span>
        {field.name}
        {field.required && <i className="required-mark">*</i>}
      </span>
      {control}
    </label>
  );
}

function EditableText({
  kind,
  value,
  placeholder,
  disabled,
  onChange,
  onResolve,
  suggestions = [],
}: {
  kind: "title" | "summary" | "notes";
  value: string;
  placeholder: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onResolve?: (value: string) => Promise<void>;
  suggestions?: EntitySummary[];
}) {
  const [editing, setEditing] = useState(false);
  const [completion, setCompletion] = useState<{
    start: number;
    cursor: number;
    query: string;
    index: number;
    x: number;
    y: number;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (disabled) setEditing(false);
  }, [disabled]);
  const isMultiline = kind === "notes";
  const editClass =
    kind === "title"
      ? "title-input"
      : kind === "summary"
        ? "summary-input"
        : "notes-editor";
  const Component = kind === "title" ? "h1" : kind === "summary" ? "p" : "div";
  if (kind === "notes" && disabled && !value.trim()) return null;
  const candidates = completion
    ? suggestions
        .filter((entity) =>
          `${entity.name} ${entity.summary}`
            .toLocaleLowerCase()
            .includes(completion.query.toLocaleLowerCase()),
        )
        .slice(0, 7)
    : [];

  const updateCompletion = (
    textarea: HTMLTextAreaElement,
    text: string,
    cursor: number,
  ) => {
    if (kind !== "notes" || disabled) return setCompletion(null);
    const match = text.slice(0, cursor).match(/(\[\[|@)([^\s\[\]]*)$/);
    if (!match) return setCompletion(null);
    const caret = getTextareaCaret(textarea, cursor);
    setCompletion((current) => ({
      start: cursor - match[0].length,
      cursor,
      query: match[2],
      index: current?.query === match[2] ? current.index : 0,
      x: Math.max(8, Math.min(caret.x, window.innerWidth - 250)),
      y: Math.max(8, Math.min(caret.y + 18, window.innerHeight - 238)),
    }));
  };

  const insertCandidate = (candidate: EntitySummary) => {
    if (!completion) return;
    const insertion = `[[${candidate.name}]]`;
    const next =
      value.slice(0, completion.start) +
      insertion +
      value.slice(completion.cursor);
    const nextCursor = completion.start + insertion.length;
    setCompletion(null);
    onChange(next);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  if (editing && !disabled) {
    const common = {
      autoFocus: true,
      className: editClass,
      value,
      placeholder,
      disabled,
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => onChange(event.target.value),
      onBlur: () => setEditing(false),
      onKeyDown: (
        event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => {
        if (
          event.key === "Escape" ||
          (kind !== "notes" && event.key === "Enter")
        ) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      },
    };
    if (isMultiline) {
      const shell = document.querySelector(".app-shell");
      return (
        <>
          <textarea
            {...common}
            ref={textareaRef}
            rows={8}
            onChange={(event) => {
              onChange(event.target.value);
              updateCompletion(
                event.currentTarget,
                event.target.value,
                event.currentTarget.selectionStart,
              );
            }}
            onBlur={() => {
              setCompletion(null);
              setEditing(false);
            }}
            onClick={(event) =>
              updateCompletion(
                event.currentTarget,
                event.currentTarget.value,
                event.currentTarget.selectionStart,
              )
            }
            onKeyUp={(event) => {
              if (!completion || !event.key.startsWith("Arrow"))
                updateCompletion(
                  event.currentTarget,
                  event.currentTarget.value,
                  event.currentTarget.selectionStart,
                );
            }}
            onKeyDown={(event) => {
              if (completion && candidates.length) {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setCompletion((current) =>
                    current
                      ? {
                          ...current,
                          index:
                            (current.index +
                              (event.key === "ArrowDown" ? 1 : -1) +
                              candidates.length) %
                            candidates.length,
                        }
                      : null,
                  );
                  return;
                }
                if (event.key === "Tab" || event.key === "Enter") {
                  event.preventDefault();
                  insertCandidate(candidates[completion.index]);
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setCompletion(null);
                  return;
                }
              }
              if (event.key === "Escape") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
          {shell && completion && candidates.length > 0 &&
            createPortal(
              <motion.div
                className="mention-suggestions glass-menu"
                role="listbox"
                aria-label="词条引用候选"
                style={{ left: completion.x, top: completion.y }}
                initial={{ opacity: 0, scale: 0.97, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: 2 }}
                transition={{ duration: 0.14 }}
                onMouseDown={(event) => event.preventDefault()}
              >
                {candidates.map((candidate, index) => (
                  <button
                    key={candidate.id}
                    type="button"
                    role="option"
                    aria-selected={completion.index === index}
                    onMouseEnter={() =>
                      setCompletion((current) =>
                        current ? { ...current, index } : null,
                      )
                    }
                    onClick={() => insertCandidate(candidate)}
                  >
                    <span className="entity-dot" style={{ background: candidate.color }} />
                    <span>{candidate.name}</span>
                    <small>{candidate.summary}</small>
                  </button>
                ))}
              </motion.div>,
              shell,
            )}
        </>
      );
    }
    return (
      <input {...common} />
    );
  }

  return (
    <Component
      className={`editable-view ${kind}-view`}
      onClick={(event: React.MouseEvent<HTMLElement>) => {
        const clickedLink = (event.target as HTMLElement).closest("a");
        if (!disabled && !clickedLink) setEditing(true);
      }}
    >
      {kind === "notes" && value ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          disallowedElements={["img"]}
          components={{
            a: ({ href, children }) => (
              <a
                href={href}
                onClick={(event) => {
                  event.preventDefault();
                  if (href?.startsWith("#entry:"))
                    void onResolve?.(decodeURIComponent(href.slice(7)));
                }}
              >
                {children}
              </a>
            ),
          }}
        >
          {value.replace(
            /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
            (_, target: string, label: string | undefined) =>
              `[${label || target}](#entry:${encodeURIComponent(target.trim())})`,
          )}
        </ReactMarkdown>
      ) : (
        value || <span className="editable-placeholder">{placeholder}</span>
      )}
    </Component>
  );
}

function getTextareaCaret(textarea: HTMLTextAreaElement, cursor: number) {
  const bounds = textarea.getBoundingClientRect();
  const computed = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  const marker = document.createElement("span");
  const copiedProperties = [
    "boxSizing",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "fontStyle",
    "letterSpacing",
    "lineHeight",
    "textAlign",
    "textIndent",
    "textTransform",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
  ] as const;
  mirror.style.position = "fixed";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.width = `${bounds.width}px`;
  for (const property of copiedProperties)
    mirror.style[property] = computed[property];
  mirror.textContent = textarea.value.slice(0, cursor);
  marker.textContent = "\u200b";
  mirror.append(marker);
  document.body.append(mirror);
  const markerBounds = marker.getBoundingClientRect();
  const caret = {
    x: bounds.left + markerBounds.left - textarea.scrollLeft,
    y: bounds.top + markerBounds.top - textarea.scrollTop,
  };
  mirror.remove();
  return caret;
}

function formatUuid(id: string) {
  return id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
}

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-CN", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
}

function formatTimestamp(value: string) {
  return value.replace("T", " ").replace(/\+00:00$/, " UTC");
}

export default App;
