const fs = require('fs');
const Elo = require('arpad');

const rankings = JSON.parse(fs.readFileSync('rankings.json').toString());
const files = fs.readdirSync('./logs');

rankings.forEach(_ => {
    _.elo = 1000000;
});
let players = new Map(rankings.map(_ => [_.name, _]));

let results = new Map();

files.forEach(file => {
    const groups = /^\d+ (.+) vs (.+)\.log$/.exec(file);
    const winner = groups[1];
    const loser = groups[2];

    // GPT-4 was too expensive to run
    // Filtering it from the results, but leaving its games in the logs
    if (winner == 'gpt-4' || loser == 'gpt-4') {
        return;
    }

    const key = [winner, loser].sort().join('__');
    if (!results.has(key)) {
        results.set(key, {
            [winner]: 0,
            [loser]: 0,
        })
    }
    results.get(key)[winner]++;
});

// Only include AIs who play more than 3 rounds agaisnt each other.
[...results.keys()].forEach(key => {
    const data = results.get(key);
    const rounds = Object.values(data);
    if (rounds[0] + rounds[1] <= 3) {
        results.delete(key);
    }
});

console.log(JSON.stringify([...results.values()], undefined, 2));
let matchups = [...results.keys()];

const LOOPS = 10000000;
for (let i = 1; i <= LOOPS; i++) {
    let error = 0;
    const elo = new Elo();
    matchups.map((match) => {
        const data = results.get(match);
        const playerNames = Object.keys(data);
        const player1 = players.get(playerNames[0]);
        const player2 = players.get(playerNames[1]);

        // Fitting the scores can cause large gaps where odds of winning are high (ex data has one AI winning all matches)
        // Assume every AI has at least a 1% chance of winning
        const actual = Math.max(0.01, Math.min(0.99, data[player1.name] / (data[player1.name] + data[player2.name])));
        const expected = elo.expectedScore(player1.elo, player2.elo);

        if (i == LOOPS) {
            console.log(`${player1.name} vs ${player2.name}: ${actual} vs ${expected}`);
        }

        error += Math.abs(expected - actual);
        return [error, () => {
            if (actual > expected) {
                if (player2.elo == 0) {
                    return;
                }
                player1.elo++;
                player2.elo--;
            }
            if (expected > actual) {
                if (player1.elo == 0) {
                    return;
                }
                player1.elo--;
                player2.elo++;
            }
        }];
    })[Math.floor(Math.random() * matchups.length)][1]();

    if (i == 1 || i == LOOPS) {
        console.log(error);
    }
}

const randomScore = players.get('random').elo;

// Normalize scores such that random ai = 0 ELO
players.forEach(_ => _.elo -= randomScore);

rankings.sort((a, b) => b.elo - a.elo);
console.log(JSON.stringify(rankings, undefined, 2));
