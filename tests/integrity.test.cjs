// Run with node tests/integrity.test.cjs. No third-party dependency required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const decks = JSON.parse(html.match(/const DECKS = (.+);/)[1]);
const notes = JSON.parse(html.match(/const TEACHING = (.+);/)[1]);
const cards = Object.values(decks).flatMap(d => d.cards);
assert.equal(cards.length, 100);
assert.equal(new Set(cards.map(c => c.id)).size, cards.length);
assert.deepEqual(Object.keys(notes).sort(), cards.map(c => c.id).sort());
for (const c of cards) {
  const n = notes[c.id];
  for (const field of ['meaning', 'pattern', 'example', 'exampleCn', 'grammar', 'note', 'focus']) {
    assert.ok(typeof n[field] === 'string' && n[field].trim(), `${c.id}: missing ${field}`);
  }
  assert.ok(c.front.toLowerCase().includes(n.focus.toLowerCase()), `${c.id}: unusable cloze`);
  for (const w of n.words || []) assert.ok(c.front.toLowerCase().includes(w.word.toLowerCase()), `${c.id}: unrelated word`);
}
for (const [, script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script);

const helperStart = html.indexOf('/* Local subtitle tools.');
const helperEnd = html.indexOf('const LESSON_GUIDE', helperStart);
assert.ok(helperStart > 0 && helperEnd > helperStart);
const sandbox = { window: {} };
vm.runInNewContext(html.slice(helperStart, helperEnd), sandbox);
const { parseSrt, findCue, validateRange, normalize } = sandbox.window.LocalMedia;
const json = value => JSON.parse(JSON.stringify(value));
assert.deepEqual(json(parseSrt('\uFEFF1\r\n00:01:02,345 --> 00:01:04,000\r\n<i>I’m ready.</i>\r\n\r\n2\r\n00:01:05,000 --> 00:01:06,000\r\nYou &amp; me.')), [
  { start: 62.345, end: 64, text: 'I’m ready.' },
  { start: 65, end: 66, text: 'You & me.' }
]);
assert.deepEqual(json(parseSrt('WEBVTT\n\nNOTE ignored\n00:00.000 --> 00:01.000\nNot dialogue\n\nscene-id\n01:02.500 --> 01:04.125 align:start\n<v Jimmy>Hello there.</v>')), [
  { start: 62.5, end: 64.125, text: 'Hello there.' }
]);
assert.equal(parseSrt('1\n00:99:00,000 --> 01:00:00,000\nBad\n\n2\n00:00:04,000 --> 00:00:03,000\nReversed').length, 0);
assert.equal(validateRange(0, 1, 1), true);
for (const args of [[-1, 2], [1, 1], [NaN, 3], [0, Infinity], [0, 3, 2], [0, 2, NaN], ['0', 2]]) assert.equal(validateRange(...args), false);
assert.equal(normalize('I’m sure you WON’T forget; we’ll catch up.'), normalize('I am sure you will not forget. We will catch up!'));
const cues = [
  { start: 1, end: 2, text: 'I need to brush up' },
  { start: 2.1, end: 3, text: 'on my French before' },
  { start: 3.1, end: 4, text: 'the trip.' },
  { start: 5, end: 6, text: 'Good morning.' }
];
assert.equal(findCue(cues, 'I need to brush up on my French before the trip.').end, 4);
assert.equal(findCue([...cues, { start: 7, end: 8, text: 'Good morning!' }], 'Good morning.'), null);
assert.equal(findCue([{ start: 1, end: 2, text: 'Well, yes, I know.' }], 'I know.'), null);
assert.equal(findCue(cues, 'I need to brush up on my German before the trip.'), null);
assert.equal(findCue(cues, 'A fabricated line does not get a timestamp.'), null);
const dialogue = [{ start: 10, end: 14, text: '- I need to brush up on my French.\n- Yes, you do.' }];
assert.equal(findCue(dialogue, 'I need to brush up on my French.').start, 10);
assert.equal(findCue([...dialogue, { start: 20, end: 24, text: 'I need to brush up on my French.' }], 'I need to brush up on my French.'), null);
assert.equal(findCue([{ start: 1, end: 5, text: 'I need to brush up' }, { start: 2, end: 3, text: 'on my French.' }], 'I need to brush up on my French.').end, 5);
assert.equal(findCue([{ start: 1, end: 2, text: 'I need to brush up' }, { start: 12, end: 14, text: 'on my French before the trip.' }], 'I need to brush up on my French before the trip.'), null);

const validationStart = html.indexOf('function validateProgress(input)');
const validationEnd = html.indexOf('function downloadProgress()', validationStart);
sandbox.DECKS = decks;
sandbox.store = { settings: { newPerDay: 20, theme: 'auto', speak: 'auto', rate: 1, readCn: 0 } };
sandbox.LocalMedia = sandbox.window.LocalMedia;
sandbox.TEACHING = notes;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../shared/deck-format.js'),'utf8'), sandbox);
const customStart = html.indexOf('/* Custom decks are part');
vm.runInNewContext(html.slice(customStart, helperStart), sandbox);
vm.runInNewContext(html.slice(validationStart, validationEnd) + '\nglobalThis.validate = validateProgress;', sandbox);
const original = {
  cards: { [cards[0].id]: { phase: 'review', ivl: 7, ease: 2.5, due: 1780000000000, reps: 5, lapses: 0 } },
  days: { '2026-10-10': 1 }, settings: { theme: 'dark' }, removed: []
};
const restored = json(sandbox.validate(original));
assert.deepEqual(restored.cards, original.cards);
assert.deepEqual(restored.days, original.days);
assert.equal(restored.settings.theme, 'dark');
assert.deepEqual(restored.workbook, { cards: {}, last: null, ranges: {} });
const invalid = JSON.parse(JSON.stringify(original));
invalid.cards[cards[0].id].ease = 999;
assert.throws(() => sandbox.validate(invalid), /复习记录格式不正确/);
assert.throws(() => sandbox.validate({ cards: [] }), /有效的学习进度文件/);
assert.throws(() => sandbox.validate(null), /有效的学习进度文件/);
const withWorkbook = JSON.parse(JSON.stringify(original));
withWorkbook.workbook = { cards: { [cards[0].id]: { read: true, heard: true, star: true, heardSource: 'original', note: 'My own example.', dictation: 'My answer', issue: '' } }, last: { deckId: Object.keys(decks)[0], index: 2 }, ranges: { file: { [cards[0].id]: { start: 1, end: 3 } } } };
assert.deepEqual(json(sandbox.validate(withWorkbook)).workbook, withWorkbook.workbook);
console.log('Passed: 100 teaching cards, script syntax, SRT/VTT parsing, conservative matching, ranges, and backup validation.');
