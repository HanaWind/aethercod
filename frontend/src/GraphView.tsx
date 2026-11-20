import { Maximize2, Network, ZoomIn, ZoomOut } from "lucide-react";
import { useMemo, useRef, useState, type PointerEvent } from "react";
import type { EntityType, GraphData, GraphNode } from "./api";

const WIDTH = 1000;
const HEIGHT = 700;

export default function GraphView({
  graph,
  types,
  onSelect,
}: {
  graph: GraphData;
  types: EntityType[];
  onSelect: (entityId: string) => void;
}) {
  const [positions, setPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const scene = useRef<SVGGElement>(null);
  const [zoom, setZoom] = useState(1);
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

  const fit = () => {
    setZoom(1);
    setPositions({});
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
            onClick={() => setZoom((value) => Math.max(0.65, value - 0.12))}
          >
            <ZoomOut size={15} />
          </button>
          <button
            className="icon-button"
            title="放大"
            onClick={() => setZoom((value) => Math.min(1.6, value + 0.12))}
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
            onPointerUp={() => {
              const current = drag.current;
              drag.current = null;
              if (current && !current.moved) onSelect(current.id);
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            <g
              ref={scene}
              transform={`translate(${(WIDTH * (1 - zoom)) / 2} ${(HEIGHT * (1 - zoom)) / 2}) scale(${zoom})`}
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
                  aria-label={node.name}
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
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(node.id);
                    }
                  }}
                >
                  <circle
                    r="28"
                    fill={`${node.color}22`}
                    stroke={`${node.color}9c`}
                  />
                  <circle r="4" fill={node.color} />
                  <text className="graph-node-name" y="47">
                    {node.name.length > 14
                      ? `${node.name.slice(0, 14)}…`
                      : node.name}
                  </text>
                  <text className="graph-node-type" y="63">
                    {types.find((type) => type.id === node.type_id)?.name ??
                      "词条"}
                  </text>
                </g>
              ))}
            </g>
          </svg>
        </div>
      ) : (
        <div className="empty-view">
          <Network size={22} />
          <strong>关系图谱尚无节点</strong>
          <span>创建词条并建立关联后，图谱会在这里展开。</span>
        </div>
      )}
    </div>
  );
}
