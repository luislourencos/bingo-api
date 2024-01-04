
require('dotenv').config();
const socketIo = require('socket.io')
const app = require('express')();
const {createCard} = require('./bingo');
const { env: { PORT, API_URL } } = process

const cors = require('cors');

app.use(cors(
    {
        origin: "*",
        credentials: true
    }
));



app.get('/api/getCard', (_req, res) => {
    const card = createCard();
    res.json(card).status(200);
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
} );
