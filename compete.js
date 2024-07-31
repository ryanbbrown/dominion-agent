// @ts-check

const fs = require('fs');
const { spawn } = require('child_process');
const Elo = require('arpad');

const rankings = JSON.parse(fs.readFileSync('rankings.json').toString());

async function runRound(done) {
    const filteredRankings = rankings.filter(r => !r.exclude);

    let player1, player2;
    const force = '';
    do {
        const index = Math.floor(Math.random() * (filteredRankings.length - 1));
        player1 = filteredRankings[index];
        player2 = filteredRankings[index + 1];
    } while (force && player1?.name != force && player2?.name != force);

    if (Math.random() > 0.5) {
        const swap = player1;
        player1 = player2;
        player2 = swap;
    }

    const child = spawn(`node --inspect ./lib/main.js --player ${player1.name} --player ${player2.name}`, {
        shell: true,
    });

    const output = [];
    child.stdout.on('data', chunk => {
        process.stdout.write(chunk);
        const str = chunk.toString();
        output.push(str);
    });

    child.stderr.on('data', chunk => {
        process.stderr.write(chunk);
    });

    child.on('close', code => {
        if (code != 0) {
            throw new Error(`Process exited with code ${code}`);
        }

        console.log();
        setImmediate(() => {
            const fullLog = output.join('');
            const winnerName = fullLog.trim().split('\n').slice(-1)[0];

            if (!winnerName || !(player1.name == winnerName || player2.name == winnerName)) {
                throw new Error(`Failed to parse winner from logs`);
            }

            const winner = player1.name == winnerName ? player1 : player2;
            const loser = player1.name == winnerName ? player2 : player1;

            const elo = new Elo();
            const newWinningScore = elo.newRatingIfWon(winner.elo, loser.elo);
            const newLosingScore = elo.newRatingIfLost(loser.elo, winner.elo);

            console.log(`${winner.name} elo ${winner.elo} -> ${newWinningScore}`);
            console.log(`${loser.name} elo ${loser.elo} -> ${newLosingScore}`);

            winner.elo = newWinningScore;
            loser.elo = newLosingScore;

            rankings.sort((a, b) => {
                return b.elo - a.elo;
            });

            fs.writeFileSync(`logs/${Date.now()} ${winner.name} vs ${loser.name}.log`, fullLog);
            fs.writeFileSync('rankings.json', JSON.stringify(rankings, undefined, 2));

            done();
        });
    });
}

(async () => {
    while (true) {
        await new Promise((done) => {
            runRound(done);
        });
    }
})();