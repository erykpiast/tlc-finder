#!/usr/bin/env node

const chalk = require('chalk');
const request = require('request-promise-native');

async function batchProcess({ elements, perBatch }, callback) {
    for (let i = 0; i < Math.ceil(elements.length / perBatch); i++) {
        const elementsSlice = elements.slice(i * perBatch, (i + 1) * perBatch);
        await callback(elementsSlice);
    }
}

async function queryWikipediaForPages(pagesTitles) {
    // see: https://www.mediawiki.org/wiki/API:Query
    const ENDPOINT = 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2';
    const LIMIT = 50;

    const queryResult = [];

    await batchProcess({
        elements: pagesTitles,
        perBatch: LIMIT
    }, async function(pageTitlesSlice) {
        const response = await request(ENDPOINT + `&titles=${pageTitlesSlice.join('|')}`);
        const { query: { pages } } = JSON.parse(response);
        queryResult.push(...pages);
    });

    return queryResult;
}

function getAllThreeLetterWords() {
    const dict = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const words = [];
    for (let i = 0; i < dict.length - 1; i++) {
        for (let j = 0; j < dict.length - 1; j++) {
            for (let k = 0; k < dict.length - 1; k++) {
                words.push(dict[i] + dict[j] + dict[k]);
            }
        }
    }
    return words;
}

function getMaxThreeLetterWordsCountPerRow() {
    const terminalWidth = process.stdout.columns;
    return Math.floor(terminalWidth / (3 + 1));
}

function byTitleAsc(a, b) {
    return a.title.localeCompare(b.title);
}

async function reportThreeLetterWordsPagesStatus() {
    const wordsList = getAllThreeLetterWords();
    const wordsPerRow = getMaxThreeLetterWordsCountPerRow();
    let missingCount = 0;

    console.log(`Searching for ${wordsList.length} words...`);

    await batchProcess({
        elements: wordsList,
        perBatch: wordsPerRow
    }, async function (wordsInRow) {
        const pages = await queryWikipediaForPages(wordsInRow);

        const rowToPrint = pages
            .sort(byTitleAsc)
            .map(({ title, missing }) => missing ? chalk.red(title) : chalk.green(title))
            .join(' ');

        missingCount += pages.filter(({ missing }) => missing).length;

        console.log(rowToPrint);
    });

    console.log(chalk.red(`Not existing: ${missingCount}`));
    console.log(chalk.green(`Existing: ${wordsList.length - missingCount}`));
}

reportThreeLetterWordsPagesStatus()
    .catch(err => console.error(err));
