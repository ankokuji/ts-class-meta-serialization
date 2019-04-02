# Example

In example below we use typescript: 
```typescript
import {
  serializeTsFiles,
  serializeVueFiles,
  customEntryFilters,
  customDecoratorSerilize
} from "ts-meta-extract";

export function customParseTsFiles(entries: string[]) {
  const output = serializeTsFiles(entries, {
    classEntryFilter: customEntryFilters.isDecoratedBy(["Component"]),
    serializeDecorator: customDecoratorSerilize.serializeLiteralDecorator(["Component", "Prop", "Inject"])
  });
  return output;
}
```

# Interface

***serializeTsFiles***`(files, [config])`recieve a dozens of entry files of typescript and extract all classes meta data into json string. Parameter `files` is a string array for entry file names. And second parameter `config` is an optional object contains hooks support for some custom process.

Which includes:

- ***classEntryFilter***`(node)`accept a class declaration node of type `ts.ClassDeclaration`, and return `true` if this class should be serialized. If function not provided will process all classes included in files.

- ***serializeDecorator***`(node)`accept a node of type `ts.Decorator`, and should return a `string` type. If a function is provided, it will be use to serialize decorators.

- ***compilerHostGenerator***`(compilerOptions)`accept a object of type `ts.CompilerOptions`, and return a object of type `ts.CompilerHost`. This is for some occasions that customising a compiler host for program generation is needed for some purpose like changing source file getter or customising module resolver.

***serializeVueFiles***`(files, [config])`is the same as `serializeTsFiles` except adding support of ".vue" vue single file components like files. 