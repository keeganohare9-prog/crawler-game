import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the Signal Depths game shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Signal Depths/);
  assert.match(html, /ENTER THE DEPTHS/);
  assert.match(html, /CRAWLER FIELD GUIDE/);
  assert.match(html, /SHIFT \+ SPACE/);
  assert.match(html, /HEAVY/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/);
});

test("includes the complete three-class combat specification", async () => {
  const [page, classes, arsenal] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/classes.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/class-arsenal.ts", import.meta.url), "utf8"),
  ]);
  assert.match(classes, /knight:/);
  assert.match(classes, /mage:/);
  assert.match(classes, /archer:/);
  assert.match(classes, /Committed Strike/);
  assert.match(classes, /Gravity Sigil/);
  assert.match(classes, /Power Shot/);
  assert.match(page, /screen === "class-select"/);
  assert.match(page, /shiftUsedForHeavy/);
  assert.match(page, /action === "heavy"/);
  assert.match(page, /section === "classes"/);
  assert.match(page, /arsenalClass/);
  assert.match(page, /groundClassArsenal/);
  for (const id of ["signal-grimoire", "cinder-codex", "frost-prism", "storm-orb", "void-lantern", "relay-recurve", "deadeye-longbow", "splitwire-bow", "bankshot-bow", "gearshot-repeater"]) assert.match(arsenal, new RegExp(id));
});

test("uses wide unlocked doorways and Gambler's Cache rooms", async () => {
  const [page, floor] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/floor.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /\[3, 4, 5\]\.includes/);
  assert.match(page, /return kind === "boss"/);
  assert.match(page, /function chaseWaypoint/);
  assert.match(page, /Math\.random\(\) < \.5/);
  assert.match(page, /releaseLootAmbush/);
  assert.match(floor, /"loot"/);
  assert.doesNotMatch(floor, /"trap"/);
});
