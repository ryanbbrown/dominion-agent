import { send } from 'process';
import { createInterface } from 'readline';
import OpenAI from "openai";
import { OPENAI_API_KEY } from "./config";
import {
    Annotation,
    START,
    StateGraph,
    StateType,
    UpdateType,
} from "@langchain/langgraph";

const RETRY_ATTEMPTS = 10;

// export const SYSTEM_PROMPT = `You are an AI playing the card game Dominion.`;

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
In the Action phase, the player may play one Action card. Action cards are the Kingdom cards that say "Action" at the bottom of the card. Since players do not start the game with any Action cards in their initial Decks of 10 cards, a player will not have any Actions to play during his first 2 turns. Normally, a player may play only one Action card, but this number may be modified by the Action cards that the player plays.
To play an Action, the player takes an Action card from his hand and lays it face-up in his play area. He announces which card he is playing and follows the instructions written on that card from top to bottom. The player may still play an Action card even if he is not able to do everything the Action card tells him to do; but the player must do as much as he can. Furthermore, the player must fully resolve an Action card before playing another one (if he is able to play another Action card). Detailed information about card abilities can be found in the card descriptions at the end of these rules. Any Action cards played remain in the player's play area until the Clean-up phase of the turn unless otherwise indicated on the card.
The Action phase ends when the player cannot or chooses not to play any more Action cards. Generally, a player can only play Action cards during the Action phase of his turn. However, Reaction cards are an exception to this rule as they can be used at other times.

BUY PHASE
In the Buy phase, the player can gain one card from the Supply by paying its cost. Any card that is in the Supply may be purchased (Treasure, Victory, Kingdom, and even Curse cards). The player may not purchase cards from the Trash pile. Normally, a player may buy only one card, but he may buy more if he played certain cards earlier in his Action phase.
The cost of a card is in its lower left corner. The player may play some or all of the Treasure cards from his hand to his play area and add to their value the coins provided by Action cards played this turn. The player may then gain any card in the Supply of equal or lesser value. He takes the purchased card from its Supply pile and places it face-up on his Discard pile. He my not use the ability of the card when it is gained.
If the player has multiple Buys, he combines Treasure cards and any coins available from Action cards to pay for all of the purchases. For example, if Tyler has +1 Buy and 6 coins provided by two Gold cards, he can buy a Cellar costing 2, placing it face-up in his Discard pile. Then, he can buy a Smithy with the remaining 4 coins and place that face-up in his Discard pile. If he wants to use all 6 coins to buy one card, he can buy a Copper (for free) with his second Buy or not buy a second card. Players do not have to use any or all of their Buys.
The Treasure cards remain in the play area until the Clean-up phase. Treasure cards will be used multiple times during the game. Although they are discarded during the Clean-up phase, the player will draw them again as his Discard pile is shuffled into a new Deck. Thus, Treasure cards are a source of income, not a resource that is used up when played. When played, Coppers are worth 1 coin, Silvers are worth 2 coins, and Golds are worth 3 coins.

GAME END
The game ends at the end of any player's turn when either:
1) the Supply pile of Province cards is empty or
2) any 3 Supply piles are empty.
Each player puts all of his cards into his Deck and counts the victory points on all the cards he has.
The player with the most victory points wins. If the highest scores are tied at the end of the game, the tied player who has had the fewest turns wins the game.

${supplyDetails}`;


const getEndgameStrategy = (supplyDetails: string) => `ENDGAME STRATEGY
You are now going to determine, for a given kingdom, "how do I score"?
This step is being performed at the beginning of the game, before any cards have been played.

Context of cards in the kingdom, what they do, and the strategy advice for each:
${supplyDetails}

Your goal is to answer the following two questions:
1. Is there any alt VP? To answer this, just see if any of the cards in the kingdom other than province/duchy/estate provide VP or give curses. 
2. Is it feasible for there to be a pile-out ending to the game? To answer this, look at the description + strategy for each card and see if any of them mention
that the card often causes piles to empty. Junkers, self-gainers, and power cards are more likely to pileout. If there is no mention in the provided strategy detail
that the card causes piles to empty, then it is not a pileout card.

Output should ONLY be JSON of the following format: 
{
  "alt_vp_present": <bool>, 
  "alt_vp_cards": <string>,
  "pileout_feasible": <bool>,
  "pileout_cards": <string>
}
  
Do not include anything else in your response.`;


const getMidgameStrategy = (supplyDetails: string, state: string) => `MIDGAME STRATEGY
You are now going to determine, for a given kingdom, "what do I want my eventual deck to do, given how I score?"

Context of cards in the kingdom, what they do, and the strategy advice for each:
${supplyDetails}

Context of alt VP presence and pileout feasibility:
${state}

Your goal is to answer the following two questions:
1. If alt VP is available, is it:
- "dominant": a dominant strategy (e.g. colonies, workshop + gardens)
- "parallel": should be pursued in parallel to provinces (e.g. witch)
- "ignore": should be ignored (e.g. relatively weak alt vp, such as farm)
You should consider both the alt VP card itself and the support the rest of the kingdom could provide for that alt VP. If there is no alt VP, return "ignore".
The alt VP card strategy will likely mention whether it's a good idea to pursue it in parallel.
In addition to choosing an option, you will also provide a description of why you chose that option and (approximately) what cards you'll need in your deck to get there.

2. Assuming alt VP is not dominant, you'll also be purchasing provinces. What's the best way to get provinces?
- "single": Buy a single province per turn
- "double": Buy two provinces per turn (requires +buy and strong deck control)
- "megaturn": Build up to a Megaturn (requires specific cards/combos, don't try for a megaturn unless mentioned in the strategy of a card)
- "none": Alt-VP is dominant
In addition to choosing an option, you will also provide a description of why you chose that option and (approximately) what cards you'll need in your deck to get there.


Output format:
{
  "alt_vp_strategy": <string>, (either "dominant", "parallel", or "ignore")
  "alt_vp_strategy_explanation": <string>,
  "province_strategy": <string>, (either "single", "double", "megaturn", or "none")
  "province_strategy_explanation": <string>
}
  
Only respond with valid JSON; NO additional text, comments, or explanations may be returned, including the word "JSON" or other formatting characters.`;



export type ChatLog = { role: 'system' | 'user' | 'assistant', content: string }[];

export type makeAIOptions = {
    reasoning?: boolean;
}

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

export async function simpleAI(prompt: string): Promise<string> {
    const chatRequest: ChatLog = [
        { role: "system", content: "You are a friendly AI assistant that always returns responses in valid JSON format." },
        { role: "user", content: prompt }
    ];

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            max_tokens: 512,
            messages: chatRequest,
            stream: false,
            response_format: { type: "json_object" }
        });

        return completion.choices[0]?.message?.content || '';
    } catch (e) {
        console.error("Error in simpleAI:", e);
        throw e;
    }
}

// Define the state schema
const StateAnnotation = Annotation.Root({
    supplyDetails: Annotation<string>,
    alt_vp_present: Annotation<boolean>,
    alt_vp_cards: Annotation<string>,
    pileout_feasible: Annotation<boolean>,
    pileout_cards: Annotation<string>,
    alt_vp_strategy: Annotation<string>,
    alt_vp_strategy_explanation: Annotation<string>,
    province_strategy: Annotation<string>,
    province_strategy_explanation: Annotation<string>,
});

// First node: Endgame strategy analysis
const endgameNode = async (state: typeof StateAnnotation.State) => {
    const prompt = `${getGameRules(state.supplyDetails)}\n\n${getEndgameStrategy(state.supplyDetails)}`;
    const response = await simpleAI(prompt);
    console.log(response);
    const result = JSON.parse(response);
    
    return {
        alt_vp_present: result.alt_vp_present,
        alt_vp_cards: result.alt_vp_cards,
        pileout_feasible: result.pileout_feasible,
        pileout_cards: result.pileout_cards,
    };
};

// Second node: Midgame strategy analysis
const midgameNode = async (state: typeof StateAnnotation.State) => {
    const stateString = JSON.stringify({
        alt_vp_present: state.alt_vp_present,
        alt_vp_cards: state.alt_vp_cards,
        pileout_feasible: state.pileout_feasible,
        pileout_cards: state.pileout_cards,
    });
    
    const prompt = `${getGameRules(state.supplyDetails)}\n\n${getMidgameStrategy(state.supplyDetails, stateString)}`;
    const response = await simpleAI(prompt);
    console.log(response);
    const result = JSON.parse(response);
    
    return {
        alt_vp_strategy: result.alt_vp_strategy,
        alt_vp_strategy_explanation: result.alt_vp_strategy_explanation,
        province_strategy: result.province_strategy,
        province_strategy_explanation: result.province_strategy_explanation,
    };
};

// Create and compile the graph
export function createStrategyGraph() {
    const graph = new StateGraph(StateAnnotation)
        .addNode("endgame", endgameNode)
        .addNode("midgame", midgameNode)
        .addEdge("__start__", "endgame")
        .addEdge("endgame", "midgame")
        .compile();
    
    return graph;
}

if (require.main === module) {
    // const prompt = process.argv.slice(2).join(' ');
    // if (!prompt) {
    //     console.error('Please provide a prompt as a command line argument');
    //     process.exit(1);
    // }

    // simpleAI(prompt)
    //     .then(response => {
    //         console.log(response);
    //         process.exit(0);
    //     })
    //     .catch(err => {
    //         console.error(err);
    //         process.exit(1);
    //     });

    const sampleInput = `
KINGDOM CARDS
Moat: Costs 2 coins. When played +2 Cards - When another player plays an Attack card, you may first reveal this from your hand, to be unaffected by it.

Moat provides terminal draw of +2 Cards, which is significantly worse than the +3 Cards present on cards such as Smithy. Each Village and Moat pair increases your hand size by one, rather than two with Village and Smithy, meaning you need twice as many pairs for an equivalent benefit. When used in conjunction with villages that do not draw, such as Festival, Moat does not increase your hand size and the combination is highly unreliable, being very vulnerable to an unfavorable order of drawing. Moat requires a very well trashed deck and plentiful access to many drawing villages to work well as your primary draw card. In these conditions, you can also use it as a supplement to better draw cards when those are present, as its low price can present you many opportunities to gain them.
Against attacks during your opponents' turns, Moat provides attack immunity only if you draw it in your starting 5 cards. As your deck increases in size, a single Moat becomes less and less consistent in its ability to defend. It is significantly weaker for this purpose than the other attack immunity cards. Some cards can help guarantee Moat appears in your starting hand every turn, giving full defense coverage with only one copy of Moat. For example, Artisan allows you to put it back on top of your deck.
Against many attacks, it can be better to simply accept that you’ll be getting attacked than to add Moats to your deck for the chance they might occasionally block an attack. In the case of junking attacks such as Witch, it is often more effective to focus on giving all the Curses to your opponent first, instead of spending time obtaining Moats solely for defense.
Unique to Moat is that each time you are attacked you have the option to receive the attack by not revealing your Moat, as occasionally an attack can be beneficial to you.
Moat's defensive capabilities improve in games with more players, as you tend to be attacked more often. Junking attacks in 4 player games can add junk to your deck very quickly and you can easily receive many copies of junk between turns, making Moat more valuable when it does appear in your starting hand.


Great Hall: Costs 3 coins. When played: +1 Card +1 Action. Counts as 1 Victory point.

As a Victory card and cantrip, Great Hall provides a way to green while maintaining deck control. However, because it provides neither deck control nor payload, it contributes nothing to your deck's performance in the vast majority of cases, and is typically only worth adding when you're ready to start greening in the endgame, as otherwise there is the opportunity cost of the chance to build up your deck's capabilities. Great Hall becomes more appealing if the opportunity cost of gaining it is low, most often due to a Workshop variant, especially Ironworks and Groom which give extra benefits due to the dual-type nature of Great Hall. In the case of Groom, this can enable you to pursue a rush. More generally, if the opportunity cost is sufficiently low, it can be worth utilizing Great Hall for the following synergies: Cards that reward having dual-type cards, such as Ironmonger. Effects that rely on a high Action-density in your deck, such as Herald or Scrying Pool. Effects that synergize with cheap cantrips, especially bonus tokens. Effects that benefit from having Victory cards in your deck (such as Crossroads) or from gaining them (such as Battlefield).


Village: Costs 3 coins. When played +1 Card +2 Actions

Village is an important card for engines, as it is one of the simplest and cheapest ways to enable a) playing terminal draw cards like Smithy while retaining the ability to play any Action cards they draw, and b) playing multiple terminal cards per turn, allowing you to use more than one terminal payload card.
You should only add Villages to your deck when you need to increase your terminal space, or the maximum number of terminals you can play in one turn. Your terminal space is directly related to the number of Villages or Village-like cards you play, and importantly has no benefit in and of itself; you need to take advantage of increased terminal space by playing more terminals. It follows that you need to line up your Villages and terminals in the same hand for this to occur. This is more likely when you have good deck control via thinning and/or draw, and/or multiple Villages and terminals.
As the only net benefit of playing a Village is increased terminal space, it is almost always a mistake to gain a Village during the opening turns; better to wait until you have at least a couple of terminals in your deck. Later in the game, as you build, you should aim to add Villages to increase your terminal space so that it matches your expected terminals per turn. If you’re drawing your deck, this usually means adding one Village for every terminal. If you’re not, you can sometimes get away with being overterminaled, or having more terminals than your villages can support, as you might not draw all your terminals.
Village should typically be avoided in money strategies, in which you don’t plan to obtain enough deck control to reliably line it up with your terminal Actions.


Gardens: Cost 4 coins. Worth 1 victory point per 10 cards you have (round down).

Gardens is the first example of alt-VP that most Dominion players will experience. Alt-VP generally provides an advantage to engine strategies versus more Treasure-oriented strategies through an indirect mechanism: While the simpler, Treasure-oriented strategy can often get an early lead on Provinces, the engine strategy often tries to compensate by getting additional non-Province sources of VP such as Duchies after building their deck to a state where they are gaining more than one card per turn. This is because buying Provinces may risk causing the game to end before the engine player has regained a points lead, so the engine player needs to diversify their sources of VP. In this context, Gardens provides another source of VP, which is particularly valuable in engine decks with gainers like Workshop which both lead to large decks and allow for the easy acquisition of Gardens.
That being said, the advantage to engine strategies that Gardens provides is typically not very large. Gardens is often just a Duchy that costs $4. In some engines with heavy trashing, Gardens can result in even fewer VP than Duchy. Thus, Gardens is primarily valuable in engines that feature very large numbers of gains or where Gardens costing $4 allows it to be gained significantly more easily than Duchy.
Occasionally, Gardens is a centralizing card that enables a non-engine strategy called a rush. In the Base set, this is typified by the Workshop-Gardens rush. To play this strategy, you try to first gain all the Workshops, then gain all the Gardens, and finally end the game with a VP lead by emptying a third pile (often Estate). This strategy is very rarely the strongest available strategy because Workshop is a weak gainer. Many Workshop variants perform similarly, but there are a few like Groom which can make this strategy very powerful.
Even more rarely, Gardens can be centralizing for strategies that aren’t rushes, most notably Beggar-Gardens, where players try to make Gardens worth more VP than Province.


Moneylender: Costs 4 coins. You may trash a Copper from your hand for +3 coins.

Moneylender provides a mix of economy and trashing. Many cards that trash from your hand can leave you generating little money on that turn, but Moneylender gives you a money boost when it trashes. Moneylender allows you to remove the Coppers from your deck while still allowing you to purchase the more expensive and powerful cards.
Though Moneylender gives +$3, you have to trash a Copper instead of getting to play it, so the net economy you get is similar to Silver.
Moneylender trashes only one card at a time, and often compares unfavorably to trashers that can trash multiple cards at once, such as Chapel. Moneylender also cannot trash Estates, and often benefits from being played alongside other cards that can, such as Remodel. The other trasher can then also trash the Moneylender once you have finished trashing your Coppers.


Throne Room: Costs 4 coins. When played you may play an Action card from your hand twice.

Throne Room is a flexible card that can be a source of +Actions, draw, or payload. Throne Room depends on having other Action cards in hand, so it's better when your deck has a high density of Action cards. Therefore, Throne Room is less good early in the game, in games where you can't get rid of your starting cards, and in games without Action payload.
Throne Room is an unusual source of +Actions. Using Throne Room to play an Action card twice nets you one more Action than you would have if you played two copies of that Action card. For example, playing two Laboratories leaves you with the same number of Actions you started with (netting +0 Actions). Throne Room playing Laboratory nets you +1 Action—if you started with 1 Action, you would end with 2. Playing two copies of a terminal Action such as Smithy costs 2 Actions; Throne Room playing a Smithy draws the same number of cards but costs only 1 Action.
Using Throne Room to play a Throne Room does not increase the number of Action cards you can double-play, but it does grant +1 net Action. For example, using Throne Room to play Throne Room to play two Laboratories grants +3 net Actions. Chaining Throne Rooms in this way is especially useful with terminal draw cards. You can start a turn by playing Throne Room playing Throne Room playing Smithy, at which point you draw 6 cards and then can duplicate one more Action card from your hand. If you can play a non-terminal Action, you can continue playing more Action cards after that. You can even continue the chain of alternating Throne Rooms and terminal Actions. Throne Room is a very efficient source of +Actions in decks with strong non-terminal cards like Laboratory. With mostly terminal Actions, Throne Room is more awkward. You generally need two Throne Rooms and a terminal draw card in your starting hand to be able to fully exploit your deck’s capabilities, and your deck is more fragile as a result. For that reason, Throne Room benefits from an alternative source of +Actions, especially one that carries over to the next turn, such as Villagers or Fishing Village.
Throne Room can duplicate the on-play effect of any Action card, so it varies in strength based on the Action cards in the kingdom. Using Throne Room on cheaper Action cards such as Merchant or Village is okay, but Throne Room is even stronger when you can use it to double-play cards such as Artisan and Laboratory that are both more expensive to gain and more impactful on play. Some cards have effects that don’t stack, e.g. draw-to-X cards such as Library) and certain Attacks (e.g. Militia), so using Throne Room on them has little to no value. Strong Duration cards such as Wharf can be good targets for Throne Room, but be aware that the Throne Room will stay in play with the Duration card, meaning that you can’t play the Throne Room on the next turn.
Throne Room offers a lot of flexibility, both during a single turn and throughout the game. Within a single turn, you can use early Throne Rooms to help you draw your deck, and later ones to amplify your Action payload. As the game progresses, you can adjust the number of Throne Rooms you use on drawing cards to adapt to the number of stop cards in your deck. Throne Rooms also allow you to pivot strategies more easily as the game proceeds. For instance, playing multiple Witches early in the game allows you to attack your opponents more quickly, but Witch becomes much less useful after the Curse pile empties. Using Throne Room, you can duplicate the Attack of a single Witch early on, and then choose to play Throne Room with other cards later, allowing you to avoid having to gain multiple Witches. In games with an important Action card whose pile might empty, Throne Room can allow you to play additional copies, enabling you to prioritize other objectives over ensuring you get enough copies of that card.


Market: Costs 5 coins. When played +1 Card +1 Action +1 Buy +1 Coins

Market is a $5 cantrip card that allows you to make extra purchases on your turn and gives +$1. Market’s extra +Buy can be important if your deck can yield a lot of $, and it gives +$ of its own without being a stop card. Market is usually good in kingdoms with good trashing but without strong draw, where its cantrip economy allows you to generate $ without having to rely on stop cards.
As cantrips, Markets can chain themselves without much trouble. Playing several Markets in succession generates a decent amount of $, but usually the more important aspect of Market is that a Market stack gives many +Buys, allowing you to buy many cheap cards at once. While this chaining ability can be strong, having many extra Buys may not do much for your deck, and $1 is a relatively small amount of money. Furthermore, as a card costing $5 the opportunity cost of Market is usually high.
Market usually shouldn’t be gained early in the game. Without desirable cheap cards (e.g. Pixie, Fool's Gold) and before you have strong payload, you cannot utilize Market’s extra Buy efficiently. As such, buying a Market on your first two turns is generally a poor use of your opening. In the midgame, you should anticipate when an extra buy will allow you to gain extra cards and get Market shortly before this happens.


Sentry: Costs 5 coins. When played +1 Card +1 Action - Look at the top 2 cards of your deck. Trash and/or discard any number of them. Put the rest back on top in any order.

Sentry is a remarkably powerful trasher and sifter. Sentry will be your first buy with $5 on most Kingdoms.
Getting Sentry on one of your first two turns can be game changing. It is a trasher that does not decrease hand size. After playing Remodel, you are left with 2 fewer cards in hand than you started with. After playing Chapel for the first time, you usually don’t have any cards left at all. Sentry lets you trash without losing momentum, and you can still buy a reasonable card after trashing your junk.
This card can depend a lot on luck, especially if you open $3/$4. Seeing your Sentry after your second shuffle makes it much more likely that it hits your good cards. Despite these decreased odds, buying a Sentry on turns 3 or 4 is usually the correct move. One weakness of Sentry is that it cannot trash cards you have in your hand. Convenient ways to discard cards (e.g. Forum, Storeroom, Oasis) can help you trash your remaining Coppers and Estates, as long as you draw back around to what you discarded. This is only reliable if you are close to drawing your deck. Usually, Sentry’s ability to trash correlates to how conveniently your cards are arranged in your shuffle.
Trashing lets you see your good cards more often. In addition to trashing, Sentry lets you do this in the late game, by discarding your Victory cards or Treasures to keep your deck rolling.
Sentry can be a great addition to a money deck as well. Trashing is usually associated with an engine, since it usually slows down your first few turns, but Sentry lets you remove your Coppers and Estates with barely a loss of pace.
In Base-only games, Sentry has a notable synergy with Vassal. In this case, you are happy to look at Action cards with Sentry, since you can line them up for your Vassals. This is a strong and reliable strategy, and can handle green cards unusually well, since your Sentries can bypass them. When playing this deck, you want to play with as few Treasures as possible, and get your $ from Vassal and other Action cards. Actions with +Buy, like Market and Festival, are especially valuable.


Upgrade: Costs 5 coins. When played +1 Card +1 Action - Trash a card from your hand. Gain a card costing exactly 1 coin more than it. 

Upgrade is a strong cantrip trasher. It has a trash-for-benefit effect similar to Remodel, but compared to Remodel variants, it is much more restrictive in what cards it can gain. One important difference is that Upgrade is a cantrip rather than a terminal stop card, and is therefore much easier to use in multiples because it both is non-terminal and reduces your hand size less. Additionally, Upgrade can only gain cards that cost exactly $1 more than the one trashed. This means that it can thin Copper and Curse by trashing them without gaining any other card (unless Poor House is in the Kingdom). On the other hand, it cannot be used for some lines of play that Remodelers usually enable, such as Remodeling Gold into Province or milling Provinces. Upgrade's role varies throughout the game. In the early game, it is very effective at upgrading Estates to better cards and thinning Coppers. As a cantrip, it provides minor cycling and terminal space flexibility that many other trashers do not, and so gaining an Upgrade as your first $5 card can be a good idea. Later in the game, Upgrade functions closer to a gainer that can often enable gain-and-play as it both draws a card and is non-terminal. Similar to other Remodel variants, Upgrade is most effective at this stage in helping you build when you can provide fodder for it in some way. Less often, it can help you score in the endgame by upgrading $4 cards into Duchies or (even more rarely) $7 cards into Provinces. Upgrade generally synergizes well with cards that can provide it more expensive fodder to Upgrade. Fortress is especially enticing, as a single copy of Fortress can be repeatedly upgraded to gain other $5 Actions, or even more copies of Upgrade to upgrade the same Fortress again. You can also use Rats to convert your starting cards into Rats, and then use Upgrade to upgrade the Rats into $5 Actions. Certain cards that you gain primarily for their on-gain effect, such as Cemetery, are also good targets. Upgrade is slightly more awkward with Shelters, as unless there are viable $2 Actions, it typically upgrades them into Estates. While those can later be upgraded again, this is slower since you need two Upgrade steps to get a useful card rather than one from Estate directly.
    `;

    // Create and run the strategy graph
    const graph = createStrategyGraph();
    const initialState = {
        supplyDetails: sampleInput
    };

    graph.invoke(initialState)
        .then(result => {
            console.log("Strategy Analysis Results:");
            console.log(JSON.stringify(result, null, 2));
        })
        .catch(err => {
            console.error("Error running strategy analysis:", err);
            process.exit(1);
        });
}