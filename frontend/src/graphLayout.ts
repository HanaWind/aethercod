import type { GraphNode } from "./api";

const DEFAULT_WIDTH = 1000;
const DEFAULT_HEIGHT = 700;
export const NODE_HALF_HEIGHT = 36;
export const nodeRadius = (name: string) => Math.max(72, Math.min(96, name.length * 8 + 36));

export function initializeGraphLayout(nodes: GraphNode[]) {
  // Lay out a roomy starting grid. The viewport grows when nodes move beyond it.
  const cellWidth = 216;
  const cellHeight = 104;
  const columns = Math.max(4, Math.ceil(Math.sqrt(nodes.length * 0.7)));
  const rows = Math.max(6, Math.ceil(nodes.length / columns));
  const width = Math.max(DEFAULT_WIDTH, (columns * cellWidth) / 0.9);
  const height = Math.max(DEFAULT_HEIGHT, (rows * cellHeight) / 0.8);
  const slots = Array.from({ length: rows * columns }, (_, index) => ({
    x: width / 2 + ((index % columns) - (columns - 1) / 2) * cellWidth,
    y: height / 2 + (Math.floor(index / columns) - (rows - 1) / 2) * cellHeight,
  }));
  const ordered = [...nodes].sort((a, b) =>
    Number(Boolean(b.position_saved)) - Number(Boolean(a.position_saved)) ||
    (a.id < b.id ? -1 : Number(a.id > b.id)),
  );
  const occupied = new Map<string, { x: number; y: number; radius: number }[]>();
  const positions = new Map<string, { x: number; y: number }>();

  const isFree = (x: number, y: number, radius: number) => {
    const column = Math.floor(x / cellWidth);
    const row = Math.floor(y / cellHeight);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const bucket = occupied.get(`${column + dx},${row + dy}`);
        if (bucket?.some((node) =>
          Math.abs(x - node.x) < radius + node.radius + 24 && Math.abs(y - node.y) < cellHeight,
        )) return false;
      }
    }
    return true;
  };

  for (const node of ordered) {
    const radius = nodeRadius(node.name);
    const preferred = { x: node.x * width, y: node.y * height };
    const point = isFree(preferred.x, preferred.y, radius)
      ? preferred
      : slots.reduce<(typeof slots)[number] | undefined>((nearest, slot) => {
          if (!isFree(slot.x, slot.y, radius)) return nearest;
          const distance = (x: number, y: number) => (x - preferred.x) ** 2 + (y - preferred.y) ** 2;
          return !nearest || distance(slot.x, slot.y) < distance(nearest.x, nearest.y) ? slot : nearest;
        }, undefined);
    if (!point) break;
    const key = `${Math.floor(point.x / cellWidth)},${Math.floor(point.y / cellHeight)}`;
    const bucket = occupied.get(key) ?? [];
    bucket.push({ ...point, radius });
    occupied.set(key, bucket);
    positions.set(node.id, { x: point.x / width, y: point.y / height });
  }

  // Saved positions may collide with one another. Unplaced nodes use the open grid slots.
  if (positions.size !== nodes.length) {
    for (const node of ordered) {
      if (positions.has(node.id)) continue;
      const radius = nodeRadius(node.name);
      const slot = slots.find((point) => isFree(point.x, point.y, radius));
      if (!slot) break;
      const key = `${Math.floor(slot.x / cellWidth)},${Math.floor(slot.y / cellHeight)}`;
      const bucket = occupied.get(key) ?? [];
      bucket.push({ ...slot, radius });
      occupied.set(key, bucket);
      positions.set(node.id, { x: slot.x / width, y: slot.y / height });
    }
  }

  return { width, height, nodes: nodes.map((node) => ({ ...node, ...positions.get(node.id) })) };
}
