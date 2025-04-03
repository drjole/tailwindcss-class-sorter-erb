import assert from "assert";
import { test } from "node:test";
import fs from "node:fs";
import { TailwindCSSClassSorterERB } from "../lib/tailwindcss_class_sorter_erb.js";

const sorter = new TailwindCSSClassSorterERB();

fs.readdir("tests/files", async function(_, files) {
    // For each pair of files like "a.html.erb" and "a.expected.html.erb", run a test:
    for (const file of files) {
        if (file.match(/^[a-z]\.html\.erb$/)) {
            const expectedFile = file.replace(/\.html\.erb$/, ".expected.html.erb");

            const testContent = fs.readFileSync(`tests/files/${file}`, "utf8");
            const expectedContent = fs.readFileSync(`tests/files/${expectedFile}`, "utf8");

            const testResult = await sorter.sort(testContent);

            test(`Test ${file}`, () => {
                assert.strictEqual(testResult, expectedContent);
            });
        }
    }
});
