var readline = require('readline');

exports.chooseMove = chooseMove;

function chooseMove(dominion, state, moveList, callback) {
  function freshScreen() {
    console.clear();
    console.log(state.printLog().join('\n'));
    console.log(state.printGameState());
    console.log(state.printMoveList(moveList));
    doPrompt();
  }

  freshScreen();

  function onUserInput(inputText) {
    if (inputText.startsWith('!')) {
      const move = moveList[inputText.substring(1) - 1];
      if (move && move.params.card) {
        console.clear();
        console.log(state.printCardDetails(move.params.card, true));
      } else {
        doPrompt();
        return;
      }

      console.log();
      pressEnterToContinue();
      return;
    }

    var choice = parseInt(inputText, 10);
    var moveIndex = choice - 1;
    if (isNaN(choice) || moveIndex < 0 || moveIndex >= moveList.length) {
      console.log("No.");
      doPrompt();
      return;
    }
    callback(null, moveList[moveIndex]);
  }

  function pressEnterToContinue() {
    var rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question("Press enter to continue...", (_) => {
      rl.close();
      freshScreen();
    });
  }

  function doPrompt() {
    var rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question("> ", (_) => {
      rl.close();
      onUserInput(_);
    });
  }
}
