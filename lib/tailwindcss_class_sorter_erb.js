import { promises as fs, existsSync, readFileSync } from "fs";
import { join } from "path";
import { format } from "prettier";
import Parser, { Query } from "tree-sitter";
import EmbeddedTemplate from "tree-sitter-embedded-template";
import HTML from "tree-sitter-html";
import Ruby from "tree-sitter-ruby";

export class TailwindCSSClassSorterERB {
    #parser;
    #embeddedTemplateQuery;
    #htmlQuery;
    #rubyQuery;

    constructor() {
        this.#parser = new Parser();

        this.#embeddedTemplateQuery = new Query(EmbeddedTemplate, this.#query("embedded_template"));
        this.#htmlQuery = new Query(HTML, this.#query("html"));
        this.#rubyQuery = new Query(Ruby, this.#query("ruby"));
    }

    async sort(code) {
        // Parse the source code using the embedded-template parser
        this.#parser.setLanguage(EmbeddedTemplate);

        const tree = this.#parser.parse(code);
        const captures = this.#embeddedTemplateQuery.captures(tree.rootNode);

        code = await this.#sortHTML(code, captures);
        code = await this.#sortRuby(code, captures);

        return code;
    }

    async #sortHTML(code, embeddedTemplateCaptures) {
        // Find the parts of the source code that are actually HTML
        let htmlRanges = embeddedTemplateCaptures
            .filter((capture) => capture.node.type == "content")
            .map((capture) => {
                return {
                    startIndex: capture.node.startIndex,
                    endIndex: capture.node.endIndex,
                    startPosition: capture.node.startPosition,
                    endPosition: capture.node.endPosition,
                };
            });

        // Parse the HTML parts of the source code using the HTML parser
        this.#parser.setLanguage(HTML);
        const htmlTree = this.#parser.parse(code, null, {
            includedRanges: htmlRanges,
        });

        // Find the class attributes in the HTML tree
        const htmlCaptures = this.#htmlQuery.captures(htmlTree.rootNode);
        const htmlClassValueCaptures = htmlCaptures.filter((capture) => capture.name == "class_value");

        // Sort the classes in each class attribute
        for (const htmlClassValueCapture of htmlClassValueCaptures) {
            for (const htmlRange of htmlRanges) {
                // Find the range of the class capture that overlaps with the HTML range
                let start = Math.max(htmlClassValueCapture.node.startIndex, htmlRange.startIndex);
                let end = Math.min(htmlClassValueCapture.node.endIndex, htmlRange.endIndex);

                // Get the class string from the range in the source code
                let classString = code.slice(start, end);

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
                classString = code.slice(start, end);
                const sortedClassString = await this.#prettierSort(classString);
                code = code.slice(0, start) + sortedClassString + code.slice(end);
            }
        }

        return code;
    }

    async #sortRuby(code, embeddedTemplateCaptures) {
        // Find the parts of the source code that are actually Ruby
        let rubyRanges = embeddedTemplateCaptures
            .filter((capture) => capture.node.type == "code")
            .map((capture) => ({
                startIndex: capture.node.startIndex,
                endIndex: capture.node.endIndex,
                startPosition: capture.node.startPosition,
                endPosition: capture.node.endPosition,
            }));

        // Parse the Ruby parts of the source code using the Ruby parser
        this.#parser.setLanguage(Ruby);
        const rubyTree = this.#parser.parse(code, null, {
            includedRanges: rubyRanges,
        });

        // Find the class attributes in the Ruby tree
        const rubyCaptures = this.#rubyQuery.captures(rubyTree.rootNode);
        const rubyClassValueCaptures = rubyCaptures.filter((capture) => capture.name == "class_value");
        const stringContentCaptures = rubyCaptures.filter((capture) => capture.name == "string_content");

        // Sort the classes in each class attribute
        for (const rubyClassValueCapture of rubyClassValueCaptures) {
            for (const stringContentCapture of stringContentCaptures) {
                // Find the range of the class capture that overlaps with the HTML range
                // TODO: We subtract/add 1 here to account for quotes that are not part of the string content capture
                let start = Math.max(rubyClassValueCapture.node.startIndex, stringContentCapture.node.startIndex - 1);
                let end = Math.min(rubyClassValueCapture.node.endIndex, stringContentCapture.node.endIndex + 1);

                // Get the class string from the range in the source code
                let classString = code.slice(start, end);

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
                classString = code.slice(start, end);
                const sortedClassString = await this.#prettierSort(classString);
                code = code.slice(0, start) + sortedClassString + code.slice(end);
            }
        }

        return code;
    }

    async #prettierSort(classString) {
        let options = {};
        if (existsSync(".prettierrc")) {
            options = JSON.parse(await fs.readFile(".prettierrc", "utf-8"));
        }
        // NOTE: Setting the print width to a large value is necessary as it messes with long lines otherwise
        options.printWidth = 99999;
        options.parser = "html";
        if (options.plugins && !options.plugins.includes("prettier-plugin-tailwindcss")) {
            options.plugins.push("prettier-plugin-tailwindcss");
        } else if (!options.plugins) {
            options.plugins = ["prettier-plugin-tailwindcss"];
        }

        const prefix = '<div class="';
        const suffix = '"></div>';
        const formatted = await format(prefix + classString + suffix, options);
        const formattedClasses = formatted.slice(formatted.indexOf(prefix) + prefix.length, formatted.indexOf(suffix));
        return formattedClasses;
    }

    #query(fileName) {
        return readFileSync(join(import.meta.dirname, "../queries", fileName + ".scm"));
    }
}
