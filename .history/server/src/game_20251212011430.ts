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
  Port,
} from './types';

const PLAYER_COLORS = ['#d13b3b', '#e6952d', '#2b7de0', '#e0d54a'];

function emptyResources(): ResourceCounts {
  return { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0, gold: 0 };
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
    setupRound: null,
    setupIndex: 0,
    setupStep: null,
    currentPlayerIndex: 0,
    hasRolled: false,
    awaitingRobber: false,
    lastRoll: null,
    devDeck: buildDevDeck(),
    customMap: false,
  };
}

function addLog(state: GameState, entry: string) {
  state.log.unshift(entry);
  if (state.log.length > 100) state.log.pop();
}

export function addPlayer(state: GameState, name: string): { player?: PlayerState; error?: string } {
  if (state.players.length >= 4) return { error: 'Game is full (4 players max).' };
  if (state.phase !== 'lobby') return { error: 'Game already started.' };
  const id = randomUUID();
  const player: PlayerState = {
    id,
    name,
    color: PLAYER_COLORS[state.players.length % PLAYER_COLORS.length],
    resources: emptyResources(),
    devCards: [],
    newlyBoughtDev: [],
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

export function serializeState(state: GameState): PublicGameState {
  return {
    ...state,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      resources: { ...p.resources },
      devCards: [...p.devCards],
      devPlayedThisTurn: p.devPlayedThisTurn,
      bonusRoads: p.bonusRoads,
      roads: Array.from(p.roads),
      settlements: Array.from(p.settlements),
      cities: Array.from(p.cities),
      playedKnights: p.playedKnights,
      hasLargestArmy: p.hasLargestArmy,
      longestRoadLength: p.longestRoadLength,
      hasLongestRoad: p.hasLongestRoad,
      victoryPoints: p.victoryPoints,
    })),
  };
}

export function startGame(state: GameState): string | null {
  if (state.phase !== 'lobby') return 'Game already started.';
  if (state.players.length < 1) return 'Need at least 1 player to start.';
  state.phase = 'setup';
  state.setupRound = 1;
  state.setupIndex = 0;
  state.setupStep = 'settlement';
  state.currentPlayerIndex = 0;
  // Give every player 2 of each base resource for quick testing
  state.players.forEach((p) => {
    p.resources.brick = 2;
    p.resources.lumber = 2;
    p.resources.wool = 2;
    p.resources.grain = 2;
    p.resources.ore = 2;
  });
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

function canPlaceRoad(state: GameState, player: PlayerState, edgeId: string, free: boolean) {
  if (state.edgeOwner[edgeId]) return false;
  const edge = state.board.edges.find((e) => e.id === edgeId);
  if (!edge) return false;
  if (free) {
    return ownsVertex(state, player.id, edge.v1) || ownsVertex(state, player.id, edge.v2);
  }
  if (ownsVertex(state, player.id, edge.v1) || ownsVertex(state, player.id, edge.v2)) return true;
  return hasNeighborRoad(state, player, edgeId);
}

function canPlaceSettlement(state: GameState, player: PlayerState, vertexId: string, free: boolean) {
  if (!isVertexClear(state, vertexId)) return false;
  if (free) return true;
  return isConnectedForSettlement(state, player, vertexId);
}

function distributeInitialResources(state: GameState, player: PlayerState, vertexId: string) {
  const hexes = state.board.vertexHexes[vertexId] || [];
  hexes.forEach((hexId) => {
    const hex = state.board.hexes.find((h) => h.id === hexId);
    if (hex && hex.resource !== 'desert') {
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

  const winner = state.players.find((p) => p.victoryPoints >= 10);
  if (winner) {
    state.phase = 'finished';
    state.winnerId = winner.id;
    addLog(state, `${winner.name} wins with ${winner.victoryPoints} points!`);
  }
}

function updateLargestArmy(state: GameState) {
  const max = Math.max(...state.players.map((p) => p.playedKnights));
  const eligible = state.players.find((p) => p.playedKnights >= 3 && p.playedKnights === max);
  state.players.forEach((p) => (p.hasLargestArmy = false));
  if (eligible) {
    eligible.hasLargestArmy = true;
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
  const leader = state.players.find((p) => p.longestRoadLength === max);
  if (!leader) return;
  state.players.forEach((p) => (p.hasLongestRoad = false));
  leader.hasLongestRoad = true;
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

  if (buildType === 'settlement') {
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
    }
  } else if (buildType === 'city') {
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
    if (!edgeId) return 'Missing edge.';
    const usingBonus = player.bonusRoads > 0;
    const free = (inSetup && state.setupStep === 'road') || usingBonus;
    const cost: ResourceCounts = { brick: 1, lumber: 1, wool: 0, grain: 0, ore: 0, gold: 0 };
    if (!free && !canAfford(player, cost)) return 'Not enough resources.';
    if (!canPlaceRoad(state, player, edgeId, free)) return 'Invalid road placement.';
    if (!free) payCost(player, cost);
    player.roads.add(edgeId);
    state.edgeOwner[edgeId] = player.id;
    addLog(state, `${player.name} built a road.`);
    if (usingBonus) player.bonusRoads = Math.max(0, player.bonusRoads - 1);
    if (inSetup) {
      advanceSetup(state);
    }
  }

  updateLongestRoad(state);
  recalcVictoryPoints(state);
  return null;
}

function advanceSetup(state: GameState) {
  if (state.phase !== 'setup') return;
  if (state.setupStep === 'settlement') {
    state.setupStep = 'road';
    return;
  }
  if (state.setupStep === 'road') {
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
    handleDiscard(state);
    state.awaitingRobber = true;
    return { roll: [die1, die2] };
  }

  distributeForRoll(state, total);
  recalcVictoryPoints(state);
  return { roll: [die1, die2] };
}

function handleDiscard(state: GameState) {
  for (const p of state.players) {
    const total = Object.values(p.resources).reduce((a, b) => a + b, 0);
    if (total > 7) {
      const toDiscard = Math.floor(total / 2);
      for (let i = 0; i < toDiscard; i++) {
        const res = pickRandomResource(p);
        if (res) p.resources[res] -= 1;
      }
      addLog(state, `${p.name} discarded ${toDiscard} cards (rolled 7).`);
    }
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

function distributeForRoll(state: GameState, number: number) {
  for (const hex of state.board.hexes) {
    if (hex.numberToken !== number || hex.id === state.robberHex) continue;
    const touchingVertices = Object.entries(state.board.vertexHexes)
      .filter(([, hexes]) => hexes.includes(hex.id))
      .map(([vertexId]) => vertexId);
    for (const vertexId of touchingVertices) {
      const ownerId = state.vertexOwner[vertexId];
      if (!ownerId) continue;
      const owner = getPlayer(state, ownerId);
      if (!owner) continue;
      const amount = owner.cities.has(vertexId) ? 2 : 1;
      if (hex.resource !== 'desert' && hex.resource !== 'water') {
        owner.resources[hex.resource as ResourceType] += amount;
      }
    }
  }
}

export function handleMoveRobber(
  state: GameState,
  playerId: string,
  hexId: string,
  targetPlayerId?: string,
): string | null {
  const active = state.players[state.currentPlayerIndex];
  if (!active || active.id !== playerId) return 'Not your turn.';
  if (state.robberHex === hexId) return 'Robber must move to a new hex.';
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
  if (state.awaitingRobber) return 'Move the robber first.';
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  state.hasRolled = false;
  state.lastRoll = null;
  state.players.forEach((p) => {
    p.newlyBoughtDev = [];
    p.devPlayedThisTurn = false;
    p.bonusRoads = 0;
  });
  return null;
}

export function handleBuyDevCard(state: GameState, playerId: string): string | null {
  if (state.phase !== 'turn') return 'Game not started.';
  const active = state.players[state.currentPlayerIndex];
  if (!active || active.id !== playerId) return 'Not your turn.';
  if (state.devDeck.length === 0) return 'No development cards left.';
  const cost: ResourceCounts = { ore: 1, wool: 1, grain: 1, brick: 0, lumber: 0, gold: 0, water: 0 };
  if (!canAfford(active, cost)) return 'Not enough resources.';
  payCost(active, cost);
  const card = state.devDeck.pop()!;
  active.devCards.push(card);
  active.newlyBoughtDev.push(card);
  addLog(state, `${active.name} bought a development card.`);
  recalcVictoryPoints(state);
  return null;
}

function useDevCard(player: PlayerState, card: DevCardType): string | null {
  if (!player.devCards.includes(card)) return `No ${card.replace(/_/g, ' ')} card to play.`;
  if (player.newlyBoughtDev.includes(card)) return 'Cannot play a newly bought dev card this turn.';
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
  const err = useDevCard(active, 'knight');
  if (err) return err;
  active.playedKnights += 1;
  updateLargestArmy(state);
  const result = handleMoveRobber(state, playerId, hexId, targetPlayerId);
  recalcVictoryPoints(state);
  return result;
}

export function handlePlayMonopoly(state: GameState, playerId: string, resource: ResourceType): string | null {
  const active = state.players[state.currentPlayerIndex];
  if (!active || active.id !== playerId) return 'Not your turn.';
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

export function handlePlayRoadBuilding(state: GameState, playerId: string): string | null {
  const active = state.players[state.currentPlayerIndex];
  if (!active || active.id !== playerId) return 'Not your turn.';
  const err = useDevCard(active, 'road_building');
  if (err) return err;
  active.bonusRoads = 2;
  addLog(state, `${active.name} can place 2 free roads (Road Building).`);
  return null;
}

export function handleSetCustomMap(
  state: GameState,
  playerId: string,
  hexes: Array<{ id: string; resource: ResourceType | 'desert'; numberToken?: number }>,
): string | null {
  if (state.phase !== 'lobby') return 'Can only edit map in lobby.';
  if (hexes.length !== state.board.hexes.length) return 'Hex count mismatch.';
  const lookup = new Map(state.board.hexes.map((h) => [h.id, h]));
  for (const h of hexes) {
    if (!lookup.has(h.id)) return `Unknown hex id ${h.id}`;
    if (h.resource !== 'desert' && !['brick', 'lumber', 'wool', 'grain', 'ore', 'gold'].includes(h.resource)) {
      return 'Invalid resource.';
    }
  }
  for (const h of hexes) {
    const target = lookup.get(h.id)!;
    target.resource = h.resource;
    target.numberToken = h.resource === 'desert' || h.resource === 'water' ? undefined : h.numberToken;
  }
  const desert = state.board.hexes.find((h) => h.resource === 'desert');
  state.robberHex = desert?.id ?? state.board.hexes[0].id;
  state.customMap = true;
  addLog(state, `Custom map applied by ${getPlayer(state, playerId)?.name ?? 'player'}.`);
  return null;
}

export function handleSetCustomBoard(
  state: GameState,
  playerId: string,
  hexes: Array<{ id?: string; q: number; r: number; resource: ResourceType | 'desert'; numberToken?: number }>,
  ports?: Array<{ id?: string; vertexKey?: string; ratio: 2 | 3; resource?: ResourceType | 'any' }>,
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
      board.ports.push({ id: p.id || `port-${i}`, vertexId: vid, ratio: p.ratio, resource: p.resource });
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
  state.phase = 'turn';
  state.currentPlayerIndex = 0;
  state.hasRolled = false;
  state.awaitingRobber = false;
  state.setupRound = null;
  state.setupStep = null;
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

export function handleBankTrade(
  state: GameState,
  playerId: string,
  give: ResourceType,
  get: ResourceType,
  ratio = 4,
): string | null {
  const active = state.players[state.currentPlayerIndex];
  if (!active || active.id !== playerId) return 'Not your turn.';
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
