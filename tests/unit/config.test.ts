import { describe, expect, it, vi, afterEach } from "vitest";

// Mock the server-only guard before any imports that might use it
vi.mock("@/lib/server-only", () => ({
  assertServerOnly: vi.fn(),
}));

// We'll dynamically import config to control env timing

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VAULT_ROOT = "/home/ubuntu/ObsidianVault";
const DATA_ROOT = "/home/ubuntu/data/finance";

function validEnv() {
  return {
    FINANCE_DB_PATH: `${DATA_ROOT}/finance.db`,
    OBSIDIAN_VAULT_PATH: VAULT_ROOT,
  };
}

async function loadConfig(env: Record<string, string | undefined>) {
  // Clear previous module cache so env vars take effect
  vi.resetModules();

  // Stub env before importing
  vi.stubEnv("FINANCE_DB_PATH", env.FINANCE_DB_PATH ?? "");
  vi.stubEnv("OBSIDIAN_VAULT_PATH", env.OBSIDIAN_VAULT_PATH ?? "");
  if (env.APP_TIMEZONE !== undefined)
    vi.stubEnv("APP_TIMEZONE", env.APP_TIMEZONE);
  if (env.APP_ORIGIN !== undefined) vi.stubEnv("APP_ORIGIN", env.APP_ORIGIN);
  if (env.PORT !== undefined) vi.stubEnv("PORT", env.PORT);

  return import("@/lib/config");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("config validation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("loads with valid env vars", async () => {
    const { config } = await loadConfig(validEnv());
    expect(config.financeDbPath).toBe(`${DATA_ROOT}/finance.db`);
    expect(config.obsidianVaultPath).toBe(VAULT_ROOT);
    expect(config.timezone).toBe("Asia/Taipei");
    expect(config.origin).toBe("http://localhost:3003");
    expect(config.port).toBe(3003);
  });

  it("parses PORT as a number", async () => {
    const env = { ...validEnv(), PORT: "8080" };
    const { config } = await loadConfig(env);
    expect(config.port).toBe(8080);
    expect(typeof config.port).toBe("number");
  });

  it("uses defaults when optional env vars are missing", async () => {
    const env = validEnv();
    // Don't set APP_TIMEZONE, APP_ORIGIN, PORT
    vi.stubEnv("APP_TIMEZONE", "");
    vi.stubEnv("APP_ORIGIN", "");
    vi.stubEnv("PORT", "");

    const { config } = await loadConfig(env);
    expect(config.timezone).toBe("Asia/Taipei");
    expect(config.origin).toBe("http://localhost:3003");
    expect(config.port).toBe(3003);
  });

  it("warns when FINANCE_DB_PATH is outside data root", async () => {
    const { config } = await loadConfig({
      FINANCE_DB_PATH: "/tmp/evil.db",
      OBSIDIAN_VAULT_PATH: VAULT_ROOT,
    });
    expect(config.warnings.some(w => w.includes("outside the allowed data root"))).toBe(true);
  });

  it("warns when OBSIDIAN_VAULT_PATH is outside vault root", async () => {
    const { config } = await loadConfig({
      FINANCE_DB_PATH: `${DATA_ROOT}/finance.db`,
      OBSIDIAN_VAULT_PATH: "/tmp/evil-vault",
    });
    expect(config.warnings.some(w => w.includes("outside the allowed vault root"))).toBe(true);
  });

  it("warns when vault path is a substring but not actually inside", async () => {
    // /home/ubuntu/ObsidianVaultEvil is NOT inside /home/ubuntu/ObsidianVault
    const { config } = await loadConfig({
      FINANCE_DB_PATH: `${DATA_ROOT}/finance.db`,
      OBSIDIAN_VAULT_PATH: "/home/ubuntu/ObsidianVaultEvil",
    });
    expect(config.warnings.some(w => w.includes("outside the allowed vault root"))).toBe(true);
  });

  it("accepts vault path exactly equal to root", async () => {
    const { config } = await loadConfig({
      FINANCE_DB_PATH: `${DATA_ROOT}/finance.db`,
      OBSIDIAN_VAULT_PATH: VAULT_ROOT,
    });
    expect(config.obsidianVaultPath).toBe(VAULT_ROOT);
  });

  it("throws for missing FINANCE_DB_PATH", async () => {
    await expect(
      loadConfig({ FINANCE_DB_PATH: "", OBSIDIAN_VAULT_PATH: VAULT_ROOT }),
    ).rejects.toThrow(/Missing required environment variable: FINANCE_DB_PATH/);
  });

  it("throws for missing OBSIDIAN_VAULT_PATH", async () => {
    await expect(
      loadConfig({
        FINANCE_DB_PATH: `${DATA_ROOT}/finance.db`,
        OBSIDIAN_VAULT_PATH: "",
      }),
    ).rejects.toThrow(
      /Missing required environment variable: OBSIDIAN_VAULT_PATH/,
    );
  });

  it("exposes warnings as a readonly array", async () => {
    const { config } = await loadConfig(validEnv());
    expect(Array.isArray(config.warnings)).toBe(true);
  });

  it("config object is frozen", async () => {
    const { config } = await loadConfig(validEnv());
    expect(Object.isFrozen(config)).toBe(true);
  });
});

describe("config type exports", () => {
  it("exports a typed ServerConfig interface", async () => {
    const { config } = await loadConfig(validEnv());
    // Verify known shape
    expect(config).toHaveProperty("financeDbPath");
    expect(config).toHaveProperty("obsidianVaultPath");
    expect(config).toHaveProperty("timezone");
    expect(config).toHaveProperty("origin");
    expect(config).toHaveProperty("port");
    expect(config).toHaveProperty("vaultRoot");
    expect(config).toHaveProperty("dataRoot");
    expect(config).toHaveProperty("warnings");
  });
});
