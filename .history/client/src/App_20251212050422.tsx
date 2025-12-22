import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import type { ClientMessage, DevCardType, PublicGameState, ResourceType, ServerMessage } from "./types";

const HEX_SIZE = 100;
const SQRT3 = Math.sqrt(3);
// radius 4 produces a 9x9 axial grid (q/r from -4..4)
const DEFAULT_EDITOR_RADIUS = 4;

const RESOURCE_LABEL: Record<ResourceType, string> = {
  brick: "Brick",
  lumber: "Wood",
  wool: "Sheep",
  grain: "Wheat",
  ore: "Stone",
  gold: "Gold",
};

const RESOURCE_COLOR: Record<ResourceType | "desert", string> = {
  brick: "#e67e36",
  lumber: "#1f7f3f",
  wool: "#7bcf5d",
  grain: "#e5c247",
  ore: "#9aa0a5",
  desert: "#d7c29c",
  gold: "#f1b500",
};

// Optional PNG textures for resource tiles (drop images in /public/tiles/*.png)
const RESOURCE_TEXTURE: Partial<Record<ResourceType | "desert", string>> = {
  brick: "/tiles/brick_tile.png",
  lumber: "/tiles/Wood_tile.png",
  wool: "/tiles/sheep_tile.png",
  grain: "/tiles/wheat_tile.png",
  ore: "/tiles/Stone_tile.png",
  desert: "/tiles/desert.png",
  gold: "/tiles/gold.png",
};

const DEV_IMG: Partial<Record<DevCardType, string>> = {
  knight: "/devcards/Knight.webp",
  victory_point: "/devcards/Victory_point.webp",
  monopoly: "/devcards/Monopoly.webp",
  year_of_plenty: "/devcards/Year_Of_Plenty.webp",
  road_building: "/devcards/road_building.png",
};

const RESOURCE_IMG: Partial<Record<ResourceType, string>> = {
  brick: "/cards/Brick.png",
  lumber: "/cards/wood.png",
  wool: "/cards/sheep.png",
  grain: "/cards/wheat.png",
  ore: "/cards/Stone.png",
  gold: "/cards/Stone.png",
};

// Number token icons are used from `/public/icons/token_<n>_transparent.png`.
// Previously the UI used pip strings; PNG icons are preferred if provided.

type PaletteTool = "settlement" | "city" | "road" | "robber";

const PaletteIcons: Record<PaletteTool, JSX.Element> = {
  settlement: (
    <svg viewBox="0 0 24 24">
      <path d="M3 13L12 4l9 9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M6 12v8h12v-8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M10 20v-6h4v6" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  city: (
    <svg viewBox="0 0 24 24">
      <rect x="4" y="10" width="6" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="12" y="6" width="8" height="14" rx="1" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M14 6l2-2 2 2" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  road: (
    <svg viewBox="0 0 24 24">
      <path d="M3 18l18-12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M7 20l-4-4 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M17 8l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  robber: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="6" y="11" width="12" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 14h8" stroke="currentColor" strokeWidth="2" />
      <path d="M10 4h4" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
};

const DEV_ICONS: Record<DevCardType, JSX.Element> = {
  knight: (
    <svg viewBox="0 0 24 24">
      <path d="M9 5h6v3H9z" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M9 8v5a3 3 0 0 0 6 0V8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M10 13h4" stroke="currentColor" strokeWidth="2" />
      <path d="M12 16v3" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  monopoly: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  year_of_plenty: (
    <svg viewBox="0 0 24 24">
      <path d="M7 9c0-3 10-3 10 0v5c0 3-10 3-10 0Z" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M9 7c0-2 6-2 6 0" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M10 12c1 1 3 1 4 0" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  road_building: (
    <svg viewBox="0 0 24 24">
      <path d="M4 18 20 6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M6 6h4v4H6zM14 14h4v4h-4z" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  victory_point: (
    <svg viewBox="0 0 24 24">
      <path d="M5 9 8 18h8l3-9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M9 9a3 3 0 1 1 6 0" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
};

function hexPoints(hex: { x: number; y: number }) {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const x = hex.x + HEX_SIZE * Math.cos(angle);
    const y = hex.y + HEX_SIZE * Math.sin(angle);
    points.push(`${x},${y}`);
  }
  return points.join(" ");
}

function groupById<T extends { id: string }>(items: T[]) {
  return Object.fromEntries(items.map((i) => [i.id, i]));
}

function axialToPixel(q: number, r: number) {
  return {
    x: HEX_SIZE * (SQRT3 * (q + r / 2)),
    y: HEX_SIZE * (1.5 * r),
  };
}

function hexRingPoints(cx: number, cy: number, radius: number) {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    pts.push(`${x},${y}`);
  }
  return pts.join(" ");
}

function useLocalStorage(key: string, initial: string): [string, (v: string) => void] {
  const [value, setValue] = useState(() => localStorage.getItem(key) || initial);
  const setter = (v: string) => {
    setValue(v);
    localStorage.setItem(key, v);
  };
  return [value, setter];
}
export default function App() {
  const [serverUrl, setServerUrl] = useState("ws://localhost:3001");
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [state, setState] = useState<PublicGameState | null>(null);
  const [playerId, setPlayerId] = useLocalStorage("catan-player-id", "");
  const [joined, setJoined] = useState(false);
  const [name, setName] = useLocalStorage("catan-name", "");
  const [error, setError] = useState("");
  const [paletteMode, setPaletteMode] = useState<PaletteTool | null>(null);
  const [buildMode, setBuildMode] = useState<"road" | "settlement" | "city" | null>(null);
  const [robberMode, setRobberMode] = useState(false);
  const [pendingKnight, setPendingKnight] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [monoResource, setMonoResource] = useState<ResourceType>("brick");
  const [yopA, setYopA] = useState<ResourceType>("brick");
  const [yopB, setYopB] = useState<ResourceType>("grain");
  const [cheatRes, setCheatRes] = useState<ResourceType>("brick");
  const [cheatAmt, setCheatAmt] = useState(2);
  const [mapDraft, setMapDraft] = useState<
    { id: string; q: number; r: number; x: number; y: number; resource: ResourceType | "desert"; numberToken?: number }[]
  >([]);
  const [mapPorts, setMapPorts] = useState<{ id: string; vertexKey: string; ratio: 2 | 3; resource?: ResourceType | 'any' }[]>([]);
  const [portMode, setPortMode] = useState(false);
  const [portRatio, setPortRatio] = useState<2 | 3>(3);
  const [portResource, setPortResource] = useState<ResourceType | 'any'>('any');
  const [eraseMode, setEraseMode] = useState<boolean>(false);
  // pan & zoom for the editor (Shift+drag to pan, scroll to zoom)
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPointer, setLastPointer] = useState<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedDev, setSelectedDev] = useState<DevCardType | null>(null);
  const [mapPage, setMapPage] = useState(false);
  const mapPageRef = useRef<boolean>(false);
  const [editResource, setEditResource] = useState<ResourceType | "desert">("desert");
  const [editNumber, setEditNumber] = useState<number | "">("");
  function computeVerticesFromHexes(hexes: typeof mapDraft) {
    const vertexLookup = new Map<string, { id: string; x: number; y: number }>();
    const vertexHexes = new Map<string, Set<string>>();
    const edgesLookup = new Map<string, { id: string; v1: string; v2: string }>();
    for (const hex of hexes) {
      const center = { x: hex.x, y: hex.y };
      const corners = Array.from({ length: 6 }, (_, i) => {
        const angle = (Math.PI / 180) * (60 * i - 30);
        return { x: center.x + HEX_SIZE * Math.cos(angle), y: center.y + HEX_SIZE * Math.sin(angle) };
      });
      const vertexIds: string[] = [];
      for (const c of corners) {
        const key = `${c.x.toFixed(4)},${c.y.toFixed(4)}`;
        if (!vertexLookup.has(key)) {
          const id = `v${vertexLookup.size}`;
          vertexLookup.set(key, { id, x: c.x, y: c.y });
          vertexHexes.set(id, new Set());
        }
        const v = vertexLookup.get(key)!;
        vertexHexes.get(v.id)!.add(hex.id);
        vertexIds.push(v.id);
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
    return Array.from(vertexLookup.entries()).map(([key, v]) => ({ key, id: v.id, x: v.x, y: v.y }));
  }


  useEffect(() => {
    mapPageRef.current = mapPage;
  }, [mapPage]);

  // attach a non-passive wheel listener to prevent page scrolling while zooming
  useEffect(() => {
    if (!mapPage) return;
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY;
      const factor = Math.exp(-delta * 0.001);
      setZoom((z) => Math.max(0.25, Math.min(3, z * factor)));
    };
    el.addEventListener('wheel', handler as EventListener, { passive: false });
    return () => el.removeEventListener('wheel', handler as EventListener);
  }, [mapPage]);

  const send = (message: ClientMessage) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };

  const connect = () => {
    if (!name.trim()) {
      setError("Enter a display name first.");
      return;
    }
    const socket = new WebSocket(serverUrl);
    setStatus("connecting");
    socket.onopen = () => {
      setStatus("connected");
      setWs(socket);
      setError("");
      socket.send(JSON.stringify({ type: "join", name, playerId: playerId || undefined }));
    };
    socket.onclose = () => {
      setStatus("disconnected");
      setWs(null);
      setJoined(false);
    };
    socket.onerror = () => setError("Connection error (check server is running).");
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
        if (message.type === "state") {
          setState(message.state);
          if (message.state.phase === "lobby") {
            // only overwrite the editor draft when the map editor is NOT open
            if (!mapPageRef.current) {
              setMapDraft(
                message.state.board.hexes.map((h, idx) => ({
                  id: h.id || `hex-${idx}`,
                  q: h.q,
                  r: h.r,
                  x: h.x,
                  y: h.y,
                  resource: h.resource,
                  numberToken: h.numberToken,
                })),
              );
              // map ports from server-side vertex ids to client-side vertex keys
              const ports: { id: string; vertexKey: string; ratio: 2 | 3; resource?: ResourceType | 'any' }[] = [];
              if (message.state.board.ports && message.state.board.vertices) {
                const vById = Object.fromEntries(message.state.board.vertices.map((v) => [v.id, v]));
                for (const p of message.state.board.ports) {
                  const v = vById[p.vertexId];
                  if (!v) continue;
                  const key = `${v.x.toFixed(4)},${v.y.toFixed(4)}`;
                  ports.push({ id: p.id, vertexKey: key, ratio: p.ratio as 2 | 3, resource: p.resource });
                }
              }
              setMapPorts(ports);
            }
          } else {
            // ensure ref matches
            mapPageRef.current = false;
            setMapPage(false);
          }
        } else if (message.type === "joined") {
        setPlayerId(message.playerId);
        setJoined(true);
      } else if (message.type === "error") {
        setError(message.message);
      }
    };
  };

  const activePlayer = useMemo(() => {
    if (!state) return null;
    if (state.phase === "setup") return state.players[state.setupIndex] || null;
    if (state.phase === "turn") return state.players[state.currentPlayerIndex] || null;
    return null;
  }, [state]);

  const isMyTurn = !!activePlayer && activePlayer.id === playerId;
  const me = state?.players.find((p) => p.id === playerId) || null;

  useEffect(() => {
    if (state?.awaitingRobber && isMyTurn && !robberMode) {
      setPaletteMode("robber");
      setRobberMode(true);
      setBuildMode(null);
      setPendingKnight(false);
    }
  }, [state?.awaitingRobber, isMyTurn, robberMode]);

  const playerLookup = useMemo(() => (state ? groupById(state.players) : {}), [state]);

  const bounds = useMemo(() => {
    if (!state) return null;
    const xs = state.board.hexes.map((h) => h.x);
    const ys = state.board.hexes.map((h) => h.y);
    const margin = HEX_SIZE * 3;
    return {
      minX: Math.min(...xs) - margin,
      maxX: Math.max(...xs) + margin,
      minY: Math.min(...ys) - margin,
      maxY: Math.max(...ys) + margin,
    };
  }, [state]);

  const editorGrid = useMemo(() => {
    const coords: { q: number; r: number }[] = [];
    const radius = DEFAULT_EDITOR_RADIUS; // fixed 9x9 grid
    for (let q = -radius; q <= radius; q++) {
      for (let r = -radius; r <= radius; r++) {
        const s = -q - r;
        if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) <= radius) {
          coords.push({ q, r });
        }
      }
    }
    return coords.map((c, idx) => {
      const { x, y } = axialToPixel(c.q, c.r);
      return { id: `${c.q},${c.r},${idx}`, q: c.q, r: c.r, x, y, resource: "desert" as const, numberToken: undefined };
    });
  }, []);

  const draftBounds = useMemo(() => {
    if (!mapDraft.length) return null;
    const xs = mapDraft.map((h) => h.x);
    const ys = mapDraft.map((h) => h.y);
    const margin = HEX_SIZE * 3;
    return {
      minX: Math.min(...xs) - margin,
      maxX: Math.max(...xs) + margin,
      minY: Math.min(...ys) - margin,
      maxY: Math.max(...ys) + margin,
    };
  }, [mapDraft]);

  const boardRing = useMemo(() => {
    if (!state) return null;
    const cx = state.board.hexes.reduce((sum, h) => sum + h.x, 0) / state.board.hexes.length;
    const cy = state.board.hexes.reduce((sum, h) => sum + h.y, 0) / state.board.hexes.length;
    const maxDist = Math.max(...state.board.hexes.map((h) => Math.hypot(h.x - cx, h.y - cy)));
    return {
      cx,
      cy,
      radius: maxDist + HEX_SIZE * 1.15,
      points: hexRingPoints(cx, cy, maxDist + HEX_SIZE * 1.15),
    };
  }, [state]);

  const draftRing = useMemo(() => {
    if (!mapDraft.length) return null;
    const cx = mapDraft.reduce((sum, h) => sum + h.x, 0) / mapDraft.length;
    const cy = mapDraft.reduce((sum, h) => sum + h.y, 0) / mapDraft.length;
    const maxDist = Math.max(...mapDraft.map((h) => Math.hypot(h.x - cx, h.y - cy)));
    return {
      cx,
      cy,
      radius: maxDist + HEX_SIZE * 1.15,
      points: hexRingPoints(cx, cy, maxDist + HEX_SIZE * 1.15),
    };
  }, [mapDraft]);

  const handleVertexClick = (vertexId: string) => {
    if (!buildMode) return;
    send({ type: "build", buildType: buildMode, vertexId });
    setBuildMode(null);
    setPaletteMode(null);
  };

  const handleEditorVertexClick = (vertexKey: string) => {
    if (!mapPage) return;
    if (!portMode) return;
    setMapPorts((ports) => {
      const existing = ports.find((p) => p.vertexKey === vertexKey);
      if (existing) {
        return ports.filter((p) => p.vertexKey !== vertexKey);
      }
      const id = `port-${ports.length}`;
      return [...ports, { id, vertexKey, ratio: portRatio, resource: portResource }];
    });
  };

  const handleEdgeClick = (edgeId: string) => {
    if (buildMode !== "road") return;
    send({ type: "build", buildType: "road", edgeId });
    const bonus = me?.bonusRoads ?? 0;
    if (bonus > 0) {
      setBuildMode("road");
      setPaletteMode("road");
    } else {
      setBuildMode(null);
      setPaletteMode(null);
    }
  };

  const handleHexClick = (hexId: string) => {
    if (mapPage) {
      if (eraseMode) {
        setMapDraft((draft) => draft.filter((h) => h.id !== hexId));
        return;
      }
      setMapDraft((draft) =>
        draft.map((h) =>
          h.id === hexId
            ? { ...h, resource: editResource, numberToken: editResource === "desert" ? undefined : editNumber || undefined }
            : h,
        ),
      );
      return;
    }
    if (!robberMode) return;
    if (pendingKnight) {
      send({ type: "playKnight", hexId, targetPlayerId: selectedTarget || undefined });
      setPendingKnight(false);
    } else {
      send({ type: "moveRobber", hexId, targetPlayerId: selectedTarget || undefined });
    }
    setRobberMode(false);
    setPaletteMode(null);
    setSelectedTarget(null);
  };

  const turnLabel = state
    ? state.phase === "setup"
      ? `Setup ${state.setupRound} - ${activePlayer?.name ?? ""}`
      : state.phase === "turn"
        ? `Turn - ${activePlayer?.name ?? ""}`
        : state.phase === "finished"
          ? `Finished: ${state.players.find((p) => p.id === state.winnerId)?.name ?? ""}`
          : "Lobby"
    : "";

  const actionHint = useMemo(() => {
    if (!state) return "Waiting for players.";
    if (state.phase === "lobby") return "Click Start Game when everyone has joined.";
    if (state.phase === "setup") {
      const actor = state.players[state.setupIndex]?.name ?? "Player";
      const step = state.setupStep === "road" ? "place a road" : "place a settlement";
      return `Setup round ${state.setupRound}: ${actor}, ${step}.`;
    }
    if (state.phase === "turn") {
      const actor = activePlayer?.name ?? "Player";
      const bonusRoads = activePlayer?.bonusRoads ?? 0;
      if (bonusRoads > 0) return `${actor}: place ${bonusRoads} free road(s).`;
      if (state.awaitingRobber) return `${actor}: move the robber and choose who to steal from.`;
      if (!state.hasRolled) return `${actor}: roll the dice.`;
      return `${actor}: build/trade then end turn.`;
    }
    if (state.phase === "finished") {
      const winner = state.players.find((p) => p.id === state.winnerId)?.name ?? "Winner";
      return `${winner} won the game.`;
    }
    return "";
  }, [state, activePlayer]);

  const devCounts = useMemo(() => {
    const base: Record<DevCardType, number> = {
      knight: 0,
      victory_point: 0,
      monopoly: 0,
      year_of_plenty: 0,
      road_building: 0,
    };
    if (!me) return base;
    me.devCards.forEach((card) => {
      base[card] = (base[card] || 0) + 1;
    });
    return base;
  }, [me]);

  const ownedVertices = useMemo(() => {
    if (!state || !playerId) return new Set<string>();
    return new Set(
      Object.entries(state.vertexOwner)
        .filter(([, owner]) => owner === playerId)
        .map(([vertexId]) => vertexId),
    );
  }, [state, playerId]);

  const ownedEdges = useMemo(() => {
    if (!state || !playerId) return new Set<string>();
    return new Set(
      Object.entries(state.edgeOwner)
        .filter(([, owner]) => owner === playerId)
        .map(([edgeId]) => edgeId),
    );
  }, [state, playerId]);

  const vertexEdges = (vertexId: string) => state?.board.vertexEdges?.[vertexId] || [];

  const canBuildSettlement = (vertexId: string) => {
    if (!state || !me) return false;
    if (!isMyTurn) return false;
    if (state.vertexOwner[vertexId]) return false;
    const neighbors = state.board.vertexNeighbors[vertexId] || [];
    if (neighbors.some((v) => state.vertexOwner[v])) return false;
    if (state.phase === "setup") {
      return state.players[state.setupIndex]?.id === playerId;
    }
    return vertexEdges(vertexId).some((edgeId) => ownedEdges.has(edgeId));
  };

  const canBuildCity = (vertexId: string) => {
    if (!state || !me) return false;
    if (!isMyTurn) return false;
    if (!me.settlements.includes(vertexId)) return false;
    return true;
  };

  const canBuildRoad = (edgeId: string) => {
    if (!state || !me) return false;
    if (!isMyTurn) return false;
    if (state.edgeOwner[edgeId]) return false;
    const edge = state.board.edges.find((e) => e.id === edgeId);
    if (!edge) return false;
    const touchesMyVertex = ownedVertices.has(edge.v1) || ownedVertices.has(edge.v2);
    const adjacentEdgeOwned = (v: string) => vertexEdges(v).some((eId) => ownedEdges.has(eId));
    if (state.phase === "setup") {
      return touchesMyVertex;
    }
    return touchesMyVertex || adjacentEdgeOwned(edge.v1) || adjacentEdgeOwned(edge.v2);
  };

  const highlightVertices = useMemo(() => {
    if (!state) return new Set<string>();
    if (!paletteMode || !["settlement", "city"].includes(paletteMode)) return new Set<string>();
    const ids =
      paletteMode === "settlement"
        ? state.board.vertices.filter((v) => canBuildSettlement(v.id)).map((v) => v.id)
        : state.board.vertices.filter((v) => canBuildCity(v.id)).map((v) => v.id);
    return new Set(ids);
  }, [state, paletteMode]);

  const highlightEdges = useMemo(() => {
    if (!state) return new Set<string>();
    if (paletteMode !== "road") return new Set<string>();
    const ids = state.board.edges.filter((e) => canBuildRoad(e.id)).map((e) => e.id);
    return new Set(ids);
  }, [state, paletteMode]);

  const renderResourceCard = (res: ResourceType, count: number) => {
    if (count <= 0) return null;
    const src = RESOURCE_IMG[res];
    const stackCount = Math.min(count, 3);
    return (
      <div className="hand-card-stack" key={res}>
        {Array.from({ length: stackCount }).map((_, idx) => (
          <img
            key={`${res}-stack-${idx}`}
            src={src}
            alt={`${res} card`}
            className="hand-card-img stacked"
            style={{ left: `${idx * 8}px`, zIndex: idx + 1 }}
            loading="lazy"
          />
        ))}
        <div className="hand-count-badge">{count}</div>
      </div>
    );
  };

  const ready = status === "connected" && !!state && !!playerId && joined;

  const playSelectedDev = () => {
    if (!selectedDev) return;
    if (!isMyTurn || !state) return;
    switch (selectedDev) {
      case "knight":
        setPaletteMode("robber");
        setRobberMode(true);
        setBuildMode(null);
        setPendingKnight(true);
        break;
      case "monopoly":
        send({ type: "playMonopoly", resource: monoResource });
        break;
      case "year_of_plenty":
        send({ type: "playYearOfPlenty", resourceA: yopA, resourceB: yopB });
        break;
      case "road_building":
        send({ type: "playRoadBuilding" });
        setPaletteMode("road");
        setBuildMode("road");
        break;
      case "victory_point":
        // VP cards auto-count; no action needed
        break;
    }
    setSelectedDev(null);
  };

  if (!ready) {
    return (
      <div className="join-screen">
        <div className="join-card">
          <h1>Join Catan</h1>
          <p className="sub">Enter your name and server URL to start.</p>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="ws://localhost:3001" />
          <button onClick={connect} disabled={status === "connecting"}>
            {status === "connecting" ? "Connecting..." : "Join Game"}
          </button>
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    );
  }
  return (
    <div className="page">
      {state && !mapPage && (
        <button
          className="map-fab"
          onClick={() => {
            setMapDraft(editorGrid);
            // set the ref immediately to avoid races with incoming socket state
            mapPageRef.current = true;
            setMapPage(true);
          }}
          disabled={state.phase !== "lobby"}
          title={state.phase === "lobby" ? "Open map editor" : "Map editing available in lobby only"}
        >
          Map Editor
        </button>
      )}

      {mapPage && state ? (
        <div className="map-page">
          <div className="map-page-bar">
            <div>
              <div className="label">Map Editor</div>
              <div className="hint">Click hexes to set resource/number, then save.</div>
            </div>
              <div style={{ marginLeft: 12 }}>
                <div style={{ fontSize: 12, color: '#fff' }}><strong>Ports:</strong> {mapPorts.length}</div>
                <div style={{ fontSize: 11, color: '#fff', maxHeight: 80, overflow: 'auto' }}>
                  {mapPorts.map((p) => (
                    <div key={p.id} style={{ fontSize: 11 }}>{p.id} → {p.vertexKey} ({p.ratio}{p.resource ? ` ${p.resource}` : ''})</div>
                  ))}
                </div>
              </div>
            <div className="map-controls inline">
                <label style={{display:'inline-flex',alignItems:'center',gap:8}}>
                  <input type="checkbox" checked={eraseMode} onChange={(e) => setEraseMode(e.target.checked)} /> Erase
                </label>
                <label style={{display:'inline-flex',alignItems:'center',gap:8, marginLeft:12}}>
                  <input type="checkbox" checked={portMode} onChange={(e) => setPortMode(e.target.checked)} /> Port Mode
                </label>
                {portMode && (
                  <span style={{display:'inline-flex',alignItems:'center',gap:8}}>
                    <select value={String(portRatio)} onChange={(e) => setPortRatio(e.target.value === '2' ? 2 : 3)}>
                      <option value="2">2:1</option>
                      <option value="3">3:1</option>
                    </select>
                    <select value={String(portResource)} onChange={(e) => setPortResource((e.target.value as ResourceType | 'any'))}>
                      <option value="any">Any</option>
                      {(["brick", "lumber", "wool", "grain", "ore", "gold"] as ResourceType[]).map((r) => (
                        <option key={r} value={r}>{RESOURCE_LABEL[r]}</option>
                      ))}
                    </select>
                  </span>
                )}
              <select value={editResource} onChange={(e) => setEditResource(e.target.value as ResourceType | "desert")}>
                {(["brick", "lumber", "wool", "grain", "ore", "gold", "desert"] as Array<ResourceType | "desert">).map((r) => (
                  <option key={r} value={r}>
                    {RESOURCE_LABEL[r as ResourceType] || "Desert"}
                  </option>
                ))}
              </select>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
                <button
                  title="Reset view"
                  onClick={() => {
                    setPan({ x: 0, y: 0 });
                    setZoom(1);
                  }}
                >
                  Reset View
                </button>
                <button
                  title="Zoom in"
                  onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                >
                  +
                </button>
                <button
                  title="Zoom out"
                  onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
                >
                  -
                </button>
                <button
                  title="Export map JSON"
                  onClick={() => {
                    try {
                      const hexes = mapDraft.map((h) => ({ id: h.id, q: h.q, r: h.r, resource: h.resource, numberToken: h.numberToken }));
                      const ports = mapPorts.map((p) => ({ id: p.id, vertexKey: p.vertexKey, ratio: p.ratio, resource: p.resource }));
                      const blob = new Blob([JSON.stringify({ hexes, ports }, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'custom-map.json';
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      URL.revokeObjectURL(url);
                    } catch (err) {
                      setError('Failed to export map');
                    }
                  }}
                >
                  Export JSON
                </button>
                <button
                  title="Import map JSON"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Import JSON
                </button>
              </div>
              <select
                value={editNumber === "" ? "" : String(editNumber)}
                onChange={(e) => setEditNumber(e.target.value === "" ? "" : Number(e.target.value))}
                disabled={editResource === "desert"}
              >
                <option value="">No number</option>
                {[2, 3, 4, 5, 6, 8, 9, 10, 11, 12].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                      try {
                        const parsed = JSON.parse(String(reader.result));
                        const rawHexes = Array.isArray(parsed) ? parsed : parsed.hexes || parsed.board?.hexes || [];
                        if (!Array.isArray(rawHexes)) throw new Error('No hex array');
                        const draft = rawHexes.map((h: any, idx: number) => {
                          const id = h.id || `hex-${idx}`;
                          const q = Number(h.q);
                          const r = Number(h.r);
                          const { x, y } = axialToPixel(q, r);
                          return { id, q, r, x, y, resource: h.resource || 'desert', numberToken: h.numberToken };
                        });
                        setMapDraft(draft);
                        // if ports provided, keep them (expect vertexKey coordinates)
                        const rawPorts = parsed.ports || parsed.board?.ports || [];
                        if (Array.isArray(rawPorts) && rawPorts.length) {
                          const ports = rawPorts.map((p: any, idx: number) => {
                            const ratio: 2 | 3 = p.ratio === 2 ? 2 : 3;
                            return { id: p.id || `port-${idx}`, vertexKey: p.vertexKey, ratio, resource: p.resource };
                          });
                          setMapPorts(ports as any);
                        } else {
                          setMapPorts([]);
                        }
                    } catch (err) {
                      setError('Invalid map JSON file');
                    }
                  };
                  reader.readAsText(file);
                  // clear value so same file can be re-selected later
                  e.currentTarget.value = '';
                }}
              />
              <button
                onClick={() => {
                  setMapDraft(editorGrid);
                  setEditNumber("");
                }}
              >
                Clear All
              </button>
              <button
                onClick={() => {
                  setMapDraft(
                    state.board.hexes.map((h, idx) => ({
                      id: h.id || `hex-${idx}`,
                      q: h.q,
                      r: h.r,
                      x: h.x,
                      y: h.y,
                      resource: h.resource,
                      numberToken: h.numberToken,
                    })),
                  );
                }}
              >
                Load Current Board
              </button>
              <button
                onClick={() => {
                  send({
                    type: "setCustomBoard",
                    hexes: mapDraft.map((h) => ({
                      id: h.id,
                      q: h.q,
                      r: h.r,
                      resource: h.resource,
                      numberToken: h.numberToken,
                    })),
                    ports: mapPorts.map((p) => ({ id: p.id, vertexKey: p.vertexKey, ratio: p.ratio, resource: p.resource })),
                  });
                  // clear ref immediately to avoid races
                  mapPageRef.current = false;
                  setMapPage(false);
                }}
              >
                Save Board
              </button>
              <button onClick={() => { mapPageRef.current = false; setMapPage(false); }}>Exit</button>
            </div>
          </div>
          <div className="board-wrapper">
            <svg
              ref={svgRef}
              className="board"
              viewBox={`${draftBounds?.minX ?? 0} ${draftBounds?.minY ?? 0} ${(draftBounds?.maxX ?? 0) - (draftBounds?.minX ?? 0)} ${(draftBounds?.maxY ?? 0) - (draftBounds?.minY ?? 0)}`}
              onPointerDown={(e) => {
                // start panning only when user holds Shift while dragging
                if (!e.shiftKey) return;
                setIsPanning(true);
                setLastPointer({ x: e.clientX, y: e.clientY });
                // capture pointer so we continue receiving events
                try {
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                } catch {}
              }}
              onPointerMove={(e) => {
                if (!isPanning || !lastPointer) return;
                const dx = e.clientX - lastPointer.x;
                const dy = e.clientY - lastPointer.y;
                setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
                setLastPointer({ x: e.clientX, y: e.clientY });
              }}
              onPointerUp={(e) => {
                if (!isPanning) return;
                setIsPanning(false);
                setLastPointer(null);
                try {
                  (e.target as Element).releasePointerCapture?.(e.pointerId);
                } catch {}
              }}
              onWheel={(e) => {
                e.preventDefault();
                const delta = e.deltaY;
                const factor = Math.exp(-delta * 0.001);
                setZoom((z) => Math.max(0.25, Math.min(3, z * factor)));
              }}
            >
              <defs>
                {Object.entries(RESOURCE_TEXTURE).map(([res, href]) =>
                  href ? (
                    <pattern
                      key={res}
                      id={`tex-${res}`}
                      patternUnits="objectBoundingBox"
                      patternContentUnits="objectBoundingBox"
                      width="1"
                      height="1"
                    >
                      <image href={href} x="0" y="0" width="1" height="1" preserveAspectRatio="xMidYMid slice" />
                    </pattern>
                  ) : null,
                )}
                
              </defs>
              <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                {draftRing && <polygon points={draftRing.points} fill="#0b5d96" stroke="#0c3f6d" strokeWidth={12} opacity={0.9} />}
                {mapDraft.map((hex) => {
                  const resource = hex.resource;
                  const numberToken = hex.numberToken;
                  return (
                    <g key={hex.id} onClick={() => handleHexClick(hex.id)} className="hex">
                      <polygon
                        points={hexPoints(hex)}
                        fill={
                          RESOURCE_TEXTURE[resource as ResourceType | "desert"]
                            ? `url(#tex-${resource})`
                            : RESOURCE_COLOR[resource as ResourceType | "desert"]
                        }
                        stroke={"#f5e0b3"}
                        strokeWidth={6}
                        className="hex-bg"
                      />
                      {numberToken && (
                        <g>
                          {/* token background removed per request */}
                          <image
                            href={`/icons/token_${numberToken}_transparent.png`}
                            x={hex.x - 51}
                            y={hex.y - 36}
                            width={102}
                            height={102}
                            preserveAspectRatio="xMidYMid meet"
                          />
                        </g>
                      )}
                    </g>
                  );
                })}
                {/* render editor vertices and ports */}
                {mapDraft.length > 0 && (() => {
                  const verts = computeVerticesFromHexes(mapDraft);
                  return verts.map((v) => {
                    const port = mapPorts.find((p) => p.vertexKey === v.key);
                    return (
                      <g key={v.key} transform={`translate(${v.x} ${v.y})`} className="editor-vertex" onClick={() => handleEditorVertexClick(v.key)}>
                        <circle cx={0} cy={0} r={6} fill={port ? '#ffcc00' : '#ffffff'} stroke={port ? '#cc9900' : '#333'} strokeWidth={1} opacity={0.95} />
                        {port && (
                          <g transform="translate(12 -6)">
                            <rect x={-8} y={-8} width={40} height={16} rx={4} fill="#0033aa" opacity={0.9} />
                            <text x={0} y={4} fill="#fff" fontSize={10}>{port.ratio}{port.resource && port.resource !== 'any' ? ` ${port.resource[0].toUpperCase()}` : ''}</text>
                          </g>
                        )}
                      </g>
                    );
                  });
                })()}
              </g>
            </svg>
          </div>
        </div>
      ) : (
        <div className="main-layout">
          <div className="board-area">
            <div className="status-bar">
              <div>
                <div className="label">Status</div>
                <div className="value">{turnLabel}</div>
                <div className="hint">{actionHint}</div>
              </div>
              <div className="light-actions">
                <button onClick={() => send({ type: "reset" })}>Reset</button>
                <button onClick={() => send({ type: "start" })} disabled={!state || state.phase !== "lobby"}>
                  Start
                </button>
                <button onClick={() => send({ type: "rollDice" })} disabled={!state || !isMyTurn || state.hasRolled}>
                  Roll
                </button>
                <button
                  onClick={() => send({ type: "endTurn" })}
                  disabled={!state || !isMyTurn || state.phase !== "turn" || !state.hasRolled || state.awaitingRobber}
                >
                  End
                </button>
              </div>
            </div>

            {state && bounds && (
              <div className="board-wrapper">
                <svg className="board" viewBox={`${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`}>
                  <defs>
                    {Object.entries(RESOURCE_TEXTURE).map(([res, href]) =>
                      href ? (
                        <pattern
                          key={res}
                          id={`tex-${res}`}
                          patternUnits="objectBoundingBox"
                          patternContentUnits="objectBoundingBox"
                          width="1"
                          height="1"
                        >
                          <image href={href} x="0" y="0" width="1" height="1" preserveAspectRatio="xMidYMid slice" />
                        </pattern>
                      ) : null,
                    )}
                    
                  </defs>
                  {boardRing && <polygon points={boardRing.points} fill="#0b5d96" stroke="#0c3f6d" strokeWidth={12} opacity={0.9} />}
                  {state.board.hexes.map((hex) => (
                    <g key={hex.id} onClick={() => handleHexClick(hex.id)} className="hex">
                      <polygon
                        points={hexPoints(hex)}
                        fill={
                          RESOURCE_TEXTURE[hex.resource as ResourceType | "desert"]
                            ? `url(#tex-${hex.resource})`
                            : RESOURCE_COLOR[hex.resource as ResourceType | "desert"]
                        }
                        stroke={"#f5e0b3"}
                        strokeWidth={5}
                        opacity={robberMode ? 0.9 : 1}
                        className="hex-bg"
                      />
                      {hex.numberToken && (
                        <g>
                            {/* token background removed per request */}
                            <image
                              href={`/icons/token_${hex.numberToken}_transparent.png`}
                              x={hex.x - 68}
                              y={hex.y - 41.5}
                              width={136}
                              height={119}
                              preserveAspectRatio="xMidYMid meet"
                            />
                        </g>
                      )}
                    </g>
                  ))}
                  {state.board.edges.map((edge) => {
                    const v1 = state.board.vertices.find((v) => v.id === edge.v1);
                    const v2 = state.board.vertices.find((v) => v.id === edge.v2);
                    if (!v1 || !v2) return null;
                    const ownerId = state.edgeOwner[edge.id];
                    const color = ownerId ? playerLookup[ownerId]?.color || "#fff" : "#2f3542";
                    const highlight = highlightEdges.has(edge.id);
                    return (
                      <line
                        key={edge.id}
                        x1={v1.x}
                        y1={v1.y}
                        x2={v2.x}
                        y2={v2.y}
                        stroke={color}
                        strokeWidth={ownerId ? 14 : highlight ? 12 : 8}
                        strokeLinecap="round"
                        opacity={ownerId ? 0.95 : highlight ? 0.9 : 0.75}
                        onClick={() => handleEdgeClick(edge.id)}
                        className="edge"
                      />
                    );
                  })}

                  {state.board.vertices.map((vertex) => {
                    const ownerId = state.vertexOwner[vertex.id];
                    const owner = ownerId ? playerLookup[ownerId] : null;
                    const isCity = owner?.cities.includes(vertex.id);
                    const highlight = highlightVertices.has(vertex.id);
                    return (
                      <g key={vertex.id} onClick={() => handleVertexClick(vertex.id)} className="vertex">
                        <circle
                          cx={vertex.x}
                          cy={vertex.y}
                          r={owner ? (isCity ? 16 : 12) : highlight ? 11 : 8}
                          fill={owner ? owner.color : highlight ? "#2a3352" : "#1b2330"}
                          stroke="#0e1116"
                          strokeWidth={4}
                          opacity={owner ? 1 : highlight ? 0.9 : 0.85}
                        />
                        {isCity && <circle cx={vertex.x} cy={vertex.y} r={8} fill="#fff" opacity={0.8} />}
                      </g>
                    );
                  })}

                  {state.robberHex &&
                    (() => {
                      const hex = state.board.hexes.find((h) => h.id === state.robberHex);
                      if (!hex) return null;
                      return (
                        <g>
                          <circle cx={hex.x} cy={hex.y} r={18} fill="#111" stroke="#fff" strokeWidth={3} />
                          <text x={hex.x} y={hex.y + 5} textAnchor="middle" className="robber-text">
                            R
                          </text>
                        </g>
                      );
                    })()}
                </svg>

                {state && (
              <div className="log-overlay">
                <div className="panel-head">
                  <h3>Log</h3>
                  {state.lastRoll && <span>Roll: {state.lastRoll[0]} + {state.lastRoll[1]}</span>}
                </div>
                <div className="log">
                  {state.log.slice(0, 20).map((entry, idx) => (
                    <div key={idx} className="log-entry">
                      {entry}
                    </div>
                  ))}
                </div>
                <div className="score-recap">
                  <div className="recap-head">Scoreboard</div>
                  {state.players
                    .filter((p) => p.id !== playerId)
                    .map((p) => {
                      const knownVP =
                        p.settlements.length +
                        p.cities.length * 2 +
                        (p.hasLongestRoad ? 2 : 0) +
                        (p.hasLargestArmy ? 2 : 0);
                      return (
                        <div className="recap-row" key={p.id}>
                          <div className="recap-name">
                            <span className="dot" style={{ background: p.color }} />
                            {p.name}
                          </div>
                          <div className="recap-metrics">
                            <span className="pill small">VP (public): {knownVP}</span>
                            <span
                              className={`pill small icon-pill ${p.hasLargestArmy ? "highlight" : ""}`}
                              title="Largest Army"
                            >
                              🛡 {p.playedKnights}
                            </span>
                            <span
                              className={`pill small icon-pill ${p.hasLongestRoad ? "highlight" : ""}`}
                              title="Longest Road"
                            >
                              🛣 {p.longestRoadLength}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

                <div className="action-bar">
                  <div className="action-buttons">
                    {(["settlement", "city", "road"] as PaletteTool[]).map((tool) => (
                      <button
                        key={tool}
                        className={`action-btn ${paletteMode === tool ? "active" : ""}`}
                        onClick={() => {
                          setPaletteMode(tool);
                          setBuildMode(tool === "robber" ? null : tool);
                          setRobberMode(false);
                          setPendingKnight(false);
                        }}
                        disabled={!isMyTurn}
                        title={tool}
                      >
                        <div className="action-icon">{PaletteIcons[tool]}</div>
                        <div className="action-text">{tool}</div>
                      </button>
                    ))}
                    <button
                      className="action-btn"
                      onClick={() => {
                        send({ type: "buyDevCard" });
                      }}
                      disabled={!isMyTurn || !state || state.phase !== "turn"}
                      title="Buy development card"
                    >
                      <div className="action-icon">{DEV_ICONS.victory_point}</div>
                      <div className="action-text">Dev</div>
                    </button>
                    <button
                      className="action-btn"
                      onClick={() => {
                        setPaletteMode(null);
                        setBuildMode(null);
                        setRobberMode(false);
                        setPendingKnight(false);
                      }}
                    >
                      <div className="action-text">?</div>
                    </button>
                  </div>
                  <div className="cheat-box">
                    <select value={cheatRes} onChange={(e) => setCheatRes(e.target.value as ResourceType)}>
                      {(["brick", "lumber", "wool", "grain", "ore"] as ResourceType[]).map((r) => (
                        <option key={r} value={r}>
                          + {r}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={cheatAmt}
                      onChange={(e) => setCheatAmt(Number(e.target.value) || 1)}
                    />
                    <button onClick={() => send({ type: "cheatGain", resource: cheatRes, amount: cheatAmt })}>
                      Add
                    </button>
                  </div>
                </div>

                {me && (
                  <div className="hand-overlay">
                    <div className="hand-card-row">
                      {renderResourceCard("brick", me.resources.brick)}
                      {renderResourceCard("lumber", me.resources.lumber)}
                      {renderResourceCard("wool", me.resources.wool)}
                      {renderResourceCard("grain", me.resources.grain)}
                      {renderResourceCard("ore", me.resources.ore)}
                    </div>
                    <div className="dev-hand-row">
                      {(["knight", "victory_point", "monopoly", "year_of_plenty", "road_building"] as DevCardType[]).map((d) => {
                        const count = devCounts[d];
                        if (!count) return null;
                        const src = DEV_IMG[d];
                        const label = d.replace(/_/g, " ");
                        return (
                          <button
                            type="button"
                            className={`dev-card-stack ${selectedDev === d ? "selected" : ""}`}
                            key={d}
                            onClick={() => setSelectedDev(d)}
                            title={`Select ${label}`}
                          >
                            <div className="dev-card-fallback">{label}</div>
                            {src && (
                              <img
                                src={src}
                                alt={label}
                                className="dev-card-img"
                                onError={(e) => {
                                  e.currentTarget.classList.add("hidden");
                                }}
                              />
                            )}
                            <div className="dev-count-badge">{count}</div>
                          </button>
                        );
                      })}
                    </div>
                    {selectedDev && (
                      <div className="dev-play-row">
                        {selectedDev === "monopoly" && (
                          <select value={monoResource} onChange={(e) => setMonoResource(e.target.value as ResourceType)}>
                            {Object.keys(RESOURCE_LABEL).map((r) => (
                              <option key={r} value={r}>
                                {RESOURCE_LABEL[r as ResourceType]}
                              </option>
                            ))}
                          </select>
                        )}
                        {selectedDev === "year_of_plenty" && (
                          <>
                            <select value={yopA} onChange={(e) => setYopA(e.target.value as ResourceType)}>
                              {Object.keys(RESOURCE_LABEL).map((r) => (
                                <option key={r} value={r}>
                                  {RESOURCE_LABEL[r as ResourceType]}
                                </option>
                              ))}
                            </select>
                            <select value={yopB} onChange={(e) => setYopB(e.target.value as ResourceType)}>
                              {Object.keys(RESOURCE_LABEL).map((r) => (
                                <option key={r} value={r}>
                                  {RESOURCE_LABEL[r as ResourceType]}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                        <button className="dev-confirm" onClick={playSelectedDev} disabled={!isMyTurn || state?.phase !== "turn" || me?.devPlayedThisTurn}>
                          ✅
                        </button>
                        <button className="dev-cancel" onClick={() => setSelectedDev(null)}>
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="side-column">
            <div className="panel players-panel">
              <div className="panel-head">
                <h3>Players</h3>
              </div>
              <div className="players">
                {state?.players.map((p) => (
                  <div
                    key={p.id}
                    className={`player-card ${p.id === playerId ? "me" : ""} ${activePlayer?.id === p.id ? "active" : ""}`}
                    style={{ borderColor: p.color }}
                  >
                    <div className="player-top">
                      <div className="player-name">
                        <span className="dot" style={{ background: p.color }} />
                        {p.name}
                      </div>
                      <div className="vp">{p.victoryPoints} VP</div>
                    </div>
                    <div className="tags">
                      {p.hasLargestArmy && <span>Largest Army</span>}
                      {p.hasLongestRoad && <span>Longest Road</span>}
                    </div>
                    <div className="resource-row hand-card-row">
                      {renderResourceCard("brick", p.resources.brick)}
                      {renderResourceCard("lumber", p.resources.lumber)}
                      {renderResourceCard("wool", p.resources.wool)}
                      {renderResourceCard("grain", p.resources.grain)}
                      {renderResourceCard("ore", p.resources.ore)}
                      {renderResourceCard("gold", p.resources.gold)}
                    </div>
                    <div className="meta">
                      Roads {p.roads.length}, Settlements {p.settlements.length}, Cities {p.cities.length}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
