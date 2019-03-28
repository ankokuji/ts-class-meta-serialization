"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const typescript_1 = __importDefault(require("typescript"));
const lodash_1 = __importDefault(require("lodash"));
const invertedTypeFlag = lodash_1.default.invert(typescript_1.default.TypeFlags);
const invertedSymbolFlag = lodash_1.default.invert(typescript_1.default.SymbolFlags);
/**
 * This is exported and will create a program of a set of typescript entry files and
 * serialize all class decorated by `Component`.
 *
 * @param {string[]} rootNames
 * @returns
 */
function serializeAllDecoratedClass(rootNames, compilerHostGenerator) {
    const compilerOptions = {
        target: typescript_1.default.ScriptTarget.ES5,
        module: typescript_1.default.ModuleKind.CommonJS,
        types: []
    };
    const compilerHost = compilerHostGenerator
        ? compilerHostGenerator(compilerOptions)
        : undefined;
    const program = compilerHost
        ? typescript_1.default.createProgram(rootNames, compilerOptions, compilerHost)
        : typescript_1.default.createProgram(rootNames, compilerOptions);
    const typeChecker = program.getTypeChecker();
    const output = [];
    for (const sourceFile of program.getSourceFiles()) {
        if (!sourceFile.isDeclarationFile) {
            typescript_1.default.forEachChild(sourceFile, lodash_1.default.curryRight(visit)(output)(typeChecker));
        }
    }
    return output;
}
exports.serializeAllDecoratedClass = serializeAllDecoratedClass;
function visit(node, checker, output) {
    if (typescript_1.default.isClassDeclaration(node) &&
        isDecoratedBy(node, "Component") &&
        node.name) {
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
function serializeComplexType(mapItem, checker) {
    switch (mapItem.symbolFlags) {
        case typescript_1.default.SymbolFlags.Class:
            return serializeClass(mapItem.type.getSymbol(), checker);
        case typescript_1.default.SymbolFlags.RegularEnum:
            return serializeRegularEnum(mapItem.type.getSymbol(), checker);
        default:
            return serializeClass(mapItem.type.getSymbol(), checker);
    }
}
/**
 * This is a wierd serialization because it contains some runtime value of enum into json object.
 *
 * @param {ts.Symbol} symbol
 * @param {ts.TypeChecker} checker
 */
function serializeRegularEnum(symbol, checker) {
    const detail = serializeSymbol(symbol, checker);
    const type = checker.getDeclaredTypeOfSymbol(symbol);
    const members = type.types.map(type => {
        return {
            symbol: serializeSymbol(type.getSymbol(), checker),
            value: type.value
        };
    });
    return Object.assign({}, detail, { members });
}
function serializeSymbol(symbol, checker) {
    if (!symbol.valueDeclaration) {
        return {
            name: symbol.getName(),
            type: undefined,
            text: undefined,
            symbolType: invertedSymbolFlag[symbol.flags]
        };
    }
    else {
        return {
            name: symbol.getName(),
            type: checker.typeToString(checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration)),
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
function serializeClass(symbol, checker) {
    const detail = serializeSymbol(symbol, checker);
    const members = [];
    if (symbol.members) {
        symbol.members.forEach(action => {
            members.push(serializeSymbol(action, checker));
        });
    }
    return Object.assign({}, detail, { members });
}
/**
 * Collect all depended class of root class by symbol.
 *
 * @param {ts.Symbol} symbol
 * @param {ts.TypeChecker} checker
 */
function collectDepOfClass(symbol, checker) {
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
    function collectDepWithDepMap(type, checker, depMap) {
        // If type is a primitive type or method type then don't add into dep map.
        if (isPrimitiveType(type) || isClassMethodType(type)) {
            return depMap;
        }
        // Because this type is not a primitive type.
        // `symbol` here will not be undefined.
        const symbol = type.getSymbol();
        const id = getIdentificationOfSymbol(symbol);
        const symbolFlags = getSymbolFlagFromSymbol(symbol);
        const fileName = getFileNameFromSymbol(symbol);
        const textRange = getTextSpanFromSymbol(symbol);
        if (depMap[id]) {
            return depMap;
        }
        // Collect dependencies.
        // If type is a type literal, don't add it to dependencies map.
        if (!isTypeLiteralType(type)) {
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
        function collectDepDistinType(type, checker, symbolFlags, depMap) {
            switch (symbolFlags) {
                case typescript_1.default.SymbolFlags.Class:
                    return collectClassDep(type, checker, depMap);
                case typescript_1.default.SymbolFlags.RegularEnum:
                    // In typescript enum type only includes primitive types.
                    // So just return.
                    return depMap;
                case typescript_1.default.SymbolFlags.TypeLiteral:
                    return collectTypeLiteralDep(type, checker, depMap);
                case typescript_1.default.SymbolFlags.Method:
                    // Function declaration.
                    return depMap;
                default:
                    throw new Error(`Can not collect deps of unknown type: ${checker.typeToString(type)}, symbol type: ${invertedSymbolFlag[symbolFlags]}`);
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
        function collectClassDep(type, checker, depMap) {
            return collectDepWithTypeProperties(type, checker, depMap);
        }
        /**
         * Collect all dep of a type literal declaration type.
         *
         * @param {ts.Type} type
         * @param {ts.TypeChecker} checker
         * @param {ClassDepMap} depMap
         */
        function collectTypeLiteralDep(type, checker, depMap) {
            return collectDepWithTypeProperties(type, checker, depMap);
        }
        function collectDepWithTypeProperties(type, checker, depMap) {
            type
                .getProperties()
                .filter(symbol => symbol.valueDeclaration)
                .forEach(symbol => {
                const type = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration);
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
function isPrimitiveType(type) {
    return !type.getSymbol();
}
/**
 *
 *
 * @param {ts.Type} type
 * @returns {boolean}
 */
function isClassMethodType(type) {
    const symbol = type.getSymbol();
    if (symbol && symbol.flags === typescript_1.default.SymbolFlags.Method) {
        return true;
    }
    else {
        return false;
    }
}
function isTypeLiteralType(type) {
    const symbol = type.getSymbol();
    if (symbol && symbol.flags === typescript_1.default.SymbolFlags.TypeLiteral) {
        return true;
    }
    else {
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
function getSymbolFlagFromSymbol(symbol) {
    return symbol.flags;
}
function getIdentificationOfSymbol(symbol) {
    const fileName = getFileNameFromSymbol(symbol);
    return `${fileName}-${symbol.getName()}`;
}
function getTextSpanFromSymbol(symbol) {
    let declaration;
    if (symbol.valueDeclaration) {
        declaration = symbol.valueDeclaration;
    }
    else {
        declaration = symbol.declarations.slice()[0];
    }
    return {
        pos: declaration.pos,
        end: declaration.end
    };
}
function getFileNameFromSymbol(symbol) {
    let sourceFile;
    if (symbol.valueDeclaration) {
        // If value declaration exists.
        sourceFile = symbol.valueDeclaration.getSourceFile();
    }
    else {
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
function isDecoratedBy(node, decoratorName) {
    let isIncludeSpecificDecor = false;
    node.decorators &&
        node.decorators.forEach(decorator => {
            if (typescript_1.default.isIdentifier(decorator.expression) &&
                decorator.expression.getText() === decoratorName) {
                isIncludeSpecificDecor = true;
            }
            else if (typescript_1.default.isCallExpression(decorator.expression) &&
                decorator.expression.expression.getText() === decoratorName) {
                isIncludeSpecificDecor = true;
            }
        });
    return isIncludeSpecificDecor;
}
