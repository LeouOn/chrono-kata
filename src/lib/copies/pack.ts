/** Compress a backup's text for storage when the browser can (gzip), and say which it did. */

export interface Packed {
  encoding: 'gzip' | 'none';
  bytes: Uint8Array<ArrayBuffer>;
}

function canGzip(): boolean {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function' && typeof Response === 'function';
}

async function through(bytes: Uint8Array<ArrayBuffer>, transform: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const input = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return new Uint8Array(await new Response(input.pipeThrough(transform as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)).arrayBuffer());
}

export async function pack(text: string): Promise<Packed> {
  const raw = new TextEncoder().encode(text);
  if (!canGzip()) return { encoding: 'none', bytes: raw };
  try {
    return { encoding: 'gzip', bytes: await through(raw, new CompressionStream('gzip')) };
  } catch {
    return { encoding: 'none', bytes: raw };
  }
}

/** null when the bytes cannot be read back (a damaged copy). */
export async function unpack(bytes: Uint8Array, encoding: 'gzip' | 'none'): Promise<string | null> {
  try {
    const own = new Uint8Array(bytes);
    if (encoding === 'none') return new TextDecoder('utf-8', { fatal: true }).decode(own);
    if (!canGzip()) return null;
    return new TextDecoder('utf-8', { fatal: true }).decode(await through(own, new DecompressionStream('gzip')));
  } catch {
    return null;
  }
}
