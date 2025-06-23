#!/usr/bin/env node

import { promises as fs } from "fs";
import { program } from "commander";
import { TailwindCSSClassSorterERB } from "../lib/tailwindcss_class_sorter_erb.js";

async function main() {
    program
        .option("--write")
        .argument("[files...]")
        .action(async (fileArgs, options) => {
            if (fileArgs.length === 0 && options.write) {
                console.error("Cannot use --write when reading from stdin.");
                process.exit(1);
            }

            if (fileArgs.length > 1 && !options.write) {
                console.error("Cannot process multiple files without --write option.");
                process.exit(1);
            }

            const files = fileArgs.length == 0 ? [0] : fileArgs;
            const sorter = new TailwindCSSClassSorterERB();
            await Promise.all(
                files.map(async (file) => {
                    const sourceCode = await fs.readFile(file, "utf-8");
                    const formattedCode = await sorter.sort(sourceCode);
                    if (options.write) {
                        await fs.writeFile(file, formattedCode);
                    } else {
                        process.stdout.write(formattedCode);
                    }
                }),
            );
        });

    program.parse();
}

main();
