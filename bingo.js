
const ROWS = 3;
const COLS = 5;
const MAX_NUMBER = 50;

const NUMBERS_PER_COL = MAX_NUMBER / COLS;

function createCard() {
    // Pick the numbers for each column from its own range (col 0: 1-10,
    // col 1: 11-20, ...) without repeats, and keep each column sorted ascending.
    const columns = [];
    for (let j = 0; j < COLS; j++) {
        const min = j * NUMBERS_PER_COL + 1;
        const used = new Set();
        const column = [];
        while (column.length < ROWS) {
            const number = min + Math.floor(Math.random() * NUMBERS_PER_COL);
            if (used.has(number)) continue;
            used.add(number);
            column.push(number);
        }
        column.sort((a, b) => a - b);
        columns.push(column);
    }

    // Build the card row by row from the sorted columns.
    const bingoCard = [];
    for (let i = 0; i < ROWS; i++) {
        const row = [];
        for (let j = 0; j < COLS; j++) {
            row.push({ number: columns[j][i], matched: false });
        }
        bingoCard.push(row);
    }

    return bingoCard;
}

module.exports = {
    createCard,
    CELLS_PER_CARD: ROWS * COLS,
};
