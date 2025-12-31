import { BoardData, HexTile, HexResource, ResourceType, Vertex, Edge, Port } from './types';

const HEX_SIZE = 100;
const SQRT3 = Math.sqrt(3);
const BASE_RESOURCES: ResourceType[] = ['brick', 'lumber', 'wool', 'grain', 'ore', 'gold'];
const isBaseResource = (res: HexResource): res is ResourceType => BASE_RESOURCES.includes(res as ResourceType);
const keepsNumberToken = (res: HexResource) => isBaseResource(res) || res === 'cloud' || res === 'dev';
const CLASSIC_RESOURCES: Array<ResourceType | 'desert'> = [
  'ore',
  'brick',
  'grain',
  'wool',
  'lumber',
  'wool',
  'grain',
  'brick',
  'ore',
  'desert',
  'grain',
  'ore',
  'lumber',
  'wool',
  'brick',
  'lumber',
  'grain',
  'wool',
  'lumber',
];
const CLASSIC_NUMBER_TOKENS = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];

interface Axial {
  q: number;
  r: number;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function axialToPixel({ q, r }: Axial) {
  return {
    x: HEX_SIZE * (SQRT3 * (q + r / 2)),
    y: HEX_SIZE * (1.5 * r),
  };
}

function corner(center: { x: number; y: number }, i: number) {
  const angle = (Math.PI / 180) * (60 * i - 30);
  return {
    x: center.x + HEX_SIZE * Math.cos(angle),
    y: center.y + HEX_SIZE * Math.sin(angle),
  };
}

function toKey({ x, y }: { x: number; y: number }) {
  return `${x.toFixed(4)},${y.toFixed(4)}`;
}

function coordsWithinRadius(radius: number): Axial[] {
  const coords: Axial[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      const s = -q - r;
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= radius) {
        coords.push({ q, r });
      }
    }
  }
  coords.sort((a, b) => (a.r === b.r ? a.q - b.q : a.r - b.r));
  return coords;
}

function ringCoords(radius: number): Axial[] {
  const coords: Axial[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      const s = -q - r;
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) === radius) {
        coords.push({ q, r });
      }
    }
  }
  coords.sort((a, b) => (a.r === b.r ? a.q - b.q : a.r - b.r));
  return coords;
}

export function buildBoard(): BoardData {
  // Default radius-2 (19-hex) classic board with a surrounding water ring
  const landCoords = coordsWithinRadius(2);
  const waterCoords = ringCoords(3);
  const numberTokens = [...CLASSIC_NUMBER_TOKENS];
  const hexes: HexTile[] = [];
  for (const coord of landCoords) {
    const { x, y } = axialToPixel(coord);
    const resource = CLASSIC_RESOURCES[hexes.length];
    const numberToken = resource === 'desert' ? undefined : numberTokens.shift();
    hexes.push({
      id: `${coord.q},${coord.r}`,
      q: coord.q,
      r: coord.r,
      x,
      y,
      resource,
      numberToken,
    });
  }
  for (const coord of waterCoords) {
    const { x, y } = axialToPixel(coord);
    hexes.push({
      id: `${coord.q},${coord.r}`,
      q: coord.q,
      r: coord.r,
      x,
      y,
      resource: 'water',
      numberToken: undefined,
    });
  }

  return buildBoardFromHexes(hexes, { includeDefaultPorts: true });
}

export function buildRandomBoard(): BoardData {
  const landCoords = coordsWithinRadius(2);
  const waterCoords = ringCoords(3);
  const resources = shuffle(CLASSIC_RESOURCES);
  const numberTokens = shuffle(CLASSIC_NUMBER_TOKENS);
  const hexes: HexTile[] = [];
  let tokenIndex = 0;
  for (const coord of landCoords) {
    const { x, y } = axialToPixel(coord);
    const resource = resources[hexes.length];
    const numberToken = resource === 'desert' ? undefined : numberTokens[tokenIndex++];
    hexes.push({
      id: `${coord.q},${coord.r}`,
      q: coord.q,
      r: coord.r,
      x,
      y,
      resource,
      numberToken,
    });
  }
  for (const coord of waterCoords) {
    const { x, y } = axialToPixel(coord);
    hexes.push({
      id: `${coord.q},${coord.r}`,
      q: coord.q,
      r: coord.r,
      x,
      y,
      resource: 'water',
      numberToken: undefined,
    });
  }
  return buildBoardFromHexes(hexes, { includeDefaultPorts: true });
}

function generateDefaultPorts(
  hexes: HexTile[],
  vertices: Vertex[],
  vertexNeighbors: Record<string, string[]>,
  vertexHexes: Record<string, string[]>,
): Port[] {
  if (!vertices.length) return [];
  const neighborOffsets: Array<[number, number]> = [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ];
  const coordKey = (q: number, r: number) => `${q},${r}`;
  const hexById = new Map(hexes.map((h) => [h.id, h]));
  const hexByCoord = new Map<string, HexTile>();
  for (const h of hexes) {
    hexByCoord.set(coordKey(h.q, h.r), h);
  }
  const coastalWater = hexes.filter((h) => {
    if (h.resource !== 'water') return false;
    return neighborOffsets.some(([dq, dr]) => {
      const neighbor = hexByCoord.get(coordKey(h.q + dq, h.r + dr));
      return neighbor && neighbor.resource !== 'water';
    });
  });
  if (!coastalWater.length) return [];
  const cx = hexes.reduce((sum, h) => sum + h.x, 0) / hexes.length;
  const cy = hexes.reduce((sum, h) => sum + h.y, 0) / hexes.length;
  const waterRing = coastalWater
    .map((h) => ({ hex: h, key: coordKey(h.q, h.r), angle: Math.atan2(h.y - cy, h.x - cx) }))
    .sort((a, b) => a.angle - b.angle);
  const portTemplates: Array<{ ratio: 2 | 3; resource?: ResourceType | 'any' }> = [
    { ratio: 3, resource: 'any' },
    { ratio: 2, resource: 'brick' },
    { ratio: 3, resource: 'any' },
    { ratio: 2, resource: 'wool' },
    { ratio: 3, resource: 'any' },
    { ratio: 2, resource: 'grain' },
    { ratio: 3, resource: 'any' },
    { ratio: 2, resource: 'lumber' },
    { ratio: 2, resource: 'ore' },
  ];
  const count = Math.min(portTemplates.length, waterRing.length);
  if (!count) return [];
  const waterNeighbors = new Map<string, Set<string>>();
  for (const entry of waterRing) {
    const neighbors = new Set<string>();
    for (const [dq, dr] of neighborOffsets) {
      const neighbor = hexByCoord.get(coordKey(entry.hex.q + dq, entry.hex.r + dr));
      if (neighbor && neighbor.resource === 'water') {
        neighbors.add(coordKey(neighbor.q, neighbor.r));
      }
    }
    waterNeighbors.set(entry.key, neighbors);
  }
  const selectFromOffset = (start: number) => {
    const selected: typeof waterRing = [];
    const blocked = new Set<string>();
    for (let i = 0; i < waterRing.length; i++) {
      const entry = waterRing[(start + i) % waterRing.length];
      if (blocked.has(entry.key)) continue;
      selected.push(entry);
      blocked.add(entry.key);
      for (const n of waterNeighbors.get(entry.key) || []) {
        blocked.add(n);
      }
      if (selected.length === count) break;
    }
    return selected;
  };
  let selected = selectFromOffset(0);
  for (let i = 1; i < waterRing.length && selected.length < count; i++) {
    const attempt = selectFromOffset(i);
    if (attempt.length > selected.length) selected = attempt;
    if (selected.length === count) break;
  }
  const selectedKeys = new Set(selected.map((e) => e.key));
  const orderedSelected = waterRing.filter((e) => selectedKeys.has(e.key));
  const finalCount = Math.min(count, orderedSelected.length);
  const vertexById = new Map(vertices.map((v) => [v.id, v]));
  const hexToVertices = new Map<string, string[]>();
  for (const [vertexId, hexIds] of Object.entries(vertexHexes)) {
    for (const hexId of hexIds) {
      const arr = hexToVertices.get(hexId) || [];
      arr.push(vertexId);
      hexToVertices.set(hexId, arr);
    }
  }
  const selectBridgeVertices = (waterHex: HexTile) => {
    const candidates = (hexToVertices.get(waterHex.id) || []).filter((vid) => {
      const touching = vertexHexes[vid] || [];
      return touching.some((hexId) => {
        const res = hexById.get(hexId)?.resource;
        return res && res !== 'water';
      });
    });
    if (!candidates.length) return [];
    const withAngles = candidates
      .map((vid) => {
        const v = vertexById.get(vid);
        if (!v) return null;
        return { vid, angle: Math.atan2(v.y - waterHex.y, v.x - waterHex.x) };
      })
      .filter(Boolean) as Array<{ vid: string; angle: number }>;
    withAngles.sort((a, b) => a.angle - b.angle);
    const ordered = withAngles.map((c) => c.vid);
    if (ordered.length <= 2) return ordered;
    for (let i = 0; i < ordered.length; i++) {
      const a = ordered[i];
      const b = ordered[(i + 1) % ordered.length];
      if ((vertexNeighbors[a] || []).includes(b)) {
        return [a, b];
      }
    }
    return [ordered[0], ordered[1]];
  };
  const ports: Port[] = [];
  for (let i = 0; i < finalCount; i++) {
    const waterHex = orderedSelected[i]?.hex;
    if (!waterHex) continue;
    const tpl = portTemplates[i];
    const bridges = selectBridgeVertices(waterHex);
    const vertexId = bridges[0];
    if (!vertexId) continue;
    ports.push({
      id: `port-${i}`,
      vertexId,
      waterHexId: waterHex.id,
      ratio: tpl.ratio,
      resource: tpl.resource,
      bridges,
    });
  }
  return ports;
}

export function buildBoardFromHexes(
  hexes: Array<Pick<HexTile, 'id' | 'q' | 'r' | 'resource' | 'numberToken'>>,
  options?: { includeDefaultPorts?: boolean },
): BoardData {
  // ensure ids
  const finalizedHexes: HexTile[] = hexes.map((h, idx) => {
    const { x, y } = axialToPixel({ q: h.q, r: h.r });
    return {
      id: h.id || `hex-${idx}`,
      q: h.q,
      r: h.r,
      x,
      y,
      resource: h.resource as HexResource,
      numberToken: keepsNumberToken(h.resource as HexResource) ? h.numberToken : undefined,
    };
  });

  const vertexLookup = new Map<string, Vertex>();
  const vertexHexes = new Map<string, Set<string>>();
  const edgesLookup = new Map<string, Edge>();

  for (const hex of finalizedHexes) {
    const center = { x: hex.x, y: hex.y };
    const corners = Array.from({ length: 6 }, (_, i) => corner(center, i));
    const vertexIds: string[] = [];

    for (const c of corners) {
      const key = toKey(c);
      if (!vertexLookup.has(key)) {
        const id = `v${vertexLookup.size}`;
        vertexLookup.set(key, { id, x: c.x, y: c.y });
        vertexHexes.set(id, new Set());
      }
      const vertex = vertexLookup.get(key)!;
      vertexHexes.get(vertex.id)!.add(hex.id);
      vertexIds.push(vertex.id);
    }

    for (let i = 0; i < 6; i++) {
      const a = vertexIds[i];
      const b = vertexIds[(i + 1) % 6];
      const edgeKey = [a, b].sort().join('|');
      if (!edgesLookup.has(edgeKey)) {
        const id = `e${edgesLookup.size}`;
        edgesLookup.set(edgeKey, { id, v1: a, v2: b });
      }
    }
  }

  const vertexNeighbors: Record<string, string[]> = {};
  const vertexEdges: Record<string, string[]> = {};
  for (const edge of edgesLookup.values()) {
    if (!vertexNeighbors[edge.v1]) vertexNeighbors[edge.v1] = [];
    if (!vertexNeighbors[edge.v2]) vertexNeighbors[edge.v2] = [];
    vertexNeighbors[edge.v1].push(edge.v2);
    vertexNeighbors[edge.v2].push(edge.v1);
    if (!vertexEdges[edge.v1]) vertexEdges[edge.v1] = [];
    if (!vertexEdges[edge.v2]) vertexEdges[edge.v2] = [];
    vertexEdges[edge.v1].push(edge.id);
    vertexEdges[edge.v2].push(edge.id);
  }

  const vertexHexRecord: Record<string, string[]> = {};
  for (const [vertexId, set] of vertexHexes.entries()) {
    vertexHexRecord[vertexId] = Array.from(set);
  }

  const board: BoardData = {
    hexes: finalizedHexes,
    vertices: Array.from(vertexLookup.values()),
    edges: Array.from(edgesLookup.values()),
    vertexHexes: vertexHexRecord,
    vertexEdges,
    vertexNeighbors,
  };
  if (options?.includeDefaultPorts) {
    board.ports = generateDefaultPorts(board.hexes, board.vertices, board.vertexNeighbors, board.vertexHexes);
  }
  return board;
}
