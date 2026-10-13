import assert from 'node:assert';

globalThis.document = {
  createElement: () => ({
    append: () => {},
    setAttribute: () => {},
    addEventListener: () => {},
    style: {},
    querySelector: () => ({})
  })
};

import { sniff, scanEmbedded } from '../js/formats.js';
import { Playlist } from '../js/playlist.js';

console.log('Running unit bug fix checks...');

// 1. Format sniffing for MED, DBM, FAR
const medHeader = new Uint8Array([77, 77, 68, 48, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // MMD0
const dbmHeader = new Uint8Array([68, 66, 77, 48, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // DBM0
const farHeader = new Uint8Array([70, 65, 82, 254, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); // FAR\xfe

const medInfo = sniff(medHeader);
assert.strictEqual(medInfo?.kind, 'MED', 'MED file magic check failed');
console.log('PASS: MED format sniffing');

const dbmInfo = sniff(dbmHeader);
assert.strictEqual(dbmInfo?.kind, 'DBM', 'DBM file magic check failed');
console.log('PASS: DBM format sniffing');

const farInfo = sniff(farHeader);
assert.strictEqual(farInfo?.kind, 'FAR', 'FAR file magic check failed');
console.log('PASS: FAR format sniffing');

// 2. Playlist onActivate and onRemove
let activatedItem = null;
let removedItem = null;
const playlist = new Playlist({ innerHTML: '', append: () => {} }, { textContent: '' });
playlist.onActivate = (item, idx) => { activatedItem = item; };
playlist.onRemove = (item) => { removedItem = item; };

const item1 = playlist.add({ name: 'song1.mod', tracks: [{ index: 0, title: 'Track 1' }] });
const item2 = playlist.add({ name: 'song2.nsf', tracks: [{ index: 0, title: 'Intro' }] });

assert.strictEqual(playlist.items.length, 2);

playlist.onActivate(item1, 0);
assert.strictEqual(activatedItem, item1, 'playlist.onActivate failed');
console.log('PASS: playlist.onActivate callback');

playlist.remove(item1.id);
playlist.onRemove(item1);
assert.strictEqual(removedItem, item1, 'playlist.onRemove failed');
assert.strictEqual(playlist.items.length, 1);
console.log('PASS: playlist.onRemove callback');

// 3. Playlist toM3U export
playlist.clear();
playlist.add({ name: 'test.nsf', tracks: [{ index: 0, title: 'Track 1' }, { index: 1, title: 'Track 2' }] });
const m3u = playlist.toM3U();
assert.ok(m3u.includes('#EXTM3U'), 'm3u missing header');
assert.ok(m3u.includes('#EXTINF:-1,test.nsf :: Track 1'), 'm3u missing track 1 metadata');
assert.ok(m3u.includes('\ntest.nsf\n'), 'm3u missing file entry line after EXTINF');
console.log('PASS: M3U export formatting');

// 4. scanEmbedded embedded ROM music extraction
const dummyRom = new Uint8Array(200);
dummyRom[64] = 0x4e; dummyRom[65] = 0x45; dummyRom[66] = 0x53; dummyRom[67] = 0x4d; dummyRom[68] = 0x1a;
const emb = scanEmbedded(dummyRom);
assert.strictEqual(emb?.offset, 64, 'embedded music offset mismatch');
assert.strictEqual(emb?.info?.kind, 'NSF', 'embedded music format mismatch');
console.log('PASS: embedded music extraction from ROMs');

console.log('ALL UNIT BUG CHECKS PASSED!');
