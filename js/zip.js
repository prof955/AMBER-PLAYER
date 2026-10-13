// zip.js — tiny ZIP reader (stored + deflate) and gzip helper.
// No dependencies: uses DecompressionStream('deflate-raw' | 'gzip') from the browser.
// Used for the "drop a .zip of ripped chiptunes" workflow (that is how most
// console soundtracks are distributed) and for .vgz / .gz files.

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Tarayıcı DecompressionStream desteklemiyor (Chrome/Edge 80+, Firefox 113+, Safari 16.4+)');
  }
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gunzip(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('DecompressionStream yok');
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function u16(b, o) { return b[o] | (b[o + 1] << 8); }
function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

/**
 * List the entries of a ZIP archive from its bytes.
 * @returns {Promise<Array<{name:string,size:number,compressed:number,offset:number,method:number}>>}
 */
export function listZip(bytes) {
  // locate End Of Central Directory (scan backwards, max comment 64 KB)
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP: EOCD bulunamadı');
  const count = u16(bytes, eocd + 10);
  let p = u32(bytes, eocd + 16);           // central directory offset
  const out = [];
  for (let i = 0; i < count; i++) {
    if (u32(bytes, p) !== 0x02014b50) break;
    const method = u16(bytes, p + 10);
    const compressed = u32(bytes, p + 20);
    const size = u32(bytes, p + 24);
    const nameLen = u16(bytes, p + 28);
    const extraLen = u16(bytes, p + 30);
    const commentLen = u16(bytes, p + 32);
    const offset = u32(bytes, p + 42);
    const name = new TextDecoder('utf-8', { fatal: false }).decode(bytes.subarray(p + 46, p + 46 + nameLen));
    out.push({ name, size, compressed, offset, method });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** Extract one entry (by index from listZip) and return its bytes. */
export async function extractEntry(zipBytes, entry) {
  const p = entry.offset;
  if (u32(zipBytes, p) !== 0x04034b50) throw new Error('ZIP: yerel başlık bozuk (' + entry.name + ')');
  const nameLen = u16(zipBytes, p + 26);
  const extraLen = u16(zipBytes, p + 28);
  const start = p + 30 + nameLen + extraLen;
  const raw = zipBytes.subarray(start, start + entry.compressed);
  if (entry.method === 0) return new Uint8Array(raw);
  if (entry.method === 8) return await inflateRaw(raw);
  throw new Error('ZIP: desteklenmeyen sıkıştırma metodu ' + entry.method + ' (' + entry.name + ')');
}

/** Extract every entry whose name matches a predicate (bounded size). */
export async function extractAll(zipBytes, filter, maxBytes = 24 * 1024 * 1024) {
  const result = [];
  for (const e of listZip(zipBytes)) {
    if (e.name.endsWith('/')) continue;
    if (e.size > maxBytes || e.compressed > maxBytes) continue;
    if (filter && !filter(e.name)) continue;
    try {
      const data = await extractEntry(zipBytes, e);
      result.push({ name: e.name, data });
    } catch (err) {
      result.push({ name: e.name, error: String(err.message || err) });
    }
  }
  return result;
}
