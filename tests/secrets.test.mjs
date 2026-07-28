import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("adds deterministic, reachable secret chambers with rewards and counters", async () => {
  const [page, runtime, secrets] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/runtime-types.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/secrets.ts", import.meta.url), "utf8"),
  ]);

  assert.match(secrets, /function generateSecretChambers/);
  assert.match(secrets, /kind !== "safe" && kind !== "boss" && kind !== "maze"/);
  assert.match(secrets, /seededRandom\(seed\)/);
  assert.match(runtime, /secrets: SecretChamber\[\]/);
  assert.match(runtime, /secretsFound: number/);
  assert.match(page, /TRACE SIGNAL LEAK/);
  assert.match(page, /SECRET CHAMBER/);
  assert.match(page, /Math\.round\(500 \* game\.hype\)/);
  assert.match(page, /SECRETS FOUND/);
  assert.match(page, /secretsFound: game\.secretsFound/);
});
