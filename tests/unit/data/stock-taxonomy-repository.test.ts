import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => {
  const vaultPath = __dirname + "/../../../lib/data/__fixtures__/vault";
  return {
    config: Object.freeze({
      obsidianVaultPath: vaultPath,
      vaultRoot: vaultPath,
    }),
  };
});

vi.mock("@/lib/server-only", () => ({ assertServerOnly: vi.fn() }));

import {
  loadStockTaxonomyLabels,
  parseStockTaxonomyFrontmatter,
  parseStockTaxonomyLabels,
} from "@/lib/data/stock-taxonomy-repository";

describe("stock taxonomy repository", () => {
  it("parses machine IDs into display labels", () => {
    const labels = parseStockTaxonomyLabels(`
| ID | Label |
|---|---|
| information-technology | 資訊科技 |
| ai-hpc | AI／HPC |
`);
    expect(labels.get("information-technology")).toBe("資訊科技");
    expect(labels.get("ai-hpc")).toBe("AI／HPC");
  });

  it("parses canonical YAML registry arrays including uppercase IDs", () => {
    const labels = parseStockTaxonomyFrontmatter({
      markets: [{ id: "TW", label: "台灣" }],
      sectors: [{ id: "information-technology", label: "資訊科技" }],
      unrelated: "ignored",
    });
    expect(labels.get("TW")).toBe("台灣");
    expect(labels.get("information-technology")).toBe("資訊科技");
  });

  it("loads the exact taxonomy note from the vault", () => {
    const result = loadStockTaxonomyLabels();
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.get("semiconductors")).toBe("半導體");
    expect(result.value.get("satellite")).toBe("衛星配置");
  });
});
