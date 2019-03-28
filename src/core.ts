import ts, { isJSDocUnknownType } from "typescript";
import _ from "lodash";

const invertedTypeFlag = _.invert(ts.TypeFlags);
const invertedSymbolFlag = _.invert(ts.SymbolFlags);

interface SerializedComplexType {}

interface SerializedSymbol {
  type: string | undefined;
  name: string;
  text: string | undefined;
}

interface ClassDepMap {
  [id: string]: DepMapItem;
}

interface DepMapItem {
  type: ts.Type;
  symbolFlags: ts.SymbolFlags;
  fileName: string;
  textRange: ts.TextRange;
}

/**
 * This is exported and will create a program of a set of typescript entry files and
 * serialize all class decorated by `Component`.
 *
 * @param {string[]} rootNames
 * @returns
 */
export function serializeAllDecoratedClass(
  rootNames: string[],
  compilerHostGenerator?: (options: ts.CompilerOptions) => ts.CompilerHost
) {
  const compilerOptions = {
    target: ts.ScriptTarget.ES5,
    module: ts.ModuleKind.CommonJS,
    types: []
  };
  const compilerHost = compilerHostGenerator
    ? compilerHostGenerator(compilerOptions)
    : undefined;
  const program = compilerHost
    ? ts.createProgram(rootNames, compilerOptions, compilerHost)
    : ts.createProgram(rootNames, compilerOptions);

  const typeChecker = program.getTypeChecker();
  const output: any[] = [];
  for (const sourceFile of program.getSourceFiles()) {
    if (!sourceFile.isDeclarationFile) {
      const innerOutput = []
      ts.forEachChild(sourceFile, _.curryRight(visit)(innerOutput)(typeChecker));
      if (innerOutput.length !== 0) {
        output.push({
          fileName: sourceFile.fileName,
          result: innerOutput
        })
      }
    }
  }
  return output;
}

function visit(node: ts.Node, checker: ts.TypeChecker, output: any[]) {
  if (
    ts.isClassDeclaration(node) &&
    isDecoratedBy(node, "Component") &&
    node.name
  ) {
    const classSymbol = checker.getSymbolAtLocation(node.name);

    if (classSymbol) {
      const classMap = collectDepOfClass(classSymbol, checker);
      const serializedRootClass = serializeClass(classSymbol, checker);
      const serializedDps = Object.keys(classMap)
        .map(key => classMap[key])
        .map(classMapVal => {
          return serializeComplexType(classMapVal, checker);
          // const symbol = classMapVal.type.symbol;
          // return serializeClass(symbol, checker);
        });
      output.push({
        root: serializedRootClass,
        dependencies: serializedDps
      });
    }
  }
}

function serializeComplexType(mapItem: DepMapItem, checker: ts.TypeChecker) {
  switch (mapItem.symbolFlags) {
    case ts.SymbolFlags.Class:
      return serializeClass(mapItem.type.getSymbol()!, checker);
    case ts.SymbolFlags.RegularEnum:
      return serializeRegularEnum(mapItem.type.getSymbol()!, checker);
    default:
      return serializeClass(mapItem.type.getSymbol()!, checker);
  }
}

/**
 * This is a wierd serialization because it contains some runtime value of enum into json object.
 *
 * @param {ts.Symbol} symbol
 * @param {ts.TypeChecker} checker
 */
function serializeRegularEnum(symbol: ts.Symbol, checker: ts.TypeChecker) {
  const detail = serializeSymbol(symbol, checker);
  const type = checker.getDeclaredTypeOfSymbol(symbol);
  const members = (type as any).types.map(type => {
    return {
      symbol: serializeSymbol(type.getSymbol(), checker),
      value: type.value
    };
  });
  return {
    ...detail,
    members
  };
}

function serializeSymbol(symbol: ts.Symbol, checker: ts.TypeChecker) {
  if (!symbol.valueDeclaration) {
    return {
      name: symbol.getName(),
      type: undefined,
      text: undefined,
      symbolType: invertedSymbolFlag[symbol.flags]
    };
  } else {
    return {
      name: symbol.getName(),
      type: checker.typeToString(
        checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!)
      ),
      text: symbol.valueDeclaration.getText(),
      symbolType: invertedSymbolFlag[symbol.flags]
    };
  }
}

/**
 * Serialize a symbol into a json object.
 *
 * @param {ts.Symbol} symbol
 * @param {ts.TypeChecker} checker
 * @returns
 */
function serializeClass(symbol: ts.Symbol, checker: ts.TypeChecker) {
  const detail = serializeSymbol(symbol, checker);

  const members: SerializedSymbol[] = [];
  if (symbol.members) {
    symbol.members.forEach(action => {
      members.push(serializeSymbol(action, checker));
    });
  }
  return {
    ...detail,
    members
  };
}

/**
 * Collect all depended class of root class by symbol.
 *
 * @param {ts.Symbol} symbol
 * @param {ts.TypeChecker} checker
 */
function collectDepOfClass(
  symbol: ts.Symbol,
  checker: ts.TypeChecker
): ClassDepMap {
  // Because the entry symbol in first augument is a class decoration.
  const type = checker.getDeclaredTypeOfSymbol(symbol);
  const deps = collectDepWithDepMap(type, checker, Object.create(null));
  // Remove reference of root class self.
  const typeId = getIdentificationOfSymbol(symbol);
  delete deps[typeId];
  return deps;
  /**
   * Collect all dep classes
   *
   * @param {ts.Type} type
   * @param {ts.TypeChecker} checker
   * @param {*} depMap
   */
  function collectDepWithDepMap(
    type: ts.Type,
    checker: ts.TypeChecker,
    depMap: ClassDepMap
  ): ClassDepMap {
    // If type is a primitive type or method type then don't add into dep map.
    if (isPrimitiveType(type) || isClassMethodType(type) || isUnknownType(type)){
      return depMap;
    }
    // Because this type is not a primitive type.
    // `symbol` here will not be undefined.
    const symbol = type.getSymbol();
    const symbolFlags = getSymbolFlagFromSymbol(symbol!);
    
    // Collect dependencies.
    // If type is a type literal, don't add it to dependencies map.
    if (!isTypeLiteralType(type)) {
      // This getId function can not be called with a type literal symbol.
      // NOTE: Or should id's generation be reconsidered.
      const id = getIdentificationOfSymbol(symbol!);
      const fileName = getFileNameFromSymbol(symbol!);
      const textRange = getTextSpanFromSymbol(symbol!);
      if (depMap[id]) {
        return depMap;
      }
      depMap[id] = { type, symbolFlags, fileName, textRange };
    }
    
    return collectDepDistinType(type, checker, symbolFlags, depMap);

    /**
     * Collect all dependencies of `Type` with different symbol type of `Type`.
     *
     * @param {ts.Type} type
     * @param {ts.TypeChecker} checker
     * @param {ts.SymbolFlags} symbolFlags
     * @param {ClassDepMap} depMap
     * @returns {ClassDepMap}
     */
    function collectDepDistinType(
      type: ts.Type,
      checker: ts.TypeChecker,
      symbolFlags: ts.SymbolFlags,
      depMap: ClassDepMap
    ): ClassDepMap {
      switch (symbolFlags) {
        case ts.SymbolFlags.Class:
          return collectClassDep(type, checker, depMap);
        case ts.SymbolFlags.RegularEnum:
          // In typescript enum type only includes primitive types.
          // So just return.
          return depMap;
        case ts.SymbolFlags.TypeLiteral:
          return collectTypeLiteralDep(type, checker, depMap);
        case ts.SymbolFlags.Method:
          // Function declaration.
          return depMap;
        case ts.SymbolFlags.Interface:
          // To be finished...
        default:
          // throw new Error(
          //   `Can not collect deps of unknown type: ${checker.typeToString(
          //     type
          //   )}, symbol type: ${invertedSymbolFlag[symbolFlags]}`
          // );
          return depMap
      }
    }

    /**
     * Collect all dep of a class type.
     *
     * @param {ts.Type} type
     * @param {ts.TypeChecker} checker
     * @param {ClassDepMap} depMap
     * @returns {ClassDepMap}
     */
    function collectClassDep(
      type: ts.Type,
      checker: ts.TypeChecker,
      depMap: ClassDepMap
    ): ClassDepMap {
      return collectDepWithTypeProperties(type, checker, depMap);
    }

    /**
     * Collect all dep of a type literal declaration type.
     *
     * @param {ts.Type} type
     * @param {ts.TypeChecker} checker
     * @param {ClassDepMap} depMap
     */
    function collectTypeLiteralDep(
      type: ts.Type,
      checker: ts.TypeChecker,
      depMap: ClassDepMap
    ): ClassDepMap {
      return collectDepWithTypeProperties(type, checker, depMap);
    }

    function collectDepWithTypeProperties(
      type: ts.Type,
      checker: ts.TypeChecker,
      depMap: ClassDepMap
    ) {
      type
        .getProperties()
        .filter(symbol => symbol.valueDeclaration)
        .forEach(symbol => {
          const type = checker.getTypeOfSymbolAtLocation(
            symbol,
            symbol.valueDeclaration
          );
          collectDepWithDepMap(type, checker, depMap);
        });
      return depMap;
    }
  }
}

/**
 * True if type is a primitive type (`string`, `number`, `boolean`)
 * NOTE: This may be not appropriate.
 *
 * @param {ts.Type} type
 * @returns
 */
function isPrimitiveType(type: ts.Type): boolean {
  return !type.getSymbol();
}

/**
 *
 *
 * @param {ts.Type} type
 * @returns {boolean}
 */
function isClassMethodType(type: ts.Type): boolean {
  const symbol = type.getSymbol();
  if (symbol && symbol.flags === ts.SymbolFlags.Method) {
    return true;
  } else {
    return false;
  }
}

/**
 * This is for some type like type literal and others with name such as `__type`,
 * but can't be identified by symbol flag.
 *
 * @param {ts.Type} type
 * @returns {boolean}
 */
function isUnknownType(type: ts.Type): boolean {
  const symbol = type.getSymbol()
  if(!symbol) {
    return true
  } else if (!symbol.valueDeclaration && !symbol.declarations) {
    return true
  } else {
    return false
  }

}
function isTypeLiteralType(type: ts.Type): boolean {
  const symbol = type.getSymbol();
  if (symbol && symbol.flags === ts.SymbolFlags.TypeLiteral) {
    return true;
  } else {
    return false;
  }
}

/**
 * Get the symbol flag of specific type.
 * Which indicates the detailed type informations.
 *
 * @param {ts.Type} type
 * @returns {ts.SymbolFlags}
 */
function getSymbolFlagFromSymbol(symbol: ts.Symbol): ts.SymbolFlags {
  return symbol.flags;
}

function getIdentificationOfSymbol(symbol: ts.Symbol): string {
  const fileName = getFileNameFromSymbol(symbol);
  return `${fileName}-${symbol.getName()}`;
}

function getTextSpanFromSymbol(symbol: ts.Symbol): ts.TextRange {
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

function getFileNameFromSymbol(symbol: ts.Symbol) {
  let sourceFile;
  if (symbol.valueDeclaration) {
    // If value declaration exists.
    sourceFile = symbol.valueDeclaration.getSourceFile();
  } else {
    sourceFile = symbol.declarations.slice()[0].getSourceFile();
  }
  return sourceFile.fileName;
}

/**
 * Return `true` if class is decorated by a decorator named `decoratorName`.
 *
 * @param {ts.ClassDeclaration} node
 * @param {string} decoratorName
 * @returns {boolean}
 */
function isDecoratedBy(
  node: ts.ClassDeclaration,
  decoratorName: string
): boolean {
  let isIncludeSpecificDecor = false;
  node.decorators &&
    node.decorators.forEach(decorator => {
      if (
        ts.isIdentifier(decorator.expression) &&
        decorator.expression.getText() === decoratorName
      ) {
        isIncludeSpecificDecor = true;
      } else if (
        ts.isCallExpression(decorator.expression) &&
        decorator.expression.expression.getText() === decoratorName
      ) {
        isIncludeSpecificDecor = true;
      }
    });
  return isIncludeSpecificDecor;
}
