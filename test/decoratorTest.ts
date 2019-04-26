import path from "path";
import {
  serializeTsFiles,
  serializeVueFiles,
  customEntryFilters,
  customDecoratorSerilize
} from "../src/index";
import fs from "fs";

const MODULE_TEMPLATE_ENTRY = "./template/moduleTemplate/index.ts";

function main() {
  const cwd = process.cwd();
  const entry = path.join(cwd, MODULE_TEMPLATE_ENTRY);
  const output = serializeTsFiles([entry], {
    classEntryFilter: customEntryFilters.isDecoratedBy(["Component"]),
    serializeDecorator: customDecoratorSerilize.serializeLiteralDecorator(["Component", "Prop", "Inject"])
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
