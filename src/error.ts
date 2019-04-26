import ts from "typescript";
import {getFileNameFromSymbol, getTextSpanFromSymbol} from "./utils"

export class UnknownTypeError extends Error {
  public constructor(symbol: ts.Symbol) {
    const fileName = getFileNameFromSymbol(symbol);
    // const symbolInfo = getFileNameFromSymbol(symbol) + getTextSpanFromSymbol
    const textSpan = getTextSpanFromSymbol(symbol);
    const symbolName = symbol.name;
    const errorString = `Error during parsing type of identifier "${symbolName}" in file "${fileName}":${textSpan.pos}:${textSpan.end}.`
    super(errorString);
  }
}