import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { zipSync } from "fflate";
async function collect(dir, prefix = "") {
  const out = {};
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${item.name}`,
      key = prefix + item.name;
    if (item.isDirectory()) Object.assign(out, await collect(path, key + "/"));
    else out[key] = new Uint8Array(await readFile(path));
  }
  return out;
}
await mkdir("artifacts", { recursive: true });
await writeFile(
  "artifacts/solve2scroll-v0.1.0.zip",
  zipSync(await collect("dist"), { level: 9 }),
);
console.log("Created artifacts/solve2scroll-v0.1.0.zip");
