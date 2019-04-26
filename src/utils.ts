import ts from "typescript";

/**
 * Transform function into a curried function with 2 parameters.
 *
 * @export
 * @param {Function} func
 * @returns
 */
export const curryRight2 = <T, U, V>(func: (arg1: T, arg2: U) => V) => (
  arg2: U
) => (arg1: T): V => func(arg1, arg2);

/**
 * Transform function into a curried function with 3 parameters.
 *
 * @export
 * @param {Function} func
 * @returns
 */
export const curryRight3 = <T, U, V, W>(
  func: (arg1: T, arg2: U, arg3: V) => W
) => (arg3: V) => (arg2: U) => (arg1: T): W => func(arg1, arg2, arg3);


export function getIdentificationOfSymbol(symbol: ts.Symbol): string {
  const fileName = getFileNameFromSymbol(symbol);
  return `${fileName}-${symbol.getName()}`;
}

export function getTextSpanFromSymbol(symbol: ts.Symbol): ts.TextRange {
  let declaration;
  if (symbol.valueDeclaration) {
    declaration = symbol.valueDeclaration;
  } else {
    declaration = symbol.declarations.slice()[0];
  }
  return {
    pos: declaration.pos,
    end: declaration.end
  };
}

export function getFileNameFromSymbol(symbol: ts.Symbol): string {
  let sourceFile: ts.SourceFile;
  if (symbol.valueDeclaration) {
    // If value declaration exists.
    sourceFile = symbol.valueDeclaration.getSourceFile();
  } else {
    sourceFile = symbol.declarations.slice()[0].getSourceFile();
  }
  return sourceFile.fileName;
}