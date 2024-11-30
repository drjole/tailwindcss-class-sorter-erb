import { exit } from "process";
import { readFileSync, writeFileSync } from "fs";

import { format } from "prettier";

import Parser, { Query } from "tree-sitter";
import EmbeddedTemplate from "tree-sitter-embedded-template";
import HTML from "tree-sitter-html";
import Ruby from "tree-sitter-ruby";

const embeddedParser = new Parser();
embeddedParser.setLanguage(EmbeddedTemplate);
const embeddedQuery = new Query(
    EmbeddedTemplate,
    readFileSync("queries/embedded_template.scm")
);

const htmlParser = new Parser();
htmlParser.setLanguage(HTML);
const htmlQuery = new Query(HTML, readFileSync("queries/html.scm"));

const rubyParser = new Parser();
rubyParser.setLanguage(Ruby);
const rubyQuery = new Query(Ruby, readFileSync("queries/ruby.scm"));

async function formatSourceCode(sourceCode: string): Promise<string> {
    const captures = [
        ...htmlCaptures(sourceCode).map((htmlCapture) => ({
            ...htmlCapture,
            codeStartIndex: 0,
        })),
        ...embeddedCaptures(sourceCode).flatMap((embeddedCapture) =>
            rubyCaptures(embeddedCapture.node.text).map((rubyCapture) => ({
                ...rubyCapture,
                codeStartIndex: embeddedCapture.node.startIndex,
            }))
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
            sourceCode = `${before}${sortedClasses}${after}`;
        }
    }
    return sourceCode;
}

function embeddedCaptures(sourceCode: string) {
    const tree = embeddedParser.parse(sourceCode);
    return embeddedQuery.captures(tree.rootNode);
}

function htmlCaptures(sourceCode: string) {
    const tree = htmlParser.parse(sourceCode);
    return htmlQuery.captures(tree.rootNode).filter((capture) => capture.name === "class_value");
}

function rubyCaptures(sourceCode: string) {
    const tree = rubyParser.parse(sourceCode);
    return rubyQuery.captures(tree.rootNode).filter((capture) => capture.name === "class_value");
}

async function sortClasses(classes: string): Promise<string> {
    const formatted = await format(`<div class="${classes}"></div>`, {
        parser: "html",
        plugins: ["prettier-plugin-tailwindcss"],
    });
    const formattedClasses = htmlCaptures(formatted).find((capture) => capture.name === "class_value");
    if (!formattedClasses) {
        throw new Error("Could not find formatted classes");
    }
    return formattedClasses.node.text;
}

async function main() {
    const args = process.argv.slice(2);
    const write = args.includes("--write");
    const filePaths = args.filter((arg) => !arg.startsWith("--"));
    if (filePaths.length === 0) {
        console.error("No files specified");
        exit(1);
    }

    if (!write && filePaths.length > 1) {
        console.error("Cannot format multiple files without --write");
        exit(1);
    }

    for (const filePath of filePaths) {
        const sourceCode = readFileSync(filePath).toString();
        const formattedCode = await formatSourceCode(sourceCode);
        if (write) {
            writeFileSync(filePath, formattedCode);
        } else {
            console.log(formattedCode);
        }
    }
}

main();
