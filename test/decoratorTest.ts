import path from "path";
import {
  serializeTsFiles,
  serializeVueFiles,
  customEntryFilters,
  customDecoratorSerilize
} from "../src/index";
import fs from "fs";

function main() {
  const cwd = process.cwd();
  const entry = path.join(cwd, "./template/tsTemplate/index.ts");
  const output = serializeTsFiles([entry], {
    classEntryFilter: customEntryFilters.isDecoratedBy("Component"),
    serializeDecorator: customDecoratorSerilize.serializeLiteralDecorator(["Component", "Prop"])
  });
  fs.writeFileSync("classes.json", JSON.stringify(output, undefined, 2));
  return;
}

function main2() {
  const cwd = process.cwd();
  const entry = path.join(cwd, "./template/vueTemplate/index.vue");
  const output = serializeVueFiles([entry]);
  fs.writeFileSync("classes.json", JSON.stringify(output, undefined, 2));
  return;
}

main();
