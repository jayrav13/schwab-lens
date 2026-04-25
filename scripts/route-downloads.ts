import { readdirSync, statSync, mkdirSync, renameSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { routeFile } from "@/lib/brokerage/registry";

const downloadsDir = path.join(os.homedir(), "Downloads");
const dataDir = path.join(process.cwd(), "data");

function moveNoClobber(src: string, dest: string): "moved" | "skipped" {
  if (existsSync(dest)) return "skipped";
  mkdirSync(path.dirname(dest), { recursive: true });
  renameSync(src, dest);
  return "moved";
}

function main(): void {
  if (!existsSync(downloadsDir)) {
    console.log(`No ~/Downloads directory at ${downloadsDir}`);
    return;
  }

  const moved: string[] = [];
  const skipped: string[] = [];
  const unmatched: string[] = [];

  for (const name of readdirSync(downloadsDir)) {
    const src = path.join(downloadsDir, name);
    if (!statSync(src).isFile()) continue;
    if (!name.toLowerCase().endsWith(".csv")) continue;

    const route = routeFile(name);
    if (!route) {
      unmatched.push(name);
      continue;
    }

    const content = readFileSync(src, "utf8");
    const identity = route.brokerage.identify({ filepath: src, content });
    const dest = path.join(
      dataDir,
      route.brokerage.slug,
      identity.externalId,
      route.kind,
      name,
    );
    const result = moveNoClobber(src, dest);
    if (result === "moved") moved.push(`${name} -> ${path.relative(process.cwd(), dest)}`);
    else skipped.push(name);
  }

  console.log(`moved (${moved.length}):`);
  for (const m of moved) console.log(`  ${m}`);
  console.log(`skipped — destination already exists (${skipped.length}):`);
  for (const s of skipped) console.log(`  ${s}`);
  console.log(`unmatched — no brokerage adapter recognized (${unmatched.length}):`);
  for (const u of unmatched) console.log(`  ${u}`);
}

main();
