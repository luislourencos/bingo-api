
require('dotenv').config();
const app = require('express')();
const http = require('http').Server(app);
const cors = require('cors');
const { createCard, CELLS_PER_CARD } = require('./bingo');
const { env: { PORT } } = process;

app.use(cors());

const socketIO = require('socket.io')(http, {
    cors: {
        origin: "*",
        credentials: true
    }
});

const DEFAULT_PRICE_CARD = 0.15;
// Room ids are exactly 5 alphanumeric characters. Defensive limits keep
// memory bounded against abuse (crafted ids / flooding players).
const ROOM_ID_REGEX = /^[a-zA-Z0-9]{5}$/;
const MAX_ROOMS = 5;
const MAX_PLAYERS_PER_ROOM = 60;
const emptyLine = () => ({ line: false, user: '' });
const emptyBingo = () => ({ bingo: false, user: '' });
const emptyNumbers = () => ({ numbers: [] });

// A fresh, isolated game state for a single room.
const emptyState = () => ({
    userList: [],
    winnerFirstLine: emptyLine(),
    winnerBingo: emptyBingo(),
    ranking: [],
    priceCard: DEFAULT_PRICE_CARD,
    randomNumbers: emptyNumbers(),
});

// roomId -> game state. Rooms are created on demand and destroyed when empty.
const rooms = new Map();

// Get (creating if needed) the state for a given room.
function getRoom(roomId) {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, emptyState());
    }
    return rooms.get(roomId);
}

// socket.id -> { name, roomId }, so we can clean up players when they disconnect.
const socketUser = new Map();

// Add the winner to the ranking, accumulating the price if it already exists.
function upsertRanking(state, data) {
    const index = state.ranking.findIndex((item) => item.name === data.name);
    if (index !== -1) {
        state.ranking[index] = { ...data, price: state.ranking[index].price + data.price };
    } else {
        state.ranking.push({ ...data, price: data.price });
    }
}

// Percentage of matched cells (0-100) for a given card.
function computeCompleted(card = []) {
    const matched = card.reduce(
        (acc, row) => acc + row.filter((cell) => cell.matched).length,
        0
    );
    return Math.round((matched / CELLS_PER_CARD) * 100);
}

socketIO.on('connection', (socket) => {
    // Join a room and send that room's current state to the socket that
    // just entered (not broadcast to the rest). Both players and the admin
    // call this with the room id taken from the URL.
    socket.on('joinRoom', (roomId) => {
        // Never trust the client: validate the id format server-side too.
        if (!ROOM_ID_REGEX.test(roomId || '')) {
            socket.emit('joinError', 'Id de sala no válido');
            return;
        }
        // Cap the number of simultaneous rooms (only blocks creating a new one).
        if (!rooms.has(roomId) && rooms.size >= MAX_ROOMS) {
            socket.emit('joinError', 'No hay salas disponibles en este momento');
            return;
        }
        // Leave any previous room so a socket only ever belongs to one game.
        if (socket.data.roomId && socket.data.roomId !== roomId) {
            socket.leave(socket.data.roomId);
        }
        socket.join(roomId);
        socket.data.roomId = roomId;

        const state = getRoom(roomId);
        socket.emit('ranking', state.ranking);
        socket.emit('priceCard', state.priceCard);
        socket.emit('userList', state.userList);
        socket.emit('winnerFirstLine', state.winnerFirstLine);
        socket.emit('winnerBingo', state.winnerBingo);
        socket.emit('randomNumbers', state.randomNumbers);
    });

    socket.on('restart', () => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const state = getRoom(roomId);
        state.winnerFirstLine = emptyLine();
        state.winnerBingo = emptyBingo();
        state.randomNumbers = emptyNumbers();
        state.userList = state.userList.map((item) => ({ ...item, completed: 0, card: createCard() }));
        // Emit to everyone in the room (incl. sender): the server regenerated
        // the cards, so the host also needs the fresh state.
        socketIO.to(roomId).emit('winnerFirstLine', state.winnerFirstLine);
        socketIO.to(roomId).emit('winnerBingo', state.winnerBingo);
        socketIO.to(roomId).emit('randomNumbers', state.randomNumbers);
        socketIO.to(roomId).emit('userList', state.userList);
        socketIO.to(roomId).emit('ranking', state.ranking);
        socketIO.to(roomId).emit('priceCard', state.priceCard);
        socketIO.to(roomId).emit('restart', true);
    });

    socket.on('resetAll', () => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const state = getRoom(roomId);
        state.userList = [];
        state.winnerFirstLine = emptyLine();
        state.winnerBingo = emptyBingo();
        state.ranking = [];
        state.priceCard = 0;
        state.randomNumbers = emptyNumbers();
        socketIO.to(roomId).emit('winnerFirstLine', state.winnerFirstLine);
        socketIO.to(roomId).emit('winnerBingo', state.winnerBingo);
        socketIO.to(roomId).emit('randomNumbers', state.randomNumbers);
        socketIO.to(roomId).emit('userList', state.userList);
        socketIO.to(roomId).emit('resetAll', true);
        socketIO.to(roomId).emit('priceCard', state.priceCard);
    });

    socket.on('priceCard', (data) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        getRoom(roomId).priceCard = data;
        socket.to(roomId).emit('priceCard', data);
    });

    socket.on('winnerFirstLine', (data) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const state = getRoom(roomId);
        // Only the first claim counts: avoids double-awarding the prize
        // if several clients report the line almost simultaneously.
        if (state.winnerFirstLine.line) return;
        state.winnerFirstLine = data;
        upsertRanking(state, data);
        socket.to(roomId).emit('winnerFirstLine', data);
        socketIO.to(roomId).emit('ranking', state.ranking);
    });

    socket.on('winnerBingo', (data) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const state = getRoom(roomId);
        if (state.winnerBingo.bingo) return;
        state.winnerBingo = data;
        upsertRanking(state, data);
        socket.to(roomId).emit('winnerBingo', data);
        socketIO.to(roomId).emit('ranking', state.ranking);
    });

    socket.on('user', (data) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const state = getRoom(roomId);
        const { name } = data;
        const completed = computeCompleted(data.card);

        const index = state.userList.findIndex((item) => item.name === name);
        if (index !== -1) {
            state.userList[index] = { ...data, completed };
        } else {
            // Cap players per room; existing players (updates) always pass.
            if (state.userList.length >= MAX_PLAYERS_PER_ROOM) {
                socket.emit('roomFull', 'La sala está completa');
                return;
            }
            state.userList.push({ ...data, completed });
        }

        socketUser.set(socket.id, { name, roomId });
        // Ranking is unchanged here, so we don't re-broadcast it (saves traffic
        // on every cell the player marks).
        socket.to(roomId).emit('userList', state.userList);
    });

    socket.on('removeUser', (data) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const state = getRoom(roomId);
        const { name } = data;
        state.userList = state.userList.filter((item) => item.name !== name);
        socket.to(roomId).emit('userList', state.userList);
    });

    socket.on('randomNumbers', (data) => {
        const roomId = socket.data.roomId;
        if (!roomId) return;
        getRoom(roomId).randomNumbers = data;
        socket.to(roomId).emit('randomNumbers', data);
    });

    // Route an animation (cat / flip screen) to a specific player in the room.
    // We emit only to the target's socket(s) (a player may have several tabs
    // open) so the animation plays on their screen, not everyone's.
    const sendToUser = (event, to) => {
        const roomId = socket.data.roomId;
        if (!roomId || !to) return;
        const from = socketUser.get(socket.id)?.name;
        for (const [socketId, entry] of socketUser.entries()) {
            if (entry.roomId === roomId && entry.name === to) {
                socketIO.to(socketId).emit(event, { from });
            }
        }
    };

    socket.on('sendCat', (data) => sendToUser('receiveCat', (data || {}).to));
    socket.on('sendFlip', (data) => sendToUser('receiveFlip', (data || {}).to));
    socket.on('sendHide', (data) => sendToUser('receiveHide', (data || {}).to));

    // Drop the player from their room when their socket goes away.
    socket.on('disconnect', () => {
        const entry = socketUser.get(socket.id);
        const roomId = socket.data.roomId;
        socketUser.delete(socket.id);

        if (entry) {
            const { name } = entry;
            // Keep the player if they still have another open socket in the
            // same room (e.g. another tab).
            const stillConnected = [...socketUser.values()]
                .some((u) => u.name === name && u.roomId === entry.roomId);
            if (!stillConnected && rooms.has(entry.roomId)) {
                const state = rooms.get(entry.roomId);
                state.userList = state.userList.filter((item) => item.name !== name);
                socket.to(entry.roomId).emit('userList', state.userList);
            }
        }

        // Free the room's state once nobody (player or admin) is left in it.
        if (roomId) {
            const remaining = socketIO.sockets.adapter.rooms.get(roomId);
            if (!remaining || remaining.size === 0) {
                rooms.delete(roomId);
            }
        }
    });
});

app.get('/api/getCard', (_req, res) => {
    const card = createCard();
    res.status(200).json(card);
});

http.listen(PORT, () => {
    console.log(`Server listening on ${PORT}`);
});
