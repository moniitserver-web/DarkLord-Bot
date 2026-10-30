import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const origin = 'http://127.0.0.1:3918';
const server = spawn(process.execPath, [resolve('.next/standalone/server.js')], {
  env: { ...process.env, HOSTNAME: '127.0.0.1', PORT: '3918', BOT_WEBHOOK_URL: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
server.stdout.on('data', chunk => { output += chunk; });
server.stderr.on('data', chunk => { output += chunk; });
const exited = once(server, 'exit');
try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Standalone server exited: ${output}`);
    try { ready = (await fetch(origin, { signal: AbortSignal.timeout(500) })).ok; } catch {}
    if (ready) break;
    await delay(250);
  }
  assert.ok(ready, `Standalone server failed to start: ${output}`);
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /DarkLord Bot/);
  const assets = [...html.matchAll(/(?:src|href)="([^" ]+\.(?:js|css))"/g)].map(match => match[1]);
  assert.ok(assets.length > 0);
  for (const asset of assets) {
    const response = await fetch(new URL(asset, origin));
    assert.equal(response.status, 200, asset);
    assert.ok((await response.text()).length > 0);
  }
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2XkAAAAASUVORK5CYII=', 'base64');
  const form = () => { const data = new FormData(); data.append('image', new Blob([image], { type:'image/png' }), 'fixture.png'); return data; };
  const emptyText = await (await fetch(`${origin}/api/bot/screenshot`, { method:'POST', body: form() })).json();
  assert.equal(emptyText.forwarded, false);
  assert.equal(emptyText.received.recognition, 'not-run');
  assert.deepEqual(emptyText.received.parsed.character, {});
  const withText = form();
  withText.append('ocrText', '角色名稱：測試角色\nUID：9007199254740993\n模組數量：929\n攻速專注 +8');
  withText.append('confirmedCharacter', JSON.stringify({ name: '測試角色', uid: '001234567890123456789' }));
  const recognized = await (await fetch(`${origin}/api/bot/screenshot`, { method:'POST', body: withText })).json();
  assert.equal(recognized.received.parsed.character.uid, '9007199254740993');
  assert.equal(recognized.received.confirmedCharacter.uid, '001234567890123456789');
  assert.deepEqual(recognized.received.parsed.attributes, [{ name: '攻速專注', value: 8 }]);
  assert.equal((await fetch(`${origin}/api/bot/screenshot`, { method:'POST', body: 'not a form' })).status, 400);
  console.log(JSON.stringify({ ok:true, assets: assets.length, checks: ['standalone startup', 'bundled CSS/JS', 'no fake OCR success', 'exact UID strings', 'confirmed corrections', 'invalid form handling'] }));
} finally {
  server.kill();
  await exited;
}
