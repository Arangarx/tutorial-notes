import crypto from "crypto";

export function generateShareToken(bytes: number = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function parseLinksFromTextarea(value: string) {
  const lines = value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const urls: string[] = [];
  for (const line of lines) {
    try {
      const u = new URL(line);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      urls.push(u.toString());
    } catch {
      // ignore invalid lines
    }
  }
  return urls;
}

