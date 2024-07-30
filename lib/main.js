var dominion = require('./dominion');
const MG = require("markdown-grid");
require('process').removeAllListeners('warning');

var args = processCommandLineArgs();
console.log("seed: " + args.seed);

var game = new dominion.DominionGame(args.players, args.seed);
game.appendLog = function (log) {
  console.log(log);
  dominion.log(game, log)
}
game.on('reveal', function (player, cardName) {
  game.appendLog(dominion.playerName(player) + " reveals " + cardName);
});
game.on('revealCardsFromDeck', function (player, revealedCards) {
  game.appendLog(dominion.playerName(player) + " reveals from deck " + deckToString(revealedCards));
});
game.on('revealHand', function (player) {
  game.appendLog(dominion.playerName(player) + " reveals hand");
});
game.on('putOnDeck', function (player, cardName) {
  game.appendLog(dominion.playerName(player) + " puts on deck " + cardName);
});
game.printLog = function () {
  const entries = [];
  for (i = 0; i < game.log.length; i += 1) {
    var logEntry = game.log[i];
    var playerName;
    if (logEntry.name === 'shuffle') {
      playerName = dominion.playerName(game.players[logEntry.params.player]);
      entries.push(playerName + " shuffle");
    } else if (logEntry.name === 'move') {
      playerName = dominion.playerName(game.players[logEntry.params.player]);
      entries.push(playerName + " " + dominion.moveToString(logEntry.params.move));
    } else {
      entries.push(logEntry.name);
    }
  }
  return entries;
}
game.on('gameOver', function (players) {
  var i;
  console.log(game.printLog().join('\n'));
  console.log("\nScore:");
  for (i = 0; i < players.length; i += 1) {
    var player = players[i];
    console.log(player.rank + " " + dominion.playerName(player) + " VP: " + player.vp + " turns: " + player.turnCount);
  }

  console.log(players[0].ai.name);
});
game.on('draw', function (player, count) {
  game.appendLog(dominion.playerName(player) + " draws " + count + " cards");
});
game.on('gainCard', function (player, cardName, topOfDeck, intoHand) {
  var topOfDeckText = topOfDeck ? " on top of deck" : "";
  var intoHandText = intoHand ? " into hand" : "";
  game.appendLog(dominion.playerName(player) + " gains a " + cardName + topOfDeckText + intoHandText);
});

game.moveToString = dominion.moveToString;

game.printMoveList = function (moveList) {
  const output = [];
  output.push("Possible moves:");
  for (var i = 0; i < moveList.length; i += 1) {
    var move = moveList[i];
    output.push(`${(i + 1)}`.padStart(2, ' ') + ' ' + dominion.moveToString(move));
  }
  if (moveList.length === 0) {
    output.push("(none)");
  }

  return output.join('\n');
}

function getAndSortSupplyGroups() {
  const treasureCards = game.cardList.filter(c => c.card.type.Treasure);
  const victoryCards = game.cardList.filter(c => c.card.name == 'Curse' || (c.card.type.Victory && c.card.includeCondition == 'always'));
  const otherCards = game.cardList.filter(c => !treasureCards.includes(c) && !victoryCards.includes(c));
  [treasureCards, victoryCards, otherCards].forEach(list => list.sort((a, b) => {
    if (a.card.cost == b.card.cost) {
      return a.card.name.localeCompare(b.card.name);
    }
    return a.cost - b.cost;
  }));

  return [treasureCards, victoryCards, otherCards];
}

game.printSupplyDetails = function() {
  const [treasureCards, victoryCards, kingdomCards] = getAndSortSupplyGroups();
  return `CARD DESCRIPTIONS

TREASURE CARDS
${treasureCards.map(c => `${c.card.name}: ${c.card.description}`).join('\n')}

VICTORY CARDS
${victoryCards.map(c => `${c.card.name}: ${c.card.description}`).join('\n')}

KINGDOM CARDS
${kingdomCards.map(c => `${c.card.name}: ${c.card.description}`).join('\n')}
`;
}

game.printGameState = function () {
  const output = [];

  output.push('');
  output.push("Supply");

  const [treasureCards, victoryCards, otherCards] = getAndSortSupplyGroups();

  function formatCard(c) {
    return `${`${c.count}`.padStart(2, ' ')} ${c.card.name}`;
  }

  const rows = [
    victoryCards.map(formatCard),
    treasureCards.map(formatCard),
  ];

  while (otherCards.length) {
    const row = [];
    rows.push(row);
    for (let y = 0; y < 5 && otherCards.length; y++) {
      row.push(formatCard(otherCards.shift()));
    }
  }

  const maxWidth = rows.flat().reduce((a, c) => Math.max(a, c.length), 0);

  rows.forEach(row => {
    output.push(row
      .map(entry => entry.padEnd(maxWidth, ' '))
      .join('  '));
  })

  output.push('');
  output.push("Trash: " + deckToString(game.trash, true));
  output.push('');

  const player = game.getCurrentPlayer();
  const opponent = game.players.find(_ => _ != player);

  const actionsBuysCoins = `Actions: ${game.actionCount}  Buys: ${game.buyCount}  Coins: ${game.treasureCount}`;

  output.push(`${dominion.playerName(opponent)} (${game.calcVictoryPoints(opponent)} victory points)`);
  opponent.index == game.currentPlayerIndex && output.push(actionsBuysCoins);
  if (opponent.revealedCards.length) {
    output.push(`  Revealed: ${deckToString(opponent.revealedCards, false)}`);
  }
  output.push(`In Play: ${deckToString(opponent.inPlay, false)}`);

  output.push('');

  output.push(`${dominion.playerName(player)} (${game.calcVictoryPoints(player)} victory points)`);
  output.push(`   In Deck: ${deckToString(player.deck, true)}`);
  output.push(`In Discard: ${deckToString(player.discardPile, !game.doesStateRevealDiscard())}`);
  if (player.revealedCards.length) {
    output.push(`  Revealed: ${deckToString(player.revealedCards, false)}`);
  }
  output.push(`   In Play: ${deckToString(player.inPlay, false)}`);
  output.push(`   In Hand: ${deckToString(player.hand, false)}`);

  output.push('');

  output.push(`Waiting for you (${dominion.playerName(player)}) to ${game.stateIndexToString()}`);
  player.index == game.currentPlayerIndex && output.push(actionsBuysCoins);

  return output.join('\n');
}

mainLoop(game);

function mainLoop(game) {
  if (game.gameOver) {
    return;
  }

  var player = game.getCurrentPlayer();
  const moveList = game.enumerateMoves();
  if (moveList.length === 0) {
    throw new Error("no move possible");
  }
  var onMoveChosenCalled = false;
  if (moveList.length === 1) {
    onMoveChosen(null, moveList[0]);
  } else {
    player.ai.chooseMove(dominion.dominion, game, moveList, onMoveChosen);
  }
  function onMoveChosen(err, move) {
    if (onMoveChosenCalled) throw new Error("callback called twice");
    onMoveChosenCalled = true;
    if (err) throw err;
    if (!move) throw new Error("invalid move");
    console.log(dominion.playerName(player) + " chooses: " + dominion.moveToString(move));
    game.performMove(move);
    setImmediate(function () {
      mainLoop(game);
    });
  }
}

function processCommandLineArgs() {
  var args = {
    players: [],
    seed: +(new Date()),
  };
  var aiNames = [];
  var i, aiName;
  for (i = 2; i < process.argv.length; i += 1) {
    var arg = process.argv[i];
    if (/^--/.test(arg)) {
      if (i + 1 >= process.argv.length) argParseError("expected argument after " + arg);
      var nextArg = process.argv[++i];
      if (arg === '--player') {
        aiNames.push(nextArg);
      } else if (arg === '--seed') {
        args.seed = parseInt(nextArg, 10);
        if (isNaN(args.seed)) argParseError("invalid seed");
      } else {
        argParseError("unrecognized argument: " + arg);
      }
    } else {
      argParseError("unrecognized argument: " + arg);
    }
  }
  if (aiNames.length < 2 || aiNames.length > 4) {
    argParseError("Dominion is 2-4 players. Use a correct number of --player arguments.");
  }
  for (i = 0; i < aiNames.length; i += 1) {
    aiName = aiNames[i];
    var ai = dominion.ais[aiName];
    if (!ai) {
      argParseError("Invalid AI name: " + aiName);
    }
    ai.name = aiName;
    args.players.push(ai);
  }
  return args;
}

function argParseError(msg) {
  console.error("Usage: " + process.argv[0] + " " + process.argv[1] + " [--player <AI_Name>] [--seed <seed>]");
  console.error("AIs available:\n  " + Object.keys(dominion.ais).join("\n  "));
  console.error("Sets available:")
  for (var i = 0; i < dominion.dominion.setList.length; i += 1) {
    console.error("  " + dominion.dominion.setList[i].name);
  }
  console.error(msg);
  process.exit(1);
}

function deckToString(deck, compress) {
  if (deck.length === 0) return "(empty)";
  if (!compress) {
    return deck.map(dominion.getCardName).join(", ");
  }
  var counts = {};
  for (var i = 0; i < deck.length; i += 1) {
    var card = deck[i];
    counts[card.name] = (counts[card.name] == null) ? 1 : (counts[card.name] + 1);
  }
  var names = Object.keys(counts);
  names.sort(compare);
  for (i = 0; i < names.length; i += 1) {
    var count = counts[names[i]];
    if (count > 1) {
      names[i] = counts[names[i]] + "x" + names[i];
    }
  }
  return names.join(" ");
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
