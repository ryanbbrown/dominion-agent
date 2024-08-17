exports.chooseMove = chooseMove;

var wantedCards = {
  'Province': 3,
  'Gold': 2,
  'Silver': 1,
};

function chooseMove(dominion, state, moveList, callback) {
  const endActions = moveList.find(move => move.name == 'endActions');
  if (endActions) {
    callback(null, endActions);
    return;
  }

  const playAllTreasure = moveList.find(move => !!(move.params?.allTreasure));
  if (playAllTreasure) {
    callback(null, playAllTreasure);
    return;
  }
  
  var bestPriority = -1;
  var bestMove = moveList[moveList.length - 1];

  for (const move of moveList) {
    var priority = getMovePriority(move);
    if (priority > bestPriority) {
      bestMove = move;
      bestPriority = priority;
    }
  }
  callback(null, bestMove);

  function getMovePriority(move) {
    if (move.name === 'buy') {
      var priority = wantedCards[move.params.card];
      return (priority == null) ? -1 : priority;
    } if (move.name === 'discard') {
      var card = dominion.getCard(move.params.card);
      if (dominion.isCardType(card, 'Curse')) {
        return 2;
      } else if (dominion.isCardType(card, 'Victory')) {
        return 1;
      } else {
        return -card.cost;
      }
    } else {
      return -1;
    }
  }
}

