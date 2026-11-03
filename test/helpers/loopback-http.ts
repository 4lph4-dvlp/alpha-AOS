import { request } from "node:http";
import { Readable } from "node:stream";

// Panel tests exercise our server, not Node's bundled undici QoS write path
// (nodejs/undici#6075). Keep real headers/streams/abort errors without retries
// or a process-wide socket/uncaught-exception patch.
export async function loopbackFetch(url: string, options: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal } = {}): Promise<Response> {
  const target = new URL(url);
  if (target.protocol !== "http:" || target.hostname !== "127.0.0.1" || target.username || target.password) throw new Error("Panel fixture requires an HTTP loopback URL");
  return new Promise<Response>((resolve, reject) => {
    const req = request(target, { method: options.method ?? "GET", headers: options.headers ?? {},
      signal: options.signal ?? AbortSignal.timeout(15000), agent: false }, (res) => {
      const headers = new Headers();
      for (let i = 0; i < res.rawHeaders.length; i += 2) headers.append(res.rawHeaders[i]!, res.rawHeaders[i + 1]!);
      const status = res.statusCode ?? 500;
      const noBody = options.method === "HEAD" || [204, 205, 304].includes(status);
      if (noBody) res.resume();
      const body = noBody ? null : Readable.toWeb(res, { strategy: {
        highWaterMark: 8192, size: (chunk: Uint8Array) => chunk.byteLength,
      } }) as ReadableStream<Uint8Array>;
      resolve(new Response(body, { status, headers }));
    });
    req.once("error", reject);
    req.end(options.body);
  });
}
