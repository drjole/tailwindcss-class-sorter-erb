import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { format } from "prettier";
import Parser, { Query } from "tree-sitter";
import EmbeddedTemplate from "tree-sitter-embedded-template";
import HTML from "tree-sitter-html";
import Ruby from "tree-sitter-ruby";

export async function formatSourceCode(sourceCode) {
    // Parse the source code using the embedded-template parser
    parser.setLanguage(EmbeddedTemplate);
    const embeddedTemplateTree = parser.parse(sourceCode);

    sourceCode = await sortHTMLClasses(sourceCode, embeddedTemplateTree);
    sourceCode = await sortRubyClasses(sourceCode, embeddedTemplateTree);

    return sourceCode;
}

const parser = new Parser();
const htmlQuery = new Query(
    HTML,
    readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), "../queries/html.scm"),
    ),
);
const rubyQuery = new Query(
    Ruby,
    readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), "../queries/ruby.scm"),
    ),
);

async function sortHTMLClasses(sourceCode, tree) {
    // Find the parts of the source code that are actually HTML
    let htmlRanges = [];
    for (const childNode of tree.rootNode.children) {
        if (childNode.type == "content") {
            htmlRanges.push({
                startIndex: childNode.startIndex,
                endIndex: childNode.endIndex,
                startPosition: childNode.startPosition,
                endPosition: childNode.endPosition,
            });
        }
    }

    // Parse the HTML parts of the source code using the HTML parser
    parser.setLanguage(HTML);
    const htmlTree = parser.parse(sourceCode, null, {
        includedRanges: htmlRanges,
    });

    // Find the class attributes in the HTML tree
    const htmlClassValueCaptures = htmlQuery
        .captures(htmlTree.rootNode)
        .filter((capture) => capture.name == "quoted_class_value");

    // Sort the classes in each class attribute
    for (const htmlClassValueCapture of htmlClassValueCaptures) {
        for (const htmlRange of htmlRanges) {
            // Find the range of the class capture that overlaps with the HTML range
            let start = Math.max(
                htmlClassValueCapture.node.startIndex,
                htmlRange.startIndex,
            );
            let end = Math.min(
                htmlClassValueCapture.node.endIndex,
                htmlRange.endIndex,
            );

            // Get the class string from the range in the source code
            let classString = sourceCode.slice(start, end);

            // Adjust the start end end of the range to account for the quotes at the beginning and end of the class attribute
            // as well as for the class names that are part of an ERB tag like `asdf-<%= someRubyCode %>`.
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

            // Build the class string to be sorted
            classString = sourceCode.slice(start, end);
            const sortedClassString = await sortClasses(classString);
            sourceCode =
                sourceCode.slice(0, start) +
                sortedClassString +
                sourceCode.slice(end);
        }
    }

    return sourceCode;
}

async function sortRubyClasses(sourceCode, tree) {
    // Find the parts of the source code that are actually Ruby
    let rubyRanges = [];
    for (const childNode of tree.rootNode.children) {
        if (childNode.type == "output_directive") {
            const codeNode = childNode.children.find(
                (node) => node.type == "code",
            );
            if (codeNode) {
                rubyRanges.push({
                    startIndex: codeNode.startIndex,
                    endIndex: codeNode.endIndex,
                    startPosition: codeNode.startPosition,
                    endPosition: codeNode.endPosition,
                });
            }
        }
    }

    // Parse the Ruby parts of the source code using the Ruby parser
    parser.setLanguage(Ruby);
    const rubyTree = parser.parse(sourceCode, null, {
        includedRanges: rubyRanges,
    });

    // Find the class attributes in the Ruby tree
    const rubyClassValueCaptures = rubyQuery
        .captures(rubyTree.rootNode)
        .filter((capture) => capture.name == "class_value");

    // Sort the classes in each class attribute
    for (const rubyClassValueCapture of rubyClassValueCaptures) {
        const start = rubyClassValueCapture.node.startIndex;
        const end = rubyClassValueCapture.node.endIndex;
        const classString = sourceCode.slice(start, end);
        const sortedClassString = await sortClasses(classString);
        sourceCode =
            sourceCode.slice(0, start) +
            sortedClassString +
            sourceCode.slice(end);
    }

    return sourceCode;
}

async function sortClasses(classes) {
    let options = JSON.parse(readFileSync(".prettierrc", "utf-8"));
    options.parser = "html";
    if (options.plugins) {
        options.plugins.push("prettier-plugin-tailwindcss");
    } else {
        options.plugins = ["prettier-plugin-tailwindcss"];
    }
    const prefix = '<div class="';
    const suffix = '"></div>';
    const formatted = await format(prefix + classes + suffix, options);
    const formattedClasses = formatted.slice(
        formatted.indexOf(prefix) + prefix.length,
        formatted.indexOf(suffix),
    );
    return formattedClasses;
}
