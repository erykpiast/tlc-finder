#!/usr/bin/env node

const chalk = require('chalk');
const prettyTime = require('pretty-time');
const request = require('request-promise-native');

function getAllThreeLetterWords() {
    const dict = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const words = [];
    for (let i = 0; i < dict.length; i++) {
        for (let j = 0; j < dict.length; j++) {
            for (let k = 0; k < dict.length; k++) {
                words.push(dict[i] + dict[j] + dict[k]);
            }
        }
    }
    return words;
}

const all = getAllThreeLetterWords();
const exist = [];
const doesNotExist = [];

console.log(`Searching for ${all.length} words...`);

const start = process.hrtime();

all.reduce(async (prev, word) => {
    await prev;
    process.stdout.write(word + '... ');
    try {
        const {statusCode} = await request(`https://en.wikipedia.org/wiki/${word}`);
        process.stdout.write(chalk.green('OK') + '\n');
        exist.push(word);
    } catch (err) {
        process.stdout.write(chalk.red(err.statusCode) + '\n');
        if (err.statusCode === 404) {
            doesNotExist.push(word);
        }
    }
}, Promise.resolve()).then(() => {
    console.log(chalk.red(`Not existing: ${doesNotExist.length}`));
    console.log(chalk.green(`Existing: ${exist.length}`));
    console.log(`Errors: ${all.length - doesNotExist.length - exist.length}`);
    console.log(`Finished in ${prettyTime(process.hrtime(start), 's')}`);
    process.exit(0);
}, (err) => {
   console.error(err);
   process.exit(1);
});
