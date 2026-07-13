# 持股 Insights、分類系統與新增持股 MCP Workflow 升級計畫

> **For Hermes:** Use `subagent-driven-development` skill to implement this plan task-by-task. 每個 checkpoint 先完成 spec review，再做 code-quality review；未通過不得進入下一階段。

**Goal:** 修正 Wealth Insights 對研究筆記與分類的錯誤判定，建立以 Obsidian Stock Research note 為 canonical source 的持股分類 taxonomy，並讓新增持股、券商 CSV import、MCP writer 與 Wealth Website 使用同一份可驗證分類資料。

**Architecture:** Position note 只保存部位事實；Stock Research note 保存研究、分類與 conviction。Wealth 在 server-only repository 層以 canonical ticker 合併 Position + Research + Taxonomy，產生 enriched holding view。Oneal Personal MCP 是唯一受控 writer：維持 dry-run、confirm_write、idempotency，新增分類 contract 並讓 broker CSV planner/executor 傳遞分類；分類不足時記為 `pending-review`，禁止寫入假的「待補」或預設 conviction。

**Tech Stack:** Next.js 15、TypeScript、Zod、Vitest、Obsidian Markdown/YAML、Python 3.11、PyYAML、MCP Python SDK、pytest、ruff、Docker Compose、systemd、Cloudflare Access。

---

## 0. 已確認現況與硬性邊界

### 已確認根因

1. `app/api/insights/route.ts` 只呼叫 `listOpenPositions()`，沒有傳入 `researchSummaries`。
2. `checkMissingResearchNotes()` 將未提供的 `researchSummaries` 視為空集合，因此 12 檔全部誤報沒有研究筆記。
3. sector/theme/conviction 規則只讀 Position note；這三項實際存在 Stock Research note。
4. 12 個 open positions 全部有對應 `Trading/Stocks/*.md` 且 `type: stock-note`。
5. 11/12 研究筆記有 sector、theme、conviction；只有 `2327.TW 國巨.md` 尚未使用 canonical 欄位。
6. stale-price 使用 calendar-day `> 1 day`，沒有台股交易日／Asia/Taipei 更新窗口語意，週末會產生噪音。
7. `stocks.ensure_research_note` 現在缺分類時會寫 `sector: 待補`、`theme: 待補`、`conviction: 1`；這會讓缺漏看起來像合法資料，必須修正。
8. MCP broker CSV planner/executor 已包含 `stocks.ensure_research_note`，所以分類 contract 必須一路傳遞到 planner/executor。

### 現有資料的正確預期

網站修正後，現有 12 檔應得到：

```text
without research notes = 0
missing sector = 1（2327.TW）
missing theme = 1（2327.TW）
missing conviction = 1（2327.TW）
```

### 不可破壞的邊界

- Wealth Website 保持 readonly，不得直接寫 Vault、Finance DB、positions 或 research notes。
- Position canonical fields：ticker、status、shares、entry price、current price、last checked、exit rules。
- Research canonical fields：classification、conviction、thesis、catalysts、risks、last review。
- MCP write tools維持：`dry_run=true` 預設；實寫必須 `dry_run=false AND confirm_write=true`；orchestrator executor 另需 `reviewed_plan=true`。
- 不複製 sector/theme/conviction 到 Position note，避免雙寫漂移。
- 不用分類缺漏阻擋真實交易 ledger／position 登錄；缺漏應成為明確 `pending-review` Insight。
- Dashboard mounts、`Cache-Control: private, no-store`、`toSafeResponse()`、Cloudflare Access 與 localhost bind 不可退步。

### 開始實作前的 stop gate

`/home/ubuntu/services/oneal-personal-mcp` 目前有未提交修改與未追蹤檔案，包含 HTTP transport、workflow tools、DXT/debug scripts。實作分類前必須：

1. 執行 `git diff --stat`、`git diff`、`git status --short`。
2. 確認哪些變更屬於現行 MCP release。
3. 將既有工作先形成獨立 commit，或建立可還原 patch/branch；不得把分類修改混入不明 dirty state。
4. 若 `server.py`／`__init__.py` 的既有變更尚未驗證，停止並先完成既有 release validation。

**Success criteria:** MCP baseline 可重現、完整測試通過、工作樹狀態與分類變更邊界清楚。

---

## 1. Canonical taxonomy 設計凍結

### 1.1 新增 taxonomy source note

**Create:** `/home/ubuntu/ObsidianVault/Trading/Stock Classification Taxonomy.md`

建議 frontmatter：

```yaml
---
type: stock-classification-taxonomy
taxonomy_version: 1
asset_classes:
  - id: equity
    label: 個股
  - id: equity-etf
    label: 股票型 ETF
markets:
  - id: TW
    label: 台灣
portfolio_roles:
  - id: core
    label: 核心
  - id: satellite
    label: 衛星
  - id: tactical
    label: 戰術
  - id: special-situation
    label: 特殊情境
sectors:
  - id: semiconductor
    label: 半導體
  - id: electronic-components
    label: 電子零組件
  - id: consumer-discretionary
    label: 消費循環
  - id: diversified-equity
    label: 多元股票曝險
industries:
  - id: analog-ic
    label: 類比 IC
  - id: power-discrete
    label: 功率分離式元件
  - id: passive-components
    label: 被動元件
  - id: power-supply
    label: 電源供應器
  - id: leisure-entertainment
    label: 休閒娛樂
  - id: broad-market-etf
    label: 大盤型 ETF
themes:
  - id: ai-server-power
    label: AI 伺服器電源
  - id: pmic
    label: 電源管理 IC
  - id: power-semiconductor
    label: 功率半導體
  - id: passive-component-cycle
    label: 被動元件循環
  - id: automotive-electronics
    label: 車用電子
  - id: industrial-power
    label: 工控電源
  - id: taiwan-large-cap
    label: 台灣大型權值
  - id: leisure-consumption
    label: 休閒消費
---
```

實作前以 12 檔 audit matrix 驗證第一版 enum 是否足夠；不為尚不存在的市場／資產類型做過度設計。

### 1.2 Stock Research note canonical fields

```yaml
classification_version: 1
classification_status: classified # classified | pending-review
asset_class: equity
market: TW
sector: semiconductor
industry: analog-ic
subindustry: power-management-ic
portfolio_role: satellite
themes:
  - ai-server-power
  - pmic
conviction: 4
```

### 1.3 相容策略

- Website 採 **dual-read**：新 `themes[]` 優先，舊 `theme` 字串 fallback。
- MCP 採 **single-write new schema**：新建／明確更新時寫 `themes[]` 與 canonical IDs。
- 過渡期保留舊 `theme` 欄位，不在第一輪 migration 刪除，避免 Dataview/舊 consumer 立即斷裂。
- `ticker` 與 `quote_symbol` 都必須 normalize；Vault canonical symbol 統一 `XXXX.TW`，上櫃 Yahoo alias `.TWO` 只存在 `quote_symbol`。
- `0050` 等 leading-zero ticker 必須是 quoted string。

### Checkpoint 1

**Input:** 12 檔分類 audit matrix。
**Output:** taxonomy v1 draft + 12 檔 proposed mapping。
**Validation:** 每檔能唯一對應 asset class、sector、industry、role、theme IDs；無自由文字落單。
**Stop point:** 先讓 Oneal review taxonomy 與 12 檔 mapping；未確認前不批次寫 Vault。

---

## 2. 第一個實作 slice：先修 Wealth 假警告

> 這是最小、可獨立部署、立即有價值的 slice。

### Out of scope for first slice

- 不改任何 Obsidian note。
- 不改 MCP。
- 不做 taxonomy migration。
- 不改 allocation chart。
- 不改 stale-price 市場日曆。

### Task 2.1：Research repository 批次索引

**Modify:**
- `/home/ubuntu/services/oneal-wealth-dashboard/lib/data/research-repository.ts`
- `/home/ubuntu/services/oneal-wealth-dashboard/lib/schemas/research.ts`
- `/home/ubuntu/services/oneal-wealth-dashboard/tests/unit/data/research-repository.test.ts`
- `/home/ubuntu/services/oneal-wealth-dashboard/lib/data/__fixtures__/vault/Trading/Stocks/*.md`

新增一次掃描 API，避免每個 ticker 重複 `listNotes()`：

```ts
export interface ResearchIndexResult {
  summaries: Map<string, ResearchSummary>;
  invalid: Array<{ symbol: string; code: string }>;
}

export function listResearchSummariesForSymbols(
  symbols: string[],
): Result<ResearchIndexResult, SourceError>;
```

規則：

1. filename、`ticker`、`quote_symbol` 都 normalize。
2. `0050`、`0050.TW`、case variation 必須匹配。
3. `.TWO` quote alias 必須回到 Vault `.TW` symbol。
4. 缺檔與格式 invalid 分開，不可都當 missing。
5. API 不回 raw path、body 或 exception。

### Task 2.2：建立 enriched holding view

**Create:**
- `/home/ubuntu/services/oneal-wealth-dashboard/lib/data/portfolio-research-view.ts`
- `/home/ubuntu/services/oneal-wealth-dashboard/tests/unit/data/portfolio-research-view.test.ts`

合併規則：

```ts
const enriched = {
  ...position,
  research,
  sector: research?.sector ?? position.sector ?? null,
  theme: research?.theme ?? position.theme ?? null,
  conviction: research?.conviction ?? position.conviction ?? null,
};
```

Position fallback 只為舊資料相容；Research 是 canonical metadata source。

### Task 2.3：接上 Insights API

**Modify:**
- `/home/ubuntu/services/oneal-wealth-dashboard/app/api/insights/route.ts`
- `/home/ubuntu/services/oneal-wealth-dashboard/tests/unit/api/insights.test.ts`
- `/home/ubuntu/services/oneal-wealth-dashboard/lib/analytics/insights.ts`
- `/home/ubuntu/services/oneal-wealth-dashboard/tests/unit/analytics/insights.test.ts`

測試先行：

1. 12 positions + 12 valid research → 無 missing-research Insight。
2. 12 positions + 11 classified research + 國巨 partial → 只列國巨缺三項。
3. Research note invalid → 顯示 `research note invalid`，不可誤報不存在。
4. Repository unavailable → API 走 safe error，不輸出「12 檔都沒有」。
5. 維持 `Cache-Control: private, no-store`。

### Checkpoint 2

Run：

```bash
npm test -- --run tests/unit/data/research-repository.test.ts \
  tests/unit/data/portfolio-research-view.test.ts \
  tests/unit/api/insights.test.ts \
  tests/unit/analytics/insights.test.ts
npm run typecheck
npm test
npm run build
git diff --check
```

正式部署後 probe：

```bash
curl -fsS http://127.0.0.1:3003/api/insights | python3 -m json.tool
sudo -n docker compose ps
curl -sSI https://<wealth-host>/insights
```

**Success criteria:** 12 檔研究筆記誤報歸零；只有國巨的真缺漏保留；container healthy；Cloudflare Access gate 不變。

**Commit:**

```bash
git commit -m "fix: join stock research into portfolio insights"
```

---

## 3. Website taxonomy 與 actionable Insights 升級

### Task 3.1：讀取 taxonomy source

**Modify/Create:**
- `lib/data/vault-reader.ts`：allowlist 加入 taxonomy note 的精確路徑。
- `lib/data/stock-classification-repository.ts`：新增 server-only reader。
- `lib/schemas/research.ts`：加入 taxonomy/classification view models。
- `tests/unit/data/stock-classification-repository.test.ts`
- fixture：`lib/data/__fixtures__/vault/Trading/Stock Classification Taxonomy.md`

失敗策略：taxonomy invalid 時分類分析應明確 unavailable；不得把 raw ID 當正常 label，也不得影響基本 Position 市值頁。

### Task 3.2：ResearchSummary 升級

**Modify:**
- `lib/data/research-repository.ts`
- `lib/schemas/research.ts`
- `tests/unit/data/research-repository.test.ts`

新增：

```ts
classificationVersion: number | null;
classificationStatus: "classified" | "pending-review";
assetClass: string | null;
sector: string | null;
industry: string | null;
subindustry: string | null;
portfolioRole: string | null;
themes: string[];
```

舊 `theme` fallback 只做 migration compatibility。

### Task 3.3：Insights 語意調整

**Modify:**
- `lib/analytics/insights.ts`
- `tests/unit/analytics/insights.test.ts`
- `app/insights/insights-page.tsx`

改善為：

- `missing research`：真的沒有 matching note。
- `invalid research`：有 note，但 YAML/schema invalid。
- `classification pending`：有 note，但分類未完成。
- `missing conviction`：研究 note 存在但 conviction null。
- 同根因聚合成一則 action，例如「1 檔分類待補：2327.TW」。
- UI 文案改繁中並顯示可執行 action，不顯示英文系統句。

### Task 3.4：Allocation 使用 canonical IDs + labels

**Modify:**
- `lib/analytics/allocation.ts`
- `tests/unit/analytics/allocation.test.ts`
- `app/portfolio/page.tsx`（若目前資料在 server page 組裝）
- 對應 Overview/Portfolio API route（實作前先確認目前 consumer；禁止 UI 硬編 taxonomy）

提供：

1. Sector allocation。
2. Industry allocation。
3. Theme exposure（同一持股可屬多個 themes，需明確說明總和可能超過 100%）。
4. Portfolio role allocation。
5. Position weight × conviction 風險矩陣。

### Checkpoint 3

**Success criteria:** Website 顯示 taxonomy 中文 label；同一 PMIC/Power Discrete 群組能聚合；未知 ID 顯示 `分類代碼無效` 而非建立新分類。

---

## 4. Obsidian workflow、template 與 migration

### Task 4.1：更新 workflow 與模板

**Modify:**
- `/home/ubuntu/ObsidianVault/Rules/Workflow - Stock Research System.md`
- `/home/ubuntu/ObsidianVault/Rules/Workflow - Trading Journal System.md`
- `/home/ubuntu/ObsidianVault/Rules/Obsidian Workflows.md`
- `/home/ubuntu/ObsidianVault/Templates/Trading - Stock Research Template.md`
- `/home/ubuntu/ObsidianVault/Me/AI Context Map.md`
- `/home/ubuntu/ObsidianVault/_Master_Index.md`

更新內容：

- 指定 taxonomy note 是 classification source of truth。
- 新增持股後必須確保 research note 存在。
- 分類完整才是 `classified`；不得使用「待補」充當合法 enum。
- Research note 不手抄 shares、avg cost、current price；需要時用 Dataview 從 Position 動態顯示。
- 進場時 research status → `hold`；結倉時依 thesis 回到 `watchlist/ready/avoid`，不要自動猜。

### Task 4.2：建立 audit/migration 工具

**Create（MCP repo，預設 read-only/dry-run）:**
- `/home/ubuntu/services/oneal-personal-mcp/scripts/audit_stock_classification.py`
- `/home/ubuntu/services/oneal-personal-mcp/scripts/migrate_stock_classification.py`
- `/home/ubuntu/services/oneal-personal-mcp/tests/test_stock_classification_migration.py`

Audit matrix 至少包含：

```text
symbol
position path
research path
research parse status
ticker match
legacy sector/theme
canonical asset_class/sector/industry/subindustry/role/themes
conviction
classification status
proposed diff
```

Migration 安全規則：

- 預設 dry-run。
- `--apply` 前建立 timestamped backup manifest。
- 完整讀取現有 note，僅替換 frontmatter，body byte-for-byte 保留。
- 不刪 legacy `theme` 於第一輪。
- 重跑 idempotent，第二次 diff 為空。
- YAML parse 失敗立即 stop，不做 partial batch。

### Task 4.3：先遷移 12 個 open holdings

順序：

1. Dry-run 12 檔。
2. Oneal review mapping。
3. Backup 12 檔。
4. Apply。
5. Validate frontmatter。
6. 驗證 Obsidian Dataview 與 Wealth API。
7. 再決定是否 backfill 其餘 32 個 research notes。

### Checkpoint 4

**Success criteria:** 12/12 position 可匹配 research；11 個既有完整分類正確 migration；國巨明確 `pending-review` 或經確認補齊；所有 body 未被覆蓋；Dataview 不回歸。

---

## 5. Oneal Personal MCP 分類 contract 升級

### Task 5.0：先處理 dirty repo stop gate

在 `/home/ubuntu/services/oneal-personal-mcp`：

```bash
git status --short
git diff --stat
git diff
.venv/bin/python -m pytest -q
.venv/bin/python -m ruff check src tests
```

先將既有 HTTP/workflow/DXT 變更隔離或提交。分類修改不得與不明 dirty changes 混在同一 commit。

### Task 5.1：新增 taxonomy parser

**Create:**
- `src/oneal_personal_mcp/tools/stocks_classification.py`
- `tests/test_stocks_classification.py`

功能：

- 讀取精確 allowlisted taxonomy note。
- 驗證 taxonomy version、IDs 唯一、label 非空。
- 提供 normalize/validate helpers。
- 提供 read-only handler：`stocks.get_classification_taxonomy`。
- Taxonomy unavailable 時回 `TAXONOMY_UNAVAILABLE`，但不阻止其他 MCP tools 啟動。

### Task 5.2：升級 `stocks.ensure_research_note`

**Modify:**
- `src/oneal_personal_mcp/tools/stocks_ensure_research_note.py`
- `tests/test_stocks_ensure_research_note.py`

新增 optional args：

```json
{
  "classification_version": 1,
  "classification_status": "classified",
  "asset_class": "equity",
  "market": "TW",
  "sector": "semiconductor",
  "industry": "analog-ic",
  "subindustry": "power-management-ic",
  "portfolio_role": "satellite",
  "themes": ["ai-server-power", "pmic"],
  "conviction": 4
}
```

必改行為：

1. 新 note 未提供完整分類：`classification_status: pending-review`，省略未知欄位或使用 YAML null；不得寫 `sector: 待補`、`theme: 待補`、`conviction: 1`。
2. 既有 note 未傳分類參數：完整保留分類，不以 default 覆蓋。
3. 明確傳入分類參數：驗證 taxonomy IDs 後更新。
4. `themes` 去重、穩定排序或保留 taxonomy 順序。
5. 所有更新保持 body、dry-run preview、marker idempotency。
6. Existing legacy note 可逐步升級，不要求一次破壞性改寫。

### Task 5.3：升級 server registration/schema

**Modify:**
- `src/oneal_personal_mcp/server.py`
- `src/oneal_personal_mcp/__init__.py`
- `pyproject.toml`
- `tests/test_server_smoke.py`

必做：

- Import handler。
- `DISPATCH` registration。
- `Tool(...)` JSON schema。
- `stocks.ensure_research_note` 新欄位 schema。
- 新 tool `stocks.get_classification_taxonomy`。
- Hermes dotted name 與 Anthropic underscore alias 都測試。
- 因 tool schema/tool count 改變，MCP server version bump；baseline 整理後建議 `0.2.0`。

### Checkpoint 5

Run：

```bash
.venv/bin/python -m pytest tests/test_stocks_classification.py \
  tests/test_stocks_ensure_research_note.py \
  tests/test_server_smoke.py -q
.venv/bin/python -m pytest -q
.venv/bin/python -m ruff check src tests scripts
```

MCP stdio smoke：

1. `initialize`。
2. `tools/list` 確認新 tool/field。
3. `stocks.get_classification_taxonomy` read-only call。
4. `stocks.ensure_research_note` dry-run call。
5. 確認 Vault hash/mtime 未變。

---

## 6. 新增持股 workflow 與 Broker CSV planner/executor 升級

### Task 6.1：Planner 接受 per-symbol classification map

**Modify:**
- `src/oneal_personal_mcp/tools/trading_plan_broker_csv_import.py`
- `tests/test_trading_plan_broker_csv_import.py`
- `src/oneal_personal_mcp/server.py`

新增 top-level optional input：

```json
{
  "classifications": {
    "1432.TW": {
      "asset_class": "equity",
      "sector": "consumer-discretionary",
      "industry": "leisure-entertainment",
      "portfolio_role": "special-situation",
      "themes": ["leisure-consumption"],
      "conviction": 1
    }
  }
}
```

Planner 規則：

1. Existing research note：保留既有分類；只有顯式 map 才更新。
2. New ticker + valid map：建立 `classified` research note preview。
3. New ticker + no map：建立 `pending-review` stub preview，row 加 warning `classification_pending_review`，但不阻擋 transaction/position。
4. Invalid ID：該 row blocker `INVALID_CLASSIFICATION`；不進 real executor。
5. Symbol normalization 在 map lookup 前執行。

### Task 6.2：Executor 透明執行 reviewed plan

**Modify:**
- `src/oneal_personal_mcp/tools/trading_execute_broker_csv_import.py`
- `tests/test_trading_execute_broker_csv_import.py`
- `src/oneal_personal_mcp/server.py`

Executor 不重新猜分類；必須執行 planner 產生的 exact args，並維持：

```text
dry_run=false
confirm_write=true
reviewed_plan=true
```

若中途 stop，重跑依各工具 marker idempotency 恢復；不得重新建立 duplicate research note。

### Task 6.3：定義新增持股完整 workflow

Canonical order：

```text
normalize/confirm symbol
→ parse/plan transaction
→ transaction ledger
→ position upsert
→ focus-report config
→ ensure research note + classification
→ daily trade note
→ Finance snapshot（若有真實可驗證餘額）
→ validate position/research/taxonomy
→ Syncthing scan
→ Wealth readonly verification
```

交易不附分類時，完成交易登錄但產生一個明確待處理項；不得用假分類清除 warning。

### Checkpoint 6

測試情境：

1. 新 ticker + 完整分類。
2. 新 ticker + 無分類 → pending-review。
3. Existing ticker + existing classification → preserved。
4. Existing ticker + explicit reclassification → updated in dry-run/confirmed write。
5. Invalid taxonomy ID → blocked, zero writes。
6. Duplicate CSV import → no duplicate note/position/classification update。
7. Sell/close position → research status 不自動設 `avoid`；依現有規則回 `watchlist` 並要求 review。

---

## 7. Stale-price 與「該注意的事」語意升級

### Task 7.1：台股交易日／更新窗口判斷

**Modify/Create:**
- `lib/analytics/market-freshness.ts`
- `lib/analytics/insights.ts`
- `tests/unit/analytics/market-freshness.test.ts`
- `tests/unit/analytics/insights.test.ts`

規則優先順序：

1. 使用 `Asia/Taipei`。
2. 週末沿用星期五價格為 fresh。
3. 交易日 14:10 更新窗口前，不要求當日收盤價。
4. 更新窗口後才要求最新市場 session。
5. 優先使用 portfolio snapshot/benchmark snapshot 的有效市場日期；若沒有交易日 calendar，保守 fallback 到 weekday logic 並標資料品質。
6. 未來可加入 TWSE holiday calendar，但第一版不要在沒有可靠來源時假裝完整。

### Task 7.2：Insight 聚合與中文 action

例：

```text
待處理：價格更新管線未完成，影響 12 檔
待處理：1 檔分類待審核（2327.TW）
注意：PMIC + Power Discrete 合計曝險 47%
資訊：週末沿用最近交易日價格，無需處理
```

避免 12 個相同根因的重複 warning；severity 與 actionability 分離。

### Checkpoint 7

**Success criteria:** 星期日／星期一更新前不把星期五價格誤報 stale；真正漏跑 cron 時才顯示 action-needed，且顯示 expected session 與 actual date。

---

## 8. Release、部署與 rollback

### Dashboard release

```bash
npm run typecheck
npm test
npm run build
git diff --check
git status --short
sudo -n docker compose build
sudo -n docker compose up -d --force-recreate
sudo -n docker compose ps
curl -fsS http://127.0.0.1:3003/api/insights
```

確認：

- API `private, no-store`。
- Safe error 不含 Vault path/body/stack。
- localhost bind 不變。
- Cloudflare Access 仍回 login/302。

### MCP release

服務：

```text
oneal-personal-mcp-http.service
oneal-personal-mcp-chatgpt.service
```

驗證順序：

1. Focused pytest。
2. Full pytest。
3. Ruff。
4. Stdio `initialize + tools/list + dry-run call`。
5. Restart HTTP services。
6. `/health` 確認 version/tool profile。
7. 對 Claude/Hermes/ChatGPT profile 分別 direct `tools/list` 比較 tool manifest。
8. Hermes chat 執行 `/reload-mcp` 後，實際呼叫 taxonomy read + research dry-run。
9. 確認工具 schema cache 已因 version bump 更新。

### Rollback

- Dashboard：revert 單一 checkpoint commit，重建上一 image。
- Vault：使用 migration manifest 的 per-file backups；只還原 frontmatter 變更，保留後續人工 body 編輯。
- MCP：每 checkpoint 獨立 commit；systemd 回退至上一 commit/package，重啟兩個服務。
- 若 taxonomy note invalid：Website 顯示 classification unavailable；MCP 拒絕分類寫入，但 position/transaction read-only 與既有未分類寫入流程不得崩潰。

---

## 9. 建議 commit 邊界

```text
Dashboard
1. test: cover portfolio research enrichment
2. fix: join stock research into portfolio insights
3. feat: read canonical stock classification taxonomy
4. feat: show actionable classified portfolio insights
5. fix: make Taiwan price freshness market-session aware

MCP
1. chore: stabilize existing MCP transport changes   # 既有 dirty work，先獨立處理
2. feat: validate stock classification taxonomy
3. feat: write classified stock research notes
4. feat: pass classifications through broker import plans
5. docs: update stock research and trading workflows

Vault migration
1. backup + dry-run artifact（不 commit 到 Dashboard repo）
2. migrate 12 open-holding research notes
3. optional: backfill remaining research notes after review
```

---

## 10. 最終驗收矩陣

| 驗收項目 | 預期 |
|---|---|
| 12 open positions 對應 research | 12/12 |
| Website missing research | 0 |
| 國巨分類缺漏 | 只列 2327.TW，直到 migration/review 完成 |
| Position 是否複製分類 | 否 |
| New ticker + 完整分類 | research stub classified |
| New ticker + 無分類 | pending-review，不寫假值 |
| Existing research update | body 保留、分類未傳則保留 |
| Invalid taxonomy ID | dry-run/plan blocked，零寫入 |
| CSV duplicate | idempotent，無重複 artifacts |
| Weekend stale warning | 不誤報 |
| 真正 cron 漏跑 | 顯示 expected vs actual session |
| Dashboard readonly | 維持 |
| MCP write gate | 維持 dry-run/confirm/review |
| Claude/Hermes/ChatGPT tool manifest | version/tool schema 一致 |
| Rollback | Dashboard、MCP、Vault 可獨立還原 |

---

## 11. 實作決策點

開始前只需確認一個產品決策：taxonomy v1 的分類 mapping 是否接受本計畫的 machine ID + 中文 label 模型。建議先按本方案做 12 檔 dry-run matrix，再由 Oneal review；不要求現在逐欄手動輸入。

建議執行順序：

```text
Checkpoint 2（Website 假警告）
→ Checkpoint 1/3（taxonomy + Website）
→ Checkpoint 4（12 檔 migration）
→ Checkpoint 5/6（MCP + 新增持股 workflow）
→ Checkpoint 7（交易日 aware Insights）
→ Checkpoint 8（跨 client release）
```
