"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildBoard = buildBoard;
exports.buildBoardFromHexes = buildBoardFromHexes;
const HEX_SIZE = 100;
const SQRT3 = Math.sqrt(3);
const BASE_RESOURCES = ['brick', 'lumber', 'wool', 'grain', 'ore', 'gold'];
const isBaseResource = (res) => BASE_RESOURCES.includes(res);
const keepsNumberToken = (res) => isBaseResource(res) || res === 'cloud';
function axialToPixel({ q, r }) {
    return {
        x: HEX_SIZE * (SQRT3 * (q + r / 2)),
        y: HEX_SIZE * (1.5 * r),
    };
}
function corner(center, i) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return {
        x: center.x + HEX_SIZE * Math.cos(angle),
        y: center.y + HEX_SIZE * Math.sin(angle),
    };
}
function toKey({ x, y }) {
    return `${x.toFixed(4)},${y.toFixed(4)}`;
}
function buildBoard() {
    // Default radius-2 (19-hex) classic board
    const coords = [];
    for (let q = -2; q <= 2; q++) {
        for (let r = -2; r <= 2; r++) {
            const s = -q - r;
            if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= 2) {
                coords.push({ q, r });
            }
        }
    }
    coords.sort((a, b) => (a.r === b.r ? a.q - b.q : a.r - b.r));
    const resources = [
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
    const numberTokens = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11];
    const hexes = [];
    for (const coord of coords) {
        const { x, y } = axialToPixel(coord);
        const resource = resources[hexes.length];
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
    return buildBoardFromHexes(hexes, { includeDefaultPorts: true });
}
function generateDefaultPorts(vertices) {
    if (!vertices.length)
        return [];
    // place ports around outer ring, sorted by angle from board center
    const cx = vertices.reduce((sum, v) => sum + v.x, 0) / vertices.length;
    const cy = vertices.reduce((sum, v) => sum + v.y, 0) / vertices.length;
    const withDist = vertices.map((v) => ({
        ...v,
        dist: Math.hypot(v.x - cx, v.y - cy),
        angle: Math.atan2(v.y - cy, v.x - cx),
    }));
    const maxDist = Math.max(...withDist.map((v) => v.dist));
    const rim = withDist
        .filter((v) => v.dist >= maxDist - HEX_SIZE * 0.25)
        .sort((a, b) => a.angle - b.angle);
    const portTemplates = [
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
    const ports = [];
    for (let i = 0; i < Math.min(portTemplates.length, rim.length); i++) {
        const v = rim[Math.floor((i * rim.length) / portTemplates.length)];
        const tpl = portTemplates[i];
        ports.push({ id: `port-${i}`, vertexId: v.id, ratio: tpl.ratio, resource: tpl.resource });
    }
    return ports;
}
function buildBoardFromHexes(hexes, options) {
    // ensure ids
    const finalizedHexes = hexes.map((h, idx) => {
        const { x, y } = axialToPixel({ q: h.q, r: h.r });
        return {
            id: h.id || `hex-${idx}`,
            q: h.q,
            r: h.r,
            x,
            y,
            resource: h.resource,
            numberToken: keepsNumberToken(h.resource) ? h.numberToken : undefined,
        };
    });
    const vertexLookup = new Map();
    const vertexHexes = new Map();
    const edgesLookup = new Map();
    for (const hex of finalizedHexes) {
        const center = { x: hex.x, y: hex.y };
        const corners = Array.from({ length: 6 }, (_, i) => corner(center, i));
        const vertexIds = [];
        for (const c of corners) {
            const key = toKey(c);
            if (!vertexLookup.has(key)) {
                const id = `v${vertexLookup.size}`;
                vertexLookup.set(key, { id, x: c.x, y: c.y });
                vertexHexes.set(id, new Set());
            }
            const vertex = vertexLookup.get(key);
            vertexHexes.get(vertex.id).add(hex.id);
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
    const vertexNeighbors = {};
    const vertexEdges = {};
    for (const edge of edgesLookup.values()) {
        if (!vertexNeighbors[edge.v1])
            vertexNeighbors[edge.v1] = [];
        if (!vertexNeighbors[edge.v2])
            vertexNeighbors[edge.v2] = [];
        vertexNeighbors[edge.v1].push(edge.v2);
        vertexNeighbors[edge.v2].push(edge.v1);
        if (!vertexEdges[edge.v1])
            vertexEdges[edge.v1] = [];
        if (!vertexEdges[edge.v2])
            vertexEdges[edge.v2] = [];
        vertexEdges[edge.v1].push(edge.id);
        vertexEdges[edge.v2].push(edge.id);
    }
    const vertexHexRecord = {};
    for (const [vertexId, set] of vertexHexes.entries()) {
        vertexHexRecord[vertexId] = Array.from(set);
    }
    const board = {
        hexes: finalizedHexes,
        vertices: Array.from(vertexLookup.values()),
        edges: Array.from(edgesLookup.values()),
        vertexHexes: vertexHexRecord,
        vertexEdges,
        vertexNeighbors,
    };
    if (options?.includeDefaultPorts) {
        board.ports = generateDefaultPorts(board.vertices);
    }
    return board;
}
