// Front door for the add-on. Next.js listens on loopback only; this process
// owns the two network ports and tells Next which one a request came in on.
//
//   PORT (3002)          open checklist for the guardhouse tablet
//   INGRESS_PORT (3003)  audit pages, reached only through Home Assistant
//                        ingress, which authenticates the user first
//
// With host_network the ingress port is also reachable from the LAN, so the
// audit side accepts connections from the Supervisor address alone. That is
// what makes the X-Remote-User-* headers it forwards trustworthy.
const http = require("http");
const { spawn } = require("child_process");
const { readFileSync } = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3002);
const INGRESS_PORT = Number(process.env.INGRESS_PORT || 3003);
const INTERNAL_PORT = Number(process.env.INTERNAL_PORT || 3100);
const SUPERVISOR_ADDR = process.env.AUDIT_TRUSTED_ADDR || "172.30.32.2";

const auditUsers = () => {
  try {
    const options = JSON.parse(readFileSync(process.env.OPTIONS_PATH || "/data/options.json", "utf8"));
    return (options.audit_users || []).map((u) => String(u).trim().toLowerCase()).filter(Boolean);
  } catch {
    return [];
  }
};

// Paths the open side must never reach, even though Next serves them.
const PUBLIC_BLOCKED = [/^\/api\/audit(\/|$)/, /^\/api\/cron(\/|$)/];

const stripTrusted = (headers) => {
  const out = { ...headers };
  for (const key of Object.keys(out)) {
    if (key.startsWith("x-chorebot-") || key.startsWith("x-remote-user-")) delete out[key];
  }
  return out;
};

const remoteAddr = (req) => (req.socket.remoteAddress || "").replace(/^::ffff:/, "");

const deny = (res, status, message) => {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
};

const forward = (req, res, targetPath, headers) => {
  const upstream = http.request(
    { host: "127.0.0.1", port: INTERNAL_PORT, method: req.method, path: targetPath, headers },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => deny(res, 502, "ChoreBot is starting, try again shortly"));
  req.pipe(upstream);
};

const publicServer = http.createServer((req, res) => {
  const pathname = (req.url || "/").split("?")[0];
  if (PUBLIC_BLOCKED.some((re) => re.test(pathname))) return deny(res, 404, "Not found");
  forward(req, res, req.url, { ...stripTrusted(req.headers), "x-chorebot-zone": "public" });
});

let loggedHeaders = false;
const auditServer = http.createServer((req, res) => {
  const addr = remoteAddr(req);
  if (addr !== SUPERVISOR_ADDR) {
    console.warn(`audit: refused direct connection from ${addr}`);
    return deny(res, 403, "Open this page from the Home Assistant sidebar");
  }

  const name = String(req.headers["x-remote-user-name"] || "").trim();
  const id = String(req.headers["x-remote-user-id"] || "").trim();
  const display = String(req.headers["x-remote-user-display-name"] || "").trim();
  if (!loggedHeaders) {
    const seen = Object.keys(req.headers).filter((k) => k.startsWith("x-remote-user-") || k === "x-ingress-path");
    console.log(`audit: ingress headers present: ${seen.join(", ") || "(none)"}`);
    loggedHeaders = true;
  }

  const allowed = auditUsers();
  const candidates = [name, id].map((v) => v.toLowerCase()).filter(Boolean);
  if (!candidates.some((c) => allowed.includes(c))) {
    console.warn(`audit: denied user "${name || id || "unknown"}"`);
    return deny(res, 403, `${display || name || "This user"} is not allowed to view the chore audit`);
  }

  // Ingress strips its own prefix, so "/" here is the audit home page.
  const [pathname, query] = (req.url || "/").split("?");
  const target = `/api/audit${pathname === "/" ? "" : pathname}${query ? `?${query}` : ""}`;
  forward(req, res, target, {
    ...stripTrusted(req.headers),
    "x-chorebot-zone": "audit",
    "x-chorebot-user": display || name || id,
  });
});

const next = spawn(
  path.join(__dirname, "node_modules", ".bin", "next"),
  ["start", "-H", "127.0.0.1", "-p", String(INTERNAL_PORT)],
  { stdio: "inherit" },
);
next.on("exit", (code) => {
  console.error(`Next.js exited with code ${code}`);
  process.exit(code || 1);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    next.kill(signal);
    process.exit(0);
  });
}

publicServer.listen(PORT, () => console.log(`Checklist on port ${PORT}`));
auditServer.listen(INGRESS_PORT, () => console.log(`Audit (ingress) on port ${INGRESS_PORT}`));
