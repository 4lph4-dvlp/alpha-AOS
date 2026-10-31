import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { watch } from "node:fs";
import { hostname } from "node:os";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readTaskSessionEvents, taskSessionRoot, validateTaskSessionBinding, type TaskSessionBinding } from "./task-session.js";

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>오토파일럿 진행 상황</title><link rel="stylesheet" href="/panel.css"><script src="/panel.js" defer></script></head><body><a href="#main">본문으로 건너뛰기</a><header><h1>오토파일럿 진행 상황</h1><p id="connection" role="status" aria-live="polite">실행 기록을 불러오는 중입니다.</p><button id="reconnect" hidden>패널 다시 연결</button><button id="copy">실행 정보 복사</button><div id="copy-container" hidden><label for="copy-fallback">선택 가능한 실행 정보</label><textarea id="copy-fallback" readonly></textarea></div></header><main id="main"><section><h2>실행 식별 정보</h2><p id="binding-summary">확인되지 않음</p><details><summary>전체 실행 식별 정보</summary><pre id="binding"></pre></details></section><section><h2>현재 관측</h2><p id="current">확인되지 않음</p><p id="process">프로세스 관측: 확인되지 않음</p><p id="transport">연결 확인: 확인되지 않음</p></section><section id="action" role="status" aria-live="polite" hidden><h2>확인이 필요합니다</h2><p id="action-text"></p></section><section><h2>활동 기록</h2><p id="timezone"></p><p id="notice"></p><p id="empty">아직 기록된 활동이 없습니다. 질문은 시작한 대화에서 보내세요.</p><ol id="events"></ol></section><section><h2>대화 내 알림</h2><p>공통 패널 외 대화 내 알림 표시는 검증되지 않았습니다. 전달 및 모델 호출 여부는 확인되지 않았습니다.</p><ul><li>Claude: 확인되지 않음</li><li>Codex: 확인되지 않음</li><li>Antigravity: 확인되지 않음</li><li>Pi: 확인되지 않음</li><li>Hermes: 확인되지 않음</li></ul></section></main><footer>질문과 조정 요청은 이 실행을 시작한 대화에서 보내세요. 패널 닫기는 작업 중단 요청이 아닙니다.</footer></body></html>`;
const css = `:root{font-family:system-ui,-apple-system,"Segoe UI","Malgun Gothic",sans-serif;color:#1f2937;background:#f8fafc;font-size:16px}body{max-width:1120px;margin:auto;padding:24px;line-height:1.5}section{background:#fff;border:1px solid #64748b;border-radius:8px;padding:16px;margin:24px 0}h1{font-size:28px}h2{font-size:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere}textarea{display:block;max-width:100%;width:100%;min-height:100px}[hidden]{display:none}button{min-height:44px;background:#1d4ed8;color:white;border:1px solid #64748b;border-radius:8px;padding:8px}button:focus-visible,a:focus-visible{outline:2px solid #1d4ed8;outline-offset:4px}li{overflow-wrap:anywhere}footer{color:#475569}`;
const js = `"use strict";
const fragment=location.hash.slice(1); history.replaceState(null,"",location.pathname); const status=document.getElementById("connection"), list=document.getElementById("events"), bindingView=document.getElementById("binding"), current=document.getElementById("current"), notice=document.getElementById("notice"); let token=null, expected=null, cursor=0, attempts=0, expiresAt=0, rendered=0; const known=new Map(); const key="alpha-aos-panel";
const labels={"dispatch-start":"작업 시작","dispatch-end":"작업 종료","gsd-step-start":"단계 시작","gsd-step-end":"단계 종료","decision":"기록된 결정","run-outcome":"실행 결과","controller":"진행 담당","executor":"실행 담당","reviewer":"검토 담당","running":"진행 중","completed":"완료","accepted":"승인됨","rejected":"거부됨","blocked":"중단됨","stopped":"중단됨","unknown":"확인되지 않음","failed":"실패","needs-input":"입력 필요","interrupted":"종료 미확인"};
function display(event){const text=JSON.stringify(event);if(known.has(event.sequence)){if(known.get(event.sequence)!==text)throw Error("binding");return}if(event.sequence<=rendered)return;rendered=event.sequence;known.set(event.sequence,text);if(known.size>200)known.delete(known.keys().next().value);document.getElementById("empty").hidden=true;
const row=document.createElement("li"),summary=document.createElement("p"),details=document.createElement("details"),heading=document.createElement("summary"),provenance=document.createElement("pre");
const time=new Date(event.observedAt);const stamp=Number.isNaN(time.valueOf())?event.observedAt:time.toLocaleString();const model=event.observedModel?"관측 모델 "+event.observedModel:event.configuredModel?"설정 모델 "+event.configuredModel:null;const parts=[stamp,labels[event.kind]||event.kind,event.step,event.role?(labels[event.role]||event.role):null,model,event.outcome?(labels[event.outcome]||event.outcome):null,event.recordedReason].filter(Boolean);summary.textContent=parts.join(" · ");heading.textContent="상세 관측 정보";provenance.textContent="설정 모델: "+(event.configuredModel||"확인되지 않음")+"\\n관측 모델: "+(event.observedModel||"확인되지 않음")+"\\n설정 노력: "+(event.configuredEffort||"확인되지 않음")+"\\n관측 노력: "+(event.observedEffort||"확인되지 않음")+"\\n프로세스 종료: "+(event.processState==="confirmed-closed"?"확인됨":"확인되지 않음")+"\\n기록된 사유: "+(event.recordedReason||"기록된 사유 없음")+"\\n"+JSON.stringify(event,null,2);details.append(heading,provenance);row.append(summary,details);list.appendChild(row);current.textContent=summary.textContent+" · 프로세스 종료 "+(event.processState==="confirmed-closed"?"확인됨":"확인되지 않음");
const action=document.getElementById("action"),actionText=document.getElementById("action-text");action.hidden=!["needs-input","failed","interrupted"].includes(event.outcome);if(!action.hidden){actionText.textContent=(event.outcome==="needs-input"?"입력이 필요합니다. ":event.outcome==="failed"?"실패가 기록되었습니다. ":"실행 종료가 확인되지 않았습니다. ")+(event.recordedReason||"기록된 사유 없음")+" 시작한 대화에서 확인하세요."}while(list.children.length>200){if(list.firstElementChild.contains(document.activeElement)||list.firstElementChild.querySelector("details[open]"))break;list.firstElementChild.remove();notice.textContent="최근 200건까지 표시합니다.";}}

document.getElementById("timezone").textContent="시간대: "+Intl.DateTimeFormat().resolvedOptions().timeZone;
function save(value){try{sessionStorage.setItem(key,JSON.stringify(value))}catch{notice.textContent="이 브라우저에서 패널 인증 정보를 유지할 수 없습니다. 새로고침하면 새 패널 주소가 필요합니다."}}
function clear(){try{sessionStorage.removeItem(key)}catch{}}
function showProcesses(data){const states={"confirmed-closed":"종료 확인됨","unresolved":"종료 확인 안 됨","owner-alive":"소유 프로세스 생존 확인; 진행 여부는 확인되지 않음","unknown":"확인되지 않음"};document.getElementById("process").textContent="프로세스 관측: "+(data.processObservations.map(x=>states[x.state]||states.unknown).join(", ")||states.unknown)+" · "+new Date(data.processObservedAt).toLocaleString();}
async function read(){const r=await fetch("/snapshot",{headers:{Authorization:"Bearer "+token}}); if(r.status===401){clear();throw Error("auth")} if(!r.ok)throw Error("load"); const data=await r.json(); const tuple=JSON.stringify(data.binding); if(expected&&expected!==tuple){clear();throw Error("binding")} expected=tuple; expiresAt=data.expiresAt; bindingView.textContent=JSON.stringify(data.binding,null,2);document.getElementById("binding-summary").textContent="호스트: "+data.binding.host+" · 계약: "+data.binding.contractId+" · 리비전: "+data.binding.revision+" · 실행: "+data.binding.runId+" · 논리 대화 식별자: "+data.binding.originatingSessionId+" · 네이티브 세션: 확인되지 않음"; save({token,expected,expiresAt}); showProcesses(data); data.events.forEach(display); cursor=data.cursor; if(data.gap)notice.textContent="일부 이전 활동을 이 패널에서 복원할 수 없습니다."; status.textContent="패널 연결됨"; }
async function stream(){const controller=new AbortController();let timer;const reset=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(),35000)};const started=Date.now();reset();try{const response=await fetch("/events?cursor="+cursor,{headers:{Authorization:"Bearer "+token},signal:controller.signal});if(response.status===401){clear();throw Error("auth")}if(!response.ok)throw Error("load");const reader=response.body.getReader(),decoder=new TextDecoder();let buffer="";while(true){const part=await reader.read();if(part.done)break;reset();attempts=0;document.getElementById("transport").textContent="연결 확인: "+new Date().toLocaleString();buffer+=decoder.decode(part.value,{stream:true});if(buffer.length>262144)throw Error("load");let n;while((n=buffer.indexOf("\\n\\n"))>=0){const frame=buffer.slice(0,n);buffer=buffer.slice(n+2);const line=frame.split("\\n").find(x=>x.startsWith("data: "));if(!line)continue;const value=JSON.parse(line.slice(6));if(value.gap){await read();continue}if(JSON.stringify(value.binding)!==expected){clear();throw Error("binding")}if(value.processObservations){showProcesses(value);continue}if(value.sequence<=cursor){display(value);continue}if(value.sequence!==cursor+1){await read();continue}cursor=value.sequence;display(value)}}if(Date.now()-started<55000)throw Error("stream")}finally{clearTimeout(timer)}}
async function loop(){try{await read();while(Date.now()<expiresAt)await stream();status.textContent="패널 관찰 시간이 끝났습니다. 마지막 기록을 표시합니다."}catch(e){if(e.message==="auth"||e.message==="binding"){clear();status.textContent=e.message==="auth"?"패널 접근 시간이 만료되었거나 인증 정보가 없습니다.":"실행 식별 정보가 일치하지 않아 표시를 중단했습니다.";return}if(Date.now()>=expiresAt){status.textContent="패널 관찰 시간이 끝났습니다. 마지막 기록을 표시합니다.";return}status.textContent="패널 연결이 끊겼습니다. 마지막 기록을 유지하며 다시 연결합니다.";if(attempts<3){const delay=[1000,2000,4000][attempts++];setTimeout(loop,delay)}else{status.textContent="자동 재연결을 멈췄습니다. 실행 상태는 확인되지 않았습니다.";document.getElementById("reconnect").hidden=false}}}
document.getElementById("reconnect").addEventListener("click",()=>{document.getElementById("reconnect").hidden=true;attempts=0;void loop()});
document.getElementById("copy").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(bindingView.textContent);notice.textContent="실행 정보를 복사했습니다."}catch{const field=document.getElementById("copy-fallback");document.getElementById("copy-container").hidden=false;field.value=bindingView.textContent;field.select();notice.textContent="실행 식별 정보를 선택하여 복사하세요."}});
(async()=>{try{if(fragment){const r=await fetch("/session",{method:"POST",headers:{Authorization:"Bearer "+fragment}});if(!r.ok)throw Error("auth");const value=await r.json();token=value.token;save(value)}else{const stored=JSON.parse(sessionStorage.getItem(key)||"null");if(!stored||Date.now()>=stored.expiresAt)throw Error("auth");token=stored.token;expected=stored.expected}await loop()}catch{clear();status.textContent="패널 접근 시간이 만료되었거나 인증 정보가 없습니다."}})();`;
const assets: Record<string, { body: string; type: string }> = { "/": { body: html, type: "text/html; charset=utf-8" }, "/panel.js": { body: js, type: "text/javascript; charset=utf-8" }, "/panel.css": { body: css, type: "text/css; charset=utf-8" } };
const csp = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
function digest(token: string): Buffer { return createHash("sha256").update(token).digest(); }
function matches(value: string | undefined, target: Buffer): boolean {
  if (!value || !/^Bearer [A-Za-z0-9_-]{43}$/u.test(value)) return false;
  return timingSafeEqual(digest(value.slice(7)), target);
}
export async function startTaskProgressPanel(options: { stateRoot: string; binding: TaskSessionBinding; deadlineAt: number; signal?: AbortSignal }): Promise<{ url: string; dispose: () => Promise<void> }> {
  const binding = validateTaskSessionBinding(options.binding);
  const deadline = options.deadlineAt;
  if (!Number.isSafeInteger(deadline) || deadline <= Date.now() || deadline > Date.now() + 24 * 60 * 60_000) throw new Error("Invalid panel deadline");
  await readTaskSessionEvents(options.stateRoot, binding);
  if (options.signal?.aborted) throw new Error("Panel aborted");
  const bootstrap = randomBytes(32).toString("base64url"), bootstrapHash = digest(bootstrap), bootstrapDeadline = Math.min(deadline, Date.now() + 120_000);
  let used = false, origin = "", stopped = false, clients = 0, rejected = 0, rejectSince = Date.now();
  const sessions: Buffer[] = [], streams = new Set<ServerResponse>(), streamHints = new Set<() => void>();
  let processObservations: { dispatchId: string; state: string }[] = [], processFingerprint = "[]", processVersion = 0, processObservedAt = new Date().toISOString();
  let processRead: Promise<void> | null = null;
  const refreshProcesses = (): Promise<void> => {
    if (processRead) return processRead;
    processRead = (async () => {
      let next: typeof processObservations;
      try {
        const { readTaskDispatches } = await import("./task-runtime.js");
        const records = await readTaskDispatches(options.stateRoot, binding.contractDigest, { runId: binding.runId, maxRecords: 1000, processOnly: true });
        next = records.slice(-32).map((record) => ({ dispatchId: record.dispatchId,
          state: record.closeConfirmed === true ? "confirmed-closed" : record.status === "interrupted" ? "unresolved" :
            record.status === "running" && record.host === hostname() ? "owner-alive" : "unknown" }));
      } catch { next = [{ dispatchId: "unknown", state: "unknown" }]; }
      if (stopped) return;
      processObservedAt = new Date().toISOString();
      const fingerprint = JSON.stringify(next);
      if (fingerprint !== processFingerprint) {
        processFingerprint = fingerprint; processObservations = next; processVersion++;
        for (const hint of streamHints) hint();
      }
    })().finally(() => { processRead = null; });
    return processRead;
  };
  const server = createServer({ maxHeaderSize: 8192, requestTimeout: 10000, headersTimeout: 5000, connectionsCheckingInterval: 1000 }, (req, res) => { void handle(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end("Request failed"); }); });
  server.maxHeadersCount = 32; server.maxConnections = 8;
  server.on("upgrade", (_req, socket) => socket.destroy());
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader("Cache-Control", "no-store"); res.setHeader("Referrer-Policy", "no-referrer"); res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("X-Frame-Options", "DENY"); res.setHeader("Content-Security-Policy", csp);
    const hostCount = req.rawHeaders.filter((_, i) => i % 2 === 0 && req.rawHeaders[i]!.toLowerCase() === "host").length;
    const countHeader = (name: string) => req.rawHeaders.filter((v, i) => i % 2 === 0 && v.toLowerCase() === name).length;
    if (countHeader("origin") > 1 || countHeader("authorization") > 1 || countHeader("sec-fetch-site") > 1 || req.socket.remoteAddress !== "127.0.0.1" || hostCount !== 1 || req.headers.host !== new URL(origin).host ||
      (req.headers.origin !== undefined && req.headers.origin !== origin) || req.headers["sec-fetch-site"] === "cross-site" ||
      req.rawHeaders.some((v, i) => i % 2 === 0 && /^(forwarded|x-forwarded-)/iu.test(v)) || !req.url?.startsWith("/") || req.url.startsWith("//")) { res.writeHead(403).end("Forbidden"); return; }
    const parsed = new URL(req.url, origin);
    if (parsed.origin !== origin) { res.writeHead(403).end("Forbidden"); return; }
    const asset = assets[parsed.pathname];
    if (asset && (req.method === "GET" || req.method === "HEAD") && !parsed.search) { res.writeHead(200, { "Content-Type": asset.type }); res.end(req.method === "HEAD" ? undefined : asset.body); return; }
    if (Date.now() >= deadline) { res.writeHead(401).end("Expired"); return; }
    if (Date.now() - rejectSince >= 60000) { rejected = 0; rejectSince = Date.now(); }
    const reject = () => { rejected++; res.writeHead(rejected > 10 ? 429 : 401).end("Unauthorized"); };
    if (parsed.pathname === "/session" && req.method === "POST" && !parsed.search) {
      if (req.headers.origin !== origin || used || Date.now() >= bootstrapDeadline || sessions.length >= 4 || !matches(req.headers.authorization, bootstrapHash)) { reject(); return; }
      let bytes = 0; for await (const chunk of req) { bytes += (chunk as Buffer).length; if (bytes > 4096) { res.writeHead(413).end("Too large"); return; } }
      if (used) { reject(); return; } used = true; const token = randomBytes(32).toString("base64url"); sessions.push(digest(token));
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ token, expiresAt: deadline })); return;
    }
    if (!["/snapshot", "/events"].includes(parsed.pathname) || req.method !== "GET") { res.writeHead(404).end("Not found"); return; }
    if (!sessions.some((entry) => matches(req.headers.authorization, entry))) { reject(); return; }
    if (parsed.pathname === "/snapshot" && !parsed.search) {
      const value = await readTaskSessionEvents(options.stateRoot, binding);
      await refreshProcesses();
      const output = JSON.stringify({ ...value, processObservations, processObservedAt, expiresAt: deadline });
      if (Buffer.byteLength(output) > 256 * 1024) { res.writeHead(503).end("Snapshot unavailable"); return; }
      res.writeHead(200, { "Content-Type": "application/json" }).end(output); return;
    }
    const cursorText = parsed.searchParams.get("cursor");
    if (parsed.pathname !== "/events" || parsed.searchParams.size !== 1 || !cursorText || !/^(0|[1-9][0-9]{0,15})$/u.test(cursorText) || clients >= 4) { res.writeHead(400).end("Invalid request"); return; }
    // Re-send the latest process observation on registration to close the snapshot/stream race.
    let cursor = Number(cursorText), running = false, again = false, closed = false, seenProcessVersion = processVersion === 0 ? 0 : -1;
    if (!Number.isSafeInteger(cursor)) { res.writeHead(400).end("Invalid request"); return; }
    clients++; streams.add(res); res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", Connection: "keep-alive" }); res.flushHeaders();
    let watcher: ReturnType<typeof watch> | undefined;
    const cleanup = () => { if (closed) return; closed = true; clients--; streams.delete(res); streamHints.delete(hint); watcher?.close(); clearInterval(heartbeat); clearTimeout(rotation); };
    const send = async () => {
      if (closed) return; if (running) { again = true; return; } running = true;
      const writeFrame = async (frame: string): Promise<boolean> => {
        if (Buffer.byteLength(frame) > 8192 || res.writableLength + Buffer.byteLength(frame) > 65536) { res.end(); return false; }
        if (!res.write(frame)) await new Promise<void>((resolve) => { const timer = setTimeout(() => { res.destroy(); resolve(); }, 5000); res.once("drain", () => { clearTimeout(timer); resolve(); }); res.once("close", () => { clearTimeout(timer); resolve(); }); });
        return !closed;
      };
      try { do { again = false; const result = await readTaskSessionEvents(options.stateRoot, binding, cursor);
        if (result.gap) { res.write(`data: ${JSON.stringify({ gap: true })}\n\n`); res.end(); return; }
        for (const event of result.events) { const frame = `data: ${JSON.stringify(event)}\n\n`;
          cursor = event.sequence; if (!await writeFrame(frame)) return;
        }
        if (seenProcessVersion !== processVersion) { seenProcessVersion = processVersion;
          if (!await writeFrame(`data: ${JSON.stringify({ binding, processObservations, processObservedAt })}\n\n`)) return;
        }
      } while (again && !closed); } catch { res.end(); } finally { running = false; }
    };
    const hint = () => { void send(); }; streamHints.add(hint);
    const heartbeat = setInterval(() => { if (!running && res.writableLength < 1024) res.write(": heartbeat\n\n"); }, 15000);
    const rotation = setTimeout(() => res.end(), Math.min(60000, deadline - Date.now()));
    res.once("close", cleanup);
    try { watcher = watch(taskSessionRoot(options.stateRoot, binding), () => { void send(); }); watcher.on("error", () => res.end()); await send(); } catch { res.end(); }
  }
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(); }); });
  const address = server.address(); if (!address || typeof address === "string") { server.close(); throw new Error("Panel listener unavailable"); }
  origin = `http://127.0.0.1:${address.port}`;
  const processTimer = setInterval(() => { if (streams.size) void refreshProcesses(); }, 2000);
  processTimer.unref();
  let done: Promise<void> | null = null;
  const timer = setTimeout(() => { void dispose(); }, deadline - Date.now());
  const dispose = () => { if (done) return done; stopped = true; clearTimeout(timer); clearInterval(processTimer); options.signal?.removeEventListener("abort", onAbort); done = new Promise<void>((resolve) => { server.close(() => resolve()); for (const stream of streams) stream.end(); const force = setTimeout(() => { server.closeAllConnections(); resolve(); }, 2000); force.unref(); }); return done; };
  const onAbort = () => { void dispose(); }; options.signal?.addEventListener("abort", onAbort, { once: true }); if (options.signal?.aborted && !stopped) void dispose();
  return { url: `${origin}/#${bootstrap}`, dispose };
}






