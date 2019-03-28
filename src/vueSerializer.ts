import ts from "typescript";
import { serializeAllDecoratedClass } from "./core";
import _ from "lodash";
import parser2 from "html-parse-stringify2";

interface HtmlParsedNode {
  name: string;
  children?: HtmlParsedNode[]
  content: string;
}

function createCompilerHostWithVue(options: ts.CompilerOptions) {
  const compilerHost = ts.createCompilerHost(options);
  compilerHost.getSourceFile = getSourceFile;
  return compilerHost;

  function getSourceFile(
    fileName: string,
    languageVersion: ts.ScriptTarget,
    onError?: (message: string) => void
  ) {
    let sourceText
    if (isTransferedFromVueFile(fileName)) {
      const originalVueName = getOriginalFileNameOfVue(fileName);
      const vueSourceText = ts.sys.readFile(originalVueName);
      sourceText = genScriptContentFromVueLikeRawText(vueSourceText);
    } else {
      sourceText = ts.sys.readFile(fileName);
    }
    
    return sourceText !== undefined
      ? ts.createSourceFile(fileName, sourceText, languageVersion)
      : undefined;
  }
}

function getOriginalFileNameOfVue(fileName: string): string {
  return fileName.substr(0, fileName.length - 3);
}

function isTransferedFromVueFile(fileName: string): boolean {
  const ext = _.takeRight(fileName.split("."), 2);
  return _.head(ext) === "vue";
}

/**
 * Serialize classes with a .vue file entry.
 *
 * @export
 * @param {string[]} rootNames
 * @returns
 */
export function serializeVueFiles(rootNames: string[]) {
  const newRootNames = preprocessFilePath(rootNames);
  return serializeAllDecoratedClass(newRootNames, createCompilerHostWithVue);
}

function preprocessFilePath(rootNames: string[]) {
  return rootNames.map(rootName => {
    if (isDotVueFile(rootName)) {

      return rootName + ".ts";
    } else {
      return rootName;
    }
  });

  function isDotVueFile(fileName: string): boolean {
    return (
      fileName.length >= 4 && fileName.substr(fileName.length - 4, 4) === ".vue"
    );
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
function genScriptContentFromVueLikeRawText(content: string | undefined): string | undefined {
  if(!content) {
    return undefined
  }
  const ast = parser2.parse(content);
  const script = ast
    .filter((node: HtmlParsedNode) => {
      return node.name === "script";
    })
    .map((node: HtmlParsedNode) => {
      return node.children![0].content;
    });
  return script[0];
}