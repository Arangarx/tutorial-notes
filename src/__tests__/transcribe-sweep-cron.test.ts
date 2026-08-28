/**
 * Unit tests for GET /api/cron/transcribe-sweep auth + delegation,
 * plus the vercel.json cadence lock (slowed until usefulness metrics exist).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const mockRunTranscribeSweep = jest.fn();

jest.mock("@/lib/recording/transcribe-sweep", () => ({
  runTranscribeSweep: (...args: unknown[]) => mockRunTranscribeSweep(...args),
}));

import { GET } from "@/app/api/cron/transcribe-sweep/route";

function makeCronRequest(secret?: string): Request {
  const headers: Record<string, string> = {};
  if (secret !== undefined) {
    headers.Authorization = `Bearer ${secret}`;
  }
  return new Request("https://app.example.com/api/cron/transcribe-sweep", {
    method: "GET",
    headers,
  });
}

describe("GET /api/cron/transcribe-sweep", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    mockRunTranscribeSweep.mockResolvedValue({
      scanned: 0,
      processed: 0,
      done: 0,
      skipped: 0,
      failed: 0,
      timedOut: false,
    });
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  test("rejects request with missing Authorization header", async () => {
    const res = await GET(makeCronRequest());
    expect(res.status).toBe(401);
    expect(mockRunTranscribeSweep).not.toHaveBeenCalled();
  });

  test("rejects request with wrong bearer token", async () => {
    const res = await GET(makeCronRequest("wrong-secret"));
    expect(res.status).toBe(401);
    expect(mockRunTranscribeSweep).not.toHaveBeenCalled();
  });

  test("rejects when CRON_SECRET env is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeCronRequest("anything"));
    expect(res.status).toBe(401);
    expect(mockRunTranscribeSweep).not.toHaveBeenCalled();
  });

  test("vercel.json schedules transcribe-sweep every 15 minutes, not every minute", () => {
    // Spec: until TXC-SWEEP-METRICS shows the 1-minute backstop is actually used,
    // keep cadence at 15 min so idle Production does not poke Neon every 60s.
    const raw = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    const config = JSON.parse(raw) as {
      crons: Array<{ path: string; schedule: string }>;
    };
    const sweep = config.crons.find((c) => c.path === "/api/cron/transcribe-sweep");
    expect(sweep).toBeDefined();
    expect(sweep!.schedule).toBe("*/15 * * * *");
    expect(sweep!.schedule).not.toBe("* * * * *");
  });

  test("authorized request runs sweep and returns counts", async () => {
    mockRunTranscribeSweep.mockResolvedValue({
      scanned: 2,
      processed: 2,
      done: 1,
      skipped: 0,
      failed: 1,
      timedOut: false,
    });

    const res = await GET(makeCronRequest("test-cron-secret"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, scanned: 2, done: 1, failed: 1 });
    expect(mockRunTranscribeSweep).toHaveBeenCalledTimes(1);
  });
});
