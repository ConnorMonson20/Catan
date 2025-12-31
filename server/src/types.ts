export type ResourceType = 'brick' | 'lumber' | 'wool' | 'grain' | 'ore' | 'gold';
export type HexResource = ResourceType | 'desert' | 'water' | 'cloud' | 'dev';
export type SpellType =
  | 'tectonic_shift'
  | 'fertile_ground'
  | 'seismic_rotation'
  | 'safe_haven'
  | 'selective_harvest'
  | 'second_chance'
  | 'fortunes_favor'
  | 'switcheroo'
  | 'smuggler'
  | 'skilled_labor'
  | 'coordinated_trade'
  | 'double_cross'
  | 'shadow_move'
  | 'market_disruption'
  | 'copycat';
export type TeamId = 1 | 2;
export type TeamMapMode = 'preloaded' | 'draft';
export type DraftPhase = 'auction' | 'placement' | 'spell';

export interface DraftTile {
  id: string;
  resource: ResourceType;
  numberToken: number;
}

export interface DraftPlacement {
  hexId: string;
  teamId: TeamId;
  tile: DraftTile;
}

export type DevCardType =
  | 'knight'
  | 'victory_point'
  | 'monopoly'
  | 'year_of_plenty'
  | 'road_building';

export type GamePhase = 'lobby' | 'draft' | 'setup' | 'turn' | 'finished';

export interface HexTile {
  id: string;
  q: number;
  r: number;
  x: number;
  y: number;
  resource: HexResource;
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
  ports?: Port[];
}

export interface Port {
  id: string;
  vertexId: string; // mapped to a vertex in the constructed board
  waterHexId?: string; // optional water hex id for icon placement
  ratio: 2 | 3; // 2:1 or 3:1 ports
  resource?: ResourceType | 'any';
  bridges?: string[]; // optional vertexIds for decorative bridges
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
  ready: boolean;
  hoverColor: string | null;
  teamId: TeamId | null;
  resources: ResourceCounts;
  pendingGold: number;
  devCards: DevCardType[];
  spells: Record<SpellType, number>;
  newlyBoughtDev: Record<DevCardType, number>;
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
  ready: boolean;
  hoverColor: string | null;
  teamId: TeamId | null;
  resources: ResourceCounts;
  pendingGold: number;
  devCards: DevCardType[];
  resourceCount?: number;
  devCardCount?: number;
  spells: Record<SpellType, number>;
  newlyBoughtDev: Record<DevCardType, number>;
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

export interface TradeOffer {
  id: number;
  from: string;
  to?: string; // if undefined, broadcast to all
  give: Partial<ResourceCounts>;
  get: Partial<ResourceCounts>;
  acceptedBy?: string[];
}

export interface GameState {
  phase: GamePhase;
  board: BoardData;
  players: PlayerState[];
  hostId: string | null;
  vertexOwner: Record<string, string | null>;
  edgeOwner: Record<string, string | null>;
  log: string[];
  robberHex: string;
  cloudContents: Record<string, ResourceType>;
  revealedClouds: Record<string, ResourceType>;
  victoryPointsToWin: number;
  discardLimit: number;
  awaitingGold: boolean;
  teamMode: boolean;
  teamMapMode: TeamMapMode;
  draftPhase: DraftPhase;
  draftTiles: Record<TeamId, DraftTile[]>;
  draftPlacements: Record<string, DraftPlacement>;
  draftIslandHexes: Record<TeamId, string[]>;
  draftMapReady: boolean;
  draftAuctionTiles: DraftTile[];
  draftAuctionIndex: number;
  draftCurrentBid: number;
  draftHighestBidder: TeamId | null;
  draftTurnTeam: TeamId;
  draftStartingTeam: TeamId;
  draftTeamFunds: Record<TeamId, number>;
  draftTeamBidder: Record<TeamId, string | null>;
  spellDraftPool: SpellType[];
  spellDraftPicks: Record<TeamId, SpellType[]>;
  spellDraftOrder: TeamId[];
  spellDraftIndex: number;
  teamSpells: Record<TeamId, Record<SpellType, number>>;
  teamSpellUsed: Record<TeamId, boolean>;
  roundRolls: number;
  // Tracks the vertex where the current player placed their settlement in setup (must place road from here)
  lastSetupSettlement: Record<string, string | null>;
  awaitingDiscard: boolean;
  discardPending: Record<string, number>;
  setupRound: 1 | 2 | null;
  setupIndex: number;
  setupStep: 'settlement' | 'road' | null;
  currentPlayerIndex: number;
  hasRolled: boolean;
  awaitingRobber: boolean;
  lastRoll: [number, number] | null;
  devDeck: DevCardType[];
  lastDevCardPlayed: DevCardType | null;
  lastProduction: ProductionRecord | null;
  customMap: boolean;
  pendingTrades: TradeOffer[];
  tradeSeq: number;
  spellSafeHavens: Array<{ hexId: string; remaining: number }>;
  spellSelectiveHarvest: { playerId: string; number: number } | null;
  spellSmuggler: Record<string, boolean>;
  spellSkilledLabor: Record<string, ResourceType | null>;
  spellSecondChance: Record<string, boolean>;
  spellShadowMove: Record<string, boolean>;
  spellFortunesFavor: Record<string, boolean>;
  spellCoordinatedTrade: { teamId: TeamId; remaining: number } | null;
  spellDoubleCross: Record<TeamId, boolean>;
  spellPendingDoubleCross: { teamId: TeamId; playerId: string } | null;
  winnerId?: string;
  winnerTeam?: TeamId;
}

export interface ProductionRecord {
  playerId: string;
  rollTotal: number;
  resourceGains: Array<{ playerId: string; resource: ResourceType; amount: number }>;
  devCardDraws: Array<{ playerId: string; card: DevCardType }>;
}

export type ClientMessage =
  | { type: 'join'; name: string; playerId?: string; color?: string }
  | { type: 'start' }
  | { type: 'setReady'; ready: boolean }
  | { type: 'setColor'; color: string }
  | { type: 'setColorHover'; color: string | null }
  | { type: 'build'; buildType: 'road' | 'settlement' | 'city'; vertexId?: string; edgeId?: string }
  | { type: 'rollDice' }
  | { type: 'endTurn' }
  | { type: 'moveRobber'; hexId: string; targetPlayerId?: string }
  | { type: 'chooseGold'; resource: ResourceType }
  | { type: 'buyDevCard' }
  | { type: 'playKnight'; hexId: string; targetPlayerId?: string }
  | { type: 'playMonopoly'; resource: ResourceType }
  | { type: 'playYearOfPlenty'; resourceA: ResourceType; resourceB: ResourceType }
  | { type: 'playRoadBuilding' }
  | {
      type: 'useSpell';
      spell: SpellType;
      hexId?: string;
      hexA?: string;
      hexB?: string;
      hexes?: string[];
      number?: number;
      delta?: number;
      resource?: ResourceType;
      resourceTo?: ResourceType;
      payResource?: ResourceType;
      skipResource?: ResourceType;
      targetPlayerId?: string;
      pay?: Partial<ResourceCounts>;
    }
  | { type: 'setCustomMap'; hexes: Array<{ id: string; resource: HexResource; numberToken?: number }> }
  | { type: 'setCustomBoard'; hexes: Array<{ id?: string; q: number; r: number; resource: HexResource; numberToken?: number }>; ports?: Array<{ id?: string; vertexKey?: string; ratio: 2 | 3; resource?: ResourceType | 'any'; bridges?: string[] }> }
  | { type: 'bankTrade'; give: ResourceType; get: ResourceType }
  | { type: 'debugSetup' }
  | { type: 'cheatGain'; resource: ResourceType; amount: number }
  | { type: 'discard'; cards: Partial<ResourceCounts> }
  | { type: 'offerTrade'; to: string; give: Partial<ResourceCounts>; get: Partial<ResourceCounts> }
  | { type: 'respondTrade'; offerId: number; accept: boolean }
  | { type: 'finalizeTrade'; offerId: number; targetId: string }
  | { type: 'setTeam'; teamId: TeamId | null }
  | { type: 'setTeamBidder'; teamId: TeamId }
  | { type: 'draftBid'; amount: number }
  | { type: 'draftPass' }
  | { type: 'autoDraft' }
  | { type: 'addDraftTile'; resource: ResourceType; numberToken: number }
  | { type: 'removeDraftTile'; tileId: string }
  | { type: 'placeDraftTile'; hexId: string; tileId: string }
  | { type: 'removeDraftPlacement'; hexId: string }
  | { type: 'draftSpellPick'; spell: SpellType }
  | { type: 'updateSettings'; victoryPointsToWin?: number; discardLimit?: number; teamMode?: boolean; teamMapMode?: TeamMapMode }
  | { type: 'reset' };

export type OutgoingMessage =
  | { type: 'state'; state: PublicGameState }
  | { type: 'error'; message: string }
  | { type: 'info'; message: string }
  | { type: 'joined'; playerId: string };

export interface PublicGameState extends Omit<GameState, 'players' | 'cloudContents' | 'lastProduction'> {
  players: SerializedPlayerState[];
  bankPool?: ResourceCounts;
}

// Keep in sync with client-side palette; each hex maps to provided PNG icons.
export const PLAYER_COLORS = ['#d13b3b', '#e6952d', '#2b7de0', '#3aa655', '#8e4ec6'] as const;
