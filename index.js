
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
const emptyLine = () => ({ line: false, user: '' });
const emptyBingo = () => ({ bingo: false, user: '' });
const emptyNumbers = () => ({ numbers: [] });

// Single source of truth for the game state.
const state = {
    userList: [],
    winnerFirstLine: emptyLine(),
    winnerBingo: emptyBingo(),
    ranking: [],
    priceCard: DEFAULT_PRICE_CARD,
    randomNumbers: emptyNumbers(),
};

// socket.id -> user name, so we can clean up players when they disconnect.
const socketUser = new Map();

// Add the winner to the ranking, accumulating the price if it already exists.
function upsertRanking(data) {
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
    // The user who just entered is the one that needs the current state,
    // so emit only to that socket (not broadcast to the rest).
    socket.on('userEnter', () => {
        socket.emit('ranking', state.ranking);
        socket.emit('priceCard', state.priceCard);
        socket.emit('userList', state.userList);
        socket.emit('winnerFirstLine', state.winnerFirstLine);
        socket.emit('winnerBingo', state.winnerBingo);
        socket.emit('randomNumbers', state.randomNumbers);
    });

    socket.on('restart', () => {
        state.winnerFirstLine = emptyLine();
        state.winnerBingo = emptyBingo();
        state.randomNumbers = emptyNumbers();
        state.userList = state.userList.map((item) => ({ ...item, completed: 0, card: createCard() }));
        // Emit to everyone (incl. sender): the server regenerated the cards,
        // so the host also needs the fresh state.
        socketIO.emit('winnerFirstLine', state.winnerFirstLine);
        socketIO.emit('winnerBingo', state.winnerBingo);
        socketIO.emit('randomNumbers', state.randomNumbers);
        socketIO.emit('userList', state.userList);
        socketIO.emit('ranking', state.ranking);
        socketIO.emit('priceCard', state.priceCard);
        socketIO.emit('restart', true);
    });

    socket.on('resetAll', () => {
        state.userList = [];
        state.winnerFirstLine = emptyLine();
        state.winnerBingo = emptyBingo();
        state.ranking = [];
        state.priceCard = 0;
        state.randomNumbers = emptyNumbers();
        socketIO.emit('winnerFirstLine', state.winnerFirstLine);
        socketIO.emit('winnerBingo', state.winnerBingo);
        socketIO.emit('randomNumbers', state.randomNumbers);
        socketIO.emit('userList', state.userList);
        socketIO.emit('resetAll', true);
        socketIO.emit('priceCard', state.priceCard);
    });

    socket.on('priceCard', (data) => {
        state.priceCard = data;
        socket.broadcast.emit('priceCard', data);
    });

    socket.on('winnerFirstLine', (data) => {
        // Only the first claim counts: avoids double-awarding the prize
        // if several clients report the line almost simultaneously.
        if (state.winnerFirstLine.line) return;
        state.winnerFirstLine = data;
        upsertRanking(data);
        socket.broadcast.emit('winnerFirstLine', data);
        socketIO.emit('ranking', state.ranking);
    });

    socket.on('winnerBingo', (data) => {
        if (state.winnerBingo.bingo) return;
        state.winnerBingo = data;
        upsertRanking(data);
        socket.broadcast.emit('winnerBingo', data);
        socketIO.emit('ranking', state.ranking);
    });

    socket.on('user', (data) => {
        const { name } = data;
        const completed = computeCompleted(data.card);

        const index = state.userList.findIndex((item) => item.name === name);
        if (index !== -1) {
            state.userList[index] = { ...data, completed };
        } else {
            state.userList.push({ ...data, completed });
        }

        socketUser.set(socket.id, name);
        // Ranking is unchanged here, so we don't re-broadcast it (saves traffic
        // on every cell the player marks).
        socket.broadcast.emit('userList', state.userList);
    });

    socket.on('removeUser', (data) => {
        const { name } = data;
        state.userList = state.userList.filter((item) => item.name !== name);
        socket.broadcast.emit('userList', state.userList);
    });

    socket.on('randomNumbers', (data) => {
        state.randomNumbers = data;
        socket.broadcast.emit('randomNumbers', data);
    });

    // Drop the player from the list when their socket goes away.
    socket.on('disconnect', () => {
        const name = socketUser.get(socket.id);
        if (!name) return;
        socketUser.delete(socket.id);
        // Keep the player if they still have another open socket (e.g. another tab).
        const stillConnected = [...socketUser.values()].includes(name);
        if (stillConnected) return;
        state.userList = state.userList.filter((item) => item.name !== name);
        socket.broadcast.emit('userList', state.userList);
    });
});

app.get('/api/getCard', (_req, res) => {
    const card = createCard();
    res.status(200).json(card);
});

http.listen(PORT, () => {
    console.log(`Server listening on ${PORT}`);
});
