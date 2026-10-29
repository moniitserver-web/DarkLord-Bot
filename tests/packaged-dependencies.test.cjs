const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { getFileMatchers, copyFiles } = require("app-builder-lib/out/fileMatcher");
const { build } = require("../package.json");

test("packaged standalone server can resolve its dependencies outside the checkout", async t => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), "darklord-package-"));
  t.after(() => fs.rm(fixture, { recursive: true, force: true }));
  const standalone = path.join(fixture, ".next", "standalone");
  const resources = path.join(fixture, "dist", "resources");
  await fs.mkdir(path.join(standalone, "node_modules", "next"), { recursive: true });
  await fs.mkdir(path.join(standalone, ".next"), { recursive: true });
  await fs.mkdir(path.join(fixture, ".next", "static"), { recursive: true });
  await fs.writeFile(path.join(standalone, "node_modules", "next", "index.js"), "module.exports = 'dependency loaded';");
  await fs.writeFile(path.join(standalone, "server.js"), "console.log(require('next'));");
  await fs.writeFile(path.join(standalone, ".next", "BUILD_ID"), "fixture-build");
  await fs.writeFile(path.join(fixture, ".next", "static", "app.css"), "body { color: white; }");

  // Exercise the actual packager's copy rules; its root node_modules exclusion
  // previously produced an installer that built successfully but could not boot.
  const matchers = getFileMatchers(build, "extraResources", resources, {
    macroExpander: value => value,
    customBuildOptions: {},
    globalOutDir: path.join(fixture, "dist"),
    defaultSrc: fixture,
  });
  await copyFiles(matchers);
  const environment = { ...process.env };
  delete environment.NODE_PATH;
  const child = spawnSync(process.execPath, [path.join(resources, "server", "server.js")], {
    cwd: resources,
    env: environment,
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.trim(), "dependency loaded");
  assert.equal(await fs.readFile(path.join(resources, "server", ".next", "BUILD_ID"), "utf8"), "fixture-build");
  assert.match(await fs.readFile(path.join(resources, "server", ".next", "static", "app.css"), "utf8"), /color: white/);
});
