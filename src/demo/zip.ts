/**
 * Minimal ZIP (STORE / no compression) writer — enough to bundle a turntable
 * frame sequence into one download. PNGs are already compressed, so storing
 * them uncompressed costs nothing and keeps this dependency-free.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface Entry {
  name: Uint8Array;
  data: Uint8Array;
  crc: number;
  offset: number;
}

/** Build a STORE-mode .zip Blob from named byte payloads. */
export function makeZip(files: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const entries: Entry[] = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const header = new Uint8Array(30 + name.length);
    const hv = new DataView(header.buffer);
    hv.setUint32(0, 0x04034b50, true); // local file header signature
    hv.setUint16(4, 20, true); // version needed
    hv.setUint16(6, 0, true); // flags
    hv.setUint16(8, 0, true); // method = store
    hv.setUint16(10, 0, true); // mod time
    hv.setUint16(12, 0, true); // mod date
    hv.setUint32(14, crc, true);
    hv.setUint32(18, f.data.length, true); // compressed size
    hv.setUint32(22, f.data.length, true); // uncompressed size
    hv.setUint16(26, name.length, true);
    hv.setUint16(28, 0, true); // extra length
    header.set(name, 30);

    entries.push({ name, data: f.data, crc, offset });
    parts.push(header, f.data);
    offset += header.length + f.data.length;
  }

  // Central directory
  const central: Uint8Array[] = [];
  let centralSize = 0;
  for (const e of entries) {
    const rec = new Uint8Array(46 + e.name.length);
    const rv = new DataView(rec.buffer);
    rv.setUint32(0, 0x02014b50, true); // central dir signature
    rv.setUint16(4, 20, true); // version made by
    rv.setUint16(6, 20, true); // version needed
    rv.setUint16(8, 0, true);
    rv.setUint16(10, 0, true); // method store
    rv.setUint16(12, 0, true);
    rv.setUint16(14, 0, true);
    rv.setUint32(16, e.crc, true);
    rv.setUint32(20, e.data.length, true);
    rv.setUint32(24, e.data.length, true);
    rv.setUint16(28, e.name.length, true);
    rv.setUint16(30, 0, true); // extra
    rv.setUint16(32, 0, true); // comment
    rv.setUint16(34, 0, true); // disk
    rv.setUint16(36, 0, true); // internal attrs
    rv.setUint32(38, 0, true); // external attrs
    rv.setUint32(42, e.offset, true); // local header offset
    rec.set(e.name, 46);
    central.push(rec);
    centralSize += rec.length;
  }

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central dir signature
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true); // central dir offset
  ev.setUint16(20, 0, true); // comment length

  return new Blob([...parts, ...central, end] as BlobPart[],
    { type: "application/zip" });
}
