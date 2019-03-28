import path from "path";
import { serializeAllDecoratedClass } from "../src/core";
import { serializeVueFiles } from "../src/vueSerializer";
import fs from "fs";

function main() {
  const cwd = process.cwd();
  const entry = path.join(cwd, "./template/tsTemplate/index.ts");
  const output = serializeAllDecoratedClass([entry]);
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
