// cs-w.js — CompressionStream worker lane for the demo (sibling file, syntax-checked by the gate)
self.onmessage = async (e) => {
  const out = { lane: 'dedicated-worker' };
  out.hasCS = typeof CompressionStream !== 'undefined';
  out.hasDS = typeof DecompressionStream !== 'undefined';
  out.inSelf = ('CompressionStream' in self) && ('DecompressionStream' in self);
  try {
    const enc = new TextEncoder();
    const payload = enc.encode('worker-lane-roundtrip :: ' + (e.data && e.data.msg || 'ping') + ' :: ' + new Date().toISOString());
    const cs = new CompressionStream('gzip');
    const w = cs.writable.getWriter(); w.write(payload); w.close();
    const packed = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    const ds = new DecompressionStream('gzip');
    const w2 = ds.writable.getWriter(); w2.write(packed); w2.close();
    const back = new Uint8Array(await new Response(ds.readable).arrayBuffer());
    out.payload = new TextDecoder().decode(back);
    out.packedBytes = packed.byteLength;
    out.rawBytes = payload.byteLength;
    out.match = back.byteLength === payload.byteLength && new TextDecoder().decode(back) === new TextDecoder().decode(payload);
    out.protoCS = Object.getOwnPropertyNames(CompressionStream.prototype).sort().join(',');
  } catch (err) {
    out.error = (err && err.name) + ': ' + (err && err.message);
  }
  postMessage(out);
};
