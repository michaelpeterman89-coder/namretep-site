// Generates planet surfaces off the main thread, so new planets never stutter
// the animation. Messages: { id, look, seed, width } in, { id, surface } out.

import { generateSurface, type Look } from "./surfaces";

type Request = { id: number; look: Look; seed: number; width: number };

self.onmessage = (e: MessageEvent<Request>) => {
  const { id, look, seed, width } = e.data;
  const surface = generateSurface(look, seed, width);
  const buffers = [surface.color, surface.bump, surface.roughness, surface.emissive, surface.clouds]
    .filter((b): b is Uint8Array => b !== null)
    .map((b) => b.buffer as ArrayBuffer);
  (self as unknown as Worker).postMessage({ id, surface }, buffers);
};
