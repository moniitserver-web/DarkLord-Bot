const test = require('node:test');
const assert = require('node:assert/strict');
const { parseScreenshotText, createScreenshotPayload } = require('./helpers/load-ts.cjs')('src/lib/screenshot-bridge.ts');

test('character IDs keep leading zeroes and precision, and are never module attributes', () => {
  const result = parseScreenshotText('角色名稱：測試角色\nUID：001234567890123456789\n等級：60\n伺服器：測試服\n模組數量：929\n特攻傷害加持 +12');
  assert.deepEqual(result.character, { name: '測試角色', uid: '001234567890123456789', level: 60, server: '測試服' });
  assert.equal(result.moduleCount, 929);
  assert.deepEqual(result.attributes, [{ name: '特攻傷害加持', value: 12 }]);
});

test('item identifiers stay distinct from a character UID and support full-width OCR digits', () => {
  const result = parseScreenshotText('UID：００１２３４５６\n物品代碼：５５００２０３\n物品實例ID：9007199254740993\n攻速專注：8');
  assert.deepEqual(result.character, { uid: '00123456' });
  assert.deepEqual(result.item, { gameConfigId: '5500203', gameInstanceId: '9007199254740993' });
  assert.deepEqual(result.attributes, [{ name: '攻速專注', value: 8 }]);
});

test('conflicting or unclear OCR never guesses a character ID', () => {
  const result = parseScreenshotText('UID：12345678\nUID：87654321\n角色名稱：甲\n角色名稱：乙\n物品代碼：55O0203');
  assert.equal(result.character.uid, undefined);
  assert.equal(result.character.name, undefined);
  assert.equal(result.item.gameConfigId, undefined);
  assert.ok(result.warnings.length >= 3);
});

test('an image with no recognized text does not report character data or OCR success', () => {
  const result = createScreenshotPayload({ source:'upload', page:'角色資訊', ocrText:'' });
  assert.deepEqual(result.parsed.character, {});
  assert.deepEqual(result.parsed.attributes, []);
  assert.equal(result.region, 'tw-hk-mo');
  assert.equal(result.textSource, 'manual');
});

test('explicitly confirmed character corrections are sent separately from raw OCR', () => {
  const result = createScreenshotPayload({ source: 'screen', page: '角色資訊', ocrText: 'UID：12345679', confirmedCharacter: { name: '測試角色', uid: '0012345678' } });
  assert.equal(result.confirmedCharacter.uid, '0012345678');
  assert.equal(result.parsed.character.uid, '12345679');
});


test('a generic item name is not used as a character name', () => {
  const result = parseScreenshotText('名稱：特攻模組\n物品代碼：5500203');
  assert.equal(result.character.name, undefined);
  assert.equal(result.item.gameConfigId, '5500203');
});
