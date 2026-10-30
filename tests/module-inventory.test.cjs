const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

function loadTypeScript(relative) {
  const filename = path.resolve(__dirname, "..", relative);
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const requireFromFile = loaded.require.bind(loaded);
  loaded.require = (request) => {
    const candidate = path.resolve(path.dirname(filename), `${request}.ts`);
    return request.startsWith(".") && fs.existsSync(candidate)
      ? loadTypeScript(path.relative(path.resolve(__dirname, ".."), candidate))
      : requireFromFile(request);
  };
  loaded._compile(output, filename);
  return loaded.exports;
}

const { parseInventory, serializeInventory } = loadTypeScript("src/lib/module-inventory.ts");
const { containsPublicSnapshotModules } = loadTypeScript("src/data/full-modules.ts");
const { optimizeModules } = loadTypeScript("src/lib/module-optimizer.ts");
const legacy = { id: "my-local-1", name: "我的模組", type: "輔助", stats: { "暴擊專注": 8 } };
const document = (modules) => JSON.stringify({ version: 1, modules });

test("legacy version 1 inventories round-trip without inventing game identifiers or a region", () => {
  assert.deepEqual(parseInventory(serializeInventory([legacy])), { version: 1, modules: [legacy] });
});

test("game identifiers survive import and export as exact strings distinct from the local id", () => {
  const input = { ...legacy, gameConfigId: "5500203", gameInstanceId: "9007199254740993123", region: "tw-hk-mo" };
  assert.deepEqual(parseInventory(serializeInventory([input])), { version: 1, modules: [input] });
});

test("two module instances can share a game type code without being treated as duplicate inventory entries", () => {
  const imported = parseInventory(document([
    { ...legacy, gameConfigId: "5500203", gameInstanceId: "0001", region: "tw-hk-mo" },
    { ...legacy, id: "my-local-2", gameConfigId: "5500203", gameInstanceId: "0002", region: "tw-hk-mo" },
  ]));
  assert.equal(imported.modules.length, 2);
  assert.equal(imported.modules[1].gameInstanceId, "0002");
});

test("the same physical game instance cannot form a five-module combination under different local ids", () => {
  const duplicated = Array.from({ length: 5 }, (_, index) => ({
    ...legacy, id: `local-copy-${index}`, gameConfigId: "5500203", gameInstanceId: "000123", region: "tw-hk-mo",
  }));
  assert.throws(() => parseInventory(document(duplicated)), /遊戲實例.*重複/);
  assert.throws(() => optimizeModules(duplicated, {
    type: "輔助", threshold: 0, rules: [{ stat: "暴擊專注", weight: 1, min: 0 }], limit: 10, maxNodes: 1000,
  }), /遊戲實例.*重複/);
});

test("different known regions may use the same instance string and leading zeros remain significant", () => {
  const result = parseInventory(document([
    { ...legacy, gameInstanceId: "000123", region: "tw-hk-mo" },
    { ...legacy, id: "cn-copy", gameInstanceId: "000123", region: "cn" },
    { ...legacy, id: "tw-short", gameInstanceId: "123", region: "tw-hk-mo" },
    { ...legacy, id: "legacy-without-game-id" },
  ]));
  assert.equal(result.modules.length, 4);
  assert.equal(result.modules[0].gameInstanceId, "000123");
  assert.equal(result.modules[2].gameInstanceId, "123");
});

test("an unknown region cannot bypass duplicate game-instance checking regardless of input order", () => {
  for (const regions of [[undefined, undefined], ["unknown", "unknown"], [undefined, "tw-hk-mo"], ["tw-hk-mo", undefined], ["unknown", "cn"], ["global", "unknown"]]) {
    const rows = regions.map((region, index) => ({ ...legacy, id: `local-${index}`, gameInstanceId: "9007199254740993123", ...(region === undefined ? {} : { region }) }));
    assert.throws(() => parseInventory(document(rows)), /區服.*未指定|未指定.*區服/);
  }
});

test("a region may be stored before game codes are known and does not alter unknown stats", () => {
  const input = { ...legacy, region: "tw-hk-mo", stats: { "我的自訂詞條": 4 } };
  assert.deepEqual(parseInventory(document([input])).modules, [input]);
});

test("malformed optional metadata and unknown fields are rejected instead of being silently discarded", () => {
  for (const patch of [
    { gameConfigId: 5500203 }, { gameInstanceId: 9007199254740992 },
    { gameConfigId: "" }, { gameInstanceId: "  " }, { gameInstanceId: "a\nb" },
    { region: "taiwan" }, { region: null }, { configId: "5500203" },
  ]) assert.throws(() => parseInventory(document([{ ...legacy, ...patch }])));
});

test("re-imported public snapshot records remain recognizable without treating all user ids as snapshots", () => {
  assert.equal(containsPublicSnapshotModules([{ ...legacy, id: "vdata-5-1953" }]), true);
  assert.equal(containsPublicSnapshotModules([legacy, { ...legacy, id: "vdata-5-2263" }]), true);
  assert.equal(containsPublicSnapshotModules([{ ...legacy, id: "vdata-5-user-defined" }]), false);
  assert.equal(containsPublicSnapshotModules([]), false);
});

test("verified aliases of the same effect use the public Traditional Chinese label without rewriting game codes", () => {
  const imported = parseInventory(document([{
    ...legacy, gameConfigId: "5500203", region: "tw-hk-mo",
    stats: { "特攻傷害": 8, "暴击专注": 4, "极-生命汲取": 2, "極-急救措施": 3, "我的自訂詞條": 1 },
  }]));
  assert.deepEqual(imported.modules[0].stats, { "特攻傷害加持": 8, "暴擊專注": 4, "極·生命吸取": 2, "極·急救措施": 3, "我的自訂詞條": 1 });
  assert.equal(imported.modules[0].gameConfigId, "5500203");
  assert.equal(imported.modules[0].region, "tw-hk-mo");
});

test("aliases colliding within one module are rejected rather than double-counted", () => {
  assert.throws(() => parseInventory(document([{ ...legacy, stats: { "特攻傷害": 5, "特攻傷害加持": 7 } }])), /重複/);
  assert.throws(() => parseInventory(document([{ ...legacy, stats: { "暴击专注": 5, "暴擊專注": 7 } }])), /重複/);
});
