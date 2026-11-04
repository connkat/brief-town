#!/usr/bin/env node
// Brief Town local server.
// - Serves the game on http://localhost:<port> (bound to 127.0.0.1 only).
// - Runs Claude Code headless (`claude -p`) on a schedule and on demand to write brief.local.txt.
// - Claude only gets the read-only tools listed in brief.config.json. Everything else is denied,
//   and Claude never writes files: it prints the brief and this server saves it.
//
//   node server.mjs                 start the server + scheduler
//   node server.mjs --once [mode]   generate one brief now and exit (mode: morning | eod)

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(ROOT, "brief.config.json");
const BRIEF_PATH = path.join(ROOT, "brief.local.txt");
const PROMPT_PATH = path.join(ROOT, "prompts", "brief.md");

const DEFAULTS = {
  port: 8000,
  allowedTools: [],
  blockedTools: [],
  schedule: {
    weekdaysOnly: true,
    times: [{ at: "07:50", mode: "morning" }, { at: "16:25", mode: "eod" }],
  },
  claudeCommand: "claude",
  maxTurns: 60,
  timeoutMinutes: 8,
};
// Never available to the brief run, whatever the config says.
const ALWAYS_DENIED = ["Bash", "Edit", "Write", "NotebookEdit", "WebFetch", "WebSearch", "Task", "Agent"];

// Name fragments that mean a tool can change something. A tool whose name contains any of these
// as a whole word (split on _, -, and camelCase) is refused, even if brief.config.json lists it.
const WRITE_WORDS = new Set([
  "send", "post", "reply", "react", "add", "draft", "create", "update", "edit", "write", "set", "put", "patch",
  "insert", "modify", "delete", "remove", "archive", "unarchive", "label", "unlabel", "trash", "untrash", "spam", "unspam",
  "mark", "unmark", "move", "copy", "duplicate", "rename", "forward", "share", "upload", "publish", "schedule",
  "respond", "rsvp", "invite", "accept", "decline", "cancel", "complete", "apply", "restore", "resolve", "convert",
  "link", "unlink", "approve", "submit", "spawn", "stop", "pin", "unpin", "join", "leave", "kick", "favorite", "star",
]);
const toolWords = (name) => name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

// Returns a reason the tool lists are unsafe, or null if they're fine.
function checkTools(cfg) {
  if (!Array.isArray(cfg.allowedTools) || !Array.isArray(cfg.blockedTools)) return "allowedTools and blockedTools must be lists.";
  for (const t of cfg.allowedTools) {
    if (typeof t !== "string" || !/^mcp__[A-Za-z0-9_-]+__[A-Za-z0-9_-]+$/.test(t)) return `"${t}" isn't a single MCP tool name. Only exact read-only MCP tools may be allowed.`;
    const bad = toolWords(t.split("__").pop()).find((w) => WRITE_WORDS.has(w));
    if (bad) return `"${t}" looks like it can change things ("${bad}"). Brief runs are read-only, so remove it from allowedTools.`;
  }
  for (const t of cfg.blockedTools) if (typeof t !== "string" || !t.startsWith("mcp__")) return `blockedTools entry "${t}" isn't an MCP tool name.`;
  return null;
}

const log = (...a) => console.log(`[${new Date().toLocaleTimeString()}]`, ...a);

async function loadConfig() {
  try {
    const c = JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"));
    return { ...DEFAULTS, ...c, schedule: { ...DEFAULTS.schedule, ...(c.schedule || {}) }, configured: true };
  } catch (e) {
    if (e.code === "ENOENT") return { ...DEFAULTS, configured: false };
    throw new Error(`brief.config.json is not valid JSON: ${e.message}`);
  }
}

/* ------------------------------------------------------------------ generation */
const state = { running: false, mode: null, startedAt: null, lastRun: null, lastOk: null, lastError: null, configured: false };

const modeFor = (d = new Date()) => (d.getHours() < 12 ? "morning" : "eod");
function nowStamp(d = new Date()) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const s = d.toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
  return `${s} (${tz})`;
}

function runClaude(cfg, prompt) {
  return new Promise((resolve, reject) => {
    const args = [
      "-p",
      "--output-format", "json",
      "--max-turns", String(cfg.maxTurns),
      // Explicit mode so a "bypass permissions" default in the user's own settings can't apply here.
      "--permission-mode", "default",
      "--allowedTools", cfg.allowedTools.join(","),
      // Deny rules beat allow rules, so this also overrides tools the user pre-approved in their own settings.
      "--disallowedTools", [...ALWAYS_DENIED, ...cfg.blockedTools].join(","),
    ];
    const child = spawn(cfg.claudeCommand, args, { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error(`Timed out after ${cfg.timeoutMinutes} minutes.`)); }, cfg.timeoutMinutes * 60000);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(e.code === "ENOENT" ? `Couldn't find "${cfg.claudeCommand}". Is Claude Code installed and on your PATH?` : e.message));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      let result = out;
      try {
        const j = JSON.parse(out);
        if (j.is_error) return reject(new Error(`Claude Code reported an error: ${j.result || j.subtype || "unknown"}`));
        result = j.result ?? "";
      } catch {
        if (code !== 0) return reject(new Error((err || out).trim().slice(-400) || `claude exited with code ${code}`));
      }
      const m = String(result).match(/=====BRIEF START=====\s*([\s\S]*?)\s*=====BRIEF END=====/);
      if (!m || !m[1].trim()) return reject(new Error(`No brief in Claude's reply. It ended with: ${String(result).trim().slice(-300)}`));
      resolve(m[1].trim());
    });
    child.stdin.end(prompt);
  });
}

async function generate(mode, { wait = false } = {}) {
  if (state.running) return { started: false, reason: "A brief is already being fetched." };
  const cfg = await loadConfig();
  state.configured = cfg.configured && cfg.allowedTools.length > 0;
  if (!state.configured) {
    state.lastError = 'Not set up yet. Open Claude Code in this folder and say "set up Brief Town".';
    return { started: false, reason: state.lastError };
  }
  const unsafe = checkTools(cfg);
  if (unsafe) {
    state.lastError = `Brief Town won't run: ${unsafe} Open Claude Code in this folder and say "set up Brief Town" to fix it.`;
    log(state.lastError);
    return { started: false, reason: state.lastError };
  }
  mode = mode === "morning" || mode === "eod" ? mode : modeFor();
  const prompt = (await fs.readFile(PROMPT_PATH, "utf8")).replaceAll("{{MODE}}", mode).replaceAll("{{NOW}}", nowStamp());
  Object.assign(state, { running: true, mode, startedAt: new Date().toISOString(), lastError: null });
  log(`fetching ${mode} brief…`);
  const job = runClaude(cfg, prompt)
    .then(async (text) => {
      await fs.writeFile(BRIEF_PATH, text + "\n");
      state.lastOk = new Date().toISOString();
      log(`brief written to brief.local.txt (${text.split("\n").length} lines)`);
    })
    .catch((e) => { state.lastError = e.message; log(`brief failed: ${e.message}`); })
    .finally(() => { state.running = false; state.lastRun = new Date().toISOString(); });
  if (wait) await job;
  return { started: true, mode };
}

/* ------------------------------------------------------------------ schedule */
const fired = new Set();
const slotDate = (d, at) => { const [h, m] = at.split(":").map(Number); const x = new Date(d); x.setHours(h, m, 0, 0); return x; };
const dayKey = (d) => d.toISOString().slice(0, 10);

async function tick() {
  const cfg = await loadConfig().catch(() => null);
  if (!cfg) return;
  const now = new Date();
  if (cfg.schedule.weekdaysOnly && (now.getDay() === 0 || now.getDay() === 6)) return;
  for (const s of cfg.schedule.times || []) {
    const t = slotDate(now, s.at), key = `${dayKey(now)} ${s.at}`;
    if (now >= t && now - t < 15 * 60000 && !fired.has(key)) { fired.add(key); generate(s.mode); }
  }
}

async function catchUp() {
  // If the server starts after today's last slot and the brief is older than that slot, fetch now.
  const cfg = await loadConfig().catch(() => null);
  if (!cfg) return;
  const now = new Date();
  if (cfg.schedule.weekdaysOnly && (now.getDay() === 0 || now.getDay() === 6)) return;
  const past = (cfg.schedule.times || []).map((s) => ({ ...s, t: slotDate(now, s.at) })).filter((s) => s.t <= now).sort((a, b) => b.t - a.t)[0];
  if (!past) return;
  const mtime = await fs.stat(BRIEF_PATH).then((s) => s.mtime, () => new Date(0));
  fired.add(`${dayKey(now)} ${past.at}`);
  if (mtime < past.t) generate(past.mode);
}

/* ------------------------------------------------------------------ http */
const TYPES = { ".html": "text/html; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
const SERVABLE = new Set(["index.html", "brief.local.txt", "sample-brief.txt"]);

function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function handle(req, res) {
  // Only answer requests addressed to this machine (blocks DNS-rebinding tricks).
  const host = (req.headers.host || "").replace(/:\d+$/, "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) return send(res, 403, { error: "forbidden host" });
  const url = new URL(req.url, "http://localhost");

  if (url.pathname.startsWith("/api/")) {
    // A custom header forces a CORS preflight, which we never approve, so other websites can't call the API.
    if (req.headers["x-brief-town"] !== "1") return send(res, 403, { error: "missing X-Brief-Town header" });
    if (url.pathname === "/api/status" && req.method === "GET") {
      const cfg = await loadConfig().catch(() => ({ configured: false, allowedTools: [] }));
      state.configured = cfg.configured && cfg.allowedTools.length > 0;
      return send(res, 200, { ...state, schedule: cfg.schedule || null });
    }
    if (url.pathname === "/api/refresh" && req.method === "POST") {
      return send(res, 202, await generate(url.searchParams.get("mode")));
    }
    return send(res, 404, { error: "not found" });
  }

  const name = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
  if (!SERVABLE.has(name)) return send(res, 404, "Not found", "text/plain");
  try {
    const body = await fs.readFile(path.join(ROOT, name));
    send(res, 200, body, TYPES[path.extname(name)] || "application/octet-stream");
  } catch {
    send(res, 404, "Not found", "text/plain");
  }
}

/* ------------------------------------------------------------------ main */
const args = process.argv.slice(2);
if (args[0] === "--check") {
  const c = await loadConfig();
  const r = c.configured ? checkTools(c) : "brief.config.json is missing.";
  console.log(r ? `Not safe to run: ${r}` : `OK: ${c.allowedTools.length} read-only tools allowed, ${c.blockedTools.length} write tools explicitly blocked.`);
  process.exit(r ? 1 : 0);
}
if (args[0] === "--once") {
  const r = await generate(args[1], { wait: true });
  if (!r.started) { console.error(r.reason); process.exit(1); }
  if (state.lastError) { console.error(state.lastError); process.exit(1); }
  console.log("\n" + (await fs.readFile(BRIEF_PATH, "utf8")));
  process.exit(0);
}

const cfg = await loadConfig();
const port = Number(process.env.PORT) || cfg.port;
http.createServer((req, res) => handle(req, res).catch((e) => send(res, 500, { error: e.message })))
  .listen(port, "127.0.0.1", () => {
    log(`Brief Town is running at http://localhost:${port}`);
    if (!cfg.configured || !cfg.allowedTools.length) log('Not set up yet: open Claude Code in this folder and say "set up Brief Town".');
    else log(`Briefs: ${(cfg.schedule.times || []).map((s) => `${s.mode} at ${s.at}`).join(", ")}${cfg.schedule.weekdaysOnly ? " on weekdays" : ""}.`);
  });
setInterval(tick, 20000);
catchUp();
