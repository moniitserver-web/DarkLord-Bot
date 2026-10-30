const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const implementationPath = path.join(__dirname, '../electron/desktop-capture.cjs');
const hasImplementation = require('node:fs').existsSync(implementationPath);
const implementation = hasImplementation ? require(implementationPath) : {};
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nm5kAAAAASUVORK5CYII=', 'base64');
const dataUrl = `data:image/png;base64,${png.toString('base64')}`;

test('a screenshot must be a bounded PNG or JPEG, not an arbitrary data URL', () => {
  assert.equal(typeof implementation.decodeImageDataUrl, 'function', 'image validation is not implemented');
  assert.deepEqual(implementation.decodeImageDataUrl(dataUrl), png);
  for (const invalid of ['https://example.com/image.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,aGVsbG8=', 'data:image/png;base64,!!!']) {
    assert.throws(() => implementation.decodeImageDataUrl(invalid), /圖片|PNG|JPEG|格式/);
  }
  assert.throws(() => implementation.decodeImageDataUrl(`data:image/png;base64,${Buffer.alloc(8 * 1024 * 1024 + 1).toString('base64')}`), /8 MB/);
});

test('only the local main window frame can request desktop capture or OCR', () => {
  assert.equal(typeof implementation.assertTrustedCaptureCaller, 'function', 'IPC caller validation is not implemented');
  const frame = { url: 'http://127.0.0.1:3817/' };
  const contents = { mainFrame: frame };
  const window = { isDestroyed: () => false, webContents: contents };
  const event = { sender: contents, senderFrame: frame };
  assert.doesNotThrow(() => implementation.assertTrustedCaptureCaller(event, window, 'http://127.0.0.1:3817'));
  assert.throws(() => implementation.assertTrustedCaptureCaller({ ...event, sender: {} }, window, 'http://127.0.0.1:3817'), /來源/);
  assert.throws(() => implementation.assertTrustedCaptureCaller({ ...event, senderFrame: { url: frame.url } }, window, 'http://127.0.0.1:3817'), /來源/);
  frame.url = 'https://example.com/';
  assert.throws(() => implementation.assertTrustedCaptureCaller(event, window, 'http://127.0.0.1:3817'), /來源/);
});

test('capture fails if the selected game window has closed', async () => {
  assert.equal(typeof implementation.createDesktopCaptureService, 'function', 'desktop capture is not implemented');
  const service = implementation.createDesktopCaptureService({ desktopCapturer: { getSources: async () => [] }, screen: { getAllDisplays: () => [] }, platform: 'win32' });
  await assert.rejects(service.captureSource('window:42:0'), /找不到|關閉/);
  await assert.rejects(service.captureSource('../../file'), /來源/);
});

test('OCR temp images are deleted after process failure', async () => {
  assert.equal(typeof implementation.recognizeWindowsImage, 'function', 'Windows OCR is not implemented');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'darklord-ocr-test-'));
  let tempImage;
  try {
    await assert.rejects(implementation.recognizeWindowsImage(png, {
      platform: 'win32', tempRoot: root,
      run: async (_command, args) => {
        tempImage = args[args.indexOf('-ImagePath') + 1];
        assert.deepEqual(await fs.readFile(tempImage), png);
        throw new Error('fixture process failed');
      },
    }), /fixture process failed/);
    assert.ok(tempImage);
    assert.deepEqual(await fs.readdir(root), []);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('English OCR cannot silently stand in for Traditional Chinese', async () => {
  assert.equal(typeof implementation.recognizeWindowsImage, 'function', 'Windows OCR is not implemented');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'darklord-ocr-language-'));
  try {
    await assert.rejects(implementation.recognizeWindowsImage(png, { platform: 'win32', tempRoot: root, run: async () => ({ stdout: JSON.stringify({ text: 'LEVEL 60', language: 'en-US' }) }) }), /繁體中文/);
    const result = await implementation.recognizeWindowsImage(png, { platform: 'win32', tempRoot: root, run: async () => ({ stdout: JSON.stringify({ text: '角色名稱：測試角色', language: 'zh-Hant-TW' }) }) });
    assert.deepEqual(result, { text: '角色名稱：測試角色', language: 'zh-Hant-TW' });
    assert.deepEqual(await fs.readdir(root), []);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
