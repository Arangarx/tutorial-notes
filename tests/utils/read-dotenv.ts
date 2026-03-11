import fs from "node:fs";
import path from "node:path";

export function readDotenv(dotenvPath: string) {
  if (!fs.existsSync(dotenvPath)) return {};
  const raw = fs.readFileSync(dotenvPath, "utf8");
  const out: Record<string, string> = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }

  return out;
}

export function readLocalEnv() {
  const root = path.resolve(__dirname, "..", "..");
  const envPath = path.join(root, ".env");
  return readDotenv(envPath);
}

