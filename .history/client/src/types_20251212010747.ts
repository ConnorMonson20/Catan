export type ResourceType = 'brick' | 'lumber' | 'wool' | 'grain' | 'ore' | 'gold';

export type DevCardType =
  | 'knight'
  | 'victory_point'
  | 'monopoly'
  | 'year_of_plenty'
  | 'road_building';

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
  vertexHexes: Record<string, string[]>;
  vertexEdges?: Record<string, string[]>;
  vertexNeighbors: Record<string, string[]>;
}

export interface Port {
  id: string;
  vertexId: string;
  ratio: 2 | 3;
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

export interface PublicGameState {
  phase: 'lobby' | 'setup' | 'turn' | 'finished';
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
  winnerId?: string;
}

export type ServerMessage =
  | { type: 'state'; state: PublicGameState }
  | { type: 'error'; message: string }
  | { type: 'info'; message: string }
  | { type: 'joined'; playerId: string };

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
