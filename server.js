import express from "express";
import session from "express-session";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import {
  initDb,
  listConnections,
  getConnection,
  createConnection,
  updateConnection,
  deleteConnection,
  listFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  reorderConnections,
  defaultFolderId,
  exportData,
  importData,
} from "./src/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || "0.0.0.0";
const appPassword = process.env.APP_PASSWORD || "";
const sessionSecret = process.env.SESSION_SECRET || "dev-session-secret";
const loginWindowMs =
  Number.parseInt(process.env.LOGIN_WINDOW_MS || "", 10) || 10 * 60 * 1000;
const loginMaxAttempts =
  Number.parseInt(process.env.LOGIN_MAX_ATTEMPTS || "", 10) || 5;

if (!appPassword) {
  console.warn("APP_PASSWORD is not set. Login will fail until it is provided.");
}

initDb();

app.disable("x-powered-by");
app.use(cookieParser());
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      maxAge: 2 * 60 * 60 * 1000,
    },
    rolling: true,
  })
);

app.use(express.json());

const loginAttempts = new Map();

function isAuthed(req) {
  return req.session && req.session.authed === true;
}

function requireAuth(req, res, next) {
  if (!isAuthed(req)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  return next();
}

function rateLimitLogin(req, res, next) {
  const now = Date.now();
  const ip = req.ip || "local";
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + loginWindowMs });
    return next();
  }
  if (entry.count >= loginMaxAttempts) {
    return res.status(429).json({ error: "too many attempts" });
  }
  entry.count += 1;
  return next();
}

function safePasswordMatch(input, expected) {
  const inputBuf = Buffer.from(String(input));
  const expectedBuf = Buffer.from(String(expected));
  if (inputBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(inputBuf, expectedBuf);
}

app.post("/api/login", rateLimitLogin, (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== "string") {
    return res.status(400).json({ error: "password required" });
  }
  if (!safePasswordMatch(password, appPassword)) {
    return res.status(401).json({ error: "invalid password" });
  }
  return req.session.regenerate((err) => {
    if (err) {
      return res.status(500).json({ error: "session error" });
    }
    req.session.authed = true;
    return res.json({ ok: true });
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

app.get("/api/me", (req, res) => {
  res.json({ authed: isAuthed(req) });
});

app.get("/api/connections", requireAuth, (req, res) => {
  res.json(listConnections());
});

function deriveKey(password, salt) {
  return crypto.scryptSync(password, salt, 32);
}

function encryptPayload(payload, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(password, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 1,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: ciphertext.toString("base64"),
  };
}

function decryptPayload(encrypted, password) {
  const salt = Buffer.from(encrypted.salt, "base64");
  const iv = Buffer.from(encrypted.iv, "base64");
  const tag = Buffer.from(encrypted.tag, "base64");
  const data = Buffer.from(encrypted.data, "base64");
  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
}

app.post("/api/export", requireAuth, (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== "string" || !password) {
    return res.status(400).json({ error: "password required" });
  }
  const encrypted = encryptPayload(exportData(), password);
  return res.json(encrypted);
});

app.post("/api/import", requireAuth, (req, res) => {
  try {
    const { password, blob } = req.body || {};
    if (typeof password !== "string" || !password) {
      return res.status(400).json({ error: "password required" });
    }
    if (!blob || typeof blob !== "object") {
      return res.status(400).json({ error: "import blob required" });
    }
    const decrypted = decryptPayload(blob, password);
    const data = importData(decrypted);
    return res.json({ ok: true, data });
  } catch (err) {
    return res.status(400).json({ error: err.message || "invalid import" });
  }
});

app.post("/api/connections/reorder", requireAuth, (req, res) => {
  const { folderId, orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds) || !orderedIds.length) {
    return res.status(400).json({ error: "orderedIds required" });
  }
  const normalizedFolderId = folderId ? Number(folderId) : defaultFolderId();
  const ids = orderedIds.map((id) => Number(id)).filter((id) => !Number.isNaN(id));
  if (!ids.length) {
    return res.status(400).json({ error: "invalid orderedIds" });
  }
  reorderConnections(normalizedFolderId, ids);
  return res.json({ ok: true });
});

app.get("/api/connections/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const conn = getConnection(id);
  if (!conn) {
    return res.status(404).json({ error: "not found" });
  }
  return res.json(conn);
});

app.post("/api/connections", requireAuth, (req, res) => {
  try {
    const payload = req.body || {};
    const created = createConnection(payload);
    return res.status(201).json(created);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.put("/api/connections/:id", requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const payload = req.body || {};
    const updated = updateConnection(id, payload);
    if (!updated) {
      return res.status(404).json({ error: "not found" });
    }
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete("/api/connections/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const ok = deleteConnection(id);
  if (!ok) {
    return res.status(404).json({ error: "not found" });
  }
  return res.json({ ok: true });
});

app.get("/api/folders", requireAuth, (req, res) => {
  res.json(listFolders());
});

app.post("/api/folders", requireAuth, (req, res) => {
  try {
    const { name } = req.body || {};
    const created = createFolder(name);
    return res.status(201).json(created);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.put("/api/folders/:id", requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name } = req.body || {};
    const updated = updateFolder(id, name);
    if (!updated) {
      return res.status(404).json({ error: "not found" });
    }
    return res.json(updated);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete("/api/folders/:id", requireAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    const ok = deleteFolder(id);
    if (!ok) {
      return res.status(404).json({ error: "not found" });
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.get("/api/connections/:id/ssh", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const port = req.query.port ? Number(req.query.port) : null;
  const conn = getConnection(id);
  if (!conn) {
    return res.status(404).json({ error: "not found" });
  }
  const effectivePort = conn.portIsDynamic ? port : conn.port;
  if (!effectivePort || Number.isNaN(effectivePort)) {
    return res.status(400).json({ error: "port required" });
  }
  const user = encodeURIComponent(conn.username || "");
  const rawHost = conn.host || "";
  const sanitizedHost = rawHost
    .replace(/^[a-z]+:\/\//i, "")
    .split("/")[0]
    .split(":")[0];
  const sshUrl = `ssh://${user}@${sanitizedHost}:${effectivePort}`;
  const sshCommand = conn.portIsDynamic
    ? `ssh -p ${effectivePort} root@reverse-ssh-production`
    : `ssh ${conn.username}@${sanitizedHost} -p ${effectivePort}`;
  return res.json({ sshUrl, sshCommand });
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/", (req, res) => {
  if (!isAuthed(req)) {
    return res.redirect("/login");
  }
  return res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use("/", express.static(path.join(__dirname, "public")));

app.listen(port, host, () => {
  console.log(`SSH Library running on http://${host}:${port}`);
});
