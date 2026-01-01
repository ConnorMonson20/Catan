import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, JSX, MouseEvent, PointerEvent, SetStateAction } from "react";
import type { ClientMessage, DevCardType, DraftTile, PublicGameState, ResourceType, HexResource, ServerMessage, TeamId, TeamMapMode, SpellType } from "./types";

const HEX_SIZE = 100;
const SQRT3 = Math.sqrt(3);
// radius 4 produces a 9x9 axial grid (q/r from -4..4)
const DEFAULT_EDITOR_RADIUS = 4;
const MIN_BOARD_ZOOM = 0.4;
const MAX_BOARD_ZOOM = 2.5;
const BOARD_DRAG_THRESHOLD = 4;
const SERVER_1_URL = "ws://3.236.184.118:3001";

const RESOURCE_LABEL: Record<ResourceType, string> = {
  brick: "Brick",
  lumber: "Wood",
  wool: "Sheep",
  grain: "Wheat",
  ore: "Stone",
  gold: "Gold",
};
const HEX_RESOURCE_LABEL: Record<HexResource | "empty", string> = {
  ...RESOURCE_LABEL,
  desert: "Desert",
  water: "Water",
  water_port: "Water Port",
  cloud: "Cloud",
  dev: "Dev",
  empty: "Empty",
};
const GOLD_CHOICE_RESOURCES: ResourceType[] = ["brick", "lumber", "wool", "grain", "ore"];
const TRADE_RESOURCES: ResourceType[] = ["brick", "lumber", "wool", "grain", "ore"];
type BankResourceType = Exclude<ResourceType, "gold">;
const RESOURCE_SHORT_LABEL: Record<ResourceType, string> = {
  brick: "Br",
  lumber: "Lu",
  wool: "Wo",
  grain: "Gr",
  ore: "Or",
  gold: "Go",
};
const BANK_RESOURCE_TYPES: BankResourceType[] = ["brick", "lumber", "wool", "grain", "ore"];
const BANK_RESOURCE_TOTALS: Record<BankResourceType, number> = {
  brick: 25,
  lumber: 25,
  wool: 25,
  grain: 25,
  ore: 25,
};
const BASE_RESOURCE_TYPES: ResourceType[] = ["brick", "lumber", "wool", "grain", "ore", "gold"];
const NUMBER_TOKEN_RESOURCES = new Set<string>([...BASE_RESOURCE_TYPES, "cloud", "dev"]);

const WATER_TEXTURE = "/tiles/water2.png";
// Slight overscan to trim baked-in borders from tile PNGs.
const TILE_TEXTURE_SCALE = 1.13;
const TEXTURE_SCALE_MULTIPLIER: Partial<Record<ResourceType | "desert" | "empty" | "water" | "cloud" | "dev", number>> = {
  gold: 1.05,
};
const getTextureScale = (resource: ResourceType | "desert" | "empty" | "water" | "cloud" | "dev") =>
  TILE_TEXTURE_SCALE * (TEXTURE_SCALE_MULTIPLIER[resource] ?? 1);
const getTextureOffset = (scale: number) => (1 - scale) / 2;

const RESOURCE_COLOR: Record<ResourceType | "desert" | "empty" | "water" | "cloud" | "dev", string> = {
  brick: "#e67e36",
  lumber: "#1f7f3f",
  wool: "#7bcf5d",
  grain: "#e5c247",
  ore: "#9aa0a5",
  desert: "#d7c29c",
  gold: "#f1b500",
  dev: "#4b8fa8",
  empty: "transparent",
  water: "#0b5d96",
  cloud: "#dce7f5",
};

// Optional PNG textures for resource tiles (drop images in /public/tiles/*.png)
const RESOURCE_TEXTURE: Partial<Record<ResourceType | "desert" | "empty" | "water" | "cloud" | "dev", string>> = {
  brick: "/tiles/brick2.png",
  lumber: "/tiles/wood2.png",
  wool: "/tiles/sheep2.png",
  grain: "/tiles/wheat2.png",
  ore: "/tiles/stone2.png",
  desert: "/tiles/desert_tile.png",
  gold: "/tiles/gold2.png",
  dev: "/tiles/dev.png",
  empty: "",
  water: WATER_TEXTURE,
  cloud: "",
};
type TextureResource = ResourceType | "desert" | "water" | "cloud" | "dev";
const BRIDGE_ICON = "/icons/bridges/bridge.png";

const PLAYER_COLORS = ["#d13b3b", "#e6952d", "#2b7de0", "#3aa655", "#8e4ec6"] as const;
type PlayerColor = (typeof PLAYER_COLORS)[number];
const DEFAULT_PLAYER_COLOR: PlayerColor = PLAYER_COLORS[0];
const PLAYER_COLOR_LABEL: Record<PlayerColor, string> = {
  "#d13b3b": "Red",
  "#e6952d": "Yellow",
  "#2b7de0": "Blue",
  "#3aa655": "Green",
  "#8e4ec6": "Purple",
};

const SETTLEMENT_ICON: Record<PlayerColor, string> = {
  "#d13b3b": "/icons/settlement_red_128_shaded.png",
  "#e6952d": "/icons/settlement_yellow_128_shaded.png",
  "#2b7de0": "/icons/settlement_blue.png",
  "#3aa655": "/icons/settlement_green_128_shaded.png",
  "#8e4ec6": "/icons/settlement_purple_128_shaded.png",
};

const CITY_ICON: Record<PlayerColor, string> = {
  "#d13b3b": "/icons/city_red2.png",
  "#e6952d": "/icons/city_yellow2.png",
  "#2b7de0": "/icons/city_blue2.png",
  "#3aa655": "/icons/city_green2.png",
  "#8e4ec6": "/icons/city_purple2.png",
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
const PORT_ICON: Partial<Record<ResourceType, string>> = {
  brick: "/icons/ports/brick_port.png",
  lumber: "/icons/ports/wood_port.png",
  wool: "/icons/ports/sheep_port.png",
  grain: "/icons/ports/wheat_port.png",
  ore: "/icons/ports/stone_port.png",
};
const ANY_PORT_ICON = "/icons/ports/3_for_1.png";
const PORT_ICON_SIZE = HEX_SIZE * 0.9;
const PIECE_ICON_SIZE = 56;

const emptyResources = (): Record<ResourceType, number> => ({
  brick: 0,
  lumber: 0,
  wool: 0,
  grain: 0,
  ore: 0,
  gold: 0,
});

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
      <rect x="4" y="10" width="6" height="10" rx="1" fill="none" stroke="var(--city-color)" strokeWidth="2" />
      <rect x="12" y="6" width="8" height="14" rx="1" fill="none" stroke="var(--city-color)" strokeWidth="2" />
      <path d="M14 6l2-2 2 2" fill="none" stroke="var(--city-color)" strokeWidth="2" />
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

const SPELL_LIST: SpellType[] = [
  "tectonic_shift",
  "fertile_ground",
  "seismic_rotation",
  "safe_haven",
  "selective_harvest",
  "second_chance",
  "fortunes_favor",
  "switcheroo",
  "smuggler",
  "skilled_labor",
  "coordinated_trade",
  "double_cross",
  "shadow_move",
  "market_disruption",
  "copycat",
];
const SPELL_PICKS_PER_TEAM = 3;
const SPELL_LABEL: Record<SpellType, string> = {
  tectonic_shift: "Tectonic Shift",
  fertile_ground: "Fertile Ground",
  seismic_rotation: "Seismic Rotation",
  safe_haven: "Safe Haven",
  selective_harvest: "Selective Harvest",
  second_chance: "Second Chance",
  fortunes_favor: "Fortune's Favor",
  switcheroo: "Switcheroo",
  smuggler: "Smuggler",
  skilled_labor: "Skilled Labor",
  coordinated_trade: "Coordinated Trade",
  double_cross: "Double Cross",
  shadow_move: "Shadow Move",
  market_disruption: "Market Disruption",
  copycat: "Copycat",
};
const SPELL_DESCRIPTION: Record<SpellType, string> = {
  tectonic_shift: "Swap two non-6/8 number tokens on land hexes.",
  fertile_ground: "Adjust a land number token by +/-1 (no 6/8).",
  seismic_rotation: "Rotate three adjacent land hexes clockwise.",
  safe_haven: "Robber cannot block this hex for 6 turns.",
  selective_harvest: "Choose a number; only it produces this turn.",
  second_chance: "Reroll once (not on a 7).",
  fortunes_favor: "Gain 1 Gold on every 2 or 12.",
  switcheroo: "Swap all of one resource into another.",
  smuggler: "Bank trades are 2:1 this turn.",
  skilled_labor: "Pay 1, build a settlement for 3 resources.",
  coordinated_trade: "One teammate gets a single 2:1 trade.",
  double_cross: "Team 7s steal 2 from opponents.",
  shadow_move: "Move robber after production.",
  market_disruption: "Pay 2; make an opponent discard 1.",
  copycat: "Copy the last dev card played.",
};
const EMPTY_SPELL_COUNTS = SPELL_LIST.reduce((acc, spell) => {
  acc[spell] = 0;
  return acc;
}, {} as Record<SpellType, number>);

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

function darkenHex(hex: string, amount: number) {
  const normalized = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  if (!/^#([0-9a-fA-F]{6})$/.test(normalized)) return hex;
  const value = parseInt(normalized.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((value >> 16) & 0xff) * (1 - amount))));
  const g = Math.max(0, Math.min(255, Math.round(((value >> 8) & 0xff) * (1 - amount))));
  const b = Math.max(0, Math.min(255, Math.round((value & 0xff) * (1 - amount))));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
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

function edgeKeyForCoords(a: { x: number; y: number }, b: { x: number; y: number }) {
  const norm = (p: { x: number; y: number }) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
  return [norm(a), norm(b)].sort().join("|");
}

function computeGraphFromHexes(hexes: Array<{ id: string; x: number; y: number }>) {
  const vertexLookup = new Map<string, { id: string; x: number; y: number }>();
  const edgesLookup = new Map<
    string,
    { id: string; v1: string; v2: string; hexes: Set<string> }
  >();
  const vertexHexes = new Map<string, Set<string>>();
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
      const edgeKey = [a, b].sort().join("|");
      if (!edgesLookup.has(edgeKey)) {
        const id = `e${edgesLookup.size}`;
        edgesLookup.set(edgeKey, { id, v1: a, v2: b, hexes: new Set() });
      }
      edgesLookup.get(edgeKey)!.hexes.add(hex.id);
    }
  }
  const vertices = Array.from(vertexLookup.entries()).map(([key, v]) => ({ key, id: v.id, x: v.x, y: v.y }));
  const edges = Array.from(edgesLookup.entries()).map(([key, e]) => ({
    key,
    id: e.id,
    v1: e.v1,
    v2: e.v2,
    hexCount: e.hexes.size,
  }));
  return { vertices, edges, vertexHexes };
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

function randomizeNumberTokens(
  hexes: Array<{ resource: HexResource | "empty"; numberToken?: number }>,
) {
  const tokens = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
  const shuffled = tokens
    .map((t) => ({ t, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.t);
  let idx = 0;
  for (const hex of hexes) {
    if (!NUMBER_TOKEN_RESOURCES.has(hex.resource as string)) continue;
    hex.numberToken = shuffled[idx % shuffled.length];
    idx += 1;
  }
}
export default function App() {
  const [serverUrl, setServerUrl] = useLocalStorage("catan-server-url", "ws://localhost:3001");
  const [serverUrlInput, setServerUrlInput] = useState(serverUrl);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [state, setState] = useState<PublicGameState | null>(null);
  const [playerId, setPlayerId] = useLocalStorage("catan-player-id", "");
  const [joined, setJoined] = useState(false);
  const [name, setName] = useLocalStorage("catan-name", "");
  const [playerColor, setPlayerColor] = useLocalStorage("catan-color", DEFAULT_PLAYER_COLOR);
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
  const [pendingRoadDev, setPendingRoadDev] = useState(0);
  const [mapDraft, setMapDraft] = useState<
    { id: string; q: number; r: number; x: number; y: number; resource: HexResource | "empty"; numberToken?: number }[]
  >([]);
  const [mapName, setMapName] = useState<string>("");
  const [mapStatus, setMapStatus] = useState<string>("");
  const [mapFileName, setMapFileName] = useState<string>("");
  const [vpGoal, setVpGoal] = useState<number>(10);
  const [discardLimit, setDiscardLimit] = useState<number>(7);
  const [teamMode, setTeamMode] = useState(false);
  const [teamMapMode, setTeamMapMode] = useState<TeamMapMode>("preloaded");
  const [portBridges, setPortBridges] = useState<{ portId: string; vertices: string[] }[]>([]);
  const [bridgeSelectPort, setBridgeSelectPort] = useState<string | null>(null);
  const [portMode, setPortMode] = useState(false);
  const [portRatio, setPortRatio] = useState<2 | 3>(3);
  const [portResource, setPortResource] = useState<ResourceType | 'any'>('any');
  const [numberMode, setNumberMode] = useState<boolean>(false);
  const [discardSelection, setDiscardSelection] = useState<Record<ResourceType, number>>(emptyResources());
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [tradeGive, setTradeGive] = useState<Partial<Record<ResourceType, number>>>({});
  const [tradeGet, setTradeGet] = useState<Partial<Record<ResourceType, number>>>({});
  const [tradeTarget, setTradeTarget] = useState<string>("all");
  const [tradeOpen, setTradeOpen] = useState(false);
  const [tradeTab, setTradeTab] = useState<"player" | "bank">("player");
  const [bankGive, setBankGive] = useState<ResourceType>("brick");
  const [bankGet, setBankGet] = useState<ResourceType>("grain");
  const boardFullscreen = true;
  const [logCollapsed, setLogCollapsed] = useState(false);
  const [pendingBoard, setPendingBoard] = useState<{
    hexes: Array<{ id: string; q: number; r: number; resource: HexResource; numberToken?: number }>;
    ports: Array<{ id?: string; vertexKey?: string; ratio: 2 | 3; resource?: ResourceType | 'any'; bridges?: string[] }>;
  } | null>(null);
  const [robberVisible, setRobberVisible] = useState(false);
  const [joinInFlight, setJoinInFlight] = useState(false);
  const ready = status === "connected" && !!state && !!playerId && joined;
  const inLobby = state?.phase === "lobby";
  const inDraftPhase = state?.phase === "draft";
  const showLobbyScreen = !ready || inLobby;
  const lockJoinFields = joined && status === "connected";
  const draftModeActive = !!state?.teamMode && state?.teamMapMode === "draft";
  const draftPhase = state?.draftPhase;
  const isHost = !!state?.hostId && state.hostId === playerId;
  // pan & zoom for the editor (Shift+drag to pan, scroll to zoom)
  const svgRef = useRef<SVGSVGElement | null>(null);
  const boardWrapperRef = useRef<HTMLDivElement | null>(null);
  const boardZoomRef = useRef(1);
  const boardZoomElRef = useRef<HTMLDivElement | null>(null);
  const boardPanRef = useRef({ x: 0, y: 0 });
  const boardDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const boardLastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const boardDragActiveRef = useRef(false);
  const boardSuppressClickRef = useRef(false);
  const boardPanNextRef = useRef<{ x: number; y: number } | null>(null);
  const boardPanRafRef = useRef<number | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPointer, setLastPointer] = useState<{ x: number; y: number } | null>(null);
  const [boardDragging, setBoardDragging] = useState(false);
  const connectLockRef = useRef(false);
  const joinInFlightRef = useRef(false);
  const closeOnJoinErrorRef = useRef(false);
  const awaitStateJoinRef = useRef(false);
  const joinSentRef = useRef(false);
  const joinPayloadRef = useRef<{ name: string; color: PlayerColor; playerId?: string } | null>(null);
  const autoJoinKeyRef = useRef<string>("");
  const autoJoinAttemptRef = useRef(false);
  const skipAutoJoinRef = useRef(false);
  const lastSettingsRef = useRef<{ vpGoal: number; discardLimit: number; teamMode: boolean; teamMapMode: TeamMapMode } | null>(null);
  const prevShowLobbyRef = useRef(showLobbyScreen);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lobbyFileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedDev, setSelectedDev] = useState<DevCardType | null>(null);
  const [activeSpell, setActiveSpell] = useState<SpellType | null>(null);
  const [showSpells, setShowSpells] = useState(false);
  const [spellTargets, setSpellTargets] = useState<string[]>([]);
  const [fertileDelta, setFertileDelta] = useState<1 | -1>(1);
  const [selectiveHarvestNumber, setSelectiveHarvestNumber] = useState<number>(6);
  const [switcherooFrom, setSwitcherooFrom] = useState<ResourceType>("brick");
  const [switcherooTo, setSwitcherooTo] = useState<ResourceType>("grain");
  const [skilledLaborPay, setSkilledLaborPay] = useState<ResourceType>("brick");
  const [skilledLaborSkip, setSkilledLaborSkip] = useState<ResourceType>("lumber");
  const [marketTargetId, setMarketTargetId] = useState<string>("");
  const [marketDiscardResource, setMarketDiscardResource] = useState<ResourceType>("brick");
  const [marketPay, setMarketPay] = useState<Partial<Record<ResourceType, number>>>({});
  const [mapPage, setMapPage] = useState(false);
  const mapPageRef = useRef<boolean>(false);
  const prevCustomMapRef = useRef<boolean | null>(null);
  const [draftMapPage, setDraftMapPage] = useState(false);
  const [selectedDraftTileId, setSelectedDraftTileId] = useState<string | null>(null);
  const [draftBidAmount, setDraftBidAmount] = useState<number>(1);
  // fixed palette is driven by server player colors; no client-side overrides
  const [cityColor] = useState('#ffd166');
  const [cityColor2] = useState('#ffb703');
  const [roadColor] = useState('#8b5a2b');
  const [editResource, setEditResource] = useState<ResourceType | "desert" | "empty" | "water" | "water_port" | "cloud" | "dev">("empty");
  const [editNumber, setEditNumber] = useState<number | "">("");

  const applyBoardZoom = useCallback((value: number) => {
    const next = Math.max(MIN_BOARD_ZOOM, Math.min(MAX_BOARD_ZOOM, value));
    boardZoomRef.current = next;
    if (boardZoomElRef.current) {
      const panPos = boardPanRef.current;
      boardZoomElRef.current.style.transform = `translate(${panPos.x}px, ${panPos.y}px) scale(${next})`;
    }
  }, []);

  const applyBoardPan = useCallback((nextPan: { x: number; y: number }) => {
    boardPanRef.current = nextPan;
    if (boardZoomElRef.current) {
      const zoomValue = boardZoomRef.current;
      boardZoomElRef.current.style.transform = `translate(${nextPan.x}px, ${nextPan.y}px) scale(${zoomValue})`;
    }
  }, []);

  const handleBoardPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    boardDragActiveRef.current = true;
    boardDragStartRef.current = { x: e.clientX, y: e.clientY };
    boardLastPointerRef.current = { x: e.clientX, y: e.clientY };
    boardSuppressClickRef.current = false;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  }, []);

  const handleBoardPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!boardDragActiveRef.current || !boardLastPointerRef.current || !boardDragStartRef.current) return;
    const totalDx = e.clientX - boardDragStartRef.current.x;
    const totalDy = e.clientY - boardDragStartRef.current.y;
    if (!boardSuppressClickRef.current) {
      if (Math.hypot(totalDx, totalDy) < BOARD_DRAG_THRESHOLD) {
        return;
      }
      boardSuppressClickRef.current = true;
      setBoardDragging(true);
    }
    const dx = e.clientX - boardLastPointerRef.current.x;
    const dy = e.clientY - boardLastPointerRef.current.y;
    const base = boardPanNextRef.current ?? boardPanRef.current;
    boardPanNextRef.current = { x: base.x + dx, y: base.y + dy };
    if (boardPanRafRef.current === null) {
      boardPanRafRef.current = window.requestAnimationFrame(() => {
        const pending = boardPanNextRef.current;
        if (pending) {
          applyBoardPan(pending);
          boardPanNextRef.current = null;
        }
        boardPanRafRef.current = null;
      });
    }
    boardLastPointerRef.current = { x: e.clientX, y: e.clientY };
  }, [applyBoardPan]);

  const handleBoardPointerEnd = useCallback((e?: PointerEvent<HTMLDivElement>) => {
    if (!boardDragActiveRef.current) return;
    boardDragActiveRef.current = false;
    boardDragStartRef.current = null;
    boardLastPointerRef.current = null;
    setBoardDragging(false);
    if (boardPanRafRef.current !== null) {
      cancelAnimationFrame(boardPanRafRef.current);
      boardPanRafRef.current = null;
    }
    if (boardPanNextRef.current) {
      applyBoardPan(boardPanNextRef.current);
      boardPanNextRef.current = null;
    }
    if (e) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  }, [applyBoardPan]);

  const handleBoardClickCapture = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (!boardSuppressClickRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    boardSuppressClickRef.current = false;
  }, []);

  const applyBoardFromJson = (parsed: any, nameHint?: string) => {
    const rawHexes = parsed.hexes || parsed.board?.hexes;
    if (!Array.isArray(rawHexes)) throw new Error('No hex array');
    const hexes = rawHexes.map((h: any, idx: number) => {
      const q = Number(h.q);
      const r = Number(h.r);
      const { x, y } = axialToPixel(q, r);
      return {
        id: h.id || `hex-${idx}`,
        q,
        r,
        x,
        y,
        resource: (h.resource as ResourceType | "desert" | "empty" | "water" | "water_port" | "cloud" | "dev") || "empty",
        numberToken: typeof h.numberToken === 'number' ? h.numberToken : undefined,
      };
    });
    const hasNumberTokens = hexes.some(
      (h) => NUMBER_TOKEN_RESOURCES.has(h.resource as string) && typeof h.numberToken === "number",
    );
    const hasEligibleTiles = hexes.some((h) => NUMBER_TOKEN_RESOURCES.has(h.resource as string));
    const randomizedNumbers = !hasNumberTokens && hasEligibleTiles;
    if (randomizedNumbers) {
      randomizeNumberTokens(hexes);
    }
    const portsFromFile = Array.isArray(parsed.ports) ? parsed.ports : [];
    const hexesForServer = hexes
      .filter((h) => h.resource !== "empty")
      .map(({ x, y, resource, ...rest }) => ({
        ...rest,
        resource: (resource === "water_port" ? "water" : resource) as HexResource,
      }));
    setPendingBoard({ hexes: hexesForServer, ports: portsFromFile });
    const nextName = nameHint || parsed.name || "Custom Map";
    setMapName(nextName);
    setMapFileName(nameHint || "custom-map.json");
    setMapStatus(randomizedNumbers ? "Loaded (randomized numbers)" : "Loaded (pending apply)");
    if (ws && status === "connected" && state?.phase === "lobby" && joined && playerId) {
      send({ type: "setCustomBoard", hexes: hexesForServer as any, ports: portsFromFile });
      setPendingBoard(null);
      setMapStatus("Sent to server");
    }
    setMapDraft(hexes as any);
    setPortBridges([]);
    setBridgeSelectPort(null);
    setError("");
  };

  const persistMapJson = async (
    payload: { hexes: Array<{ id: string; q: number; r: number; resource: HexResource; numberToken?: number }>; ports: Array<{ id?: string; vertexKey?: string; ratio: 2 | 3; resource?: ResourceType | 'any'; bridges?: string[] }> },
    filename: string,
  ) => {
    const json = JSON.stringify(payload, null, 2);
    const win = window as Window & { showSaveFilePicker?: (options?: any) => Promise<any> };
    if (win.showSaveFilePicker) {
      try {
        const handle = await win.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        return;
      } catch {
        // fall back to a download if the user cancels or the API fails
      }
    }
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

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
      return { id: `${c.q},${c.r},${idx}`, q: c.q, r: c.r, x, y, resource: "empty" as const, numberToken: undefined };
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

  const draftGraph = useMemo(() => computeGraphFromHexes(mapDraft), [mapDraft]);

  const mapPorts = useMemo(
    () => mapDraft.filter((h) => h.resource === "water_port").map((h) => ({ id: h.id, ratio: portRatio, resource: portResource })),
    [mapDraft, portRatio, portResource],
  );

  const portVertexInfo = useMemo(() => {
    const hexById = new Map(mapDraft.map((h) => [h.id, h]));
    const eligible = new Set<string>();
    const portToVertices = new Map<string, string[]>();
    const vertexToPorts = new Map<string, string[]>();
    draftGraph.vertexHexes.forEach((hexes, vertexId) => {
      const touchingPorts: string[] = [];
      let touchesLand = false;
      hexes.forEach((hid) => {
        const hx = hexById.get(hid);
        if (!hx) return;
        if (hx.resource === "water_port") touchingPorts.push(hid);
        if (!["empty", "water", "water_port"].includes(hx.resource)) touchesLand = true;
      });
      if (!touchingPorts.length || !touchesLand) return;
      eligible.add(vertexId);
      touchingPorts.forEach((pid) => {
        const arr = portToVertices.get(pid) || [];
        arr.push(vertexId);
        portToVertices.set(pid, arr);
        const rev = vertexToPorts.get(vertexId) || [];
        rev.push(pid);
        vertexToPorts.set(vertexId, rev);
      });
    });
    return { eligible, portToVertices, vertexToPorts };
  }, [mapDraft, draftGraph]);

  // prune bridges that reference missing ports
  useEffect(() => {
    const validIds = new Set(mapPorts.map((p) => p.id));
    setPortBridges((prev) => prev.filter((b) => validIds.has(b.portId)));
    if (bridgeSelectPort && !validIds.has(bridgeSelectPort)) setBridgeSelectPort(null);
  }, [mapPorts, bridgeSelectPort]);

  const visibleDraftVertices = useMemo(() => {
    const verts = computeGraphFromHexes(mapDraft.filter((h) => h.resource !== "empty")).vertices;
    return new Set(verts.map((v) => v.key));
  }, [mapDraft]);

  const handleBridgeVertexClick = (vertexId: string) => {
    if (!mapPage || !portMode) return;
    if (!portVertexInfo.eligible.has(vertexId)) return;
    const portsForVertex = portVertexInfo.vertexToPorts.get(vertexId) || [];
    const portId = portsForVertex[0];
    if (!portId) return;
    togglePortBridge(portId, vertexId, new Set([vertexId]));
  };

  const visibleGraph = useMemo(() => {
    if (!state) return { edges: new Set<string>(), vertices: new Set<string>() };
    const edges = new Set<string>();
    const vertices = new Set<string>();
    for (const hex of state.board.hexes) {
      if ((hex as any).resource === "empty") continue;
      const center = { x: hex.x, y: hex.y };
      const corners = Array.from({ length: 6 }, (_, i) => {
        const angle = (Math.PI / 180) * (60 * i - 30);
        return { x: center.x + HEX_SIZE * Math.cos(angle), y: center.y + HEX_SIZE * Math.sin(angle) };
      });
      for (let i = 0; i < 6; i++) {
        const a = corners[i];
        const b = corners[(i + 1) % 6];
        const key = edgeKeyForCoords(a, b);
        edges.add(key);
      }
    }
    // find which vertices are touched by a visible edge
    for (const edge of state.board.edges) {
      const v1 = state.board.vertices.find((v) => v.id === edge.v1);
      const v2 = state.board.vertices.find((v) => v.id === edge.v2);
      if (!v1 || !v2) continue;
      const key = edgeKeyForCoords(v1, v2);
      if (!edges.has(key)) continue;
      vertices.add(v1.id);
      vertices.add(v2.id);
    }
    return { edges, vertices };
  }, [state]);

  const landEdgeIds = useMemo(() => {
    const set = new Set<string>();
    if (!state) return set;
    const hexById = new Map(state.board.hexes.map((h) => [h.id, h.resource]));
    const vertexHexes = state.board.vertexHexes || {};
    for (const edge of state.board.edges) {
      const a = vertexHexes[edge.v1] || [];
      const b = vertexHexes[edge.v2] || [];
      const [small, big] = a.length <= b.length ? [a, b] : [b, a];
      const bigSet = new Set(big);
      for (const hid of small) {
        if (!bigSet.has(hid)) continue;
        const res = hexById.get(hid);
        if (res && res !== "water") {
          set.add(edge.id);
          break;
        }
      }
    }
    return set;
  }, [state]);

  const landVertexIds = useMemo(() => {
    const set = new Set<string>();
    if (!state) return set;
    const hexById = new Map(state.board.hexes.map((h) => [h.id, h.resource]));
    for (const [vertexId, hexIds] of Object.entries(state.board.vertexHexes || {})) {
      const touchesLand = hexIds.some((hid) => {
        const res = hexById.get(hid);
        return res && res !== "water";
      });
      if (touchesLand) set.add(vertexId);
    }
    return set;
  }, [state]);


  useEffect(() => {
    mapPageRef.current = mapPage;
  }, [mapPage]);

  useEffect(() => {
    const shouldLock = !showLobbyScreen && !mapPage;
    document.body.classList.toggle("no-scroll", shouldLock);
    return () => document.body.classList.remove("no-scroll");
  }, [showLobbyScreen, mapPage]);

  useEffect(() => {
    if (prevShowLobbyRef.current && !showLobbyScreen) {
      boardPanRef.current = { x: 0, y: 0 };
      boardPanNextRef.current = null;
      if (boardPanRafRef.current !== null) {
        cancelAnimationFrame(boardPanRafRef.current);
        boardPanRafRef.current = null;
      }
      setBoardDragging(false);
      applyBoardZoom(1);
    }
    prevShowLobbyRef.current = showLobbyScreen;
  }, [showLobbyScreen, applyBoardZoom]);

  useEffect(() => {
    if (!state || !joined || !playerId) return;
    const stillPresent = state.players.some((p) => p.id === playerId);
    if (!stillPresent) {
      setJoined(false);
      setPlayerId("");
      setPendingBoard(null);
      setMapName("");
      setMapStatus("");
      setMapFileName("");
      setMapDraft(editorGrid);
      setPortBridges([]);
      setBridgeSelectPort(null);
      setPortMode(false);
      setNumberMode(false);
      mapPageRef.current = false;
      setMapPage(false);
    }
  }, [state, joined, playerId, editorGrid, setPlayerId]);

  useEffect(() => {
    if (status !== "connected") return;
    if (!state || !playerId) return;
    const stillPresent = state.players.some((p) => p.id === playerId);
    if (stillPresent && !joined) {
      setJoined(true);
      joinInFlightRef.current = false;
      awaitStateJoinRef.current = false;
      joinSentRef.current = false;
      closeOnJoinErrorRef.current = false;
      setJoinInFlight(false);
    }
  }, [state, joined, playerId, status]);

  useEffect(() => {
    if (status !== "connected") return;
    if (!state || joined || playerId) return;
    const normalized = name.trim().toLowerCase();
    if (!normalized) return;
    const matches = state.players.filter((p) => p.name.trim().toLowerCase() === normalized);
    if (matches.length !== 1) return;
    const match = matches[0];
    const colorMatch = match.color === playerColor;
    if (state.players.length === 1 || colorMatch) {
      setPlayerId(match.id);
      setJoined(true);
      joinInFlightRef.current = false;
      awaitStateJoinRef.current = false;
      joinSentRef.current = false;
      closeOnJoinErrorRef.current = false;
      setJoinInFlight(false);
    }
  }, [state, joined, playerId, name, playerColor, setPlayerId, status]);

  useEffect(() => {
    if (!state) return;
    if (typeof state.victoryPointsToWin === "number") setVpGoal(state.victoryPointsToWin);
    if (typeof state.discardLimit === "number") setDiscardLimit(state.discardLimit);
    if (typeof state.teamMode === "boolean") setTeamMode(state.teamMode);
    if (state.teamMapMode) setTeamMapMode(state.teamMapMode);
  }, [state?.victoryPointsToWin, state?.discardLimit, state?.teamMode, state?.teamMapMode]);

  useEffect(() => {
    if (!state || state.phase !== "lobby") return;
    if (!joined || status !== "connected") return;
    if (!Number.isFinite(vpGoal) || !Number.isFinite(discardLimit)) return;
    if (vpGoal < 3 || vpGoal > 20 || discardLimit < 3 || discardLimit > 20) return;
    if (state.victoryPointsToWin === vpGoal && state.discardLimit === discardLimit && state.teamMode === teamMode && state.teamMapMode === teamMapMode) return;
    const last = lastSettingsRef.current;
    if (last && last.vpGoal === vpGoal && last.discardLimit === discardLimit && last.teamMode === teamMode && last.teamMapMode === teamMapMode) return;
    send({ type: "updateSettings", victoryPointsToWin: vpGoal, discardLimit, teamMode, teamMapMode });
    lastSettingsRef.current = { vpGoal, discardLimit, teamMode, teamMapMode };
  }, [vpGoal, discardLimit, teamMode, teamMapMode, state?.phase, state?.victoryPointsToWin, state?.discardLimit, state?.teamMode, state?.teamMapMode, joined, status]);

  useEffect(() => {
    if (!state) return;
    const customMap = state.customMap;
    const prevCustomMap = prevCustomMapRef.current;
    prevCustomMapRef.current = customMap;
    if (prevCustomMap === null) {
      if (!customMap && !mapName) {
        setMapName("Classic Catan (Random)");
      }
      if (customMap && !mapName) {
        setMapName("Custom Map");
      }
      return;
    }
    if (prevCustomMap && !customMap) {
      setPendingBoard(null);
      setMapFileName("");
      setMapStatus("");
      setMapName("Classic Catan (Random)");
    }
  }, [state?.customMap, mapName]);

  useEffect(() => {
    try {
      document.documentElement.style.setProperty('--city-color', cityColor);
      document.documentElement.style.setProperty('--city-color-2', cityColor2);
      document.documentElement.style.setProperty('--road-color', roadColor);
    } catch (err) {
      // ignore in non-browser environments
    }
  }, [cityColor, cityColor2, roadColor]);

  useEffect(() => {
    if (!state?.teamMode) {
      setShowSpells(false);
    }
  }, [state?.teamMode]);

  // attach a wheel listener for map editor zooming
  useEffect(() => {
    if (!mapPage) return;
    const el = svgRef.current;
    if (!el) return;
    const handler = (event: WheelEvent) => {
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
      const delta = event.deltaY;
      const factor = Math.exp(-delta * 0.0004); // gentler zoom steps per scroll notch
      setZoom((z) => Math.max(0.25, Math.min(3, z * factor)));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => {
      el.removeEventListener('wheel', handler);
    };
  }, [mapPage]);

  useEffect(() => {
    if (showLobbyScreen || mapPage) return;
    const el = boardWrapperRef.current;
    if (!el) return;
    const handler = (event: WheelEvent) => {
      if (event.cancelable) {
        event.preventDefault();
      }
      const delta = Math.max(-120, Math.min(120, event.deltaY));
      const factor = Math.exp(-delta * 0.0015);
      applyBoardZoom(boardZoomRef.current * factor);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => {
      el.removeEventListener("wheel", handler);
    };
  }, [showLobbyScreen, mapPage, inDraftPhase, draftMapPage, applyBoardZoom]);

  useEffect(() => {
    if (showLobbyScreen || mapPage) return;
    applyBoardZoom(boardZoomRef.current);
  }, [showLobbyScreen, mapPage, inDraftPhase, draftMapPage, applyBoardZoom]);

  const send = (message: ClientMessage) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };

  const applyServerUrlInput = () => {
    const next = serverUrlInput.trim();
    if (!next || next === serverUrl) return;
    const shouldReconnect = status !== "disconnected" || joined;
    setServerUrl(next);
    if (shouldReconnect) {
      handleLobbyReset();
    }
  };

  const handleQuickJoinServer1 = () => {
    const next = SERVER_1_URL;
    setServerUrlInput(next);
    if (next === serverUrl) return;
    skipAutoJoinRef.current = true;
    setServerUrl(next);
    autoJoinAttemptRef.current = false;
  };

  useEffect(() => {
    const key = `${serverUrl}|${name}`;
    if (autoJoinKeyRef.current !== key) {
      autoJoinKeyRef.current = key;
      autoJoinAttemptRef.current = false;
    }
  }, [serverUrl, name]);

  useEffect(() => {
    if (skipAutoJoinRef.current) {
      skipAutoJoinRef.current = false;
      return;
    }
    if (!serverUrl.trim() || !name.trim()) return;
    if (joined) return;
    if (joinInFlightRef.current || status === "connecting") return;
    if (autoJoinAttemptRef.current) return;
    if (status === "connected" && ws && ws.readyState !== WebSocket.OPEN) return;
    autoJoinAttemptRef.current = true;
    connect();
  }, [serverUrl, name, joined, status, ws]);

  useEffect(() => {
    setServerUrlInput(serverUrl);
  }, [serverUrl]);

  const resetClientSession = () => {
    setStatus("disconnected");
    setWs(null);
    setJoined(false);
    setPlayerId("");
    setState(null);
    setPendingBoard(null);
    setMapName("");
    setMapStatus("");
    setMapFileName("");
    setMapDraft(editorGrid);
    setPortBridges([]);
    setBridgeSelectPort(null);
    setPortMode(false);
    setNumberMode(false);
    setPaletteMode(null);
    setBuildMode(null);
    setRobberMode(false);
    setPendingKnight(false);
    setSelectedDev(null);
    setActiveSpell(null);
    setShowSpells(false);
    setSpellTargets([]);
    setFertileDelta(1);
    setSelectiveHarvestNumber(6);
    setSwitcherooFrom("brick");
    setSwitcherooTo("grain");
    setSkilledLaborPay("brick");
    setSkilledLaborSkip("lumber");
    setMarketTargetId("");
    setMarketDiscardResource("brick");
    setMarketPay({});
    setTradeOpen(false);
    setTradeGive({});
    setTradeGet({});
    setTradeTarget("all");
    setPendingRoadDev(0);
    setDiscardSelection(emptyResources());
    boardPanRef.current = { x: 0, y: 0 };
    boardPanNextRef.current = null;
    if (boardPanRafRef.current !== null) {
      cancelAnimationFrame(boardPanRafRef.current);
      boardPanRafRef.current = null;
    }
    setBoardDragging(false);
    applyBoardZoom(1);
    mapPageRef.current = false;
    setMapPage(false);
    setError("");
    connectLockRef.current = false;
    joinInFlightRef.current = false;
    awaitStateJoinRef.current = false;
    joinSentRef.current = false;
    closeOnJoinErrorRef.current = false;
    setJoinInFlight(false);
  };

  const handleLobbyReset = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.close(1000, "Reset");
        return;
      } catch {
        // fall through to local reset
      }
    }
    resetClientSession();
  };

  const handleLobbyServerReset = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    setPendingBoard(null);
    setMapName("");
    setMapStatus("");
    setMapFileName("");
    mapPageRef.current = false;
    setMapPage(false);
    setError("");
    send({ type: "reset" });
  };

  const handleLobbyServerResetAll = () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    setPendingBoard(null);
    setMapName("");
    setMapStatus("");
    setMapFileName("");
    mapPageRef.current = false;
    setMapPage(false);
    setError("");
    send({ type: "resetServer" });
  };

  const handleCopyRoom = async () => {
    if (!serverUrlInput || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(serverUrlInput);
    } catch {
      setError("Could not copy room URL.");
    }
  };

  const connect = (overrideUrl?: string) => {
    if (joinInFlightRef.current) {
      setError("Join already in progress.");
      return;
    }
    if (joined) {
      setError("Already joined.");
      return;
    }
    if (!name.trim()) {
      setError("Enter a display name first.");
      return;
    }
    const chosenColor = (PLAYER_COLORS as readonly string[]).includes(playerColor) ? playerColor : DEFAULT_PLAYER_COLOR;
    const colorTaken = state?.players?.some((p) => p.color === chosenColor && p.id !== playerId) ?? false;
    if (colorTaken) {
      setError("Color already taken. Pick another one.");
      return;
    }
    const payload = { name, playerId: playerId || undefined, color: chosenColor as PlayerColor };
    if (status === "connected" && ws && ws.readyState === WebSocket.OPEN) {
      joinInFlightRef.current = true;
      setJoinInFlight(true);
      joinPayloadRef.current = payload;
      joinSentRef.current = false;
      closeOnJoinErrorRef.current = false;
      if (payload.playerId) {
        awaitStateJoinRef.current = true;
        return;
      }
      ws.send(JSON.stringify({ type: "join", name, playerId: payload.playerId, color: payload.color }));
      joinSentRef.current = true;
      return;
    }
    if (connectLockRef.current || status === "connecting") {
      setError("Already connecting.");
      return;
    }
    if (status !== "disconnected") {
      setError("Already connected.");
      return;
    }
    let wsUrl = overrideUrl || serverUrl;
    try {
      const url = new URL(serverUrl);
      if (playerId) url.searchParams.set("playerId", playerId);
      wsUrl = url.toString();
    } catch {
      // fallback to raw string if parsing fails
    }
    connectLockRef.current = true;
    closeOnJoinErrorRef.current = true;
    joinPayloadRef.current = payload;
    joinSentRef.current = false;
    const socket = new WebSocket(wsUrl);
    setStatus("connecting");
    socket.onopen = () => {
      setStatus("connected");
      setWs(socket);
      setError("");
      joinInFlightRef.current = true;
      setJoinInFlight(true);
      if (payload.playerId) {
        awaitStateJoinRef.current = true;
        return;
      }
      socket.send(JSON.stringify({ type: "join", name, playerId: payload.playerId, color: payload.color }));
      joinSentRef.current = true;
    };
    socket.onclose = (event) => {
      const resetClose = event?.reason === "Reset";
      setStatus("disconnected");
      setWs(null);
      setJoined(false);
      if (resetClose) {
        resetClientSession();
      }
      connectLockRef.current = false;
      joinInFlightRef.current = false;
      awaitStateJoinRef.current = false;
      joinSentRef.current = false;
      closeOnJoinErrorRef.current = false;
      setJoinInFlight(false);
    };
    socket.onerror = () => {
      setError("Connection error (check server is running).");
      connectLockRef.current = false;
      joinInFlightRef.current = false;
      awaitStateJoinRef.current = false;
      joinSentRef.current = false;
      closeOnJoinErrorRef.current = false;
      setJoinInFlight(false);
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.type === "state") {
        setState(message.state);
        if (joinInFlightRef.current && awaitStateJoinRef.current && joinPayloadRef.current) {
          const currentPlayerId = joinPayloadRef.current.playerId;
          const exists = !!currentPlayerId && message.state.players.some((p) => p.id === currentPlayerId);
          if (exists) {
            setJoined(true);
            joinInFlightRef.current = false;
            awaitStateJoinRef.current = false;
            joinSentRef.current = false;
            closeOnJoinErrorRef.current = false;
            setJoinInFlight(false);
          } else {
            awaitStateJoinRef.current = false;
            socket.send(
              JSON.stringify({
                type: "join",
                name: joinPayloadRef.current.name,
                playerId: joinPayloadRef.current.playerId,
                color: joinPayloadRef.current.color,
              }),
            );
            joinSentRef.current = true;
          }
        }
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
              setPortBridges([]);
              setBridgeSelectPort(null);
            }
          } else {
            // ensure ref matches
            mapPageRef.current = false;
            setMapPage(false);
          }
        } else if (message.type === "joined") {
        setPlayerId(message.playerId);
        setJoined(true);
        joinInFlightRef.current = false;
        awaitStateJoinRef.current = false;
        joinSentRef.current = false;
        closeOnJoinErrorRef.current = false;
        setJoinInFlight(false);
      } else if (message.type === "error") {
        setError(message.message);
        setMapStatus(`Error: ${message.message}`);
        const msg = message.message.toLowerCase();
        if (msg.includes("development card")) {
          setPendingKnight(false);
          setRobberMode(false);
          setPaletteMode(null);
          setSelectedDev(null);
        }
        if (joinInFlightRef.current && joinSentRef.current) {
          joinInFlightRef.current = false;
          joinSentRef.current = false;
          setJoinInFlight(false);
          if (closeOnJoinErrorRef.current) {
            socket.close();
          }
          closeOnJoinErrorRef.current = false;
        }
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
  const meReady = !!me?.ready;
  const selectedColor = (me?.color || playerColor) as PlayerColor;
  const myTeamId = me?.teamId ?? null;
  const teamSpellPool = useMemo(() => {
    if (!state?.teamMode || !myTeamId) return null;
    return state.teamSpells?.[myTeamId] || null;
  }, [state, myTeamId]);
  const spellCounts = useMemo(() => {
    return teamSpellPool || EMPTY_SPELL_COUNTS;
  }, [teamSpellPool]);
  const totalSpells = useMemo(() => {
    return SPELL_LIST.reduce((sum, spell) => sum + (spellCounts[spell] || 0), 0);
  }, [spellCounts]);
  const teamSpellUsed = !!(myTeamId && state?.teamSpellUsed?.[myTeamId]);
  const canUseSpell =
    !!state &&
    state.teamMode &&
    !!myTeamId &&
    isMyTurn &&
    state.phase === "turn" &&
    !state.hasRolled &&
    !state.awaitingGold &&
    !state.awaitingDiscard &&
    !state.awaitingRobber &&
    !teamSpellUsed;
  const lastDevCardPlayed = state?.lastDevCardPlayed ?? null;
  const getSpellTargetCount = (spell: SpellType) => {
    if (spell === "tectonic_shift") return 2;
    if (spell === "fertile_ground") return 1;
    if (spell === "seismic_rotation") return 3;
    if (spell === "safe_haven") return 1;
    if (spell === "copycat" && lastDevCardPlayed === "knight") return 1;
    return 0;
  };
  const canUseSpellNow = (spell: SpellType) => {
    if (!canUseSpell) return false;
    if (!state) return false;
    if (spell === "copycat" && !lastDevCardPlayed) return false;
    if ((spell === "coordinated_trade" || spell === "double_cross") && (!state.teamMode || !me?.teamId)) {
      return false;
    }
    return true;
  };
  const spellNeedsConfig = (spell: SpellType) => {
    if (spell === "switcheroo") return true;
    if (spell === "selective_harvest") return true;
    if (spell === "skilled_labor") return true;
    if (spell === "market_disruption") return true;
    if (spell === "copycat") {
      return lastDevCardPlayed === "monopoly" || lastDevCardPlayed === "year_of_plenty";
    }
    return false;
  };
  const spellsOpen = !!state?.teamMode && (showSpells || !!activeSpell);
  const scoreboardPlayers = useMemo(() => {
    if (!state || !state.players.length) return [];
    const players = state.players;
    const startIndex =
      state.phase === "setup"
        ? state.setupIndex
        : state.phase === "turn"
          ? state.currentPlayerIndex
          : 0;
    if (!startIndex) return players;
    return [...players.slice(startIndex), ...players.slice(0, startIndex)];
  }, [state]);
  const bankRemaining = useMemo(() => {
    if (!state) return null;
    if (state.bankPool) return state.bankPool;
    const remaining: Record<BankResourceType, number> = { ...BANK_RESOURCE_TOTALS };
    for (const p of state.players) {
      BANK_RESOURCE_TYPES.forEach((res) => {
        remaining[res] -= p.resources?.[res] ?? 0;
      });
    }
    BANK_RESOURCE_TYPES.forEach((res) => {
      remaining[res] = Math.max(0, remaining[res]);
    });
    return remaining;
  }, [state]);
  const teamCounts = useMemo(() => {
    const counts: Record<TeamId, number> = { 1: 0, 2: 0 };
    if (!state) return counts;
    state.players.forEach((p) => {
      if (p.teamId === 1) counts[1] += 1;
      if (p.teamId === 2) counts[2] += 1;
    });
    return counts;
  }, [state]);
  const soloDraftTest = useMemo(() => {
    return !!state?.teamMode && (state?.players?.length ?? 0) === 1;
  }, [state?.teamMode, state?.players?.length]);
  const draftTileOptions = useMemo(() => {
    if (!state) return [] as Array<{ teamId: TeamId; tile: DraftTile }>;
    const collect = (teamId: TeamId) =>
      (state.draftTiles?.[teamId] ?? []).map((tile) => ({ teamId, tile }));
    if (soloDraftTest) {
      return [...collect(1), ...collect(2)];
    }
    if (!myTeamId) return [];
    return collect(myTeamId);
  }, [state, myTeamId, soloDraftTest]);
  const draftPlacedCount = useMemo(() => {
    if (!state) return 0;
    if (soloDraftTest) return Object.keys(state.draftPlacements || {}).length;
    if (!myTeamId) return 0;
    return Object.values(state.draftPlacements || {}).filter((p) => p.teamId === myTeamId).length;
  }, [state, myTeamId, soloDraftTest]);
  const draftPlacementHexes = useMemo(() => {
    if (!state) return new Set<string>();
    if (soloDraftTest) {
      return new Set([...(state.draftIslandHexes?.[1] || []), ...(state.draftIslandHexes?.[2] || [])]);
    }
    if (!myTeamId) return new Set<string>();
    return new Set(state.draftIslandHexes?.[myTeamId] || []);
  }, [state, myTeamId, soloDraftTest]);
  const draftIslandCenters = useMemo(() => {
    if (!state) return { 1: null, 2: null } as Record<TeamId, { x: number; y: number } | null>;
    const hexById = new Map(state.board.hexes.map((h) => [h.id, h]));
    const compute = (teamId: TeamId) => {
      const ids = state.draftIslandHexes?.[teamId] || [];
      const points = ids.map((id) => hexById.get(id)).filter(Boolean) as Array<{ x: number; y: number }>;
      if (!points.length) return null;
      const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
      return { x: sum.x / points.length, y: sum.y / points.length };
    };
    return { 1: compute(1), 2: compute(2) };
  }, [state]);
  const selectedDraftTeamId = useMemo(() => {
    if (!selectedDraftTileId) return null;
    const entry = draftTileOptions.find((opt) => opt.tile.id === selectedDraftTileId);
    return entry?.teamId ?? null;
  }, [draftTileOptions, selectedDraftTileId]);
  const activeDraftHexes = useMemo(() => {
    if (!state) return new Set<string>();
    if (!soloDraftTest) return draftPlacementHexes;
    if (selectedDraftTeamId) {
      return new Set(state.draftIslandHexes?.[selectedDraftTeamId] || []);
    }
    return draftPlacementHexes;
  }, [draftPlacementHexes, selectedDraftTeamId, soloDraftTest, state]);
  const draftCurrentTile = useMemo(() => {
    if (!state?.draftAuctionTiles) return null;
    return state.draftAuctionTiles[state.draftAuctionIndex] || null;
  }, [state?.draftAuctionTiles, state?.draftAuctionIndex]);
  const draftBidMin = useMemo(() => {
    if (!state) return 1;
    const current = state.draftCurrentBid || 0;
    return current > 0 ? current + 1 : 1;
  }, [state?.draftCurrentBid]);
  const draftTeamFunds = useMemo(() => {
    return state?.draftTeamFunds || { 1: 0, 2: 0 };
  }, [state?.draftTeamFunds]);
  const bankRatio = useMemo(() => {
    if (!state || !me) return 4;
    let best = 4;
    const ports = state.board.ports || [];
    if (!ports.length) return best;
    for (const p of ports) {
      const portVertices = new Set([p.vertexId, ...(p.bridges || [])]);
      const ownsPort = Array.from(portVertices).some((vid) => state.vertexOwner?.[vid] === me.id);
      if (!ownsPort) continue;
      if (!p.resource || p.resource === "any" || p.resource === bankGive) {
        best = Math.min(best, p.ratio);
      }
    }
    if (state.spellSmuggler?.[playerId]) {
      best = Math.min(best, 2);
    }
    if (state.spellCoordinatedTrade && me.teamId && state.spellCoordinatedTrade.teamId === me.teamId) {
      best = Math.min(best, 2);
    }
    return best;
  }, [state, me, bankGive, playerId]);
  const canTradeBeforeRoll = !!state?.spellSmuggler?.[playerId]
    || (!!state?.spellCoordinatedTrade && !!me?.teamId && state.spellCoordinatedTrade.teamId === me.teamId);
  const allPlayersReady = useMemo(() => {
    if (!state) return false;
    return state.players.length > 0 && state.players.every((p) => p.ready);
  }, [state]);
  const myDiscardNeed = state?.discardPending?.[playerId || ""] || 0;
  useEffect(() => {
    if (!me?.color) return;
    if (me.color !== playerColor) {
      setPlayerColor(me.color as PlayerColor);
    }
  }, [me?.color, playerColor, setPlayerColor]);
  useEffect(() => {
    if (!state) return;
    if (tradeTarget === "all") return;
    if (!state.players.find((p) => p.id === tradeTarget)) {
      setTradeTarget("all");
    }
  }, [state, tradeTarget]);
  useEffect(() => {
    if (!state) return;
    const firstOther = state.players.find((p) => {
      if (p.id === playerId) return false;
      if (state.teamMode && me?.teamId && p.teamId === me.teamId) return false;
      return true;
    });
    if (!firstOther) return;
    if (!marketTargetId || !state.players.find((p) => p.id === marketTargetId)) {
      setMarketTargetId(firstOther.id);
    }
  }, [state, playerId, marketTargetId, me?.teamId]);

  useEffect(() => {
    if (state?.awaitingRobber && isMyTurn && !robberMode) {
      setPaletteMode("robber");
      setRobberMode(true);
      setBuildMode(null);
      setPendingKnight(false);
      setSelectedDev(null);
      setSelectedTarget(null);
    }
  }, [state?.awaitingRobber, isMyTurn, robberMode]);

  useEffect(() => {
    if (
      !state ||
      state.phase !== "turn" ||
      !isMyTurn ||
      state.hasRolled ||
      state.awaitingGold ||
      state.awaitingDiscard ||
      state.awaitingRobber
    ) {
      setActiveSpell(null);
      setSpellTargets([]);
    }
  }, [
    state?.phase,
    isMyTurn,
    state?.hasRolled,
    state?.awaitingGold,
    state?.awaitingDiscard,
    state?.awaitingRobber,
  ]);

  // keep local pending road-building count in sync with server bonusRoads
  useEffect(() => {
    const serverBonus = me?.bonusRoads ?? 0;
    if (serverBonus > pendingRoadDev) {
      setPendingRoadDev(serverBonus);
    }
  }, [me?.bonusRoads, pendingRoadDev]);

  useEffect(() => {
    if (state?.awaitingDiscard && myDiscardNeed > 0) {
      setDiscardSelection(emptyResources());
      setPaletteMode(null);
      setBuildMode(null);
      setRobberMode(false);
      setPendingKnight(false);
      setSelectedDev(null);
    }
  }, [state?.awaitingDiscard, myDiscardNeed]);

  useEffect(() => {
    if (state?.awaitingGold && (me?.pendingGold || 0) > 0) {
      setPaletteMode(null);
      setBuildMode(null);
      setRobberMode(false);
      setPendingKnight(false);
      setSelectedDev(null);
    }
  }, [state?.awaitingGold, me?.pendingGold]);

  const playerLookup = useMemo(() => (state ? groupById(state.players) : {}), [state]);

  // show robber only after first robber event (7 or knight); hide again in lobby/reset
  useEffect(() => {
    if (!state || state.phase === "lobby") {
      setRobberVisible(false);
      return;
    }
    const rolledSeven = state.lastRoll && state.lastRoll[0] + state.lastRoll[1] === 7;
    if (state.awaitingRobber || rolledSeven || pendingKnight || robberMode) {
      setRobberVisible(true);
    }
  }, [state, pendingKnight, robberMode]);

  // auto-send pending custom board once connected to lobby
  useEffect(() => {
    if (!pendingBoard) return;
    if (!ws || status !== "connected" || !state || state.phase !== "lobby") return;
    if (!joined || !playerId) return;
    send({ type: "setCustomBoard", hexes: pendingBoard.hexes, ports: pendingBoard.ports });
    setPendingBoard(null);
    setMapStatus("Sent to server");
    mapPageRef.current = false;
    setMapPage(false);
  }, [pendingBoard, ws, status, state, joined, playerId]);

  // close editor once the game starts (keep it available in the lobby)
  useEffect(() => {
    if (ready && mapPage && !inLobby) {
      mapPageRef.current = false;
      setMapPage(false);
    }
  }, [ready, mapPage, inLobby]);

  useEffect(() => {
    if (draftMapPage && !draftModeActive) {
      setDraftMapPage(false);
      return;
    }
    if (draftMapPage && !(inLobby || inDraftPhase)) {
      setDraftMapPage(false);
    }
  }, [draftMapPage, inLobby, inDraftPhase, draftModeActive]);

  useEffect(() => {
    if (draftModeActive && inDraftPhase) {
      setDraftMapPage(true);
      setSelectedDraftTileId(null);
    }
  }, [draftModeActive, inDraftPhase]);

  // auto-dismiss errors after a short delay so they don't persist forever
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(""), 4000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    if (!draftModeActive || draftPhase !== "auction") return;
    setDraftBidAmount((prev) => (prev < draftBidMin ? draftBidMin : prev));
  }, [draftModeActive, draftPhase, draftBidMin, state?.draftAuctionIndex]);

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

  const handleVertexClick = (vertexId: string) => {
    if (!buildMode) return;
    if (state?.awaitingGold) return;
    if (buildMode === "settlement" && state && !landVertexIds.has(vertexId)) return;
    send({ type: "build", buildType: buildMode, vertexId });
    setBuildMode(null);
    setPaletteMode(null);
  };

  const togglePortBridge = (portId: string, vertexKey: string, eligible: Set<string>) => {
    if (!eligible.has(vertexKey)) return;
    setPortBridges((prev) => {
      const current = prev.find((b) => b.portId === portId)?.vertices || [];
      const has = current.includes(vertexKey);
      let nextVertices = current.slice();
      if (has) {
        nextVertices = nextVertices.filter((v) => v !== vertexKey);
      } else {
        if (current.length >= 2) return prev;
        nextVertices = [...current, vertexKey];
      }
      return [...prev.filter((b) => b.portId !== portId), { portId, vertices: nextVertices }];
    });
    setBridgeSelectPort(portId);
  };

  const handleEdgeClick = (edgeId: string) => {
    if (buildMode !== "road") return;
    if (state?.awaitingGold) return;
    send({ type: "build", buildType: "road", edgeId });
    const bonus = Math.max(me?.bonusRoads ?? 0, pendingRoadDev);
    const remaining = Math.max(0, bonus - 1);
    setPendingRoadDev((v) => Math.max(remaining, v - 1));
    if (remaining > 0) {
      setBuildMode("road");
      setPaletteMode("road");
    } else {
      setBuildMode(null);
      setPaletteMode(null);
    }
  };

  const handleHexClick = (hexId: string) => {
    if (mapPage) {
      const targetHex = mapDraft.find((h) => h.id === hexId);
      const wasPort = targetHex?.resource === "water_port";
      if (numberMode) {
        setMapDraft((draft) =>
          draft.map((h) => (h.id === hexId ? { ...h, numberToken: editNumber === "" ? undefined : editNumber || undefined } : h)),
        );
        return;
      }
      setMapDraft((draft) =>
        draft.map((h) =>
          h.id === hexId
            ? {
                ...h,
                resource: editResource,
                numberToken: ["desert", "empty", "water", "water_port"].includes(editResource) ? undefined : editNumber || undefined,
              }
            : h,
        ),
      );
      if (wasPort && editResource !== "water_port") {
        setPortBridges((prev) => prev.filter((b) => b.portId !== hexId));
      }
      return;
    }
    if (activeSpell && state) {
      const targetCount = getSpellTargetCount(activeSpell);
      if (!targetCount) return;
      const targetHex = state.board.hexes.find((h) => h.id === hexId);
      if (!targetHex) {
        setError("Invalid tile.");
        return;
      }
      if (spellTargets.includes(hexId)) {
        setError("Pick a different tile.");
        return;
      }
      const isLand = targetHex.resource !== "water";
      const hasToken = typeof targetHex.numberToken === "number";
      if (activeSpell === "tectonic_shift") {
        if (!isLand || !hasToken) {
          setError("Pick a numbered land tile.");
          return;
        }
        if (targetHex.numberToken === 6 || targetHex.numberToken === 8) {
          setError("6 and 8 cannot be swapped.");
          return;
        }
      }
      if (activeSpell === "fertile_ground") {
        if (!isLand || !hasToken) {
          setError("Pick a numbered land tile.");
          return;
        }
        if (targetHex.numberToken === 6 || targetHex.numberToken === 8) {
          setError("6 and 8 cannot be adjusted.");
          return;
        }
      }
      if (activeSpell === "seismic_rotation") {
        if (!isLand) {
          setError("Pick land tiles.");
          return;
        }
      }
      if (activeSpell === "safe_haven" && !isLand) {
        setError("Pick a land tile.");
        return;
      }
      const nextTargets = [...spellTargets, hexId];
      if (nextTargets.length >= targetCount) {
        const payload: ClientMessage = { type: "useSpell", spell: activeSpell };
        if (activeSpell === "tectonic_shift") {
          payload.hexA = nextTargets[0];
          payload.hexB = nextTargets[1];
        } else if (activeSpell === "fertile_ground") {
          payload.hexId = nextTargets[0];
          payload.delta = fertileDelta;
        } else if (activeSpell === "seismic_rotation") {
          payload.hexes = nextTargets;
        } else if (activeSpell === "safe_haven") {
          payload.hexId = nextTargets[0];
        } else if (activeSpell === "copycat" && lastDevCardPlayed === "knight") {
          payload.hexId = nextTargets[0];
        }
        send(payload);
        setActiveSpell(null);
        setSpellTargets([]);
      } else {
        setSpellTargets(nextTargets);
      }
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

  const handleHexRightClick = (hexId: string, e: MouseEvent) => {
    if (!mapPage) return;
    if (e.cancelable) {
      e.preventDefault();
    }
    const targetHex = mapDraft.find((h) => h.id === hexId);
    if (!targetHex || targetHex.resource === "empty") return;
    const wasPort = targetHex.resource === "water_port";
    setMapDraft((draft) => draft.map((h) => (h.id === hexId ? { ...h, resource: "empty", numberToken: undefined } : h)));
    if (wasPort) {
      setPortBridges((prev) => prev.filter((b) => b.portId !== hexId));
    }
  };

  const resetSpellSelection = () => {
    setActiveSpell(null);
    setSpellTargets([]);
  };

  const sendSpell = (spell: SpellType, payload: Partial<ClientMessage> = {}) => {
    send({ type: "useSpell", spell, ...(payload as Omit<ClientMessage, "type" | "spell">) });
    resetSpellSelection();
  };

  const beginSpell = (spell: SpellType) => {
    setActiveSpell(spell);
    setSpellTargets([]);
    setShowSpells(true);
    setPaletteMode(null);
    setBuildMode(null);
    setRobberMode(false);
    setPendingKnight(false);
    setSelectedDev(null);
    setError("");
  };

  const handleDraftHexClick = (hexId: string) => {
    if (!draftModeActive || !state) return;
    if (draftPhase !== "placement") {
      setError("Finish the auction before placing tiles.");
      return;
    }
    if (!myTeamId && !soloDraftTest) {
      setError("Pick a team first.");
      return;
    }
    if (!activeDraftHexes.has(hexId)) {
      setError("That hex is not on your island.");
      return;
    }
    if (!selectedDraftTileId) {
      setError("Select a draft tile first.");
      return;
    }
    send({ type: "placeDraftTile", hexId, tileId: selectedDraftTileId });
    setSelectedDraftTileId(null);
  };

  const handleDraftHexRightClick = (hexId: string, e: MouseEvent) => {
    if (!draftModeActive || !state) return;
    if (e.cancelable) {
      e.preventDefault();
    }
    if (draftPhase !== "placement") return;
    const placement = state.draftPlacements?.[hexId];
    if (!placement) return;
    if (!soloDraftTest && placement.teamId !== myTeamId) return;
    send({ type: "removeDraftPlacement", hexId });
  };

  const totalDiscardSelected = useMemo(
    () => Object.values(discardSelection).reduce((a, b) => a + b, 0),
    [discardSelection],
  );
  const isDiscardMode = !!state?.awaitingDiscard && myDiscardNeed > 0 && !state?.awaitingGold;
  const addDiscardResource = (res: ResourceType) => {
    if (!isDiscardMode || !me) return;
    setDiscardSelection((prev) => {
      const current = prev[res] || 0;
      const total = Object.values(prev).reduce((sum, val) => sum + val, 0);
      if (total >= myDiscardNeed) return prev;
      if (current >= (me.resources[res] ?? 0)) return prev;
      return { ...prev, [res]: current + 1 };
    });
  };
  const removeDiscardResource = (res: ResourceType) => {
    setDiscardSelection((prev) => {
      const current = prev[res] || 0;
      if (current <= 0) return prev;
      return { ...prev, [res]: current - 1 };
    });
  };
  const marketPayTotal = useMemo(
    () => Object.values(marketPay).reduce((a, b) => a + (b || 0), 0),
    [marketPay],
  );

  const submitDiscard = () => {
    if (!myDiscardNeed) return;
    if (totalDiscardSelected !== myDiscardNeed) {
      setError(`Select ${myDiscardNeed} to discard.`);
      return;
    }
    send({ type: "discard", cards: discardSelection });
  };

  useEffect(() => {
    if (!state?.awaitingDiscard || myDiscardNeed === 0) {
      setDiscardSelection(emptyResources());
      setDiscardConfirm(false);
      return;
    }
    if (totalDiscardSelected !== myDiscardNeed) {
      setDiscardConfirm(false);
    }
  }, [state?.awaitingDiscard, myDiscardNeed, totalDiscardSelected]);

  const adjustTradeMap = (
    setter: Dispatch<SetStateAction<Partial<Record<ResourceType, number>>>>,
    res: ResourceType,
    delta: number,
    cap?: number,
  ) => {
    setter((prev) => {
      const curr = prev[res] || 0;
      const max = cap ?? Number.MAX_SAFE_INTEGER;
      const next = Math.max(0, Math.min(max, curr + delta));
      return { ...prev, [res]: next };
    });
  };

  const sendTradeOffer = () => {
    if (!state || !me) return;
    const giveTotal = Object.values(tradeGive).reduce((a, b) => a + (b || 0), 0);
    const getTotal = Object.values(tradeGet).reduce((a, b) => a + (b || 0), 0);
    if (!giveTotal && !getTotal) {
      setError("Trade must include something.");
      return;
    }
    for (const res of Object.keys(tradeGive) as ResourceType[]) {
      if ((tradeGive[res] || 0) > (me.resources[res] || 0)) {
        setError("You do not have those resources.");
        return;
      }
    }
    const target = tradeTarget === "all" ? undefined : tradeTarget;
    send({ type: "offerTrade", to: target as any, give: tradeGive, get: tradeGet });
    setTradeGive({});
    setTradeGet({});
  };

  const respondTrade = (offerId: number, accept: boolean) => {
    send({ type: "respondTrade", offerId, accept });
  };

  const actionHint = useMemo(() => {
    if (!state) return "Waiting for players.";
    if (state.awaitingGold) {
      if ((me?.pendingGold || 0) > 0) return `Choose a resource for gold (${me?.pendingGold} left).`;
      return "Waiting for gold choices.";
    }
    if (state.awaitingDiscard) {
      if (myDiscardNeed > 0) return `Discard ${myDiscardNeed} cards (rolled 7).`;
      return "Waiting for other players to discard.";
    }
    if (state.phase === "lobby") {
      const totalPlayers = state.players.length;
      if (!totalPlayers) return "Waiting for players.";
      const readyCount = state.players.filter((p) => p.ready).length;
      if (state.teamMode) {
        if (totalPlayers === 1) {
          if (!me?.teamId) return "Pick your team to start.";
          if (state.teamMapMode === "draft") {
            return "Draft starts once everyone is ready.";
          }
          return meReady ? "Solo test ready." : "Solo test: click Ready to start.";
        }
        if (totalPlayers !== 2 && totalPlayers !== 4) return "Team mode requires 2 or 4 players.";
        const unassigned = state.players.some((p) => !p.teamId);
        if (unassigned) {
          return me?.teamId ? "Waiting for others to pick a team." : "Pick your team to start.";
        }
        const team1 = state.players.filter((p) => p.teamId === 1).length;
        const team2 = state.players.filter((p) => p.teamId === 2).length;
        if (totalPlayers === 2) {
          if (team1 !== 1 || team2 !== 1) return "Teams must be 1 vs 1 to start.";
        } else if (team1 !== 2 || team2 !== 2) {
          return "Teams must be 2 vs 2 to start.";
        }
        if (state.teamMapMode === "draft") {
          return "Draft starts once everyone is ready.";
        }
      }
      if (allPlayersReady) return "All players ready. Starting game...";
      return meReady
        ? `Ready (${readyCount}/${totalPlayers}). Waiting for others.`
        : `Not ready (${readyCount}/${totalPlayers}). Click Ready when you are set.`;
    }
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
      if (state.teamMode && state.winnerTeam) {
        return `Team ${state.winnerTeam} won the game.`;
      }
      const winner = state.players.find((p) => p.id === state.winnerId)?.name ?? "Winner";
      return `${winner} won the game.`;
    }
    return "";
  }, [state, activePlayer, allPlayersReady, meReady, myDiscardNeed, me?.pendingGold]);

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

  const remainingPieces = useMemo(() => {
    const settlements = Math.max(0, 5 - (me?.settlements.length ?? 0));
    const cities = Math.max(0, 4 - (me?.cities.length ?? 0));
    const roads = Math.max(0, 15 - (me?.roads.length ?? 0));
    return { settlements, cities, roads };
  }, [me]);

  const vertexEdgesMap = useMemo(() => {
    if (!state) return {} as Record<string, string[]>;
    if (state.board.vertexEdges) return state.board.vertexEdges;
    const map: Record<string, string[]> = {};
    state.board.edges.forEach((e) => {
      if (!map[e.v1]) map[e.v1] = [];
      if (!map[e.v2]) map[e.v2] = [];
      map[e.v1].push(e.id);
      map[e.v2].push(e.id);
    });
    return map;
  }, [state]);

  const highlightVertices = useMemo(() => {
    const set = new Set<string>();
    if (!state || !me || !playerId) return set;
    if (buildMode !== "settlement") return set;
    if (!isMyTurn) return set;
    if (state.awaitingRobber || state.awaitingDiscard || state.awaitingGold) return set;
    if (state.phase === "turn" && !state.hasRolled) return set;
    const neighbors = state.board.vertexNeighbors;
    const vertexEdges = vertexEdgesMap;
    const isSetup = state.phase === "setup" && state.players[state.setupIndex]?.id === playerId && state.setupStep === "settlement";
    const myEdges = new Set(Object.entries(state.edgeOwner).filter(([, owner]) => owner === playerId).map(([eid]) => eid));
    for (const v of state.board.vertices) {
      if (!landVertexIds.has(v.id)) continue;
      if (state.vertexOwner[v.id]) continue;
      const near = neighbors[v.id] || [];
      if (near.some((n) => state.vertexOwner[n])) continue;
      if (isSetup) {
        set.add(v.id);
        continue;
      }
      const edges = vertexEdges[v.id] || [];
      if (edges.some((eid) => myEdges.has(eid))) {
        set.add(v.id);
      }
    }
    return set;
  }, [state, me, playerId, buildMode, isMyTurn, vertexEdgesMap, landVertexIds]);

  const highlightEdges = useMemo(() => {
    const set = new Set<string>();
    if (!state || !me || !playerId) return set;
    if (buildMode !== "road") return set;
    if (!isMyTurn) return set;
    if (state.awaitingRobber || state.awaitingDiscard || state.awaitingGold) return set;
    const isSetup = state.phase === "setup" && state.players[state.setupIndex]?.id === playerId && state.setupStep === "road";
    if (state.phase === "turn" && !state.hasRolled && !(me.bonusRoads > 0)) return set;
    const myVertices = new Set(
      Object.entries(state.vertexOwner)
        .filter(([, owner]) => owner === playerId)
        .map(([vid]) => vid),
    );
    const myEdges = new Set(Object.entries(state.edgeOwner).filter(([, owner]) => owner === playerId).map(([eid]) => eid));
    const vertexEdges = vertexEdgesMap;
    const touchesMyEdge = (vertexId: string) => (vertexEdges[vertexId] || []).some((eid) => myEdges.has(eid));
    for (const e of state.board.edges) {
      if (state.edgeOwner[e.id]) continue;
      if (isSetup) {
        if (myVertices.has(e.v1) || myVertices.has(e.v2)) set.add(e.id);
        continue;
      }
      if (myVertices.has(e.v1) || myVertices.has(e.v2) || touchesMyEdge(e.v1) || touchesMyEdge(e.v2)) {
        set.add(e.id);
      }
    }
    return set;
  }, [state, me, playerId, buildMode, isMyTurn, vertexEdgesMap]);

  const renderResourceCard = (
    res: ResourceType,
    count: number,
    options?: { onClick?: () => void; selected?: number; discardable?: boolean; disabled?: boolean },
  ) => {
    if (count <= 0) return null;
    const src = RESOURCE_IMG[res];
    const stackCount = Math.min(count, 3);
    const stackWidth = 54 + 8 * (stackCount - 1);
    const selected = options?.selected ?? 0;
    return (
      <button
        type="button"
        className={`hand-card-stack${options?.discardable ? " discardable" : ""}${selected > 0 ? " selected" : ""}`}
        key={res}
        style={{ width: `${stackWidth}px` }}
        onClick={options?.onClick}
        disabled={options?.disabled}
      >
        <div className="hand-card-stack-layer">
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
        </div>
        <div className="hand-count-text">{count}</div>
        {selected > 0 && <div className="hand-discard-badge">{selected}</div>}
      </button>
    );
  };
  const playSelectedDev = () => {
    if (!selectedDev) return;
    if (!isMyTurn || !state) return;
    // reset transient modes
    setPaletteMode(null);
    setBuildMode(null);
    setRobberMode(false);
    setSelectedTarget(null);
    switch (selectedDev) {
      case "knight":
        setPaletteMode("robber");
        setRobberMode(true);
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
        setPendingRoadDev(2);
        break;
      case "victory_point":
        // VP cards auto-count; no action needed
        break;
    }
    if (selectedDev !== "knight") {
      setSelectedDev(null);
    }
  };


  if ((draftMapPage || inDraftPhase) && state) {
    const isAuction = draftPhase === "auction";
    const isSpellDraft = draftPhase === "spell";
    const totalDraftTiles = state.draftAuctionTiles?.length ?? 0;
    const roundNumber = Math.min(state.draftAuctionIndex + 1, totalDraftTiles || 0);
    const currentBid = state.draftCurrentBid || 0;
    const highestBidder = state.draftHighestBidder;
    const isMyTurnToBid = !!myTeamId && state.draftTurnTeam === myTeamId;
    const canBid = soloDraftTest ? true : isMyTurnToBid;
    const bidTeamId = soloDraftTest ? state.draftTurnTeam : myTeamId;
    const bidFunds = bidTeamId ? draftTeamFunds[bidTeamId] : 0;
    const totalSlots =
      (state.draftIslandHexes?.[1]?.length ?? 0) + (state.draftIslandHexes?.[2]?.length ?? 0);
    const maxSlots = soloDraftTest ? totalSlots : 6;
    const teamLabel = myTeamId ? `Team ${myTeamId}` : "No team";
    const tilesRemaining = Math.max(0, maxSlots - draftPlacedCount);
    const placementStatus = soloDraftTest
      ? `Solo test - Placed ${draftPlacedCount}/${maxSlots} - Remaining ${tilesRemaining}`
      : `${teamLabel} - Placed ${draftPlacedCount}/6 - Remaining ${tilesRemaining}`;
    const hideOtherIsland = inDraftPhase && draftPhase === "placement" && !soloDraftTest && !!myTeamId;
    const spellDraftPool = state.spellDraftPool || [];
    const spellDraftOrder = state.spellDraftOrder || [];
    const spellPickIndex = state.spellDraftIndex || 0;
    const currentSpellTeam = spellDraftOrder[spellPickIndex] || null;
    const canPickSpell = soloDraftTest ? true : !!myTeamId && currentSpellTeam === myTeamId;
    return (
      <div className="page">
        <div className="map-page">
          <div className="map-page-bar">
            <div>
              <div className="label">
                {isAuction ? "Draft Auction" : isSpellDraft ? "Spell Draft" : "Draft Map"}
              </div>
              <div className="hint">
                {isAuction
                  ? "Bid on tiles, then place them on your island."
                  : isSpellDraft
                    ? "Snake draft team spells (3 picks each)."
                    : "Place your drafted tiles on your island."}
              </div>
            </div>
            <div className="map-controls inline">
              {isHost && draftModeActive && (
                <button type="button" onClick={() => send({ type: "autoDraft" })}>
                  Auto Draft
                </button>
              )}
              {inLobby && (
                <button
                  type="button"
                  onClick={() => {
                    setDraftMapPage(false);
                    setSelectedDraftTileId(null);
                  }}
                >
                  Back to Lobby
                </button>
              )}
            </div>
          </div>
          {isAuction ? (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 360px", minWidth: 280 }}>
                <div
                  style={{
                    background: "#0c121c",
                    border: "1px solid #1f2a36",
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 12,
                  }}
                >
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    Round {roundNumber}/{totalDraftTiles || 0}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>
                    {draftCurrentTile
                      ? `${RESOURCE_LABEL[draftCurrentTile.resource]} ${draftCurrentTile.numberToken}`
                      : "Awaiting tile"}
                  </div>
                  {draftCurrentTile && (
                    <img
                      src={`/icons/${draftCurrentTile.numberToken}_icon.png`}
                      alt={`Token ${draftCurrentTile.numberToken}`}
                      style={{ width: 70, height: 70, marginTop: 8 }}
                    />
                  )}
                  <div style={{ marginTop: 10, fontSize: 13 }}>
                    Current bid: ${currentBid}
                    {highestBidder ? ` (Team ${highestBidder})` : ""}
                  </div>
                  <div style={{ fontSize: 13 }}>Turn: Team {state.draftTurnTeam}</div>
                </div>
                <div
                  style={{
                    background: "#0c121c",
                    border: "1px solid #1f2a36",
                    borderRadius: 12,
                    padding: 16,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Bid controls</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input
                      type="number"
                      min={draftBidMin}
                      value={draftBidAmount}
                      onChange={(e) => setDraftBidAmount(Number(e.target.value) || draftBidMin)}
                      disabled={!canBid}
                      style={{ width: 120 }}
                    />
                    <button
                      type="button"
                      onClick={() => send({ type: "draftBid", amount: draftBidAmount })}
                      disabled={!canBid || draftBidAmount < draftBidMin || draftBidAmount > bidFunds}
                    >
                      Bid
                    </button>
                    <button
                      type="button"
                      onClick={() => send({ type: "draftPass" })}
                      disabled={!canBid || currentBid <= 0}
                    >
                      Pass
                    </button>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
                    Minimum bid: {draftBidMin}. {canBid ? "You can bid now." : "Wait for your team's turn."}
                  </div>
                </div>
              </div>
              <div style={{ flex: "0 0 280px", minWidth: 240 }}>
                {[1, 2].map((teamId) => {
                  const isBiddingTeam = isAuction && state.draftTurnTeam === teamId;
                  return (
                    <div
                      key={`team-${teamId}`}
                      style={{
                        background: "#0c121c",
                        border: isBiddingTeam ? "1px solid #4fb1ff" : "1px solid #1f2a36",
                        borderRadius: 12,
                        boxShadow: isBiddingTeam ? "0 0 0 2px rgba(79, 177, 255, 0.35)" : "none",
                        padding: 12,
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>
                        Team {teamId} {isBiddingTeam ? "(Bidding)" : ""}
                      </div>
                      <div style={{ fontSize: 12 }}>Funds: ${draftTeamFunds[teamId as TeamId].toLocaleString()}</div>
                      <div style={{ fontSize: 12 }}>
                        Tiles: {(state.draftTiles?.[teamId as TeamId]?.length ?? 0)}/6
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 520px", minWidth: 320 }}>
                {state && bounds && (
                  <div className="board-wrapper" ref={boardWrapperRef}>
                    <div className="board-zoom" ref={boardZoomElRef}>
                      <svg
                        className="board"
                        viewBox={`${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`}
                      >
                        <defs>
                        {Object.entries(RESOURCE_TEXTURE).map(([res, href]) => {
                          if (!href) return null;
                          const scale = getTextureScale(res as ResourceType | "desert" | "empty" | "water" | "cloud" | "dev");
                          const offset = getTextureOffset(scale);
                          return (
                            <pattern
                              key={res}
                              id={`draft-tex-${res}`}
                              patternUnits="objectBoundingBox"
                              patternContentUnits="objectBoundingBox"
                              width="1"
                              height="1"
                            >
                              <image
                                href={href}
                                x={offset}
                                y={offset}
                                width={scale}
                                height={scale}
                                preserveAspectRatio="xMidYMid slice"
                              />
                            </pattern>
                          );
                        })}
                        </defs>
                        {state.board.hexes.map((hex) => {
                        const isSlot = activeDraftHexes.has(hex.id);
                        const fillResource = hex.resource === "water_port" ? "water" : hex.resource;
                          const stroke = isSlot ? "#3fa9f5" : fillResource === "water" ? "transparent" : "#f5e0b3";
                          const strokeWidth = isSlot ? 4 : 3;
                          return (
                            <g
                              key={hex.id}
                              onClick={() => {
                                if (draftPhase === "placement" && isSlot) {
                                  handleDraftHexClick(hex.id);
                                }
                              }}
                              onContextMenu={(e) => {
                                if (draftPhase === "placement") {
                                  handleDraftHexRightClick(hex.id, e);
                                }
                              }}
                              className="hex"
                            >
                            <polygon
                              points={hexPoints(hex)}
                              fill={
                                RESOURCE_TEXTURE[(fillResource as TextureResource)]
                                  ? `url(#draft-tex-${fillResource})`
                                  : RESOURCE_COLOR[(fillResource as TextureResource)]
                              }
                              stroke={stroke}
                              strokeWidth={strokeWidth}
                            />
                            {hex.numberToken && (
                              <image
                                href={`/icons/${hex.numberToken}_icon.png`}
                                x={hex.x - HEX_SIZE * 0.3}
                                y={hex.y + HEX_SIZE * 0.18}
                                width={HEX_SIZE * 0.6}
                                height={HEX_SIZE * 0.6}
                                preserveAspectRatio="xMidYMid meet"
                              />
                            )}
                          </g>
                          );
                        })}
                        {hideOtherIsland &&
                          state.board.hexes
                            .filter((hex) =>
                              myTeamId === 1 ? hex.q > 0 : myTeamId === 2 ? hex.q < 0 : false,
                            )
                            .map((hex) => (
                              <polygon
                                key={`hide-${hex.id}`}
                                points={hexPoints(hex)}
                                fill="rgba(6, 10, 18, 0.86)"
                                stroke="rgba(2, 4, 8, 0.6)"
                                strokeWidth={2}
                              />
                            ))}
                      {[1, 2].map((teamId) => {
                        if (hideOtherIsland && myTeamId && teamId !== myTeamId) return null;
                        const center = draftIslandCenters[teamId as TeamId];
                        if (!center) return null;
                        const label = `TEAM ${teamId}`;
                        const width = Math.max(220, label.length * 24 + 80);
                        const height = 60;
                        const offsetX = teamId === 1 ? -220 : 220;
                        const anchorX = center.x + offsetX;
                        return (
                          <g key={`island-label-${teamId}`} pointerEvents="none">
                            <rect
                              x={anchorX - width / 2}
                              y={center.y - height / 2}
                              width={width}
                              height={height}
                              rx={16}
                              fill="rgba(6, 10, 18, 0.75)"
                              stroke={teamId === 1 ? "rgba(79, 177, 255, 0.9)" : "rgba(255, 182, 107, 0.9)"}
                              strokeWidth={2}
                            />
                            <text
                              x={anchorX}
                              y={center.y + 12}
                              textAnchor="middle"
                              fontSize="28"
                              fontWeight="800"
                              fill="#e9eef9"
                              letterSpacing="2px"
                            >
                              {label}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                    </div>
                  </div>
                )}
            </div>
              <div style={{ flex: "0 0 280px", minWidth: 240 }}>
                {isSpellDraft ? (
                  <>
                    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
                      Pick {SPELL_PICKS_PER_TEAM} spells per team. Current pick: Team {currentSpellTeam ?? "?"}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {spellDraftPool.map((spell) => (
                        <button
                          key={spell}
                          type="button"
                          onClick={() => send({ type: "draftSpellPick", spell })}
                          disabled={!canPickSpell}
                          style={{
                            textAlign: "left",
                            background: "#0c121c",
                            border: "1px solid #1f2a36",
                            color: "#e9eef9",
                            borderRadius: 8,
                            padding: "8px 10px",
                            fontSize: 12,
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>{SPELL_LABEL[spell]}</div>
                          <div style={{ opacity: 0.7 }}>{SPELL_DESCRIPTION[spell]}</div>
                        </button>
                      ))}
                      {spellDraftPool.length === 0 && (
                        <div style={{ fontSize: 12, opacity: 0.7 }}>Waiting for picks...</div>
                      )}
                    </div>
                    <div style={{ marginTop: 14 }}>
                      {[1, 2].map((teamId) => (
                        <div key={`spell-team-${teamId}`} style={{ marginBottom: 8 }}>
                          <div style={{ fontWeight: 700, fontSize: 12 }}>Team {teamId}</div>
                          <div style={{ fontSize: 12, opacity: 0.75 }}>
                            {state.spellDraftPicks?.[teamId as TeamId]?.length
                              ? state.spellDraftPicks[teamId as TeamId].map((s) => SPELL_LABEL[s]).join(", ")
                              : "No picks yet."}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
                      {placementStatus}
                    </div>
                    {!soloDraftTest && !myTeamId && (
                      <div style={{ fontSize: 12, color: "#ffb3b3" }}>Pick a team in the lobby first.</div>
                    )}
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Draft tiles</div>
                      {draftTileOptions.length === 0 && (
                        <div style={{ fontSize: 12, opacity: 0.7 }}>Waiting for draft results.</div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {draftTileOptions.map((entry) => (
                          <button
                            key={entry.tile.id}
                            type="button"
                            onClick={() => setSelectedDraftTileId(entry.tile.id)}
                            style={{
                              textAlign: "left",
                              background: selectedDraftTileId === entry.tile.id ? "#1f3c5d" : "#0c121c",
                              border: "1px solid #1f2a36",
                              color: "#e9eef9",
                              borderRadius: 6,
                              padding: "6px 8px",
                              fontSize: 12,
                            }}
                          >
                            {soloDraftTest ? `Team ${entry.teamId} - ` : ""}
                            {RESOURCE_LABEL[entry.tile.resource]} - {entry.tile.numberToken}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ marginTop: 12, fontSize: 12, opacity: 0.8 }}>
                      {state.draftMapReady ? "Map ready." : "Map incomplete."}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (showLobbyScreen || mapPage) {
    if (mapPage) {
      return (
        <div className="page">
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
                    <div key={p.id} style={{ fontSize: 11 }}>
                      {p.id} ({p.ratio}{p.resource ? ` ${p.resource}` : ''})
                    </div>
                  ))}
                </div>
              </div>
              <div className="map-controls inline">
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 12, color: '#f5f5f5' }}>
                  <input type="checkbox" checked={numberMode} onChange={(e) => setNumberMode(e.target.checked)} /> Number Mode
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 12, color: '#f5f5f5' }}>
                  <input type="checkbox" checked={portMode} onChange={(e) => setPortMode(e.target.checked)} /> Bridge Mode
                </label>
                {portMode && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
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
                <select value={editResource} onChange={(e) => setEditResource(e.target.value as ResourceType | "desert" | "empty" | "water" | "water_port" | "cloud" | "dev")}>
                  {(["brick", "lumber", "wool", "grain", "ore", "gold", "dev", "desert", "water", "water_port", "cloud", "empty"] as Array<ResourceType | "desert" | "empty" | "water" | "water_port" | "cloud" | "dev">).map((r) => (
                    <option key={r} value={r}>
                      {HEX_RESOURCE_LABEL[r as HexResource] || "Empty"}
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
                    title="Assign random numbers"
                    onClick={() => {
                      const tokens = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
                      const shuffled = tokens
                        .map((t) => ({ t, r: Math.random() }))
                        .sort((a, b) => a.r - b.r)
                        .map((x) => x.t);
                      setMapDraft((prev) => {
                        const copy = prev.slice();
                        let idx = 0;
                        for (const hex of copy) {
                          if (["desert", "water", "water_port", "empty"].includes(hex.resource)) continue;
                          hex.numberToken = shuffled[idx % shuffled.length];
                          idx++;
                        }
                        return copy;
                      });
                    }}
                  >
                    Random Numbers
                  </button>
                  <button
                    title="Export map JSON"
                    onClick={() => {
                      try {
                        const vertexKeyById = new Map(draftGraph.vertices.map((v) => [v.id, v.key]));
                        const hexes = mapDraft
                          .filter((h) => h.resource !== "empty")
                          .map((h) => ({ id: h.id, q: h.q, r: h.r, resource: h.resource, numberToken: h.numberToken }));
                        const ports = portBridges
                          .map((pb) => {
                            const portMeta = mapPorts.find((p) => p.id === pb.portId);
                            const primary = pb.vertices[0];
                            if (!portMeta || !primary) return null;
                            const primaryKey = vertexKeyById.get(primary);
                            if (!primaryKey) return null;
                            const bridgeKeys = pb.vertices.map((vid) => vertexKeyById.get(vid)).filter(Boolean) as string[];
                            return {
                              id: pb.portId,
                              vertexKey: primaryKey,
                              ratio: portMeta.ratio,
                              resource: portMeta.resource,
                              bridges: bridgeKeys,
                            };
                          })
                          .filter(Boolean) as Array<{ id: string; vertexKey: string; ratio: 2 | 3; resource?: ResourceType | 'any'; bridges?: string[] }>;
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
                  <button title="Import map JSON" onClick={() => fileInputRef.current?.click()}>
                    Import JSON
                  </button>
                </div>
                <select
                  value={editNumber === "" ? "" : String(editNumber)}
                  onChange={(e) => setEditNumber(e.target.value === "" ? "" : Number(e.target.value))}
                  disabled={editResource === "desert" || editResource === "empty" || editResource === "water" || editResource === "water_port"}
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
                          const resource = (h.resource as ResourceType | "desert" | "empty" | "water" | "water_port" | "cloud" | "dev") || "empty";
                          return { id, q, r, x, y, resource, numberToken: h.numberToken };
                        });
                        setMapDraft(draft as any);
                        setPortBridges([]);
                        setBridgeSelectPort(null);
                      } catch (err) {
                        setError('Invalid map JSON file');
                      }
                    };
                    reader.readAsText(file);
                    e.currentTarget.value = '';
                  }}
                />
                <button
                  onClick={() => {
                  const vertexMap = new Map(draftGraph.vertices.map((v) => [v.id, v]));
                  const hexes = mapDraft
                    .filter((h) => h.resource !== "empty")
                    .map((h) => ({
                      id: h.id,
                      q: h.q,
                      r: h.r,
                      resource: (h.resource === "water_port" ? "water" : h.resource) as ResourceType | "desert" | "water" | "cloud" | "dev",
                      numberToken: typeof h.numberToken === "number" ? h.numberToken : undefined,
                    }));
                  const ports = portBridges
                    .map((pb) => {
                      const meta = mapPorts.find((p) => p.id === pb.portId);
                      const primary = pb.vertices[0];
                      if (!meta || !primary) return null;
                      const primaryVertex = vertexMap.get(primary);
                      if (!primaryVertex) return null;
                      const bridgeKeys = pb.vertices
                        .map((vid) => vertexMap.get(vid)?.key)
                        .filter(Boolean) as string[];
                      return {
                        id: pb.portId,
                        vertexKey: primaryVertex.key,
                        ratio: meta.ratio,
                        resource: meta.resource,
                        bridges: bridgeKeys,
                      };
                    })
                    .filter(Boolean) as Array<{ id: string; vertexKey: string; ratio: 2 | 3; resource?: ResourceType | 'any'; bridges?: string[] }>;
                  setPendingBoard({ hexes, ports });
                  void persistMapJson({ hexes, ports }, mapFileName || "custom-map.json");
                  if (ws && status === "connected" && state?.phase === "lobby") {
                    send({ type: "setCustomBoard", hexes: hexes as any, ports });
                    setPendingBoard(null);
                  }
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
                  try {
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                  } catch {}
                }}
                onPointerUp={(e) => {
                  setIsPanning(false);
                  setLastPointer(null);
                  try {
                    (e.target as Element).releasePointerCapture?.(e.pointerId);
                  } catch {}
                }}
                onPointerMove={(e) => {
                  if (!isPanning || !lastPointer) return;
                  const dx = e.clientX - lastPointer.x;
                  const dy = e.clientY - lastPointer.y;
                  setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
                  setLastPointer({ x: e.clientX, y: e.clientY });
                }}
                onPointerLeave={() => {
                  setIsPanning(false);
                  setLastPointer(null);
                }}
              >
                <defs>
                  {Object.entries(RESOURCE_TEXTURE).map(([res, href]) => {
                    if (!href) return null;
                    const scale = getTextureScale(res as ResourceType | "desert" | "empty" | "water" | "cloud" | "dev");
                    const offset = getTextureOffset(scale);
                    return (
                      <pattern
                        key={res}
                        id={`tex-${res}`}
                        patternUnits="objectBoundingBox"
                        patternContentUnits="objectBoundingBox"
                        width="1"
                        height="1"
                      >
                        <image
                          href={href}
                          x={offset}
                          y={offset}
                          width={scale}
                          height={scale}
                          preserveAspectRatio="xMidYMid slice"
                        />
                      </pattern>
                    );
                  })}
                  {WATER_TEXTURE && (
                    <pattern
                      id="tex-water"
                      patternUnits="objectBoundingBox"
                      patternContentUnits="objectBoundingBox"
                      width="1"
                      height="1"
                    >
                      <image
                        href={WATER_TEXTURE}
                        x={getTextureOffset(getTextureScale("water"))}
                        y={getTextureOffset(getTextureScale("water"))}
                        width={getTextureScale("water")}
                        height={getTextureScale("water")}
                        preserveAspectRatio="xMidYMid slice"
                      />
                    </pattern>
                  )}
                </defs>
                <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                  {/* remove giant water background */}
                  {draftRing && <polygon points={draftRing.points} fill="none" stroke="none" />}
                  {/* show outlines for all grid hexes so empty cells are visible */}
                  {mapDraft.map((hex) => (
                    <polygon
                      key={`outline-${hex.id}`}
                      points={hexPoints(hex)}
                      fill="none"
                      stroke="#f5e0b3"
                      strokeWidth={3}
                      opacity={0.3}
                      pointerEvents="none"
                    />
                  ))}
                  {/* clickable hit areas for every hex (even empty) */}
                  {mapDraft.map((hex) => (
                    <polygon
                      key={`hit-${hex.id}`}
                      points={hexPoints(hex)}
                      fill="transparent"
                      stroke="none"
                      onClick={() => handleHexClick(hex.id)}
                      onContextMenu={(e) => handleHexRightClick(hex.id, e)}
                      pointerEvents="all"
                    />
                  ))}
                  {mapDraft
                    .filter((hex) => hex.resource !== "empty")
                    .map((hex) => {
                      const resource = hex.resource;
                      const numberToken = hex.numberToken;
                      const fillResource = resource === "water_port" ? "water" : resource;
                      const isWater = fillResource === "water";
                      return (
                        <g key={hex.id} onClick={() => handleHexClick(hex.id)} onContextMenu={(e) => handleHexRightClick(hex.id, e)} className="hex">
                          <polygon
                            points={hexPoints(hex)}
                            fill={
                              RESOURCE_TEXTURE[(fillResource as TextureResource)]
                                ? `url(#tex-${fillResource})`
                                : RESOURCE_COLOR[(fillResource as TextureResource)]
                            }
                            stroke={isWater ? "transparent" : "#f5e0b3"}
                            strokeWidth={isWater ? 0 : 5}
                            opacity={robberMode ? 0.9 : 1}
                            className="hex-bg"
                          />
                          {numberToken && (
                            <g>
                                {/* token background removed per request */}
                                {
                                  (() => {
                                    const size = HEX_SIZE * 0.6; // slightly larger on main board
                                    const x = hex.x - size / 2;
                                    const y = hex.y + HEX_SIZE * 0.18; // lower part of tile
                                    return (
                                      <image
                                        href={`/icons/${numberToken}_icon.png`}
                                        x={x}
                                        y={y}
                                        width={size}
                                        height={size}
                                        preserveAspectRatio="xMidYMid meet"
                                      />
                                    );
                                  })()
                                }
                            </g>
                          )}
                        </g>
                      );
                    })}
                  {state?.board?.ports?.map((port) => {
                    const v = state?.board?.vertices.find((vt) => vt.id === port.vertexId);
                    if (!v) return null;
                    const touchingHexIds = (state.board.vertexHexes as any)?.[port.vertexId] || [];
                    const waterHex =
                      (port.waterHexId && state.board.hexes.find((h) => h.id === port.waterHexId)) ||
                      state.board.hexes.find(
                        (h) =>
                          touchingHexIds.includes(h.id) &&
                          (h.resource === "water_port" || h.resource === "water")
                      );
                    const px = waterHex ? waterHex.x : v.x;
                    const py = waterHex ? waterHex.y : v.y;
                    const bridges = Array.isArray(port.bridges) ? port.bridges : [];
                    const bridgeEls = bridges
                      .map((bid, idx) => {
                        const bv = state?.board?.vertices.find((vt) => vt.id === bid);
                        if (!bv) return null;
                        const midX = (px + bv.x) / 2;
                        const midY = (py + bv.y) / 2;
                        const angleDeg = (Math.atan2(bv.y - py, bv.x - px) * 180) / Math.PI;
                        return (
                          <g key={`${port.id}-bridge-${idx}`}>
                            <line
                              x1={px}
                              y1={py}
                              x2={bv.x}
                              y2={bv.y}
                              stroke="#f6c343"
                              strokeWidth={8}
                              strokeLinecap="round"
                              opacity={0.8}
                              pointerEvents="none"
                            />
                            {BRIDGE_ICON && (
                              <image
                                href={BRIDGE_ICON}
                                x={midX - 24}
                                y={midY - 10}
                                width={48}
                                height={20}
                                transform={`rotate(${angleDeg} ${midX} ${midY})`}
                                opacity={0.9}
                                pointerEvents="none"
                              />
                            )}
                          </g>
                        );
                      })
                      .filter(Boolean);
                    const icon =
                      port.resource && port.resource !== "any"
                        ? PORT_ICON[port.resource]
                        : port.ratio === 3
                          ? ANY_PORT_ICON
                          : undefined;
                    return (
                      <g key={port.id}>
                        {bridgeEls}
                        {icon ? (
                          <image
                            href={icon}
                            x={px - PORT_ICON_SIZE / 2}
                            y={py - PORT_ICON_SIZE / 2}
                            width={PORT_ICON_SIZE}
                            height={PORT_ICON_SIZE}
                            preserveAspectRatio="xMidYMid meet"
                            pointerEvents="none"
                          />
                        ) : (
                          <g className="port-marker" transform={`translate(${px} ${py})`}>
                            <circle r={38} fill="#ffeccb" stroke="#c08a3a" strokeWidth={4} />
                            <text
                              x={0}
                              y={-8}
                              textAnchor="middle"
                              fontSize={18}
                              fontWeight={700}
                              fill="#5a3b14"
                              pointerEvents="none"
                            >
                              {port.ratio}:1
                            </text>
                            {port.resource && port.resource !== "any" && (
                              <text
                                x={0}
                                y={18}
                                textAnchor="middle"
                                fontSize={16}
                                fontWeight={700}
                                fill="#5a3b14"
                                pointerEvents="none"
                              >
                                {port.resource[0].toUpperCase()}
                              </text>
                            )}
                          </g>
                        )}
                      </g>
                    );
                  })}
                  {/* bridge mode: click eligible vertices around water_port tiles */}
                  {portMode &&
                    draftGraph.vertices.map((v) => {
                      if (!visibleDraftVertices.has(v.key)) return null;
                      if (!portVertexInfo.eligible.has(v.id)) return null;
                      const isSelected = portBridges.some((b) => b.vertices.includes(v.id));
                      return (
                        <g key={v.id} transform={`translate(${v.x} ${v.y})`} className="editor-vertex" onClick={() => handleBridgeVertexClick(v.id)}>
                          <circle
                            cx={0}
                            cy={0}
                            r={20}
                            fill={isSelected ? "#ffb74d" : "#f5f5f5"}
                            stroke={isSelected ? "#e68600" : "#2f3640"}
                            strokeWidth={3}
                            opacity={0.95}
                          />
                        </g>
                      );
                    })}
                  {/* render selected bridges for ports in editor */}
                  {portBridges.map((pb) => {
                    const portHex = mapDraft.find((h) => h.id === pb.portId);
                    if (!portHex) return null;
                    return pb.vertices.map((vid) => {
                      const v = draftGraph.vertices.find((vx) => vx.id === vid);
                      if (!v) return null;
                      const midX = (v.x + portHex.x) / 2;
                      const midY = (v.y + portHex.y) / 2;
                      const angleDeg = (Math.atan2(v.y - portHex.y, v.x - portHex.x) * 180) / Math.PI;
                      return (
                        <g key={`${pb.portId}-${vid}`}>
                          <line x1={portHex.x} y1={portHex.y} x2={v.x} y2={v.y} stroke="#f6c343" strokeWidth={8} strokeLinecap="round" opacity={0.75} />
                          <image
                            href={BRIDGE_ICON}
                            x={midX - 24}
                            y={midY - 10}
                            width={48}
                            height={20}
                            transform={`rotate(${angleDeg} ${midX} ${midY})`}
                            opacity={0.9}
                            pointerEvents="none"
                          />
                        </g>
                      );
                    });
                  })}
                </g>
              </svg>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="join-screen">
        <div className="lobby-shell">
          <div className="lobby-frame">
            <div className="lobby-header">
              <div className="lobby-title">
                <h1>Catan Lobby</h1>
                <p>Enter your name and server URL to start.</p>
              </div>
              <div className="lobby-room">
                <span>Room:</span>
                <div className="lobby-room-pill">
                  <input
                    value={serverUrlInput}
                    onChange={(e) => setServerUrlInput(e.target.value)}
                    onBlur={applyServerUrlInput}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        applyServerUrlInput();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    placeholder="ws://localhost:3001"
                    disabled={status === "connecting"}
                    aria-label="Server URL"
                  />
                  <button
                    type="button"
                    className="lobby-button lobby-room-copy"
                    onClick={handleCopyRoom}
                    disabled={!serverUrlInput}
                  >
                    Copy
                  </button>
                </div>
                <button
                  type="button"
                  className="lobby-button lobby-room-quick"
                  onClick={handleQuickJoinServer1}
                >
                  Join Server 1
                </button>
              </div>
            </div>
            <div className="lobby-body">
              <section className="lobby-panel lobby-panel-players">
                <div className="lobby-panel-header">
                  <h2>Players</h2>
                  <span className="lobby-panel-sub">
                    {state?.players?.length
                      ? `${state.players.length} player${state.players.length === 1 ? "" : "s"}`
                      : "No players yet"}
                  </span>
                </div>
                {state?.players && state.players.length > 0 ? (
                  <ul className="lobby-list">
                    {state.players.map((p) => (
                      <li key={p.id} className="lobby-player-card">
                        <div className="lobby-player-main">
                          <span className="dot" style={{ background: p.color }} />
                          <div className="lobby-player-info">
                            <div className="lobby-player-name">{p.name}</div>
                            <div className="lobby-player-tags">
                              {state.hostId === p.id && <span className="lobby-tag host">Host</span>}
                              <span className={`lobby-tag ${p.ready ? "ready" : "not-ready"}`}>
                                {p.ready ? "Ready" : "Not ready"}
                              </span>
                              {state?.teamMode && (
                                <span className="lobby-tag">Team: {p.teamId ? `Team ${p.teamId}` : "Unassigned"}</span>
                              )}
                              <span className="lobby-tag">
                                Color: {PLAYER_COLOR_LABEL[p.color as PlayerColor] || p.color}
                              </span>
                              {p.hoverColor && p.hoverColor !== p.color && (
                                <span className="lobby-tag warn">
                                  Hovering: {PLAYER_COLOR_LABEL[p.hoverColor as PlayerColor] || p.hoverColor}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {state?.teamMode && p.id === playerId && (
                          <div className="lobby-team-buttons">
                            <button
                              type="button"
                              className="lobby-chip-button"
                              onClick={() => send({ type: "setTeam", teamId: 1 })}
                              disabled={p.teamId === 1 || teamCounts[1] >= 2}
                            >
                              Team 1
                            </button>
                            <button
                              type="button"
                              className="lobby-chip-button"
                              onClick={() => send({ type: "setTeam", teamId: 2 })}
                              disabled={p.teamId === 2 || teamCounts[2] >= 2}
                            >
                              Team 2
                            </button>
                            <button
                              type="button"
                              className="lobby-chip-button"
                              onClick={() => send({ type: "setTeam", teamId: null })}
                              disabled={!p.teamId}
                            >
                              Clear
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="lobby-empty">No players in the lobby yet.</div>
                )}
                {inLobby && joined && <div className="lobby-hint">{actionHint}</div>}
                <div className="lobby-actions">
                  {inLobby && joined ? (
                    <button className="lobby-button lobby-ready-button" onClick={() => send({ type: "setReady", ready: !meReady })}>
                      {meReady ? "Ready" : "Ready Up"}
                    </button>
                  ) : (
                    <button
                      className="lobby-button lobby-ready-button"
                      onClick={() => {
                        const next = serverUrlInput.trim();
                        if (next && next !== serverUrl) {
                          setServerUrl(next);
                          connect(next);
                          return;
                        }
                        connect();
                      }}
                      disabled={status === "connecting" || joinInFlight}
                    >
                      {status === "connecting" ? "Connecting..." : "Join Game"}
                    </button>
                  )}
                  {inLobby && joined && (
                    <button className="lobby-button lobby-secondary-button" onClick={handleLobbyServerReset}>
                      Reset Lobby
                    </button>
                  )}
                  {inLobby && joined && (
                    <button className="lobby-button lobby-secondary-button" onClick={handleLobbyServerResetAll}>
                      Reset Server
                    </button>
                  )}
                  <button className="lobby-button lobby-ghost-button" onClick={handleLobbyReset}>
                    Leave Lobby
                  </button>
                </div>
              </section>
              <section className="lobby-panel lobby-panel-you">
                <div className="lobby-panel-header">
                  <h2>You</h2>
                </div>
                <label className="lobby-field">
                  <span>Name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    disabled={lockJoinFields}
                  />
                </label>
                <div className="lobby-color-picker">
                  <div className="lobby-label">Choose color</div>
                  <div className="lobby-color-row">
                    {PLAYER_COLORS.map((c) => {
                      const takenBy = state?.players?.find((p) => p.color === c) || null;
                      const takenByOther = !!takenBy && takenBy.id !== playerId;
                      const isSelected = selectedColor === c;
                      const hoverNames =
                        state?.players
                          ?.filter((p) => p.hoverColor === c && p.id !== playerId)
                          .map((p) => p.name) ?? [];
                      const hoverLabel = hoverNames.length ? `Hover: ${hoverNames.join(", ")}` : "";
                      const titleParts = [
                        takenBy ? `Taken by ${takenBy.name}` : "",
                        hoverLabel,
                      ].filter(Boolean);
                      return (
                        <button
                          type="button"
                          key={c}
                          className={`lobby-color-button ${isSelected ? "selected" : ""}`}
                          onClick={() => {
                            setPlayerColor(c);
                            if (inLobby && joined) {
                              send({ type: "setColor", color: c });
                            }
                          }}
                          onMouseEnter={() => {
                            if (inLobby && joined) {
                              send({ type: "setColorHover", color: c });
                            }
                          }}
                          onMouseLeave={() => {
                            if (inLobby && joined) {
                              send({ type: "setColorHover", color: null });
                            }
                          }}
                          disabled={takenByOther && !isSelected}
                          aria-pressed={isSelected}
                          aria-label={PLAYER_COLOR_LABEL[c]}
                          title={
                            titleParts.length
                              ? titleParts.join(" | ")
                              : takenByOther
                                ? "Color already taken"
                                : `Use ${PLAYER_COLOR_LABEL[c]} pieces`
                          }
                        >
                          <span className="lobby-color-fill" style={{ background: c }} />
                        </button>
                      );
                    })}
                  </div>
                  <div className="lobby-color-status">
                    {selectedColor ? `Selected: ${PLAYER_COLOR_LABEL[selectedColor]}` : "Pick a color to continue."}
                  </div>
                </div>
                <div className="lobby-map-block">
                  <div className="lobby-label">Map</div>
                  <div className="lobby-map-card">
                    <div className="lobby-map-name">{mapName || "Classic Catan (Random)"}</div>
                    {mapStatus && <div className="lobby-map-status">{mapStatus}</div>}
                  </div>
                  <div className="lobby-map-actions">
                    <button
                      type="button"
                      className="lobby-button lobby-secondary-button"
                      onClick={() => lobbyFileInputRef.current?.click()}
                    >
                      Load Map JSON
                    </button>
                    <button
                      type="button"
                      className="lobby-link-button"
                      onClick={() => {
                        setMapDraft(editorGrid);
                        setEditNumber("");
                        setEditResource("empty");
                        setNumberMode(false);
                        setPortMode(false);
                        setPortBridges([]);
                        setBridgeSelectPort(null);
                        setPan({ x: 0, y: 0 });
                        setZoom(1);
                        setError("");
                        mapPageRef.current = true;
                        setMapPage(true);
                      }}
                    >
                      Map Editor
                    </button>
                  </div>
                  <input
                    type="file"
                    accept="application/json"
                    ref={lobbyFileInputRef}
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        try {
                          const parsed = JSON.parse(reader.result as string);
                          applyBoardFromJson(parsed, file.name);
                        } catch {
                          setError("Invalid map JSON file");
                        }
                      };
                      reader.readAsText(file);
                    }}
                  />
                </div>
              </section>
            </div>
          </div>
          {inLobby && joined && (
            <div className="lobby-settings">
              <div className="lobby-panel-header">
                <h2>Game settings</h2>
                <span className="lobby-panel-sub">Applies when the game starts.</span>
              </div>
              <div className="lobby-settings-grid">
                <label className="lobby-setting">
                  <span>VPs to win</span>
                  <input
                    type="number"
                    min={3}
                    max={20}
                    value={vpGoal}
                    onChange={(e) => setVpGoal(Number(e.target.value) || 0)}
                  />
                </label>
                <label className="lobby-setting">
                  <span>Discard if hand &gt;</span>
                  <input
                    type="number"
                    min={3}
                    max={20}
                    value={discardLimit}
                    onChange={(e) => setDiscardLimit(Number(e.target.value) || 0)}
                  />
                </label>
                <label className="lobby-setting lobby-setting-checkbox">
                  <input
                    type="checkbox"
                    checked={teamMode}
                    onChange={(e) => setTeamMode(e.target.checked)}
                  />
                  <span>2v2 mode</span>
                </label>
                {teamMode && (
                  <label className="lobby-setting">
                    <span>Map mode</span>
                    <select
                      value={teamMapMode}
                      onChange={(e) => setTeamMapMode(e.target.value as TeamMapMode)}
                    >
                      <option value="preloaded">Pre-loaded</option>
                      <option value="draft">Draft (auction)</option>
                    </select>
                  </label>
                )}
              </div>
            </div>
          )}
          {error && <div className="error lobby-error">{error}</div>}
        </div>
      </div>
    );
  }
  return (
      <div className="page">
      {error && <div className="error" style={{ marginBottom: 8 }}>{error}</div>}
      {state?.awaitingGold && (me?.pendingGold || 0) > 0 && (
        <div className="modal-overlay" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#0d1b2a", color: "#fff", padding: 24, borderRadius: 12, minWidth: 360, boxShadow: "0 6px 24px rgba(0,0,0,0.4)" }}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Gold Choice</h3>
            <p style={{ margin: "6px 0 12px" }}>Pick a resource for each gold. Remaining: {me?.pendingGold ?? 0}.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {GOLD_CHOICE_RESOURCES.map((res) => (
                <button key={res} onClick={() => send({ type: "chooseGold", resource: res })}>
                  {RESOURCE_LABEL[res]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="main-layout">
          <div className={`board-area ${boardFullscreen ? "fullscreen" : ""}`}>
            <div className="board-actions">
              <button
                onClick={() => {
                  setPendingBoard(null);
                  setMapName("");
                  setMapStatus("");
                  setMapFileName("");
                  mapPageRef.current = false;
                  setMapPage(false);
                  send({ type: "reset" });
                }}
              >
                Reset
              </button>
              <button onClick={() => send({ type: "rollDice" })} disabled={!state || !isMyTurn || state.hasRolled || state.awaitingGold}>
                Roll
              </button>
              <button
                onClick={() => send({ type: "endTurn" })}
                disabled={
                  !state ||
                  !isMyTurn ||
                  state.phase !== "turn" ||
                  !state.hasRolled ||
                  state.awaitingRobber ||
                  state.awaitingDiscard ||
                  state.awaitingGold
                }
              >
                End
              </button>
            </div>

            {state && bounds && (
              <div
                className={`board-wrapper board-pan ${boardDragging ? "dragging" : ""}`}
                ref={boardWrapperRef}
                onPointerDown={handleBoardPointerDown}
                onPointerMove={handleBoardPointerMove}
                onPointerUp={handleBoardPointerEnd}
                onPointerLeave={handleBoardPointerEnd}
                onPointerCancel={handleBoardPointerEnd}
                onClickCapture={handleBoardClickCapture}
              >
                <div className="board-zoom" ref={boardZoomElRef}>
                  <svg className="board" viewBox={`${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`}>
                  <defs>
                    {Object.entries(RESOURCE_TEXTURE).map(([res, href]) => {
                      if (!href) return null;
                      const scale = getTextureScale(res as ResourceType | "desert" | "empty" | "water" | "cloud" | "dev");
                      const offset = getTextureOffset(scale);
                      return (
                        <pattern
                          key={res}
                          id={`tex-${res}`}
                          patternUnits="objectBoundingBox"
                          patternContentUnits="objectBoundingBox"
                          width="1"
                          height="1"
                        >
                        <image
                          href={href}
                          x={offset}
                          y={offset}
                          width={scale}
                          height={scale}
                          preserveAspectRatio="xMidYMid slice"
                        />
                      </pattern>
                    );
                  })}
                    {WATER_TEXTURE && (
                      <pattern
                        id="tex-water"
                        patternUnits="objectBoundingBox"
                        patternContentUnits="objectBoundingBox"
                        width="1"
                        height="1"
                      >
                        <image
                          href={WATER_TEXTURE}
                          x={getTextureOffset(getTextureScale("water"))}
                          y={getTextureOffset(getTextureScale("water"))}
                          width={getTextureScale("water")}
                          height={getTextureScale("water")}
                          preserveAspectRatio="xMidYMid slice"
                        />
                      </pattern>
                    )}
                  </defs>
                  {/* remove giant water background */}
                  {boardRing && <polygon points={boardRing.points} fill="none" stroke="none" />}
                  {state.board.hexes.map((hex) => {
                    const cloudReveal = state.revealedClouds?.[hex.id];
                    const displayResource =
                      hex.resource === "cloud" && cloudReveal ? cloudReveal : hex.resource;
                    const fillResource = displayResource === "water_port" ? "water" : displayResource;
                    const isEmpty = (hex as any).resource === "empty";
                    const isWater = fillResource === "water";
                    const spellTargeted = !!activeSpell && spellTargets.includes(hex.id);
                    return (
                      <g key={hex.id} onClick={() => handleHexClick(hex.id)} className="hex">
                        <polygon
                          points={hexPoints(hex)}
                          fill={
                            isEmpty
                              ? "none"
                              : RESOURCE_TEXTURE[(fillResource as TextureResource)]
                                ? `url(#tex-${fillResource})`
                                : RESOURCE_COLOR[(fillResource as TextureResource)]
                          }
                          stroke={isEmpty || isWater ? "transparent" : "#f5e0b3"}
                          strokeWidth={isEmpty || isWater ? 0 : 5}
                          opacity={robberMode ? 0.9 : 1}
                          className="hex-bg"
                        />
                        {spellTargeted && (
                          <polygon
                            points={hexPoints(hex)}
                            fill="none"
                            stroke="#5dd2ff"
                            strokeWidth={4}
                            pointerEvents="none"
                          />
                        )}
                        {hex.numberToken && (hex.resource !== "cloud" || !!cloudReveal) && (
                          <g>
                            {/* token background removed per request */}
                            {(() => {
                              const size = HEX_SIZE * 0.6; // slightly larger on main board
                              const x = hex.x - size / 2;
                              const y = hex.y + HEX_SIZE * 0.18; // lower part of tile
                              const cy = y + size / 2;
                              return (
                                <>
                                  {spellTargeted && (
                                    <circle
                                      cx={hex.x}
                                      cy={cy}
                                      r={size * 0.42}
                                      fill="rgba(93, 210, 255, 0.2)"
                                      stroke="#5dd2ff"
                                      strokeWidth={4}
                                    />
                                  )}
                                  <image
                                    href={`/icons/${hex.numberToken}_icon.png`}
                                    x={x}
                                    y={y}
                                    width={size}
                                    height={size}
                                    preserveAspectRatio="xMidYMid meet"
                                  />
                                </>
                              );
                            })()}
                          </g>
                        )}
                      </g>
                    );
                  })}
                  {state.phase !== "lobby" && state.board.ports?.map((port) => {
                    const v = state.board.vertices.find((vt) => vt.id === port.vertexId);
                    if (!v) return null;
                    const touchingHexIds = (state.board.vertexHexes as any)?.[port.vertexId] || [];
                    const waterHex =
                      (port.waterHexId && state.board.hexes.find((h) => h.id === port.waterHexId)) ||
                      state.board.hexes.find(
                        (h) =>
                          touchingHexIds.includes(h.id) &&
                          (h.resource === "water_port" || h.resource === "water")
                      );
                    const px = waterHex ? waterHex.x : v.x;
                    const py = waterHex ? waterHex.y : v.y;
                    const letter = port.resource && port.resource !== "any" ? port.resource[0].toUpperCase() : "?";
                    const bridges = Array.isArray(port.bridges) ? port.bridges : [];
                    const bridgeEls = bridges
                      .map((bid, idx) => {
                        const bv = state.board.vertices.find((vt) => vt.id === bid);
                        if (!bv) return null;
                        const midX = (px + bv.x) / 2;
                        const midY = (py + bv.y) / 2;
                        const angleDeg = (Math.atan2(bv.y - py, bv.x - px) * 180) / Math.PI;
                        return (
                          <g key={`${port.id}-bridge-${idx}`}>
                            <line
                              x1={px}
                              y1={py}
                              x2={bv.x}
                              y2={bv.y}
                              stroke="#f6c343"
                              strokeWidth={8}
                              strokeLinecap="round"
                              opacity={0.8}
                              pointerEvents="none"
                            />
                            {BRIDGE_ICON && (
                              <image
                                href={BRIDGE_ICON}
                                x={midX - 24}
                                y={midY - 10}
                                width={48}
                                height={20}
                                transform={`rotate(${angleDeg} ${midX} ${midY})`}
                                opacity={0.9}
                                pointerEvents="none"
                              />
                            )}
                          </g>
                        );
                      })
                      .filter(Boolean);
                    const icon =
                      port.resource && port.resource !== "any"
                        ? PORT_ICON[port.resource]
                        : port.ratio === 3
                          ? ANY_PORT_ICON
                          : undefined;
                    return (
                      <g key={port.id}>
                        {bridgeEls}
                        {icon ? (
                          <image
                            href={icon}
                            x={px - PORT_ICON_SIZE / 2}
                            y={py - PORT_ICON_SIZE / 2}
                            width={PORT_ICON_SIZE}
                            height={PORT_ICON_SIZE}
                            preserveAspectRatio="xMidYMid meet"
                            pointerEvents="none"
                          />
                        ) : (
                          <g className="port-marker" transform={`translate(${px} ${py})`}>
                            <circle r={38} fill="#ffeccb" stroke="#c08a3a" strokeWidth={4} />
                            <text x={0} y={-8} textAnchor="middle" fontSize={18} fontWeight={700} fill="#5a3b14" pointerEvents="none">
                              {port.ratio}:1
                            </text>
                            <text x={0} y={18} textAnchor="middle" fontSize={16} fontWeight={700} fill="#5a3b14" pointerEvents="none">
                              {letter}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                  {state.board.edges.map((edge) => {
                    const v1 = state.board.vertices.find((v) => v.id === edge.v1);
                    const v2 = state.board.vertices.find((v) => v.id === edge.v2);
                    if (!v1 || !v2) return null;
                    const edgeCoordKey = edgeKeyForCoords(v1, v2);
                    if (!visibleGraph.edges.has(edgeCoordKey)) return null;
                    const roadPlacementActive = buildMode === "road";
                    const ownerId = state.edgeOwner[edge.id];
                    if (!ownerId && !landEdgeIds.has(edge.id)) return null;
                    const baseColor = ownerId ? playerLookup[ownerId]?.color || "#fff" : "#2f3542";
                    const roadColor = ownerId ? darkenHex(baseColor, 0.2) : baseColor;
                    const roadOutline = ownerId ? darkenHex(baseColor, 0.55) : baseColor;
                    const highlight = highlightEdges.has(edge.id);
                    const midX = (v1.x + v2.x) / 2;
                    const midY = (v1.y + v2.y) / 2;
                    const angleDeg = (Math.atan2(v2.y - v1.y, v2.x - v1.x) * 180) / Math.PI;
                    const hitboxWidth = ownerId ? 36 : highlight ? 32 : 30;
                    return (
                      <g key={edge.id}>
                        {ownerId && (
                          <line
                            x1={v1.x}
                            y1={v1.y}
                            x2={v2.x}
                            y2={v2.y}
                            stroke={roadOutline}
                            strokeWidth={18}
                            strokeLinecap="round"
                            opacity={0.9}
                            pointerEvents="none"
                          />
                        )}
                        <line
                          x1={v1.x}
                          y1={v1.y}
                          x2={v2.x}
                          y2={v2.y}
                          stroke="transparent"
                          strokeWidth={hitboxWidth}
                          strokeLinecap="round"
                          onClick={() => handleEdgeClick(edge.id)}
                          className="edge-hitbox"
                          pointerEvents={roadPlacementActive ? "stroke" : "none"}
                        />
                        <line
                          x1={v1.x}
                          y1={v1.y}
                          x2={v2.x}
                          y2={v2.y}
                          stroke={roadColor}
                          strokeWidth={ownerId ? 14 : highlight ? 12 : 8}
                          strokeLinecap="round"
                          opacity={ownerId ? 0.95 : highlight ? 0.9 : 0.75}
                          onClick={() => handleEdgeClick(edge.id)}
                          className="edge"
                          pointerEvents={roadPlacementActive ? "stroke" : "none"}
                        />
                        {ownerId && BRIDGE_ICON && (
                          <image
                            href={BRIDGE_ICON}
                            x={midX - 24}
                            y={midY - 10}
                            width={48}
                            height={20}
                            transform={`rotate(${angleDeg} ${midX} ${midY})`}
                            opacity={0.9}
                            pointerEvents="none"
                          />
                        )}
                      </g>
                    );
                  })}

                  {state.board.vertices.map((vertex) => {
                  if (!visibleGraph.vertices.has(vertex.id)) return null;
                  const ownerId = state.vertexOwner[vertex.id];
                  const owner = ownerId ? playerLookup[ownerId] : null;
                  if (!owner && !landVertexIds.has(vertex.id)) return null;
                  const vertexPlacementActive = buildMode === "settlement" || buildMode === "city";
                  const isCity = owner?.cities.includes(vertex.id);
                  const highlight = highlightVertices.has(vertex.id);
                  const settlementIcon = owner
                    ? SETTLEMENT_ICON[owner.color as PlayerColor] || SETTLEMENT_ICON[DEFAULT_PLAYER_COLOR]
                    : undefined;
                  const cityIcon = owner
                    ? CITY_ICON[owner.color as PlayerColor] || CITY_ICON[DEFAULT_PLAYER_COLOR]
                    : undefined;
                  return (
                    <g
                      key={vertex.id}
                      onClick={() => handleVertexClick(vertex.id)}
                      className="vertex"
                      pointerEvents={vertexPlacementActive ? "all" : "none"}
                    >
                      <circle
                        cx={vertex.x}
                        cy={vertex.y}
                        r={owner ? PIECE_ICON_SIZE * 0.65 : 24}
                        fill="transparent"
                        className="vertex-hitbox"
                        pointerEvents={vertexPlacementActive ? "all" : "none"}
                      />
                      {!owner && (
                        <circle
                          cx={vertex.x}
                          cy={vertex.y}
                          r={highlight ? 11 : 8}
                          fill={highlight ? "#2a3352" : "#1b2330"}
                          stroke="#0e1116"
                          strokeWidth={4}
                          opacity={highlight ? 0.9 : 0.85}
                        />
                      )}
                      {owner && (
                        <image
                          href={isCity ? cityIcon : settlementIcon}
                          x={vertex.x - PIECE_ICON_SIZE / 2}
                          y={vertex.y - PIECE_ICON_SIZE / 2}
                          width={PIECE_ICON_SIZE}
                          height={PIECE_ICON_SIZE}
                          preserveAspectRatio="xMidYMid meet"
                        />
                      )}
                    </g>
                  );
                })}

                  {robberVisible && state.robberHex &&
                    (() => {
                      const hex = state.board.hexes.find((h) => h.id === state.robberHex);
                      if (!hex) return null;
                      return (
                        <g>
                          <image
                            href="/icons/robber.png"
                            x={hex.x - 82}
                            y={hex.y - 30}
                            width={64}
                            height={64}
                            preserveAspectRatio="xMidYMid meet"
                            style={{ filter: 'grayscale(1) sepia(1) saturate(12) hue-rotate(-10deg) brightness(0.95)' }}
                          />
                        </g>
                      );
                    })()}
                  </svg>
                </div>

                {state && (
              <div className={`log-overlay ${boardFullscreen ? "fullscreen" : ""} ${logCollapsed ? "collapsed" : ""}`}>
                <div className="panel-head">
                  <h3>Log</h3>
                  {state.lastRoll && <span>Roll: {state.lastRoll[0]} + {state.lastRoll[1]}</span>}
                  <button className="collapse-btn" onClick={() => setLogCollapsed((c) => !c)}>
                    {logCollapsed ? "Expand" : "Collapse"}
                  </button>
                </div>
                {!logCollapsed && (
                  <div className="log">
                    {state.log.slice(0, 20).map((entry, idx) => (
                      <div key={idx} className="log-entry">
                        {entry}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

                {state && boardFullscreen && (
                  <div className="colonist-scoreboard">
                    {bankRemaining && (
                      <div className="bank-pool">
                        <div className="bank-title">Bank</div>
                        <div className="bank-grid">
                          {BANK_RESOURCE_TYPES.map((res) => (
                            <div key={res} className="bank-item" title={`${RESOURCE_LABEL[res]} left`}>
                              <div className="bank-icon" style={{ background: RESOURCE_COLOR[res] }}>
                                {RESOURCE_SHORT_LABEL[res]}
                              </div>
                              <div className="bank-count">{bankRemaining[res]}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {scoreboardPlayers.map((p) => {
                      const devCount =
                        p.id === playerId ? p.devCards.length : p.devCardCount ?? (p.devCards ? p.devCards.length : 0);
                      const knightCount = p.playedKnights;
                      const roadCount =
                        typeof p.longestRoadLength === "number"
                          ? p.longestRoadLength
                          : p.roads.length ?? 0;
                      const hasLR = p.hasLongestRoad;
                      const hasLA = p.hasLargestArmy;
                      const isMe = p.id === playerId;
                      const isActive = p.id === activePlayer?.id;
                      return (
                        <div key={p.id} className={`colonist-row ${isMe ? "me" : ""} ${isActive ? "active" : ""}`}>
                          <div className="row-header">{p.name}</div>
                          <div className="row-body">
                            <div className="avatar-block">
                              <div className="avatar-circle" style={{ background: p.color }} />
                              <div className="ribbon">{p.victoryPoints}</div>
                            </div>
                            <div className="card-block">
                              <div className="mini-card">
                                <span className="card-count">{devCount}</span>
                                <div className="card-icon">?</div>
                              </div>
                              <div className="mini-card">
                                <span className="card-count">{knightCount}</span>
                                <div className="card-icon">⚔</div>
                              </div>
                            </div>
                            <div className="stat-block">
                              <div className={`stat-icon stack ${hasLA ? "highlight" : ""}`}>🛡️</div>
                              <div className="stat-value">{knightCount}</div>
                            </div>
                            <div className="stat-block">
                              <div className={`stat-icon road ${hasLR ? "highlight" : ""}`}>🛣️</div>
                              <div className="stat-value">{roadCount}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {boardFullscreen && (
                  <button
                    className="fullscreen-roll"
                    onClick={() => send({ type: "rollDice" })}
                    disabled={!state || !isMyTurn || state.hasRolled || state.awaitingGold}
                    title="Roll dice"
                  >
                    Roll
                  </button>
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
                          setActiveSpell(null);
                          setSpellTargets([]);
                        }}
                        disabled={!isMyTurn || state?.awaitingDiscard || state?.awaitingRobber || state?.awaitingGold}
                        title={tool}
                      >
                        <span className="piece-count">
                          {tool === "settlement"
                            ? remainingPieces.settlements
                            : tool === "city"
                              ? remainingPieces.cities
                              : remainingPieces.roads}
                        </span>
                        <div className="action-icon">{PaletteIcons[tool]}</div>
                        <div className="action-text" aria-label={tool}></div>
                      </button>
                    ))}
                    <button
                      className="action-btn"
                      onClick={() => {
                        send({ type: "buyDevCard" });
                      }}
                      disabled={
                        !isMyTurn ||
                        !state ||
                        state.phase !== "turn" ||
                        state.awaitingRobber ||
                        state.awaitingDiscard ||
                        state.awaitingGold
                      }
                      title="Buy development card"
                    >
                      <div className="action-icon">{DEV_ICONS.victory_point}</div>
                      <div className="action-text" aria-label="Dev"></div>
                    </button>
                    <button
                      className="action-btn"
                      onClick={() => {
                        setPaletteMode(null);
                        setBuildMode(null);
                        setRobberMode(false);
                        setPendingKnight(false);
                        setActiveSpell(null);
                        setSpellTargets([]);
                      }}
                    >
                      <div className="action-text" aria-label="Clear"></div>
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

                {state?.awaitingDiscard && !state?.awaitingGold && (
                  <div className={`discard-overlay ${myDiscardNeed > 0 ? "active" : "waiting"}`}>
                    <div className="discard-title">
                      {myDiscardNeed > 0 ? `Discard ${myDiscardNeed} cards` : "Discarding"}
                    </div>
                    {myDiscardNeed > 0 ? (
                      <>
                        <div className="discard-hint">Click your hand cards to add.</div>
                        <div className="discard-selected">
                          {TRADE_RESOURCES.map((res) => {
                            const selected = discardSelection[res] || 0;
                            if (!selected) return null;
                            return (
                              <button
                                key={res}
                                type="button"
                                className={`discard-pill res-${res}`}
                                onClick={() => removeDiscardResource(res)}
                              >
                                {RESOURCE_LABEL[res]} x{selected}
                                <span className="discard-pill-remove">-</span>
                              </button>
                            );
                          })}
                          {TRADE_RESOURCES.every((res) => (discardSelection[res] || 0) === 0) && (
                            <span className="discard-empty">No cards selected.</span>
                          )}
                        </div>
                        <div className="discard-footer">
                          <label className={`discard-check ${totalDiscardSelected === myDiscardNeed ? "ready" : ""}`}>
                            <input
                              type="checkbox"
                              checked={discardConfirm}
                              disabled={totalDiscardSelected !== myDiscardNeed}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setDiscardConfirm(checked);
                                if (checked && totalDiscardSelected === myDiscardNeed) {
                                  submitDiscard();
                                  setDiscardConfirm(false);
                                }
                              }}
                            />
                            <span>Confirm discard</span>
                          </label>
                          <div className="discard-count">{totalDiscardSelected}/{myDiscardNeed}</div>
                        </div>
                      </>
                    ) : (
                      <div className="discard-hint">Waiting for other players to discard...</div>
                    )}
                  </div>
                )}

                {me && (
                  <div className="hand-overlay">
                    <div className="hand-card-row">
                      {renderResourceCard("brick", me.resources.brick, {
                        onClick: () => addDiscardResource("brick"),
                        selected: discardSelection.brick,
                        discardable: isDiscardMode,
                        disabled: !isDiscardMode,
                      })}
                      {renderResourceCard("lumber", me.resources.lumber, {
                        onClick: () => addDiscardResource("lumber"),
                        selected: discardSelection.lumber,
                        discardable: isDiscardMode,
                        disabled: !isDiscardMode,
                      })}
                      {renderResourceCard("wool", me.resources.wool, {
                        onClick: () => addDiscardResource("wool"),
                        selected: discardSelection.wool,
                        discardable: isDiscardMode,
                        disabled: !isDiscardMode,
                      })}
                      {renderResourceCard("grain", me.resources.grain, {
                        onClick: () => addDiscardResource("grain"),
                        selected: discardSelection.grain,
                        discardable: isDiscardMode,
                        disabled: !isDiscardMode,
                      })}
                      {renderResourceCard("ore", me.resources.ore, {
                        onClick: () => addDiscardResource("ore"),
                        selected: discardSelection.ore,
                        discardable: isDiscardMode,
                        disabled: !isDiscardMode,
                      })}
                    </div>
                  <div className="dev-hand-row">
                    {(["knight", "victory_point", "monopoly", "year_of_plenty", "road_building"] as DevCardType[]).map((d) => {
                      const count = devCounts[d];
                      if (!count) return null;
                      const src = DEV_IMG[d];
                      const label = d.replace(/_/g, " ");
                      const playable = d !== "victory_point";
                      return (
                        <button
                          type="button"
                          className={`dev-card-stack ${selectedDev === d ? "selected" : ""}`}
                          key={d}
                          onClick={() => {
                            if (playable) {
                              setSelectedDev(d);
                              setActiveSpell(null);
                              setSpellTargets([]);
                            }
                          }}
                          title={playable ? `Select ${label}` : "Victory Point (auto-counted)"}
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
                    {state?.teamMode && (
                      <div className="spell-hand-row">
                        <div className="spell-header">
                          <button
                            type="button"
                            className={`spell-toggle-btn ${spellsOpen ? "open" : ""}`}
                            onClick={() => setShowSpells((open) => !open)}
                          >
                            Spells{totalSpells > 0 ? ` (${totalSpells})` : ""}
                          </button>
                          {activeSpell && <div className="spell-active">Casting: {SPELL_LABEL[activeSpell]}</div>}
                        </div>
                        {spellsOpen && (
                          <>
                            <div className="spell-grid">
                              {SPELL_LIST.filter((spell) => (spellCounts[spell] || 0) > 0).map((spell) => {
                                const count = spellCounts[spell] || 0;
                                const disabled = !canUseSpellNow(spell) || count <= 0;
                                const selected = activeSpell === spell;
                                const targetCount = getSpellTargetCount(spell);
                                return (
                                  <button
                                    key={spell}
                                    type="button"
                                    className={`spell-card ${selected ? "selected" : ""}`}
                                    onClick={() => {
                                      if (disabled) return;
                                      if (selected) {
                                        resetSpellSelection();
                                        return;
                                      }
                                      const needsConfig = spellNeedsConfig(spell);
                                      if (!targetCount && !needsConfig) {
                                        if (spell === "copycat" && lastDevCardPlayed === "road_building") {
                                          sendSpell(spell);
                                          setPaletteMode("road");
                                          setBuildMode("road");
                                          setPendingRoadDev(2);
                                          return;
                                        }
                                        if (spell === "smuggler" || spell === "coordinated_trade") {
                                          sendSpell(spell);
                                          setTradeOpen(true);
                                          return;
                                        }
                                        sendSpell(spell);
                                        return;
                                      }
                                      if (spell === "market_disruption") {
                                        setMarketPay({});
                                      }
                                      beginSpell(spell);
                                    }}
                                    disabled={disabled}
                                    title={SPELL_DESCRIPTION[spell]}
                                  >
                                    <div className="spell-name">{SPELL_LABEL[spell]}</div>
                                    <div className="spell-desc">{SPELL_DESCRIPTION[spell]}</div>
                                    <div className="spell-count">{count}</div>
                                  </button>
                                );
                              })}
                              {SPELL_LIST.filter((spell) => (spellCounts[spell] || 0) > 0).length === 0 && (
                                <div className="spell-empty">No team spells yet.</div>
                              )}
                            </div>
                            {activeSpell && (
                              <div className="spell-hint-row">
                                {getSpellTargetCount(activeSpell) > 0 ? (
                                  <>
                                    <span>
                                      {activeSpell === "tectonic_shift"
                                        ? "Pick two non-6/8 numbered land tiles."
                                        : activeSpell === "fertile_ground"
                                          ? "Pick one numbered land tile."
                                          : activeSpell === "seismic_rotation"
                                            ? "Pick three adjacent land tiles."
                                            : activeSpell === "safe_haven"
                                              ? "Pick one land tile."
                                              : activeSpell === "copycat" && lastDevCardPlayed === "knight"
                                                ? "Pick a hex for the robber."
                                                : "Pick tiles."}
                                    </span>
                                    <span>{spellTargets.length}/{getSpellTargetCount(activeSpell)}</span>
                                  </>
                                ) : (
                                  <span>Select options and cast.</span>
                                )}
                                <button
                                  type="button"
                                  className="spell-cancel"
                                  onClick={() => {
                                    resetSpellSelection();
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                            {activeSpell === "switcheroo" && (
                              <div className="spell-config-row">
                                <select value={switcherooFrom} onChange={(e) => setSwitcherooFrom(e.target.value as ResourceType)}>
                                  {TRADE_RESOURCES.map((res) => (
                                    <option key={res} value={res}>
                                      {RESOURCE_LABEL[res]}
                                    </option>
                                  ))}
                                </select>
                                <select value={switcherooTo} onChange={(e) => setSwitcherooTo(e.target.value as ResourceType)}>
                                  {TRADE_RESOURCES.map((res) => (
                                    <option key={res} value={res}>
                                      {RESOURCE_LABEL[res]}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className="spell-cast"
                                  disabled={!me || switcherooFrom === switcherooTo || (me.resources[switcherooFrom] || 0) <= 0}
                                  onClick={() => sendSpell("switcheroo", { resource: switcherooFrom, resourceTo: switcherooTo })}
                                >
                                  Cast
                                </button>
                              </div>
                            )}
                            {activeSpell === "selective_harvest" && (
                              <div className="spell-config-row">
                                <select value={selectiveHarvestNumber} onChange={(e) => setSelectiveHarvestNumber(Number(e.target.value))}>
                                  {[2, 3, 4, 5, 6, 8, 9, 10, 11, 12].map((n) => (
                                    <option key={n} value={n}>
                                      {n}
                                    </option>
                                  ))}
                                </select>
                                <button type="button" className="spell-cast" onClick={() => sendSpell("selective_harvest", { number: selectiveHarvestNumber })}>
                                  Cast
                                </button>
                              </div>
                            )}
                            {activeSpell === "fertile_ground" && (
                              <div className="spell-config-row">
                                <button type="button" className={`spell-toggle ${fertileDelta === -1 ? "active" : ""}`} onClick={() => setFertileDelta(-1)}>
                                  -1
                                </button>
                                <button type="button" className={`spell-toggle ${fertileDelta === 1 ? "active" : ""}`} onClick={() => setFertileDelta(1)}>
                                  +1
                                </button>
                              </div>
                            )}
                            {activeSpell === "skilled_labor" && (
                              <div className="spell-config-row">
                                <select value={skilledLaborPay} onChange={(e) => setSkilledLaborPay(e.target.value as ResourceType)}>
                                  {TRADE_RESOURCES.map((res) => (
                                    <option key={res} value={res}>
                                      Pay {RESOURCE_LABEL[res]}
                                    </option>
                                  ))}
                                </select>
                                <select value={skilledLaborSkip} onChange={(e) => setSkilledLaborSkip(e.target.value as ResourceType)}>
                                  {(["brick", "lumber", "wool", "grain"] as ResourceType[]).map((res) => (
                                    <option key={res} value={res}>
                                      Waive {RESOURCE_LABEL[res]}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className="spell-cast"
                                  disabled={!me || (me.resources[skilledLaborPay] || 0) <= 0}
                                  onClick={() => sendSpell("skilled_labor", { payResource: skilledLaborPay, skipResource: skilledLaborSkip })}
                                >
                                  Cast
                                </button>
                              </div>
                            )}
                            {activeSpell === "market_disruption" && (
                              <div className="spell-config-row column">
                                <select value={marketTargetId} onChange={(e) => setMarketTargetId(e.target.value)}>
                                  <option value="">Select opponent</option>
                                  {(state?.players || [])
                                    .filter((p) => {
                                      if (p.id === playerId) return false;
                                      if (state?.teamMode && me?.teamId && p.teamId === me.teamId) return false;
                                      return true;
                                    })
                                    .map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.name}
                                      </option>
                                    ))}
                                </select>
                                <select value={marketDiscardResource} onChange={(e) => setMarketDiscardResource(e.target.value as ResourceType)}>
                                  {TRADE_RESOURCES.map((res) => (
                                    <option key={res} value={res}>
                                      Discard {RESOURCE_LABEL[res]}
                                    </option>
                                  ))}
                                </select>
                                <div className="spell-pay-row">
                                  {TRADE_RESOURCES.map((res) => (
                                    <div className="spell-pay-item" key={res}>
                                      <span>{RESOURCE_SHORT_LABEL[res]}</span>
                                      <div className="spell-pay-controls">
                                        <button type="button" onClick={() => adjustTradeMap(setMarketPay, res, -1)}>
                                          -
                                        </button>
                                        <span>{marketPay[res] || 0}</span>
                                        <button type="button" onClick={() => adjustTradeMap(setMarketPay, res, 1, me?.resources[res])}>
                                          +
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  className="spell-cast"
                                  disabled={!marketTargetId || marketPayTotal !== 2}
                                  onClick={() =>
                                    sendSpell("market_disruption", {
                                      targetPlayerId: marketTargetId || undefined,
                                      resource: marketDiscardResource,
                                      pay: marketPay,
                                    })
                                  }
                                >
                                  Cast
                                </button>
                              </div>
                            )}
                            {activeSpell === "copycat" && lastDevCardPlayed && lastDevCardPlayed !== "knight" && (
                              <div className="spell-config-row">
                                {lastDevCardPlayed === "monopoly" && (
                                  <select value={monoResource} onChange={(e) => setMonoResource(e.target.value as ResourceType)}>
                                    {TRADE_RESOURCES.map((res) => (
                                      <option key={res} value={res}>
                                        {RESOURCE_LABEL[res]}
                                      </option>
                                    ))}
                                  </select>
                                )}
                                {lastDevCardPlayed === "year_of_plenty" && (
                                  <>
                                    <select value={yopA} onChange={(e) => setYopA(e.target.value as ResourceType)}>
                                      {TRADE_RESOURCES.map((res) => (
                                        <option key={res} value={res}>
                                          {RESOURCE_LABEL[res]}
                                        </option>
                                      ))}
                                    </select>
                                    <select value={yopB} onChange={(e) => setYopB(e.target.value as ResourceType)}>
                                      {TRADE_RESOURCES.map((res) => (
                                        <option key={res} value={res}>
                                          {RESOURCE_LABEL[res]}
                                        </option>
                                      ))}
                                    </select>
                                  </>
                                )}
                                <button
                                  type="button"
                                  className="spell-cast"
                                  onClick={() => {
                                    if (lastDevCardPlayed === "monopoly") {
                                      sendSpell("copycat", { resource: monoResource });
                                    } else if (lastDevCardPlayed === "year_of_plenty") {
                                      sendSpell("copycat", { resource: yopA, resourceTo: yopB });
                                    }
                                  }}
                                >
                                  Cast
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    {selectedDev && selectedDev !== "victory_point" && (
                      <div className="dev-play-row">
                        {selectedDev === "monopoly" && (
                          <select value={monoResource} onChange={(e) => setMonoResource(e.target.value as ResourceType)}>
                            {TRADE_RESOURCES.map((r) => (
                              <option key={r} value={r}>
                                {RESOURCE_LABEL[r]}
                              </option>
                            ))}
                          </select>
                        )}
                        {selectedDev === "year_of_plenty" && (
                          <>
                            <select value={yopA} onChange={(e) => setYopA(e.target.value as ResourceType)}>
                              {TRADE_RESOURCES.map((r) => (
                                <option key={r} value={r}>
                                  {RESOURCE_LABEL[r]}
                                </option>
                              ))}
                            </select>
                            <select value={yopB} onChange={(e) => setYopB(e.target.value as ResourceType)}>
                              {TRADE_RESOURCES.map((r) => (
                                <option key={r} value={r}>
                                  {RESOURCE_LABEL[r]}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                        <button
                          className="dev-confirm"
                          onClick={playSelectedDev}
                          disabled={!isMyTurn || state?.awaitingGold}
                        >
                          Play
                        </button>
                        <button
                          className="dev-cancel"
                          onClick={() => {
                            setSelectedDev(null);
                            if (pendingKnight) {
                              setPendingKnight(false);
                              setRobberMode(false);
                              setPaletteMode(null);
                              setSelectedTarget(null);
                            }
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    {pendingKnight && (
                      <div className="dev-hint-row">Knight active: click a hex to move the robber.</div>
                    )}
                    <button
                      className="trade-toggle"
                      onClick={() =>
                        setTradeOpen((o) => {
                          const next = !o;
                          if (next) setTradeTab("player");
                          return next;
                        })
                      }
                      disabled={!isMyTurn || state?.phase !== "turn" || state?.awaitingGold}
                    >
                      Trade
                    </button>
                    {tradeOpen && (
                      <div className="trade-modal">
                        <div className="trade-head">
                          <div className="trade-tabs">
                            <button
                              type="button"
                              className={`trade-tab ${tradeTab === "player" ? "active" : ""}`}
                              onClick={() => setTradeTab("player")}
                            >
                              Player
                            </button>
                            <button
                              type="button"
                              className={`trade-tab ${tradeTab === "bank" ? "active" : ""}`}
                              onClick={() => setTradeTab("bank")}
                            >
                              Bank
                            </button>
                          </div>
                          <button className="close-btn trade-close" onClick={() => setTradeOpen(false)}>
                            X
                          </button>
                        </div>
                        {tradeTab === "player" ? (
                          <>
                            <div className="trade-panel">
                              <div className="trade-columns">
                                <div className="trade-col">
                                  <div className="trade-col-title">You Give</div>
                                  {TRADE_RESOURCES.map((res) => (
                                    <div className="trade-row" key={res}>
                                      <div className="trade-res">
                                        {RESOURCE_IMG[res] ? (
                                          <img src={RESOURCE_IMG[res]} alt={RESOURCE_LABEL[res]} className="trade-res-icon" />
                                        ) : (
                                          <div className="trade-res-icon fallback">{RESOURCE_SHORT_LABEL[res]}</div>
                                        )}
                                        <span className="trade-res-name">{RESOURCE_LABEL[res]}</span>
                                      </div>
                                      <div className="trade-stepper">
                                        <button type="button" onClick={() => adjustTradeMap(setTradeGive, res, -1)}>
                                          -
                                        </button>
                                        <span className="trade-count">{tradeGive[res] || 0}</span>
                                        <button type="button" onClick={() => adjustTradeMap(setTradeGive, res, 1, me?.resources[res])}>
                                          +
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div className="trade-col">
                                  <div className="trade-col-title">You Get</div>
                                  {TRADE_RESOURCES.map((res) => (
                                    <div className="trade-row" key={res}>
                                      <div className="trade-res">
                                        {RESOURCE_IMG[res] ? (
                                          <img src={RESOURCE_IMG[res]} alt={RESOURCE_LABEL[res]} className="trade-res-icon" />
                                        ) : (
                                          <div className="trade-res-icon fallback">{RESOURCE_SHORT_LABEL[res]}</div>
                                        )}
                                        <span className="trade-res-name">{RESOURCE_LABEL[res]}</span>
                                      </div>
                                      <div className="trade-stepper">
                                        <button type="button" onClick={() => adjustTradeMap(setTradeGet, res, -1)}>
                                          -
                                        </button>
                                        <span className="trade-count">{tradeGet[res] || 0}</span>
                                        <button type="button" onClick={() => adjustTradeMap(setTradeGet, res, 1)}>
                                          +
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="trade-targets">
                                <div className="trade-target-label">Trade With:</div>
                                <div className="trade-target-buttons">
                                  <button
                                    type="button"
                                    className={`trade-target ${tradeTarget === "all" ? "active" : ""}`}
                                    onClick={() => setTradeTarget("all")}
                                  >
                                    Everyone
                                  </button>
                                  {(state?.players || [])
                                    .filter((p) => p.id !== playerId)
                                    .map((p) => (
                                      <button
                                        key={p.id}
                                        type="button"
                                        className={`trade-target ${tradeTarget === p.id ? "active" : ""}`}
                                        onClick={() => setTradeTarget(p.id)}
                                      >
                                        {p.name}
                                      </button>
                                    ))}
                                </div>
                              </div>
                              <div className="trade-footer">
                                <button
                                  type="button"
                                  className="trade-clear"
                                  onClick={() => {
                                    setTradeGive({});
                                    setTradeGet({});
                                  }}
                                >
                                  Clear
                                </button>
                                <button
                                  type="button"
                                  className="trade-send"
                                  onClick={() => {
                                    sendTradeOffer();
                                    setTradeOpen(false);
                                  }}
                                  disabled={
                                    !isMyTurn ||
                                    state?.phase !== "turn" ||
                                    state?.awaitingRobber ||
                                    state?.awaitingDiscard ||
                                    state?.awaitingGold
                                  }
                                >
                                  Send Trade
                                </button>
                              </div>
                            </div>
                            {state?.pendingTrades && state.pendingTrades.some((o) => o.from !== playerId) && (
                              <div className="incoming-trades">
                                <div className="trade-label">Incoming offers</div>
                                {state.pendingTrades
                                  .filter((o) => o.from !== playerId && (!o.to || o.to === playerId))
                                  .map((offer) => {
                                    const fromName = playerLookup[offer.from]?.name || "Player";
                                    const describe = (r: Partial<Record<ResourceType, number>>) =>
                                      (Object.keys(r) as ResourceType[])
                                        .filter((k) => (r[k] || 0) > 0)
                                        .map((k) => `${r[k]} ${RESOURCE_LABEL[k]}`)
                                        .join(", ") || "nothing";
                                    return (
                                      <div key={offer.id} className="incoming-card">
                                        <div>
                                          {fromName} offers {describe(offer.give)} for {describe(offer.get)}.
                                        </div>
                                        <div className="trade-actions">
                                          <button onClick={() => respondTrade(offer.id, true)}>Accept</button>
                                          <button onClick={() => respondTrade(offer.id, false)}>Reject</button>
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>
                            )}
                            {state?.pendingTrades &&
                              state.pendingTrades.filter((o) => o.from === playerId && (o.acceptedBy || []).length > 0).length > 0 && (
                                <div className="incoming-trades">
                                  <div className="trade-label">Acceptors</div>
                                  {state.pendingTrades
                                    .filter((o) => o.from === playerId)
                                    .map((offer) => {
                                      const describe = (r: Partial<Record<ResourceType, number>>) =>
                                        (Object.keys(r) as ResourceType[])
                                          .filter((k) => (r[k] || 0) > 0)
                                          .map((k) => `${r[k]} ${RESOURCE_LABEL[k]}`)
                                          .join(", ") || "nothing";
                                      return (
                                        <div key={offer.id} className="incoming-card">
                                          <div style={{ marginBottom: 6 }}>
                                            Offer #{offer.id}: {describe(offer.give)} for {describe(offer.get)}
                                          </div>
                                          {(offer.acceptedBy || []).map((aid) => {
                                            const name = playerLookup[aid]?.name || "Player";
                                            return (
                                              <div key={aid} className="trade-actions" style={{ marginTop: 4 }}>
                                                <span style={{ flex: 1 }}>{name} accepted.</span>
                                                <button onClick={() => send({ type: "finalizeTrade", offerId: offer.id, targetId: aid })}>
                                                  Trade with {name}
                                                </button>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      );
                                    })}
                                </div>
                              )}
                          </>
                        ) : (
                          <div className="trade-panel">
                            <div className="trade-columns">
                              <div className="trade-col">
                                <div className="trade-col-title">You Give</div>
                                <div className="trade-row trade-row-bank">
                                  <div className="trade-res">
                                    {RESOURCE_IMG[bankGive] ? (
                                      <img src={RESOURCE_IMG[bankGive]} alt={RESOURCE_LABEL[bankGive]} className="trade-res-icon" />
                                    ) : (
                                      <div className="trade-res-icon fallback">{RESOURCE_SHORT_LABEL[bankGive]}</div>
                                    )}
                                    <span className="trade-res-name">{RESOURCE_LABEL[bankGive]}</span>
                                  </div>
                                  <select value={bankGive} onChange={(e) => setBankGive(e.target.value as ResourceType)} className="trade-select">
                                    {TRADE_RESOURCES.map((r) => (
                                      <option key={r} value={r}>
                                        {RESOURCE_LABEL[r]}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <div className="trade-col">
                                <div className="trade-col-title">You Get</div>
                                <div className="trade-row trade-row-bank">
                                  <div className="trade-res">
                                    {RESOURCE_IMG[bankGet] ? (
                                      <img src={RESOURCE_IMG[bankGet]} alt={RESOURCE_LABEL[bankGet]} className="trade-res-icon" />
                                    ) : (
                                      <div className="trade-res-icon fallback">{RESOURCE_SHORT_LABEL[bankGet]}</div>
                                    )}
                                    <span className="trade-res-name">{RESOURCE_LABEL[bankGet]}</span>
                                  </div>
                                  <select value={bankGet} onChange={(e) => setBankGet(e.target.value as ResourceType)} className="trade-select">
                                    {TRADE_RESOURCES.map((r) => (
                                      <option key={r} value={r}>
                                        {RESOURCE_LABEL[r]}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>
                            <div className="trade-bank-footer">
                              <span className="trade-rate">Rate: {bankRatio}:1</span>
                              <button
                                type="button"
                                className="trade-send"
                                onClick={() => send({ type: "bankTrade", give: bankGive, get: bankGet })}
                                disabled={
                                  !isMyTurn ||
                                  state?.phase !== "turn" ||
                                  state?.awaitingRobber ||
                                  state?.awaitingDiscard ||
                                  state?.awaitingGold ||
                                  (!state?.hasRolled && !canTradeBeforeRoll) ||
                                  bankGive === bankGet
                                }
                              >
                                Trade with Bank
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
  );
}
