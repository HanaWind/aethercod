import { animate, AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Circle,
  Link2,
  Maximize2,
  Minus,
  Network,
  Plus,
  Search,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type CSSProperties,
} from "react";
import type { EntitySummary, EntityType, GraphData, GraphNode } from "./api";
import Dropdown from "./Dropdown";
import { graphDistances, HOVER_SCALE, initializeGraphLayout, NODE_HALF_HEIGHT, nodeRadius, separateGraphNodes } from "./graphLayout";
import { glassFade, glassSlide } from "./glassMotion";
import { displayTypeName, translate, type Language } from "./i18n";

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.2;
const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
type NodeMenu = { id: string; x: number; y: number } | null;
type Point = { x: number; y: number };
type Camera = { center: Point | null; zoom: number };
const EMPTY_TYPES: string[] = [];

export default function GraphView({
  graph,
  language,
  types,
  entities,
  selectedIds,
  relatedEntityId,
  lockedCenter,
  onFilterChange,
  onRelatedGraph,
  onShowFullGraph,
  sidebarOpen,
  onToggleSidebar,
  motionEnabled,
  writable,
  onSelect,
  onDelete,
  onError,
}: {
  graph: GraphData;
  language: Language;
  types: EntityType[];
  entities: EntitySummary[];
  selectedIds: string[];
  relatedEntityId: string;
  lockedCenter: boolean;
  onFilterChange: (ids: string[]) => void;
  onRelatedGraph: (id: string) => void;
  onShowFullGraph: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  motionEnabled: boolean;
  writable: boolean;
  onSelect: (entityId: string) => void;
  onDelete: (entityId: string, name: string) => void;
  onError: (message: string) => void;
}) {
  const t = (key: string) => translate(language, key);
  const percent = new Intl.NumberFormat(language === "en" ? "en" : "zh-CN", { style: "percent" });
  const plural = (count: number, singular: string) => `${count} ${singular}${count === 1 ? "" : "s"}`;
  const typeNames = useMemo(
    () => new Map(types.map((type) => [type.id, displayTypeName(language, type)])),
    [types, language],
  );
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [camera, setCamera] = useState<Camera>({ center: null, zoom: 1 });
  const cameraAnimation = useRef<{ stop: () => void } | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [centeredNodeId, setCenteredNodeId] = useState("");
  const [focusPositions, setFocusPositions] = useState<Record<string, Point>>({});
  const [nodeMenu, setNodeMenu] = useState<NodeMenu>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterControl = useRef<HTMLDivElement>(null);
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const [hopValue, setHopValue] = useState<{ centerId: string; text: string; distance: number } | null>(null);
  const [typeSelection, setTypeSelection] = useState({ centerId: relatedEntityId, ids: EMPTY_TYPES });
  const typeFilters = typeSelection.centerId === relatedEntityId ? typeSelection.ids : EMPTY_TYPES;
  const [panning, setPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; center: Point; scale: number } | null>(null);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    worldX: number;
    worldY: number;
    scale: number;
    point?: Point;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef("");
  const clickTimer = useRef<number | undefined>(undefined);
  const dragHoldTimer = useRef<number | undefined>(undefined);
  const displayedFocus = useRef<Record<string, Point>>({});
  const positionAnimation = useRef(0);
  const canvas = useRef<HTMLDivElement>(null);
  const lineMaskId = useId();
  const hopInputId = useId();
  const { nodes: initialNodes, width: WIDTH, height: HEIGHT } = useMemo(
    () => initializeGraphLayout(graph.nodes),
    [graph.nodes],
  );
  const viewScale = Math.min(viewport.width / WIDTH, viewport.height / HEIGHT);
  const { zoom } = camera;
  const worldScale = viewScale * zoom;
  const defaultCenter = useMemo(() => ({ x: WIDTH / 2, y: HEIGHT / 2 }), [WIDTH, HEIGHT]);
  const center = camera.center ?? defaultCenter;
  const viewLeft = worldScale ? center.x - viewport.width / (2 * worldScale) : 0;
  const viewTop = worldScale ? center.y - viewport.height / (2 * worldScale) : 0;

  useLayoutEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const measure = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      setViewport((current) => current.width === width && current.height === height
        ? current : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const baseNodes = useMemo(
    () => initialNodes.map((node) => ({ ...node, ...positions[node.id] })),
    [initialNodes, positions],
  );

  const nodes = useMemo(
    () => baseNodes.map((node) => ({ ...node, ...focusPositions[node.id] })),
    [baseNodes, focusPositions],
  );
  const extent = useMemo(() => {
    if (!nodes.length) return { left: 0, top: 0, width: WIDTH, height: HEIGHT };
    let left = 0, top = 0, right = WIDTH, bottom = HEIGHT;
    for (const node of nodes) {
      const radius = nodeRadius(node.name);
      left = Math.min(left, node.x * WIDTH - radius - 48);
      right = Math.max(right, node.x * WIDTH + radius + 48);
      top = Math.min(top, node.y * HEIGHT - NODE_HALF_HEIGHT - 48);
      bottom = Math.max(bottom, node.y * HEIGHT + NODE_HALF_HEIGHT + 48);
    }
    return { left, top, width: right - left, height: bottom - top };
  }, [HEIGHT, WIDTH, nodes]);
  const edges = useMemo(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return graph.edges
      .map((edge) => ({
        edge,
        source: byId.get(edge.source_id),
        target: byId.get(edge.target_id),
      }))
      .filter(
        (
          item,
        ): item is typeof item & { source: GraphNode; target: GraphNode } =>
          Boolean(item.source && item.target),
      );
  }, [graph.edges, nodes]);
  const localDistances = useMemo(
    () => relatedEntityId ? graphDistances(graph.edges, relatedEntityId) : null,
    [graph.edges, relatedEntityId],
  );
  const maxHops = useMemo(() => {
    let max = 0;
    for (const distance of localDistances?.values() ?? []) max = Math.max(max, distance);
    return max;
  }, [localDistances]);
  const defaultHops = Math.min(1, maxHops);
  const currentHop = hopValue?.centerId === relatedEntityId ? hopValue : null;
  const hops = Math.min(currentHop?.distance ?? defaultHops, maxHops);
  const hopInput = currentHop?.text ?? String(defaultHops);
  const centerEntity = entities.find(({ id }) => id === relatedEntityId) ??
    initialNodes.find(({ id }) => id === relatedEntityId);
  const visibleNodeIds = useMemo(() => {
    const selected = new Set(selectedIds);
    const typeIds = new Set(typeFilters);
    const visible = new Set(selectedIds);
    if (!localDistances) {
      for (const edge of graph.edges) {
        if (selected.has(edge.source_id)) visible.add(edge.target_id);
        if (selected.has(edge.target_id)) visible.add(edge.source_id);
      }
    }
    return new Set(initialNodes.filter((node) =>
      (localDistances
        ? (localDistances.get(node.id) ?? Infinity) <= hops
        : !selected.size || visible.has(node.id)) &&
      (!typeIds.size || typeIds.has(node.type_id)),
    ).map(({ id }) => id));
  }, [graph.edges, hops, initialNodes, localDistances, selectedIds, typeFilters]);
  const visibleGraph = useMemo(() => {
    const selected = new Set(selectedIds);
    return {
      nodes: nodes.filter(({ id }) => visibleNodeIds.has(id)),
      edges: edges.filter(({ source, target }) =>
        visibleNodeIds.has(source.id) && visibleNodeIds.has(target.id) &&
        (!localDistances || hops !== 0) &&
        (localDistances || !selected.size || selected.has(source.id) || selected.has(target.id))),
    };
  }, [edges, hops, localDistances, nodes, selectedIds, visibleNodeIds]);
  const filterOptions = entities.filter(
    (entity) =>
      !selectedIds.includes(entity.id) &&
      (!filterQuery.trim() ||
        `${entity.name} ${entity.summary}`
          .toLocaleLowerCase()
          .includes(filterQuery.trim().toLocaleLowerCase())),
  );
  const baseNodesRef = useRef(baseNodes);
  baseNodesRef.current = baseNodes;

  const entityColors = useMemo(
    () => new Map(entities.map((entity) => [entity.id, entity.color])),
    [entities],
  );

  useEffect(
    () => () => {
      window.clearTimeout(clickTimer.current);
      window.clearTimeout(dragHoldTimer.current);
      window.cancelAnimationFrame(positionAnimation.current);
      cameraAnimation.current?.stop();
    },
    [],
  );

  useEffect(() => {
    if (!filterOpen) return;
    const closeOnOutside = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && !filterControl.current?.contains(event.target)) {
        setFilterOpen(false);
      }
    };
    window.addEventListener("pointerdown", closeOnOutside);
    return () => window.removeEventListener("pointerdown", closeOnOutside);
  }, [filterOpen]);

  useEffect(() => {
    if (!nodeMenu) return;
    const close = () => setNodeMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [nodeMenu]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const zoomFromWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      const factor = Math.exp(-event.deltaY * unit * 0.0012);
      if (panStart.current || drag.current || !viewScale || !Number.isFinite(event.deltaY)) return;
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const offsetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * viewport.width;
      const offsetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * viewport.height;
      cameraAnimation.current?.stop();
      setCamera((current) => {
        const next = clampZoom(current.zoom * factor);
        if (next === current.zoom) return current;
        const origin = current.center ?? defaultCenter;
        const delta = (1 / current.zoom - 1 / next) / viewScale;
        return { zoom: next, center: { x: origin.x + offsetX * delta, y: origin.y + offsetY * delta } };
      });
    };
    element.addEventListener("wheel", zoomFromWheel, { passive: false });
    return () => element.removeEventListener("wheel", zoomFromWheel);
  }, [defaultCenter, viewport, viewScale]);

  const startPan = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as Element).closest(".graph-node-glass, button, input")) return;
    if (!worldScale) return;
    cameraAnimation.current?.stop();
    panStart.current = {
      x: event.clientX,
      y: event.clientY,
      center,
      scale: worldScale,
    };
    setPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePan = (event: PointerEvent<HTMLDivElement>) => {
    const start = panStart.current;
    if (!start) return;
    setCamera((current) => ({
      ...current,
      center: {
        x: start.center.x - (event.clientX - start.x) / start.scale,
        y: start.center.y - (event.clientY - start.y) / start.scale,
      },
    }));
  };

  const finishPan = () => {
    panStart.current = null;
    setPanning(false);
  };

  const moveNode = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    if (
      !current.moved &&
      Math.hypot(event.clientX - current.x, event.clientY - current.y) < 4
    )
      return;
    if (!current.moved) {
      current.moved = true;
      resetFocus();
    }
    window.cancelAnimationFrame(positionAnimation.current);
    window.clearTimeout(dragHoldTimer.current);
    const point = {
      x: current.worldX + (event.clientX - current.x) / current.scale / WIDTH,
      y: current.worldY + (event.clientY - current.y) / current.scale / HEIGHT,
    };
    current.point = point;
    setPositions((previous) => ({
      ...previous,
      [current.id]: point,
    }));
    dragHoldTimer.current = window.setTimeout(
      () => resolveDragAvoidance(current.id),
      500,
    );
  };

  const finishDrag = () => {
    window.clearTimeout(dragHoldTimer.current);
    if (drag.current?.moved) suppressClick.current = drag.current.id;
    if (drag.current?.moved) resolveDragAvoidance(drag.current.id);
    drag.current = null;
  };

  const resolveDragAvoidance = (anchorId: string) => {
    if (!writable) return;
    const currentNodes = baseNodesRef.current.map((node) =>
      node.id === anchorId && drag.current?.point ? { ...node, ...drag.current.point } : node,
    );
    const byId = new Map(currentNodes.map((node) => [node.id, node]));
    const anchor = byId.get(anchorId);
    if (!anchor) return;
    const ordered = [anchor, ...currentNodes.filter(({ id }) => id !== anchorId)];
    const targets = Object.fromEntries(
      separateGraphNodes(ordered, WIDTH, HEIGHT)
        .filter(({ id, x, y }) => id === anchorId ||
          Math.abs(x - byId.get(id)!.x) > 1e-9 || Math.abs(y - byId.get(id)!.y) > 1e-9)
        .map(({ id, x, y }) => [id, { x, y }]),
    );
    const entries = Object.entries(targets);
    if (!entries.length) return;
    const from = Object.fromEntries(
      entries.map(([id]) => {
        const node = byId.get(id)!;
        return [id, { x: node.x, y: node.y }];
      }),
    ) as Record<string, Point>;
    void window.pywebview?.api
      .save_graph_layout(targets)
      .catch((reason: Error) => onError(reason.message));
    window.cancelAnimationFrame(positionAnimation.current);
    if (!motionEnabled) {
      setPositions((previous) => ({ ...previous, ...targets }));
      return;
    }
    const startedAt = performance.now();
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 280);
      const eased = 1 - (1 - progress) ** 3;
      setPositions((previous) => ({
        ...previous,
        ...Object.fromEntries(
          entries.map(([id]) => {
            const origin = from[id];
            const target = targets[id];
            return [
              id,
              {
                x: origin.x + (target.x - origin.x) * eased,
                y: origin.y + (target.y - origin.y) * eased,
              },
            ];
          }),
        ),
      }));
      if (progress === 1) {
        return;
      }
      positionAnimation.current = window.requestAnimationFrame(animate);
    };
    positionAnimation.current = window.requestAnimationFrame(animate);
  };

  const focusNode = (node: GraphNode) => {
    const nextId = centeredNodeId === node.id ? "" : node.id;
    const targets: Record<string, Point> = {};
    if (nextId) {
      targets[nextId] = { x: center.x / WIDTH, y: center.y / HEIGHT };
      const visibleIds = new Set(visibleGraph.nodes.map((item) => item.id));
      const others = baseNodes.filter(({ id }) => id !== nextId && visibleIds.has(id));
      for (const { id, x, y } of separateGraphNodes([{ ...node, ...targets[nextId] }, ...others], WIDTH, HEIGHT)) {
        targets[id] = { x, y };
      }
    }
    setCenteredNodeId(nextId);
    animateFocus(targets);
  };

  const updateFocus = (next: Record<string, Point>) => {
    displayedFocus.current = next;
    setFocusPositions(next);
  };

  const resetFocus = () => {
    window.cancelAnimationFrame(positionAnimation.current);
    window.clearTimeout(clickTimer.current);
    setCenteredNodeId("");
    updateFocus({});
  };

  const animateFocus = (targets: Record<string, Point>) => {
    window.cancelAnimationFrame(positionAnimation.current);
    if (!motionEnabled) {
      updateFocus(targets);
      return;
    }
    const current = displayedFocus.current;
    const moves = baseNodes
      .filter(({ id }) => current[id] || targets[id])
      .map((node) => ({
        id: node.id,
        from: current[node.id] ?? node,
        to: targets[node.id] ?? node,
      }));
    const startedAt = performance.now();
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 390);
      if (progress === 1) {
        updateFocus(targets);
        return;
      }
      const eased = 1 - (1 - progress) ** 3;
      updateFocus(Object.fromEntries(moves.map(({ id, from, to }) => [
        id, { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased },
      ])));
      positionAnimation.current = window.requestAnimationFrame(animate);
    };
    positionAnimation.current = window.requestAnimationFrame(animate);
  };

  const handleNodeClick = (node: GraphNode) => {
    if (suppressClick.current === node.id) {
      suppressClick.current = "";
      return;
    }
    window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => focusNode(node), 230);
  };

  const openNode = (nodeId: string) => {
    resetFocus();
    setFilterOpen(false);
    setNodeMenu(null);
    onRelatedGraph(nodeId);
  };

  const zoomBy = (amount: number) => {
    cameraAnimation.current?.stop();
    setCamera((current) => ({ ...current, zoom: clampZoom(current.zoom + amount) }));
  };

  const fit = (smooth = true) => {
    resetFocus();
    cameraAnimation.current?.stop();
    if (!visibleNodeIds.size || !viewScale) return;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const node of baseNodes) {
      if (!visibleNodeIds.has(node.id)) continue;
      const radius = nodeRadius(node.name) * HOVER_SCALE + 24;
      const halfHeight = NODE_HALF_HEIGHT * HOVER_SCALE + 24;
      left = Math.min(left, node.x * WIDTH - radius);
      right = Math.max(right, node.x * WIDTH + radius);
      top = Math.min(top, node.y * HEIGHT - halfHeight);
      bottom = Math.max(bottom, node.y * HEIGHT + halfHeight);
    }
    const fitScale = Math.min(viewport.width / (right - left), viewport.height / (bottom - top));
    const target = {
      center: { x: (left + right) / 2, y: (top + bottom) / 2 },
      zoom: clampZoom(fitScale / viewScale),
    };
    if (!motionEnabled || !smooth) {
      setCamera(target);
      return;
    }
    cameraAnimation.current = animate(0, 1, {
      duration: 0.26,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (progress) => setCamera({
        center: {
          x: center.x + (target.center.x - center.x) * progress,
          y: center.y + (target.center.y - center.y) * progress,
        },
        zoom: zoom + (target.zoom - zoom) * progress,
      }),
    });
  };

  const fitScope = useMemo(() => JSON.stringify([relatedEntityId, [...visibleNodeIds].sort()]),
    [relatedEntityId, visibleNodeIds]);
  const lastFitScope = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!viewScale || lastFitScope.current === fitScope) return;
    if (!visibleNodeIds.size) {
      cameraAnimation.current?.stop();
      if (lastFitScope.current !== null) lastFitScope.current = fitScope;
      return;
    }
    const smooth = lastFitScope.current !== null;
    lastFitScope.current = fitScope;
    fit(smooth);
  });

  const changeHops = (distance: number) => {
    const next = Math.max(0, Math.min(distance, maxHops));
    setHopValue({ centerId: relatedEntityId, text: String(next), distance: next });
  };

  const stats = language === "en"
    ? `${plural(visibleGraph.nodes.length, "node")} · ${plural(visibleGraph.edges.length, "relationship")}`
    : `${visibleGraph.nodes.length} 实体 · ${visibleGraph.edges.length} 关系`;
  const title = relatedEntityId
    ? `${centerEntity?.name ?? t("词条")} · ${t("局部图谱")}`
    : t("关系网");

  const changeFilters = (ids: string[]) => {
    resetFocus();
    onFilterChange(ids);
  };

  const openNodeMenu = (event: React.MouseEvent, node: GraphNode) => {
    event.preventDefault();
    event.stopPropagation();
    setNodeMenu({
      id: node.id,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 196)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 88)),
    });
  };

  return (
    <div className="graph-page">
      <header className="graph-toolbar">
        <div className="graph-heading">
          <button type="button" className="graph-control graph-icon-button"
            title={t(sidebarOpen ? "收起侧栏" : "展开侧栏")}
            aria-label={t(sidebarOpen ? "收起侧栏" : "展开侧栏")}
            aria-expanded={sidebarOpen} onClick={onToggleSidebar}>
            {sidebarOpen ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
          </button>
          {centerEntity && <span className="entity-dot" style={{ background: centerEntity.color }} />}
          <h1 title={title}>
            {relatedEntityId ? (
              <>
                {centerEntity?.name ?? t("词条")}
                <span className="graph-heading-mode"> · {t("局部图谱")}</span>
              </>
            ) : title}
          </h1>
        </div>

        <div className="graph-toolbar-actions">
          <div className="graph-stats graph-tool-group" title={stats} aria-label={stats} role="group">
            <span className="graph-stats-text">{stats}</span>
            <span className="graph-stats-icons" aria-hidden="true">
              <Circle size={10} /> {visibleGraph.nodes.length}
              <Link2 size={12} /> {visibleGraph.edges.length}
            </span>
            <span className="graph-stats-counts" aria-hidden="true">
              {visibleGraph.nodes.length} · {visibleGraph.edges.length}
            </span>
          </div>

          <div className="graph-types graph-tool-group">
            <Dropdown multiple label={t("按词条类型筛选")} placeholder={t("全部类型")}
              clearLabel={t("清除类型筛选")}
              value={typeFilters}
              options={types.map((type) => ({ value: type.id, label: displayTypeName(language, type) }))}
              onChange={(ids) => setTypeSelection({ centerId: relatedEntityId, ids })}
            />
            {!lockedCenter && (
              <div className="graph-filter-wrap" ref={filterControl}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setFilterOpen(false);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.stopPropagation();
                  setFilterOpen(false);
                  filterTrigger.current?.focus();
                }}>
                <button ref={filterTrigger} type="button"
                  className={`graph-control graph-icon-button${selectedIds.length ? " is-active" : ""}`}
                  title={t("筛选关系网词条")} aria-label={t("筛选关系网词条")}
                  aria-expanded={filterOpen} onClick={() => setFilterOpen((open) => !open)}>
                  <Search size={14} />
                </button>
                {filterOpen && (
                  <div className="graph-filter-menu glass-menu">
                    <div className="graph-filter-input">
                      <Search size={14} />
                      <input autoFocus value={filterQuery}
                        aria-label={t("筛选关系网词条")} placeholder={t("搜索并筛选词条")}
                        onChange={(event) => setFilterQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && filterOptions[0]) {
                            event.preventDefault();
                            changeFilters([...selectedIds, filterOptions[0].id]);
                            setFilterQuery("");
                          }
                        }}
                      />
                      {selectedIds.length > 0 && (
                        <button type="button" className="graph-filter-clear"
                          title={t("清除全部筛选")} aria-label={t("清除全部筛选")}
                          onClick={() => changeFilters([])}>
                          <X size={13} />
                        </button>
                      )}
                    </div>
                    {selectedIds.length > 0 && (
                      <div className="graph-filter-chips">
                        {entities.filter(({ id }) => selectedIds.includes(id)).map((entity) => {
                          const removeLabel = t("移除 {name} 筛选").replace("{name}", () => entity.name);
                          return (
                            <span className="graph-filter-chip" key={entity.id}>
                              {entity.name}
                              <button type="button" title={removeLabel} aria-label={removeLabel}
                                onClick={() => {
                                  changeFilters(selectedIds.filter((id) => id !== entity.id));
                                  filterControl.current?.querySelector("input")?.focus();
                                }}>
                                <X size={11} />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {filterOptions.slice(0, 8).map((entity) => (
                      <button type="button" className="graph-filter-result" key={entity.id}
                        onClick={() => {
                          changeFilters([...selectedIds, entity.id]);
                          setFilterQuery("");
                          filterControl.current?.querySelector("input")?.focus();
                        }}>
                        <span className="entity-dot" style={{ background: entity.color }} />
                        <span>{entity.name}</span>
                      </button>
                    ))}
                    {!filterOptions.length && <p role="status">{t("没有匹配的词条")}</p>}
                  </div>
                )}
              </div>
            )}
          </div>

          {relatedEntityId && (
            <div className="graph-local-controls graph-tool-group">
              <label className="graph-hop-label" htmlFor={hopInputId}>{t("跳数")}</label>
              <div className="graph-hop-control graph-control">
                <button type="button" title={t("减少跳数")} aria-label={t("减少跳数")}
                  disabled={hops === 0} onClick={() => changeHops(hops - 1)}>
                  <Minus size={13} />
                </button>
                <input id={hopInputId} type="number" min={0} max={maxHops} step={1} value={hopInput}
                  aria-invalid={Boolean(hopInput) && !/^\d+$/.test(hopInput)}
                  onChange={(event) => {
                    const text = event.target.value;
                    setHopValue({
                      centerId: relatedEntityId,
                      text,
                      distance: /^\d+$/.test(text) ? Math.min(Number(text), maxHops) : hops,
                    });
                  }}
                  onBlur={() => changeHops(hops)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      changeHops(hops);
                    }
                  }}
                />
                <button type="button" title={t("增加跳数")} aria-label={t("增加跳数")}
                  disabled={hops === maxHops} onClick={() => changeHops(hops + 1)}>
                  <Plus size={13} />
                </button>
              </div>
              <button type="button" className="graph-control graph-hop-max"
                aria-pressed={hops === maxHops}
                title={t("全部连通")} onClick={() => changeHops(maxHops)}>
                {t("最大")} ({maxHops})
              </button>
              <button type="button" className="graph-control graph-full-button"
                title={t("返回完整图谱")} aria-label={t("返回完整图谱")}
                onClick={() => {
                  setHopValue(null);
                  setTypeSelection({ centerId: "", ids: EMPTY_TYPES });
                  setFilterQuery("");
                  setFilterOpen(false);
                  onShowFullGraph();
                }}>
                <ArrowLeft size={14} />
                <span>{t("返回完整图谱")}</span>
              </button>
            </div>
          )}

          <div className="graph-zoom-controls graph-tool-group" role="group"
            title={`${t("缩放比例")} ${percent.format(zoom)}`}>
            <button type="button" className="graph-control graph-icon-button"
              title={t("缩小")} aria-label={t("缩小")} disabled={zoom <= MIN_ZOOM}
              onClick={() => zoomBy(-0.12)}>
              <ZoomOut size={15} />
            </button>
            <output className="graph-zoom-level" title={t("缩放比例")} aria-label={t("缩放比例")}>
              {percent.format(zoom)}
            </output>
            <button type="button" className="graph-control graph-icon-button"
              title={t("放大")} aria-label={t("放大")} disabled={zoom >= MAX_ZOOM}
              onClick={() => zoomBy(0.12)}>
              <ZoomIn size={15} />
            </button>
            <button type="button" className="graph-control graph-icon-button"
              title={t("适配视图")} aria-label={t("适配视图")}
              disabled={!visibleNodeIds.size} onClick={() => fit()}>
              <Maximize2 size={15} />
            </button>
          </div>
        </div>
      </header>
      <div className={`graph-canvas-wrap${panning ? " is-panning" : ""}`} ref={canvas}
        onPointerDown={startPan}
        onPointerMove={(event) => { movePan(event); moveNode(event); }}
        onPointerUp={() => { finishPan(); finishDrag(); }}
        onLostPointerCapture={() => { finishPan(); finishDrag(); }}
        onPointerCancel={() => { finishPan(); finishDrag(); }}>
        <div className="graph-viewport">
        {visibleGraph.nodes.length && worldScale ? (
          <>
          <svg
            className="graph-canvas"
            viewBox={`${viewLeft} ${viewTop} ${viewport.width / worldScale} ${viewport.height / worldScale}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <g>
              <defs>
                {/* Cut the edges out below the glass while keeping the canvas visible. */}
                <mask
                  id={lineMaskId}
                  maskUnits="userSpaceOnUse"
                  maskContentUnits="userSpaceOnUse"
                  x={extent.left}
                  y={extent.top}
                  width={extent.width}
                  height={extent.height}
                >
                  <rect x={extent.left} y={extent.top} width={extent.width} height={extent.height} fill="white" />
                  {visibleGraph.nodes.map((node) => (
                    <g key={node.id} transform={`translate(${node.x * WIDTH} ${node.y * HEIGHT})`}>
                      <ellipse
                        rx={nodeRadius(node.name)}
                        ry={NODE_HALF_HEIGHT}
                        fill="black"
                      />
                    </g>
                  ))}
                </mask>
              </defs>
              <g mask={`url(#${lineMaskId})`}>
                <AnimatePresence initial={false}>
                  {visibleGraph.edges.map(({ edge, source, target }) => (
                    <motion.g
                      key={edge.id}
                      className="graph-edge"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.17 }}
                    >
                      <line
                        x1={source.x * WIDTH}
                        y1={source.y * HEIGHT}
                        x2={target.x * WIDTH}
                        y2={target.y * HEIGHT}
                      />
                      <text
                        x={((source.x + target.x) * WIDTH) / 2}
                        y={((source.y + target.y) * HEIGHT) / 2 - 7}
                      >
                        {edge.label}
                      </text>
                    </motion.g>
                  ))}
                </AnimatePresence>
              </g>
            </g>
          </svg>
          <div className="graph-node-layer" role="group"
            aria-label={t(relatedEntityId ? "词条关联图谱" : "词条关系网")}>
              <AnimatePresence initial={false}>
                {[...visibleGraph.nodes].sort((left, right) =>
                  Number(left.id === centeredNodeId) - Number(right.id === centeredNodeId),
                ).map((node) => (
                <motion.button
                  key={node.id}
                  type="button"
                  className="graph-node graph-node-glass"
                  data-node-id={node.id}
                  {...glassFade}
                  whileHover={motionEnabled ? { scale: HOVER_SCALE } : undefined}
                  transition={{ duration: 0.17 }}
                  aria-label={t("{name}，单击居中，双击查看局部图谱").replace("{name}", () => node.name)}
                  aria-pressed={node.id === centeredNodeId}
                  style={{
                    "--node-color": entityColors.get(node.id) ?? node.color,
                    "--graph-scale": worldScale,
                    left: (node.x * WIDTH - viewLeft - nodeRadius(node.name)) * worldScale,
                    top: (node.y * HEIGHT - viewTop - NODE_HALF_HEIGHT) * worldScale,
                    width: 2 * nodeRadius(node.name) * worldScale,
                    height: 2 * NODE_HALF_HEIGHT * worldScale,
                  } as CSSProperties}
                  onPointerDown={(event) => {
                    cameraAnimation.current?.stop();
                    if (event.button !== 0 || !writable || !worldScale) return;
                    drag.current = {
                      id: node.id,
                      x: event.clientX,
                      y: event.clientY,
                      worldX: node.x,
                      worldY: node.y,
                      scale: worldScale,
                      moved: false,
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onClick={() => handleNodeClick(node)}
                  onDoubleClick={() => openNode(node.id)}
                  onContextMenu={(event) => openNodeMenu(event, node)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openNode(node.id);
                    }
                  }}
                >
                  <span className="graph-node-copy">
                    <span className="graph-node-name">{node.name}</span>
                    <span className="graph-node-type">
                      {typeNames.get(node.type_id) ?? t("词条")}
                    </span>
                  </span>
                </motion.button>
              ))}
              </AnimatePresence>
          </div>
          </>
        ) : (
          <div className="empty-view graph-empty">
            <Network size={22} />
            <strong>{t(relatedEntityId ? "关联图谱暂无节点" : "关系网暂无节点")}</strong>
          </div>
        )}
        </div>
      </div>
      <AnimatePresence>
        {nodeMenu && (
          <motion.div
            className="context-menu glass-menu graph-node-menu"
            role="menu"
            style={{ left: nodeMenu.x, top: nodeMenu.y }}
            {...glassSlide(3)}
            transition={{ duration: 0.14 }}
            onPointerDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button
              role="menuitem"
              onClick={() => openNode(nodeMenu.id)}
            >
              <Network size={14} />
              {t("显示关联图谱")}
            </button>
            <button role="menuitem" onClick={() => {
              resetFocus();
              setNodeMenu(null);
              onSelect(nodeMenu.id);
            }}>
              <BookOpen size={14} />
              {t("打开词条")}
            </button>
            <button
              className="danger-menu-item"
              role="menuitem"
              disabled={!writable}
              onClick={() => {
                const node = nodes.find((item) => item.id === nodeMenu.id);
                setNodeMenu(null);
                if (node) onDelete(node.id, node.name);
              }}
            >
              <Trash2 size={14} />
              {t("删除词条")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
