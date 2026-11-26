import type { GraphData, GraphNode } from "./api";

const DEFAULT_WIDTH = 1000;
const DEFAULT_HEIGHT = 700;
export const NODE_HALF_HEIGHT = 36;
export const nodeRadius = (name: string) => Math.max(72, Math.min(96, name.length * 8 + 36));
const NODE_GAP = 36;
export const HOVER_SCALE = 1.1;
const cellWidth = 2 * 96 * HOVER_SCALE + NODE_GAP;
const cellHeight = 2 * NODE_HALF_HEIGHT * HOVER_SCALE + NODE_GAP;

export function graphDistances(edges: GraphData["edges"], center: string) {
  const neighbors = new Map<string, string[]>();
  for (const { source_id, target_id } of edges) {
    const source = neighbors.get(source_id) ?? [];
    const target = neighbors.get(target_id) ?? [];
    source.push(target_id);
    target.push(source_id);
    neighbors.set(source_id, source);
    neighbors.set(target_id, target);
  }
  const distances = new Map([[center, 0]]);
  const queue = [{ id: center, distance: 0 }];
  for (let index = 0; index < queue.length; index++) {
    const { id, distance } = queue[index];
    for (const neighbor of neighbors.get(id) ?? []) {
      if (distances.has(neighbor)) continue;
      distances.set(neighbor, distance + 1);
      queue.push({ id: neighbor, distance: distance + 1 });
    }
  }
  return distances;
}

export function initializeGraphLayout(nodes: GraphNode[]) {
  // Lay out a roomy starting grid. The viewport grows when nodes move beyond it.
  const columns = Math.max(4, Math.ceil(Math.sqrt(nodes.length * 0.7)));
  const rows = Math.max(6, Math.ceil(nodes.length / columns));
  // Keep the legacy coordinate basis so existing saved positions retain their meaning.
  const width = Math.max(DEFAULT_WIDTH, (columns * 216) / 0.9);
  const height = Math.max(DEFAULT_HEIGHT, (rows * 104) / 0.8);
  const slots = Array.from({ length: rows * columns }, (_, index) => ({
    x: width / 2 + ((index % columns) - (columns - 1) / 2) * cellWidth,
    y: height / 2 + (Math.floor(index / columns) - (rows - 1) / 2) * cellHeight,
  }));
  const ordered = [...nodes].sort((a, b) =>
    Number(Boolean(b.position_saved)) - Number(Boolean(a.position_saved)) ||
    (a.id < b.id ? -1 : Number(a.id > b.id)),
  );
  return { width, height, nodes: separateGraphNodes(ordered, width, height, slots) };
}

export function separateGraphNodes(
  nodes: GraphNode[],
  width: number,
  height: number,
  slots: { x: number; y: number }[] = [],
) {
  const occupied = new Map<string, { x: number; y: number; halfWidth: number }[]>();
  const positions = new Map<string, { x: number; y: number }>();

  const isFree = (x: number, y: number, halfWidth: number) => {
    const column = Math.floor(x / cellWidth);
    const row = Math.floor(y / cellHeight);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = occupied.get(`${column + dx},${row + dy}`);
        if (bucket?.some((node) =>
          Math.abs(x - node.x) < halfWidth + node.halfWidth + NODE_GAP && Math.abs(y - node.y) < cellHeight,
        )) return false;
      }
    }
    return true;
  };

  for (const node of nodes) {
    // The glass oval contains both text lines. Reserve its full box at hover scale.
    const halfWidth = nodeRadius(node.name) * HOVER_SCALE;
    const preferred = { x: node.x * width, y: node.y * height };
    let point = isFree(preferred.x, preferred.y, halfWidth)
      ? preferred
      : slots.reduce<(typeof slots)[number] | undefined>((nearest, slot) => {
          if (!isFree(slot.x, slot.y, halfWidth)) return nearest;
          const distance = (x: number, y: number) => (x - preferred.x) ** 2 + (y - preferred.y) ** 2;
          return !nearest || distance(slot.x, slot.y) < distance(nearest.x, nearest.y) ? slot : nearest;
        }, undefined);
    // Every finite collection has a free cell on an unbounded grid.
    for (let ring = 1; !point; ring++) {
      for (let offset = -ring; offset <= ring && !point; offset++) {
        const candidates = [
          { x: preferred.x + offset * cellWidth, y: preferred.y - ring * cellHeight },
          { x: preferred.x + offset * cellWidth, y: preferred.y + ring * cellHeight },
          { x: preferred.x - ring * cellWidth, y: preferred.y + offset * cellHeight },
          { x: preferred.x + ring * cellWidth, y: preferred.y + offset * cellHeight },
        ];
        point = candidates.find(({ x, y }) => isFree(x, y, halfWidth));
      }
    }
    const key = `${Math.floor(point.x / cellWidth)},${Math.floor(point.y / cellHeight)}`;
    const bucket = occupied.get(key) ?? [];
    bucket.push({ ...point, halfWidth });
    occupied.set(key, bucket);
    positions.set(node.id, { x: point.x / width, y: point.y / height });
  }

  return nodes.map((node) => ({ ...node, ...positions.get(node.id) }));
}
