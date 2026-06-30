
const ROWS = 3;
const COLS = 5;
const MAX_NUMBER = 50;

function createCard() {
    const used = new Set();
    const bingoCard = [];

    for (let i = 0; i < ROWS; i++) {
        const row = [];
        for (let j = 0; j < COLS; j++) {
            let number;
            do {
                number = Math.floor(Math.random() * MAX_NUMBER) + 1;
            } while (used.has(number));
            used.add(number);
            row.push({ number, matched: false });
        }
        bingoCard.push(row);
    }

    return bingoCard;
}

module.exports = {
    createCard,
    CELLS_PER_CARD: ROWS * COLS,
};
