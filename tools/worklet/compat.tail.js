// ---------------------------------------------------------------------------
//  compat.tail.js — appended after the Emscripten core + the engine adapter to
//  expose the very same engine to the main thread as an ES module.
//
//  Two jobs:
//    1. js/compat.js imports this file when AudioWorklet is unavailable
//       (sandboxed iframes, old browsers) — ES module + dynamic import means
//       no eval(), so it also works under a strict Content-Security-Policy.
//    2. it is the engine behind the offline ".wav" export.
//
//  The AudioWorklet globals the adapter references are created here if the host
//  does not provide them, so the adapter code stays byte-identical to the
//  worklet build.
// ---------------------------------------------------------------------------
if (typeof globalThis.AudioWorkletGlobalScope === 'undefined') globalThis.AudioWorkletGlobalScope = class {};
if (typeof globalThis.AudioWorkletProcessor === 'undefined') {
  globalThis.AudioWorkletProcessor = class {
    constructor() {
      this.port = { postMessage() {}, onmessage: null, addEventListener() {}, removeEventListener() {}, start() {} };
    }
  };
}
if (typeof globalThis.registerProcessor === 'undefined') globalThis.registerProcessor = () => {};
if (typeof globalThis.sampleRate === 'undefined') globalThis.sampleRate = 48000;
if (typeof globalThis.currentTime === 'undefined') globalThis.currentTime = 0;

export { ENGINE };
export function createModule(opts) { return Module(opts); }
