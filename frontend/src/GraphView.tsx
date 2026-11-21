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

const WIDTH = 1000;
const HEIGHT = 700;
type NodeMenu = { id: string; x: number; y: number } | null;
type Point = { x: number; y: number };

const nodeRadius = (name: string) => Math.max(72, Math.min(96, name.length * 8 + 36));

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
  onFilterChange,
  motionEnabled,
  onSelect,
  onDelete,
}: {
  graph: GraphData;
  types: EntityType[];
  entities: EntitySummary[];
  selectedIds: string[];
  onFilterChange: (ids: string[]) => void;
  motionEnabled: boolean;
  onSelect: (entityId: string) => void;
  onDelete: (entityId: string, name: string) => void;
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
  const displayedFocus = useRef<Record<string, Point>>({});
  const positionAnimation = useRef(0);
  const scene = useRef<SVGGElement>(null);
  const lineMaskId = useId();
  const baseNodes = useMemo(
    () => graph.nodes.map((node) => ({ ...node, ...positions[node.id] })),
    [graph.nodes, positions],
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

  useEffect(
    () => () => {
      window.clearTimeout(clickTimer.current);
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
  };

  const finishDrag = () => {
    if (drag.current?.moved) suppressClick.current = drag.current.id;
    drag.current = null;
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
    setZoom((current) => Math.max(0.65, Math.min(1.6, current + amount)));

  const fit = () => {
    setZoom(1);
    resetFocus();
    setPositions({});
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
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 70)),
    });
  };

  return (
    <div className="graph-page">
      <header className="view-header">
        <div>
          <span className="section-kicker">实体与关系</span>
          <h1>关系图谱</h1>
        </div>
        <div className="graph-filter-wrap">
          <div className="graph-filter-input">
            <Search size={14} />
            <input
              value={filterQuery}
              aria-label="筛选关系图谱词条"
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
          <button className="icon-button" title="适配图谱" onClick={fit}>
            <Maximize2 size={15} />
          </button>
        </div>
      </header>
      {visibleGraph.nodes.length ? (
        <div className="graph-canvas-wrap">
          <svg
            className="graph-canvas"
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="group"
            aria-label="词条关系图谱"
            onPointerMove={moveNode}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          >
            <motion.g
              ref={scene}
              style={{ transformBox: "view-box", transformOrigin: "center" }}
              animate={{ scale: zoom }}
              transition={{ type: "spring", stiffness: 240, damping: 30 }}
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
                        ry={36}
                        fill="black"
                      />
                    </g>
                  ))}
                </mask>
              </defs>
              <g mask={`url(#${lineMaskId})`}>
                {visibleGraph.edges.map(({ edge, source, target }) => (
                  <g key={edge.id} className="graph-edge">
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
                  </g>
                ))}
              </g>
              {[...visibleGraph.nodes].sort((left, right) =>
                Number(left.id === centeredNodeId) - Number(right.id === centeredNodeId),
              ).map((node) => (
                <g
                  key={node.id}
                  className="graph-node"
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.name}，单击居中，双击打开`}
                  aria-pressed={node.id === centeredNodeId}
                  transform={`translate(${node.x * WIDTH} ${node.y * HEIGHT})`}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
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
                    <foreignObject x={-nodeRadius(node.name)} y={-36}
                      width={2 * nodeRadius(node.name)} height={72}>
                      <div className="graph-node-glass"
                        style={{ "--node-color": node.color } as CSSProperties} />
                    </foreignObject>
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
                </g>
              ))}
            </motion.g>
          </svg>
        </div>
      ) : (
        <div className="empty-view">
          <Network size={22} />
          <strong>关系图谱尚无节点</strong>
          <span>创建词条并建立关联后，图谱会在这里展开。</span>
        </div>
      )}
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
              className="danger-menu-item"
              role="menuitem"
              onClick={() => {
                const node = nodes.find((item) => item.id === nodeMenu.id);
                setNodeMenu(null);
                if (node) onDelete(node.id, node.name);
              }}
            >
              <Trash2 size={14} />
              删除节点
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
