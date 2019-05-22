import ts from "typescript";
import _ from "lodash/fp";
import {
  curryRight2,
  curryRight3,
  getFileNameFromSymbol,
  getIdentificationOfSymbol,
  getTextSpanFromSymbol
} from "./utils";
import { UnknownTypeError } from "./error";

const invertedTypeFlag = _.invert(ts.TypeFlags);
const invertedSymbolFlag = _.invert(ts.SymbolFlags);

export namespace typeCheck {
  export function isErrorType(type: ts.Type): boolean {
    return (
      type.flags === ts.TypeFlags.Any &&
      (type as any).intrinsicName &&
      (type as any).intrinsicName === "error"
    );
  }
  /**
   * This is for some types needed no dep collection
   * like `type literal` and some with names such as `__type`,
   * but can't be identified by symbol flag.
   *
   * `UnsupportedType` includes all types that needn't to be collected
   * except for advanced types.
   *
   * @param {ts.Type} type
   * @returns {boolean}
   */
  export function isUnsupportedTypeForDepCollection(type: ts.Type): boolean {
    const symbol = type.getSymbol();
    if (!symbol) {
      // If a type did not have a symbol, only when the type can be identified as
      // a advanced type will it be collected into dependencies.
      if (!typeCheck.isAdvancedTypes(type)) {
        // Type didn't have a symbol and wasn't advanced types.
        return true;
      }
    } else if (!symbol.valueDeclaration && !symbol.declarations) {
      // Currently if a symbol had no value declaration then there is no need
      // to add this symbol type into dependencies.
      return true;
    }
    return false;
  }

  /**
   * Currently only detect intersection type.
   *
   * @export
   * @param {ts.Type} type
   */
  export function isAdvancedTypes(type: ts.Type) {
    return isIntersectionType(type) || isUnionType(type);
  }

  export function isIntersectionType(type: ts.Type) {
    return !!(type.flags & ts.TypeFlags.Intersection);
  }

  export function isUnionType(type: ts.Type) {
    return !!(type.flags & ts.TypeFlags.Union);
  }
  /**
   *
   *
   * @param {ts.Type} type
   * @returns {boolean}
   */
  export function isClassMethodType(type: ts.Type): boolean {
    const symbol = type.getSymbol();
    if (symbol && symbol.flags === ts.SymbolFlags.Method) {
      return true;
    } else {
      return false;
    }
  }
  /**
   * True if type is a primitive type (`string`, `number`, `boolean`)
   * NOTE: This may be not appropriate.
   *
   * @param {ts.Type} type
   * @returns
   */
  export function isPrimitiveType(type: ts.Type): boolean {
    const primitiveFlags =
      ts.TypeFlags.String | ts.TypeFlags.Boolean | ts.TypeFlags.Number;
    return !!(type.flags & primitiveFlags);
  }
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
    if (symbol && symbol.name === "Array") {
      const fileName = getFileNameFromSymbol(symbol);
      const tsFilePath = _.compose(
        _.join("/"),
        _.takeRight(3),
        _.split("/")
      )(fileName);
      if ("typescript/lib/lib.es5.d.ts" === tsFilePath) {
        return true;
      }
    }
    return false;
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

    typeOfAdvancedType: string | null;
    isArray: boolean;
  }

  export interface Unstable_SerializedSymbol {
    name: string | undefined;
    generics: string[] | undefined;
    types: Unstable_SerializedType[] | undefined;
    typeOfAdvancedType: string | null;
    text: string | undefined;
    symbolType: string;
    decorators?: any[];
  }
  export interface Unstable_SerializedType {
    isPrimitiveType: boolean;
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
  const detail = unstable_serializeSymbol(symbol, checker);
  const type = checker.getDeclaredTypeOfSymbol(symbol);
  const members = (type as any).types.map(type => {
    return {
      symbol: unstable_serializeSymbol(type.getSymbol(), checker),
      value: type.value
    };
  });
  return {
    ...detail,
    members
  };
}

/**
 * New symbol serialization function to support advanced types.
 *
 * @param {ts.Symbol} symbol
 * @param {ts.TypeChecker} checker
 * @returns
 */
function unstable_serializeSymbol(
  symbol: ts.Symbol,
  checker: ts.TypeChecker
): serializer.Unstable_SerializedSymbol {
  // `symbol` has no value declaration.
  if (!symbol.valueDeclaration) {
    return {
      name: symbol.getName(),
      generics: undefined,
      types: undefined,
      text: undefined,
      symbolType: invertedSymbolFlag[symbol.flags],
      typeOfAdvancedType: null
    };
  } else {
    const type = checker.getTypeOfSymbolAtLocation(
      symbol,
      symbol.valueDeclaration!
    );

    const basicSymbol = basicSerializeSymbol(symbol);

    let types;
    if (typeCheck.isAdvancedTypes(type)) {
      types = (type as any).types.map(extendSerailizeSymbol);
    } else {
      types = [extendSerailizeSymbol(type)];
    }
    const typeOfAdvancedType = getTypeOfAdvancedType(type);
    const generics = getGenericsOfType(type);

    const extensiveSymbol = {
      types,
      typeOfAdvancedType,
      generics
    };

    return Object.assign({}, basicSymbol, extensiveSymbol);
  }

  function extendSerailizeSymbol(type: ts.Type) {
    const generics = getGenericsOfType(type);
    const serializedType = checker.typeToString(type);
    return {
      type: serializedType,
      isPrimitiveType: typeCheck.isPrimitiveType(type),
      genericTypeArgs: generics,
      isArray: typeCheck.isES5ArrayType(type)
    };
  }

  function basicSerializeSymbol(symbol: ts.Symbol) {
    return {
      name: symbol.getName(),
      text: symbol.valueDeclaration.getText(),
      symbolType: invertedSymbolFlag[symbol.flags]
    };
  }

  function getTypeOfAdvancedType(type: ts.Type): string | null {
    enum AdvancedTypeString {
      Union = "Union",
      Intersection = "Intersection"
    }
    switch (type.flags) {
      case ts.TypeFlags.Union:
        return AdvancedTypeString.Union;
      case ts.TypeFlags.Intersection:
        return AdvancedTypeString.Intersection;
    }
    return null;
  }

  function getGenericsOfType(type: ts.Type): string[] | undefined {
    const typeArguments: ts.Type[] | undefined =
      (type as any).typeArguments || (type as any).aliasTypeArguments;
    return (
      typeArguments &&
      typeArguments.map((type: ts.Type) => {
        return checker.typeToString(type);
      })
    );
  }
}

/**
 * WARNING: The data structure produced by this function has
 * bugs in presenting advanced types in typescript.
 *
 * @deprecated
 * @param {ts.Symbol} symbol
 * @param {ts.TypeChecker} checker
 * @returns {serializer.SerializedSymbol}
 */
function serializeSymbol(
  symbol: ts.Symbol,
  checker: ts.TypeChecker
): serializer.SerializedSymbol {
  // `symbol` has no value declaration.
  if (!symbol.valueDeclaration) {
    return {
      name: symbol.getName(),
      type: undefined,
      isPrimitiveType: false,
      text: undefined,
      symbolType: invertedSymbolFlag[symbol.flags],
      typeOfAdvancedType: null,
      genericTypeArgs: undefined,
      isArray: false
    };
  } else {
    const type = checker.getTypeOfSymbolAtLocation(
      symbol,
      symbol.valueDeclaration!
    );
    const generics = getGenericsOfType(type);
    const advancedType = getTypeOfAdvancedType(type);
    const serializedType = typeCheck.isAdvancedTypes(type)
      ? (type as any).types.map(
          curryRight3(checker.typeToString)(undefined)(undefined)
        )
      : checker.typeToString(type);
    return {
      name: symbol.getName(),
      type: serializedType,
      isPrimitiveType: typeCheck.isPrimitiveType(type),
      typeOfAdvancedType: advancedType,
      text: symbol.valueDeclaration.getText(),
      symbolType: invertedSymbolFlag[symbol.flags],
      genericTypeArgs: generics,
      isArray: typeCheck.isES5ArrayType(type)
    };
  }

  function getTypeOfAdvancedType(type: ts.Type): string | null {
    enum AdvancedTypeString {
      Union = "Union",
      Intersection = "Intersection"
    }
    switch (type.flags) {
      case ts.TypeFlags.Union:
        return AdvancedTypeString.Union;
      case ts.TypeFlags.Intersection:
        return AdvancedTypeString.Intersection;
    }
    return null;
  }

  function getGenericsOfType(type: ts.Type) {
    return (
      (type as any).typeArguments &&
      (type as any).typeArguments.map((type: ts.Type) => {
        return checker.typeToString(type);
      })
    );
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
): serializer.Unstable_SerializedSymbol {
  const detail = unstable_serializeSymbol(symbol, checker);
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
  const members: serializer.Unstable_SerializedSymbol[] = [];
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
  const deps = collectDepWithTypeCheck(type, checker, Object.create(null));
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
  function collectDepWithTypeCheck(
    type: ts.Type,
    checker: ts.TypeChecker,
    depMap: ClassDepMap
  ): ClassDepMap {
    if (typeCheck.isErrorType(type)) {
      throw new Error(
        `Type parse error with type ${checker.typeToString(type)}.`
      );
    }
    // If type is a primitive type or method type then don't add into dep map.
    if (
      typeCheck.isPrimitiveType(type) ||
      typeCheck.isClassMethodType(type) ||
      typeCheck.isUnsupportedTypeForDepCollection(type)
    ) {
      return depMap;
    }
    // Because `type` is not a primitive type.
    // So `symbol` here won't be `undefined`.
    // const symbol = type.getSymbol();
    // const symbolFlags = getSymbolFlagFromSymbol(symbol!);
    const map = addTypeSelfIntoDep(type, depMap);
    return collectDepOfTypeChildren(type, checker, map);

    /**
     * Collect all dependencies of `Type` with different symbol type of `Type`.
     *
     * @param {ts.Type} type
     * @param {ts.TypeChecker} checker
     * @param {ts.SymbolFlags} symbolFlags
     * @param {ClassDepMap} depMap
     * @returns {ClassDepMap}
     */
    function collectDepOfTypeChildren(
      type: ts.Type,
      checker: ts.TypeChecker,
      depMap: ClassDepMap
    ): ClassDepMap {
      const symbol = type.getSymbol();
      if (!symbol) {
        // Is a advanced type.
        return collectDepOfAdvancedType(type, checker, depMap);
      } else {
        return collectDepOfTypeWithSymbol(type, checker, symbol, depMap);
      }
    }

    /**
     * NOTE: Collecting an advanced type dependency is different from collecting
     * other type dependencies. Instead of adding this type to the dependency
     * in advance, every individual types of the advanced type are treated as
     * separate types and `collectDepWithTypeCheck` is called iteratively when
     * collecting children dependencied of current type.
     *
     * @param {ts.Type} type
     * @param {ts.TypeChecker} checker
     * @param {ClassDepMap} depMap
     * @returns {ClassDepMap}
     */
    function collectDepOfAdvancedType(
      type: ts.Type,
      checker: ts.TypeChecker,
      depMap: ClassDepMap
    ): ClassDepMap {
      return (type as any).types.reduce(
        (depMap: ClassDepMap, type: ts.Type) => {
          return collectDepWithTypeCheck(type, checker, depMap);
        },
        depMap
      );
    }

    function collectDepOfTypeWithSymbol(
      type: ts.Type,
      checker: ts.TypeChecker,
      symbol: ts.Symbol,
      depMap: ClassDepMap
    ) {
      const symbolFlags = symbol.flags;
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
          if (typeCheck.isES5ArrayType(type)) {
            // `Array` was declared as a variable in ts' es5 lib.
            // So it won't go into `Class` branch. Dependencies of
            // generic `Array<*>` or `*[]` should be treat especially.
            collectTypeArgumentsDep(type, depMap);
          }
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
      const map = collectTypeArgumentsDep(type, depMap);
      return collectDepWithTypeProperties(type, checker, map);
    }

    /**
     * Collect type arguments(complex types in generics).
     * For example type T, S in `Class<T, S>`.
     *
     * @param {ts.Type} type
     * @param {ClassDepMap} depMap
     * @returns
     */
    function collectTypeArgumentsDep(type: ts.Type, depMap: ClassDepMap) {
      let map = depMap;
      if ((type as any).typeArguments) {
        map = (type as any).typeArguments.reduce(
          (accum: ClassDepMap, type: ts.Type) => {
            let map = accum;
            try {
              map = collectDepWithTypeCheck(type, checker, map);
            } catch (e) {
              throw new UnknownTypeError(type.symbol);
            }
            return map;
          },
          depMap
        );
      }
      return map;
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
          try {
            collectDepWithTypeCheck(type, checker, depMap);
          } catch (e) {
            throw new UnknownTypeError(symbol);
          }
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
function addTypeSelfIntoDep(type: ts.Type, depMap: ClassDepMap) {
  // If a type is primitive type or method type then don't add into dep map.
  // Then it won't come into this function.
  // Because this type is not a primitive type.
  // `symbol` here will not be undefined.
  const symbol = type.getSymbol();
  if (symbol) {
    return collectWithSymbol(symbol, type, depMap);
  }
  // If a type has no symbol, it will be an advanced type.
  // This step did nothing to advanced types.
  return depMap;

  function collectWithSymbol(
    symbol: ts.Symbol,
    type: ts.Type,
    depMap: ClassDepMap
  ): ClassDepMap {
    const symbolFlags = getSymbolFlagFromSymbol(symbol);

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
