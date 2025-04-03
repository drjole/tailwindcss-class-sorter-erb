#!/usr/bin/env node

import { readFileSync, writeFileSync } from "fs";
import { program } from "commander";
import { TailwindCSSClassSorterERB } from "../lib/tailwindcss_class_sorter_erb.js";

async function main() {
    program
        .option("--write")
        .argument("[files...]")
        .action(async (fileArgs, options) => {
            if (fileArgs.length == 0 && options.write) {
                console.error("Cannot use --write when passing code via stdin");
                process.exit(1);
            }

            const files = fileArgs.length == 0 ? [0] : fileArgs;
            const sorter = new TailwindCSSClassSorterERB();
            for (const file of files) {
                const sourceCode = readFileSync(file, "utf-8").toString();
                const formattedCode = await sorter.sort(sourceCode);
                if (options.write) {
                    writeFileSync(file, formattedCode);
                } else {
                    process.stdout.write(formattedCode);
                }
            }
        });

    program.parse();
}

main();
