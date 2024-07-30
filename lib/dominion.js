var dominion = importAndProcessCards();
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var RNG = require('./rng');
var nextState = 0;
var STATE_INVALID = nextState++;
var STATE_ACTION = nextState++;
var STATE_TREASURE = nextState++;
var STATE_BUY = nextState++;
var STATE_DISCARD_THEN_DRAW = nextState++;
var STATE_GAIN_CARD = nextState++;
var STATE_PUT_CARDS_ON_DECK = nextState++;
var STATE_TRASH = nextState++;
var STATE_REACTION = nextState++;
var STATE_DISCARD_DECK = nextState++;
var STATE_DISCARD_DOWN_TO = nextState++;
var STATE_DISCARD_UNTIL = nextState++;
var STATE_SPY = nextState++;
var STATE_SPY_REVEAL = nextState++;
var STATE_EFFECT = nextState++;
var STATE_BANDIT_REVEAL = nextState++;
var STATE_BANDIT_TRASH = nextState++;
var STATE_THIEF_GAIN = nextState++;
var STATE_PLAY_ACTION_CARD = nextState++;
var STATE_LIBRARY_DRAW = nextState++;
var STATE_LIBRARY_CHOOSE = nextState++;
var STATE_DONE_RESOLVING_ACTION = nextState++;
var STATE_PUT_ON_DECK_FROM_DISCARD = nextState++;
var STATE_TOP_DECK_FROM_DISCARD = nextState++;
var STATE_SENTRY_DISPOSE = nextState++;

var moveTable = {
  'play': doPlayCardMove,
  'buy': doBuyMove,
  'endTurn': doEndTurn,
  'endActions': doEndActions,
  'discard': doDiscardMove,
  'doneDiscarding': doDoneDiscardingMove,
  'donePlayingSentry': doDonePlayingSentry,
  'gain': doGainCardMove,
  'doneGaining': doDoneGainingMove,
  'putOnDeck': doPutCardOnDeckMove,
  'dontPutOnDeck': doNothing,
  'dontPlayCard': doNothing,
  'putOnDeckFrom': doPutOnDeckFromMove,
  'topDeckFrom': doTopDeckFrom,
  'trash': doTrashMove,
  'doneTrashing': doDoneTrashingMove,
  'reaction': doReactionMove,
  'doneReacting': doDoneReactingMove,
  'discardDeck': doDiscardDeckMove,
  'noDiscardDeck': doNotDiscardDeckMove,
  'discardRevealed': doDiscardRevealedMove,
  'putBack': doPutBackMove,
  'keep': doKeepMove,
  'setAside': doSetAsideMove,
};
var effectTable = {
  'plusAction': doPlusAction,
  'plusBuy': doPlusBuy,
  'plusTreasure': doPlusTreasure,
  'plusCard': doPlusCard,
  'discardThenDraw': doDiscardThenDraw,
  'gainCard': doGainCardEffect,
  'attackPutCardsOnDeck': doAttackPutCardsOnDeck,
  'trashThisCard': doTrashThisCardEffect,
  'revealHand': doRevealHandEffect,
  'trashCards': doTrashCardsEffect,
  'revealThisCard': doRevealThisCardEffect,
  'unaffectedByAttack': doUnaffectedByAttackEffect,
  'discardDeck': doDiscardDeckEffect,
  'attackDiscardDownTo': doAttackDiscardDownTo,
  'attackGainCard': doAttackGainCard,
  'otherPlayersDraw': doOtherPlayersDrawEffect,
  'attackSpy': doAttackSpy,
  'revealUntilCard': doRevealUntilCard,
  'putRevealedCardsIntoHand': doPutRevealedCardsIntoHand,
  'discardRevealedCards': doDiscardRevealedCards,
  'attackThief': doAttackThief,
  'playOtherCard': doPlayOtherCard,
  'libraryDraw': doLibraryDraw,
  'putCardsOnDeck': doPutCardsOnDeck,
  'putInTavern': doPutInTavern,
  'putOnDeckFromDiscard': doPutOnDeckFromDiscard,
  'extraCoinFromFirstSilver': doExtraCoinFromFirstSilver,
  'maybeTopDeckAnAction': doMaybeTopDeckAnAction,
  'discardPerEmptySupply': doDiscardPerEmptySupply,
  'attackRevealAndTrashTreasure': doAttackRevealAndTrashTreasure,
  'revealAndTrash': doRevealAndTrash,
};
var ais = {
  'random': require('./ai/random'),
  'naive': require('./ai/naive'),
  'bigmoney': require('./ai/bigmoney'),
  'cli': require('./ai/cli'),

  // Use getters for the AIs to avoid eagerly instantiating their connections
  get 'lmstudioai'() {
    return require('../llmai/dist/lmstudioai');
  },
  get 'llama3.1-8B-instruct-turbo'() {
    return require('../llmai/dist/llama3.1-8B-instruct-turbo');
  },
  get 'llama3.1-70B-instruct-turbo'() {
    return require('../llmai/dist/llama3.1-70B-instruct-turbo');
  },
  get 'llama3.1-405B-instruct-turbo'() {
    return require('../llmai/dist/llama3.1-405B-instruct-turbo');
  },
  get 'gpt-4o'() {
    return require('../llmai/dist/gpt-4o');
  },
  get 'gpt-4o-mini'() {
    return require('../llmai/dist/gpt-4o-mini');
  },
  get 'gpt-4'() {
    return require('../llmai/dist/gpt-4');
  },
  get 'claude-3-5-sonnet'() {
    return require('../llmai/dist/claude-3-5-sonnet');
  }
};

exports.dominion = dominion;
exports.ais = ais;
exports.DominionGame = DominionGame;
exports.playerName = playerName;
exports.moveToString = moveToString;
exports.getCardName = getCardName;
exports.log = log;

util.inherits(DominionGame, EventEmitter);
function DominionGame(players, seed) {
  EventEmitter.call(this);
  this.shuffleAndDeal(players, seed);
}

DominionGame.prototype.doesStateRevealDiscard = function() {
  return this.state == STATE_PUT_ON_DECK_FROM_DISCARD;
}

function moveToString(move) {
  switch (move.name) {
    case 'play':
      if (move.params.allTreasure) return `Play All Treasure Cards`;
      return "Play " + move.params.card;
    case 'buy':
      return `Buy ${move.params.card} for ${move.params.cost} coins`;
    case 'endActions':
      return "Done playing actions";
    case 'endTurn':
      return "End turn";
    case 'discard':
      return "Discard " + move.params.card;
    case 'doneDiscarding':
      return "Done discarding";
    case 'donePlayingSentry':
      return "Discard remaining revealed cards";
    case 'gain':
      return "Gain " + move.params.card;
    case 'doneGaining':
      return "Done gaining cards";
    case 'putOnDeck':
      return `Put ${move.params.card} on deck`;
    case 'dontPutOnDeck':
      return "Don't put on deck";
    case 'dontPlayCard':
      return "Don't play card";
    case 'putOnDeckFrom':
      return `Put ${move.params.card} on top of deck`;
    case 'topDeckFrom':
      return `Play ${move.params.card}`;
    case 'trash':
      return "Trash " + move.params.card;
    case 'doneTrashing':
      return "Done trashing";
    case 'reaction':
      return "Activate " + move.params.card;
    case 'doneReacting':
      return "Done playing reactions";
    case 'discardDeck':
      return "Discard deck";
    case 'noDiscardDeck':
      return "Do not discard deck";
    case 'discardRevealed':
      return "Discard revealed card(s)";
    case 'putBack':
      return "Put revealed card(s) back on deck";
    case 'keep':
      return "Keep";
    case 'setAside':
      return "Set aside";
    default:
      throw new Error("moveToString case missing: " + move.name);
  }
}

DominionGame.prototype.enumerateMoves = function () {
  return enumerateMoves(this);
};

function enumerateMoves(state) {
  var moves = [];
  var player = getCurrentPlayer(state);

  // Sort the cards so the actions are presenting in a predictable order
  player.hand.sort((a, b) => {
    if (b.cost == a.cost) {
      return a.name.localeCompare(b.name);
    }
    return b.cost - a.cost;
  })

  switch (state.state) {
    case STATE_ACTION:
      enumeratePlayMoves('Action');
      addEndActions();
      break;
    case STATE_TREASURE:
      enumeratePlayMoves('Treasure');
      enumerateBuyMoves();
      addEndTurn();
      break;
    case STATE_BUY:
      enumerateBuyMoves();
      addEndTurn();
      break;
    case STATE_DISCARD_THEN_DRAW:
      moves.push({ name: 'doneDiscarding' });
      addDiscardMoves();
      break;
    case STATE_GAIN_CARD:
      addGainCardMoves();
      break;
    case STATE_PUT_CARDS_ON_DECK:
      addPutCardsOnDeckMoves();
      break;
    case STATE_PUT_ON_DECK_FROM_DISCARD:
      moves.push({
        name: 'dontPutOnDeck',
      });
      addPutOnDeckFromMoves(player.discardPile);
      break;
    case STATE_TOP_DECK_FROM_DISCARD:
      
      moves.push({ name: 'dontPlayCard' });
      const card = player.discardPile[player.discardPile.length - 1];
      card && moves.push({
        name: 'topDeckFrom',
        params: {
          card: card.name,
          from: player.discardPile,
        },
      });
      break;
    case STATE_SENTRY_DISPOSE:
      moves.push({ name: 'donePlayingSentry' });
      addTrashMoves(player.revealedCards);
      addPutOnDeckFromMoves(player.revealedCards);
      break;
    case STATE_TRASH:
      addTrashMoves();
      break;
    case STATE_REACTION:
      addReactionMoves();
      break;
    case STATE_DISCARD_DECK:
      addDiscardDeckMoves();
      break;
    case STATE_DISCARD_UNTIL:
    case STATE_DISCARD_DOWN_TO:
      addDiscardMoves();
      break;
    case STATE_SPY:
      addSpyMoves();
      break;
    case STATE_BANDIT_TRASH:
      addBanditTrashMoves();
      break;
    case STATE_THIEF_GAIN:
      addThiefGainMoves();
      break;
    case STATE_PLAY_ACTION_CARD:
      enumeratePlayMoves('Action');
      break;
    case STATE_LIBRARY_CHOOSE:
      moves.push({ name: "keep" });
      moves.push({ name: "setAside" });
      break;
    default:
      throw new Error("invalid state");
  }
  return moves;

  function addThiefGainMoves() {
    moves.push({ name: 'doneGaining' });
    var seenActions = {};
    for (var i = 0; i < state.thiefPile.length; i += 1) {
      var thiefCard = state.thiefPile[i];
      if (seenActions[thiefCard.name]) continue;
      if (isCardInTrash(state, thiefCard)) {
        seenActions[thiefCard.name] = true;
        moves.push({
          name: 'gain',
          params: {
            card: thiefCard.name,
          },
        });
      }
    }
  }

  function addBanditTrashMoves() {
    var victimPlayer = getVictimPlayer(state);
    var trashCandidates = getMatchingRevealedCards(state, victimPlayer, { type: 'Treasure', exclude: ['Copper'] });
    for (var i = 0; i < trashCandidates.length; i += 1) {
      moves.push({
        name: 'trash',
        params: {
          card: trashCandidates[i],
          from: victimPlayer.revealedCards
        }
      });
    }
  }

  function addSpyMoves() {
    moves.push({ name: 'discardRevealed' });
    moves.push({ name: 'putBack' });
  }

  function addDiscardDeckMoves() {
    moves.push({ name: 'discardDeck' });
    moves.push({ name: 'noDiscardDeck' });
  }

  function addReactionMoves() {
    moves.push({ name: 'doneReacting' });
    var reactionCardNames = {};
    for (var i = 0; i < state.playableReactionCards.length; i += 1) {
      var card = state.playableReactionCards[i];
      reactionCardNames[card.name] = true;
    }
    for (var reactionCardName in reactionCardNames) {
      moves.push({
        name: 'reaction',
        params: {
          card: reactionCardName,
        },
      });
    }
  }

  function addTrashMoves(from = player.hand) {
    if (!state.trashMandatory) {
      moves.push({ name: 'doneTrashing' });
    }
    var matchingCardNames = getMatchingCardsInList(state, from, {
      type: state.trashType,
      name: state.trashName,
    });
    for (var i = 0; i < matchingCardNames.length; i += 1) {
      moves.push({
        name: 'trash',
        params: {
          card: matchingCardNames[i],
          from,
        }
      });
    }
  }

  function addPutCardsOnDeckMoves() {
    var matchingCardNames = getMatchingCardsInHand(state, player, {
      type: state.putCardsOnDeckType,
    });
    for (var i = 0; i < matchingCardNames.length; i += 1) {
      var cardName = matchingCardNames[i];
      moves.push({
        name: 'putOnDeck',
        params: {
          card: cardName,
        },
      });
    }
  }

  function addPutOnDeckFromMoves(from = player.hand) {
    const seen = new Set();
    from.forEach(card => {
      if (!seen.has(card.name)) {
        seen.add(card.name);
        moves.push({
          name: 'putOnDeckFrom',
          params: {
            card: card.name,
            from
          },
        });
      }
    });
  }

  function addGainCardMoves() {
    var costingUpTo = state.gainCardCostingUpTo;
    if (state.gainCardCostingUpToMoreThanTrashed != null) {
      if (state.costOfRecentlyTrashedCard === -1) throw new Error("invalid costOfRecentlyTrashedCard");
      costingUpTo = state.costOfRecentlyTrashedCard + state.gainCardCostingUpToMoreThanTrashed;
    }
    var matchingCards = getMatchingCards(state, {
      costingUpTo: costingUpTo,
      costExact: state.gainCardCostExact,
      name: state.gainCardName,
      type: state.gainCardType,
      countGreaterEqual: 1,
    });
    for (var i = 0; i < matchingCards.length; i += 1) {
      var gameCard = matchingCards[i];
      moves.push({
        name: 'gain',
        params: {
          card: gameCard.card.name,
        },
      });
    }
  }

  function addEndActions() {
    moves.push({ name: 'endActions' });
  }

  function addEndTurn() {
    moves.push({ name: 'endTurn' });
  }

  function addDiscardMoves(from = player.hand) {
    var seenActions = {};
    for (var i = 0; i < from.length; i += 1) {
      var card = from[i];
      if (seenActions[card.name]) continue;
      seenActions[card.name] = true;
      moves.push({
        name: 'discard',
        params: {
          card: card.name,
          from
        }
      });
    }
  }

  function enumeratePlayMoves(typeName) {
    var seenActions = {};
    if (typeName == 'Treasure' && player.hand.find(c => isCardType(c, 'Treasure'))) {
      moves.push({
        name: 'play',
        params: {
          allTreasure: true,
        }
      });
    }
    for (var i = 0; i < player.hand.length; i += 1) {
      var card = player.hand[i];
      if (isCardType(card, typeName)) {
        if (seenActions[card.name]) continue;
        seenActions[card.name] = true;
        moves.push({
          name: 'play',
          params: {
            card: card.name,
          },
        });
      }
    }
  }

  function enumerateBuyMoves() {
    for (var i = 0; i < state.cardList.length; i += 1) {
      var gameCard = state.cardList[i];
      if (gameCard.count > 0 && state.treasureCount >= gameCard.card.cost) {
        moves.push({
          name: 'buy',
          params: {
            card: gameCard.card.name,
            cost: gameCard.card.cost,
          },
        });
      }
    }
  }
}

function doPlayCardMove(state, params) {
  if (state.state !== STATE_ACTION &&
    state.state !== STATE_TREASURE &&
    state.state !== STATE_PLAY_ACTION_CARD) {
    throw new Error("invalid state for playing a card");
  }

  if (params.allTreasure) {
    const player = getCurrentPlayer(state);
    while (true) {
      const treasure = player.hand.find(card => !!card.treasure);
      if (treasure) {
        performMove(state, {
          name: 'play',
          params: {
            card: treasure.name,
          },
        });
      } else {
        return;
      }
    }
  }

  var card = dominion.cardTable[params.card];
  var player = getCurrentPlayer(state);

  if (state.state !== STATE_PLAY_ACTION_CARD) {
    if (state.actionCount < 1 && isCardType(card, 'Action')) {
      throw new Error("not enough actions to play a card");
    }

    if (card.treasure) {
      if (card.name == "Silver") {
        if (state.extraCoinFromFirstSilver > 0) {
          state.treasureCount += state.extraCoinFromFirstSilver;
        }
        state.extraCoinFromFirstSilver = -1;
      }
      state.treasureCount += card.treasure;
      if (state.state === STATE_ACTION) {
        popState(state);
      }
    }
    if (isCardType(card, 'Action')) {
      state.actionCount -= 1;
    }
  }
  state.effectDone = true;

  if (isCardType(card, 'Action')) {
    pushState(state, STATE_DONE_RESOLVING_ACTION);
    state.effectDone = false;
  }

  player.inPlay.push(removeCardFromHand(player, card.name));
  var amount = state.playActionCardAmount || 1;
  for (var i = 0; i < amount; i += 1) {
    doEffects(state, player, card, player.inPlay, card.effects);
  }
  checkActionsOver(state);
}

function doEffects(state, player, card, cardLocationList, effectsList) {
  if (!effectsList)
    return;
  // since we're using a stack based solution we need to do the effects in reverse order
  for (var i = effectsList.length - 1; i >= 0; i -= 1) {
    var effect = effectsList[i];
    putEffectOnStack(state, player, card, player.inPlay, effect);
  }
}

function putEffectOnStack(state, player, card, cardLocationList, effect) {
  var fn = effectTable[effect.name];
  if (!fn) throw new Error("unrecognized effect: " + effect.name);
  pushState(state, STATE_EFFECT);
  state.effectDone = false;
  state.effectFn = fn;
  state.effectPlayer = player;
  state.effectCard = card;
  state.effectCardLocationList = cardLocationList;
  state.effectParams = effect.params;
}

function handleNextPutCardsOnDeck(state) {
  var player = getCurrentPlayer(state);
  var matchingCardNames = getMatchingCardsInHand(state, player, {
    type: state.putCardsOnDeckType,
  });
  if (matchingCardNames.length === 0 && state.putCardsOnDeckCount > 0) {
    state.putCardsOnDeckCount = 0;
    var elseClause = state.putCardsOnDeckElse;
    if (elseClause) {
      putEffectOnStack(state, player, null, null, elseClause);
      checkActionsOver(state);
    } else {
      popState(state);
    }
  } else if (matchingCardNames.length === 1 && state.putCardsOnDeckCount > 0) {
    doPutCardOnDeckMove(state, { card: matchingCardNames[0] });
    return;
  } else if (state.putCardsOnDeckCount === 0) {
    popState(state);
  }
}

function checkActionsOver(state) {
  if (state.gameOver) return;

  var player = getCurrentPlayer(state);
  var matchingCards;
  var prevStackFrame, victimPlayer;
  if (state.isAttack && state.unaffectedByAttack) {
    popState(state);
    return;
  }

  if (state.state === STATE_DONE_RESOLVING_ACTION) {
    if (state.effectDone) {
      popState(state);
    } else {
      state.effectDone = true;
      triggerCondition(state, player, 'afterResolvingAction');
    }
    checkActionsOver(state);
    return;
  }
  if (state.state === STATE_SPY_REVEAL) {
    victimPlayer = getVictimPlayer(state);
    playerRevealCards(state, victimPlayer, 1);
    state.state = STATE_SPY;
    return;
  }
  if (state.state === STATE_EFFECT) {
    if (state.effectDone) {
      if (state.effectFn === doTrashCardsEffect) {
        prevStackFrame = state.stateStack[state.stateStack.length - 1];
        prevStackFrame.costOfRecentlyTrashedCard = state.costOfRecentlyTrashedCard;
      }
      popState(state);
      return;
    }
    state.effectDone = true;
    state.effectFn(state, state.effectPlayer, state.effectCard, state.effectCardLocationList, state.effectParams);
    checkActionsOver(state);
    return;
  }

  if (state.state == STATE_DISCARD_UNTIL) {
    if (player.hand.length == 0 || state.cardsToDiscard == 0) {
      popState(state);
      return;
    }
  }

  if (state.state == STATE_SENTRY_DISPOSE && player.revealedCards.length == 0) {
    popState(state);
    return;
  }

  if (state.state === STATE_LIBRARY_DRAW) {
    var prevHandSize = player.hand.length;
    if (prevHandSize >= 7) {
      discardRevealedCards(state, player);
      popState(state);
      return;
    }
    playerDraw(state, player, 1);
    if (player.hand.length !== prevHandSize + 1) {
      discardRevealedCards(state, player);
      popState(state);
      return;
    }
    var drawnCard = player.hand[player.hand.length - 1];
    if (isCardType(drawnCard, 'Action')) {
      pushState(state, STATE_LIBRARY_CHOOSE);
      return;
    }
    checkActionsOver(state);
    return;
  }
  if (state.state === STATE_PLAY_ACTION_CARD) {
    if (state.effectDone) {
      popState(state);
      return;
    }
    matchingCards = getMatchingCardsInHand(state, player, { type: 'Action' });
    if (matchingCards.length === 0) {
      popState(state);
    }
    return;
  }
  if (state.state === STATE_BANDIT_REVEAL) {
    victimPlayer = getVictimPlayer(state);
    playerRevealCards(state, victimPlayer, 2);
    var trashCandidates = getMatchingRevealedCards(state, victimPlayer, { type: 'Treasure', exclude: ['Copper'] });
    if (trashCandidates.length === 0) {
      discardRevealedCards(state, victimPlayer);
      popState(state);
      return;
    }
    state.waitingOnPlayerIndex = state.victimPlayerIndex;
    state.state = STATE_BANDIT_TRASH;
    return;
  }
  if (state.state === STATE_GAIN_CARD) {
    var costingUpTo = state.gainCardCostingUpTo;
    if (state.gainCardCostingUpToMoreThanTrashed != null) {
      if (state.costOfRecentlyTrashedCard === -1) {
        popState(state);
        return;
      }
      costingUpTo = state.costOfRecentlyTrashedCard + state.gainCardCostingUpToMoreThanTrashed;
    }
    matchingCards = getMatchingCards(state, {
      costingUpTo: costingUpTo,
      costExact: state.gainCardCostExact,
      name: state.gainCardName,
      type: state.gainCardType,
      countGreaterEqual: 1,
    });
    if (matchingCards.length === 0) {
      popState(state);
      return;
    }
  }
  if (state.state === STATE_TRASH) {
    var doneWithState = false;
    if (state.trashActionsLeft === 0) {
      doneWithState = true;
    } else {
      matchingCards = getMatchingCardsInHand(state, player, {
        type: state.trashType,
        name: state.trashName,
      });
      if (matchingCards.length === 0) {
        doneWithState = true;
      }
    }
    if (doneWithState) {
      prevStackFrame = state.stateStack[state.stateStack.length - 1];
      prevStackFrame.costOfRecentlyTrashedCard = state.costOfRecentlyTrashedCard;
      popState(state);
      return;
    }
  }
  if (state.state === STATE_PUT_CARDS_ON_DECK) {
    handleNextPutCardsOnDeck(state);
    return;
  }
  if (state.state === STATE_ACTION) {
    if (state.actionCount < 0) throw new Error("invalid action count");
    if (state.actionCount === 0) {
      popState(state);
      checkActionsOver(state);
    }
    return;
  }
  if (state.state === STATE_TREASURE && playerHandTreasureCardCount(state, player) === 0) {
    popState(state);
    checkActionsOver(state);
    return;
  }
  if (state.state === STATE_INVALID) {
    throw new Error("invalid state");
  }
}

function playerHandTreasureCardCount(state, player) {
  var count = 0;
  for (var i = 0; i < player.hand.length; i += 1) {
    var card = player.hand[i];
    if (isCardType(card, 'Treasure')) {
      count += 1;
    }
  }
  return count;
}

function removeExactCardFromList(list, card) {
  var index = list.indexOf(card);
  if (index < 0) throw new Error("card not found in list");
  list.splice(index, 1);
}

function removeCardFromList(list, cardName) {
  var index = findCardInList(list, cardName);
  var card = list[index];
  list.splice(index, 1);
  return card;
}

function removeCardFromInPlay(player, cardName) {
  return removeCardFromList(player.inPlay, cardName);
}

function removeCardFromHand(player, cardName) {
  return removeCardFromList(player.hand, cardName);
}

function removeCardFromRevealed(player, cardName) {
  return removeCardFromList(player.revealedCards, cardName);
}

function findCardInList(list, cardName) {
  for (var i = 0; i < list.length; i += 1) {
    if (list[i].name === cardName) {
      return i;
    }
  }
  throw new Error("card not found: " + cardName);
}

function doBuyMove(state, params) {
  if (state.state === STATE_ACTION) {
    popState(state);
  }
  if (state.state === STATE_TREASURE) {
    popState(state);
  }
  var gameCard = state.cardTable[params.card];
  var player = getCurrentPlayer(state);
  playerGainCard(state, player, gameCard, false, false);
  state.buyCount -= 1;
  state.treasureCount -= gameCard.card.cost;
  if (state.buyCount < 0) throw new Error("invalid buy count");
  if (state.state === STATE_BUY && state.buyCount === 0) {
    endTurn(state, player);
  }
}

function doEndActions(state, params) {
  popState(state);
}

function doEndTurn(state, params) {
  var player = getCurrentPlayer(state);
  endTurn(state, player);
}

function doDiscardMove(state, params) {
  var player = getCurrentPlayer(state);
  switch (state.state) {
    case STATE_DISCARD_THEN_DRAW:
      state.discardCount += 1;
      playerDiscardCardName(state, player, params.card, params.from);
      break;
    case STATE_DISCARD_DOWN_TO:
      playerDiscardCardName(state, player, params.card, params.from);
      if (params.from.length <= state.discardDownTo) {
        popState(state);
      }
      break;
    case STATE_DISCARD_UNTIL:
      state.cardsToDiscard--;
      playerDiscardCardName(state, player, params.card, params.from);
      break;
    default:
      playerDiscardCardName(state, player, params.card, params.from);
  }
}

function doDoneDiscardingMove(state, params) {
  var player = getCurrentPlayer(state);
  playerDraw(state, player, state.discardCount);
  popState(state);
}

function doDoneGainingMove(state, params) {
  switch (state.state) {
    case STATE_THIEF_GAIN:
      state.thiefPile = state.thiefPiles.pop();
      popState(state);
      return;
    default:
      throw new Error("unexpected state: " + state);
  }
}

function doGainCardMove(state, params) {
  var player = getCurrentPlayer(state);
  switch (state.state) {
    case STATE_GAIN_CARD:
      var gameCard = state.cardTable[params.card];
      playerGainCard(state, player, gameCard, state.gainCardOnTopOfDeck, state.gainCardIntoHand);
      popState(state);
      return;
    case STATE_THIEF_GAIN:
      var card = removeCardFromList(state.thiefPile, params.card);
      removeExactCardFromList(state.trash, card);
      player.discardPile.push(card);
      break;
    default:
      throw new Error("unexpected state: " + state);
  }
}

function doPutCardOnDeckMove(state, params) {
  var player = getCurrentPlayer(state);
  switch (state.state) {
    case STATE_PUT_CARDS_ON_DECK:
      state.emit('putOnDeck', player, params.card);
      player.deck.push(removeCardFromHand(player, params.card));
      state.putCardsOnDeckCount -= 1;
      if (state.putCardsOnDeckCount < 0) throw new Error("invalid putCardsOnDeckCount");
      handleNextPutCardsOnDeck(state);
      break;
    default:
      throw new Error("unexpected state: " + state);
  }
}

function doTrashMove(state, params) {
  var card;
  if (state.state === STATE_BANDIT_TRASH) {
    var victimPlayer = getVictimPlayer(state);
    card = removeCardFromRevealed(victimPlayer, params.card);
    state.trash.push(card);
    discardRevealedCards(state, victimPlayer);
    popState(state);
  } else {
    card = removeCardFromList(params.from, params.card);
    state.costOfRecentlyTrashedCard = card.cost;
    state.trashActionsLeft -= 1;
    state.trash.push(card);
  }
}

function doDoneTrashingMove(state, params) {
  popState(state);
}

function doReactionMove(state, params) {
  var player = getCurrentPlayer(state);
  var card = removeCardFromList(state.playableReactionCards, params.card);
  var cardLocationList, effects;
  if (card.condition && card.tavernCondition) {
    throw new Error("game engine weakness: can't handle both condition and tavernCondition");
  } else if (card.condition) {
    cardLocationList = player.hand;
    effects = card.condition.effects;
  } else if (card.tavernCondition) {
    cardLocationList = player.tavern;
    effects = card.tavernCondition.effects;
  } else {
    throw new Error("reaction happened with no condition");
  }
  doEffects(state, player, card, cardLocationList, effects);
  if (card.tavernCondition) {
    // call the reserve card
    player.inPlay.push(removeCardFromList(player.tavern, card.name));
  }
  checkActionsOver(state);
}

function doDoneReactingMove(state, params) {
  popState(state);
}

function doNothing(state, params) {
  popState(state);
}

function doDiscardDeckMove(state, params) {
  var player = getCurrentPlayer(state);
  while (player.deck.length > 0) {
    player.discardPile.push(player.deck.pop());
  }
  popState(state);
}

function doNotDiscardDeckMove(state, params) {
  popState(state);
}

function doDiscardRevealedMove(state, params) {
  var player = getVictimPlayer(state);
  while (player.revealedCards.length > 0) {
    player.discardPile.push(player.revealedCards.pop());
  }
  popState(state);
}

function doPutBackMove(state, params) {
  var player = getVictimPlayer(state);
  while (player.revealedCards.length > 0) {
    player.deck.push(player.revealedCards.pop());
  }
  popState(state);
}

function doPutOnDeckFromMove(state, params) {
  const player = getCurrentPlayer(state);
  player.deck.push(removeCardFromList(params.from, params.card));

  if (state.state == STATE_PUT_ON_DECK_FROM_DISCARD) {
    popState(state);
  }
}

function doTopDeckFrom(state, params) {
  const player = getCurrentPlayer(state);
  const card = player.discardPile.pop();
  if (card.name != params.card) {
    throw new Error(`top deck'd an unintentional card!`);
  }
  player.hand.push(card);
  onlyPopState(state);
  pushState(state, STATE_PLAY_ACTION_CARD);
  state.playActionCardAmount = 1;
  state.effectDone = false;
  doPlayCardMove(state, params);
}

function doKeepMove(state, params) {
  popState(state);
}

function doSetAsideMove(state, params) {
  var player = getCurrentPlayer(state);
  player.revealedCards.push(player.hand.pop());
  popState(state);
}

function playerDiscardCardName(state, player, cardName, from) {
  player.discardPile.push(removeCardFromList(from, cardName));
}

function getNumberOfEmptySupplyPiles(state) {
  return state.cardList.reduce((a, c) => a + (c.count === 0 ? 1 : 0), 0)
}

function checkEndOfGame(state) {
  var pilesEmpty = 0;
  var provinceGone = false;
  var i;
  for (i = 0; i < state.cardList.length; i += 1) {
    var gameCard = state.cardList[i];
    if (gameCard.count === 0) {
      pilesEmpty += 1;
      if (gameCard.card.name === 'Province') {
        provinceGone = true;
      }
    }
  }
  if (pilesEmpty < 3 && !provinceGone) {
    return;
  }

  var player;
  for (i = 0; i < state.players.length; i += 1) {
    player = state.players[i];
    player.vp = calcVictoryPoints(state, player);
    player.turnCount = state.roundIndex + 1;
    if (state.currentPlayerIndex < player.index) player.turnCount -= 1;
  }
  state.rankedPlayers = state.players.concat([]);
  state.rankedPlayers.sort(compareVpThenTurns);
  var nextRank = 1;
  var prev = null;
  for (i = 0; i < state.rankedPlayers.length; i += 1) {
    player = state.rankedPlayers[i];
    if (prev) {
      if (compareVpThenTurns(player, prev) !== 0) {
        nextRank += 1;
      }
    }
    player.rank = nextRank;
    prev = player;
  }
  state.gameOver = true;
  state.emit('gameOver', state.rankedPlayers);

  function compareVpThenTurns(a, b) {
    var cmp = compare(b.vp, a.vp);
    return (cmp === 0) ? compare(a.turnCount, b.turnCount) : cmp;
  }
}

function endTurn(state, player) {
  playerCleanUpHand(state, player);
  playerDraw(state, player, 5);

  checkEndOfGame(state);
  if (state.gameOver) return;

  resetStack(state);
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  state.turnIndex += 1;
  if (state.currentPlayerIndex === 0) state.roundIndex += 1;
  addTurnState(state);

  if(state.roundIndex > 100) {
    throw new Error(`Game exceeded 100 rounds!`);
  }
}

function addTurnState(state) {
  const player = state.getCurrentPlayer();
  state.appendLog?.(`${playerName(player)}'s Turn`);

  pushState(state, STATE_BUY);
  pushState(state, STATE_TREASURE);
  pushState(state, STATE_ACTION);

  state.actionCount = 1;
  state.buyCount = 1;
  state.treasureCount = 0;
}

function playerCleanUpHand(state, player) {
  while (player.inPlay.length > 0) {
    player.discardPile.push(player.inPlay.pop());
  }
  while (player.hand.length > 0) {
    player.discardPile.push(player.hand.pop());
  }
}

function playerMoveFromDeck(state, player, count, destList) {
  for (var i = 0; i < count; i += 1) {
    if (player.deck.length === 0) {
      if (player.discardPile.length === 0) return;
      while (player.discardPile.length > 0) {
        player.deck.push(player.discardPile.pop());
      }
      state.rng.shuffle(player.deck);
      log(state, 'shuffle', {
        player: player.index,
        deck: serializeDeck(player.deck),
      });
    }
    destList.push(player.deck.pop());
  }
}

function playerRevealCards(state, player, count) {
  playerMoveFromDeck(state, player, count, player.revealedCards);
  var slice = player.revealedCards.slice(player.revealedCards.length - count);
  state.emit('revealCardsFromDeck', player, slice);
}

function playerDraw(state, player, count) {
  state.emit('draw', player, count);
  playerMoveFromDeck(state, player, count, player.hand);
}

function playerGainCard(state, player, gameCard, topOfDeck, intoHand) {
  state.emit('gainCard', player, gameCard.card.name, topOfDeck, intoHand);
  if (!gameCard) throw new Error("invalid card name");
  gameCard.count -= 1;
  if (gameCard.count < 0) throw new Error("invalid game card count");
  if (topOfDeck) {
    player.deck.push(gameCard.card);
  } else if (intoHand) {
    player.hand.push(gameCard.card);
  } else {
    player.discardPile.push(gameCard.card);
  }
}

DominionGame.prototype.performMove = function (move) {
  return performMove(this, move);
};

function performMove(state, move) {
  var fn = moveTable[move.name];
  if (!fn) throw new Error("illegal move");
  if (!move.params?.allTreasure) {
    log(state, 'move', {
      player: getCurrentPlayerIndex(state),
      move: move,
    });
  }
  fn(state, move.params);
  checkActionsOver(state);
}

DominionGame.prototype.shuffleAndDeal = function (playerAiList, seed) {
  var rng = new RNG(seed);
  var i;
  var players = [];
  for (i = 0; i < playerAiList.length; i += 1) {
    players.push(createPlayerState(i, playerAiList[i]));
  }
  this.gameOver = false;
  this.currentPlayerIndex = 0;
  this.turnIndex = 0;
  this.roundIndex = 0;
  this.seed = seed;
  this.rng = rng;
  this.cardList = [];
  this.cardTable = {};
  this.trash = [];
  this.players = players;
  this.thiefPile = null;
  this.thiefPiles = [];
  // state items
  resetStack(this);
  addTurnState(this);

  var listOfCardsPerSet = {};
  var list, card;
  for (i = 0; i < dominion.cardList.length; i += 1) {
    card = dominion.cardList[i];
    if (!card.set) continue;
    list = listOfCardsPerSet[card.set.name] || (listOfCardsPerSet[card.set.name] = []);
    list.push(card);
  }

  var prosperityKingdomCardCount = 0;

  var kingdomCards = [];
  while (kingdomCards.length < 10) {
    var setIndex = 0;//rng.integer(dominion.setList.length);
    var set = dominion.setList[setIndex];
    list = listOfCardsPerSet[set.name];
    if (list.length > 0) {
      var listIndex = rng.integer(list.length);
      card = list[listIndex];
      if (card.set === 'Prosperity') {
        prosperityKingdomCardCount += 1;
      }
      list.splice(listIndex, 1);
      kingdomCards.push(card);
    }
  }

  var prosperityOn = (rng.real() < prosperityKingdomCardCount / 10);

  for (i = 0; i < dominion.cardList.length; i += 1) {
    card = dominion.cardList[i];
    if (Array.isArray(card.includeCondition) && kingdomCards.find(_ => card.includeCondition.includes(_.name))) {
      addCard(this, card);
    }
    if (card.includeCondition === 'always' ||
      (card.includeCondition === 'prosperity' && prosperityOn)) {
      addCard(this, card);
    }
  }


  for (i = 0; i < kingdomCards.length; i += 1) {
    addCard(this, kingdomCards[i]);
  }

  this.cardList.sort(compareCostThenName);

  this.initialState = {
    cardTable: cloneCardTable(this.cardTable),
    players: getInitialStatePlayers(this.players),
  };
  this.log = [];

  function getInitialStatePlayers(players) {
    var result = [];
    for (var i = 0; i < players.length; i += 1) {
      var player = players[i];
      result.push({
        deck: player.deck.concat(player.hand),
      });
    }
    return result;
  }

  function cloneCardTable(cardTable) {
    var result = {};
    for (var cardName in cardTable) {
      result[cardName] = {
        card: cardTable[cardName].card,
        count: cardTable[cardName].count,
      };
    }
    return result;
  }

  function addCard(state, card) {
    var gameCard = {
      card: card,
      count: card.supply[playerAiList.length],
    };
    state.cardTable[card.name] = gameCard;
    state.cardList.push(gameCard);
  }

  function createPlayerState(playerIndex, ai) {
    var estateCard = getCard('Estate');
    var copperCard = getCard('Copper');
    var deck = [];
    var hand = [];
    var i;
    for (i = 0; i < 7; i += 1) {
      deck.push(copperCard);
    }
    for (; i < 10; i += 1) {
      deck.push(estateCard);
    }
    // deck.push(getCard('Harbinger'));
    // deck.push(getCard('Merchant'));
    // deck.push(getCard('Silver'));
    // deck.push(getCard('Vassal'));
    // deck.push(getCard('Poacher'));
    // deck.push(getCard('Bandit'));
    // deck.push(getCard('Moat'));
    // deck.push(getCard('Sentry'));
    // deck.push(getCard('Artisan'));
    
    rng.shuffle(deck);
    for (i = 0; i < 5; i += 1) {
      hand.push(deck.pop());
    }
    return {
      ai: ai,
      index: playerIndex,
      deck: deck,
      hand: hand,
      discardPile: [],
      inPlay: [],
      revealedCards: [],
      tavern: [],
    };
  }
}

function resetStack(state) {
  state.stateStack = [];
  state.state = STATE_INVALID;
  state.effectDone = false;
  state.effectFn = null;
  state.effectPlayer = null;
  state.effectCard = null;
  state.effectCardLocationList = null;
  state.effectParams = null;
  state.discardCount = 0;
  state.gainCardOnTopOfDeck = false;
  state.gainCardCostingUpTo = 0;
  state.gainCardCostingUpToMoreThanTrashed = null;
  state.gainCardIntoHand = false;
  state.gainCardType = null;
  state.gainCardName = null;
  state.gainCardCostExact = null;
  state.putCardsOnDeckType = null;
  state.putCardsOnDeckCount = -1;
  state.putCardsOnDeckElse = null;
  state.waitingOnPlayerIndex = -1;
  state.trashActionsLeft = 0;
  state.trashMandatory = false;
  state.trashType = null;
  state.trashName = null;
  state.costOfRecentlyTrashedCard = -1;
  state.isAttack = false;
  state.unaffectedByAttack = false;
  state.playableReactionCards = [];
  state.victimPlayerIndex = -1;
  state.revealUntilCardCount = -1;
  state.revealUntilCardType = -1;
  state.playActionCardAmount = 0;
  state.extraCoinFromFirstSilver = 0;
}

function pushState(state, newStateIndex) {
  state.stateStack.push({
    state: state.state,
    effectDone: state.effectDone,
    effectFn: state.effectFn,
    effectPlayer: state.effectPlayer,
    effectCard: state.effectCard,
    effectCardLocationList: state.effectCardLocationList,
    effectParams: state.effectParams,
    discardCount: state.discardCount,
    gainCardOnTopOfDeck: state.gainCardOnTopOfDeck,
    gainCardIntoHand: state.gainCardIntoHand,
    gainCardCostingUpTo: state.gainCardCostingUpTo,
    gainCardCostingUpToMoreThanTrashed: state.gainCardCostingUpToMoreThanTrashed,
    gainCardType: state.gainCardType,
    gainCardName: state.gainCardName,
    gainCardCostExact: state.gainCardCostExact,
    putCardsOnDeckType: state.putCardsOnDeckType,
    putCardsOnDeckCount: state.putCardsOnDeckCount,
    putCardsOnDeckElse: state.putCardsOnDeckElse,
    waitingOnPlayerIndex: state.waitingOnPlayerIndex,
    trashActionsLeft: state.trashActionsLeft,
    trashMandatory: state.trashMandatory,
    trashType: state.trashType,
    trashName: state.trashName,
    costOfRecentlyTrashedCard: state.costOfRecentlyTrashedCard,
    isAttack: state.isAttack,
    unaffectedByAttack: state.unaffectedByAttack,
    playableReactionCards: state.playableReactionCards.concat([]),
    victimPlayerIndex: state.victimPlayerIndex,
    revealUntilCardCount: state.revealUntilCardCount,
    revealUntilCardType: state.revealUntilCardType,
    playActionCardAmount: state.playActionCardAmount,
  });
  state.state = newStateIndex;
  state.isAttack = false;
}

function onlyPopState(state) {
  if (state.stateStack.length <= 0) throw new Error("state stack empty");
  var o = state.stateStack.pop();
  state.state = o.state;
  state.effectDone = o.effectDone;
  state.effectFn = o.effectFn;
  state.effectPlayer = o.effectPlayer;
  state.effectCard = o.effectCard;
  state.effectCardLocationList = o.effectCardLocationList;
  state.effectParams = o.effectParams;
  state.discardCount = o.discardCount;
  state.gainCardOnTopOfDeck = o.gainCardOnTopOfDeck;
  state.gainCardIntoHand = o.gainCardIntoHand;
  state.gainCardCostingUpTo = o.gainCardCostingUpTo;
  state.gainCardCostingUpToMoreThanTrashed = o.gainCardCostingUpToMoreThanTrashed;
  state.gainCardName = o.gainCardName;
  state.gainCardType = o.gainCardType;
  state.gainCardCostExact = o.gainCardCostExact;
  state.putCardsOnDeckType = o.putCardsOnDeckType;
  state.putCardsOnDeckCount = o.putCardsOnDeckCount;
  state.putCardsOnDeckElse = o.putCardsOnDeckElse;
  state.waitingOnPlayerIndex = o.waitingOnPlayerIndex;
  state.trashActionsLeft = o.trashActionsLeft;
  state.trashMandatory = o.trashMandatory;
  state.trashType = o.trashType;
  state.trashName = o.trashName;
  state.costOfRecentlyTrashedCard = o.costOfRecentlyTrashedCard;
  state.isAttack = o.isAttack;
  state.unaffectedByAttack = o.unaffectedByAttack;
  state.playableReactionCards = o.playableReactionCards;
  state.victimPlayerIndex = o.victimPlayerIndex;
  state.revealUntilCardCount = o.revealUntilCardCount;
  state.revealUntilCardType = o.revealUntilCardType;
  state.playActionCardAmount = o.playActionCardAmount;
}

function popState(state) {
  onlyPopState(state);
  checkActionsOver(state);
}

DominionGame.prototype.getCurrentPlayer = function () {
  return getCurrentPlayer(this);
};

function getCurrentPlayerIndex(state) {
  return (state.waitingOnPlayerIndex === -1) ? state.currentPlayerIndex : state.waitingOnPlayerIndex;
}

function getCurrentPlayer(state) {
  var index = getCurrentPlayerIndex(state);
  var player = state.players[index];
  if (!player) throw new Error("invalid player");
  return player;
}

function getVictimPlayer(state) {
  if (state.victimPlayerIndex < 0) {
    throw new Error("expected victimPlayerIndex to be >= 0");
  }
  var player = state.players[state.victimPlayerIndex];
  if (!player) throw new Error("invalid player");
  return player;
}

DominionGame.prototype.playerCardCount = function (player) {
  return playerCardCount(this, player);
};

function playerCardCount(state, player) {
  return player.hand.length +
    player.inPlay.length +
    player.deck.length +
    player.discardPile.length +
    player.tavern.length +
    player.revealedCards.length;
}

function iterateAllPlayerCards(player, onCard) {
  player.deck.forEach(onCard);
  player.discardPile.forEach(onCard);
  player.hand.forEach(onCard);
  player.inPlay.forEach(onCard);
  player.tavern.forEach(onCard);
  player.revealedCards.forEach(onCard);
}

DominionGame.prototype.calcVictoryPoints = function (player) {
  return calcVictoryPoints(this, player);
};

function calcVictoryPoints(state, player) {
  var vp = 0;
  var cardCount = playerCardCount(state, player);
  iterateAllPlayerCards(player, onCard);
  return vp;
  function onCard(card) {
    if (!card.victory) return;
    for (var i = 0; i < card.victory.length; i += 1) {
      var victoryObj = card.victory[i];
      if (victoryObj.type === 'constant') {
        vp += victoryObj.params.value;
      } else if (victoryObj.type === 'perCardInDeck') {
        vp += victoryObj.params.multiplier * Math.floor(cardCount / victoryObj.params.divisor);
      } else {
        throw new Error("invalid victory type: " + victoryObj.type);
      }
    }
  }
}

DominionGame.prototype.stateIndexToString = function () {
  return stateIndexToString(this);
};

function stateIndexToString(state) {
  switch (state.state) {
    case STATE_ACTION:
      return "play an action";
    case STATE_TREASURE:
      return "play a treasure or buy a card";
    case STATE_BUY:
      return "buy a card";
    case STATE_DISCARD_THEN_DRAW:
      return "discard cards before drawing";
    case STATE_GAIN_CARD:
      return "gain a card";
    case STATE_PUT_CARDS_ON_DECK:
      return "put on deck a card";
    case STATE_TRASH:
      return "trash a card";
    case STATE_REACTION:
      return "play a reaction";
    case STATE_DISCARD_DECK:
      return "choose whether to discard deck";
    case STATE_DISCARD_UNTIL:
      return "discard a card";
    case STATE_DISCARD_DOWN_TO:
      return "discard down to " + state.discardDownTo + " cards";
    case STATE_SPY:
      return "choose whether to discard or return revealed card";
    case STATE_BANDIT_TRASH:
      return "trash a revealed treasure";
    case STATE_THIEF_GAIN:
      return "choose which stolen cards to gain";
    case STATE_PLAY_ACTION_CARD:
      return "choose an action card to play";
    case STATE_LIBRARY_DRAW:
      return "draw until 7 cards in hand";
    case STATE_LIBRARY_CHOOSE:
      return "choose whether to keep or set aside drawn card";
    case STATE_PUT_ON_DECK_FROM_DISCARD:
      return "look through your discard pile, you may put a card from it onto your deck.";
    case STATE_TOP_DECK_FROM_DISCARD:
      return "choose to play the discarded card";
    case STATE_SENTRY_DISPOSE:
      return "choose cards to trash, put on deck, or discard";
    default:
      throw new Error("missing stateIndexToString for " + state.state);
  }
}

function playerName(player) {
  return "Player " + (player.index + 1);
}

function getCardName(card) {
  return card.name;
}

function importAndProcessCards() {
  var data = {
    setTable: {},
    setList: [],
    cardTable: {},
    cardList: [],
    isCardType: isCardType,
    moveToString: moveToString,
    getCard: getCard,
  };
  var cardsJson = require('./cards');

  for (var cardName in cardsJson.cards) {
    var card = cardsJson.cards[cardName];
    card.name = cardName;
    data.cardTable[cardName] = card;
    data.cardList.push(card);

    var setName = card.set;
    if (!setName) continue;
    var set;
    if (data.setTable[setName]) {
      set = data.setTable[setName];
    } else {
      set = {
        name: setName,
        cardTable: {},
        cardList: [],
      };
      data.setList.push(set);
      data.setTable[setName] = set;
    }
    set.cardTable[cardName] = card;
    set.cardList.push(card);
    card.set = set;
  }

  return data;
}

function compareCostThenName(a, b) {
  var cmp = compare(a.card.cost, b.card.cost);
  return (cmp === 0) ? compare(a.card.name, b.card.name) : cmp;
}

function compare(a, b) {
  if (a === b) {
    return 0;
  } else if (a < b) {
    return -1;
  } else {
    return 1;
  }
}

function getCard(name) {
  var card = dominion.cardTable[name];
  if (!card) throw new Error("card not found: " + name);
  return card;
}

function isCardType(card, typeName) {
  return !!card.type[typeName];
}

function doDiscardThenDraw(state, player, card, cardLocationList, params) {
  if (state.discardCount !== 0) throw new Error("unexpected discardCount value");
  pushState(state, STATE_DISCARD_THEN_DRAW);
  state.waitingOnPlayerIndex = player.index;
}

function doGainCardEffect(state, player, card, cardLocationList, params) {
  pushState(state, STATE_GAIN_CARD);
  state.gainCardOnTopOfDeck = !!params.onTopOfDeck;
  state.gainCardIntoHand = !!params.intoHand;
  state.gainCardCostingUpTo = params.costingUpTo;
  state.gainCardCostingUpToMoreThanTrashed = params.costingUpToMoreThanTrashed;
  state.gainCardName = params.name;
  state.gainCardType = params.type;
  state.gainCardCostExact = !!params.costExact;
  state.waitingOnPlayerIndex = player.index;
}

function getMatchingCardsInList(state, list, query) {
  var results = {};
  for (var i = 0; i < list.length; i += 1) {
    var card = list[i];
    var match = true;
    if (query.name != null && card.name !== query.name) {
      match = false;
    }
    if (query.costingUpTo != null && card.cost > query.costingUpTo) {
      match = false;
    }
    if (query.costingUpTo != null && query.costExact && card.cost !== query.costingUpTo) {
      match = false;
    }
    if (query.type != null && !isCardType(card, query.type)) {
      match = false;
    }
    if (query.exclude != null && query.exclude.includes(card.name)) {
      match = false;
    }
    if (match) {
      results[card.name] = card;
    }
  }
  return Object.keys(results);
}

function getMatchingCardsInHand(state, player, query) {
  return getMatchingCardsInList(state, player.hand, query);
}

function getMatchingRevealedCards(state, player, query) {
  return getMatchingCardsInList(state, player.revealedCards, query);
}

function getMatchingCards(state, query) {
  var results = [];
  for (var i = 0; i < state.cardList.length; i += 1) {
    var gameCard = state.cardList[i];
    var match = true;
    if (query.countGreaterEqual != null && gameCard.count < query.countGreaterEqual) {
      match = false;
    }
    if (query.name != null && gameCard.card.name !== query.name) {
      match = false;
    }
    if (query.type != null && !isCardType(gameCard.card, query.type)) {
      match = false;
    }
    if (query.costingUpTo != null && gameCard.card.cost > query.costingUpTo) {
      match = false;
    }
    if (query.costingUpTo != null && query.costExact && gameCard.card.cost !== query.costingUpTo) {
      match = false;
    }
    if (match) {
      results.push(gameCard);
    }
  }
  return results;
}

function doAttackPutCardsOnDeck(state, player, card, cardLocationList, params) {
  var attackerIndex = getCurrentPlayerIndex(state);
  for (var i = 0; i < state.players.length - 1; i += 1) {
    pushState(state, STATE_PUT_CARDS_ON_DECK);
    state.waitingOnPlayerIndex = euclideanMod(attackerIndex - i - 1, state.players.length);
    state.putCardsOnDeckType = params.type;
    state.putCardsOnDeckCount = params.amount;
    state.putCardsOnDeckElse = params['else'];
    attackPlayer(state, state.players[state.waitingOnPlayerIndex]);
  }
}

function doAttackDiscardDownTo(state, player, card, cardLocationList, params) {
  var attackerIndex = getCurrentPlayerIndex(state);
  for (var i = 0; i < state.players.length - 1; i += 1) {
    state.waitingOnPlayerIndex = euclideanMod(attackerIndex - i - 1, state.players.length);
    state.discardDownTo = params.amount;
    const victem = state.players[state.waitingOnPlayerIndex];
    if (params.amount < victem.hand.length) {
      pushState(state, STATE_DISCARD_DOWN_TO);
      attackPlayer(state, victem);
    }
  }
}

function doAttackGainCard(state, player, card, cardLocationList, params) {
  var attackerIndex = getCurrentPlayerIndex(state);
  for (var i = 0; i < state.players.length - 1; i += 1) {
    pushState(state, STATE_GAIN_CARD);
    state.waitingOnPlayerIndex = euclideanMod(attackerIndex - i - 1, state.players.length);

    state.gainCardOnTopOfDeck = !!params.onTopOfDeck;
    state.gainCardCostingUpTo = params.costingUpTo;
    state.gainCardName = params.name;
    attackPlayer(state, state.players[state.waitingOnPlayerIndex]);
  }
}

function doAttackThief(state, player, card, cardLocationList, params) {
}

function doAttackSpy(state, player, card, cardLocationList, params) {
  var attackerIndex = getCurrentPlayerIndex(state);
  for (var i = 0; i < state.players.length - 1; i += 1) {
    pushState(state, STATE_SPY_REVEAL);

    state.victimPlayerIndex = euclideanMod(attackerIndex - i - 1, state.players.length);
    attackPlayer(state, state.players[state.victimPlayerIndex]);
  }
  pushState(state, STATE_SPY_REVEAL);
  state.victimPlayerIndex = attackerIndex;
}

function attackPlayer(state, victimPlayer) {
  state.isAttack = true;
  triggerCondition(state, victimPlayer, 'onAttack');
}

function triggerCondition(state, player, conditionName) {
  var playableReactionCards = [];
  var cardI, card;
  for (cardI = 0; cardI < player.hand.length; cardI += 1) {
    card = player.hand[cardI];
    if (card.condition && card.condition.name === conditionName) {
      playableReactionCards.push(card);
    }
  }
  for (cardI = 0; cardI < player.tavern.length; cardI += 1) {
    card = player.tavern[cardI];
    if (card.tavernCondition && card.tavernCondition.name === conditionName) {
      playableReactionCards.push(card);
    }
  }
  if (playableReactionCards.length > 0) {
    pushState(state, STATE_REACTION);
    state.playableReactionCards = playableReactionCards;
  }
}

function doTrashThisCardEffect(state, player, card, cardLocationList, params) {
  state.trash.push(removeCardFromList(cardLocationList, card.name));
}

function doPutInTavern(state, player, card, cardLocationList, params) {
  player.tavern.push(removeCardFromList(cardLocationList, card.name));
}

function doPutOnDeckFromDiscard(state, player, card, cardLocationList, params) {
  if (player.discardPile.length == 0) {
    doNothing(state);
    return;
  }
  pushState(state, STATE_PUT_ON_DECK_FROM_DISCARD);
  state.waitingOnPlayerIndex = player.index;
}

function doExtraCoinFromFirstSilver(state, player, card, cardLocationList, params) {
  if (state.extraCoinFromFirstSilver > -1) {
    state.extraCoinFromFirstSilver++;
  }
}

function doMaybeTopDeckAnAction(state, player) {
  const dest = [];
  playerMoveFromDeck(state, player, 1, dest);
  const card = dest[0];
  if (card) { 
    log(this, `${playerName(player)} discards ${card.name}`);
    player.discardPile.push(card);

    if (isCardType(card, 'Action')) {
      pushState(state, STATE_TOP_DECK_FROM_DISCARD);
      state.waitingOnPlayerIndex = player.index;
    }
  }
}

function doDiscardPerEmptySupply(state, player) {
  pushState(state, STATE_DISCARD_UNTIL);
  state.waitingOnPlayerIndex = player.index;
  state.cardsToDiscard = getNumberOfEmptySupplyPiles(state);
}

function doAttackRevealAndTrashTreasure(state, player) {
  var attackerIndex = getCurrentPlayerIndex(state);
  for (var i = 0; i < state.players.length - 1; i += 1) {
    pushState(state, STATE_BANDIT_REVEAL);
    state.victimPlayerIndex = euclideanMod(attackerIndex - i - 1, state.players.length);
    state.waitingOnPlayerIndex = state.victimPlayerIndex;
    attackPlayer(state, state.players[state.victimPlayerIndex]);
  }
}

function doRevealAndTrash(state, player) {
  playerRevealCards(state, player, 2);
  if (player.revealedCards.length) {
    pushState(state, STATE_SENTRY_DISPOSE);

    // Mandatory in the sense that what they don't trash will be discarded
    state.trashMandatory = true;
  }
}

function doDonePlayingSentry(state, params) {
  const player = state.getCurrentPlayer();
  discardRevealedCards(state, player);
  popState(state);
}

function doRevealHandEffect(state, player, card, cardLocationList, params) {
  state.emit('revealHand', player);
}

function doTrashCardsEffect(state, player, card, cardLocationList, params) {
  pushState(state, STATE_TRASH);
  state.trashMandatory = !!params.mandatory
  state.trashActionsLeft = params.amount;
  state.trashType = params.type;
  state.trashName = params.name;
  state.waitingOnPlayerIndex = player.index;
}

function doRevealThisCardEffect(state, player, card, cardLocationList, params) {
  state.emit('reveal', player, card.name);
}

function doUnaffectedByAttackEffect(state, player, card, cardLocationList, params) {
  var prevStackFrame = state.stateStack[state.stateStack.length - 2];
  if (!prevStackFrame.isAttack) {
    throw new Error("moat affected wrong stack frame");
  };
  prevStackFrame.unaffectedByAttack = true;
}

function doDiscardDeckEffect(state, player, card, cardLocationList, params) {
  pushState(state, STATE_DISCARD_DECK);
  state.waitingOnPlayerIndex = player.index;
}

function doOtherPlayersDrawEffect(state, player, card, cardLocationList, params) {
  if (!params.amount) throw new Error("missing amount parameter");
  for (var i = 1; i < state.players.length; i += 1) {
    var otherPlayerIndex = euclideanMod(player.index + i, state.players.length);
    var otherPlayer = state.players[otherPlayerIndex];
    playerDraw(state, otherPlayer, params.amount);
  }
}

function doPlusAction(state, player, card, cardLocationList, params) {
  if (!params.amount) throw new Error("missing amount parameter");
  state.actionCount += params.amount;
}

function doPlusTreasure(state, player, card, cardLocationList, params) {
  if (!params.amount) throw new Error("missing amount parameter");
  if (!params.ifYouDidTrash || state.costOfRecentlyTrashedCard >= 0) {
    state.treasureCount += params.amount;
  }
}

function doPlusBuy(state, player, card, cardLocationList, params) {
  if (!params.amount) throw new Error("missing amount parameter");
  state.buyCount += params.amount;
}

function doPlusCard(state, player, card, cardLocationList, params) {
  if (!params.amount) throw new Error("missing amount parameter");
  playerDraw(state, player, params.amount);
}

function doRevealUntilCard(state, player, card, cardLocationList, params) {
  var amountFound = 0;
  while (player.deck.length + player.discardPile.length > 0 && amountFound < params.amount) {
    playerRevealCards(state, player, 1);
    var revealedCard = player.revealedCards[player.revealedCards.length - 1];
    if (isCardType(revealedCard, params.type)) {
      amountFound += 1;
    }
  }
}

function doPutRevealedCardsIntoHand(state, player, card, cardLocationList, params) {
  var i = 0;
  for (; i < player.revealedCards.length;) {
    var revealedCard = player.revealedCards[i];
    if (isCardType(revealedCard, params.type)) {
      player.revealedCards.splice(i, 1);
      player.hand.push(revealedCard);
      continue;
    }
    i += 1;
  }
}

function doDiscardRevealedCards(state, player, card, cardLocationList, params) {
  discardRevealedCards(state, player);
}

function doPlayOtherCard(state, player, card, cardLocationList, params) {
  pushState(state, STATE_PLAY_ACTION_CARD);
  state.playActionCardAmount = params.amount;
  state.effectDone = false;
}

function doLibraryDraw(state, player, card, cardLocationList, params) {
  pushState(state, STATE_LIBRARY_DRAW);
}

function doPutCardsOnDeck(state, player, card, cardLocationList, params) {
  pushState(state, STATE_PUT_CARDS_ON_DECK);
  state.putCardsOnDeckType = params.type;
  state.putCardsOnDeckCount = params.amount;
  state.putCardsOnDeckElse = params['else'];
}

function discardRevealedCards(state, player) {
  while (player.revealedCards.length > 0) {
    player.discardPile.push(player.revealedCards.pop());
  }
}

function euclideanMod(numerator, denominator) {
  var result = numerator % denominator;
  return result < 0 ? result + denominator : result;
}

function isCardInTrash(state, card) {
  return state.trash.indexOf(card) >= 0;
}

function log(state, name, args) {
  state.emit('log', name, args);
  state.log.push({
    name: name,
    params: args,
  });
}

function serializeDeck(deck) {
  return deck.map(getCardName);
}
