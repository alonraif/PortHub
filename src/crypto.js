import crypto from "crypto";
import fs from "fs";
import path from "path";

const keyPath = path.join(process.cwd(), "data", "key");

function loadKeyFromFile() {
  try {
    return fs.readFileSync(keyPath, "utf8").trim();
  } catch {
    return "";
  }
}

function ensureKeyDir() {
  const dir = path.dirname(keyPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function getKey() {
  let key = process.env.ENCRYPTION_KEY || "";
  if (!key) {
    key = loadKeyFromFile();
  }
  if (!key) {
    const generated = crypto.randomBytes(32);
    key = generated.toString("base64");
    ensureKeyDir();
    fs.writeFileSync(keyPath, key, "utf8");
    console.warn("ENCRYPTION_KEY not set. Generated a local key in ./data/key");
  }
  const buf = Buffer.from(key, "base64");
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes in base64 encoding");
  }
  return buf;
}

export function encryptString(plainText) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptString(encoded) {
  const key = getKey();
  const data = Buffer.from(encoded, "base64");
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const ciphertext = data.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}
