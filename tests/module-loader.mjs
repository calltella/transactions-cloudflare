import { readFile } from "node:fs/promises";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";
import vm from "node:vm";

export async function loadModule(file, mocks) {
  const cache = new Map();
  async function load(filename) {
    if (cache.has(filename)) return cache.get(filename);
    const source = await readFile(filename, "utf8");
    const module = new vm.SourceTextModule(stripTypeScriptTypes(source), { identifier: filename });
    cache.set(filename, module);
    await module.link(async (specifier, parent) => {
      if (specifier in mocks || (!specifier.startsWith(".") && !specifier.startsWith("@/"))) {
        const exports = specifier in mocks ? mocks[specifier] : await import(specifier);
        return new vm.SyntheticModule(Object.keys(exports), function () {
          for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
        });
      }
      const resolved = specifier.startsWith("@/")
        ? path.resolve("app", specifier.slice(2))
        : path.resolve(path.dirname(parent.identifier), specifier);
      return load(resolved.endsWith(".ts") ? resolved : resolved + ".ts");
    });
    return module;
  }
  const module = await load(path.resolve(file));
  await module.evaluate();
  return module.namespace;
}
