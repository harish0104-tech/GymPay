const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function setup(platform = 'android', granted = true) {
  const calls = [];
  const notifications = {
    AndroidImportance: { HIGH: 4 }, IosAuthorizationStatus: { PROVISIONAL: 3 },
    setNotificationHandler: handler => calls.push(['handler', handler]),
    setNotificationChannelAsync: async (...args) => calls.push(['channel', ...args]),
    getPermissionsAsync: async () => ({ granted }),
    requestPermissionsAsync: async () => ({ granted }),
    dismissNotificationAsync: async id => calls.push(['dismiss', id]),
    scheduleNotificationAsync: async content => calls.push(['schedule', content]),
  };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(__dirname + '/notifications.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: name => name === 'react-native' ? { Platform: { OS: platform } } : notifications });
  return { calls, show: exports.showReminders };
}
const item = { id: 'reminder-1', title: 'Abishek expires today', body: 'Renewal payment is due.' };
test('Android posts the actual reminder on its high-importance channel', async () => {
  const { calls, show } = setup();
  assert.equal(await show([item]), 1);
  assert.equal(calls.find(c => c[0] === 'channel')[2].importance, 4);
  const notification = calls.find(c => c[0] === 'schedule')[1];
  assert.equal(notification.content.title, item.title);
  assert.equal(notification.content.body, item.body);
  assert.equal(notification.trigger.channelId, 'membership-reminders');
  assert.equal(calls.find(c => c[0] === 'dismiss')[1], item.id);
  assert.equal((await calls[0][1].handleNotification()).shouldShowBanner, true);
});
test('denied permission fails without pretending delivery succeeded', async () => {
  const { calls, show } = setup('android', false);
  await assert.rejects(show([item]), /blocked/);
  assert.equal(calls.some(c => c[0] === 'schedule'), false);
});
test('iOS posts an immediate notification without Android channel configuration', async () => {
  const { calls, show } = setup('ios');
  await show([item]);
  assert.equal(calls.some(c => c[0] === 'channel'), false);
  assert.equal(calls.find(c => c[0] === 'schedule')[1].trigger, null);
});
test('malformed and oversized bridge messages are rejected', async () => {
  const { show } = setup();
  await assert.rejects(show([{ ...item, body: 12 }]), /Invalid/);
  await assert.rejects(show(Array(51).fill(item)), /Invalid/);
  assert.equal(await show([]), 0);
});
