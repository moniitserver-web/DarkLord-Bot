import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const require = createRequire(import.meta.url);
const { recognizeWindowsImage } = require('../electron/desktop-capture.cjs');
const run = promisify(execFile);
const logDir = resolve(process.env.OCR_LOG_DIR || join(tmpdir(), 'darklord-windows-ocr-logs'));
const scratch = await mkdtemp(join(tmpdir(), 'DarkLord OCR 測試 '));
const report = { platform: process.platform, availableLanguages: [], checks: [], failures: [] };
const quotePS = value => `'${value.replaceAll("'", "''")}'`;

await mkdir(logDir, { recursive: true });
try {
  if (process.platform !== 'win32') throw new Error('Windows OCR smoke test must run on Windows.');
  const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const options = { timeout: 60_000, maxBuffer: 1024 * 1024, windowsHide: true, encoding: 'utf8' };
  const source = await readFile(new URL('../electron/windows-ocr.ps1', import.meta.url), 'utf8');
  const diagnosticScript = join(scratch, 'ocr-diagnostics.ps1');
  await writeFile(diagnosticScript, '\ufeff' + source.replace(/^\ufeff/, ''), 'utf8');
  const diagnostics = await run(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', diagnosticScript, '-Diagnostics'], options);
  Object.assign(report, JSON.parse(diagnostics.stdout.replace(/^\ufeff/, '').trim()));
  assert.ok(report.traditionalChinese, `Traditional Chinese OCR is unavailable. Installed languages: ${report.availableLanguages.join(', ')}. Install Language.OCR~~~zh-TW~0.0.1.0 before this test.`);

  const fixture = join(scratch, '繁體中文 fixture.png');
  const drawingScript = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Drawing
$families = @([System.Drawing.FontFamily]::Families | ForEach-Object { $_.Name })
$fontName = @('Microsoft JhengHei', 'Microsoft JhengHei UI', 'Microsoft YaHei', 'SimSun') | Where-Object { $families -contains $_ } | Select-Object -First 1
if (-not $fontName) { throw 'A Traditional Chinese font is required for the OCR fixture.' }
$bitmap = New-Object System.Drawing.Bitmap(1300, 400)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$font = New-Object System.Drawing.Font($fontName, 38, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
try {
  $graphics.Clear([System.Drawing.Color]::White)
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.DrawString('LEVEL 60', $font, [System.Drawing.Brushes]::Black, 40, 30)
  $graphics.DrawString('UID 12345678', $font, [System.Drawing.Brushes]::Black, 40, 110)
  $graphics.DrawString('角色名稱：測試角色', $font, [System.Drawing.Brushes]::Black, 40, 190)
  $graphics.DrawString('模組數量：929', $font, [System.Drawing.Brushes]::Black, 40, 270)
  $bitmap.Save(${quotePS(fixture)}, [System.Drawing.Imaging.ImageFormat]::Png)
  @{ fixtureFont = $fontName } | ConvertTo-Json -Compress
} finally { $font.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
`;
  const drawing = await run(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(drawingScript, 'utf16le').toString('base64')], options);
  Object.assign(report, JSON.parse(drawing.stdout.replace(/^\ufeff/, '').trim()));
  const bytes = await readFile(fixture);
  await writeFile(join(logDir, 'fixture.png'), bytes);
  const result = await recognizeWindowsImage(bytes);
  report.recognition = result;
  const compact = result.text.replace(/\s+/g, '');
  assert.match(result.language, /^zh-(?:Hant(?:-|$)|TW$|HK$|MO$)/i);
  assert.match(compact, /12345678/, 'OCR should read the synthetic UID without changing its digits');
  assert.match(compact, /LEVEL60/i, 'Traditional Chinese OCR should also read Latin text');
  assert.match(compact, /角色|測試/, 'OCR should produce Traditional Chinese text, not only numbers');
  report.checks.push('Traditional Chinese recognizer selected', 'synthetic UID digits', 'Latin fixture text', 'Traditional Chinese fixture text');
  console.log(`Windows OCR smoke passed (${result.language}); diagnostics: ${logDir}`);
} catch (error) {
  report.failures.push(error instanceof Error ? `${error.message}\n${error.stderr || ''}` : String(error));
  process.exitCode = 1;
  console.error(report.failures.at(-1));
} finally {
  await rm(scratch, { recursive: true, force: true });
  await writeFile(join(logDir, 'summary.json'), JSON.stringify(report, null, 2), 'utf8');
}
