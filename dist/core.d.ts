import ts from "typescript";
/**
 * This is exported and will create a program of a set of typescript entry files and
 * serialize all class decorated by `Component`.
 *
 * @param {string[]} rootNames
 * @returns
 */
export declare function serializeAllDecoratedClass(rootNames: string[], compilerHostGenerator?: (options: ts.CompilerOptions) => ts.CompilerHost): never[];
