
require('dotenv').config();
const app = require('express')();
const http = require('http').Server(app);
const cors = require('cors');
const {createCard} = require('./bingo');
const { env: { PORT } } = process

app.use(cors());

const socketIO = require('socket.io')(http, {
    cors: {
        origin: "*",
        credentials: true
    }
});

var userList = [];
var winnerFirstLine = { line: false, user: '' };
var winnerBingo = { bingo: false, user: '' };
var ranking = [];
socketIO.on('connection', (socket) => {

    socket.on('restart', () => {
        userList = [];
        winnerFirstLine = { line: false, user: '' };
        winnerBingo = { bingo: false, user: '' };
        const newUserList = userList.map((item) => {
            return {...item, completed:0, card:createCard()}
        })
        socket.broadcast.emit('winnerFirstLine', { line: false, user: '' });
        socket.broadcast.emit('winnerBingo', { bingo: false, user: '' });
        socket.broadcast.emit('randomNumbers',{numbers:[]});
        socket.broadcast.emit('userList',newUserList);
    });

    socket.on('ranking', (data) => {
        ranking = data;
        socket.broadcast.emit('ranking', data);
    })  
    
    socket.on('resetAll', () => {
        userList = [];
        winnerFirstLine = { line: false, user: '' };
        winnerBingo = { bingo: false, user: '' };
        ranking = [];
        socket.broadcast.emit('winnerFirstLine', { line: false, user: '' });
        socket.broadcast.emit('winnerBingo', { bingo: false, user: '' });
        socket.broadcast.emit('randomNumbers',{numbers:[]});
        socket.broadcast.emit('userList', []);
        socket.broadcast.emit('ranking', []);
    });

    socket.on('winnerFirstLine', (data) => {
        winnerFirstLine = data;
        socket.broadcast.emit('winnerFirstLine', data);
    })

    socket.on('winnerBingo', (data) => {
        winnerBingo = data;
        socket.broadcast.emit('winnerBingo', data);
    })

    socket.on('user', (data) => {
        const {name} = data;
        const index = userList.findIndex((item) => item.name === name);

        const percCard0 = data.card[0]?.filter((item) => item.matched).length;
        const percCard1 = data.card[1]?.filter((item) => item.matched).length;
        const percCard2 = data.card[2]?.filter((item) => item.matched).length;
        const completed = Math.round((percCard0 + percCard1 + percCard2) / 15 * 100);
      
        if (index !== -1) {
            userList[index] = {...data, completed};
        } else {
            userList.push({ ...data, completed});
        }
     
        socket.broadcast.emit('userList', userList);
    });

    socket.on('removeUser', (data) => {
        const { name } = data;
        const newUserList = userList.filter((item) => item.name !== name);

        userList = newUserList;

        socket.broadcast.emit('userList', newUserList);
    });

    socket.on('randomNumbers', (data) => {
        socket.broadcast.emit('randomNumbers', data);
    });
    socket.on('disconnect', () => {
      console.log('A user disconnected');
    });
});


app.get('/api/getCard', (_req, res) => {
    const card = createCard();
    res.json(card).status(200);
});

http.listen(PORT, () => {
    console.log(`Server listening on ${PORT}`);
  });
