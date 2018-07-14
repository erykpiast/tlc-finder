#!/usr/bin/env node

const chalk = require('chalk');
const stream = require('stream');
const { promisify } = require('util');
const prettyTime = require('pretty-time');
const stringLength = require('string-length');
const request = require('request-promise-native');

const { Readable, Transform, Writable } = stream;
const pipeline = promisify(stream.pipeline);

class ExistenceResult {
    constructor(code, exists) {
        this.code = code;
        this.exists = exists;
    }
}

/**
 * Readable stream of three letter codes
 * generated using a given dictionary.
 */
class ThreeLetterCodesStream extends Readable {
    /**
     * @param {string} dictionary
     */
    constructor(dictionary) {
        super({ objectMode: true });

        this.generator = (function* () {
            const letters = dictionary.split('');

            for (const first of letters)
                for (const second of letters)
                    for (const third of letters)
                        yield (first + second + third);
        }());
    }

    _read() {
        const { done, value } = this.generator.next();
        this.push(done ? null : value);
    }
}

/**
 * Takes incoming three letter codes and checks for
 * existence of matching pages in the wikipedia.
 */
class WikipediaPageExistenceChecker extends Transform {
    constructor() {
        super({ objectMode: true });
        this.codesBuffer = [];
        this.wikiLimit = 50;
        this.wikiEndpoint = 'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2'
    }

    /**
     * @param {Array.<string>} codes
     * @return {Promise.<Array.<ExistenceResult>>}
     */
    async validate(codes) {
        const { wikiEndpoint } = this;

        const { query: { pages } } = await request({
            uri: wikiEndpoint + `&titles=${codes.join('|')}`,
            json: true
        });

        return codes
            // mapping through codes not the pages to maintain the input order
            .map(code => pages.find(page => page.title === code))
            .map(page => new ExistenceResult(page.title, !page.missing));
    }

    async checkBuffered() {
        const { codesBuffer, wikiLimit } = this;
        const codesToCheck = codesBuffer.splice(0, wikiLimit);
        const existenceResults = await this.validate(codesToCheck);

        for (const result of existenceResults) {
            this.push(result);
        }
    }

    async _transform(chunk, _, next) {
        const { codesBuffer, wikiLimit } = this;

        codesBuffer.push(chunk);
        if (codesBuffer.length >= wikiLimit) await this.checkBuffered();
        next();
    }

    async _flush(done) {
        if (this.codesBuffer.length > 0) {
            await this.checkBuffered();
        }
        done();
    }
}

/**
 * Transforms a stream of ExistenceResults
 * into a stream of coloured strings.
 */
class StringifyAndColorify extends Transform {
    constructor() {
        super({ writableObjectMode: true });
    }

    _transform(chunk, _, next) {
        const colour = chunk.exists ? 'green' : 'red';

        this.push(chalk[colour](chunk.code));
        next();
    }
}

/**
 * Transform that inserts a line break, when
 * the text in a row is about to overflow.
 */
class WrapColumns extends Transform {
    constructor({ maxWidth }) {
        super();
        this.maxWidth = maxWidth;
        this.printedChars = 0;
    }

    _transform(chunk, _, next) {
        const toPrint = chunk + ' ';
        const toPrintLength = stringLength(toPrint);

        if (this.printedChars + toPrintLength > this.maxWidth) {
            this.push('\n');
            this.printedChars = 0;
        }

        this.push(toPrint);
        this.printedChars += toPrintLength;

        next();
    }

    _flush(done) {
        done(null, '\n');
    }
}

async function run() {
    const startTime = process.hrtime();
    const counter = { existing: 0, 'not existing': 0 };

    await pipeline(
        new ThreeLetterCodesStream('ABCDEFGHIJKLMNOPQRSTUVWXYZ'),

        new WikipediaPageExistenceChecker()
            .on('data', ({ exists }) => counter[exists ? 'existing' : 'not existing']++),

        new StringifyAndColorify(),

        new WrapColumns({ maxWidth: process.stdout.columns }),

        new Writable({
            write(chunk, _, next) {
                process.stdout.write(chunk);
                next();
            }
        })
    );

    console.log(counter);
    console.log(`Finished in ${prettyTime(process.hrtime(startTime), 's')}`);
}

run().catch(err => {
    console.error('error', err);
    process.exit(1);
});
