import { AnimatePresence, motion } from "framer-motion";
import {
  Maximize2,
  Network,
  Search,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type CSSProperties,
} from "react";
import type { EntitySummary, EntityType, GraphData, GraphNode } from "./api";
import { initializeGraphLayout, NODE_HALF_HEIGHT, nodeRadius } from "./graphLayout";

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.2;
const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
type NodeMenu = { id: string; x: number; y: number } | null;
type Point = { x: number; y: number };

function floatStyle(node: GraphNode, enabled: boolean): CSSProperties | undefined {
  if (!enabled) return;
  const seed = Number.parseInt(node.id.slice(0, 4), 16) || 0;
  return {
    "--float-duration": `${8 + (seed % 31) / 5}s`,
    "--float-delay": `-${(seed % 97) / 10}s`,
  } as CSSProperties;
}

export default function GraphView({
  graph,
  types,
  entities,
  selectedIds,
  relatedEntityId,
  onFilterChange,
  onRelatedGraph,
  motionEnabled,
  writable,
  onSelect,
  onDelete,
  onError,
}: {
  graph: GraphData;
  types: EntityType[];
  entities: EntitySummary[];
  selectedIds: string[];
  relatedEntityId: string;
  onFilterChange: (ids: string[]) => void;
  onRelatedGraph: (id: string) => void;
  motionEnabled: boolean;
  writable: boolean;
  onSelect: (entityId: string) => void;
  onDelete: (entityId: string, name: string) => void;
  onError: (message: string) => void;
}) {
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [zoom, setZoom] = useState(1);
  const [centeredNodeId, setCenteredNodeId] = useState("");
  const [focusPositions, setFocusPositions] = useState<Record<string, Point>>({});
  const [nodeMenu, setNodeMenu] = useState<NodeMenu>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef("");
  const clickTimer = useRef<number | undefined>(undefined);
  const dragHoldTimer = useRef<number | undefined>(undefined);
  const displayedFocus = useRef<Record<string, Point>>({});
  const positionAnimation = useRef(0);
  const canvas = useRef<HTMLDivElement>(null);
  const scene = useRef<SVGGElement>(null);
  const lineMaskId = useId();
  const { nodes: initialNodes, width: WIDTH, height: HEIGHT } = useMemo(
    () => initializeGraphLayout(graph.nodes),
    [graph.nodes],
  );
  const baseNodes = useMemo(
    () => initialNodes.map((node) => ({ ...node, ...positions[node.id] })),
    [initialNodes, positions],
  );
  const nodes = useMemo(
    () => baseNodes.map((node) => ({ ...node, ...focusPositions[node.id] })),
    [baseNodes, focusPositions],
  );
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
  const visibleGraph = useMemo(() => {
    if (!selectedIds.length) return { nodes, edges };
    const selected = new Set(selectedIds);
    const visible = new Set(selectedIds);
    for (const { edge } of edges) {
      if (selected.has(edge.source_id)) visible.add(edge.target_id);
      if (selected.has(edge.target_id)) visible.add(edge.source_id);
    }
    return {
      nodes: nodes.filter((node) => visible.has(node.id)),
      edges: edges.filter(
        ({ edge }) =>
          visible.has(edge.source_id) &&
          visible.has(edge.target_id) &&
          (selected.has(edge.source_id) || selected.has(edge.target_id)),
      ),
    };
  }, [edges, nodes, selectedIds]);
  const filterOptions = entities.filter(
    (entity) =>
      !selectedIds.includes(entity.id) &&
      (!filterQuery.trim() ||
        `${entity.name} ${entity.summary}`
          .toLocaleLowerCase()
          .includes(filterQuery.trim().toLocaleLowerCase())),
  );
  const visibleGraphRef = useRef(visibleGraph);
  visibleGraphRef.current = visibleGraph;

  useEffect(
    () => () => {
      window.clearTimeout(clickTimer.current);
      window.clearTimeout(dragHoldTimer.current);
      window.cancelAnimationFrame(positionAnimation.current);
    },
    [],
  );

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
      setZoom((current) => clampZoom(current * factor));
    };
    element.addEventListener("wheel", zoomFromWheel, { passive: false });
    return () => element.removeEventListener("wheel", zoomFromWheel);
  }, []);

  const moveNode = (event: PointerEvent<SVGSVGElement>) => {
    const current = drag.current;
    const matrix = scene.current?.getScreenCTM();
    if (!current || !matrix) return;
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
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    setPositions((previous) => ({
      ...previous,
      [current.id]: {
        x: Math.max(0.05, Math.min(0.95, point.x / WIDTH)),
        y: Math.max(0.05, Math.min(0.9, point.y / HEIGHT)),
      },
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
    const currentNodes = visibleGraphRef.current.nodes;
    const points = new Map(
      currentNodes.map((node) => [node.id, { x: node.x * WIDTH, y: node.y * HEIGHT }]),
    );
    const byId = new Map(currentNodes.map((node) => [node.id, node]));
    const clamp = (node: GraphNode, point: Point) => ({
      x: Math.max(nodeRadius(node.name) + 12, Math.min(WIDTH - nodeRadius(node.name) - 12, point.x)),
      y: Math.max(48, Math.min(HEIGHT - 48, point.y)),
    });

    for (let pass = 0; pass < 8; pass += 1) {
      let moved = false;
      for (let leftIndex = 0; leftIndex < currentNodes.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < currentNodes.length; rightIndex += 1) {
          const left = currentNodes[leftIndex];
          const right = currentNodes[rightIndex];
          const leftPoint = points.get(left.id)!;
          const rightPoint = points.get(right.id)!;
          const requiredX = nodeRadius(left.name) + nodeRadius(right.name) + 14;
          const requiredY = 86;
          let dx = rightPoint.x - leftPoint.x;
          let dy = rightPoint.y - leftPoint.y;
          let nx = dx / requiredX;
          let ny = dy / requiredY;
          let distance = Math.hypot(nx, ny);
          if (distance >= 1) continue;
          if (distance < 0.001) {
            const seed = Number.parseInt(right.id.slice(0, 4), 16) || rightIndex;
            const angle = seed * 2.399963;
            nx = Math.cos(angle);
            ny = Math.sin(angle);
            distance = 0;
          }
          const push = 1 - distance + 0.06;
          const target = right.id === anchorId ? left : right;
          const direction = target.id === right.id ? 1 : -1;
          const targetPoint = points.get(target.id)!;
          const next = clamp(target, {
            x: targetPoint.x + direction * nx * requiredX * push,
            y: targetPoint.y + direction * ny * requiredY * push,
          });
          if (Math.hypot(next.x - targetPoint.x, next.y - targetPoint.y) > 0.5) {
            points.set(target.id, next);
            moved = true;
          }
        }
      }
      if (!moved) break;
    }

    const targets = Object.fromEntries(
      [...points.entries()]
        .filter(([id, point]) => {
          const current = byId.get(id)!;
          return (
            id === anchorId ||
            Math.hypot(
              point.x / WIDTH - current.x,
              point.y / HEIGHT - current.y,
            ) > 0.0005
          );
        })
        .map(([id, point]) => [id, { x: point.x / WIDTH, y: point.y / HEIGHT }]),
    ) as Record<string, Point>;
    const entries = Object.entries(targets);
    if (!entries.length) return;
    const from = Object.fromEntries(
      entries.map(([id]) => {
        const node = byId.get(id)!;
        return [id, { x: node.x, y: node.y }];
      }),
    ) as Record<string, Point>;
    const persist = () => {
      setPositions((previous) => ({ ...previous, ...targets }));
      void window.pywebview?.api
        .save_graph_layout(targets)
        .catch((reason: Error) => onError(reason.message));
    };
    window.cancelAnimationFrame(positionAnimation.current);
    if (!motionEnabled) {
      persist();
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
        persist();
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
      targets[nextId] = { x: 0.5, y: 0.5 };
      const visibleIds = new Set(visibleGraph.nodes.map((item) => item.id));
      for (const [index, neighbor] of baseNodes.entries()) {
        if (neighbor.id === nextId || !visibleIds.has(neighbor.id)) continue;
        const clearanceX = nodeRadius(node.name) + nodeRadius(neighbor.name) + 20;
        const clearanceY = 100;
        const dx = (neighbor.x - 0.5) * WIDTH / clearanceX;
        const dy = (neighbor.y - 0.5) * HEIGHT / clearanceY;
        const distance = Math.hypot(dx, dy);
        const angle = distance > 0.001 ? Math.atan2(dy, dx) : index * 2.4;
        const spread = Math.max(distance + 0.11, 1.12);
        targets[neighbor.id] = {
          x: 0.5 + Math.cos(angle) * clearanceX * spread / WIDTH,
          y: 0.5 + Math.sin(angle) * clearanceY * spread / HEIGHT,
        };
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
    window.clearTimeout(clickTimer.current);
    setNodeMenu(null);
    onSelect(nodeId);
  };

  const zoomBy = (amount: number) =>
    setZoom((current) => clampZoom(current + amount));

  const fit = () => {
    setZoom(1);
    resetFocus();
  };

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
      <header className="view-header">
        <div>
          <span className="section-kicker">实体与关系</span>
          <h1>{relatedEntityId ? "关联图谱" : "关系网"}</h1>
        </div>
        <div className="graph-filter-wrap">
          <div className="graph-filter-input">
            <Search size={14} />
            <input
              value={filterQuery}
              aria-label="筛选关系网词条"
              placeholder="搜索并筛选词条"
              onFocus={() => setFilterOpen(true)}
              onChange={(event) => {
                setFilterQuery(event.target.value);
                setFilterOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setFilterOpen(false);
                if (event.key === "Enter" && filterOptions[0]) {
                  event.preventDefault();
                  changeFilters([...selectedIds, filterOptions[0].id]);
                  setFilterQuery("");
                  setFilterOpen(false);
                }
              }}
            />
            {selectedIds.length > 0 && (
              <button
                className="graph-filter-clear"
                title="清除全部筛选"
                onClick={() => changeFilters([])}
              >
                <X size={13} />
              </button>
            )}
          </div>
          {selectedIds.length > 0 && (
            <div className="graph-filter-chips">
              {selectedIds.map((id) => {
                const entity = entities.find((item) => item.id === id);
                if (!entity) return null;
                return (
                  <span className="graph-filter-chip" key={id}>
                    {entity.name}
                    <button
                      title={`移除 ${entity.name} 筛选`}
                      onClick={() =>
                        changeFilters(selectedIds.filter((item) => item !== id))
                      }
                    >
                      <X size={11} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          {filterOpen && filterOptions.length > 0 && (
            <div className="graph-filter-menu glass-menu">
              {filterOptions.slice(0, 8).map((entity) => (
                <button
                  key={entity.id}
                  onClick={() => {
                    changeFilters([...selectedIds, entity.id]);
                    setFilterQuery("");
                    setFilterOpen(false);
                  }}
                >
                  <span className="entity-dot" style={{ background: entity.color }} />
                  <span>{entity.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="graph-controls">
          <span>
            {visibleGraph.nodes.length} 个实体 · {visibleGraph.edges.length} 条关系
          </span>
          <button
            className="icon-button"
            title="缩小"
            onClick={() => zoomBy(-0.12)}
          >
            <ZoomOut size={15} />
          </button>
          <button
            className="icon-button"
            title="放大"
            onClick={() => zoomBy(0.12)}
          >
            <ZoomIn size={15} />
          </button>
          <button className="icon-button" title="适配视图" onClick={fit}>
            <Maximize2 size={15} />
          </button>
        </div>
      </header>
      <div className="graph-canvas-wrap" ref={canvas}>
        {visibleGraph.nodes.length ? (
          <svg
            className="graph-canvas"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="group"
            aria-label={relatedEntityId ? "词条关联图谱" : "词条关系网"}
            onPointerMove={moveNode}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          >
            <motion.g
              ref={scene}
              style={{ transformBox: "view-box", transformOrigin: "center" }}
              animate={{ scale: zoom }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              <defs>
                {/* Cut the edges out below the glass while keeping the canvas visible. */}
                <mask
                  id={lineMaskId}
                  maskUnits="userSpaceOnUse"
                  x={-WIDTH}
                  y={-HEIGHT}
                  width={3 * WIDTH}
                  height={3 * HEIGHT}
                >
                  <rect x={-WIDTH} y={-HEIGHT} width={3 * WIDTH} height={3 * HEIGHT} fill="white" />
                  {visibleGraph.nodes.map((node) => (
                    <g key={node.id} transform={`translate(${node.x * WIDTH} ${node.y * HEIGHT})`}>
                      <ellipse
                        className="graph-node-drift"
                        style={floatStyle(node, motionEnabled && node.id !== centeredNodeId)}
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
              <AnimatePresence initial={false}>
                {[...visibleGraph.nodes].sort((left, right) =>
                  Number(left.id === centeredNodeId) - Number(right.id === centeredNodeId),
                ).map((node) => (
                <motion.g
                  key={node.id}
                  className="graph-node"
                  role="button"
                  tabIndex={0}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.17 }}
                  aria-label={`${node.name}，单击居中，双击打开`}
                  aria-pressed={node.id === centeredNodeId}
                  style={{ "--node-color": node.color } as CSSProperties}
                  transform={`translate(${node.x * WIDTH} ${node.y * HEIGHT})`}
                  onPointerDown={(event) => {
                    if (event.button !== 0 || !writable) return;
                    drag.current = {
                      id: node.id,
                      x: event.clientX,
                      y: event.clientY,
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
                  <g className="graph-node-drift"
                    style={floatStyle(node, motionEnabled && node.id !== centeredNodeId)}>
                    <foreignObject x={-nodeRadius(node.name)} y={-NODE_HALF_HEIGHT}
                      width={2 * nodeRadius(node.name)} height={2 * NODE_HALF_HEIGHT}>
                      <div className="graph-node-glass" />
                    </foreignObject>
                    <ellipse
                      className="graph-node-outline"
                      rx={nodeRadius(node.name)}
                      ry={NODE_HALF_HEIGHT}
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle
                      className="graph-node-indicator"
                      cx="-49"
                      r="4"
                      fill={node.color}
                    />
                    <text className="graph-node-name" y="-1">
                      {node.name.length > 18
                        ? `${node.name.slice(0, 18)}…`
                        : node.name}
                    </text>
                    <text className="graph-node-type" y="17">
                      {types.find((type) => type.id === node.type_id)?.name ??
                        "词条"}
                    </text>
                  </g>
                </motion.g>
              ))}
              </AnimatePresence>
            </motion.g>
          </svg>
        ) : (
          <div className="empty-view graph-empty">
            <Network size={22} />
            <strong>{relatedEntityId ? "关联图谱暂无节点" : "关系网暂无节点"}</strong>
          </div>
        )}
      </div>
      <AnimatePresence>
        {nodeMenu && (
          <motion.div
            className="context-menu glass-menu graph-node-menu"
            role="menu"
            style={{ left: nodeMenu.x, top: nodeMenu.y }}
            initial={{ opacity: 0, scale: 0.96, y: 3 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 2 }}
            transition={{ duration: 0.14 }}
            onPointerDown={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <button
              role="menuitem"
              onClick={() => {
                resetFocus();
                setFilterQuery("");
                setFilterOpen(false);
                setNodeMenu(null);
                onRelatedGraph(nodeMenu.id);
              }}
            >
              <Network size={14} />
              显示关联图谱
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
              删除词条
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
