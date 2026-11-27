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

export function degreeById(nodes: GraphNode[], edges: GraphData["edges"]) {
  const degree = new Map(nodes.map(({ id }) => [id, 0]));
  for (const edge of edges) {
    degree.set(edge.source_id, (degree.get(edge.source_id) ?? 0) + 1);
    degree.set(edge.target_id, (degree.get(edge.target_id) ?? 0) + 1);
  }
  return degree;
}

export function layoutLocalSectors(nodes: GraphNode[], edges: GraphData["edges"], centerId: string) {
  const distances = graphDistances(edges, centerId);
  const neighbors = new Map<string, string[]>();
  for (const { source_id, target_id } of edges) {
    neighbors.set(source_id, [...(neighbors.get(source_id) ?? []), target_id]);
    neighbors.set(target_id, [...(neighbors.get(target_id) ?? []), source_id]);
  }
  const ordered = [...nodes].sort((a, b) => a.type_id.localeCompare(b.type_id) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const levels = new Map<number, GraphNode[]>();
  for (const node of ordered) {
    const distance = distances.get(node.id);
    if (distance === undefined || distance === 0) continue;
    const level = levels.get(distance) ?? [];
    level.push(node);
    levels.set(distance, level);
  }
  const positions = new Map<string, { x: number; y: number }>([[centerId, { x: 0, y: 0 }]]);
  const centers = new Map<string, number>([[centerId, -Math.PI / 2]]);
  let previousRadius = 0;
  const maximumLevel = Math.max(0, ...levels.keys());
  for (let distance = 1; distance <= maximumLevel; distance++) {
    const ring = levels.get(distance) ?? [];
    if (!ring.length) continue;
    const radius = previousRadius + Math.max(430, ring.length * 260 / (Math.PI * 2));
    const sectors = new Map<number, GraphNode[]>();
    for (const node of ring) {
      const parentAngles = (neighbors.get(node.id) ?? [])
        .filter((id) => distances.get(id) === distance - 1)
        .map((id) => centers.get(id))
        .filter((angle): angle is number => angle !== undefined);
      const parentAngle = parentAngles.length
        ? Math.atan2(parentAngles.reduce((sum, angle) => sum + Math.sin(angle), 0), parentAngles.reduce((sum, angle) => sum + Math.cos(angle), 0))
        : -Math.PI / 2;
      const sector = Math.round(((parentAngle + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * Math.max(1, Math.ceil(Math.sqrt(ring.length))));
      const group = sectors.get(sector) ?? [];
      group.push(node);
      sectors.set(sector, group);
    }
    const groups = [...sectors.entries()].sort(([a], [b]) => a - b);
    const slots = groups.flatMap(([, group]) => group);
    slots.forEach((node, index) => {
      const angle = -Math.PI / 2 + index / slots.length * Math.PI * 2;
      const key = node.id;
      centers.set(key, angle);
      positions.set(key, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    });
    previousRadius = radius;
  }
  let extent = 600;
  for (const point of positions.values()) extent = Math.max(extent, Math.abs(point.x), Math.abs(point.y));
  const width = Math.max(DEFAULT_WIDTH, DEFAULT_HEIGHT, extent * 2 + 240);
  const height = width;
  return {
    width,
    height,
    nodes: nodes.map((node) => {
      const point = positions.get(node.id) ?? { x: 0, y: 0 };
      return { ...node, x: 0.5 + point.x / width, y: 0.5 + point.y / height };
    }),
  };
}

export function layoutTypeClusters(nodes: GraphNode[], edges: GraphData["edges"]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map(nodes.map(({ id }) => [id, [] as string[]]));
  for (const { source_id, target_id } of edges) {
    adjacency.get(source_id)?.push(target_id);
    adjacency.get(target_id)?.push(source_id);
  }
  const visited = new Set<string>();
  const components: GraphNode[][] = [];
  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    const queue = [node.id];
    visited.add(node.id);
    const component: GraphNode[] = [];
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index];
      const item = byId.get(current);
      if (item) component.push(item);
      for (const next of adjacency.get(current) ?? []) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    components.push(component);
  }
  components.sort((a, b) => b.length - a.length || a[0].id.localeCompare(b[0].id));
  const positions = new Map<string, PointLike>();
  const componentGap = 360;
  const columns = Math.max(1, Math.ceil(Math.sqrt(components.length)));
  const maxTypeCount = Math.max(1, ...components.map((component) => new Set(component.map(({ type_id }) => type_id)).size));
  const maxTypeSize = Math.max(1, ...components.flatMap((component) =>
    [...new Set(component.map(({ type_id }) => type_id))].map((typeId) =>
      component.filter((node) => node.type_id === typeId).length,
    ),
  ));
  const typeGrid = Math.ceil(Math.sqrt(maxTypeCount));
  const groupSide = Math.max(420, Math.ceil(Math.sqrt(maxTypeSize)) * (cellWidth + 32));
  const tileSize = Math.max(820, typeGrid * groupSide);
  components.forEach((component, componentIndex) => {
    const groups = new Map<string, GraphNode[]>();
    for (const node of component) {
      const group = groups.get(node.type_id) ?? [];
      group.push(node);
      groups.set(node.type_id, group);
    }
    const types = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
    const cell = cellWidth + 64;
    const column = componentIndex % columns;
    const row = Math.floor(componentIndex / columns);
    const originX = column * (tileSize + componentGap);
    const originY = row * (tileSize + componentGap);
    types.forEach(([, group], typeIndex) => {
      const typeColumns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(group.length))));
      const typeRows = Math.ceil(group.length / typeColumns);
      const groupColumn = typeIndex % typeGrid;
      const groupRow = Math.floor(typeIndex / typeGrid);
      const centerX = originX + groupColumn * groupSide + groupSide / 2;
      const centerY = originY + groupRow * groupSide + groupSide / 2;
      group.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      group.forEach((node, index) => positions.set(node.id, {
        x: centerX + (index % typeColumns - (typeColumns - 1) / 2) * cell,
        y: centerY + (Math.floor(index / typeColumns) - (typeRows - 1) / 2) * cellHeight * 1.8 + typeIndex * 0.01,
      }));
    });
  });
  const result = nodes.map((node) => ({ ...node, ...(positions.get(node.id) ?? { x: 0, y: 0 }) }));
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const node of result) {
    left = Math.min(left, node.x);
    right = Math.max(right, node.x);
    top = Math.min(top, node.y);
    bottom = Math.max(bottom, node.y);
  }
  const width = Math.max(1000, right - left + 2 * cellWidth);
  const height = Math.max(700, bottom - top + 2 * cellHeight);
  return { width, height, nodes: result.map((node) => ({ ...node,
    x: (node.x - (left + right) / 2) / width + 0.5,
    y: (node.y - (top + bottom) / 2) / height + 0.5,
  })) };
}

export function layoutGlobalConcentric(nodes: GraphNode[], edges: GraphData["edges"]) {
  const degrees = degreeById(nodes, edges);
  const ordered = [...nodes].sort((a, b) => a.type_id.localeCompare(b.type_id) ||
    (degrees.get(b.id) ?? 0) - (degrees.get(a.id) ?? 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const positions = new Map<string, PointLike>();
  const rings = Math.max(1, Math.ceil(Math.sqrt(ordered.length / 8)));
  let index = 0;
  for (let ring = 1; ring <= rings; ring++) {
    const count = Math.min(ordered.length - index, Math.max(8, ring * 12));
    const radius = ring * 360;
    for (let slot = 0; slot < count; slot++) {
      const angle = -Math.PI / 2 + slot / count * Math.PI * 2;
      positions.set(ordered[index++].id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    }
  }
  const width = Math.max(1400, (rings + 1) * 720);
  const height = width;
  return { width, height, nodes: nodes.map((node) => {
    const point = positions.get(node.id) ?? { x: 0, y: 0 };
    return { ...node, x: 0.5 + point.x / width, y: 0.5 + point.y / height };
  }) };
}

type PointLike = { x: number; y: number };

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
