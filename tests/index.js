import assert from "assert";
import { test } from "node:test";
import { promises as fs } from "node:fs";
import { TailwindCSSClassSorterERB } from "../lib/tailwindcss_class_sorter_erb.js";

const sorter = new TailwindCSSClassSorterERB();

async function loadTests() {
    const files = await fs.readdir("tests/files");

    for (const file of files) {
        if (file.match(/^[a-z]+\.html\.erb$/)) {
            const expectedFile = file.replace(/\.html\.erb$/, ".expected.html.erb");

            // Define a test per file
            test(`Test ${file}`, async () => {
                const [testContent, expectedContent] = await Promise.all([
                    fs.readFile(`tests/files/${file}`, "utf8"),
                    fs.readFile(`tests/files/${expectedFile}`, "utf8"),
                ]);

                const testResult = await sorter.sort(testContent);
                assert.strictEqual(testResult, expectedContent);
            });
        }
    }
}

await loadTests();
