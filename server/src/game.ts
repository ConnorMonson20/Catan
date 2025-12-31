import { randomUUID } from 'crypto';
import { buildBoard, buildBoardFromHexes, buildRandomBoard } from './board';
import {
  BoardData,
  DevCardType,
  GamePhase,
  GameState,
  OutgoingMessage,
  PlayerState,
  PublicGameState,
  ProductionRecord,
  ResourceCounts,
  ResourceType,
  HexResource,
  HexTile,
  Port,
  PLAYER_COLORS,
  TeamId,
  TeamMapMode,
  DraftTile,
  DraftPlacement,
  SpellType,
} from './types';
import draftMapTemplate from './maps/2_2_alpha.json';

function emptyResources(): ResourceCounts {
  return { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0, gold: 0 };
}

const SPELL_LIST: SpellType[] = [
  'tectonic_shift',
  'fertile_ground',
  'seismic_rotation',
  'safe_haven',
  'selective_harvest',
  'second_chance',
  'fortunes_favor',
  'switcheroo',
  'smuggler',
  'skilled_labor',
  'coordinated_trade',
  'double_cross',
  'shadow_move',
  'market_disruption',
  'copycat',
];
const SPELL_DRAFT_COUNT = 8;
const SPELL_PICKS_PER_TEAM = 3;

function emptySpells(): Record<SpellType, number> {
  return SPELL_LIST.reduce((acc, spell) => {
    acc[spell] = 0;
    return acc;
  }, {} as Record<SpellType, number>);
}

const STARTING_SPELLS: Record<SpellType, number> = emptySpells();

function emptyTeamSpells(): Record<TeamId, Record<SpellType, number>> {
  return { 1: { ...STARTING_SPELLS }, 2: { ...STARTING_SPELLS } };
}

function buildSpellDraftOrder(startingTeam: TeamId): TeamId[] {
  const other = otherTeam(startingTeam);
  if (startingTeam === 1) {
    return [1, 2, 2, 1, 1, 2];
  }
  return [2, 1, 1, 2, 2, 1];
}

function createSpellDraftPool(): SpellType[] {
  return shuffle(SPELL_LIST).slice(0, SPELL_DRAFT_COUNT);
}

function syncTeamSpells(state: GameState) {
  if (!state.teamMode) return;
  state.players.forEach((p) => {
    if (p.teamId === 1 || p.teamId === 2) {
      p.spells = { ...state.teamSpells[p.teamId] };
    } else {
      p.spells = { ...STARTING_SPELLS };
    }
  });
}

const BASE_RESOURCES: ResourceType[] = ['brick', 'lumber', 'wool', 'grain', 'ore', 'gold'];
const MAP_RESOURCES: Array<HexResource> = ['desert', 'water', 'cloud', 'dev', ...BASE_RESOURCES];
const DRAFT_RESOURCES: ResourceType[] = ['brick', 'lumber', 'wool', 'grain', 'ore'];
const DRAFT_TEAM_FUNDS = 100000;
const DRAFT_RESOURCE_POOL: ResourceType[] = [
  'brick',
  'brick',
  'ore',
  'ore',
  'lumber',
  'lumber',
  'lumber',
  'wool',
  'wool',
  'wool',
  'grain',
  'grain',
];
const DRAFT_NUMBER_POOL = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const GOLD_CHOICE_RESOURCES: ResourceType[] = ['brick', 'lumber', 'wool', 'grain', 'ore'];
const BANK_RESOURCE_TOTALS: ResourceCounts = {
  brick: 25,
  lumber: 25,
  wool: 25,
  grain: 25,
  ore: 25,
  gold: 0,
};
const NUMBER_TOKEN_POOL = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const CLOUD_RESOURCES: ResourceType[] = ['ore', 'brick', 'wool', 'grain'];
const isBaseResource = (res: HexResource): res is ResourceType => BASE_RESOURCES.includes(res as ResourceType);
const MAX_DRAFT_TILES_PER_TEAM = 6;
const VALID_DRAFT_NUMBERS = new Set([2, 3, 4, 5, 6, 8, 9, 10, 11, 12]);

function assignCloudContents(state: GameState) {
  state.cloudContents = {};
  state.revealedClouds = {};
  const clouds = state.board.hexes.filter((h) => h.resource === 'cloud');
  for (const hex of clouds) {
    const res = CLOUD_RESOURCES[Math.floor(Math.random() * CLOUD_RESOURCES.length)];
    state.cloudContents[hex.id] = res;
  }
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function assignGoldNumberTokens(hexes: HexTile[]) {
  const targets = hexes.filter((h) => h.resource === 'gold' && typeof h.numberToken !== 'number');
  if (!targets.length) return;
  const used = hexes
    .filter((h) => typeof h.numberToken === 'number')
    .map((h) => h.numberToken as number);
  let pool = [...NUMBER_TOKEN_POOL];
  for (const token of used) {
    const idx = pool.indexOf(token);
    if (idx !== -1) pool.splice(idx, 1);
  }
  let available = shuffle(pool.length ? pool : NUMBER_TOKEN_POOL);
  for (const hex of targets) {
    if (!available.length) {
      available = shuffle([...NUMBER_TOKEN_POOL]);
    }
    hex.numberToken = available.pop()!;
  }
}

const otherTeam = (team: TeamId): TeamId => (team === 1 ? 2 : 1);

function createDraftAuctionTiles(): DraftTile[] {
  const resources = shuffle(DRAFT_RESOURCE_POOL);
  const numbers = shuffle(DRAFT_NUMBER_POOL).slice(0, resources.length);
  return resources.map((resource, idx) => ({
    id: randomUUID(),
    resource,
    numberToken: numbers[idx],
  }));
}

function initializeDraftAuction(state: GameState) {
  state.draftPhase = 'auction';
  state.draftAuctionTiles = createDraftAuctionTiles();
  state.draftAuctionIndex = 0;
  state.draftCurrentBid = 0;
  state.draftHighestBidder = null;
  state.draftStartingTeam = 1;
  state.draftTurnTeam = state.draftStartingTeam;
  state.draftTeamFunds = { 1: DRAFT_TEAM_FUNDS, 2: DRAFT_TEAM_FUNDS };
  state.draftTeamBidder = { 1: null, 2: null };
  state.draftTiles = { 1: [], 2: [] };
  state.draftPlacements = {};
  state.draftMapReady = false;
}

function buildDevDeck(): DevCardType[] {
  const deck: DevCardType[] = [
    ...Array(14).fill('knight' as DevCardType),
    ...Array(5).fill('victory_point' as DevCardType),
    ...Array(2).fill('monopoly' as DevCardType),
    ...Array(2).fill('year_of_plenty' as DevCardType),
    ...Array(2).fill('road_building' as DevCardType),
  ];
  return shuffle(deck);
}

function computeDraftIslandHexes(board: BoardData, slotIds?: Set<string>): Record<TeamId, string[]> {
  const islands: Record<TeamId, string[]> = { 1: [], 2: [] };
  for (const hex of board.hexes) {
    if (slotIds) {
      if (!slotIds.has(hex.id)) continue;
    } else if (hex.resource !== 'desert') {
      continue;
    }
    if (hex.q < 0) islands[1].push(hex.id);
    if (hex.q > 0) islands[2].push(hex.id);
  }
  return islands;
}

function resetBoardPlacements(state: GameState, board: BoardData) {
  state.board = board;
  state.vertexOwner = {};
  state.edgeOwner = {};
  board.vertices.forEach((v) => (state.vertexOwner[v.id] = null));
  board.edges.forEach((e) => (state.edgeOwner[e.id] = null));
  state.robberHex = board.hexes.find((h) => h.resource === 'desert')?.id ?? board.hexes[0]?.id ?? '';
  state.cloudContents = {};
  state.revealedClouds = {};
  state.players.forEach((p) => {
    p.roads.clear();
    p.settlements.clear();
    p.cities.clear();
    p.victoryPoints = 0;
    p.playedKnights = 0;
    p.hasLargestArmy = false;
    p.hasLongestRoad = false;
    p.longestRoadLength = 0;
  });
  recalcVictoryPoints(state);
}

export function initializeDraftMap(state: GameState) {
  const draftSlotIds = new Set<string>();
  const hexes = draftMapTemplate.hexes.map((h, idx) => ({
    id: h.id || `hex-${idx}`,
    q: h.q,
    r: h.r,
    resource: h.resource as HexResource,
    numberToken: h.numberToken,
  }));
  draftMapTemplate.hexes.forEach((h, idx) => {
    if (!h) return;
    if ((h as { draftSlot?: boolean }).draftSlot) {
      draftSlotIds.add(h.id || `hex-${idx}`);
    }
  });
  if (!draftSlotIds.size) {
    const fallbackResource = draftMapTemplate.hexes.some((h) => h?.resource === 'desert') ? 'desert' : 'cloud';
    draftMapTemplate.hexes.forEach((h, idx) => {
      if (h?.resource === fallbackResource) {
        draftSlotIds.add(h.id || `hex-${idx}`);
      }
    });
  }
  const board = buildBoardFromHexes(hexes);
  board.ports = Array.isArray(draftMapTemplate.ports) ? draftMapTemplate.ports : [];
  assignGoldNumberTokens(board.hexes);
  resetBoardPlacements(state, board);
  state.customMap = true;
  state.draftIslandHexes = computeDraftIslandHexes(board, draftSlotIds.size ? draftSlotIds : undefined);
  if (state.teamMode && state.teamMapMode === 'draft') {
    initializeDraftAuction(state);
  }
  addLog(state, '2v2 draft map initialized.');
}

function updateDraftMapReady(state: GameState) {
  if (!state.teamMode || state.teamMapMode !== 'draft') {
    state.draftMapReady = true;
    return;
  }
  const hexes = [...state.draftIslandHexes[1], ...state.draftIslandHexes[2]];
  state.draftMapReady = hexes.length > 0 && hexes.every((hid) => state.draftPlacements[hid]);
}

function autoPlaceDraftTiles(state: GameState) {
  if (!state.teamMode || state.teamMapMode !== 'draft') return;
  const boardHexes = new Map(state.board.hexes.map((h) => [h.id, h]));
  state.draftPlacements = {};
  ([1, 2] as TeamId[]).forEach((teamId) => {
    const hexIds = shuffle([...(state.draftIslandHexes[teamId] || [])]);
    const tiles = state.draftTiles[teamId];
    let placed = 0;
    for (const hexId of hexIds) {
      if (!tiles.length) break;
      const hex = boardHexes.get(hexId);
      if (!hex) continue;
      const tile = tiles.shift();
      if (!tile) continue;
      state.draftPlacements[hexId] = { hexId, teamId, tile };
      hex.resource = tile.resource;
      hex.numberToken = tile.numberToken;
      placed += 1;
    }
    if (tiles.length > 0) {
      addLog(state, `Team ${teamId} had ${tiles.length} unplaced draft tile(s).`);
    }
  });
  updateDraftMapReady(state);
  addLog(state, 'Draft tiles auto-placed.');
  if (state.draftMapReady && allPlayersReady(state)) {
    const teamError = validateTeams(state);
    if (!teamError) beginSpellDraft(state);
  }
}

function isSoloTeamTest(state: GameState) {
  return state.teamMode && state.players.length === 1;
}

function beginDraft(state: GameState) {
  initializeDraftMap(state);
  state.awaitingDiscard = false;
  state.discardPending = {};
  state.awaitingGold = false;
  state.pendingTrades = [];
  state.tradeSeq = 0;
  state.phase = 'draft';
  state.draftPhase = 'auction';
  state.spellDraftPool = [];
  state.spellDraftPicks = { 1: [], 2: [] };
  state.spellDraftOrder = [];
  state.spellDraftIndex = 0;
  addLog(state, 'Draft auction started.');
}

function beginSpellDraft(state: GameState) {
  state.awaitingDiscard = false;
  state.discardPending = {};
  state.awaitingGold = false;
  state.pendingTrades = [];
  state.tradeSeq = 0;
  state.phase = 'draft';
  state.draftPhase = 'spell';
  state.spellDraftPool = createSpellDraftPool();
  state.spellDraftPicks = { 1: [], 2: [] };
  state.spellDraftOrder = buildSpellDraftOrder(state.draftStartingTeam || 1);
  state.spellDraftIndex = 0;
  state.teamSpells = emptyTeamSpells();
  state.teamSpellUsed = { 1: false, 2: false };
  state.roundRolls = 0;
  state.draftMapReady = true;
  syncTeamSpells(state);
  addLog(state, 'Spell draft started.');
}

function resetDraftState(state: GameState) {
  state.draftPhase = 'auction';
  state.draftTiles = { 1: [], 2: [] };
  state.draftPlacements = {};
  state.draftIslandHexes = { 1: [], 2: [] };
  state.draftMapReady = false;
  state.draftAuctionTiles = [];
  state.draftAuctionIndex = 0;
  state.draftCurrentBid = 0;
  state.draftHighestBidder = null;
  state.draftTurnTeam = 1;
  state.draftStartingTeam = 1;
  state.draftTeamFunds = { 1: DRAFT_TEAM_FUNDS, 2: DRAFT_TEAM_FUNDS };
  state.draftTeamBidder = { 1: null, 2: null };
  state.spellDraftPool = [];
  state.spellDraftPicks = { 1: [], 2: [] };
  state.spellDraftOrder = [];
  state.spellDraftIndex = 0;
}

function restoreDefaultBoard(state: GameState) {
  const board = buildRandomBoard();
  resetBoardPlacements(state, board);
  state.customMap = false;
  state.draftIslandHexes = { 1: [], 2: [] };
  state.draftPlacements = {};
  state.draftMapReady = false;
  state.draftAuctionTiles = [];
  state.draftAuctionIndex = 0;
  state.draftCurrentBid = 0;
  state.draftHighestBidder = null;
  state.draftTeamFunds = { 1: DRAFT_TEAM_FUNDS, 2: DRAFT_TEAM_FUNDS };
  state.draftTurnTeam = 1;
  state.draftStartingTeam = 1;
  state.draftTiles = { 1: [], 2: [] };
  state.draftPhase = 'auction';
  state.draftTeamBidder = { 1: null, 2: null };
}

export function createInitialState(options?: { randomizeBoard?: boolean }): GameState {
  const board = options?.randomizeBoard ? buildRandomBoard() : buildBoard();
  const vertexOwner: Record<string, string | null> = {};
  const edgeOwner: Record<string, string | null> = {};
  board.vertices.forEach((v) => (vertexOwner[v.id] = null));
  board.edges.forEach((e) => (edgeOwner[e.id] = null));

  const desert = board.hexes.find((h) => h.resource === 'desert');

  return {
    phase: 'lobby',
    board,
    players: [],
    hostId: null,
    vertexOwner,
    edgeOwner,
    log: [],
    robberHex: desert?.id ?? board.hexes[0].id,
    cloudContents: {},
    revealedClouds: {},
    victoryPointsToWin: 10,
    discardLimit: 7,
    awaitingGold: false,
    lastSetupSettlement: {},
    awaitingDiscard: false,
    discardPending: {},
    setupRound: null,
    setupIndex: 0,
    setupStep: null,
    currentPlayerIndex: 0,
    hasRolled: false,
    awaitingRobber: false,
    lastRoll: null,
    devDeck: buildDevDeck(),
    lastDevCardPlayed: null,
    lastProduction: null,
    customMap: false,
    teamMode: false,
    teamMapMode: 'preloaded',
    draftPhase: 'auction',
    draftTiles: { 1: [], 2: [] },
    draftPlacements: {},
    draftIslandHexes: { 1: [], 2: [] },
    draftMapReady: false,
    draftAuctionTiles: [],
    draftAuctionIndex: 0,
    draftCurrentBid: 0,
    draftHighestBidder: null,
    draftTurnTeam: 1,
    draftStartingTeam: 1,
    draftTeamFunds: { 1: DRAFT_TEAM_FUNDS, 2: DRAFT_TEAM_FUNDS },
    draftTeamBidder: { 1: null, 2: null },
    spellDraftPool: [],
    spellDraftPicks: { 1: [], 2: [] },
    spellDraftOrder: [],
    spellDraftIndex: 0,
    teamSpells: emptyTeamSpells(),
    teamSpellUsed: { 1: false, 2: false },
    roundRolls: 0,
    pendingTrades: [],
    tradeSeq: 0,
    spellSafeHavens: [],
    spellSelectiveHarvest: null,
    spellSmuggler: {},
    spellSkilledLabor: {},
    spellSecondChance: {},
    spellShadowMove: {},
    spellFortunesFavor: {},
    spellCoordinatedTrade: null,
    spellDoubleCross: { 1: false, 2: false },
    spellPendingDoubleCross: null,
  };
}

function addLog(state: GameState, entry: string) {
  state.log.unshift(entry);
  if (state.log.length > 100) state.log.pop();
}

export function addPlayer(state: GameState, name: string, requestedColor?: string): { player?: PlayerState; error?: string } {
  if (state.players.length >= 4) return { error: 'Game is full (4 players max).' };
  if (state.phase !== 'lobby') return { error: 'Game already started.' };
  const allowedColors = new Set<string>(PLAYER_COLORS);
  const takenColors = new Set(state.players.map((p) => p.color));
  const availableColors = PLAYER_COLORS.filter((c) => !takenColors.has(c));
  if (!availableColors.length) return { error: 'No colors available.' };
  if (requestedColor && !allowedColors.has(requestedColor)) {
    return { error: 'Invalid color choice.' };
  }
  let colorToUse = requestedColor || availableColors[0];
  if (takenColors.has(colorToUse)) {
    return { error: 'Color already taken.' };
  }
  const id = randomUUID();
  const player: PlayerState = {
    id,
    name,
    color: colorToUse,
    ready: false,
    hoverColor: null,
    teamId: null,
    resources: emptyResources(),
    pendingGold: 0,
    devCards: [],
    spells: { ...STARTING_SPELLS },
    newlyBoughtDev: {
      knight: 0,
      victory_point: 0,
      monopoly: 0,
      year_of_plenty: 0,
      road_building: 0,
    },
    devPlayedThisTurn: false,
    bonusRoads: 0,
    roads: new Set(),
    settlements: new Set(),
    cities: new Set(),
    playedKnights: 0,
    hasLargestArmy: false,
    longestRoadLength: 0,
    hasLongestRoad: false,
    victoryPoints: 0,
  };
  state.players.push(player);
  if (!state.hostId) {
    state.hostId = player.id;
  }
  addLog(state, `${name} joined the lobby.`);
  return { player };
}

function computeBankPool(state: GameState): ResourceCounts {
  const remaining: ResourceCounts = { ...BANK_RESOURCE_TOTALS };
  for (const p of state.players) {
    (Object.keys(remaining) as ResourceType[]).forEach((res) => {
      remaining[res] -= p.resources[res] || 0;
    });
  }
  (Object.keys(remaining) as ResourceType[]).forEach((res) => {
    remaining[res] = Math.max(0, remaining[res]);
  });
  return remaining;
}

export function serializeState(state: GameState, viewingPlayerId?: string): PublicGameState {
  const { cloudContents, lastProduction, ...rest } = state;
  return {
    ...rest,
    bankPool: computeBankPool(state),
    players: state.players.map((p) => {
      const isViewer = viewingPlayerId && viewingPlayerId === p.id;
      const maskedResources = emptyResources();
      const maskedDev: DevCardType[] = [];
      const maskedSpells = emptySpells();
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        ready: p.ready,
        hoverColor: p.hoverColor ?? null,
        teamId: p.teamId ?? null,
        resources: isViewer ? { ...p.resources } : maskedResources,
        pendingGold: p.pendingGold,
        devCards: isViewer ? [...p.devCards] : maskedDev,
        resourceCount: Object.values(p.resources).reduce((a, b) => a + b, 0),
        devCardCount: p.devCards.length,
        spells: isViewer ? { ...p.spells } : maskedSpells,
        newlyBoughtDev: isViewer ? { ...p.newlyBoughtDev } : { knight: 0, victory_point: 0, monopoly: 0, year_of_plenty: 0, road_building: 0 },
        devPlayedThisTurn: isViewer ? p.devPlayedThisTurn : false,
        bonusRoads: p.bonusRoads,
        roads: Array.from(p.roads),
        settlements: Array.from(p.settlements),
        cities: Array.from(p.cities),
        playedKnights: p.playedKnights,
        hasLargestArmy: p.hasLargestArmy,
        longestRoadLength: p.longestRoadLength,
        hasLongestRoad: p.hasLongestRoad,
        victoryPoints: p.victoryPoints,
      };
    }),
  };
}

function allPlayersReady(state: GameState) {
  return state.players.length > 0 && state.players.every((p) => p.ready);
}

function validateTeams(state: GameState): string | null {
  if (!state.teamMode) return null;
  if (!isSoloTeamTest(state)) {
    if (state.players.length !== 2 && state.players.length !== 4) {
      return 'Team mode requires 2 or 4 players.';
    }
    const counts: Record<TeamId, number> = { 1: 0, 2: 0 };
    let unassigned = 0;
    for (const p of state.players) {
      if (p.teamId === 1 || p.teamId === 2) counts[p.teamId] += 1;
      else unassigned += 1;
    }
    if (unassigned > 0) return 'All players must choose a team.';
    if (state.players.length === 2) {
      if (counts[1] !== 1 || counts[2] !== 1) return 'Teams must be 1 vs 1.';
    } else if (counts[1] !== 2 || counts[2] !== 2) {
      return 'Teams must be 2 vs 2.';
    }
  } else {
    const solo = state.players[0];
    if (solo && solo.teamId !== 1 && solo.teamId !== 2) return 'Pick a team to start.';
  }
  if (state.teamMapMode === 'draft' && state.phase === 'draft' && !state.draftMapReady) {
    return 'Draft map must be created before starting.';
  }
  return null;
}

function beginGame(state: GameState) {
  assignCloudContents(state);
  state.awaitingDiscard = false;
  state.discardPending = {};
  state.awaitingGold = false;
  state.pendingTrades = [];
  state.tradeSeq = 0;
  state.phase = 'setup';
  state.setupRound = 1;
  state.setupIndex = 0;
  state.setupStep = 'settlement';
  state.currentPlayerIndex = 0;
  state.teamSpellUsed = { 1: false, 2: false };
  state.roundRolls = 0;
  state.players.forEach((p) => {
    p.hoverColor = null;
    p.pendingGold = 0;
  });
  addLog(state, 'Game started. Setup round 1.');
}

export function startGame(state: GameState, playerId: string): string | null {
  if (state.phase !== 'lobby') return 'Game already started.';
  if (state.players.length < 1) return 'Need at least 1 player to start.';
  if (!state.hostId || state.hostId !== playerId) return 'Only the host can start the game.';
  if (!allPlayersReady(state)) return 'All players must be ready.';
  const teamError = validateTeams(state);
  if (teamError) return teamError;
  if (state.teamMode) {
    if (state.teamMapMode === 'draft') {
      beginDraft(state);
    } else {
      beginSpellDraft(state);
    }
  } else {
    beginGame(state);
  }
  return null;
}

function getPlayer(state: GameState, playerId: string) {
  return state.players.find((p) => p.id === playerId);
}

export function handleSetReady(state: GameState, playerId: string, ready: boolean): string | null {
  if (state.phase !== 'lobby') return 'Can only ready in lobby.';
  const player = getPlayer(state, playerId);
  if (!player) return 'Player not found.';
  player.ready = !!ready;
  if (allPlayersReady(state)) {
    const teamError = validateTeams(state);
    if (teamError) return null;
    if (state.teamMode) {
      if (state.teamMapMode === 'draft') {
        beginDraft(state);
      } else {
        beginSpellDraft(state);
      }
    } else {
      beginGame(state);
    }
  }
  return null;
}

export function handleSetColor(state: GameState, playerId: string, color: string): string | null {
  if (state.phase !== 'lobby') return 'Can only change color in lobby.';
  const player = getPlayer(state, playerId);
  if (!player) return 'Player not found.';
  if (!PLAYER_COLORS.includes(color as (typeof PLAYER_COLORS)[number])) {
    return 'Invalid color choice.';
  }
  const taken = state.players.some((p) => p.id !== playerId && p.color === color);
  if (taken) return 'Color already taken.';
  player.color = color;
  return null;
}

export function handleSetColorHover(state: GameState, playerId: string, color: string | null): string | null {
  if (state.phase !== 'lobby') return 'Can only hover colors in lobby.';
  const player = getPlayer(state, playerId);
  if (!player) return 'Player not found.';
  if (color !== null && !PLAYER_COLORS.includes(color as (typeof PLAYER_COLORS)[number])) {
    return 'Invalid color choice.';
  }
  player.hoverColor = color;
  return null;
}

export function handleSetTeam(state: GameState, playerId: string, teamId: TeamId | null): string | null {
  if (state.phase !== 'lobby') return 'Can only set teams in lobby.';
  if (!state.teamMode) return 'Team mode is not enabled.';
  const player = getPlayer(state, playerId);
  if (!player) return 'Player not found.';
  const previousTeam = player.teamId;
  if (teamId !== null && teamId !== 1 && teamId !== 2) return 'Invalid team.';
  if (teamId === null) {
    if (previousTeam && state.draftTeamBidder[previousTeam] === playerId && !isSoloTeamTest(state)) {
      state.draftTeamBidder[previousTeam] = null;
    }
    player.teamId = null;
    return null;
  }
  const teamCount = state.players.filter((p) => p.id !== playerId && p.teamId === teamId).length;
  if (teamCount >= 2) return 'That team is full.';
  if (previousTeam && previousTeam !== teamId && state.draftTeamBidder[previousTeam] === playerId && !isSoloTeamTest(state)) {
    state.draftTeamBidder[previousTeam] = null;
  }
  player.teamId = teamId;
  if (allPlayersReady(state)) {
    const teamError = validateTeams(state);
    if (!teamError) {
      if (state.teamMode) {
        if (state.teamMapMode === 'draft') {
          beginDraft(state);
        } else {
          beginSpellDraft(state);
        }
      } else {
        beginGame(state);
      }
    }
  }
  return null;
}

export function handleSetTeamBidder(state: GameState, playerId: string, teamId: TeamId): string | null {
  if (state.phase !== 'lobby' && state.phase !== 'draft') return 'Can only set bidder before the game.';
  if (!state.teamMode || state.teamMapMode !== 'draft') return 'Draft map mode is not enabled.';
  const player = getPlayer(state, playerId);
  if (!player) return 'Player not found.';
  if (!isSoloTeamTest(state) && player.teamId !== teamId) return 'You must be on that team.';
  state.draftTeamBidder[teamId] = playerId;
  addLog(state, `${player.name} is now Team ${teamId} bidder.`);
  return null;
}

export function handleDraftBid(state: GameState, playerId: string, amount: number): string | null {
  if (state.phase !== 'draft') return 'Draft auction is not active.';
  if (!state.teamMode || state.teamMapMode !== 'draft') return 'Draft map mode is not enabled.';
  if (state.draftPhase !== 'auction') return 'Draft auction is not active.';
  const player = getPlayer(state, playerId);
  if (!player) return 'Player not found.';
  const soloTest = isSoloTeamTest(state);
  const teamId = soloTest ? state.draftTurnTeam : player.teamId;
  if (!teamId) return 'Pick a team first.';
  if (!soloTest && state.draftTurnTeam !== teamId) return 'Not your team\'s turn to bid.';
  const tile = state.draftAuctionTiles[state.draftAuctionIndex];
  if (!tile) return 'No draft tile available.';
  const minBid = state.draftCurrentBid > 0 ? state.draftCurrentBid + 1 : 1;
  const bidValue = Math.floor(amount);
  if (!Number.isFinite(bidValue)) return 'Invalid bid.';
  if (bidValue < minBid) return `Bid must be at least ${minBid}.`;
  if (bidValue > (state.draftTeamFunds[teamId] || 0)) return 'Insufficient funds.';
  state.draftCurrentBid = bidValue;
  state.draftHighestBidder = teamId;
  state.draftTurnTeam = otherTeam(teamId);
  return null;
}

export function handleDraftPass(state: GameState, playerId: string): string | null {
  if (state.phase !== 'draft') return 'Draft auction is not active.';
  if (!state.teamMode || state.teamMapMode !== 'draft') return 'Draft map mode is not enabled.';
  if (state.draftPhase !== 'auction') return 'Draft auction is not active.';
  const player = getPlayer(state, playerId);
  if (!player) return 'Player not found.';
  const soloTest = isSoloTeamTest(state);
  const teamId = soloTest ? state.draftTurnTeam : player.teamId;
  if (!teamId) return 'Pick a team first.';
  if (!soloTest && state.draftTurnTeam !== teamId) return 'Not your team\'s turn to act.';
  if (state.draftCurrentBid <= 0 || !state.draftHighestBidder) return 'A bid must be placed before passing.';
  const tile = state.draftAuctionTiles[state.draftAuctionIndex];
  if (!tile) return 'No draft tile available.';
  const winningTeam = state.draftHighestBidder;
  const bidCost = state.draftCurrentBid;
  state.draftTeamFunds[winningTeam] = Math.max(0, state.draftTeamFunds[winningTeam] - bidCost);
  state.draftTiles[winningTeam].push(tile);
  addLog(state, `Team ${winningTeam} won ${tile.resource} ${tile.numberToken} for $${bidCost}.`);

  state.draftAuctionIndex += 1;
  state.draftCurrentBid = 0;
  state.draftHighestBidder = null;
  state.draftStartingTeam = otherTeam(state.draftStartingTeam);
  state.draftTurnTeam = state.draftStartingTeam;

  const winnerCount = state.draftTiles[winningTeam].length;
  if (winnerCount >= MAX_DRAFT_TILES_PER_TEAM) {
    const losingTeam = otherTeam(winningTeam);
    const remaining = state.draftAuctionTiles.slice(state.draftAuctionIndex);
    if (remaining.length) {
      remaining.forEach((t) => state.draftTiles[losingTeam].push(t));
      addLog(state, `Team ${winningTeam} reached 6 tiles. Remaining tiles awarded to Team ${losingTeam}.`);
    } else {
      addLog(state, 'Draft auction completed.');
    }
    state.draftAuctionIndex = state.draftAuctionTiles.length;
    state.draftPhase = 'placement';
    state.draftTeamFunds = { 1: 0, 2: 0 };
    autoPlaceDraftTiles(state);
    return null;
  }

  if (state.draftAuctionIndex >= state.draftAuctionTiles.length) {
    state.draftPhase = 'placement';
    state.draftTeamFunds = { 1: 0, 2: 0 };
    addLog(state, 'Draft auction completed.');
    autoPlaceDraftTiles(state);
  }
  return null;
}

function autoCompleteDraftAuction(state: GameState) {
  if (state.draftAuctionIndex >= state.draftAuctionTiles.length) {
    state.draftPhase = 'placement';
    state.draftCurrentBid = 0;
    state.draftHighestBidder = null;
    state.draftTeamFunds = { 1: 0, 2: 0 };
    autoPlaceDraftTiles(state);
    return;
  }
  const remaining = shuffle(state.draftAuctionTiles.slice(state.draftAuctionIndex));
  const counts: Record<TeamId, number> = {
    1: state.draftTiles[1].length,
    2: state.draftTiles[2].length,
  };
  let turn = state.draftTurnTeam;
  for (let i = 0; i < remaining.length; i += 1) {
    const tile = remaining[i];
    if (counts[1] >= MAX_DRAFT_TILES_PER_TEAM) {
      state.draftTiles[2].push(...remaining.slice(i));
      counts[2] += remaining.length - i;
      break;
    }
    if (counts[2] >= MAX_DRAFT_TILES_PER_TEAM) {
      state.draftTiles[1].push(...remaining.slice(i));
      counts[1] += remaining.length - i;
      break;
    }
    state.draftTiles[turn].push(tile);
    counts[turn] += 1;
    if (counts[turn] >= MAX_DRAFT_TILES_PER_TEAM) {
      const rest = remaining.slice(i + 1);
      if (rest.length) {
        const other = otherTeam(turn);
        state.draftTiles[other].push(...rest);
        counts[other] += rest.length;
      }
      break;
    }
    turn = otherTeam(turn);
  }
  state.draftAuctionIndex = state.draftAuctionTiles.length;
  state.draftCurrentBid = 0;
  state.draftHighestBidder = null;
  state.draftTeamFunds = { 1: 0, 2: 0 };
  state.draftPhase = 'placement';
  autoPlaceDraftTiles(state);
}

export function handleAutoDraft(state: GameState, playerId: string): string | null {
  if (state.phase !== 'draft') return 'Draft is not active.';
  if (!state.teamMode || state.teamMapMode !== 'draft') return 'Draft map mode is not enabled.';
  if (state.hostId && state.hostId !== playerId) return 'Only the host can auto-draft.';
  if (state.draftPhase === 'auction') {
    if (!state.draftAuctionTiles.length) return 'Draft auction not ready.';
    autoCompleteDraftAuction(state);
    addLog(state, 'Draft auction auto-completed.');
    return null;
  }
  return 'Draft auction already completed.';
}

export function handleAddDraftTile(
  state: GameState,
  playerId: string,
  resource: ResourceType,
  numberToken: number,
): string | null {
  if (state.phase !== 'lobby') return 'Can only add draft tiles in lobby.';
  if (!state.teamMode || state.teamMapMode !== 'draft') return 'Draft map mode is not enabled.';
  if (state.draftPhase !== 'auction') return 'Draft auction is not active.';
  const player = getPlayer(state, playerId);
  if (!player) return 'Player not found.';
  if (!player.teamId) return 'Pick a team first.';
  if (!DRAFT_RESOURCES.includes(resource)) return 'Invalid draft resource.';
  if (!VALID_DRAFT_NUMBERS.has(numberToken)) return 'Invalid draft number.';
  const placedCount = Object.values(state.draftPlacements).filter((p) => p.teamId === player.teamId).length;
  const availableCount = state.draftTiles[player.teamId].length;
  if (placedCount + availableCount >= MAX_DRAFT_TILES_PER_TEAM) {
    return 'Team already has 6 tiles.';
  }
  const tile: DraftTile = {
    id: randomUUID(),
    resource,
    numberToken,
  };
  state.draftTiles[player.teamId].push(tile);
  return null;
}

export function handleRemoveDraftTile(state: GameState, playerId: string, tileId: string): string | null {
  if (state.phase !== 'lobby') return 'Can only remove draft tiles in lobby.';
  if (!state.teamMode || state.teamMapMode !== 'draft') return 'Draft map mode is not enabled.';
  if (state.draftPhase !== 'auction') return 'Draft auction is not active.';
  const player = getPlayer(state, playerId);
  if (!player) return 'Player not found.';
  if (!player.teamId) return 'Pick a team first.';
  const tiles = state.draftTiles[player.teamId];
  const idx = tiles.findIndex((t) => t.id === tileId);
  if (idx === -1) return 'Tile not found.';
  tiles.splice(idx, 1);
  return null;
}

export function handlePlaceDraftTile(state: GameState, playerId: string, hexId: string, tileId: string): string | null {
  if (state.phase !== 'draft') return 'Can only place draft tiles during the draft.';
  if (!state.teamMode || state.teamMapMode !== 'draft') return 'Draft map mode is not enabled.';
  if (state.draftPhase !== 'placement') return 'Draft placement is not active.';
  const player = getPlayer(state, playerId);
  if (!player) return 'Player not found.';
  const soloTest = isSoloTeamTest(state);
  let teamId = player.teamId;
  if (!teamId && !soloTest) return 'Pick a team first.';
  if (soloTest) {
    const team1Idx = state.draftTiles[1].findIndex((t) => t.id === tileId);
    if (team1Idx !== -1) {
      teamId = 1;
    } else {
      const team2Idx = state.draftTiles[2].findIndex((t) => t.id === tileId);
      if (team2Idx !== -1) {
        teamId = 2;
      } else {
        return 'Tile not available.';
      }
    }
  }
  if (!teamId) return 'Pick a team first.';
  const islandHexes = new Set(state.draftIslandHexes[teamId]);
  if (!islandHexes.has(hexId)) return 'That hex is not on your island.';
  const hex = state.board.hexes.find((h) => h.id === hexId);
  if (!hex) return 'Invalid hex.';
  if (hex.resource !== 'cloud' && hex.resource !== 'desert') return 'Only cloud tiles can be replaced.';
  if (state.draftPlacements[hexId]) return 'This hex already has a tile.';
  const tiles = state.draftTiles[teamId];
  const idx = tiles.findIndex((t) => t.id === tileId);
  if (idx === -1) return 'Tile not available.';
  const tile = tiles.splice(idx, 1)[0];
  state.draftPlacements[hexId] = { hexId, teamId, tile };
  hex.resource = tile.resource;
  hex.numberToken = tile.numberToken;
  updateDraftMapReady(state);
  if (state.draftMapReady && allPlayersReady(state)) {
    const teamError = validateTeams(state);
    if (!teamError) beginSpellDraft(state);
  }
  return null;
}

export function handleRemoveDraftPlacement(state: GameState, playerId: string, hexId: string): string | null {
  if (state.phase !== 'draft') return 'Can only edit draft tiles during the draft.';
  if (!state.teamMode || state.teamMapMode !== 'draft') return 'Draft map mode is not enabled.';
  if (state.draftPhase !== 'placement') return 'Draft placement is not active.';
  const player = getPlayer(state, playerId);
  if (!player) return 'Player not found.';
  const placement = state.draftPlacements[hexId];
  if (!placement) return 'No draft tile placed here.';
  const soloTest = isSoloTeamTest(state);
  if (!soloTest) {
    if (!player.teamId) return 'Pick a team first.';
    if (placement.teamId !== player.teamId) return 'You can only remove your team tiles.';
  }
  const hex = state.board.hexes.find((h) => h.id === hexId);
  if (!hex) return 'Invalid hex.';
  delete state.draftPlacements[hexId];
  state.draftTiles[placement.teamId].push(placement.tile);
  hex.resource = 'cloud';
  hex.numberToken = undefined;
  updateDraftMapReady(state);
  return null;
}

export function handleDraftSpellPick(state: GameState, playerId: string, spell: SpellType): string | null {
  if (state.phase !== 'draft') return 'Spell draft is not active.';
  if (!state.teamMode) return 'Spell draft is only available in 2v2.';
  if (state.draftPhase !== 'spell') return 'Spell draft is not active.';
  const player = getPlayer(state, playerId);
  if (!player) return 'Player not found.';
  if (!state.spellDraftOrder.length) return 'Spell draft not initialized.';
  if (state.spellDraftIndex >= state.spellDraftOrder.length) return 'Spell draft is complete.';
  const soloTest = isSoloTeamTest(state);
  const currentTeam = state.spellDraftOrder[state.spellDraftIndex];
  if (!soloTest && player.teamId !== currentTeam) return "It's not your team's pick.";
  if (!state.spellDraftPool.includes(spell)) return 'Spell not available.';
  state.spellDraftPool = state.spellDraftPool.filter((s) => s !== spell);
  state.spellDraftPicks[currentTeam].push(spell);
  state.teamSpells[currentTeam][spell] = (state.teamSpells[currentTeam][spell] || 0) + 1;
  state.spellDraftIndex += 1;
  syncTeamSpells(state);
  addLog(state, `Team ${currentTeam} drafted ${spell.replace(/_/g, ' ')}.`);
  if (state.spellDraftIndex >= state.spellDraftOrder.length) {
    addLog(state, 'Spell draft complete.');
    beginGame(state);
  }
  return null;
}

function canAfford(player: PlayerState, cost: Partial<ResourceCounts>) {
  return (Object.keys(cost) as ResourceType[]).every((res) => player.resources[res] >= (cost[res] || 0));
}

function payCost(player: PlayerState, cost: Partial<ResourceCounts>) {
  (Object.keys(cost) as (keyof ResourceCounts)[]).forEach((res) => {
    player.resources[res] -= cost[res] || 0;
  });
}

function setAwaitingGold(state: GameState) {
  state.awaitingGold = state.players.some((p) => p.pendingGold > 0);
}

function awardResource(state: GameState, player: PlayerState, resource: ResourceType, amount = 1) {
  if (amount <= 0) return;
  if (resource === 'gold') {
    player.pendingGold += amount;
    state.awaitingGold = true;
  } else {
    player.resources[resource] += amount;
  }
}

function awardResources(state: GameState, player: PlayerState, gain: Partial<ResourceCounts>) {
  (Object.keys(gain) as ResourceType[]).forEach((res) => {
    const amt = gain[res] || 0;
    if (amt > 0) awardResource(state, player, res, amt);
  });
}

function awardDevCards(state: GameState, player: PlayerState, count: number): DevCardType[] {
  if (count <= 0) return [];
  const awarded: DevCardType[] = [];
  let granted = 0;
  for (let i = 0; i < count; i += 1) {
    if (state.devDeck.length === 0) break;
    const card = state.devDeck.pop()!;
    player.devCards.push(card);
    player.newlyBoughtDev[card] = (player.newlyBoughtDev[card] || 0) + 1;
    awarded.push(card);
    granted += 1;
  }
  if (granted > 0) {
    addLog(state, `${player.name} received ${granted} development card${granted === 1 ? '' : 's'}.`);
  }
  return awarded;
}

function isVertexClear(state: GameState, vertexId: string) {
  if (state.vertexOwner[vertexId]) return false;
  const neighbors = state.board.vertexNeighbors[vertexId] || [];
  return neighbors.every((v) => !state.vertexOwner[v]);
}

function getVertexEdges(state: GameState, vertexId: string): string[] {
  return state.board.vertexEdges?.[vertexId] || state.board.edges.filter((e) => e.v1 === vertexId || e.v2 === vertexId).map((e) => e.id);
}

function isConnectedForSettlement(state: GameState, player: PlayerState, vertexId: string) {
  const edges = getVertexEdges(state, vertexId);
  return edges.some((edgeId) => state.edgeOwner[edgeId] === player.id);
}

function hasNeighborRoad(state: GameState, player: PlayerState, edgeId: string) {
  const edge = state.board.edges.find((e) => e.id === edgeId);
  if (!edge) return false;
  const touchingEdges = new Set<string>();
  for (const v of [edge.v1, edge.v2]) {
    getVertexEdges(state, v).forEach((e) => touchingEdges.add(e));
  }
  touchingEdges.delete(edgeId);
  return Array.from(touchingEdges).some((id) => state.edgeOwner[id] === player.id);
}

function ownsVertex(state: GameState, playerId: string, vertexId: string) {
  const owner = state.vertexOwner[vertexId];
  return owner === playerId;
}

function canPlaceRoad(state: GameState, player: PlayerState, edgeId: string) {
  if (state.edgeOwner[edgeId]) return false;
  const edge = state.board.edges.find((e) => e.id === edgeId);
  if (!edge) return false;
  if (ownsVertex(state, player.id, edge.v1) || ownsVertex(state, player.id, edge.v2)) return true;
  return hasNeighborRoad(state, player, edgeId);
}

function canPlaceSettlement(state: GameState, player: PlayerState, vertexId: string, free: boolean) {
  if (!isVertexClear(state, vertexId)) return false;
  const touching = state.board.vertexHexes[vertexId] || [];
  const touchesLand = touching.some((hid) => {
    const res = state.board.hexes.find((h) => h.id === hid)?.resource;
    return res && res !== 'water';
  });
  if (!touchesLand) return false;
  if (free) return true;
  return isConnectedForSettlement(state, player, vertexId);
}

function distributeInitialResources(state: GameState, player: PlayerState, vertexId: string) {
  const hexes = state.board.vertexHexes[vertexId] || [];
  hexes.forEach((hexId) => {
    const hex = state.board.hexes.find((h) => h.id === hexId);
    if (!hex) return;
    if (hex.resource === 'dev') {
      awardDevCards(state, player, 1);
      return;
    }
    if (isBaseResource(hex.resource)) {
      awardResource(state, player, hex.resource, 1);
    }
  });
}

function recalcVictoryPoints(state: GameState) {
  for (const p of state.players) {
    let points = 0;
    points += p.settlements.size;
    points += p.cities.size * 2;
    points += p.devCards.filter((c) => c === 'victory_point').length;
    if (p.hasLargestArmy) points += 2;
    if (p.hasLongestRoad) points += 2;
    p.victoryPoints = points;
  }

  if (state.teamMode) {
    const teamTotals: Record<TeamId, number> = { 1: 0, 2: 0 };
    for (const p of state.players) {
      if (p.teamId === 1 || p.teamId === 2) {
        teamTotals[p.teamId] += p.victoryPoints;
      }
    }
    const team1Wins = teamTotals[1] >= state.victoryPointsToWin;
    const team2Wins = teamTotals[2] >= state.victoryPointsToWin;
    if (team1Wins || team2Wins) {
      const winningTeam = team1Wins && team2Wins ? (teamTotals[1] >= teamTotals[2] ? 1 : 2) : team1Wins ? 1 : 2;
      state.phase = 'finished';
      state.winnerTeam = winningTeam;
      state.winnerId = state.players.find((p) => p.teamId === winningTeam)?.id;
      addLog(state, `Team ${winningTeam} wins with ${teamTotals[winningTeam]} points!`);
      return;
    }
    return;
  }

  const winner = state.players.find((p) => p.victoryPoints >= state.victoryPointsToWin);
  if (winner) {
    state.phase = 'finished';
    state.winnerId = winner.id;
    addLog(state, `${winner.name} wins with ${winner.victoryPoints} points!`);
  }
}

function updateLargestArmy(state: GameState) {
  const max = Math.max(...state.players.map((p) => p.playedKnights));
  const contenders = state.players.filter((p) => p.playedKnights >= 3 && p.playedKnights === max);
  state.players.forEach((p) => (p.hasLargestArmy = false));
  if (contenders.length === 1) {
    contenders[0].hasLargestArmy = true;
  }
}

function computeLongestRoad(state: GameState, player: PlayerState) {
  const blockedVertices = new Set(
    Object.entries(state.vertexOwner)
      .filter(([, owner]) => owner && owner !== player.id)
      .map(([vertexId]) => vertexId),
  );

  const edgeList = Array.from(player.roads)
    .map((id) => state.board.edges.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

  const adjacency: Record<string, { to: string; edgeId: string }[]> = {};
  for (const edge of edgeList) {
    const [a, b] = [edge.v1, edge.v2];
    if (!adjacency[a]) adjacency[a] = [];
    if (!adjacency[b]) adjacency[b] = [];
    adjacency[a].push({ to: b, edgeId: edge.id });
    adjacency[b].push({ to: a, edgeId: edge.id });
  }

  let best = 0;

  function dfs(start: string, vertex: string, length: number, seenEdges: Set<string>, seenVertices: Set<string>) {
    best = Math.max(best, length);
    for (const next of adjacency[vertex] || []) {
      if (seenEdges.has(next.edgeId)) continue;
      if (blockedVertices.has(next.to)) {
        if (!seenVertices.has(next.to)) {
          best = Math.max(best, length + 1);
        }
        continue;
      }
      if (next.to === start && length > 0) {
        best = Math.max(best, length + 1);
        continue;
      }
      if (seenVertices.has(next.to)) continue;
      seenEdges.add(next.edgeId);
      seenVertices.add(next.to);
      dfs(start, next.to, length + 1, seenEdges, seenVertices);
      seenVertices.delete(next.to);
      seenEdges.delete(next.edgeId);
    }
  }

  for (const v of Object.keys(adjacency)) {
    const seenEdges = new Set<string>();
    const seenVertices = new Set<string>([v]);
    dfs(v, v, 0, seenEdges, seenVertices);
  }

  player.longestRoadLength = best;
}

function updateLongestRoad(state: GameState) {
  state.players.forEach((p) => computeLongestRoad(state, p));
  const max = Math.max(...state.players.map((p) => p.longestRoadLength));
  if (max < 5) {
    state.players.forEach((p) => (p.hasLongestRoad = false));
    return;
  }
  const leaders = state.players.filter((p) => p.longestRoadLength === max);
  state.players.forEach((p) => (p.hasLongestRoad = false));
  if (leaders.length === 1) {
    leaders[0].hasLongestRoad = true;
  }
}

export function handleBuild(
  state: GameState,
  playerId: string,
  buildType: 'road' | 'settlement' | 'city',
  vertexId?: string,
  edgeId?: string,
): string | null {
  const player = getPlayer(state, playerId);
  if (!player) return 'Player not found.';
  const inSetup = state.phase === 'setup';
  const isTurn = state.phase === 'turn' && state.players[state.currentPlayerIndex]?.id === playerId;

  if (!inSetup && !isTurn) return 'Not your turn.';
  if (inSetup && state.players[state.setupIndex]?.id !== playerId) return 'Not your turn.';
  if (state.awaitingGold) return 'Resolve gold choices first.';
  if (state.awaitingDiscard && !inSetup) return 'Resolve discards first.';
  if (state.awaitingRobber && !inSetup) return 'Move the robber first.';

  // Enforce setup sequence: settlement then road
  if (inSetup) {
    if (buildType === 'settlement' && state.setupStep !== 'settlement') {
      return 'Place your road before the next settlement.';
    }
    if (buildType === 'road' && state.setupStep !== 'road') {
      return 'Place your settlement first.';
    }
  }
  if (!inSetup && state.phase === 'turn') {
    const bonusRoads = player.bonusRoads > 0;
    if (!state.hasRolled && !(buildType === 'road' && bonusRoads)) {
      return 'Roll dice before building.';
    }
  }

  if (buildType === 'settlement') {
    if (player.settlements.size >= 5) return 'No settlements left to build.';
    if (!vertexId) return 'Missing vertex.';
    const free = inSetup;
    const baseCost: ResourceCounts = { brick: 1, lumber: 1, wool: 1, grain: 1, ore: 0, gold: 0 };
    const waived = !free ? state.spellSkilledLabor[player.id] : null;
    const cost: ResourceCounts = { ...baseCost };
    if (waived && waived in cost) {
      cost[waived] = 0;
    }
    if (!free && !canAfford(player, cost)) return 'Not enough resources.';
    if (!canPlaceSettlement(state, player, vertexId, free)) return 'Invalid settlement location.';
    if (!free) payCost(player, cost);
    if (!free && waived) state.spellSkilledLabor[player.id] = null;
    player.settlements.add(vertexId);
    state.vertexOwner[vertexId] = player.id;
    addLog(state, `${player.name} built a settlement.`);
    if (inSetup) {
      discoverSettlementClouds(state, player, vertexId);
    }
    if (inSetup && state.setupRound === 2) {
      distributeInitialResources(state, player, vertexId);
    }
    if (inSetup) {
      state.setupStep = 'road';
      state.lastSetupSettlement[player.id] = vertexId;
    }
  } else if (buildType === 'city') {
    if (player.cities.size >= 4) return 'No cities left to build.';
    if (!vertexId) return 'Missing vertex.';
    if (!player.settlements.has(vertexId)) return 'Must upgrade your settlement.';
    const cost: ResourceCounts = { brick: 0, lumber: 0, wool: 0, grain: 2, ore: 3, gold: 0 };
    if (!canAfford(player, cost)) return 'Not enough resources.';
    payCost(player, cost);
    player.settlements.delete(vertexId);
    player.cities.add(vertexId);
    state.vertexOwner[vertexId] = player.id;
    addLog(state, `${player.name} built a city.`);
  } else if (buildType === 'road') {
    if (player.roads.size >= 15) return 'No roads left to build.';
    if (!edgeId) return 'Missing edge.';
    const usingBonus = player.bonusRoads > 0;
    const free = (inSetup && state.setupStep === 'road') || usingBonus;
    if (inSetup) {
      const lastSett = state.lastSetupSettlement[player.id];
      if (!lastSett) return 'Place your settlement first.';
      if (!free) return 'Setup road must be the free starter road.';
      const edge = state.board.edges.find((e) => e.id === edgeId);
      if (!edge) return 'Missing edge.';
      if (edge.v1 !== lastSett && edge.v2 !== lastSett) {
        return 'Road must be adjacent to your just-placed settlement.';
      }
      // Only one road may be placed off this settlement during the current setup placement
      const alreadyPlaced = Array.from(player.roads).some((rId) => {
        const rEdge = state.board.edges.find((e) => e.id === rId);
        return rEdge?.v1 === lastSett || rEdge?.v2 === lastSett;
      });
      if (alreadyPlaced) return 'Only one road off your setup settlement.';
    }
    const cost: ResourceCounts = { brick: 1, lumber: 1, wool: 0, grain: 0, ore: 0, gold: 0 };
    if (!free && !canAfford(player, cost)) return 'Not enough resources.';
    if (!canPlaceRoad(state, player, edgeId)) return 'Invalid road placement.';
    if (!free) payCost(player, cost);
    player.roads.add(edgeId);
    state.edgeOwner[edgeId] = player.id;
    addLog(state, `${player.name} built a road.`);
    discoverAdjacentClouds(state, player, edgeId);
    if (usingBonus) player.bonusRoads = Math.max(0, player.bonusRoads - 1);
    if (inSetup) {
      advanceSetup(state);
    }
  }

  updateLongestRoad(state);
  recalcVictoryPoints(state);
  return null;
}

function discoverClouds(state: GameState, player: PlayerState, hexIds: string[]) {
  for (const hid of hexIds) {
    const hex = state.board.hexes.find((h) => h.id === hid);
    if (!hex || hex.resource !== 'cloud') continue;
    if (state.revealedClouds[hid]) continue;
    const res = state.cloudContents[hid] || CLOUD_RESOURCES[Math.floor(Math.random() * CLOUD_RESOURCES.length)];
    state.cloudContents[hid] = res;
    state.revealedClouds[hid] = res;
    awardResources(state, player, { [res]: 1 } as Partial<ResourceCounts>);
    addLog(state, `${player.name} discovered a cloud: reveals ${res}, gains 1 ${res}.`);
  }
}

function discoverAdjacentClouds(state: GameState, player: PlayerState, edgeId: string) {
  const edge = state.board.edges.find((e) => e.id === edgeId);
  if (!edge) return;
  const hexesA = state.board.vertexHexes[edge.v1] || [];
  const hexesB = state.board.vertexHexes[edge.v2] || [];
  const edgeHexes = hexesA.filter((id) => hexesB.includes(id));
  discoverClouds(state, player, edgeHexes);
}

function discoverSettlementClouds(state: GameState, player: PlayerState, vertexId: string) {
  const hexIds = state.board.vertexHexes[vertexId] || [];
  discoverClouds(state, player, hexIds);
}

function advanceSetup(state: GameState) {
  if (state.phase !== 'setup') return;
  if (state.setupStep === 'settlement') {
    state.setupStep = 'road';
    return;
  }
  if (state.setupStep === 'road') {
    // clear last placement for the player who just finished
    const currentPlayer = state.players[state.setupIndex];
    if (currentPlayer) state.lastSetupSettlement[currentPlayer.id] = null;
    const playerCount = state.players.length;
    if (state.setupRound === 1) {
      state.setupIndex += 1;
      if (state.setupIndex >= playerCount) {
        state.setupRound = 2;
        state.setupIndex = playerCount - 1;
      }
    } else if (state.setupRound === 2) {
      state.setupIndex -= 1;
      if (state.setupIndex < 0) {
        state.phase = 'turn';
        state.currentPlayerIndex = 0;
        state.setupRound = null;
        state.setupStep = null;
        addLog(state, 'Setup complete. First player\'s turn.');
        return;
      }
    }
    state.setupStep = 'settlement';
    state.currentPlayerIndex = state.setupIndex;
  }
}

export function handleRoll(state: GameState, playerId: string): { error?: string; roll?: [number, number] } {
  if (state.phase !== 'turn') return { error: 'Game not in turn phase.' };
  const active = state.players[state.currentPlayerIndex];
  if (!active || active.id !== playerId) return { error: 'Not your turn.' };
  if (state.hasRolled) return { error: 'Already rolled.' };
  if (state.awaitingGold) return { error: 'Resolve gold choices first.' };

  const useSecondChance = !!state.spellSecondChance[playerId];
  state.spellSecondChance[playerId] = false;
  let die1 = Math.floor(Math.random() * 6) + 1;
  let die2 = Math.floor(Math.random() * 6) + 1;
  let total = die1 + die2;
  let firstTotal: number | null = null;
  if (useSecondChance && total !== 7) {
    firstTotal = total;
    die1 = Math.floor(Math.random() * 6) + 1;
    die2 = Math.floor(Math.random() * 6) + 1;
    total = die1 + die2;
  }
  state.hasRolled = true;
  state.lastRoll = [die1, die2];
  state.lastProduction = null;
  if (useSecondChance && firstTotal !== null) {
    addLog(state, `${active.name} rolled ${firstTotal}, used Second Chance, and rerolled ${total}.`);
  } else if (useSecondChance && total === 7) {
    addLog(state, `${active.name} rolled 7 (Second Chance not used).`);
  } else {
    addLog(state, `${active.name} rolled ${total}.`);
  }

  const record: ProductionRecord | null =
    total === 7
      ? null
      : {
          playerId: playerId,
          rollTotal: total,
          resourceGains: [],
          devCardDraws: [],
        };
  applyFortunesFavor(state, total, record);

  const selectiveHarvest =
    state.spellSelectiveHarvest && state.spellSelectiveHarvest.playerId === playerId
      ? state.spellSelectiveHarvest
      : null;
  if (selectiveHarvest) {
    state.spellSelectiveHarvest = null;
  }

  if (total === 7) {
    state.awaitingDiscard = false;
    state.discardPending = {};
    let needsDiscard = false;
    for (const p of state.players) {
      const count = Object.values(p.resources).reduce((a, b) => a + b, 0);
      if (count > state.discardLimit) {
        const toDiscard = Math.ceil(count / 2);
        state.discardPending[p.id] = toDiscard;
        needsDiscard = true;
        addLog(state, `${p.name} must discard ${toDiscard}.`);
      }
    }
    if (active.teamId && state.spellDoubleCross[active.teamId]) {
      if (needsDiscard) {
        state.spellPendingDoubleCross = { teamId: active.teamId, playerId };
      } else {
        resolveDoubleCross(state, active.teamId, playerId);
      }
    }
    if (needsDiscard) {
      state.awaitingDiscard = true;
      state.awaitingRobber = false;
    } else {
      state.awaitingRobber = true;
    }
    state.roundRolls += 1;
    if (state.roundRolls >= state.players.length) {
      state.roundRolls = 0;
      state.teamSpellUsed = { 1: false, 2: false };
    }
    return { roll: [die1, die2] };
  }

  let shouldProduce = true;
  if (selectiveHarvest) {
    const chosen = selectiveHarvest.number;
    if (chosen !== total) {
      shouldProduce = false;
      addLog(state, `Selective Harvest: ${chosen} was chosen, so no production this roll.`);
    }
  }

  if (shouldProduce) {
    distributeForRoll(state, total, playerId, record || undefined);
  }
  state.lastProduction = record;
  recalcVictoryPoints(state);
  if (state.spellShadowMove[playerId]) {
    state.spellShadowMove[playerId] = false;
    state.awaitingRobber = true;
    addLog(state, `${active.name} triggered Shadow Move.`);
  }
  state.roundRolls += 1;
  if (state.roundRolls >= state.players.length) {
    state.roundRolls = 0;
    state.teamSpellUsed = { 1: false, 2: false };
  }
  return { roll: [die1, die2] };
}

function handleDiscard(state: GameState) {
  state.awaitingDiscard = false;
  state.discardPending = {};
  if (state.spellPendingDoubleCross) {
    const pending = state.spellPendingDoubleCross;
    state.spellPendingDoubleCross = null;
    resolveDoubleCross(state, pending.teamId, pending.playerId);
  }
}

function pickRandomResource(player: PlayerState): ResourceType | null {
  const pool: ResourceType[] = [];
  (Object.keys(player.resources) as ResourceType[]).forEach((res) => {
    for (let i = 0; i < player.resources[res]; i++) pool.push(res);
  });
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function handleDiscardChoice(
  state: GameState,
  playerId: string,
  cards: Partial<ResourceCounts>,
): string | null {
  if (!state.awaitingDiscard) return 'No discard pending.';
  const pending = state.discardPending[playerId] || 0;
  if (!pending) return 'No discard required.';
  const player = getPlayer(state, playerId);
  if (!player) return 'Player not found.';
  const total = (Object.keys(cards) as ResourceType[]).reduce((sum, res) => sum + Math.max(0, cards[res] || 0), 0);
  if (total !== pending) return `You must discard exactly ${pending} card(s).`;
  for (const res of Object.keys(cards) as ResourceType[]) {
    const amt = Math.max(0, cards[res] || 0);
    if (amt > player.resources[res]) return `Not enough ${res} to discard.`;
  }
  (Object.keys(cards) as ResourceType[]).forEach((res) => {
    const amt = Math.max(0, cards[res] || 0);
    player.resources[res] -= amt;
  });
  state.discardPending[playerId] = 0;
  addLog(state, `${player.name} discarded ${pending}.`);
  const remaining = Object.values(state.discardPending).some((v) => v > 0);
  if (!remaining) {
    state.awaitingDiscard = false;
    state.awaitingRobber = true;
    addLog(state, 'All discards resolved. Move the robber.');
  }
  return null;
}

export function handleChooseGold(state: GameState, playerId: string, resource: ResourceType): string | null {
  const player = getPlayer(state, playerId);
  if (!player) return 'Player not found.';
  if (!player.pendingGold) return 'No gold to convert.';
  if (!GOLD_CHOICE_RESOURCES.includes(resource)) return 'Invalid gold choice.';
  player.pendingGold = Math.max(0, player.pendingGold - 1);
  awardResource(state, player, resource, 1);
  setAwaitingGold(state);
  addLog(state, `${player.name} converted gold into ${resource}.`);
  return null;
}

function distributeForRoll(
  state: GameState,
  number: number,
  activePlayerId: string,
  record?: ProductionRecord,
): ProductionRecord {
  const result =
    record ||
    ({
      playerId: activePlayerId,
      rollTotal: number,
      resourceGains: [],
      devCardDraws: [],
    } as ProductionRecord);
  for (const hex of state.board.hexes) {
    if (hex.numberToken !== number || hex.id === state.robberHex) continue;
    const touchingVertices = Object.entries(state.board.vertexHexes)
      .filter(([, hexes]) => hexes.includes(hex.id))
      .map(([vertexId]) => vertexId);
    if (hex.resource === 'dev') {
      for (const vertexId of touchingVertices) {
        const ownerId = state.vertexOwner[vertexId];
        if (!ownerId) continue;
        const owner = getPlayer(state, ownerId);
        if (!owner) continue;
        const amount = owner.cities.has(vertexId) ? 2 : 1;
        const cards = awardDevCards(state, owner, amount);
        cards.forEach((card) => {
          result.devCardDraws.push({ playerId: owner.id, card });
        });
      }
      continue;
    }
    let resource: ResourceType | null = null;
    if (isBaseResource(hex.resource)) {
      resource = hex.resource;
    } else if (hex.resource === 'cloud') {
      resource = state.revealedClouds[hex.id] || null;
    }
    if (!resource) continue;
    for (const vertexId of touchingVertices) {
      const ownerId = state.vertexOwner[vertexId];
      if (!ownerId) continue;
      const owner = getPlayer(state, ownerId);
      if (!owner) continue;
      const amount = owner.cities.has(vertexId) ? 2 : 1;
      awardResource(state, owner, resource, amount);
      result.resourceGains.push({ playerId: owner.id, resource, amount });
    }
  }
  return result;
}

function revertProduction(state: GameState, record: ProductionRecord) {
  for (const gain of record.resourceGains) {
    const player = getPlayer(state, gain.playerId);
    if (!player) continue;
    if (gain.resource === 'gold') {
      player.pendingGold = Math.max(0, player.pendingGold - gain.amount);
    } else {
      player.resources[gain.resource] = Math.max(0, player.resources[gain.resource] - gain.amount);
    }
  }
  for (let i = record.devCardDraws.length - 1; i >= 0; i -= 1) {
    const draw = record.devCardDraws[i];
    const player = getPlayer(state, draw.playerId);
    if (!player) continue;
    const idx = player.devCards.lastIndexOf(draw.card);
    if (idx >= 0) {
      player.devCards.splice(idx, 1);
      player.newlyBoughtDev[draw.card] = Math.max(0, (player.newlyBoughtDev[draw.card] || 0) - 1);
    }
    state.devDeck.push(draw.card);
  }
  setAwaitingGold(state);
}

function applyFortunesFavor(state: GameState, total: number, record: ProductionRecord | null) {
  if (total !== 2 && total !== 12) return;
  for (const player of state.players) {
    if (!state.spellFortunesFavor[player.id]) continue;
    awardResource(state, player, 'gold', 1);
    if (record) {
      record.resourceGains.push({ playerId: player.id, resource: 'gold', amount: 1 });
    }
  }
}

export function handleMoveRobber(
  state: GameState,
  playerId: string,
  hexId: string,
  targetPlayerId?: string,
  allowOverride = false,
): string | null {
  const active = state.players[state.currentPlayerIndex];
  if (!active || active.id !== playerId) return 'Not your turn.';
  if (state.awaitingGold) return 'Resolve gold choices first.';
  if (state.awaitingDiscard) return 'Resolve discards first.';
  if (!state.awaitingRobber && !allowOverride) return 'No robber move pending.';
  if (state.robberHex === hexId) return 'Robber must move to a new hex.';
  const hex = state.board.hexes.find((h) => h.id === hexId);
  if (!hex) return 'Invalid hex.';
  if (hex.resource === 'water') return 'Robber cannot move to water.';
  if (state.spellSafeHavens.some((h) => h.hexId === hexId && h.remaining > 0)) {
    return 'Robber cannot move to a safe haven.';
  }
  state.robberHex = hexId;
  state.awaitingRobber = false;

  const touchingVertices = Object.entries(state.board.vertexHexes)
    .filter(([, hexes]) => hexes.includes(hexId))
    .map(([vertexId]) => vertexId);
  const potentialTargets = Array.from(
    new Set(
      touchingVertices
        .map((v) => state.vertexOwner[v])
        .filter((owner): owner is string => Boolean(owner) && owner !== active.id),
    ),
  );

  if (targetPlayerId) {
    if (!potentialTargets.includes(targetPlayerId)) return 'Target player not adjacent to robber.';
    const target = getPlayer(state, targetPlayerId);
    if (target) {
      const stolen = stealRandomResource(target);
      if (stolen) {
        awardResource(state, active, stolen, 1);
        addLog(state, `${active.name} stole ${stolen} from ${target.name}.`);
      }
    }
  } else if (potentialTargets.length > 0) {
    const randomTargetId = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
    const target = getPlayer(state, randomTargetId);
    if (target) {
      const stolen = stealRandomResource(target);
      if (stolen) {
        awardResource(state, active, stolen, 1);
        addLog(state, `${active.name} stole ${stolen} from ${target.name}.`);
      }
    }
  }
  return null;
}

function stealRandomResource(target: PlayerState): ResourceType | null {
  const pool: ResourceType[] = [];
  (Object.keys(target.resources) as ResourceType[]).forEach((res) => {
    for (let i = 0; i < target.resources[res]; i++) pool.push(res);
  });
  if (pool.length === 0) return null;
  const res = pool[Math.floor(Math.random() * pool.length)];
  target.resources[res] -= 1;
  return res;
}

function resolveDoubleCross(state: GameState, teamId: TeamId, rollerId: string) {
  const active = getPlayer(state, rollerId);
  if (!active) return;
  const opposing = otherTeam(teamId);
  let stolenCount = 0;
  for (let i = 0; i < 2; i += 1) {
    const candidates = state.players.filter(
      (p) =>
        p.teamId === opposing &&
        Object.values(p.resources).some((value) => value > 0),
    );
    if (!candidates.length) break;
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    const stolen = stealRandomResource(target);
    if (stolen) {
      awardResource(state, active, stolen, 1);
      stolenCount += 1;
    }
  }
  if (stolenCount > 0) {
    addLog(state, `${active.name} triggered Double Cross and stole ${stolenCount} resource${stolenCount === 1 ? '' : 's'}.`);
  }
  state.spellDoubleCross[teamId] = false;
}

export function handleEndTurn(state: GameState, playerId: string): string | null {
  if (state.phase !== 'turn') return 'Game not started.';
  const active = state.players[state.currentPlayerIndex];
  if (!active || active.id !== playerId) return 'Not your turn.';
  if (!state.hasRolled) return 'Roll dice before ending turn.';
  if (state.awaitingGold) return 'Resolve gold choices first.';
  if (state.awaitingDiscard) return 'Resolve discards first.';
  if (state.awaitingRobber) return 'Move the robber first.';
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  state.hasRolled = false;
  state.lastRoll = null;
  state.players.forEach((p) => {
    (Object.keys(p.newlyBoughtDev) as DevCardType[]).forEach((k) => (p.newlyBoughtDev[k] = 0));
    p.devPlayedThisTurn = false;
    p.bonusRoads = 0;
  });
  state.lastProduction = null;
  state.spellSelectiveHarvest = null;
  state.spellSmuggler = {};
  state.spellSkilledLabor = {};
  state.spellSecondChance = {};
  state.spellShadowMove = {};
  state.spellCoordinatedTrade = null;
  state.spellPendingDoubleCross = null;
  state.spellSafeHavens = state.spellSafeHavens
    .map((h) => ({ ...h, remaining: h.remaining - 1 }))
    .filter((h) => h.remaining > 0);
  addLog(state, `${active.name} ended their turn.`);
  return null;
}

export function handleBuyDevCard(state: GameState, playerId: string): string | null {
  if (state.phase !== 'turn') return 'Game not started.';
  const active = state.players[state.currentPlayerIndex];
  if (!active || active.id !== playerId) return 'Not your turn.';
  if (state.awaitingGold) return 'Resolve gold choices first.';
  if (state.awaitingDiscard) return 'Resolve discards first.';
  if (state.awaitingRobber) return 'Move the robber first.';
  if (!state.hasRolled) return 'Roll dice before buying.';
  if (state.devDeck.length === 0) return 'No development cards left.';
  const cost: ResourceCounts = { ore: 1, wool: 1, grain: 1, brick: 0, lumber: 0, gold: 0 };
  if (!canAfford(active, cost)) return 'Not enough resources.';
  payCost(active, cost);
  const card = state.devDeck.pop()!;
  active.devCards.push(card);
  active.newlyBoughtDev[card] = (active.newlyBoughtDev[card] || 0) + 1;
  addLog(state, `${active.name} bought a development card.`);
  recalcVictoryPoints(state);
  return null;
}

export function handleUseSpell(
  state: GameState,
  playerId: string,
  spell: SpellType,
  hexA?: string,
  hexB?: string,
  hexes?: string[],
  hexId?: string,
  number?: number,
  delta?: number,
  resource?: ResourceType,
  resourceTo?: ResourceType,
  payResource?: ResourceType,
  skipResource?: ResourceType,
  targetPlayerId?: string,
  pay?: Partial<ResourceCounts>,
): string | null {
  if (state.phase !== 'turn') return 'Game not started.';
  const active = state.players[state.currentPlayerIndex];
  if (!active || active.id !== playerId) return 'Not your turn.';
  if (!state.teamMode) return 'Spells are only available in 2v2.';
  if (!active.teamId) return 'Pick a team to use spells.';
  if (state.hasRolled) return 'Spells must be used before rolling.';
  if (state.awaitingGold) return 'Resolve gold choices first.';
  if (state.awaitingDiscard) return 'Resolve discards first.';
  if (state.awaitingRobber) return 'Move the robber first.';
  if (state.teamSpellUsed[active.teamId]) return 'Your team already used a spell this round.';
  const teamPool = state.teamSpells[active.teamId];
  if (!teamPool || (teamPool[spell] || 0) <= 0) return 'No spell available.';
  const consumeSpell = () => {
    teamPool[spell] = Math.max(0, (teamPool[spell] || 0) - 1);
    state.teamSpellUsed[active.teamId!] = true;
    syncTeamSpells(state);
  };
  const getHex = (id?: string) => (id ? state.board.hexes.find((h) => h.id === id) : undefined);
  const isLandHex = (hex?: HexTile) => !!hex && hex.resource !== 'water';
  const hasNumberToken = (hex?: HexTile) => typeof hex?.numberToken === 'number';
  const isValidToken = (value: number) => VALID_DRAFT_NUMBERS.has(value);

  switch (spell) {
    case 'tectonic_shift': {
      if (!hexA || !hexB) return 'Select two numbered tiles.';
      if (hexA === hexB) return 'Pick two different tiles.';
      const tileA = getHex(hexA);
      const tileB = getHex(hexB);
      if (!isLandHex(tileA) || !isLandHex(tileB)) return 'Tiles must be on land.';
      if (!hasNumberToken(tileA) || !hasNumberToken(tileB)) return 'Both tiles must have number tokens.';
      if (tileA!.numberToken === 6 || tileA!.numberToken === 8 || tileB!.numberToken === 6 || tileB!.numberToken === 8) {
        return '6 and 8 cannot be swapped.';
      }
      const temp = tileA!.numberToken!;
      tileA!.numberToken = tileB!.numberToken;
      tileB!.numberToken = temp;
      consumeSpell();
      addLog(state, `${active.name} cast Tectonic Shift.`);
      return null;
    }
    case 'fertile_ground': {
      const targetHex = hexId || hexA;
      if (!targetHex) return 'Select a numbered tile.';
      const tile = getHex(targetHex);
      if (!isLandHex(tile)) return 'Tile must be on land.';
      if (!hasNumberToken(tile)) return 'Tile must have a number token.';
      if (tile!.numberToken === 6 || tile!.numberToken === 8) return '6 and 8 cannot be adjusted.';
      if (delta !== 1 && delta !== -1) return 'Choose +1 or -1.';
      const next = (tile!.numberToken || 0) + delta;
      if (!isValidToken(next) || next === 6 || next === 8) return 'Invalid number token.';
      tile!.numberToken = next;
      consumeSpell();
      addLog(state, `${active.name} cast Fertile Ground.`);
      return null;
    }
    case 'seismic_rotation': {
      if (!hexes || hexes.length !== 3) return 'Select three adjacent tiles.';
      const unique = new Set(hexes);
      if (unique.size !== 3) return 'Pick three different tiles.';
      const tiles = hexes.map((id) => getHex(id));
      if (tiles.some((t) => !isLandHex(t))) return 'Tiles must be on land.';
      const vertexId = Object.entries(state.board.vertexHexes).find(([, ids]) => hexes.every((id) => ids.includes(id)))?.[0];
      if (!vertexId) return 'Tiles must be adjacent.';
      const vertex = state.board.vertices.find((v) => v.id === vertexId);
      if (!vertex) return 'Invalid tile selection.';
      const ordered = tiles
        .map((tile) => ({
          tile: tile!,
          angle: Math.atan2(tile!.y - vertex.y, tile!.x - vertex.x),
        }))
        .sort((a, b) => a.angle - b.angle)
        .map((entry) => entry.tile);
      const snapshot = ordered.map((tile) => ({
        resource: tile.resource,
        numberToken: tile.numberToken,
      }));
      for (let i = 0; i < ordered.length; i += 1) {
        const next = snapshot[(i + ordered.length - 1) % ordered.length];
        ordered[i].resource = next.resource;
        ordered[i].numberToken = next.numberToken;
      }
      consumeSpell();
      addLog(state, `${active.name} cast Seismic Rotation.`);
      return null;
    }
    case 'safe_haven': {
      const targetHex = hexId || hexA;
      if (!targetHex) return 'Select a land hex.';
      const tile = getHex(targetHex);
      if (!isLandHex(tile)) return 'Tile must be on land.';
      if (state.robberHex === targetHex) return 'Robber is already on that hex.';
      const existing = state.spellSafeHavens.find((h) => h.hexId === targetHex);
      if (existing) {
        existing.remaining = 6;
      } else {
        state.spellSafeHavens.push({ hexId: targetHex, remaining: 6 });
      }
      consumeSpell();
      addLog(state, `${active.name} cast Safe Haven.`);
      return null;
    }
    case 'selective_harvest': {
      if (!number || !isValidToken(number)) return 'Choose a valid dice number.';
      if (state.spellSelectiveHarvest?.playerId === playerId) return 'Selective Harvest is already active.';
      state.spellSelectiveHarvest = { playerId, number };
      consumeSpell();
      addLog(state, `${active.name} cast Selective Harvest (${number}).`);
      return null;
    }
    case 'second_chance': {
      if (state.spellSecondChance[playerId]) return 'Second Chance is already active.';
      state.spellSecondChance[playerId] = true;
      consumeSpell();
      addLog(state, `${active.name} cast Second Chance.`);
      return null;
    }
    case 'fortunes_favor': {
      if (state.spellFortunesFavor[playerId]) return "Fortune's Favor is already active.";
      state.spellFortunesFavor[playerId] = true;
      consumeSpell();
      addLog(state, `${active.name} cast Fortune's Favor.`);
      return null;
    }
    case 'switcheroo': {
      if (!resource || !resourceTo) return 'Select resources to swap.';
      if (resource === resourceTo) return 'Pick two different resources.';
      if (!GOLD_CHOICE_RESOURCES.includes(resource) || !GOLD_CHOICE_RESOURCES.includes(resourceTo)) {
        return 'Gold cannot be swapped.';
      }
      const amount = active.resources[resource] || 0;
      if (amount <= 0) return `No ${resource} to swap.`;
      active.resources[resource] -= amount;
      awardResource(state, active, resourceTo, amount);
      consumeSpell();
      addLog(state, `${active.name} cast Switcheroo.`);
      return null;
    }
    case 'smuggler': {
      if (state.spellSmuggler[playerId]) return 'Smuggler is already active.';
      state.spellSmuggler[playerId] = true;
      consumeSpell();
      addLog(state, `${active.name} cast Smuggler.`);
      return null;
    }
    case 'skilled_labor': {
      if (state.spellSkilledLabor[playerId]) return 'Skilled Labor is already active.';
      if (!payResource || !skipResource) return 'Choose a payment and waived resource.';
      const allowed = ['brick', 'lumber', 'wool', 'grain'];
      if (!allowed.includes(skipResource)) return 'You must waive a settlement resource.';
      if (!GOLD_CHOICE_RESOURCES.includes(payResource)) return 'Invalid payment resource.';
      if ((active.resources[payResource] || 0) < 1) return 'Not enough resources to pay.';
      active.resources[payResource] -= 1;
      state.spellSkilledLabor[playerId] = skipResource;
      consumeSpell();
      addLog(state, `${active.name} cast Skilled Labor.`);
      return null;
    }
    case 'coordinated_trade': {
      if (!state.teamMode) return 'Coordinated Trade requires 2v2 mode.';
      if (!active.teamId) return 'Pick a team first.';
      state.spellCoordinatedTrade = { teamId: active.teamId, remaining: 1 };
      consumeSpell();
      addLog(state, `${active.name} cast Coordinated Trade.`);
      return null;
    }
    case 'double_cross': {
      if (!state.teamMode) return 'Double Cross requires 2v2 mode.';
      if (!active.teamId) return 'Pick a team first.';
      if (state.spellDoubleCross[active.teamId]) return 'Double Cross is already active.';
      state.spellDoubleCross[active.teamId] = true;
      consumeSpell();
      addLog(state, `${active.name} cast Double Cross.`);
      return null;
    }
    case 'shadow_move': {
      if (state.spellShadowMove[playerId]) return 'Shadow Move is already active.';
      state.spellShadowMove[playerId] = true;
      consumeSpell();
      addLog(state, `${active.name} cast Shadow Move.`);
      return null;
    }
    case 'market_disruption': {
      if (!targetPlayerId || !resource) return 'Choose a target and resource.';
      const target = getPlayer(state, targetPlayerId);
      if (!target || target.id === playerId) return 'Invalid target.';
      if (state.teamMode && active.teamId && target.teamId === active.teamId) {
        return 'You must target an opponent.';
      }
      if (!GOLD_CHOICE_RESOURCES.includes(resource)) return 'Gold cannot be discarded.';
      const totalPay = pay
        ? (Object.keys(pay) as ResourceType[]).reduce((sum, res) => sum + Math.max(0, pay[res] || 0), 0)
        : 0;
      if (totalPay !== 2) return 'Market Disruption costs exactly 2 resources.';
      if (!pay) return 'Select resources to pay.';
      for (const res of Object.keys(pay) as ResourceType[]) {
        const amt = Math.max(0, pay[res] || 0);
        if (!GOLD_CHOICE_RESOURCES.includes(res)) return 'Gold cannot be used to pay.';
        if (amt > (active.resources[res] || 0)) return `Not enough ${res} to pay.`;
      }
      for (const res of Object.keys(pay) as ResourceType[]) {
        const amt = Math.max(0, pay[res] || 0);
        active.resources[res] -= amt;
      }
      if ((target.resources[resource] || 0) <= 0) return `${target.name} has no ${resource}.`;
      target.resources[resource] -= 1;
      consumeSpell();
      addLog(state, `${active.name} cast Market Disruption on ${target.name}.`);
      return null;
    }
    case 'copycat': {
      const last = state.lastDevCardPlayed;
      if (!last) return 'No dev card to copy.';
      switch (last) {
        case 'knight': {
          const targetHex = hexId || hexA;
          if (!targetHex) return 'Select a hex for the robber.';
          const result = handleMoveRobber(state, playerId, targetHex, targetPlayerId, true);
          if (result) return result;
          consumeSpell();
          addLog(state, `${active.name} cast Copycat (Knight).`);
          return null;
        }
        case 'monopoly': {
          if (!resource) return 'Choose a resource.';
          if (!GOLD_CHOICE_RESOURCES.includes(resource)) return 'Gold cannot be chosen.';
          let taken = 0;
          for (const p of state.players) {
            if (p.id === active.id) continue;
            const amount = p.resources[resource];
            if (amount > 0) {
              taken += amount;
              p.resources[resource] = 0;
            }
          }
          awardResource(state, active, resource, taken);
          consumeSpell();
          addLog(state, `${active.name} cast Copycat (Monopoly).`);
          return null;
        }
        case 'year_of_plenty': {
          if (!resource || !resourceTo) return 'Choose two resources.';
          if (!GOLD_CHOICE_RESOURCES.includes(resource) || !GOLD_CHOICE_RESOURCES.includes(resourceTo)) {
            return 'Gold cannot be chosen.';
          }
          awardResource(state, active, resource, 1);
          awardResource(state, active, resourceTo, 1);
          consumeSpell();
          addLog(state, `${active.name} cast Copycat (Year of Plenty).`);
          return null;
        }
        case 'road_building': {
          active.bonusRoads = 2;
          consumeSpell();
          addLog(state, `${active.name} cast Copycat (Road Building).`);
          return null;
        }
        case 'victory_point':
        default:
          return 'Cannot copy that dev card.';
      }
    }
    default:
      return 'Unknown spell.';
  }
}

function useDevCard(player: PlayerState, card: DevCardType): string | null {
  if (!player.devCards.includes(card)) return `No ${card.replace(/_/g, ' ')} card to play.`;
  const fresh = player.newlyBoughtDev[card] || 0;
  const total = player.devCards.filter((c) => c === card).length;
  if (total <= fresh) return 'Cannot play a newly bought dev card this turn.';
  if (player.devPlayedThisTurn) return 'You already played a development card this turn.';
  const idx = player.devCards.indexOf(card);
  player.devCards.splice(idx, 1);
  player.devPlayedThisTurn = true;
  return null;
}

export function handlePlayKnight(
  state: GameState,
  playerId: string,
  hexId: string,
  targetPlayerId?: string,
): string | null {
  const active = state.players[state.currentPlayerIndex];
  if (!active || active.id !== playerId) return 'Not your turn.';
  if (state.awaitingGold) return 'Resolve gold choices first.';
  if (state.awaitingDiscard) return 'Resolve discards first.';
  if (state.awaitingRobber && state.robberHex === hexId) return 'Robber must move.';
  const err = useDevCard(active, 'knight');
  if (err) return err;
  active.playedKnights += 1;
  state.lastDevCardPlayed = 'knight';
  updateLargestArmy(state);
  const result = handleMoveRobber(state, playerId, hexId, targetPlayerId, true);
  addLog(state, `${active.name} played a Knight.`);
  recalcVictoryPoints(state);
  return result;
}

export function handlePlayMonopoly(state: GameState, playerId: string, resource: ResourceType): string | null {
  const active = state.players[state.currentPlayerIndex];
  if (!active || active.id !== playerId) return 'Not your turn.';
  if (state.awaitingGold) return 'Resolve gold choices first.';
  if (state.awaitingDiscard) return 'Resolve discards first.';
  if (state.awaitingRobber) return 'Move the robber first.';
  if (!GOLD_CHOICE_RESOURCES.includes(resource)) return 'Gold cannot be chosen.';
  const err = useDevCard(active, 'monopoly');
  if (err) return err;
  state.lastDevCardPlayed = 'monopoly';

  let taken = 0;
  for (const p of state.players) {
    if (p.id === active.id) continue;
    const amount = p.resources[resource];
    if (amount > 0) {
      taken += amount;
      p.resources[resource] = 0;
    }
  }
  awardResource(state, active, resource, taken);
  addLog(state, `${active.name} played Monopoly on ${resource} and took ${taken}.`);
  return null;
}

export function handlePlayYearOfPlenty(
  state: GameState,
  playerId: string,
  resourceA: ResourceType,
  resourceB: ResourceType,
): string | null {
  const active = state.players[state.currentPlayerIndex];
  if (!active || active.id !== playerId) return 'Not your turn.';
  if (state.awaitingGold) return 'Resolve gold choices first.';
  if (state.awaitingDiscard) return 'Resolve discards first.';
  if (state.awaitingRobber) return 'Move the robber first.';
  if (!GOLD_CHOICE_RESOURCES.includes(resourceA) || !GOLD_CHOICE_RESOURCES.includes(resourceB)) {
    return 'Gold cannot be chosen.';
  }
  const err = useDevCard(active, 'year_of_plenty');
  if (err) return err;
  state.lastDevCardPlayed = 'year_of_plenty';
  awardResource(state, active, resourceA, 1);
  awardResource(state, active, resourceB, 1);
  addLog(state, `${active.name} gained ${resourceA} and ${resourceB} (Year of Plenty).`);
  return null;
}

export function handleCheatGain(state: GameState, playerId: string, resource: ResourceType, amount: number): string | null {
  const player = getPlayer(state, playerId);
  if (!player) return 'Player not found.';
  if (state.awaitingGold) return 'Resolve gold choices first.';
  const gain = Math.max(0, Math.min(amount, 20));
  awardResource(state, player, resource, gain);
  addLog(state, `${player.name} gained ${gain} ${resource} (cheat).`);
  return null;
}

function normalizeOffer(resources: Partial<ResourceCounts>): Partial<ResourceCounts> {
  const result: Partial<ResourceCounts> = {};
  (Object.keys(resources) as ResourceType[]).forEach((res) => {
    const amt = Math.max(0, Math.floor(resources[res] || 0));
    if (amt > 0) result[res] = amt;
  });
  return result;
}

export function handleOfferTrade(
  state: GameState,
  playerId: string,
  to: string | undefined,
  give: Partial<ResourceCounts>,
  get: Partial<ResourceCounts>,
): string | null {
  if (state.phase !== 'turn') return 'Game not started.';
  const active = state.players[state.currentPlayerIndex];
  if (!active || active.id !== playerId) return 'Not your turn.';
  if (state.awaitingGold) return 'Resolve gold choices first.';
  if (state.awaitingDiscard) return 'Resolve discards first.';
  if (state.awaitingRobber) return 'Move the robber first.';
  const cleanGive = normalizeOffer(give);
  const cleanGet = normalizeOffer(get);
  if ((cleanGive.gold || 0) > 0 || (cleanGet.gold || 0) > 0) return 'Gold cannot be traded.';
  const giveTotal = Object.values(cleanGive).reduce((a, b) => a + b, 0);
  const getTotal = Object.values(cleanGet).reduce((a, b) => a + b, 0);
  if (!giveTotal && !getTotal) return 'Trade must include something.';
  for (const res of Object.keys(cleanGive) as ResourceType[]) {
    if ((cleanGive[res] || 0) > active.resources[res]) return `Not enough ${res} to offer.`;
  }
  state.tradeSeq += 1;
  state.pendingTrades.push({ id: state.tradeSeq, from: active.id, to, give: cleanGive, get: cleanGet, acceptedBy: [] });
  addLog(state, `${active.name} offered a trade to ${to ? getPlayer(state, to)?.name ?? 'player' : 'all players'}.`);
  return null;
}

export function handleRespondTrade(state: GameState, playerId: string, offerId: number, accept: boolean): string | null {
  if (state.phase !== 'turn') return 'Game not started.';
  if (state.awaitingGold) return 'Resolve gold choices first.';
  if (state.awaitingDiscard) return 'Resolve discards first.';
  if (state.awaitingRobber) return 'Move the robber first.';
  const offer = state.pendingTrades.find((o) => o.id === offerId);
  if (!offer) return 'Trade not found.';
  if (offer.from === playerId) return 'Cannot respond to your own trade.';
  if (offer.to && offer.to !== playerId) return 'Not your trade to respond to.';
  const from = getPlayer(state, offer.from);
  const responder = getPlayer(state, playerId);
  if (!from || !responder) return 'Player missing.';
  if (!accept) {
    offer.acceptedBy = (offer.acceptedBy || []).filter((id) => id !== playerId);
    addLog(state, `${responder.name} rejected a trade from ${from.name}.`);
    return null;
  }
  offer.acceptedBy = Array.from(new Set([...(offer.acceptedBy || []), playerId]));
  addLog(state, `${responder.name} accepted a trade from ${from.name} (awaiting confirmation).`);
  return null;
}

export function handleFinalizeTrade(state: GameState, playerId: string, offerId: number, targetId: string): string | null {
  if (state.phase !== 'turn') return 'Game not started.';
  if (state.awaitingGold) return 'Resolve gold choices first.';
  if (state.awaitingDiscard) return 'Resolve discards first.';
  if (state.awaitingRobber) return 'Move the robber first.';
  const offer = state.pendingTrades.find((o) => o.id === offerId);
  if (!offer) return 'Trade not found.';
  if (offer.from !== playerId) return 'Only the initiator can finalize.';
  if (!offer.acceptedBy || !offer.acceptedBy.includes(targetId)) return 'Target has not accepted this trade.';
  const from = getPlayer(state, offer.from);
  const to = getPlayer(state, targetId);
  if (!from || !to) return 'Player missing.';
  // Validate resources still available
  for (const res of Object.keys(offer.give) as ResourceType[]) {
    const amt = offer.give[res] || 0;
    if (amt > from.resources[res]) return 'Offer no longer valid (not enough resources).';
  }
  for (const res of Object.keys(offer.get) as ResourceType[]) {
    const amt = offer.get[res] || 0;
    if (amt > to.resources[res]) return 'Other player no longer has the requested resources.';
  }
  // Execute transfer
  (Object.keys(offer.give) as ResourceType[]).forEach((res) => {
    const amt = offer.give[res] || 0;
    from.resources[res] -= amt;
    awardResource(state, to, res, amt);
  });
  (Object.keys(offer.get) as ResourceType[]).forEach((res) => {
    const amt = offer.get[res] || 0;
    to.resources[res] -= amt;
    awardResource(state, from, res, amt);
  });
  addLog(state, `${from.name} finalized a trade with ${to.name}.`);
  state.pendingTrades = state.pendingTrades.filter((o) => o.id !== offerId);
  return null;
}

export function handlePlayRoadBuilding(state: GameState, playerId: string): string | null {
  const active = state.players[state.currentPlayerIndex];
  if (!active || active.id !== playerId) return 'Not your turn.';
  if (state.awaitingGold) return 'Resolve gold choices first.';
  if (state.awaitingDiscard) return 'Resolve discards first.';
  if (state.awaitingRobber) return 'Move the robber first.';
  const err = useDevCard(active, 'road_building');
  if (err) return err;
  state.lastDevCardPlayed = 'road_building';
  active.bonusRoads = 2;
  addLog(state, `${active.name} can place 2 free roads (Road Building).`);
  return null;
}

export function handleSetCustomMap(
  state: GameState,
  playerId: string,
  hexes: Array<{ id: string; resource: HexResource; numberToken?: number }>,
): string | null {
  if (state.phase !== 'lobby') return 'Can only edit map in lobby.';
  if (hexes.length !== state.board.hexes.length) return 'Hex count mismatch.';
  const lookup = new Map(state.board.hexes.map((h) => [h.id, h]));
  for (const h of hexes) {
    if (!lookup.has(h.id)) return `Unknown hex id ${h.id}`;
    if (!MAP_RESOURCES.includes(h.resource)) {
      return 'Invalid resource.';
    }
  }
  for (const h of hexes) {
    const target = lookup.get(h.id)!;
    target.resource = h.resource as HexResource;
    target.numberToken =
      isBaseResource(h.resource as HexResource) || h.resource === 'cloud' || h.resource === 'dev'
        ? h.numberToken
        : undefined;
  }
  assignGoldNumberTokens(state.board.hexes);
  const desert = state.board.hexes.find((h) => h.resource === 'desert');
  state.robberHex = desert?.id ?? state.board.hexes[0].id;
  state.customMap = true;
  state.cloudContents = {};
  state.revealedClouds = {};
  addLog(state, `Custom map applied by ${getPlayer(state, playerId)?.name ?? 'player'}.`);
  return null;
}

export function handleSetCustomBoard(
  state: GameState,
  playerId: string,
  hexes: Array<{ id?: string; q: number; r: number; resource: HexResource; numberToken?: number }>,
  ports?: Array<{ id?: string; vertexKey?: string; ratio: 2 | 3; resource?: ResourceType | 'any'; bridges?: string[] }>,
): string | null {
  if (state.phase !== 'lobby') return 'Can only edit map in lobby.';
  if (!hexes.length) return 'No hexes provided.';
  const board = buildBoardFromHexes(
    hexes.map((h, idx) => ({
      id: h.id || `hex-${idx}`,
      q: h.q,
      r: h.r,
      resource: h.resource,
      numberToken: h.numberToken,
    })),
  );
  assignGoldNumberTokens(board.hexes);

  // If ports data provided, map incoming vertexKey to the actual vertex id generated by board builder.
  if (ports && ports.length) {
    const keyToVertex: Record<string, string> = {};
    for (const v of board.vertices) {
      const key = `${v.x.toFixed(4)},${v.y.toFixed(4)}`;
      keyToVertex[key] = v.id;
    }
    const hexById = new Map(board.hexes.map((h) => [h.id, h]));
    board.ports = [];
    for (let i = 0; i < ports.length; i++) {
      const p = ports[i];
      const key = p.vertexKey;
      if (!key) return `Port ${i} missing vertexKey.`;
      const vid = keyToVertex[key];
      if (!vid) return `Port ${i} references unknown vertex.`;
      if (![2, 3].includes(p.ratio)) return `Port ${i} has invalid ratio.`;
      if (p.resource && p.resource !== 'any' && !['brick', 'lumber', 'wool', 'grain', 'ore', 'gold'].includes(p.resource as string))
        return `Port ${i} has invalid resource.`;
      const bridges: string[] = [];
      if (p.bridges && p.bridges.length) {
        for (const bKey of p.bridges) {
          const bVid = keyToVertex[bKey];
          if (bVid) bridges.push(bVid);
        }
      }
      const touching = board.vertexHexes[vid] || [];
      let waterHexId: string | undefined;
      if (p.id && hexById.get(p.id)?.resource === 'water' && touching.includes(p.id)) {
        waterHexId = p.id;
      } else {
        const fallbackWater = touching.find((hexId) => hexById.get(hexId)?.resource === 'water');
        if (fallbackWater) waterHexId = fallbackWater;
      }
      board.ports.push({
        id: p.id || `port-${i}`,
        vertexId: vid,
        waterHexId,
        ratio: p.ratio,
        resource: p.resource,
        bridges,
      });
    }
    for (const [i, p] of board.ports.entries()) {
      const touching = board.vertexHexes[p.vertexId] || [];
      let touchesWater = false;
      let touchesLand = false;
      for (const hexId of touching) {
        const res = hexById.get(hexId)?.resource;
        if (!res) continue;
        if (res === 'water') touchesWater = true;
        else touchesLand = true;
        if (touchesWater && touchesLand) break;
      }
      if (!touchesWater || !touchesLand) {
        return `Port ${i} must be placed on a coastal water tile.`;
      }
    }
    // Prevent duplicate ports on the same vertex
    const seenVerts = new Set<string>();
    for (const [i, p] of board.ports.entries()) {
      if (seenVerts.has(p.vertexId)) return `Duplicate port placed on the same vertex (port index ${i}).`;
      seenVerts.add(p.vertexId);
    }
    // Prevent ports adjacent to each other (sharing an edge/neighbor vertex)
    for (let i = 0; i < board.ports.length; i++) {
      for (let j = i + 1; j < board.ports.length; j++) {
        const a = board.ports[i];
        const b = board.ports[j];
      if (a.vertexId === b.vertexId) return 'Ports cannot share the same vertex.';
      const neighbors = board.vertexNeighbors[a.vertexId] || [];
      if (neighbors.includes(b.vertexId)) {
        return `Ports cannot be adjacent (ports ${a.id} and ${b.id}).`;
      }
    }
  }
  }
  state.board = board;
  state.vertexOwner = {};
  state.edgeOwner = {};
  board.vertices.forEach((v) => (state.vertexOwner[v.id] = null));
  board.edges.forEach((e) => (state.edgeOwner[e.id] = null));
  state.robberHex = board.hexes.find((h) => h.resource === 'desert')?.id ?? board.hexes[0]?.id ?? '';
  // Clear placements
  state.players.forEach((p) => {
    p.roads.clear();
    p.settlements.clear();
    p.cities.clear();
    p.victoryPoints = 0;
    p.playedKnights = 0;
    p.hasLargestArmy = false;
    p.hasLongestRoad = false;
    p.longestRoadLength = 0;
  });
  recalcVictoryPoints(state);
  state.customMap = true;
  state.cloudContents = {};
  state.revealedClouds = {};
  if (state.teamMode && state.teamMapMode === 'draft') {
    state.draftIslandHexes = computeDraftIslandHexes(board);
    initializeDraftAuction(state);
  }
  addLog(state, `Custom board applied by ${getPlayer(state, playerId)?.name ?? 'player'}.`);
  return null;
}

export function handleDebugSetup(state: GameState, playerId: string): string | null {
  const player = getPlayer(state, playerId);
  if (!player) return 'Player not found.';
  // Give resources
  player.resources = emptyResources();
  player.pendingGold = 0;
  (Object.keys(player.resources) as ResourceType[]).forEach((r) => awardResource(state, player, r, 3));
  // Auto place two settlements and two roads on first valid spots
  const freeVertices = state.board.vertices
    .map((v) => v.id)
    .filter((vId) => isVertexClear(state, vId));
  let placed = 0;
  for (const vId of freeVertices) {
    if (placed >= 2) break;
    if (!isVertexClear(state, vId)) continue;
    state.vertexOwner[vId] = player.id;
    player.settlements.add(vId);
    placed++;
    // place road adjacent
    const edges = getVertexEdges(state, vId);
    const edgeId = edges.find((e) => !state.edgeOwner[e]);
    if (edgeId) {
      state.edgeOwner[edgeId] = player.id;
      player.roads.add(edgeId);
    }
  }
  recalcVictoryPoints(state);
  addLog(state, `${player.name} debug setup applied.`);
  // Move to turn phase for testing
  if (!Object.keys(state.cloudContents).length && state.board.hexes.some((h) => h.resource === 'cloud')) {
    assignCloudContents(state);
  }
  state.phase = 'turn';
  state.currentPlayerIndex = 0;
  state.hasRolled = false;
  state.awaitingRobber = false;
  state.setupRound = null;
  state.setupStep = null;
  return null;
}

export function handleUpdateSettings(
  state: GameState,
  playerId: string,
  settings: { victoryPointsToWin?: number; discardLimit?: number; teamMode?: boolean; teamMapMode?: TeamMapMode },
): string | null {
  if (state.phase !== 'lobby') return 'Settings can only be changed in the lobby.';
  if (!getPlayer(state, playerId)) return 'Player not found.';
  const prevTeamMode = state.teamMode;
  const prevMapMode = state.teamMapMode;
  if (typeof settings.victoryPointsToWin === 'number') {
    const next = Math.round(settings.victoryPointsToWin);
    if (next < 3 || next > 20) return 'Victory points must be between 3 and 20.';
    state.victoryPointsToWin = next;
  }
  if (typeof settings.discardLimit === 'number') {
    const next = Math.round(settings.discardLimit);
    if (next < 3 || next > 20) return 'Discard limit must be between 3 and 20.';
    state.discardLimit = next;
  }
  if (typeof settings.teamMode === 'boolean') {
    state.teamMode = settings.teamMode;
    if (!settings.teamMode) {
      state.players.forEach((p) => {
        p.teamId = null;
      });
      resetDraftState(state);
    }
  }
  if (settings.teamMapMode === 'draft' || settings.teamMapMode === 'preloaded') {
    state.teamMapMode = settings.teamMapMode;
  }
  if (state.teamMode && state.teamMapMode === 'draft') {
    if (!prevTeamMode || prevMapMode !== 'draft') {
      initializeDraftMap(state);
    }
  } else if (prevMapMode === 'draft' && state.teamMapMode === 'preloaded') {
    resetDraftState(state);
    restoreDefaultBoard(state);
  }
  addLog(state, 'Game settings updated.');
  return null;
}

export function resetState(state: GameState, options?: { randomizeBoard?: boolean }) {
  const fresh = createInitialState(options);
  (Object.keys(fresh) as Array<keyof GameState>).forEach((key) => {
    // @ts-ignore
    state[key] = fresh[key];
  });
  delete (state as Partial<GameState>).winnerId;
  delete (state as Partial<GameState>).winnerTeam;
}

export function endGame(state: GameState) {
  state.phase = 'lobby';
  state.awaitingDiscard = false;
  state.discardPending = {};
  state.awaitingGold = false;
  state.setupRound = null;
  state.setupIndex = 0;
  state.setupStep = null;
  state.currentPlayerIndex = 0;
  state.hasRolled = false;
  state.awaitingRobber = false;
  state.lastRoll = null;
  state.lastDevCardPlayed = null;
  state.lastProduction = null;
  state.pendingTrades = [];
  state.tradeSeq = 0;
  state.devDeck = buildDevDeck();
  state.lastSetupSettlement = {};
  delete (state as Partial<GameState>).winnerId;
  delete (state as Partial<GameState>).winnerTeam;
  state.draftTiles = { 1: [], 2: [] };
  state.draftPlacements = {};
  state.draftIslandHexes = { 1: [], 2: [] };
  state.draftMapReady = false;

  state.vertexOwner = {};
  state.edgeOwner = {};
  state.board.vertices.forEach((v) => (state.vertexOwner[v.id] = null));
  state.board.edges.forEach((e) => (state.edgeOwner[e.id] = null));
  state.robberHex = state.board.hexes.find((h) => h.resource === 'desert')?.id ?? state.board.hexes[0]?.id ?? '';
  state.cloudContents = {};
  state.revealedClouds = {};
  state.spellSafeHavens = [];
  state.spellSelectiveHarvest = null;
  state.spellSmuggler = {};
  state.spellSkilledLabor = {};
  state.spellSecondChance = {};
  state.spellShadowMove = {};
  state.spellFortunesFavor = {};
  state.spellCoordinatedTrade = null;
  state.spellDoubleCross = { 1: false, 2: false };
  state.spellPendingDoubleCross = null;
  state.teamSpells = emptyTeamSpells();
  state.teamSpellUsed = { 1: false, 2: false };
  state.roundRolls = 0;
  state.spellDraftPool = [];
  state.spellDraftPicks = { 1: [], 2: [] };
  state.spellDraftOrder = [];
  state.spellDraftIndex = 0;

  state.players.forEach((p) => {
    p.resources = emptyResources();
    p.devCards = [];
    p.spells = { ...STARTING_SPELLS };
    p.newlyBoughtDev = {
      knight: 0,
      victory_point: 0,
      monopoly: 0,
      year_of_plenty: 0,
      road_building: 0,
    };
    p.devPlayedThisTurn = false;
    p.bonusRoads = 0;
    p.roads.clear();
    p.settlements.clear();
    p.cities.clear();
    p.pendingGold = 0;
    p.playedKnights = 0;
    p.hasLargestArmy = false;
    p.hasLongestRoad = false;
    p.longestRoadLength = 0;
    p.victoryPoints = 0;
  });
  state.log = [];
  addLog(state, 'Game ended.');
  recalcVictoryPoints(state);
}

export function handleBankTrade(
  state: GameState,
  playerId: string,
  give: ResourceType,
  get: ResourceType,
  ratio = 4,
): string | null {
  const active = state.players[state.currentPlayerIndex];
  if (!active || active.id !== playerId) return 'Not your turn.';
  if (state.awaitingGold) return 'Resolve gold choices first.';
  if (state.awaitingDiscard) return 'Resolve discards first.';
  const canTradeBeforeRoll =
    !!state.spellSmuggler[playerId] ||
    (!!state.spellCoordinatedTrade && active.teamId === state.spellCoordinatedTrade.teamId);
  if (!state.hasRolled && !canTradeBeforeRoll) return 'Roll dice before trading.';
  if (state.awaitingRobber) return 'Move the robber first.';
  if (give === 'gold' || get === 'gold') return 'Gold cannot be traded.';
  // Determine best ratio based on ports owned by the player (settlement/city on port vertex)
  let best = ratio;
  if (state.board.ports && state.board.ports.length) {
    for (const p of state.board.ports) {
      const portVertices = new Set([p.vertexId, ...(p.bridges || [])]);
      const ownsPort = Array.from(portVertices).some((vid) => state.vertexOwner[vid] === playerId);
      if (!ownsPort) continue;
      if (!p.resource || p.resource === 'any' || p.resource === give) {
        best = Math.min(best, p.ratio);
      }
    }
  }
  let coordinatedUsed = false;
  if (state.spellCoordinatedTrade && active.teamId === state.spellCoordinatedTrade.teamId) {
    if (best > 2) {
      best = 2;
      coordinatedUsed = true;
    }
  }
  if (state.spellSmuggler[playerId]) {
    best = Math.min(best, 2);
  }
  if (active.resources[give] < best) return 'Not enough resources to trade.';
  active.resources[give] -= best;
  awardResource(state, active, get, 1);
  if (coordinatedUsed) {
    state.spellCoordinatedTrade = null;
  }
  addLog(state, `${active.name} traded ${best} ${give} for 1 ${get}.`);
  return null;
}

export function getActivePlayer(state: GameState): PlayerState | undefined {
  if (state.phase === 'setup') return state.players[state.setupIndex] ?? state.players[0];
  if (state.phase === 'turn') return state.players[state.currentPlayerIndex];
  return undefined;
}

export function getPhaseLabel(state: GameState): GamePhase {
  return state.phase;
}

export function buildStateMessage(state: GameState): OutgoingMessage {
  return { type: 'state', state: serializeState(state) };
}
