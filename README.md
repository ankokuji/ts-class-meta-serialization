# Example

In the following example we defined a custom function to serilize ts files.

```typescript
import {
  serializeTsFiles,
  serializeVueFiles,
  customEntryFilters,
  customDecoratorSerilize
} from "ts-meta-extract";

export function customSerializeTsFiles(entries: string[]) {
  const output = serializeTsFiles(entries, {
    classEntryFilter: customEntryFilters.isDecoratedBy(["Component"]),
    serializeDecorator: customDecoratorSerilize.serializeLiteralDecorator(["Component", "Prop", "Inject"])
  });
  return output;
}
```

The function provide a custom serialization which meets two conditions:

1. Only serialize classes decorated by decorator named by `"Component"`; (by defining `classEntryFilter`)

2. Serialize all decorators named by `"Component"`, `"Prop"` and `"Inject"`. (by defining `serializeDecorator`)

# Interface

**serializeTsFiles**`(files, [config])`recieves a dozens of entry files of typescript and extract all classes meta data into json string.The first parameter `files` is a string array for entry file names. And the second parameter `config` is an optional object contains hooks for some custom process.

The custom hooks includes:

- **classEntryFilter**`(node)`accepts a class declaration node of type `ts.ClassDeclaration`, and return `true` if this class should be serialized. If no function was provided, all classes included in files will be serialized.

- **serializeDecorator**`(node)`accepts a node of type `ts.Decorator`, and should return a `string` type. If a function is provided, the function will be use to serialize decorators.

- **compilerHostGenerator**`(compilerOptions)`accepts a object of type `ts.CompilerOptions`, and return a object of type `ts.CompilerHost`. This is for some occasions that customising a compiler host for program generation is needed for some purpose like changing source file getter or customising module resolver.

**serializeVueFiles**`(files, [config])`is the same as `serializeTsFiles` except adding support of ".vue" vue single file components like files. 