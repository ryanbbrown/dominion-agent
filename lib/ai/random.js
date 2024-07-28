exports.chooseMove = chooseMove;

function chooseMove(dominion, state, moveList, callback) {
    callback(null, moveList[state.rng.integer(moveList.length)]);
}
