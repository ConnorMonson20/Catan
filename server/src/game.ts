import { randomUUID } from 'crypto';
import { buildBoard, buildBoardFromHexes } from './board';
import {
  BoardData,
  DevCardType,
  GamePhase,
  GameState,
  OutgoingMessage,
  PlayerState,
  PublicGameState,
  ResourceCounts,
  ResourceType,
  HexResource,
  Port,
  PLAYER_COLORS,
} from './types';

function emptyResources(): ResourceCounts {
  return { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0, gold: 0 };
}

const BASE_RESOURCES: ResourceType[] = ['brick', 'lumber', 'wool', 'grain', 'ore', 'gold'];
const CLOUD_RESOURCES: ResourceType[] = ['ore', 'brick', 'wool', 'grain'];
const isBaseResource = (res: HexResource): res is ResourceType => BASE_RESOURCES.includes(res as ResourceType);

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

export function createInitialState(): GameState {
  const board = buildBoard();
  const vertexOwner: Record<string, string | null> = {};
  const edgeOwner: Record<string, string | null> = {};
  board.vertices.forEach((v) => (vertexOwner[v.id] = null));
  board.edges.forEach((e) => (edgeOwner[e.id] = null));

  const desert = board.hexes.find((h) => h.resource === 'desert');

  return {
    phase: 'lobby',
    board,
    players: [],
    vertexOwner,
    edgeOwner,
    log: [],
    robberHex: desert?.id ?? board.hexes[0].id,
    cloudContents: {},
    revealedClouds: {},
    victoryPointsToWin: 10,
    discardLimit: 7,
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
    customMap: false,
    pendingTrades: [],
    tradeSeq: 0,
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
    resources: emptyResources(),
    devCards: [],
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
  addLog(state, `${name} joined the lobby.`);
  return { player };
}

export function serializeState(state: GameState, viewingPlayerId?: string): PublicGameState {
  const { cloudContents, ...rest } = state;
  return {
    ...rest,
    players: state.players.map((p) => {
      const isViewer = viewingPlayerId && viewingPlayerId === p.id;
      const maskedResources = emptyResources();
      const maskedDev: DevCardType[] = [];
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        resources: isViewer ? { ...p.resources } : maskedResources,
        devCards: isViewer ? [...p.devCards] : maskedDev,
        resourceCount: Object.values(p.resources).reduce((a, b) => a + b, 0),
        devCardCount: p.devCards.length,
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

export function startGame(state: GameState): string | null {
  if (state.phase !== 'lobby') return 'Game already started.';
  if (state.players.length < 1) return 'Need at least 1 player to start.';
  assignCloudContents(state);
  state.awaitingDiscard = false;
  state.discardPending = {};
  state.pendingTrades = [];
  state.tradeSeq = 0;
  state.phase = 'setup';
  state.setupRound = 1;
  state.setupIndex = 0;
  state.setupStep = 'settlement';
  state.currentPlayerIndex = 0;
  addLog(state, 'Game started. Setup round 1.');
  return null;
}

function getPlayer(state: GameState, playerId: string) {
  return state.players.find((p) => p.id === playerId);
}

function canAfford(player: PlayerState, cost: Partial<ResourceCounts>) {
  return (Object.keys(cost) as ResourceType[]).every((res) => player.resources[res] >= (cost[res] || 0));
}

function payCost(player: PlayerState, cost: Partial<ResourceCounts>) {
  (Object.keys(cost) as (keyof ResourceCounts)[]).forEach((res) => {
    player.resources[res] -= cost[res] || 0;
  });
}

function awardResources(player: PlayerState, gain: Partial<ResourceCounts>) {
  (Object.keys(gain) as (keyof ResourceCounts)[]).forEach((res) => {
    player.resources[res] += gain[res] || 0;
  });
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
  if (free) {
    const touching = state.board.vertexHexes[vertexId] || [];
    const blocksCloud = touching.some((hid) => state.board.hexes.find((h) => h.id === hid)?.resource === 'cloud');
    if (blocksCloud) return false;
  }
  if (free) return true;
  return isConnectedForSettlement(state, player, vertexId);
}

function distributeInitialResources(state: GameState, player: PlayerState, vertexId: string) {
  const hexes = state.board.vertexHexes[vertexId] || [];
  hexes.forEach((hexId) => {
    const hex = state.board.hexes.find((h) => h.id === hexId);
    if (hex && isBaseResource(hex.resource)) {
      player.resources[hex.resource] += 1;
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
  // Build adjacency graph of the player's roads.
  const blockedVertices = new Set(
    Object.entries(state.vertexOwner)
      .filter(([, owner]) => owner && owner !== player.id)
      .map(([vertexId]) => vertexId),
  );

  const edges = Array.from(player.roads);
  const edgeList = edges
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
  const seenEdges = new Set<string>();

  function dfs(vertex: string, length: number) {
    best = Math.max(best, length);
    for (const next of adjacency[vertex] || []) {
      if (seenEdges.has(next.edgeId)) continue;
      if (blockedVertices.has(next.to) && !ownsVertex(state, player.id, next.to)) {
        // Can enter the blocked vertex as an endpoint but not pass through.
        best = Math.max(best, length + 1);
        continue;
      }
      seenEdges.add(next.edgeId);
      dfs(next.to, length + 1);
      seenEdges.delete(next.edgeId);
    }
  }

  for (const v of Object.keys(adjacency)) {
    dfs(v, 0);
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
    const cost: ResourceCounts = { brick: 1, lumber: 1, wool: 1, grain: 1, ore: 0, gold: 0 };
    if (!free && !canAfford(player, cost)) return 'Not enough resources.';
    if (!canPlaceSettlement(state, player, vertexId, free)) return 'Invalid settlement location.';
    if (!free) payCost(player, cost);
    player.settlements.add(vertexId);
    state.vertexOwner[vertexId] = player.id;
    addLog(state, `${player.name} built a settlement.`);
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

function discoverAdjacentClouds(state: GameState, player: PlayerState, edgeId: string) {
  const edge = state.board.edges.find((e) => e.id === edgeId);
  if (!edge) return;
  const hexesA = state.board.vertexHexes[edge.v1] || [];
  const hexesB = state.board.vertexHexes[edge.v2] || [];
  const edgeHexes = hexesA.filter((id) => hexesB.includes(id));
  const hexByCoord = new Map<string, typeof state.board.hexes[number]>();
  for (const h of state.board.hexes) {
    hexByCoord.set(`${h.q},${h.r}`, h);
  }
  const neighborOffsets = [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ];
  const candidates = new Set<string>(edgeHexes);
  for (const hid of edgeHexes) {
    const hex = state.board.hexes.find((h) => h.id === hid);
    if (!hex) continue;
    for (const [dq, dr] of neighborOffsets) {
      const neighbor = hexByCoord.get(`${hex.q + dq},${hex.r + dr}`);
      if (neighbor) candidates.add(neighbor.id);
    }
  }
  for (const hid of candidates) {
    const hex = state.board.hexes.find((h) => h.id === hid);
    if (!hex || hex.resource !== 'cloud') continue;
    if (state.revealedClouds[hid]) continue;
    const res = state.cloudContents[hid] || CLOUD_RESOURCES[Math.floor(Math.random() * CLOUD_RESOURCES.length)];
    state.cloudContents[hid] = res;
    state.revealedClouds[hid] = res;
    awardResources(player, { [res]: 1 } as Partial<ResourceCounts>);
    addLog(state, `${player.name} discovered a cloud: reveals ${res}, gains 1 ${res}.`);
  }
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

  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  const total = die1 + die2;
  state.hasRolled = true;
  state.lastRoll = [die1, die2];
  addLog(state, `${active.name} rolled ${total}.`);

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
    if (needsDiscard) {
      state.awaitingDiscard = true;
      state.awaitingRobber = false;
    } else {
      state.awaitingRobber = true;
    }
    return { roll: [die1, die2] };
  }

  distributeForRoll(state, total);
  recalcVictoryPoints(state);
  return { roll: [die1, die2] };
}

function handleDiscard(state: GameState) {
  state.awaitingDiscard = false;
  state.discardPending = {};
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

function distributeForRoll(state: GameState, number: number) {
  for (const hex of state.board.hexes) {
    if (hex.numberToken !== number || hex.id === state.robberHex) continue;
    let resource: ResourceType | null = null;
    if (isBaseResource(hex.resource)) {
      resource = hex.resource;
    } else if (hex.resource === 'cloud') {
      resource = state.revealedClouds[hex.id] || null;
    }
    if (!resource) continue;
    const touchingVertices = Object.entries(state.board.vertexHexes)
      .filter(([, hexes]) => hexes.includes(hex.id))
      .map(([vertexId]) => vertexId);
    for (const vertexId of touchingVertices) {
      const ownerId = state.vertexOwner[vertexId];
      if (!ownerId) continue;
      const owner = getPlayer(state, ownerId);
      if (!owner) continue;
      const amount = owner.cities.has(vertexId) ? 2 : 1;
      owner.resources[resource] += amount;
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
  if (state.awaitingDiscard) return 'Resolve discards first.';
  if (!state.awaitingRobber && !allowOverride) return 'No robber move pending.';
  if (state.robberHex === hexId) return 'Robber must move to a new hex.';
  const hex = state.board.hexes.find((h) => h.id === hexId);
  if (!hex) return 'Invalid hex.';
  if (hex.resource === 'water') return 'Robber cannot move to water.';
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
        active.resources[stolen] += 1;
        addLog(state, `${active.name} stole ${stolen} from ${target.name}.`);
      }
    }
  } else if (potentialTargets.length > 0) {
    const randomTargetId = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
    const target = getPlayer(state, randomTargetId);
    if (target) {
      const stolen = stealRandomResource(target);
      if (stolen) {
        active.resources[stolen] += 1;
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

export function handleEndTurn(state: GameState, playerId: string): string | null {
  if (state.phase !== 'turn') return 'Game not started.';
  const active = state.players[state.currentPlayerIndex];
  if (!active || active.id !== playerId) return 'Not your turn.';
  if (!state.hasRolled) return 'Roll dice before ending turn.';
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
  addLog(state, `${active.name} ended their turn.`);
  return null;
}

export function handleBuyDevCard(state: GameState, playerId: string): string | null {
  if (state.phase !== 'turn') return 'Game not started.';
  const active = state.players[state.currentPlayerIndex];
  if (!active || active.id !== playerId) return 'Not your turn.';
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
  if (state.awaitingDiscard) return 'Resolve discards first.';
  if (state.awaitingRobber && state.robberHex === hexId) return 'Robber must move.';
  const err = useDevCard(active, 'knight');
  if (err) return err;
  active.playedKnights += 1;
  updateLargestArmy(state);
  const result = handleMoveRobber(state, playerId, hexId, targetPlayerId, true);
  addLog(state, `${active.name} played a Knight.`);
  recalcVictoryPoints(state);
  return result;
}

export function handlePlayMonopoly(state: GameState, playerId: string, resource: ResourceType): string | null {
  const active = state.players[state.currentPlayerIndex];
  if (!active || active.id !== playerId) return 'Not your turn.';
  if (state.awaitingDiscard) return 'Resolve discards first.';
  if (state.awaitingRobber) return 'Move the robber first.';
  const err = useDevCard(active, 'monopoly');
  if (err) return err;

  let taken = 0;
  for (const p of state.players) {
    if (p.id === active.id) continue;
    const amount = p.resources[resource];
    if (amount > 0) {
      taken += amount;
      p.resources[resource] = 0;
    }
  }
  active.resources[resource] += taken;
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
  if (state.awaitingDiscard) return 'Resolve discards first.';
  if (state.awaitingRobber) return 'Move the robber first.';
  const err = useDevCard(active, 'year_of_plenty');
  if (err) return err;
  active.resources[resourceA] += 1;
  active.resources[resourceB] += 1;
  addLog(state, `${active.name} gained ${resourceA} and ${resourceB} (Year of Plenty).`);
  return null;
}

export function handleCheatGain(state: GameState, playerId: string, resource: ResourceType, amount: number): string | null {
  const player = getPlayer(state, playerId);
  if (!player) return 'Player not found.';
  const gain = Math.max(0, Math.min(amount, 20));
  player.resources[resource] += gain;
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
  if (state.awaitingDiscard) return 'Resolve discards first.';
  if (state.awaitingRobber) return 'Move the robber first.';
  const cleanGive = normalizeOffer(give);
  const cleanGet = normalizeOffer(get);
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
    to.resources[res] += amt;
  });
  (Object.keys(offer.get) as ResourceType[]).forEach((res) => {
    const amt = offer.get[res] || 0;
    to.resources[res] -= amt;
    from.resources[res] += amt;
  });
  addLog(state, `${from.name} finalized a trade with ${to.name}.`);
  state.pendingTrades = state.pendingTrades.filter((o) => o.id !== offerId);
  return null;
}

export function handlePlayRoadBuilding(state: GameState, playerId: string): string | null {
  const active = state.players[state.currentPlayerIndex];
  if (!active || active.id !== playerId) return 'Not your turn.';
  if (state.awaitingDiscard) return 'Resolve discards first.';
  if (state.awaitingRobber) return 'Move the robber first.';
  const err = useDevCard(active, 'road_building');
  if (err) return err;
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
    if (!['desert', 'water', 'cloud', ...BASE_RESOURCES].includes(h.resource)) {
      return 'Invalid resource.';
    }
  }
  for (const h of hexes) {
    const target = lookup.get(h.id)!;
    target.resource = h.resource as HexResource;
    target.numberToken = isBaseResource(h.resource as HexResource) || h.resource === 'cloud' ? h.numberToken : undefined;
  }
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

  // If ports data provided, map incoming vertexKey to the actual vertex id generated by board builder.
  if (ports && ports.length) {
    const keyToVertex: Record<string, string> = {};
    for (const v of board.vertices) {
      const key = `${v.x.toFixed(4)},${v.y.toFixed(4)}`;
      keyToVertex[key] = v.id;
    }
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
      board.ports.push({ id: p.id || `port-${i}`, vertexId: vid, ratio: p.ratio, resource: p.resource, bridges });
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
  addLog(state, `Custom board applied by ${getPlayer(state, playerId)?.name ?? 'player'}.`);
  return null;
}

export function handleDebugSetup(state: GameState, playerId: string): string | null {
  const player = getPlayer(state, playerId);
  if (!player) return 'Player not found.';
  // Give resources
  (Object.keys(player.resources) as ResourceType[]).forEach((r) => (player.resources[r] = 3));
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
  settings: { victoryPointsToWin?: number; discardLimit?: number },
): string | null {
  if (state.phase !== 'lobby') return 'Settings can only be changed in the lobby.';
  if (!getPlayer(state, playerId)) return 'Player not found.';
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
  addLog(state, 'Game settings updated.');
  return null;
}

export function resetState(state: GameState) {
  const fresh = createInitialState();
  (Object.keys(fresh) as Array<keyof GameState>).forEach((key) => {
    // @ts-ignore
    state[key] = fresh[key];
  });
  delete (state as Partial<GameState>).winnerId;
}

export function endGame(state: GameState) {
  state.phase = 'lobby';
  state.awaitingDiscard = false;
  state.discardPending = {};
  state.setupRound = null;
  state.setupIndex = 0;
  state.setupStep = null;
  state.currentPlayerIndex = 0;
  state.hasRolled = false;
  state.awaitingRobber = false;
  state.lastRoll = null;
  state.pendingTrades = [];
  state.tradeSeq = 0;
  state.devDeck = buildDevDeck();
  state.lastSetupSettlement = {};
  delete (state as Partial<GameState>).winnerId;

  state.vertexOwner = {};
  state.edgeOwner = {};
  state.board.vertices.forEach((v) => (state.vertexOwner[v.id] = null));
  state.board.edges.forEach((e) => (state.edgeOwner[e.id] = null));
  state.robberHex = state.board.hexes.find((h) => h.resource === 'desert')?.id ?? state.board.hexes[0]?.id ?? '';
  state.cloudContents = {};
  state.revealedClouds = {};

  state.players.forEach((p) => {
    p.resources = emptyResources();
    p.devCards = [];
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
  if (state.awaitingDiscard) return 'Resolve discards first.';
  if (!state.hasRolled) return 'Roll dice before trading.';
  if (state.awaitingRobber) return 'Move the robber first.';
  // Determine best ratio based on ports owned by the player (settlement/city on port vertex)
  let best = ratio;
  if (state.board.ports && state.board.ports.length) {
    for (const p of state.board.ports) {
      const owner = state.vertexOwner[p.vertexId];
      if (owner === playerId) {
        if (!p.resource || p.resource === 'any' || p.resource === give) {
          best = Math.min(best, p.ratio);
        }
      }
    }
  }
  if (active.resources[give] < best) return 'Not enough resources to trade.';
  active.resources[give] -= best;
  active.resources[get] += 1;
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
