export type ResourceType = 'brick' | 'lumber' | 'wool' | 'grain' | 'ore' | 'gold';
export type HexResource = ResourceType | 'desert' | 'water' | 'water_port' | 'cloud' | 'dev';
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
  vertexHexes: Record<string, string[]>;
  vertexEdges?: Record<string, string[]>;
  vertexNeighbors: Record<string, string[]>;
  ports?: Port[];
}

export interface Port {
  id: string;
  vertexId: string;
  waterHexId?: string;
  ratio: 2 | 3;
  resource?: ResourceType | 'any';
  bridges?: string[];
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
  hoverColor?: string | null;
  teamId: TeamId | null;
  resources: ResourceCounts;
  pendingGold: number;
  devCards: DevCardType[];
  resourceCount?: number;
  devCardCount?: number;
  spells: Record<SpellType, number>;
  newlyBoughtDev?: Partial<Record<DevCardType, number>>;
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
  to?: string;
  give: Partial<ResourceCounts>;
  get: Partial<ResourceCounts>;
  acceptedBy?: string[];
}

export interface PublicGameState {
  phase: 'lobby' | 'draft' | 'setup' | 'turn' | 'finished';
  board: BoardData;
  players: PlayerState[];
  hostId: string | null;
  vertexOwner: Record<string, string | null>;
  edgeOwner: Record<string, string | null>;
  log: string[];
  robberHex: string;
  revealedClouds?: Record<string, ResourceType>;
  victoryPointsToWin?: number;
  discardLimit?: number;
  customMap: boolean;
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
  spellSmuggler?: Record<string, boolean>;
  spellCoordinatedTrade?: { teamId: TeamId; remaining: number } | null;
  awaitingGold: boolean;
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
  lastDevCardPlayed?: DevCardType | null;
  pendingTrades: TradeOffer[];
  tradeSeq: number;
  bankPool?: ResourceCounts;
  winnerId?: string;
  winnerTeam?: TeamId;
}

export type ServerMessage =
  | { type: 'state'; state: PublicGameState }
  | { type: 'error'; message: string }
  | { type: 'info'; message: string }
  | { type: 'joined'; playerId: string };

export type ClientMessage =
  | { type: 'join'; name: string; playerId?: string; color?: string }
  | { type: 'start' }
  | { type: 'setReady'; ready: boolean }
  | { type: 'setColor'; color: string }
  | { type: 'setColorHover'; color: string | null }
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
  | { type: 'updateSettings'; victoryPointsToWin?: number; discardLimit?: number; teamMode?: boolean; teamMapMode?: TeamMapMode }
  | { type: 'reset' }
  | { type: 'resetServer' };
