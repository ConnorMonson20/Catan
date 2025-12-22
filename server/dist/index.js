"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
const game_1 = require("./game");
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const state = (0, game_1.createInitialState)();
const clients = new Map();
const wss = new ws_1.WebSocketServer({ port: PORT });
console.log(`Catan server listening on ws://localhost:${PORT}`);
function send(ws, message) {
    ws.send(JSON.stringify(message));
}
function broadcastState() {
    wss.clients.forEach((client) => {
        if (client.readyState !== ws_1.WebSocket.OPEN)
            return;
        const viewerId = clients.get(client) || undefined;
        const payload = { type: 'state', state: (0, game_1.serializeState)(state, viewerId) };
        client.send(JSON.stringify(payload));
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
    }
    catch {
        // ignore parse errors
    }
    const viewerId = clients.get(ws) || undefined;
    send(ws, { type: 'state', state: (0, game_1.serializeState)(state, viewerId) });
    ws.on('message', (raw) => {
        let message;
        try {
            message = JSON.parse(raw.toString());
        }
        catch {
            send(ws, { type: 'error', message: 'Invalid message.' });
            return;
        }
        const playerId = clients.get(ws) || undefined;
        switch (message.type) {
            case 'join': {
                if (message.playerId) {
                    const existing = state.players.find((p) => p.id === message.playerId);
                    if (existing) {
                        clients.set(ws, existing.id);
                        send(ws, { type: 'joined', playerId: existing.id });
                        send(ws, { type: 'state', state: (0, game_1.serializeState)(state) });
                        return;
                    }
                }
                const { player, error } = (0, game_1.addPlayer)(state, message.name, message.color);
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
                const error = (0, game_1.startGame)(state);
                if (error) {
                    send(ws, { type: 'error', message: error });
                    return;
                }
                broadcastState();
                break;
            }
            case 'reset': {
                (0, game_1.endGame)(state);
                state.players = [];
                clients.forEach((_, socket) => clients.set(socket, null));
                broadcastState();
                break;
            }
            case 'cheatGain': {
                if (!playerId) {
                    send(ws, { type: 'error', message: 'Join first.' });
                    return;
                }
                const error = (0, game_1.handleCheatGain)(state, playerId, message.resource, message.amount);
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
                const error = (0, game_1.handleBuild)(state, playerId, message.buildType, message.vertexId, message.edgeId);
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
                const { error } = (0, game_1.handleRoll)(state, playerId);
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
                const error = (0, game_1.handleEndTurn)(state, playerId);
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
                const error = (0, game_1.handleMoveRobber)(state, playerId, message.hexId, message.targetPlayerId);
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
                const error = (0, game_1.handleDiscardChoice)(state, playerId, message.cards);
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
                const error = (0, game_1.handleOfferTrade)(state, playerId, message.to, message.give, message.get);
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
                const error = (0, game_1.handleRespondTrade)(state, playerId, message.offerId, message.accept);
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
                const error = (0, game_1.handleFinalizeTrade)(state, playerId, message.offerId, message.targetId);
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
                const error = (0, game_1.handleUpdateSettings)(state, playerId, {
                    victoryPointsToWin: message.victoryPointsToWin,
                    discardLimit: message.discardLimit,
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
                const error = (0, game_1.handleBuyDevCard)(state, playerId);
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
                const error = (0, game_1.handlePlayKnight)(state, playerId, message.hexId, message.targetPlayerId);
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
                const error = (0, game_1.handlePlayMonopoly)(state, playerId, message.resource);
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
                const error = (0, game_1.handlePlayYearOfPlenty)(state, playerId, message.resourceA, message.resourceB);
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
                const error = (0, game_1.handlePlayRoadBuilding)(state, playerId);
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
                const error = (0, game_1.handleBankTrade)(state, playerId, message.give, message.get);
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
                const error = (0, game_1.handleDebugSetup)(state, playerId);
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
                const error = (0, game_1.handleSetCustomMap)(state, playerId, message.hexes);
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
                const error = (0, game_1.handleSetCustomBoard)(state, playerId, message.hexes, message.ports);
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
        clients.delete(ws);
    });
});
