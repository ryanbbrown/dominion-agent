import { createInterface } from 'readline';

const RETRY_ATTEMPTS = 10;

export const SYSTEM_PROMPT = `You are an AI playing the card game Dominion.`;

const getGameRules = (supplyDetails: string) => `GOAL
This is a game of building a deck of cards. The deck is your Dominion. It contains your resources, victory points, and the things you can do. It starts out a small sad collection of Estates and Coppers, but you hope by the end of the game it will be brimming with Gold, Provinces, and the inhabitants and structures of your castle and kingdom.
The player with the most victory points in his Deck at game end wins.

QUICK SUMMARY
In a game of Dominion, each player is given a starting deck of 10 cards, and they play around a Supply of card piles that they can buy from over the course of the game.
On their turn, a player goes through three turn phases:
* ACTION PHASE (A): They may play one Action card.
* BUY PHASE (B): They may play their Treasures and buy one card that they can afford, putting that card in their discard pile.
* Clean-up (C): They take all the cards they've played, and all cards remaining in their hand, and put them into their discard pile. They then draw 5 more cards, and end their turn.
When any player needs to draw cards and there are not enough cards left in their deck to do so, they reshuffle their discard pile to create a new deck. In this way cards that have been bought on earlier turns will be drawn on later turns to be played.
The game ends when either 3 Supply piles are empty, or when the Province pile or the Colony pile empties. The player with the most victory points wins.
Many effects can allow the player to play more than one Action card or buy more than one card per turn. There are exceptions to almost everything else just listed above as well, as discussed in detail below.

ACTION PHASE
In the Action phase, the player may play one Action card. Action cards are the Kingdom cards that say “Action” at the bottom of the card. Since players do not start the game with any Action cards in their initial Decks of 10 cards, a player will not have any Actions to play during his first 2 turns. Normally, a player may play only one Action card, but this number may be modified by the Action cards that the player plays.
To play an Action, the player takes an Action card from his hand and lays it face-up in his play area. He announces which card he is playing and follows the instructions written on that card from top to bottom. The player may still play an Action card even if he is not able to do everything the Action card tells him to do; but the player must do as much as he can. Furthermore, the player must fully resolve an Action card before playing another one (if he is able to play another Action card). Detailed information about card abilities can be found in the card descriptions at the end of these rules. Any Action cards played remain in the player’s play area until the Clean-up phase of the turn unless otherwise indicated on the card.
The Action phase ends when the player cannot or chooses not to play any more Action cards. Generally, a player can only play Action cards during the Action phase of his turn. However, Reaction cards are an exception to this rule as they can be used at other times.

BUY PHASE
In the Buy phase, the player can gain one card from the Supply by paying its cost. Any card that is in the Supply may be purchased (Treasure, Victory, Kingdom, and even Curse cards). The player may not purchase cards from the Trash pile. Normally, a player may buy only one card, but he may buy more if he played certain cards earlier in his Action phase.
The cost of a card is in its lower left corner. The player may play some or all of the Treasure cards from his hand to his play area and add to their value the coins provided by Action cards played this turn. The player may then gain any card in the Supply of equal or lesser value. He takes the purchased card from its Supply pile and places it face-up on his Discard pile. He my not use the ability of the card when it is gained.
If the player has multiple Buys, he combines Treasure cards and any coins available from Action cards to pay for all of the purchases. For example, if Tyler has +1 Buy and 6 coins provided by two Gold cards, he can buy a Cellar costing 2, placing it face-up in his Discard pile. Then, he can buy a Smithy with the remaining 4 coins and place that face-up in his Discard pile. If he wants to use all 6 coins to buy one card, he can buy a Copper (for free) with his second Buy or not buy a second card. Players do not have to use any or all of their Buys.
The Treasure cards remain in the play area until the Clean-up phase. Treasure cards will be used multiple times during the game. Although they are discarded during the Clean-up phase, the player will draw them again as his Discard pile is shuffled into a new Deck. Thus, Treasure cards are a source of income, not a resource that is used up when played. When played, Coppers are worth 1 coin, Silvers are worth 2 coins, and Golds are worth 3 coins.

GAME END
The game ends at the end of any player’s turn when either:
1) the Supply pile of Province cards is empty or
2) any 3 Supply piles are empty.
Each player puts all of his cards into his Deck and counts the victory points on all the cards he has.
The player with the most victory points wins. If the highest scores are tied at the end of the game, the tied player who has had the fewest turns wins the game.

${supplyDetails}`;

const INSTRUCTIONS_PLAY = `INSTRUCTIONS
You will be presented with the current state of the game as well as all valid moves that you can make.
* Summarize the current game based on the logs, available kingdom cards, etc...
* Outline a strategy the current player should follow. Make sure to consider the cards the current player already owns, the stage of the game, how many remaining provinces there are, etc..
* Then choose a move and provide a short explanation why.

Output should ONLY be JSON of the following format: 
{
  "summary": <string>, 
  "strategy": <string>,
  "moveExplanation": <string>,
  "move": <number>
}
  
Do not include anything else in your response.`;

export const RESPONSE_SCHEMA = {
    type: "object",
    properties: {
        // theory: making it write the explanation first will help ensure the outputted move is coherent.
        summary: { type: "string" },
        strategy: { type: "string" },
        moveExplanation: { type: "string" },
        move: { type: "number" },
    },
    required: ["summary", "strategy", "moveExplanation", "move"],
};

export type ChatLog = { role: 'system' | 'user' | 'assistant', content: string }[];

export function makeAI(send: (chatLog: ChatLog) => Promise<string>) {
    return async function chooseMove(dominion: any, state: any, moveList: any, callback: any) {
        // There's a small amount of possible information disclosure here,
        // but for the most part the AI should always just play all treasure cards during the buy phase.
        if (moveList[0]?.params?.allTreasure) {
            callback(null, moveList[0]);
            return;
        }

        const prompt = `${state.printGameState()}\n${state.printMoveList(moveList)}`;
        console.log(prompt);

        const chatRequest: ChatLog = [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: getGameRules(state.printSupplyDetails(true)) },
            { role: "user", content: INSTRUCTIONS_PLAY },
            { role: "user", content: `GAME LOG\n${(state.printLog() as string[]).slice(-100).join('\n')}` },
            { role: 'user', content: prompt },
        ];

        let attempts = RETRY_ATTEMPTS;
        while (--attempts) {
            try {
                console.log(`\nWaiting on ${state.getCurrentPlayer().ai.name} to respond...`);
                debugger;

                const output = await send(chatRequest);
                console.log();

                if (state.players.find((_: any) => _.ai.name == 'cli')) {
                    const rl = createInterface({
                        input: process.stdin,
                        output: process.stdout,
                    });
                    await new Promise<void>((resolve) => {
                        rl.question("Press enter to contine...", (_) => {
                            rl.close();
                            resolve();
                        });
                    });
                }

                const parsed = JSON.parse(output);
                var choice = parsed.move;
                var moveIndex = choice - 1;
                if (isNaN(choice) || moveIndex < 0 || moveIndex >= moveList.length) {
                    throw new Error(`${choice} is not a valid move`);
                }

                callback(null, moveList[moveIndex]);
                return;
            } catch (e) {
                console.error(e);
                const retryDelay = 1000 * (2**(RETRY_ATTEMPTS - attempts));
                console.log(`Retrying after ${retryDelay}ms`);
                await delay(retryDelay);
                continue;
            }
        }

        throw new Error(`AI unable to successfully make a move after ${RETRY_ATTEMPTS} attempts`);
    }
}

function delay(ms: number) {
    return new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
}