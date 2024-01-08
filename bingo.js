
function createCard() {
    const arrNumberBingoCart = [0];
    const bingoCard = [
        [],[],[]
    ];
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 5; j++) {
            do {
                var number = Math.floor((Math.random() * 60) + 1);
            } while (arrNumberBingoCart.includes(number));
            arrNumberBingoCart.push(number);
            bingoCard[i][j] = { number, matched: false };
        }
       
    }
    return bingoCard
};

module.exports = {
    createCard: createCard
}
