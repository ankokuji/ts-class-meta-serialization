"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const typescript_1 = __importDefault(require("typescript"));
const core_1 = require("./core");
const lodash_1 = __importDefault(require("lodash"));
const html_parse_stringify2_1 = __importDefault(require("html-parse-stringify2"));
function createCompilerHostWithVue(options) {
    const compilerHost = typescript_1.default.createCompilerHost(options);
    compilerHost.getSourceFile = getSourceFile;
    return compilerHost;
    function getSourceFile(fileName, languageVersion, onError) {
        let sourceText;
        if (isTransferedFromVueFile(fileName)) {
            const originalVueName = getOriginalFileNameOfVue(fileName);
            const vueSourceText = typescript_1.default.sys.readFile(originalVueName);
            sourceText = genScriptContentFromVueLikeRawText(vueSourceText);
        }
        else {
            sourceText = typescript_1.default.sys.readFile(fileName);
        }
        return sourceText !== undefined
            ? typescript_1.default.createSourceFile(fileName, sourceText, languageVersion)
            : undefined;
    }
}
function getOriginalFileNameOfVue(fileName) {
    return fileName.substr(0, fileName.length - 3);
}
function isTransferedFromVueFile(fileName) {
    const ext = lodash_1.default.takeRight(fileName.split("."), 2);
    return lodash_1.default.head(ext) === "vue";
}
/**
 * Serialize classes with a .vue file entry.
 *
 * @export
 * @param {string[]} rootNames
 * @returns
 */
function serializeVueFiles(rootNames) {
    const newRootNames = preprocessFilePath(rootNames);
    return core_1.serializeAllDecoratedClass(newRootNames, createCompilerHostWithVue);
}
exports.serializeVueFiles = serializeVueFiles;
function preprocessFilePath(rootNames) {
    return rootNames.map(rootName => {
        if (isDotVueFile(rootName)) {
            return rootName + ".ts";
        }
        else {
            return rootName;
        }
    });
    function isDotVueFile(fileName) {
        return (fileName.length >= 4 && fileName.substr(fileName.length - 4, 4) === ".vue");
    }
}
/**
 * This function may not work properly in some situations.
 * Need to be considered precisely.
 * Maybe change the implementation.
 *
 * @param content
 * @returns
 */
function genScriptContentFromVueLikeRawText(content) {
    if (!content) {
        return undefined;
    }
    const ast = html_parse_stringify2_1.default.parse(content);
    const script = ast
        .filter((node) => {
        return node.name === "script";
    })
        .map((node) => {
        return node.children[0].content;
    });
    return script[0];
}
