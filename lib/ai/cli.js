var readline = require('readline');

exports.chooseMove = chooseMove;

function chooseMove(dominion, state, moveList, callback) {
  console.clear();
  console.log(state.printLog().join('\n'));
  console.log(state.printGameState());
  console.log(state.printMoveList(moveList));
  doPrompt();

  function onUserInput(inputText) {
    var choice = parseInt(inputText, 10);
    var moveIndex = choice - 1;
    if (isNaN(choice) || moveIndex < 0 || moveIndex >= moveList.length) {
      console.log("No.");
      doPrompt();
      return;
    }
    callback(null, moveList[moveIndex]);
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
