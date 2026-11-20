import { AnimatePresence, motion } from "framer-motion";
import {
  Maximize2,
  Network,
  Trash2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import type { EntityType, GraphData, GraphNode } from "./api";

const WIDTH = 1000;
const HEIGHT = 700;
const INITIAL_VIEW = { x: WIDTH / 2, y: HEIGHT / 2, zoom: 1 };

type Viewport = typeof INITIAL_VIEW;
type NodeMenu = { id: string; x: number; y: number } | null;

export default function GraphView({
  graph,
  types,
  onSelect,
  onDelete,
}: {
  graph: GraphData;
  types: EntityType[];
  onSelect: (entityId: string) => void;
  onDelete: (entityId: string, name: string) => void;
}) {
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [viewport, setViewport] = useState<Viewport>(INITIAL_VIEW);
  const [centeredNodeId, setCenteredNodeId] = useState("");
  const [nodeMenu, setNodeMenu] = useState<NodeMenu>(null);
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef("");
  const clickTimer = useRef<number | undefined>(undefined);
  const viewportBeforeCenter = useRef<Viewport | null>(null);
  const scene = useRef<SVGGElement>(null);
  const nodes = useMemo(
    () => graph.nodes.map((node) => ({ ...node, ...positions[node.id] })),
    [graph.nodes, positions],
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

  useEffect(
    () => () => window.clearTimeout(clickTimer.current),
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
    current.moved = true;
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
    if (centeredNodeId === node.id) {
      setViewport(viewportBeforeCenter.current ?? INITIAL_VIEW);
      viewportBeforeCenter.current = null;
      setCenteredNodeId("");
      return;
    }
    if (!centeredNodeId) viewportBeforeCenter.current = viewport;
    setCenteredNodeId(node.id);
    setViewport({
      x: node.x * WIDTH,
      y: node.y * HEIGHT,
      zoom: Math.max(1.24, viewport.zoom),
    });
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
    setViewport((current) => ({
      ...current,
      zoom: Math.max(0.65, Math.min(1.6, current.zoom + amount)),
    }));

  const fit = () => {
    setViewport(INITIAL_VIEW);
    setCenteredNodeId("");
    viewportBeforeCenter.current = null;
    setPositions({});
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
        <div className="graph-controls">
          <span>
            {nodes.length} 个实体 · {edges.length} 条关系
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
      {nodes.length ? (
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
              animate={{
                x: WIDTH / 2 - viewport.x * viewport.zoom,
                y: HEIGHT / 2 - viewport.y * viewport.zoom,
                scale: viewport.zoom,
              }}
              transition={{ type: "spring", stiffness: 240, damping: 30 }}
            >
              {edges.map(({ edge, source, target }) => (
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
              {nodes.map((node) => (
                <g
                  key={node.id}
                  className="graph-node"
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.name}，单击居中，双击打开`}
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
                  <motion.g
                    animate={{ y: [0, -3, 0, 3, 0] }}
                    transition={{
                      duration: 8 + (node.id.charCodeAt(0) % 5),
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  >
                    <ellipse
                      className="graph-node-glass"
                      rx={Math.max(72, Math.min(96, node.name.length * 8 + 36))}
                      ry="36"
                      fill={`${node.color}26`}
                      stroke={`${node.color}b8`}
                      style={{
                        backdropFilter: "blur(12px)",
                        WebkitBackdropFilter: "blur(12px)",
                      }}
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
                  </motion.g>
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
