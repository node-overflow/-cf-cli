#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import readline from 'readline';

const args = process.argv.slice(2);

const promptUsername = () => new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(chalk.yellow('Enter Codeforces username: '), ans => {
        rl.close();
        resolve(ans.trim());
    });
});

const main = async () => {
    let usernames = args;
    if (usernames.length === 0) {
        const singleUser = await promptUsername();
        if (!singleUser) {
            console.log(chalk.red('Username is invalid.'));
            process.exit(1);
        }
        usernames = [singleUser];
    }
    for (const u of usernames) await fetchUser(u);
};

const downloadAvatar = async (url, dir) => {
    if (!url) return;
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to download avatar');
        const buffer = Buffer.from(await res.arrayBuffer());
        await fs.writeFile(path.join(dir, 'avatar.png'), buffer);
        console.log('Avatar saved as avatar.png');
    } catch (err) {
        console.log('Avatar download error:', err.message);
    }
};

const fetchUser = async username => {
    try {
        console.log(chalk.cyan.bold(`\nFetching insights for ${username}...\n`));

        const userRes = await fetch(`https://codeforces.com/api/user.info?handles=${username}`);
        const userData = await userRes.json();
        if (userData.status !== 'OK') throw new Error('User not found');
        const user = userData.result[0];

        const contestsRes = await fetch(`https://codeforces.com/api/user.rating?handle=${username}`);
        const contestsData = await contestsRes.json();
        const contests = contestsData.status === 'OK' ? contestsData.result : [];

        const subsRes = await fetch(`https://codeforces.com/api/user.status?handle=${username}&from=1&count=10000`);
        const subsData = await subsRes.json();
        const submissions = subsData.status === 'OK' ? subsData.result : [];

        const solvedSet = new Set();
        const tagCount = {};
        const langCount = {};
        const ratingCount = {};
        const verdictCount = {};
        const monthCount = {};
        const hourCount = {};
        submissions.forEach(s => {
            if (s.verdict) verdictCount[s.verdict] = (verdictCount[s.verdict] || 0) + 1;
            if (s.verdict === 'OK') {
                const pid = `${s.problem.contestId}${s.problem.index}`;
                solvedSet.add(pid);
                langCount[s.programmingLanguage] = (langCount[s.programmingLanguage] || 0) + 1;
                const rat = s.problem.rating ?? 'Unknown';
                ratingCount[rat] = (ratingCount[rat] || 0) + 1;
                if (Array.isArray(s.problem.tags)) s.problem.tags.forEach(tag => tagCount[tag] = (tagCount[tag] || 0) + 1);
                const time = new Date(s.creationTimeSeconds * 1000);
                const mon = `${time.getFullYear()}-${String(time.getMonth() + 1).padStart(2, '0')}`;
                monthCount[mon] = (monthCount[mon] || 0) + 1;
                const hour = time.getHours();
                hourCount[hour] = (hourCount[hour] || 0) + 1;
            }
        });

        const solved = Array.from(solvedSet).sort();
        const dir = path.join(process.cwd(), `insights-${username}`);
        await fs.ensureDir(dir);

        let insights = chalk.bold.underline(`Codeforces Insights for ${username}\n`);
        insights += '==============================\n';
        insights += `Handle: ${user.handle}\n`;
        insights += `Name: ${user.firstName ?? ''} ${user.lastName ?? ''}\n`;
        insights += `Contribution: ${user.contribution ?? 'N/A'}\n`;
        insights += `Friends: ${user.friendOfCount ?? 0}\n`;
        insights += `Organization: ${user.organization ?? 'N/A'}\n`;
        insights += `Country: ${user.country ?? 'N/A'}\n`;
        insights += `Avatar: ${user.titlePhoto ?? 'N/A'}\n`;
        insights += `Registration: ${new Date(user.registrationTimeSeconds * 1000).toLocaleDateString()}\n\n`;
        insights += `Current Rating: ${user.rating ?? 'Unrated'}\n`;
        insights += `Max Rating: ${user.maxRating ?? 'Unrated'}\n`;
        insights += `Rank: ${user.rank ?? 'Unrated'}\n`;
        insights += `Max Rank: ${user.maxRank ?? 'Unrated'}\n`;
        insights += `Number of Contests: ${contests.length}\n`;
        insights += `Problems Solved: ${solved.length}\n`;
        insights += `Languages Used: ${Object.keys(langCount).length}\n`;
        insights += `Problem Tags Counted: ${Object.keys(tagCount).length}\n\n`;

        insights += 'Languages Breakdown:\n';
        Object.entries(langCount).sort((a, b) => b[1] - a[1]).forEach(([l, c]) => insights += ` - ${l}: ${c}\n`);
        insights += '\nProblem Tags Breakdown:\n';
        Object.entries(tagCount).sort((a, b) => b[1] - a[1]).forEach(([t, c]) => insights += ` - ${t}: ${c}\n`);
        insights += '\nProblems per Rating:\n';
        Object.entries(ratingCount).sort((a, b) => (a[0] === 'Unknown' ? Infinity : a[0]) - (b[0] === 'Unknown' ? Infinity : b[0])).forEach(([r, c]) => insights += ` - ${r}: ${c}\n`);
        insights += '\nSubmission Verdicts:\n';
        Object.entries(verdictCount).sort((a, b) => b[1] - a[1]).forEach(([v, c]) => insights += ` - ${v}: ${c}\n`);
        insights += '\nProblems per Month:\n';
        Object.entries(monthCount).sort().forEach(([m, c]) => insights += ` - ${m}: ${c}\n`);
        insights += '\nMost Active Hours (0-23):\n';
        Object.entries(hourCount).sort((a, b) => a[0] - b[0]).forEach(([h, c]) => insights += ` - ${h}:00 => ${c}\n`);
        insights += '\nFirst Problem Solved: ' + (submissions.length ? new Date(submissions.find(s => s.verdict === 'OK')?.creationTimeSeconds * 1000).toLocaleDateString() : 'N/A') + '\n';
        insights += 'Last Problem Solved: ' + (submissions.length ? new Date([...submissions].reverse().find(s => s.verdict === 'OK')?.creationTimeSeconds * 1000).toLocaleDateString() : 'N/A') + '\n';

        await fs.writeFile(path.join(dir, 'insights.txt'), insights);

        let contestsTxt = 'Last 50 Contests (Name | Rating | Delta)\n';
        contests.slice(-50).forEach(c => {
            const delta = c.newRating - c.oldRating;
            contestsTxt += `${c.contestName} | ${c.newRating} | ${delta >= 0 ? '+' : ''}${delta}\n`;
        });
        await fs.writeFile(path.join(dir, 'contests.txt'), contestsTxt);

        await fs.writeFile(path.join(dir, 'problems.txt'), solved.join('\n'));

        let langTxt = 'Languages used:\n';
        Object.entries(langCount).sort((a, b) => b[1] - a[1]).forEach(([l, c]) => langTxt += `${l}: ${c}\n`);
        await fs.writeFile(path.join(dir, 'languages.txt'), langTxt);

        let tagsTxt = 'Problem tags frequency:\n';
        Object.entries(tagCount).sort((a, b) => b[1] - a[1]).forEach(([t, c]) => tagsTxt += `${t}: ${c}\n`);
        await fs.writeFile(path.join(dir, 'tags.txt'), tagsTxt);

        let graph = 'Rating Graph (last 50 contests):\n';
        const lastRatings = contests.slice(-50).map(c => c.newRating);
        const maxR = Math.max(...lastRatings, 0);
        const minR = Math.min(...lastRatings, 0);
        lastRatings.forEach(r => { const bars = Math.round(((r - minR) / (maxR - minR || 1)) * 50); graph += `${r} | ${'█'.repeat(bars)}\n`; });
        await fs.writeFile(path.join(dir, 'rating_graph.txt'), graph);

        let ratingFile = 'Problems solved per rating:\n';
        Object.entries(ratingCount).sort((a, b) => (a[0] === 'Unknown' ? Infinity : a[0]) - (b[0] === 'Unknown' ? Infinity : b[0])).forEach(([rat, count]) => ratingFile += `${rat}: ${count}\n`);
        await fs.writeFile(path.join(dir, 'problems_per_rating.txt'), ratingFile);

        await downloadAvatar(user.titlePhoto, dir);

        console.log(chalk.green.bold(`Insights saved in folder: ${dir}`));
        console.log(chalk.yellow('Files: insights.txt | contests.txt | problems.txt | languages.txt | tags.txt | rating_graph.txt | problems_per_rating.txt'));

    } catch (err) {
        console.error(chalk.red(`Error fetching ${username}: ${err.message}`));
    }
};

await main();
