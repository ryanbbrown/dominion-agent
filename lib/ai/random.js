exports.chooseMove = chooseMove;

function chooseMove(dominion, state, moveList, callback) {
    // Too easy for random to trash everything and draw the game out
    filteredMoveList = moveList.filter(m => m.name != 'trash');

    callback(null, filteredMoveList[state.rng.integer(filteredMoveList.length)] || moveList[state.rng.integer(moveList.length)]);
}
