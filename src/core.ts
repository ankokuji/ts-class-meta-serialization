import ts from "typescript";
import _ from "lodash/fp";
import { curryRight2 } from "./utils";

const invertedTypeFlag = _.invert(ts.TypeFlags);
const invertedSymbolFlag = _.invert(ts.SymbolFlags);

export namespace typeCheck {
  export function isTypeLiteralType(type: ts.Type): boolean {
    const symbol = type.getSymbol();
    if (symbol && symbol.flags === ts.SymbolFlags.TypeLiteral) {
      return true;
    } else {
      return false;
    }
  }

  /**
   * Used to determine if type is `Array` in es5 standard.
   * Because `*[]` type declaration in ts is the same as generic `Array<*>`.
   * And type `Array` also can be a self declared class or type.
   * 
   * NOTE: This implementation uses ts default lib file path.
   *
   * @export
   * @param {ts.Type} type
   * @returns {boolean}
   */
  export function isES5ArrayType(type: ts.Type): boolean {
    const symbol = type.getSymbol();
    if(symbol && symbol.name === "Array") {
      const fileName = getFileNameFromSymbol(symbol);
      const tsFilePath = _.compose(_.join("/"), _.takeRight(3), _.split("/"))(fileName);
      if ("typescript/lib/lib.es5.d.ts" === tsFilePath) {
        return true;
      }
    }
    return false
  }
}

export namespace serializer {
  export interface SerializerOptions {
    /**
     * For filt classes should be serialized.
     *
     * @param {ts.ClassDeclaration} node
     * @returns {boolean}
     * @memberof SerializerOptions
     */
    classEntryFilter?(node: ts.ClassDeclaration): boolean;
    serializeDecorator?(node: ts.Decorator, checker?: ts.TypeChecker): any;
    /**
     * Use this to generate a compiler host for creating program.
     *
     * @param {ts.CompilerOptions} options
     * @returns {ts.CompilerHost}
     * @memberof SerializerOptions
     */
    compilerHostGenerator?(options: ts.CompilerOptions): ts.CompilerHost;
  }

  export function createSerializerOptions(): SerializerOptions {
    return {
      classEntryFilter: undefined,
      serializeDecorator: undefined,
      compilerHostGenerator: undefined
    };
  }

  export interface SerializerContext {
    checker: ts.TypeChecker;
    options: SerializerOptions;
  }

  export interface SerializedSymbol {
    type: string | undefined;
    name: string;
    text: string | undefined;
    isPrimitiveType: boolean;
    symbolType: boolean;
    genericTypeArgs: string[] | undefined;
    isArray: boolean;
  }
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
export function serializeTsFiles(
  rootNames: string[],
  serializerOptions?: serializer.SerializerOptions
) {
  const compilerOptions = {
    target: ts.ScriptTarget.ES2015,
    module: ts.ModuleKind.CommonJS,
    types: []
  };

  if (!serializerOptions) {
    serializerOptions = serializer.createSerializerOptions();
  }

  const compilerHost = serializerOptions.compilerHostGenerator
    ? serializerOptions.compilerHostGenerator(compilerOptions)
    : undefined;
  const program = compilerHost
    ? ts.createProgram(rootNames, compilerOptions, compilerHost)
    : ts.createProgram(rootNames, compilerOptions);

  const typeChecker = program.getTypeChecker();
  const output: any[] = [];
  const ctx: serializer.SerializerContext = {
    checker: typeChecker,
    options: serializerOptions
  };

  for (const sourceFile of program.getSourceFiles()) {
    if (!sourceFile.isDeclarationFile) {
      const innerOutput = [];
      ts.forEachChild(sourceFile, _.curryRight(visit)(innerOutput)(ctx));
      if (innerOutput.length !== 0) {
        output.push({
          fileName: sourceFile.fileName,
          result: innerOutput
        });
      }
    }
  }
  return output;
}

function visit(
  node: ts.Node,
  ctx: serializer.SerializerContext,
  output: any[]
) {
  const { checker, options } = ctx;
  if (ts.isClassDeclaration(node) && node.name) {
    if (options.classEntryFilter && !options.classEntryFilter(node)) {
      return;
    }
    const classSymbol = checker.getSymbolAtLocation(node.name);

    if (classSymbol) {
      const classMap = collectDepOfClass(classSymbol, checker);
      // first serialize root class itself.
      const serializedRootClass = serializeClass(
        classSymbol,
        checker,
        options.serializeDecorator
      );
      const serializedDps = Object.keys(classMap)
        .map(key => classMap[key])
        .map(classMapVal => {
          return serializeComplexType(
            classMapVal,
            checker,
            options.serializeDecorator
          );
        });
      output.push({
        root: serializedRootClass,
        dependencies: serializedDps
      });
    }
  }
}

/**
 * First judge type of type(symbol) and then call specific serialization function.
 *
 * @param {DepMapItem} mapItem
 * @param {ts.TypeChecker} checker
 * @param {(node: ts.Decorator) => any} decoratorSerializeFun
 * @returns
 */
function serializeComplexType(
  mapItem: DepMapItem,
  checker: ts.TypeChecker,
  decoratorSerializeFun?: (node: ts.Decorator, checker: ts.TypeChecker) => any
) {
  switch (mapItem.symbolFlags) {
    case ts.SymbolFlags.Class:
      return serializeClass(
        mapItem.type.getSymbol()!,
        checker,
        decoratorSerializeFun
      );
    case ts.SymbolFlags.RegularEnum:
      return serializeRegularEnum(mapItem.type.getSymbol()!, checker);
    default:
      return serializeClass(
        mapItem.type.getSymbol()!,
        checker,
        decoratorSerializeFun
      );
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

function serializeSymbol(
  symbol: ts.Symbol,
  checker: ts.TypeChecker
): serializer.SerializedSymbol {
  if (!symbol.valueDeclaration) {
    return {
      name: symbol.getName(),
      type: undefined,
      isPrimitiveType: false,
      text: undefined,
      symbolType: invertedSymbolFlag[symbol.flags],
      genericTypeArgs: undefined,
      isArray: false
    };
  } else {
    const type = checker.getTypeOfSymbolAtLocation(
      symbol,
      symbol.valueDeclaration!
    );
    const generics =
      (type as any).typeArguments &&
      (type as any).typeArguments.map((type: ts.Type) => {
        return checker.typeToString(type);
      });
    return {
      name: symbol.getName(),
      type: checker.typeToString(type),
      isPrimitiveType: isPrimitiveType(type),
      text: symbol.valueDeclaration.getText(),
      symbolType: invertedSymbolFlag[symbol.flags],
      genericTypeArgs: generics,
      isArray: typeCheck.isES5ArrayType(type)
    };
  }
}

/**
 *
 *
 * @param {ts.Symbol} symbol
 * @param {ts.TypeChecker} checker
 * @param {(node: ts.Decorator) => any} decoratorSerializeFun
 * @returns
 */
function serializeSymbolWithDecoratorInfo(
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
  decoratorSerializeFun?: (node: ts.Decorator) => any
) {
  const detail = serializeSymbol(symbol, checker);
  let decorators: any = [];
  if (symbol.valueDeclaration && decoratorSerializeFun) {
    decorators = serializeDecorator(
      symbol.valueDeclaration,
      decoratorSerializeFun
    );
  }
  return {
    ...detail,
    decorators
  };
}

/**
 * Serialize decorators of a node into json object.
 *
 * @param {ts.Node} node
 * @param {(node: ts.Node) => any} decoratorSerializeFun
 * @returns
 */
function serializeDecorator(
  node: ts.Node,
  decoratorSerializeFun: (node: ts.Decorator) => any
) {
  if (!node.decorators) {
    return [];
  } else {
    return node.decorators.map(decoratorSerializeFun).filter(info => !!info);
  }
}

/**
 * Serialize a symbol into a json object.
 *
 * @param {ts.Symbol} symbol
 * @param {ts.TypeChecker} checker
 * @returns
 */
function serializeClass(
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
  decoratorSerializeFun?: (node: ts.Decorator, checker: ts.TypeChecker) => any
) {
  let currySerializeFun: ((node: ts.Decorator) => any) | undefined = undefined;
  if (decoratorSerializeFun) {
    currySerializeFun = curryRight2(decoratorSerializeFun)(checker);
  }
  const detail = serializeSymbolWithDecoratorInfo(
    symbol,
    checker,
    currySerializeFun
  );
  const members: serializer.SerializedSymbol[] = [];
  if (symbol.members) {
    symbol.members.forEach(action => {
      members.push(
        serializeSymbolWithDecoratorInfo(action, checker, currySerializeFun)
      );
    });
  }
  return {
    ...detail,
    members
  };
}

/**
 * Find all the classes that the current class depends on by typescript Symbol.
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
    if (
      isPrimitiveType(type) ||
      isClassMethodType(type) ||
      isUnknownType(type)
    ) {
      return depMap;
    }
    // Because `type` is not a primitive type.
    // So `symbol` here won't be `undefined`.
    const symbol = type.getSymbol();
    const symbolFlags = getSymbolFlagFromSymbol(symbol!);
    const map = collectDep(type, depMap);
    return collectDepDistinType(type, checker, symbolFlags, map);

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
          return depMap;
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
      let map = depMap;
      if ((type as any).typeArguments) {
        map = (type as any).typeArguments.reduce(
          (accum: ClassDepMap, type: ts.Type) => {
            return collectDepWithDepMap(type, checker, accum);
          },
          depMap
        );
      }
      return collectDepWithTypeProperties(type, checker, map);
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
 * Determine if type should be added to dependencies.
 *
 * @param {ts.Type} type
 * @param {ClassDepMap} depMap
 * @returns
 */
function collectDep(type: ts.Type, depMap: ClassDepMap) {
  // If type is a primitive type or method type then don't add into dep map.
  if (isPrimitiveType(type) || isClassMethodType(type) || isUnknownType(type)) {
    return depMap;
  }
  // Because this type is not a primitive type.
  // `symbol` here will not be undefined.
  const symbol = type.getSymbol();
  const symbolFlags = getSymbolFlagFromSymbol(symbol!);

  // Collect dependencies.
  // If type is a "type literal" or "es5 Array type", don't add it to dependencies map.
  if (!typeCheck.isTypeLiteralType(type) && !typeCheck.isES5ArrayType(type)) {
    // This getId function can not be called with a type literal symbol.
    // NOTE: Or should id's generation be reconsidered.
    const id = getIdentificationOfSymbol(symbol!);
    const fileName = getFileNameFromSymbol(symbol!);
    const textRange = getTextSpanFromSymbol(symbol!);
    if (depMap[id]) {
      return depMap;
    }
    depMap[id] = {
      type,
      symbolFlags,
      fileName,
      textRange
    };
  }
  return depMap;
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
  const symbol = type.getSymbol();
  if (!symbol) {
    return true;
  } else if (!symbol.valueDeclaration && !symbol.declarations) {
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

function getFileNameFromSymbol(symbol: ts.Symbol): string {
  let sourceFile: ts.SourceFile;
  if (symbol.valueDeclaration) {
    // If value declaration exists.
    sourceFile = symbol.valueDeclaration.getSourceFile();
  } else {
    sourceFile = symbol.declarations.slice()[0].getSourceFile();
  }
  return sourceFile.fileName;
}
