import express from "express";
import type { AppContext } from "./context.js";

export interface TrafficRecord { time: string; client: string; method: string; path: string; status: number; ms: number; }
export interface AdminMetrics { clients: Map<string, { client: string; lastSeen: number; requests: number }>; traffic: TrafficRecord[]; active: number; }

const page = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local Agent</title>
<style>:root{font:13px system-ui;color:#dbe4ef;background:#0b1118}*{box-sizing:border-box}body{margin:0}.wrap{max-width:1120px;margin:auto;padding:22px}.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px}.muted{color:#8190a1}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.card,section{background:#121b25;border:1px solid #223143;border-radius:9px;padding:13px}.stat{font-size:24px;font-weight:650;margin-top:4px}.table{width:100%;border-collapse:collapse}.table th,.table td{text-align:left;padding:8px;border-bottom:1px solid #223143}.table th{color:#8190a1;font-weight:500}.pill{color:#8ee6b3}.toolbar{display:flex;gap:8px;align-items:center}button{background:#1d9bf0;color:white;border:0;border-radius:6px;padding:7px 10px;cursor:pointer}pre{margin:0;white-space:pre-wrap;color:#a9d5ff}@media(max-width:700px){.grid{grid-template-columns:repeat(2,1fr)}.table{font-size:11px}}</style>
</head><body><h1>Local Agent Admin</h1>
<div class="wrap"><div class="top"><div><strong>Local Agent</strong> <span class="muted">runtime console</span></div><div class="toolbar"><span class="pill">● live</span><button onclick="refresh()">Refresh</button></div></div>
<div class="grid"><div class="card">Active requests<div class="stat" id="active">—</div></div><div class="card">Clients seen<div class="stat" id="clientCount">—</div></div><div class="card">Traffic records<div class="stat" id="trafficCount">—</div></div><div class="card">Uptime<div class="stat" id="uptime">—</div></div></div>
<section><div class="top"><strong>Connected MCP clients</strong><span class="muted">HTTP activity · last 5 minutes</span></div><table class="table"><thead><tr><th>Client</th><th>Requests</th><th>Last seen</th></tr></thead><tbody id="clients"></tbody></table></section>
<section><div class="top"><strong>Request traffic</strong><span class="muted">Most recent first</span></div><table class="table"><thead><tr><th>Time</th><th>Client</th><th>Request</th><th>Status</th><th>Latency</th></tr></thead><tbody id="traffic"></tbody></table></section>
<section><div class="top"><strong>Runtime</strong><button onclick="closeBrowser()">Close browser</button></div><pre id="status">Loading…</pre><span id="message" class="muted"></span></section></div>
<script>
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
async function refresh(){const r=await fetch('/admin/api/status');const d=await r.json();active.textContent=d.metrics.active;clientCount.textContent=d.metrics.clients.length;trafficCount.textContent=d.metrics.traffic.length;uptime.textContent=Math.round(d.uptimeSeconds/60)+'m';status.textContent=JSON.stringify(d.runtime,null,2);clients.innerHTML=d.metrics.clients.map(x=>'<tr><td>'+esc(x.client)+'</td><td>'+x.requests+'</td><td>'+new Date(x.lastSeen).toLocaleTimeString()+'</td></tr>').join('')||'<tr><td colspan=3 class=muted>No clients yet</td></tr>';traffic.innerHTML=d.metrics.traffic.map(x=>'<tr><td>'+new Date(x.time).toLocaleTimeString()+'</td><td>'+esc(x.client)+'</td><td>'+x.method+' '+x.path+'</td><td>'+x.status+'</td><td>'+x.ms+'ms</td></tr>').join('')||'<tr><td colspan=5 class=muted>No traffic yet</td></tr>'}
async function closeBrowser(){const r=await fetch('/admin/api/browser/close',{method:'POST'});message.textContent=(await r.json()).message||'Done';refresh()}refresh();setInterval(refresh,3000);
</script></body></html>`;

export function buildAdminRouter(ctx: AppContext, metrics: AdminMetrics): express.Router {
  const router = express.Router();
  const authorized = (req: express.Request): boolean => {
    if (!ctx.settings.authToken) return true;
    return req.headers.authorization === `Bearer ${ctx.settings.authToken}`;
  };
  router.use((req, res, next) => authorized(req) ? next() : res.status(401).json({ error: "unauthorized" }));
  router.get("/", (_req, res) => res.type("html").send(page));
  router.get("/api/status", (_req, res) => res.json({
    uptimeSeconds: Math.round(process.uptime()),
    runtime: { pid: process.pid, node: process.version, memory: process.memoryUsage(), browser: { mode: ctx.settings.browserMode, cdpUrl: ctx.settings.browserCdpUrl }, workspaceDir: ctx.settings.workspaceDir, dataDir: ctx.settings.dataDir },
    metrics: { active: metrics.active, clients: [...metrics.clients.values()], traffic: metrics.traffic.slice().reverse() },
  }));
  router.post("/api/browser/close", async (_req, res) => {
    await ctx.browser.shutdown();
    res.json({ ok: true, message: "Browser session closed." });
  });
  return router;
}
