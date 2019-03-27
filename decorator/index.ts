import ts from "typescript";
import _ from "lodash";
import path from "path";

const invertedTypeFlag = _.invert(ts.TypeFlags);
const invertedSymbolFlag = _.invert(ts.SymbolFlags);

interface SerializedSymbol {
  type: string | undefined;
  name: string;
  text: string | undefined;
}

interface ClassDepMap {
  [id: string]: ts.Type;
}

function getAllDecoratedClass(rootNames: string[]) {
  const compilerOptions = {
    target: ts.ScriptTarget.ES5,
    module: ts.ModuleKind.CommonJS,
    types: []
  };
  const program = ts.createProgram(rootNames, compilerOptions);
  const typeChecker = program.getTypeChecker();
  const output = [];

  for (const sourceFile of program.getSourceFiles()) {
    if (!sourceFile.isDeclarationFile) {
      ts.forEachChild(sourceFile, _.curryRight(visit)(output)(typeChecker));
    }
  }
  debugger;
}

function visit(node: ts.Node, checker: ts.TypeChecker, output: any[]) {
  if (
    ts.isClassDeclaration(node) &&
    isDecoratedBy(node, "Component") &&
    node.name
  ) {
    const classSymbol = checker.getSymbolAtLocation(node.name);

    if (classSymbol) {
      const classMap = collectDepClassOfClass(classSymbol, checker);
      const serializedRootClass = serializeClass(classSymbol, checker);
      const serializedDps = Object.keys(classMap)
        .map(key => classMap[key])
        .map(type => {
          const symbol = type.symbol;
          return serializeClass(symbol, checker);
        });
      output.push({
        root: serializedRootClass,
        dependClasses: serializedDps
      });
    }
  }
}

function serializeSymbol(symbol: ts.Symbol, checker: ts.TypeChecker) {
  if (!symbol.valueDeclaration) {
    return {
      name: symbol.getName(),
      type: undefined,
      text: undefined
    };
  } else {
    return {
      name: symbol.getName(),
      type: checker.typeToString(
        checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!)
      ),
      text: symbol.valueDeclaration.getText()
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
function collectDepClassOfClass(
  symbol: ts.Symbol,
  checker: ts.TypeChecker
): ClassDepMap {
  // Because the entry symbol in first augument is a class decoration.
  const type = checker.getDeclaredTypeOfSymbol(symbol);
  const deps = collectDpClassOfClassWithDepMap(
    type,
    checker,
    Object.create(null)
  );
  // Remove reference of root class self.
  const typeId = getIdentificationOfType(type, checker);
  delete deps[typeId];
  return deps;
  /**
   * Collect all dep classes
   *
   * @param {ts.Type} type
   * @param {ts.TypeChecker} checker
   * @param {*} depMap
   */
  function collectDpClassOfClassWithDepMap(
    type: ts.Type,
    checker: ts.TypeChecker,
    depMap: ClassDepMap
  ): ClassDepMap {
    if (isPrimitiveType(type)) {
      return depMap;
    }

    const id = getIdentificationOfType(type, checker);
    if (depMap[id]) {
      return depMap;
    }
    // Collect dependencies.
    depMap[id] = type;
    type
      .getProperties()
      .filter(symbol => symbol.valueDeclaration)
      .forEach(symbol => {
        const type = checker.getTypeOfSymbolAtLocation(
          symbol,
          symbol.valueDeclaration
        );
        collectDpClassOfClassWithDepMap(type, checker, depMap);
      });
    return depMap;
  }
}

/**
 * True if type is a primitive type (`string`, `number`, `boolean`)
 * NOTE: This may be not appropriate.
 *
 * @param {ts.Type} type
 * @returns
 */
function isPrimitiveType(type: ts.Type) {
  return !type.getSymbol()
}

function isClassOrEnum(type: ts.Type) {
  return type.isClass() || isEnumType(type);
}

function isEnumType(type: ts.Type) {
  // console.log(invertTypeFlag[type.flags]);
  return type.flags === ts.TypeFlags.Enum;
}

function getIdentificationOfType(type: ts.Type, checker: ts.TypeChecker): string{
  // return (type as any).id;

  const symbol = type.getSymbol()
  if(!symbol) {
    throw new Error(`Try to get "Symbol" from "Type" ${type}, but seems not exist, maybe is a primitive type`);
  }

  const fileName = getFileNameOfSourceFileOfSymbol(symbol)
  return fileName + symbol.getName()

}

function getFileNameOfSourceFileOfSymbol(symbol: ts.Symbol) {

  let sourceFile
  if (symbol.valueDeclaration) {
    // If value declaration exists.
    sourceFile = symbol.valueDeclaration.getSourceFile();
  } else {
    sourceFile = symbol.declarations.slice()[0].getSourceFile()
  }
  return sourceFile.fileName
}

function parseComplexTypeIfNeed(symbol: ts.Symbol, checker: ts.TypeChecker) {
  if (!symbol.valueDeclaration) {
    return undefined;
  }
  const type = checker.getTypeOfSymbolAtLocation(
    symbol,
    symbol.valueDeclaration
  );

  type.isClassOrInterface();

  debugger;
}

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

function main() {
  const cwd = process.cwd();
  const entry = path.join(cwd, "./test/index.ts");
  getAllDecoratedClass([entry]);
}

main();
