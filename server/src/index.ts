import { WebSocketServer, WebSocket } from 'ws';
import {
  ClientMessage,
  OutgoingMessage,
} from './types';
import {
  addPlayer,
  buildStateMessage,
  createInitialState,
  handleBankTrade,
  handleBuild,
  handleBuyDevCard,
  handleEndTurn,
  handleMoveRobber,
  handlePlayKnight,
  handlePlayMonopoly,
  handlePlayRoadBuilding,
  handleUseSpell,
  handlePlayYearOfPlenty,
  handleCheatGain,
  handleChooseGold,
  handleSetTeam,
  handleSetTeamBidder,
  handleDraftBid,
  handleDraftPass,
  handleAutoDraft,
  handleAddDraftTile,
  handleRemoveDraftTile,
  handlePlaceDraftTile,
  handleRemoveDraftPlacement,
  handleDraftSpellPick,
  handleDebugSetup,
  initializeDraftMap,
  resetState,
  handleSetReady,
  handleSetColor,
  handleSetColorHover,
  handleUpdateSettings,
  handleSetCustomMap,
  handleSetCustomBoard,
  handleRoll,
  serializeState,
  startGame,
  handleDiscardChoice,
  handleOfferTrade,
  handleRespondTrade,
  handleFinalizeTrade,
} from './game';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const state = createInitialState();
const clients = new Map<WebSocket, string | null>();

const wss = new WebSocketServer({ port: PORT });
console.log(`Catan server listening on ws://localhost:${PORT}`);

function send(ws: WebSocket, message: OutgoingMessage) {
  ws.send(JSON.stringify(message));
}

function broadcastState() {
  wss.clients.forEach((client) => {
    if (client.readyState !== WebSocket.OPEN) return;
    const viewerId = clients.get(client) || undefined;
    const payload = { type: 'state', state: serializeState(state, viewerId) } as OutgoingMessage;
    client.send(JSON.stringify(payload));
  });
}

function disconnectAll(reason: string) {
  const sockets = Array.from(wss.clients);
  clients.clear();
  sockets.forEach((client) => {
    try {
      client.close(1000, reason);
    } catch {
      // ignore close failures
    }
  });
}

wss.on('connection', (ws, req) => {
  // Attempt to bind viewer immediately using playerId query param, so your own hand stays visible on reconnect
  try {
    const url = new URL(req.url || '', 'ws://localhost');
    const playerId = url.searchParams.get('playerId');
    if (playerId && state.players.find((p) => p.id === playerId)) {
      clients.set(ws, playerId);
    }
  } catch {
    // ignore parse errors
  }
  const viewerId = clients.get(ws) || undefined;
  send(ws, { type: 'state', state: serializeState(state, viewerId) });

  ws.on('message', (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      send(ws, { type: 'error', message: 'Invalid message.' });
      return;
    }

    const playerId = clients.get(ws) || undefined;

    switch (message.type) {
      case 'join': {
        const existingClientId = clients.get(ws);
        if (existingClientId) {
          const stillPresent = state.players.some((p) => p.id === existingClientId);
          if (stillPresent) {
            send(ws, { type: 'error', message: 'Already joined.' });
            return;
          }
          clients.set(ws, null);
        }
        if (message.playerId) {
          const existing = state.players.find((p) => p.id === message.playerId);
          if (existing) {
            clients.set(ws, existing.id);
            send(ws, { type: 'joined', playerId: existing.id });
            send(ws, { type: 'state', state: serializeState(state) });
            return;
          }
        }
        const { player, error } = addPlayer(state, message.name, message.color);
        if (error || !player) {
          send(ws, { type: 'error', message: error || 'Unable to join.' });
          return;
        }
        clients.set(ws, player.id);
        send(ws, { type: 'joined', playerId: player.id });
        broadcastState();
        break;
      }
      case 'start': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = startGame(state, playerId);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'setReady': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleSetReady(state, playerId, message.ready);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'setColor': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleSetColor(state, playerId, message.color);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'setColorHover': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleSetColorHover(state, playerId, message.color);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'setTeam': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleSetTeam(state, playerId, message.teamId);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'setTeamBidder': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleSetTeamBidder(state, playerId, message.teamId);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'draftBid': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleDraftBid(state, playerId, message.amount);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'draftPass': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleDraftPass(state, playerId);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'autoDraft': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleAutoDraft(state, playerId);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'addDraftTile': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleAddDraftTile(state, playerId, message.resource, message.numberToken);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'removeDraftTile': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleRemoveDraftTile(state, playerId, message.tileId);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'placeDraftTile': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handlePlaceDraftTile(state, playerId, message.hexId, message.tileId);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'removeDraftPlacement': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleRemoveDraftPlacement(state, playerId, message.hexId);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'draftSpellPick': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleDraftSpellPick(state, playerId, message.spell);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'reset': {
        const victoryPointsToWin = state.victoryPointsToWin;
        const discardLimit = state.discardLimit;
        const teamMode = state.teamMode;
        const teamMapMode = state.teamMapMode;
        resetState(state, { randomizeBoard: true });
        state.victoryPointsToWin = victoryPointsToWin;
        state.discardLimit = discardLimit;
        state.teamMode = teamMode;
        state.teamMapMode = teamMapMode;
        if (state.teamMode && state.teamMapMode === 'draft') {
          initializeDraftMap(state);
        }
        disconnectAll('Reset');
        break;
      }
      case 'resetServer': {
        resetState(state, { randomizeBoard: true });
        disconnectAll('Reset');
        break;
      }
      case 'cheatGain': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleCheatGain(state, playerId, message.resource, message.amount);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'build': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleBuild(state, playerId, message.buildType, message.vertexId, message.edgeId);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'rollDice': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const { error } = handleRoll(state, playerId);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'endTurn': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleEndTurn(state, playerId);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'moveRobber': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleMoveRobber(state, playerId, message.hexId, message.targetPlayerId);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'chooseGold': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleChooseGold(state, playerId, message.resource);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'discard': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleDiscardChoice(state, playerId, message.cards);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'offerTrade': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleOfferTrade(state, playerId, message.to, message.give, message.get);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'respondTrade': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleRespondTrade(state, playerId, message.offerId, message.accept);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'finalizeTrade': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleFinalizeTrade(state, playerId, message.offerId, message.targetId);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'updateSettings': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleUpdateSettings(state, playerId, {
          victoryPointsToWin: message.victoryPointsToWin,
          discardLimit: message.discardLimit,
          teamMode: message.teamMode,
          teamMapMode: message.teamMapMode,
        });
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'buyDevCard': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleBuyDevCard(state, playerId);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'playKnight': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handlePlayKnight(state, playerId, message.hexId, message.targetPlayerId);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'playMonopoly': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handlePlayMonopoly(state, playerId, message.resource);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'playYearOfPlenty': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handlePlayYearOfPlenty(state, playerId, message.resourceA, message.resourceB);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'playRoadBuilding': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handlePlayRoadBuilding(state, playerId);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'useSpell': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleUseSpell(
          state,
          playerId,
          message.spell,
          message.hexA,
          message.hexB,
          message.hexes,
          message.hexId,
          message.number,
          message.delta,
          message.resource,
          message.resourceTo,
          message.payResource,
          message.skipResource,
          message.targetPlayerId,
          message.pay,
        );
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'bankTrade': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleBankTrade(state, playerId, message.give, message.get);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'debugSetup': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleDebugSetup(state, playerId);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'setCustomMap': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleSetCustomMap(state, playerId, message.hexes);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      case 'setCustomBoard': {
        if (!playerId) {
          send(ws, { type: 'error', message: 'Join first.' });
          return;
        }
        const error = handleSetCustomBoard(state, playerId, message.hexes, message.ports);
        if (error) {
          send(ws, { type: 'error', message: error });
          return;
        }
        broadcastState();
        break;
      }
      default:
        send(ws, { type: 'error', message: 'Unknown action.' });
        break;
    }
  });

  ws.on('close', () => {
    const playerId = clients.get(ws) || undefined;
    clients.delete(ws);
    if (!playerId) return;
    if (state.phase !== 'lobby') return;
    const before = state.players.length;
    state.players = state.players.filter((p) => p.id !== playerId);
    if (state.hostId === playerId) {
      state.hostId = state.players[0]?.id ?? null;
    }
    if (state.players.length !== before) {
      broadcastState();
    }
  });
});
