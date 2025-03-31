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

const parser = new Parser();

const embeddedQuery = new Query(
    EmbeddedTemplate,
    readFileSync(join(__dirname, "../queries/embedded_template.scm")),
);
const htmlQuery = new Query(
    HTML,
    readFileSync(join(__dirname, "../queries/html.scm")),
);
const rubyQuery = new Query(
    Ruby,
    readFileSync(join(__dirname, "../queries/ruby.scm")),
);

async function formatSourceCode(sourceCode) {
    parser.setLanguage(EmbeddedTemplate);
    const embeddedTemplateTree = parser.parse(sourceCode);
    let htmlRanges = [];
    for (const childNode of embeddedTemplateTree.rootNode.children) {
        if (childNode.type == "content") {
            htmlRanges.push({
                startIndex: childNode.startIndex,
                endIndex: childNode.endIndex,
                startPosition: childNode.startPosition,
                endPosition: childNode.endPosition,
            });
        }
    }

    parser.setLanguage(HTML);
    const htmlTree = parser.parse(sourceCode, null, {
        includedRanges: htmlRanges,
    });
    const htmlClassValueCaptures = htmlQuery
        .captures(htmlTree.rootNode)
        .filter((capture) => capture.name == "quoted_class_value");

    for (const htmlClassValueCapture of htmlClassValueCaptures) {
        for (const htmlRange of htmlRanges) {
            let start = Math.max(
                htmlClassValueCapture.node.startIndex,
                htmlRange.startIndex,
            );
            let end = Math.min(
                htmlClassValueCapture.node.endIndex,
                htmlRange.endIndex,
            );
            if (end < start) {
                continue;
            }
            let classString = sourceCode.slice(start, end);
            const matches = [...classString.matchAll(/["\s]/g)];
            if (matches.length <= 0) {
                continue;
            }
            const startOffset = matches[0].index;
            const endOffset = matches[matches.length - 1].index;
            end = start + endOffset;
            start += startOffset + 1;
            if (end <= start) {
                continue;
            }

            classString = sourceCode.slice(start, end);
            sourceCode = sourceCode.split("");
            sourceCode.splice(
                start,
                end - start,
                await sortClasses(classString),
            );
            sourceCode = sourceCode.join("");
        }
    }

    return sourceCode;
}

function htmlCaptures(sourceCode) {
    const htmlParser = new Parser();
    htmlParser.setLanguage(HTML);
    const tree = htmlParser.parse(sourceCode);
    return htmlQuery
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
    const formatted = await format(`<div class="${classes}"></div>`, options);
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
