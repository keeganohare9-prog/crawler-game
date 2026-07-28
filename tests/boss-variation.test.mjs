import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("selects and communicates a deterministic Static Conductor boss variation", async () => {
  const [page, runtime] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/runtime-types.ts", import.meta.url), "utf8"),
  ]);

  assert.match(runtime, /"warden" \| "conductor" \| "ninja"/);
  assert.match(page, /floorSeed % 2 === 0 \? "warden" : "conductor"/);
  assert.match(page, /function bossDisplayName/);
  assert.match(page, /STATIC CONDUCTOR/);
  assert.match(page, /OPEN CHANNEL/);
  assert.match(page, /SIGNAL CAGE/);
  assert.match(page, /if \(index === 0 \|\| index === 6\) continue/);
  assert.match(page, /variant === "warden" && enemy\.cooldown/);
  assert.match(page, /Static Conductor leaves two opposite safe lanes/);
});
