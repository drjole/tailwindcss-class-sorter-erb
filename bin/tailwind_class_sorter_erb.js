#!/usr/bin/env node

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { program } from "commander";
import { format } from "prettier";
import Parser, { Query } from "tree-sitter";
import EmbeddedTemplate from "tree-sitter-embedded-template";
import HTML from "tree-sitter-html";
import Ruby from "tree-sitter-ruby";

const __dirname = dirname(fileURLToPath(import.meta.url));

const embeddedParser = new Parser();
embeddedParser.setLanguage(EmbeddedTemplate);
const embeddedQuery = new Query(
    EmbeddedTemplate,
    readFileSync(join(__dirname, "../queries/embedded_template.scm")),
);

const htmlParser = new Parser();
htmlParser.setLanguage(HTML);
const htmlQuery = new Query(
    HTML,
    readFileSync(join(__dirname, "../queries/html.scm")),
);

const rubyParser = new Parser();
rubyParser.setLanguage(Ruby);
const rubyQuery = new Query(
    Ruby,
    readFileSync(join(__dirname, "../queries/ruby.scm")),
);

async function formatSourceCode(sourceCode) {
    const captures = [
        ...htmlCaptures(sourceCode).map((htmlCapture) => ({
            ...htmlCapture,
            codeStartIndex: 0,
        })),
        ...embeddedCaptures(sourceCode).flatMap((embeddedCapture) =>
            rubyCaptures(embeddedCapture.node.text).map((rubyCapture) => ({
                ...rubyCapture,
                codeStartIndex: embeddedCapture.node.startIndex,
            })),
        ),
    ];

    for (const capture of captures) {
        if (capture.name === "class_value") {
            const classes = capture.node.text;
            const sortedClasses = await sortClasses(classes);
            const before = sourceCode.slice(
                0,
                capture.codeStartIndex + capture.node.startIndex,
            );
            const after = sourceCode.slice(
                capture.codeStartIndex + capture.node.endIndex,
            );
            const additionalNewLines = Array(
                classes.split("\n").length - sortedClasses.split("\n").length,
            )
                .fill("\n")
                .join("");
            const additionalWhiteSpace = Array(
                classes.length -
                sortedClasses.length -
                additionalNewLines.length,
            )
                .fill(" ")
                .join("");
            sourceCode = `${before}${sortedClasses}${additionalNewLines}${additionalWhiteSpace}${after}`;
        }
    }
    return sourceCode;
}

function embeddedCaptures(sourceCode) {
    const tree = embeddedParser.parse(sourceCode);
    return embeddedQuery.captures(tree.rootNode);
}

function htmlCaptures(sourceCode) {
    const tree = htmlParser.parse(sourceCode);
    return htmlQuery
        .captures(tree.rootNode)
        .filter((capture) => capture.name === "class_value");
}

function rubyCaptures(sourceCode) {
    const tree = rubyParser.parse(sourceCode);
    return rubyQuery
        .captures(tree.rootNode)
        .filter((capture) => capture.name === "class_value");
}

async function sortClasses(classes) {
    let options = JSON.parse(readFileSync(".prettierrc", "utf-8"));
    options.parser = "html";
    if (options.plugins) {
        options.plugins.push("prettier-plugin-tailwindcss");
    } else {
        options.plugins = ["prettier-plugin-tailwindcss"];
    }
    const formatted = await format(`<div class=${classes}></div>`, options);
    const formattedClasses = htmlCaptures(formatted).find(
        (capture) => capture.name === "class_value",
    );
    if (!formattedClasses) {
        throw new Error("Could not find formatted classes");
    }
    return formattedClasses.node.text;
}

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
            for (const file of files) {
                const sourceCode = readFileSync(file, "utf-8").toString();
                const formattedCode = await formatSourceCode(sourceCode);
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
