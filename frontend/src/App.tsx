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
import { glassFade, glassSlide } from "./glassMotion";
import Dropdown from "./Dropdown";
import { formatWorldDate } from "./worldDate";
import GraphView from "./GraphView";
import SettingsView from "./SettingsView";
import TimelineView from "./TimelineView";
import ElasticScroll from "./ElasticScroll";
import { propertyLayout } from "./propertyLayout";
import TypeIconPicker, { getTypeIcon } from "./TypeIconPicker";
import brandMark from "../../src/aethercod/resources/aethercod-mark.svg";
import { displayFieldName, displayFieldValue, displayTypeName, translate, type Language } from "./i18n";

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
  const [language, setLanguage] = useState<Language>(() =>
    localStorage.getItem("aethercod-language") === "en" ? "en" : "zh",
  );
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
          language={language}
          onLanguageChange={(next) => {
            localStorage.setItem("aethercod-language", next);
            setLanguage(next);
          }}
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
  language,
  onLanguageChange,
  onParticlesChange,
  onTransitionsChange,
}: {
  motionEnabled: boolean;
  particlesEnabled: boolean;
  transitionsEnabled: boolean;
  language: Language;
  onLanguageChange: (language: Language) => void;
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
  const [loadingEntry, setLoadingEntry] = useState(false);
  const [draft, setDraft] = useState<Entity | null>(null);
  const [activeTypeId, setActiveTypeId] = useState("");
  const [openTypeIds, setOpenTypeIds] = useState<Record<string, boolean>>({});
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [closing, setClosing] = useState(false);
  const [windowMaximized, setWindowMaximized] = useState(false);
  const windowStateRequest = useRef(0);
  const windowActionPending = useRef(false);
  const titlebarDrag = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const pendingWindowPosition = useRef<{ x: number; y: number } | null>(null);
  const movingWindow = useRef(false);
  const [saving, setSaving] = useState(false);
  const [changingReadOnly, setChangingReadOnly] = useState(false);
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
  const typeCreateSession = useRef(0);
  const typeCreateInFlight = useRef(false);
  const [createValues, setCreateValues] = useState({
    name: "",
    era_name: "",
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
  const [relatedGraphId, setRelatedGraphId] = useState("");
  const graphCenterId = relatedGraphId || (graphFilterIds.length === 1 ? graphFilterIds[0] : "");
  const sidebarSelectedId = activeView === "graph" ? graphCenterId : selectedId;
  const [contextMenu, setContextMenu] = useState<{
    kind: "type" | "entity" | "library";
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [showRelationForm, setShowRelationForm] = useState(false);
  const [relationPreview, setRelationPreview] = useState<{
    entityId: string;
    name: string;
    summary: string;
    left: number;
    bottom: number;
  } | null>(null);
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
  const selectedEntryId = useRef("");
  const entityRequest = useRef(0);
  const modeChange = useRef(false);
  const pendingDrafts = useRef(new Map<string, { entity: Entity; version: number }>());
  const pendingSaves = useRef(
    new Map<string, { promise: Promise<void>; version: number }>(),
  );
  const closeInProgress = useRef(false);
  const settingsDirty = useRef(false);
  const onSettingsDirtyChange = useCallback((value: boolean) => {
    settingsDirty.current = value;
  }, []);
  const paletteInput = useRef<HTMLInputElement>(null);
  const statusToastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    localStorage.setItem("aethercod-theme", theme);
  }, [theme]);

  useEffect(() => {
    const showStartupError = (event: Event) => {
      const error = event as CustomEvent<string>;
      window.dispatchEvent(new CustomEvent("aethercod:show-error", { detail: error.detail }));
    };
    window.addEventListener("aethercod:startup-error", showStartupError);
    if (window.__aethercodStartupError) {
      window.dispatchEvent(new CustomEvent("aethercod:show-error", { detail: window.__aethercodStartupError }));
      delete window.__aethercodStartupError;
    }
    return () => window.removeEventListener("aethercod:startup-error", showStartupError);
  }, []);

  useEffect(
    () => () => window.clearTimeout(statusToastTimer.current),
    [],
  );

  const refreshWindowState = useCallback(async () => {
    const api = desktopApi();
    if (!api || windowActionPending.current) return;
    const request = ++windowStateRequest.current;
    const maximized = await api.window_maximized();
    if (request === windowStateRequest.current) setWindowMaximized(maximized);
  }, []);

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("window-maximized", windowMaximized);
    return () => document.documentElement.classList.remove("window-maximized");
  }, [windowMaximized]);

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

  const closeTypeCreate = useCallback(() => {
    typeCreateSession.current += 1;
    setTypeCreateOpen(false);
  }, []);

  const changeSelection = useCallback((id: string, entity: Entity | null = null) => {
    entityRequest.current += 1;
    selectedEntryId.current = id;
    setSelectedId(id);
    setLoadingEntry(Boolean(id && !entity));
    setDraft(entity);
    setTimeline([]);
    setHistory([]);
    setContextMenu(null);
    setPaletteOpen(false);
    closeTypeCreate();
    setCreateOpen(false);
    setCategoryEditing(false);
    setRelationPreview(null);
    setShowRelationForm(false);
    setRelationValues({ target_id: "", label: "", reverse_label: "" });
    setNewDate({ label: "", year: "", date_value: null, precision: "year", description: "" });
  }, [closeTypeCreate]);

  const syncState = useCallback((next: ProjectState) => {
    setState(next);
    const path = next.project?.path;
    if (path !== projectPath.current || !next.project) {
      projectPath.current = path;
      pendingDrafts.current.clear();
      pendingSaves.current.clear();
      setDirty(false);
      setOpenTypeIds({});
      setActiveTypeId("");
      changeSelection("");
      setGlobalTimeline([]);
      setGraph({ nodes: [], edges: [] });
      setGraphFilterIds([]);
      setRelatedGraphId("");
      setActiveView("entries");
    }
  }, [changeSelection]);

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

  useEffect(() => {
    const showStartupError = (event: Event) => setError((event as CustomEvent<string>).detail);
    window.addEventListener("aethercod:show-error", showStartupError);
    return () => window.removeEventListener("aethercod:show-error", showStartupError);
  }, []);

  const loadEntity = useCallback(async (id: string, reveal = true) => {
    const api = desktopApi();
    if (!api || !projectPath.current || closeInProgress.current) return;
    id = normalizeEntryId(id);
    if (reveal) {
      if (id !== selectedEntryId.current) changeSelection(id, pendingDrafts.current.get(id)?.entity);
      else {
        setContextMenu(null);
        setRelationPreview(null);
      }
      setActiveView("entries");
      setError("");
    } else if (id !== selectedEntryId.current) {
      return;
    }
    const request = ++entityRequest.current;
    const isCurrent = () => request === entityRequest.current && id === selectedEntryId.current;
    try {
      const entity = await api.get_entity(id);
      if (!isCurrent()) return;
      const current = pendingDrafts.current.get(id)?.entity ??
        (entity && normalizeEntryId(entity.id) === id ? entity : null);
      setDraft(current);
      if (current && reveal) {
        setActiveTypeId(current.type_id);
        setOpenTypeIds((types) => ({ ...types, [current.type_id]: true }));
      }
      setLoadingEntry(false);
      if (!current) return;
      const [events, versions] = await Promise.allSettled([
        api.get_timeline(id),
        api.get_history(id),
      ]);
      if (!isCurrent()) return;
      if (events.status === "fulfilled") setTimeline(events.value);
      if (versions.status === "fulfilled") setHistory(versions.value);
    } catch (reason) {
      if (!isCurrent()) return;
      setLoadingEntry(false);
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [changeSelection]);

  const flushDraft = useCallback(async () => {
    const api = desktopApi();
    if (!api || closeInProgress.current) return false;
    while (pendingDrafts.current.size > 0) {
      if (closeInProgress.current) return false;
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
              if (selectedEntryId.current === saved.id) setDraft(saved);
              setDirty(pendingDrafts.current.size > 0);
            }
            if (selectedEntryId.current === saved.id) {
              setError("");
              void loadEntity(saved.id, false);
            }
          })
          .finally(() => {
            if (projectPath.current !== path) return;
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
  }, [loadEntity]);

  const requestClose = useCallback(async (target: "project" | "window") => {
    const api = desktopApi();
    if (!api || closeInProgress.current) return;
    closeInProgress.current = true;
    setClosing(true);
    let windowClosing = false;
    try {
      // Commit controls that stage their value on blur before inspecting the drafts.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      if ((pendingDrafts.current.size > 0 || settingsDirty.current) && (await actionDialog({
        title: translate(language, "是否丢弃修改？"),
        message: target === "project"
          ? translate(language, "当前资料库有未保存的修改。关闭资料库会丢弃这些修改。")
          : translate(language, "当前资料库有未保存的修改。退出程序会丢弃这些修改。"),
        confirmLabel: translate(language, "放弃修改并关闭"),
        danger: true,
      })) === null) return;

      await Promise.allSettled([...pendingSaves.current.values()].map(({ promise }) => promise));
      if (target === "project") {
        syncState(await api.close_project());
      } else {
        await api.window_action("close");
        windowClosing = true;
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (!windowClosing) {
        closeInProgress.current = false;
        setClosing(false);
      }
    }
  }, [actionDialog, language, syncState]);

  useLayoutEffect(() => {
    const closeWindow = () => void requestClose("window");
    window.addEventListener("aethercod:close-request", closeWindow);
    return () => window.removeEventListener("aethercod:close-request", closeWindow);
  }, [requestClose]);

  const showStatusToast = useCallback(
    (message: string, kind: "success" | "error") => {
      window.clearTimeout(statusToastTimer.current);
      setStatusToast({ message: translate(language, message), kind, key: Date.now() });
      statusToastTimer.current = window.setTimeout(() => setStatusToast(null), 3000);
    },
    [language],
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
    const path = projectPath.current;
    const next = await api.get_state();
    if (projectPath.current !== path || next.project?.path !== path) return;
    syncState(next);
    const id = selectedEntryId.current;
    if (id) await loadEntity(id, false);
  }, [loadEntity, syncState]);

  const toggleReadOnly = async () => {
    const api = desktopApi();
    const path = projectPath.current;
    if (!api || !path || modeChange.current) return;
    modeChange.current = true;
    setChangingReadOnly(true);
    try {
      if (!state.read_only && !(await flushDraft())) return;
      if (projectPath.current !== path || closeInProgress.current) return;
      const next = await api.set_read_only(!state.read_only);
      if (projectPath.current !== path || next.project?.path !== path) return;
      setShowRelationForm(false);
      setCategoryEditing(false);
      setState((current) => ({ ...current, writable: next.writable, read_only: next.read_only }));
      showStatusToast(next.read_only ? "已切换至只读模式" : "已切换至编辑模式", "success");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      modeChange.current = false;
      setChangingReadOnly(false);
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

  const openRelatedGraph = (id: string) => {
    setRelatedGraphId(normalizeEntryId(id));
    setGraphFilterIds([]);
    if (activeView === "graph") setContextMenu(null);
    else void navigateTo("graph");
  };

  const openCurrentRelatedGraph = async () => {
    if (!draft) return;
    if (state.entities.some((entity) => entity.id === draft.id) || await flushDraft()) {
      openRelatedGraph(draft.id);
    }
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
      const id = selectedEntryId.current;
      if (id) await loadEntity(id, false);
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
      title: translate(language, "类型名称"),
      initialValue: type.name,
      confirmLabel: translate(language, "重命名"),
    });
    if (!name || name === type.name) return;
    try {
      await desktopApi()?.update_type(type.id, name, type.icon);
      await refreshProject();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const createType = () => {
    if (!state.writable || closeInProgress.current) return;
    setContextMenu(null);
    setPaletteOpen(false);
    setTypeCreateValues({ name: "", icon: "Sparkles" });
    setTypeCreateOpen(true);
  };

  const submitCreateType = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      !state.writable ||
      typeCreateInFlight.current ||
      !typeCreateValues.name.trim()
    )
      return;
    const path = projectPath.current;
    const session = typeCreateSession.current;
    typeCreateInFlight.current = true;
    setTypeCreateSubmitting(true);
    try {
      const created = await desktopApi()?.create_type(
        typeCreateValues.name.trim(),
        typeCreateValues.icon,
      );
      if (created && projectPath.current === path) {
        if (typeCreateSession.current === session) {
          closeTypeCreate();
          setSettingsTab("types");
          setSettingsTypeId(created.id);
          void navigateTo("settings");
        }
        void refreshProject().catch((reason: Error) => setError(reason.message));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      typeCreateInFlight.current = false;
      setTypeCreateSubmitting(false);
    }
  };

  const deleteType = async (typeId: string) => {
    const type = state.types.find((item) => item.id === typeId);
    if (
      !type ||
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
      title: translate(language, "词条名称"),
      initialValue: entity.name,
      confirmLabel: translate(language, "重命名"),
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
        void loadEntity(saved.id, false);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  useEffect(() => {
    if (selectedEntryId.current || !state.entities.length || activeView !== "entries")
      return;
    void loadEntity(state.entities[0].id);
  }, [activeView, state.entities, loadEntity, selectedId]);

  useEffect(() => {
    if (closing || !state.project || !state.writable || state.save_mode !== "interval") return;
    const timer = window.setInterval(
      () => {
        if (pendingDrafts.current.size) void flushDraft();
      },
      Math.max(1, state.save_interval) * 60_000,
    );
    return () => window.clearInterval(timer);
  }, [
    closing,
    flushDraft,
    intervalSaveCycle,
    state.project,
    state.save_interval,
    state.save_mode,
    state.writable,
  ]);

  useEffect(() => {
    if (closing || !dirty || !state.writable || state.save_mode !== "realtime") return;
    const timer = window.setTimeout(() => void flushDraft(), 360);
    return () => window.clearTimeout(timer);
  }, [closing, dirty, flushDraft, revision, state.save_mode, state.writable]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (closeInProgress.current || event.defaultPrevented) return;
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
        closeTypeCreate();
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
    if (!current || current.id !== selectedEntryId.current || !state.writable) return;
    const entity = update(current);
    const version = ++revisionRef.current;
    pendingDrafts.current.set(entity.id, { entity, version });
    setDraft(entity);
    setRevision(version);
    setDirty(true);
  };

  const selectEntity = (entity: EntitySummary) => loadEntity(entity.id);

  const selectById = (id: string) => {
    void loadEntity(id);
  };

  const changeWindow = async (action: "minimize" | "maximize") => {
    const api = desktopApi();
    if (!api || windowActionPending.current) return;
    windowActionPending.current = true;
    windowStateRequest.current++;
    titlebarDrag.current = null;
    pendingWindowPosition.current = null;
    try {
      setWindowMaximized(await api.window_action(action));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      windowActionPending.current = false;
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

  const promptForProject = () =>
    showStatusToast(translate(language, "请先打开或新建资料库"), "error");

  const switchTheme = () => {
    const shell = document.querySelector(".app-shell");
    shell?.classList.add("theme-transition");
    setTheme((current) => (current === "light" ? "dark" : "light"));
    window.setTimeout(() => shell?.classList.remove("theme-transition"), 340);
  };

  const createProject = async (event: React.FormEvent) => {
    event.preventDefault();
    const eraName = createValues.era_name.trim();
    if (!eraName) {
      setError(translate(language, "纪年法名称不能为空"));
      return;
    }
    if (!(await flushDraft())) return;
    try {
      const next = await desktopApi()?.create_project(
        "",
        createValues.name,
        eraName,
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
    const path = projectPath.current;
    const previouslySelected = selectedEntryId.current;
    try {
      const entity = await api.create_entity(type.id);
      if (projectPath.current !== path) return;
      entity.name = `未命名${type.name}`;
      const missingRequired = entity.fields?.some(
        (field) =>
          field.required &&
          (entity.custom_fields[field.name] === undefined ||
            entity.custom_fields[field.name] === ""),
      );
      if (selectedEntryId.current !== previouslySelected) return;
      const version = ++revisionRef.current;
      setRevision(version);
      pendingDrafts.current.set(entity.id, { entity, version });
      changeSelection(entity.id, entity);
      setActiveTypeId(entity.type_id);
      setOpenTypeIds((types) => ({ ...types, [entity.type_id]: true }));
      setActiveView("entries");
      setDirty(true);
      if (missingRequired) setError(translate(language, "请填写必填属性后保存词条"));
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
      label: newDate.label.trim() || translate(language, "历史节点"),
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
      !state.entities.some((entity) => entity.id === relationValues.target_id && entity.id !== draft.id) ||
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
      if (selectedEntryId.current === draft.id) {
        setRelationValues({ target_id: "", label: "", reverse_label: "" });
        setShowRelationForm(false);
        await loadEntity(draft.id, false);
      }
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
        title: translate(language, "删除关联"),
        message: `${translate(language, "删除关联确认")}${relation.other_name}?`,
        confirmLabel: translate(language, "删除关联"),
        danger: true,
      })) === null
    )
      return;
    try {
      await desktopApi()?.delete_relation(relationId);
      await loadEntity(draft.id, false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const removeEntity = async (entityId: string, entityName: string) => {
    if (
      !state.writable ||
      (await actionDialog({
        title: translate(language, "永久删除词条"),
        message: `${translate(language, "永久删除确认前缀")}${entityName}${translate(language, "永久删除确认后缀")}`,
        confirmLabel: translate(language, "永久删除"),
        danger: true,
      })) === null
    )
      return;
    try {
      pendingDrafts.current.delete(entityId);
      setDirty(pendingDrafts.current.size > 0);
      await pendingSaves.current.get(entityId)?.promise.catch(() => undefined);
      await desktopApi()?.delete_entity(entityId);
      setState((current) => ({
        ...current,
        entities: current.entities.filter((entity) => entity.id !== entityId),
      }));
      if (selectedEntryId.current === entityId) changeSelection("");
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
      if (closeInProgress.current) return;
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
        title: translate(language, "永久删除词条"),
        message: `${translate(language, "永久删除确认前缀")}${name}${translate(language, "永久删除确认后缀")}`,
        confirmLabel: translate(language, "永久删除"),
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
      if (selectedEntryId.current === entityId) changeSelection("");
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
      language={language}
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
      className={`app-shell theme-${theme}${motionEnabled ? "" : " motion-disabled"}${windowMaximized ? " window-maximized" : ""}`}
      style={{ "--accent": draft?.color || "#7C3AED" } as React.CSSProperties}
      onClick={() => contextMenu && setContextMenu(null)}
    >
      <div className="ambient-light" aria-hidden="true">
        <i /><i /><i />
      </div>
      {particlesEnabled && <AmbientParticles theme={theme} />}
      <header className="titlebar"
        onDoubleClick={(event) => {
          if (event.button === 0 && !closing && event.target instanceof Element &&
            !event.target.closest(".no-drag, button, input, textarea, select, a")) {
            void changeWindow("maximize");
          }
        }}
        onPointerDown={(event) => {
          if (windowMaximized || windowActionPending.current || closing || !event.isPrimary || event.button !== 0 ||
            (event.target instanceof Element && event.target.closest(".no-drag, button, input, textarea, select, a"))) return;
          const x = event.screenX - event.clientX;
          const y = event.screenY - event.clientY;
          if (!Number.isFinite(x) || !Number.isFinite(y)) return;
          // Keep the pointer's client offset while the native window moves beneath it.
          titlebarDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = titlebarDrag.current;
          const api = desktopApi();
          if (windowMaximized || closing || !drag || drag.pointerId !== event.pointerId || !api) return;
          if (!(event.buttons & 1)) {
            titlebarDrag.current = null;
            pendingWindowPosition.current = null;
            return;
          }
          const x = event.screenX - drag.x;
          const y = event.screenY - drag.y;
          if (!Number.isFinite(x) || !Number.isFinite(y)) return;
          pendingWindowPosition.current = { x: Math.round(x), y: Math.round(y) };
          if (movingWindow.current) return;
          movingWindow.current = true;
          void (async () => {
            try {
              while (pendingWindowPosition.current) {
                const point = pendingWindowPosition.current;
                pendingWindowPosition.current = null;
                await api.move_window(point.x, point.y);
              }
            } catch (error) {
              setError(error instanceof Error ? error.message : String(error));
              pendingWindowPosition.current = null;
            } finally {
              movingWindow.current = false;
            }
          })();
        }}
        onLostPointerCapture={() => {
          titlebarDrag.current = null;
        }}
        onPointerCancel={() => {
          titlebarDrag.current = null;
          pendingWindowPosition.current = null;
        }}>
        <div className="brand-lockup">
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
              {translate(language, saving ? "正在同步" : dirty ? "尚未保存" : "已同步至本地库")}
            </div>
          )}
          {state.project && state.writable && (
            <button
              className="topbar-save"
              disabled={!dirty || saving || closing}
              title={language === "en" ? "Save all changes (Ctrl+S)" : "保存所有未保存修改（Ctrl+S）"}
              onClick={() => void manualSave()}
            >
              <Save size={13} />
              {translate(language, "保存")}
            </button>
          )}
          {state.project && (
            <button
              className="close-library-pill"
              title={translate(language, "关闭资料库")}
              onClick={() => void requestClose("project")}
            >
              <FolderOpen size={13} />
              <span>{translate(language, "关闭资料库")}</span>
            </button>
          )}
          {state.project && (
            <button
              className={`readonly-toggle ${state.read_only ? "active" : ""}`}
              disabled={changingReadOnly}
              title={state.read_only ? "Edit mode" : "Read-only mode"}
              onClick={() => void toggleReadOnly()}
            >
              <LockKeyhole size={14} />
              <span>{translate(language, state.read_only ? "只读模式" : "编辑模式")}</span>
            </button>
          )}
          <button
            className="icon-button theme-toggle"
              title={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
            onClick={switchTheme}
          >
            {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
          </button>
          <button
            className="icon-button window-control"
            title={translate(language, "最小化")}
            onClick={() => void changeWindow("minimize")}
          >
            <Minus size={16} aria-hidden="true" />
          </button>
          <button
            className="icon-button window-control"
            title={translate(language, windowMaximized ? "还原窗口" : "最大化窗口")}
            aria-label={translate(language, windowMaximized ? "还原窗口" : "最大化窗口")}
            onClick={() => void changeWindow("maximize")}
          >
            {windowMaximized ? <Copy size={13} aria-hidden="true" /> : <Square size={12} aria-hidden="true" />}
          </button>
          <button
            className="icon-button window-control close-control"
            title={translate(language, "关闭")}
            onClick={() => void requestClose("window")}
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
              initial={{ width: 0 }}
              animate={{ width: 258 }}
              exit={{ width: 0 }}
              transition={{ type: "spring", stiffness: 340, damping: 38 }}
            >
              <div className="sidebar-top">
                {!state.project ? (
                  <div className="sidebar-brand-empty">AETHERCOD</div>
                ) : (
                <>
                <button
                  className="library-selector"
                  onClick={(event) => openContextMenu(event, "library", "")}
                  title={translate(language, "资料库菜单")}
                  aria-haspopup="menu"
                  aria-expanded={contextMenu?.kind === "library"}
                >
                  <div className="library-icon">
                    <BookOpen size={16} />
                  </div>
                  <div className="library-copy">
                    <span className={`muted-label${language === "en" ? " font-bold" : ""}`}>{translate(language, "当前资料库")}</span>
                    <strong>{state.project?.name ?? translate(language, "资料库")}</strong>
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
                    <span className="sidebar-action-label">{translate(language, "搜索词条")}</span>
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
                    <span className="sidebar-action-label">{translate(language, "打开资料库")}</span>
                  </button>
                  <button
                    className="subtle-action"
                    onClick={() => setCreateOpen(true)}
                  >
                    <FilePlus2 size={14} />
                    <span className="sidebar-action-label">{translate(language, "新建资料库")}</span>
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
                    <span className="sidebar-action-label">{translate(language, "设置")}</span>
                  </button>
                </div>
                <nav className="workspace-nav" aria-label={translate(language, "工作区")}>
                  <button
                    className={activeView === "entries" ? "active" : ""}
                    onClick={() => void navigateTo("entries")}
                  >
                    <BookOpen size={15} />
                    <span className="sidebar-action-label">{translate(language, "词条")}</span>
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
                    <span className="sidebar-action-label">{translate(language, "时间线")}</span>
                  </button>
                  <button
                    className={activeView === "graph" ? "active" : ""}
                    aria-disabled={!state.project}
                    onClick={() => {
                      if (!state.project) return promptForProject();
                      setRelatedGraphId("");
                      setGraphFilterIds([]);
                      void navigateTo("graph");
                    }}
                  >
                    <Network size={15} />
                    <span className="sidebar-action-label">{translate(language, "关系网")}</span>
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
                    <span className="sidebar-action-label">{translate(language, "收藏夹")}</span>
                  </button>
                </nav>
                </>
                )}
              </div>

              {state.project && <div className="sidebar-section-heading">
                <span>{language === "en" ? "Entry Types" : "词条分类"}</span>
                <div className="category-actions">
                  {state.project && (
                    <button
                      className="icon-button compact"
                    title={translate(language, "新建词条类型")}
                      disabled={!state.writable}
                      onClick={createType}
                    >
                      <Plus size={15} />
                    </button>
                  )}
                  <button
                    className="icon-button compact"
                    title={translate(language, "显示全部词条")}
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
              </div>}
              <ElasticScroll className={`type-list${state.project ? "" : " no-project"}`}>
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
                            <span className="sidebar-action-label">{displayTypeName(language, type)}</span>
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
                          title={`${translate(language, "新建")}${displayTypeName(language, type)}`}
                            onClick={() => void createEntity(type)}
                          >
                            <Plus size={14} />
                          </button>
                          <button
                            className="type-more-button"
                            title={`${displayTypeName(language, type)} ${translate(language, "选项")}`}
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
                                    className={`entry-nav ${sidebarSelectedId === entity.id ? "selected" : ""}`}
                                    onClick={() => {
                                      if (activeView === "graph") openRelatedGraph(entity.id);
                                      else void selectEntity(entity);
                                    }}
                                    onContextMenu={(event) =>
                                      openContextMenu(
                                        event,
                                        "entity",
                                        entity.id,
                                      )
                                    }
                                  >
                                    {sidebarSelectedId === entity.id && (
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
                                      style={{ background: entity.color, "--node-color": entity.color } as React.CSSProperties}
                                    />
                                    <span className="entry-name">
                                      {entity.name}
                                    </span>
                                    <span
                                      className="entry-more-button"
                                      title={`${entity.name} ${translate(language, "选项")}`}
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
                    {translate(language, "打开或新建资料库以浏览词条")}
                  </div>
                )}
              </ElasticScroll>

              {state.project && <div className="sidebar-bottom">
                <div className="library-count">
                  <span className="status-square" />
                  {state.entities.length} {translate(language, "词条")}
                <span className="bottom-separator">·</span>{translate(language, "本地数据库")}
                </div>
                <div className="profile-row">
                  <div className="profile-avatar">
                    {state.project?.author?.slice(0, 1) || "A"}
                  </div>
                  <div className="profile-copy">
                    <strong>{state.project?.author || "Aethercod"}</strong>
                    <span>
                      {state.project ? state.project.era_name : translate(language, "个人工作区")}
                    </span>
                  </div>
                </div>
              </div>}
            </motion.aside>
          )}
        </AnimatePresence>

        <main className="main-panel">
          {!(activeView === "graph" && state.project) && <div className="toolbar">
            <div className="breadcrumb">
              <button
                className="icon-button"
                title={translate(language, sidebarOpen ? "收起侧栏" : "展开侧栏")}
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
                        ? translate(language, "时间线")
                        : activeView === "favorites"
                            ? translate(language, "收藏夹")
                            : activeView === "settings"
                              ? translate(language, "资料库设置")
                              : (draft?.type ? displayTypeName(language, draft.type) : (language === "en" ? "Library" : "典籍"))}
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
                    title={translate(language, "删除词条")}
                    onClick={() => void deleteEntity()}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              {activeView === "entries" && draft && (
                <button
                  className="icon-button"
                  title={translate(language, "查看全库时间线")}
                  onClick={() => void navigateTo("timeline")}
                >
                  <CalendarDays size={15} />
                </button>
              )}
              {activeView === "entries" && draft && (
                <motion.button
                  className={`favorite-toggle ${draft.is_favorite ? "active" : ""}`}
                  title={translate(language, draft.is_favorite ? "取消收藏（Ctrl+D）" : "加入收藏（Ctrl+D）")}
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
                  title={translate(language, "查看当前词条及其直接关联图谱")}
                  onClick={openCurrentRelatedGraph}
                >
                  <Network size={14} />
                  {!compactWindow && <span>{translate(language, "关联图谱")}</span>}
                </button>
              )}
              {activeView === "entries" && (
                <button
                  className="icon-button"
                  title={translate(language, inspectorOpen ? "收起检视栏" : "展开检视栏")}
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
          </div>}

          {error && (
            <div className="error-banner">
              <CircleHelp size={15} />
              <span>{error}</span>
              <button title={translate(language, "关闭提示")} onClick={() => setError("")}>
                <X size={14} />
              </button>
            </div>
          )}

          <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeView}
            className="main-view-transition"
            initial={motionEnabled ? { opacity: 0, y: 5 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={motionEnabled ? { opacity: 0, y: -3 } : { opacity: 1 }}
            transition={{ duration: motionEnabled ? 0.16 : 0, ease: [0.22, 1, 0.36, 1] }}
          >
          {activeView === "settings" && state.project ? (
            <SettingsView
              key={`${state.project.path}-${settingsTab}-${settingsTypeId}`}
              state={state}
              initialTab={settingsTab}
              initialTypeId={settingsTypeId}
              onProjectUpdated={syncState}
              onChanged={refreshProject}
              onDirtyChange={onSettingsDirtyChange}
              language={language}
              onLanguageChange={onLanguageChange}
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
              language={language}
              onSelect={selectById}
              onRelatedGraph={openRelatedGraph}
            />
          ) : activeView === "graph" && state.project ? (
            <GraphView
              graph={graph}
              language={language}
              types={state.types}
              entities={state.entities.map((entity) =>
                pendingDrafts.current.get(entity.id)?.entity ?? entity,
              )}
              selectedIds={graphFilterIds}
              relatedEntityId={graphCenterId}
              lockedCenter={Boolean(relatedGraphId)}
              onFilterChange={setGraphFilterIds}
              onRelatedGraph={openRelatedGraph}
              sidebarOpen={sidebarOpen}
              onToggleSidebar={() => setSidebarOpen((open) => !open)}
              onShowFullGraph={() => {
                setRelatedGraphId("");
                setGraphFilterIds([]);
              }}
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
                    <span className="section-kicker">{translate(language, "已收藏的设定")}</span>
                    <h1>{translate(language, "收藏夹")}</h1>
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
                      <span className="entity-dot" style={{ background: entity.color, "--node-color": entity.color } as React.CSSProperties} />
                      <span className="favorite-row-copy">
                        <strong>{entity.name}</strong>
                        <small>{entity.summary || (typeById(entity.type_id) ? displayTypeName(language, typeById(entity.type_id)!) : "")}</small>
                      </span>
                      <Star size={15} fill="currentColor" />
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </div>
                {!state.entities.some((entity) => entity.is_favorite) && (
                  <div className="empty-view favorites-empty">
                    <Star size={22} />
                    <strong>{translate(language, "收藏夹为空")}</strong>
                  </div>
                )}
              </section>
            </ElasticScroll>
          ) : !state.project ? (
            <section className="welcome-state">
              <div className="welcome-glyph">
                <Sparkles size={25} />
              </div>
              <h1>{translate(language, "打开一卷世界")}</h1>
              <p>{language === "en" ? "Continue building your world in a local library." : "从本地资料库继续构建你的世界观。"}</p>
              <div className="welcome-actions">
                <button
                  className="primary-button"
                  onClick={() => void openProject()}
                >
                  <FolderOpen size={16} />
                  {translate(language, "打开资料库")}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus size={16} />
                  {translate(language, "新建资料库")}
                </button>
              </div>
            </section>
          ) : loadingEntry && !draft ? (
            <div className="empty-view" role="status">{translate(language, "正在加载")}</div>
          ) : selectedId && !draft ? (
            <section className="welcome-state compact-welcome">
              <h1>{translate(language, "无法打开此词条")}</h1>
              <p>{translate(language, "词条可能已被删除，或暂时无法加载。")}</p>
              <button className="secondary-button" onClick={() => void loadEntity(selectedId)}>
                {translate(language, "重试")}
              </button>
            </section>
          ) : !draft ? (
            <section className="welcome-state compact-welcome">
              <div className="welcome-glyph">
                <BookOpen size={23} />
              </div>
              <h1>{translate(language, "选择一个词条")}</h1>
              <p>{translate(language, "从左侧分类中打开一条设定，或创建新词条。")}</p>
            </section>
          ) : (
            <ElasticScroll key={draft.id} className="document-scroll">
                <motion.article
                  key={draft.id}
                  className="document"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
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
                        {draft.type ? displayTypeName(language, draft.type) : ""}
                      </span>
                      <span className="eyebrow-dot">·</span>
                      {categoryEditing && state.writable ? (
                        <input
                          className="category-input"
                          autoFocus
                          aria-label={translate(language, "词条分类")}
                          value={categoryDraft}
                          placeholder={translate(language, "添加分类")}
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
                          title={translate(language, state.writable ? "编辑分类" : "词条分类")}
                          onClick={() => {
                            if (!state.writable) return;
                            setCategoryDraft(draft.tags.join("，"));
                            setCategoryEditing(true);
                          }}
                        >
                          {draft.tags.join(" · ") ||
                            (state.writable ? translate(language, "添加分类") : translate(language, "尚未设置分类"))}
                        </button>
                      )}
                    </div>
                    <EditableText
                      key={`${draft.id}-name`}
                      language={language}
                      kind="title"
                      value={draft.name}
                      placeholder={translate(language, "词条名称")}
                      disabled={!state.writable}
                      onChange={(value) =>
                        updateDraft((current) => ({ ...current, name: value }))
                      }
                    />
                    <EditableText
                      key={`${draft.id}-summary`}
                      language={language}
                      kind="summary"
                      value={draft.summary}
                      placeholder={translate(language, "添加词条摘要")}
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
                        <span>{translate(language, "别名")}</span>
                        <AliasInput aliases={draft.aliases} disabled={!state.writable} language={language} onChange={updateAliases} />
                      </label>
                    )}
                    {properties && (properties.aliasesInGrid || properties.fields.length > 0) && (
                      <section className="document-section properties-section">
                        <div className="section-heading">
                          <div>
                            <span className="section-kicker">{translate(language, "结构化资料")}</span>
                            <h2>{translate(language, "属性")}</h2>
                          </div>
                          <button
                            className="icon-button compact"
                            title={translate(language, propertiesOpen ? "折叠属性" : "展开属性")}
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
                                  <span>{translate(language, "别名")}</span>
                                  <AliasInput aliases={draft.aliases} disabled={!state.writable} language={language} onChange={updateAliases} />
                                </label>
                              )}
                              {properties.fields.map(renderProperty)}
                              {properties.additional.length > 0 && (
                                <details className="additional-properties">
                                  <summary>{translate(language, "其他属性")}</summary>
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
                            <span className="section-kicker">{translate(language, "世界设定")}</span>
                            <h2>{translate(language, "正文")}</h2>
                        </div>
                        <span className="markdown-label">MARKDOWN</span>
                      </div>
                      <EditableText
                        key={`${draft.id}-notes`}
                        language={language}
                        kind="notes"
                        value={draft.notes}
                        placeholder={translate(language, "在这里书写这个词条的故事…… 支持 Markdown 与 [[词条引用]]。")}
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
                      <span className="section-kicker">{translate(language, "相互连接")}</span>
                            <h2>
                              {translate(language, "关联词条")} {" "}
                              <span className="heading-count">
                                {draft.relations?.length ?? 0}
                              </span>
                            </h2>
                          </div>
                          <button
                            className="icon-button compact"
                            title={translate(language, "添加关联")}
                            disabled={!state.writable}
                            onClick={() => setShowRelationForm((open) => !open)}
                          >
                            <Plus size={15} />
                          </button>
                        </div>
                        <div className="relation-pills">
                          {draft.relations?.map((relation) => {
                            const target = state.entities.find(
                              (item) => item.id === normalizeEntryId(relation.other_id),
                            );
                            const targetType = target
                              ? typeById(target.type_id)
                              : undefined;
                            return (
                              <motion.button
                                key={relation.id}
                                className="relation-pill"
                                whileHover={{ y: -1 }}
                                onPointerEnter={(event) => {
                                  if (event.pointerType === "touch") return;
                                  const bounds = event.currentTarget.getBoundingClientRect();
                                  setRelationPreview({
                                    entityId: draft.id,
                                    name: relation.other_name,
                                    summary: target?.summary ||
                                      (targetType ? displayTypeName(language, targetType) : translate(language, "词条")),
                                    left: Math.min(bounds.left, window.innerWidth - 248),
                                    bottom: window.innerHeight - bounds.top + 7,
                                  });
                                }}
                                onPointerLeave={() => setRelationPreview(null)}
                                onClick={() => void loadEntity(relation.other_id)}
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
                                {state.writable && (
                                  <span
                                    className="pill-remove"
                                    role="button"
                                    title={translate(language, "删除关联")}
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
                            <span className="empty-inline">{translate(language, "尚无关联")}</span>
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
                                label={translate(language, "关联词条")}
                                placeholder={translate(language, "选择关联词条")}
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
                                  placeholder={translate(language, "关系名称")}
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
                                  placeholder={translate(language, "反向名称")}
                                  disabled={!state.writable}
                                />
                              </div>
                              <button
                                className="small-submit"
                                type="submit"
                                disabled={
                                  !relationValues.label.trim() ||
                                  !state.entities.some((entity) =>
                                    entity.id === relationValues.target_id && entity.id !== draft.id,
                                  )
                                }
                              >
                                {translate(language, "保存关联")}
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
                              {translate(language, "时间线")} {" "}
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
                                  aria-label={translate(language, "事件名称")}
                                  value={date.label ?? ""}
                                  placeholder={translate(language, "事件名称")}
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
                                  language={language}
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
                                    title={translate(language, "删除时间节点")}
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
                                  aria-label={translate(language, "事件具体说明")}
                                  value={date.description ?? ""}
                                  placeholder={translate(language, "事件具体说明")}
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
                            <span className="empty-inline">{translate(language, "暂无纪年节点")}</span>
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
                              placeholder={translate(language, "节点名称")}
                            />
                            <DatePrecisionEditor
                              value={{
                                year: newDate.year ? Number(newDate.year) : null,
                                date_value: newDate.date_value,
                                precision: newDate.precision,
                              }}
                              language={language}
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
                              aria-label={translate(language, "事件具体说明")}
                              value={newDate.description}
                              onChange={(event) =>
                                setNewDate((value) => ({
                                  ...value,
                                  description: event.target.value,
                                }))
                              }
                              placeholder={translate(language, "事件具体说明")}
                              rows={2}
                            />
                            <button
                              className="icon-button compact"
                              title={translate(language, "添加时间节点")}
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
                      <span>{translate(language, "创建于")} {formatDate(draft.created_at)}</span>
                      <span>{translate(language, "更新于")} {formatDate(draft.updated_at)}</span>
                    </footer>
                  </motion.div>
                </motion.article>
            </ElasticScroll>
          )}
          </motion.div>
          </AnimatePresence>
        </main>

        <AnimatePresence initial={false}>
          {inspectorOpen &&
            activeView === "entries" &&
            state.project &&
            draft && (
              <motion.aside
                className="inspector"
                initial={{ width: 0 }}
                animate={{ width: 254 }}
                exit={{ width: 0 }}
                transition={{ type: "spring", stiffness: 340, damping: 38 }}
              >
                <div className="inspector-header">
                  <span>{translate(language, "检视器")}</span>
                  <div className="flex items-center gap-1">
                    <button
                      className="icon-button compact"
                      title={translate(language, "查看当前词条及其直接关联图谱")}
                      onClick={openCurrentRelatedGraph}
                    >
                      <Network size={14} />
                    </button>
                    <button
                      className="icon-button compact"
                      title={translate(language, "关闭检视栏")}
                      onClick={() => setInspectorOpen(false)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <section className="inspector-section">
                  <div className="inspector-heading">
                    <Link2 size={14} />
                    <span>{translate(language, "反向引用")}</span>
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
                      <p className="inspector-empty">{translate(language, "没有词条引用此处")}</p>
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
                    <span>{translate(language, "编辑历史")}</span>
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
                                ? `${translate(language, "回退到版本")} ${entry.version}`
                                : translate(language, "只读模式下无法回退历史版本")
                            }
                            onClick={() => void restoreVersion(entry.version)}
                          >
                            <span className="history-entry-top">
                              <strong>{translate(language, "版本")} {entry.version}</strong>
                              <time>{formatTimestamp(entry.changed_at)}</time>
                            </span>
                            <span className="history-description">
                              {entry.description || entry.change_type}
                            </span>
                          </button>
                        ))}
                        {!history.length && (
                          <p className="inspector-empty">{translate(language, "暂无编辑记录")}</p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
                <section className="inspector-section">
                  <div className="inspector-heading">
                    <CalendarDays size={14} />
                    <span>{translate(language, "纪年节点")}</span>
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
                    <p className="inspector-empty">{translate(language, "尚无时间记录")}</p>
                  )}
                </section>
                <section className="inspector-section entity-info">
                  <div className="inspector-heading">
                    <Sparkles size={14} />
                    <span>{translate(language, "词条信息")}</span>
                  </div>
                  <div className="info-row">
                    <span>{translate(language, "类型")}</span>
                    <span>{draft.type ? displayTypeName(language, draft.type) : ""}</span>
                  </div>
                  <div className="info-row">
                    <span>{translate(language, "颜色")}</span>
                    <ColorPicker
                      language={language}
                      value={draft.color}
                      disabled={!state.writable}
                      onChange={(color) =>
                        updateDraft((current) => ({ ...current, color }))
                      }
                    />
                  </div>
                  <div className="info-row">
                    <span>{translate(language, "属性数")}</span>
                    <span>{Object.keys(draft.custom_fields).length}</span>
                  </div>
                  <div className="info-row">
                    <span>{translate(language, "关联数")}</span>
                    <span>{draft.relations?.length ?? 0}</span>
                  </div>
                </section>
                <div className="inspector-bottom">
                  <span className="inspector-status-dot" />
                  {translate(language, "本地 SQLite 资料库")}
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
            {...glassSlide(3)}
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
                  {translate(language, "打开资料库")}
                </button>
                <button onClick={() => setCreateOpen(true)}>
                  <FilePlus2 size={14} />
                  {translate(language, "新建资料库")}
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
                    {translate(language, "资料库设置")}
                  </button>
                )}
                {state.project && (
                  <>
                    <button onClick={() => void exportJson()}>
                      <Save size={14} />
                      {translate(language, "导出为 JSON")}
                    </button>
                    <button disabled={!state.writable} onClick={() => void importJson()}>
                      <FolderOpen size={14} />
                      {translate(language, "导入 JSON")}
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
                      {translate(language, "新建词条")}
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
                      {translate(language, "管理类型与字段")}
                    </button>
                    <button
                      disabled={!state.writable || type.is_builtin}
                      onClick={() => void renameType(type.id)}
                    >
                      <Pencil size={14} aria-hidden="true" />
                      {translate(language, "重命名类型")}
                    </button>
                    <button
                      className="danger-menu-item"
                      disabled={!state.writable || type.is_builtin}
                      onClick={() => void deleteType(type.id)}
                    >
                      <Trash2 size={14} />
                      {translate(language, "删除类型")}
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
                      {translate(language, "打开词条")}
                    </button>
                    <button
                      disabled={!state.writable}
                      onClick={() => void renameEntity(entity.id)}
                    >
                      <Pencil size={14} />
                      {translate(language, "重命名词条")}
                    </button>
                    <button
                      className="danger-menu-item"
                      disabled={!state.writable}
                      onClick={() => void removeEntity(entity.id, entity.name)}
                    >
                      <Trash2 size={14} />
                      {translate(language, "删除词条")}
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
            {...glassFade}
            onMouseDown={() => setPaletteOpen(false)}
          >
            <motion.div
              className="command-palette"
              {...glassSlide(8)}
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
                  placeholder={translate(language, "搜索词条或跳转到…")}
                />
                <kbd>ESC</kbd>
              </div>
              <div className="palette-label">
                {translate(language, "词条")} <span>{paletteItems.length}</span>
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
                        <small>{entity.summary || (type ? displayTypeName(language, type) : "")}</small>
                      </span>
                      <span className="result-category">{type ? displayTypeName(language, type) : ""}</span>
                    </button>
                  );
                })}
                {!paletteItems.length && (
                  <div
                    className={`palette-empty ${paletteNoMatch ? "palette-no-match" : ""}`}
                    role={paletteNoMatch ? "alert" : undefined}
                  >
                    {translate(language, paletteNoMatch ? "未找到匹配内容" : "没有匹配的词条")}
                  </div>
                )}
              </div>
              <div className="palette-footer">
                <span>
                  <kbd>↑</kbd>
                  <kbd>↓</kbd>{translate(language, "选择")}
                </span>
                <span>
                  <kbd>↵</kbd>{translate(language, "打开")}
                </span>
                <span>
                  <kbd>ESC</kbd>{translate(language, "关闭")}
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {typeCreateOpen && (
          <div
            className="modal-scrim"
            onMouseDown={closeTypeCreate}
          >
            <motion.form
              className="create-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={translate(language, "新建词条类型")}
              onSubmit={(event) => void submitCreateType(event)}
              initial={glassSlide(8).initial}
              animate={glassSlide(8).animate}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="dialog-heading">
                <div>
                  <span className="section-kicker">{translate(language, "词条结构")}</span>
                  <h2>{translate(language, "新建词条类型")}</h2>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  title={translate(language, "关闭")}
                  onClick={closeTypeCreate}
                >
                  <X size={16} />
                </button>
              </div>
              <label>
                {translate(language, "类型名称")}
                <input
                  autoFocus
                  value={typeCreateValues.name}
                  onChange={(event) =>
                    setTypeCreateValues((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder={translate(language, "例如：魔法体系")}
                  required
                />
              </label>
              <label className="type-create-icon-field">
                {translate(language, "类型图标")}
                <TypeIconPicker
                  value={typeCreateValues.icon}
                  language={language}
                  onChange={(icon) =>
                    setTypeCreateValues((current) => ({ ...current, icon }))
                  }
                />
              </label>
              <div className="dialog-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeTypeCreate}
                >
                  {translate(language, "取消")}
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={typeCreateSubmitting}
                >
                  <Plus size={15} />
                {translate(language, typeCreateSubmitting ? "创建中" : "创建类型")}
                </button>
              </div>
            </motion.form>
          </div>
      )}

      <AnimatePresence>
        {createOpen && (
          <motion.div
            className="modal-scrim"
            {...glassFade}
            onMouseDown={() => setCreateOpen(false)}
          >
            <motion.form
              className="create-dialog"
              onSubmit={(event) => void createProject(event)}
              {...glassSlide(8)}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="dialog-heading">
                <div>
                  <span className="section-kicker">{translate(language, "本地资料库")}</span>
                  <h2>{language === "en" ? "Create a New World" : "新建世界"}</h2>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  title={translate(language, "关闭")}
                  onClick={() => setCreateOpen(false)}
                >
                  <X size={16} />
                </button>
              </div>
              <label>
                {translate(language, "资料库名称")}
                <input
                  autoFocus
                  value={createValues.name}
                  onChange={(event) =>
                    setCreateValues((value) => ({
                      ...value,
                      name: event.target.value,
                    }))
                  }
                  placeholder={translate(language, "例如：星环纪事")}
                  required
                />
              </label>
              <label>
                {language === "en" ? "Calendar Era" : "纪年法名称"}
                <input
                  value={createValues.era_name}
                  placeholder={language === "en" ? "e.g. Era of the First Dawn" : "例如：泰拉纪元"}
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
                {translate(language, "作者")}
                <input
                  value={createValues.author}
                  onChange={(event) =>
                    setCreateValues((value) => ({
                      ...value,
                      author: event.target.value,
                    }))
                  }
                  placeholder={translate(language, "可选")}
                />
              </label>
              <label>
                {translate(language, "说明")}
                <textarea
                  value={createValues.description}
                  onChange={(event) =>
                    setCreateValues((value) => ({
                      ...value,
                      description: event.target.value,
                    }))
                  }
                  placeholder={translate(language, "可选")}
                  rows={2}
                />
              </label>
              <div className="dialog-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setCreateOpen(false)}
                >
                  {translate(language, "取消")}
                </button>
                <button type="submit" className="primary-button">
                  <Plus size={15} />
                  {translate(language, "选择位置并创建")}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {relationPreview && activeView === "entries" && relationPreview.entityId === draft?.id && (
          <motion.div className="relation-preview" {...glassSlide(3)}
            transition={{ duration: 0.14 }}
            style={{ left: relationPreview.left, bottom: relationPreview.bottom }}
          >
            <strong>{relationPreview.name}</strong>
            <small>{relationPreview.summary}</small>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {statusToast && (
          <motion.div
            key={statusToast.key}
            className={`status-toast glass-menu ${statusToast.kind}`}
            role="status"
            {...glassSlide(18)}
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
  language,
  onChange,
}: {
  aliases: string[];
  disabled: boolean;
  language: Language;
  onChange: (aliases: string[]) => void;
}) {
  const [input, setInput] = useState<string | null>(null);
  return (
    <input
      className="inline-input"
      value={input ?? aliases.join("，")}
      placeholder={translate(language, "添加别名")}
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
  language,
  onChange,
  onIssue,
}: {
  value: DateParts;
  disabled: boolean;
  language: Language;
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
    <div className="world-date-editor" role="group" aria-label={translate(language, "日期精度")}>
      <input
        aria-label={translate(language, "年份")}
        type="number"
        inputMode="numeric"
        min={-999999}
        max={999999}
        value={year ?? ""}
        placeholder={translate(language, "年")}
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
        aria-label={translate(language, "月份")}
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
        <option value="">{translate(language, "月")}</option>
        {Array.from({ length: 12 }, (_, index) => index + 1).map((item) => (
          <option value={item} key={item}>{item} {translate(language, "月")}</option>
        ))}
      </select>
      <select
        aria-label={translate(language, "日")}
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
        <option value="">{translate(language, "日")}</option>
        {Array.from({ length: days }, (_, index) => index + 1).map((item) => (
          <option value={item} key={item}>{item} {translate(language, "日")}</option>
        ))}
      </select>
    </div>
  );
}

function WorldDateInput({
  value,
  disabled,
  language,
  onChange,
  onIssue,
}: {
  value: unknown;
  disabled: boolean;
  language: Language;
  onChange: (value: unknown) => void;
  onIssue: (message: string) => void;
}) {
  const parsed = readDateParts(typeof value === "string" ? value : value as DateParts | null);
  return (
    <DatePrecisionEditor
      value={parsed}
      disabled={disabled}
      language={language}
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
  language,
  disabled,
  entities,
  onIssue,
  allowEmpty = true,
  onChange,
}: {
  field: FieldDefinition;
  value: unknown;
  language: Language;
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
        label={displayFieldName(language, field)}
        placeholder={translate(language, allowEmpty ? "未设置" : "请选择地点类别")}
        value={textValue}
        onChange={(value) => onChange(value || undefined)}
        disabled={disabled}
        options={[
          ...(allowEmpty ? [{ value: "", label: translate(language, "未设置") }] : []),
          ...field.options.map((option) => ({ value: option, label: field.protected ? displayFieldValue(language, field, option) as string : option })),
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
        <span>{translate(language, value ? "是" : "否")}</span>
      </label>
    );
  } else if (field.field_type === "date") {
    control = (
      <WorldDateInput
        value={value}
        disabled={disabled}
        language={language}
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
        label={displayFieldName(language, field)}
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
        label={displayFieldName(language, field)}
        value={textValue}
        onChange={(value) => onChange(value || undefined)}
        options={[
          { label: translate(language, "未设置"), value: "" },
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
        placeholder={translate(language, "未设置")}
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
        placeholder={translate(language, "未设置")}
        disabled={disabled}
      />
    );
  }
  return (
    <label className="property-cell">
      <span>
        {displayFieldName(language, field)}
        {field.required && <i className="required-mark">*</i>}
      </span>
      {control}
    </label>
  );
}

function EditableText({
  kind,
  language,
  value,
  placeholder,
  disabled,
  onChange,
  onResolve,
  suggestions = [],
}: {
  kind: "title" | "summary" | "notes";
  language: Language;
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
                aria-label={translate(language, "词条引用候选")}
                style={{ left: completion.x, top: completion.y }}
                {...glassSlide(4)}
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

function normalizeEntryId(id: string) {
  const value = id.trim().toLowerCase();
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value)
    ? value.replaceAll("-", "")
    : value;
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
