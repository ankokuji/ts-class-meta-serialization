import ts from "typescript";
import { serializeTsFiles, serializer } from "./core";
import _ from "lodash";

/**
 * Create a compiler host for loading .vue single file component with typescript compiler.
 *
 * @param {ts.CompilerOptions} options
 * @returns
 */
function createCompilerHostWithVue(
  options: ts.CompilerOptions
): ts.CompilerHost {
  const compilerHost = ts.createCompilerHost(options);
  compilerHost.getSourceFile = getSourceFile;
  return compilerHost;

  function getSourceFile(
    fileName: string,
    languageVersion: ts.ScriptTarget,
    onError?: (message: string) => void
  ) {
    let sourceText;
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

/**
 * Get the vue original file name. Delete the tail of `.ts`.
 *
 * @param {string} fileName
 * @returns {string}
 */
function getOriginalFileNameOfVue(fileName: string): string {
  return fileName.substr(0, fileName.length - 3);
}

/**
 * Return `true` if the file name is modified from a original .vue file.
 *
 * @param {string} fileName
 * @returns {boolean}
 */
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
export function serializeVueFiles(rootNames: string[], options?: serializer.SerializerOptions) {
  const newRootNames = preprocessFilePath(rootNames);
  return serializeTsFiles(newRootNames, {
    ...options,
    compilerHostGenerator: createCompilerHostWithVue
  });
}

function preprocessFilePath(rootNames: string[]) {
  return rootNames.map(rootName => {
    if (isDotVueFile(rootName)) {
      return rootName + ".ts";
    } else {
      return rootName;
    }
  });

  /**
   * Is a `.vue` file name or not.
   *
   * @param {string} fileName
   * @returns {boolean}
   */
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
function genScriptContentFromVueLikeRawText(
  content: string | undefined
): string | undefined {
  if (!content) {
    return undefined;
  }
  const openTagString = `<script lang="ts">`;
  const closeTagString = `</script>`;
  const start = content.indexOf(openTagString) + openTagString.length;
  const end = content.indexOf(closeTagString);
  return content.substring(start, end);
}
