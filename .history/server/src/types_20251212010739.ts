export type ResourceType = 'brick' | 'lumber' | 'wool' | 'grain' | 'ore' | 'gold';

export type DevCardType =
  | 'knight'
  | 'victory_point'
  | 'monopoly'
  | 'year_of_plenty'
  | 'road_building';

export type GamePhase = 'lobby' | 'setup' | 'turn' | 'finished';

export interface HexTile {
  id: string;
  q: number;
  r: number;
  x: number;
  y: number;
  resource: ResourceType | 'desert';
  numberToken?: number;
}

export interface Vertex {
  id: string;
  x: number;
  y: number;
}

export interface Edge {
  id: string;
  v1: string;
  v2: string;
}

export interface BoardData {
  hexes: HexTile[];
  vertices: Vertex[];
  edges: Edge[];
  vertexHexes: Record<string, string[]>; // vertexId -> hexIds
  vertexEdges?: Record<string, string[]>; // vertexId -> edgeIds
  vertexNeighbors: Record<string, string[]>; // vertexId -> vertexIds
}

export interface Port {
  id: string;
  vertexId: string; // mapped to a vertex in the constructed board
  ratio: 2 | 3; // 2:1 or 3:1 ports
  resource?: ResourceType | 'any';
}

export interface ResourceCounts {
  brick: number;
  lumber: number;
  wool: number;
  grain: number;
  ore: number;
  gold: number;
}

export interface PlayerState {
  id: string;
  name: string;
  color: string;
  resources: ResourceCounts;
  devCards: DevCardType[];
  newlyBoughtDev: DevCardType[];
  devPlayedThisTurn: boolean;
  bonusRoads: number;
  roads: Set<string>;
  settlements: Set<string>;
  cities: Set<string>;
  playedKnights: number;
  hasLargestArmy: boolean;
  longestRoadLength: number;
  hasLongestRoad: boolean;
  victoryPoints: number;
}

export interface SerializedPlayerState {
  id: string;
  name: string;
  color: string;
  resources: ResourceCounts;
  devCards: DevCardType[];
  devPlayedThisTurn: boolean;
  bonusRoads: number;
  roads: string[];
  settlements: string[];
  cities: string[];
  playedKnights: number;
  hasLargestArmy: boolean;
  longestRoadLength: number;
  hasLongestRoad: boolean;
  victoryPoints: number;
}

export interface GameState {
  phase: GamePhase;
  board: BoardData;
  players: PlayerState[];
  vertexOwner: Record<string, string | null>;
  edgeOwner: Record<string, string | null>;
  log: string[];
  robberHex: string;
  setupRound: 1 | 2 | null;
  setupIndex: number;
  setupStep: 'settlement' | 'road' | null;
  currentPlayerIndex: number;
  hasRolled: boolean;
  awaitingRobber: boolean;
  lastRoll: [number, number] | null;
  devDeck: DevCardType[];
  customMap: boolean;
  winnerId?: string;
}

export type ClientMessage =
  | { type: 'join'; name: string; playerId?: string }
  | { type: 'start' }
  | { type: 'build'; buildType: 'road' | 'settlement' | 'city'; vertexId?: string; edgeId?: string }
  | { type: 'rollDice' }
  | { type: 'endTurn' }
  | { type: 'moveRobber'; hexId: string; targetPlayerId?: string }
  | { type: 'buyDevCard' }
  | { type: 'playKnight'; hexId: string; targetPlayerId?: string }
  | { type: 'playMonopoly'; resource: ResourceType }
  | { type: 'playYearOfPlenty'; resourceA: ResourceType; resourceB: ResourceType }
  | { type: 'playRoadBuilding' }
  | { type: 'setCustomMap'; hexes: Array<{ id: string; resource: ResourceType | 'desert'; numberToken?: number }> }
  | { type: 'setCustomBoard'; hexes: Array<{ id?: string; q: number; r: number; resource: ResourceType | 'desert'; numberToken?: number }> }
  | { type: 'bankTrade'; give: ResourceType; get: ResourceType }
  | { type: 'debugSetup' }
  | { type: 'cheatGain'; resource: ResourceType; amount: number }
  | { type: 'reset' };

export type OutgoingMessage =
  | { type: 'state'; state: PublicGameState }
  | { type: 'error'; message: string }
  | { type: 'info'; message: string }
  | { type: 'joined'; playerId: string };

export interface PublicGameState extends Omit<GameState, 'players'> {
  players: SerializedPlayerState[];
}

export const PLAYER_COLORS = ['#d13b3b', '#e6952d', '#2b7de0', '#e0d54a'];
