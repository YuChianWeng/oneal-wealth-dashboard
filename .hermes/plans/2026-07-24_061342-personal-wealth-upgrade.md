# Personal Wealth Web 升級實作計畫

> **For Hermes:** 執行本計畫前，先載入 `subagent-driven-development` 與 `software-quality-workflows`。本計畫採 phase-gated、vertical-slice、TDD 方式執行；每個 checkpoint 驗證通過後才進下一階段。
>
> **重要：** 目前 repository 有其他尚未提交的修改與未追蹤的 market 檔案。執行時不得 `git reset`、`git clean`、`git stash`、廣泛格式化，亦不得把不屬於本計畫的檔案一起 stage。

**Goal:** 將 Oneal Wealth Dashboard 從「資料瀏覽與報表」升級為「可信賴的個人財務決策 cockpit」，先完成資料新鮮度／來源可信度、時區與淨資產語意統一，再加入首頁決策摘要、預算目標、現金 runway 與投資風險偏離分析。

**Architecture:** 保持目前 read-only 邊界：Finance SQLite、Obsidian vault、market snapshot 都由 Web 以唯讀方式消費；broker credentials、行情抓取、CSV import 與 Finance/Obsidian 寫入流程留在 host-side producer 或既有 gated workflow。新增一個跨 API 共用的 provenance/freshness contract，讓所有重要數字帶有 `asOf`、source、quality、coverage 與 stale 狀態；純計算放在 `lib/analytics`，資料讀取放在 `lib/data`，API 只負責組合與安全序列化。

**Tech Stack:** Next.js 15 App Router、React 19、TypeScript、Zod、Vitest、Recharts、SWR、better-sqlite3、gray-matter/js-yaml、Docker Compose；時區固定採 `Asia/Taipei`。

---

## 1. 已知現況與限制

### 1.1 已存在的產品能力

目前已涵蓋：

- `/`：總覽、淨資產圖、資產配置、Insights、本月金流
- `/finance`：月度收入、支出、分類、帳戶與交易明細
- `/finance/accounts`：帳戶、貸款、保單借款與淨解約金
- `/finance/reviews`：可回顧月份索引
- `/portfolio`：持倉、市值、現價、損益、配置分類
- `/portfolio/[symbol]`：個股研究、投資論點、交易時間線
- `/portfolio/pnl`：已實現／未實現損益與 fee/tax audit
- `/portfolio/performance`：Modified Dietz/chain-linked 績效、0050、TAIEX
- `/portfolio/reconciliation`：confirmed cash、T+2、pending settlement、有效現金
- `/portfolio/transactions`、`/portfolio/research`
- `/growth`：淨資產成長、財務健康、保單借款投資績效
- `/insights`：依嚴重度篩選與 drill-through
- `/settings/data-status`：Finance DB 與 Obsidian source health
- 新增但尚未視為 release 的 market snapshot/history、live quote overlay、TAIEX/TXF 日盤圖

### 1.2 目前實際驗證狀態

在撰寫本計畫前，現有 worktree 的 read-only gates 為：

- `npm run typecheck`：通過
- `npm test`：57 files、601 tests 通過
- `npm run lint`：0 errors、9 warnings
- `npm run build`：通過；build 輸出包含 32 個 route entries
- 未進行 Docker rebuild、production restart、Cloudflare/Tunnel 變更

`docs/acceptance-checklist.md` 仍記載 28 test files、355 tests、25 routes，需在正式 checkpoint 重新產生，不可直接沿用舊數字。

### 1.3 已知問題與產品決策

1. 首頁 `app/page.tsx` 有 hardcoded source count 與「已載入」狀態；Sidebar 的資料狀態 props 多數未接上真實來源。
2. `/api/data-status` 目前主要檢查 Finance DB 與 Obsidian，未完整呈現 market producer/snapshot/history 的健康狀態。
3. `app/page.tsx` 與 `lib/nav-sections.ts` 有兩套 navigation；部分頁面仍使用 `stubNavSections`。
4. `/api/growth` 目前只讀最近 12 個月資料，但首頁 range 有 `All` 選項，歷史 coverage 語意不一致。
5. 多個 API 使用 runtime local `Date#getFullYear/#getMonth`，沒有集中套用 Asia/Taipei 月份與日期邏輯。
6. 淨資產、Portfolio live valuation、投資對帳、保單淨解約金之間需要明確確認是否存在遺漏或重複計算；不可只靠 UI 修補。
7. 目前 market ticker 有資料就可能顯示綠點，需區分 `live`、`closed_snapshot`、`stale`、`unavailable`。
8. 保持 v1 read-only：本計畫第一輪不新增 Web write API，不直接修改 Finance SQLite、Obsidian、positions、transactions 或 production data。

---

## 2. 目標資料與產品契約

### 2.1 Provenance/Freshness contract

新增共用型別與 Zod schema，預計放在：

- Create: `lib/schemas/provenance.ts`
- Create: `lib/data/provenance.ts` 或 `lib/data/source-status.ts`
- Test: `tests/unit/schemas/provenance.test.ts`
- Test: `tests/unit/data/source-status.test.ts`

建議 contract：

```ts
export const DataQualitySchema = z.enum([
  "confirmed",
  "estimated",
  "partial",
  "needs-review",
  "unavailable",
]);

export const DataStateSchema = z.enum([
  "live",
  "closed_snapshot",
  "stale",
  "unavailable",
]);

export const ProvenanceSchema = z.object({
  source: z.string().min(1).max(80),
  asOf: z.string().datetime({ offset: true }).nullable(),
  observedAt: z.string().datetime({ offset: true }).nullable(),
  generatedAt: z.string().datetime({ offset: true }),
  quality: DataQualitySchema,
  state: DataStateSchema,
  isStale: z.boolean(),
  coverageStart: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).nullable(),
  coverageEnd: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).nullable(),
  reasonCode: z.string().max(80).nullable(),
}).strict();
```

實際欄位可依現有 schema 調整，但必須遵守：

- 不把未知值轉成 0
- 不把 closed market 當 outage
- 不用 HTTP request time 代替 provider quote time
- 不公開絕對檔案路徑、vault path、stack trace 或 raw provider error
- source/quality/state 等解讀性欄位不可只靠 UI 推測

### 2.2 Taipei time contract

新增：

- Create: `lib/time/taipei.ts`
- Test: `tests/unit/time/taipei.test.ts`

至少提供純函式：

```ts
export function taipeiDate(reference: Date): string;
export function taipeiMonth(reference: Date): string;
export function taipeiYear(reference: Date): number;
export function monthStart(month: string): string;
export function rangeStart(range: RangeKey, reference: Date): string;
```

要求：

- 所有 `currentMonth`、YTD、growth range、overview range、monthly review 都使用此 helper。
- 測試 UTC 16:00/23:59 與 Taipei 00:00/07:59 的跨日邊界。
- 不以設定 Node `TZ` 作為唯一修正方式；核心函式應明確指定 `Asia/Taipei`。
- `date`、`month`、`asOf` 的格式與 timezone 語意分開，不將 date-only 字串當成 UTC timestamp。

### 2.3 淨資產與估值語意

在修改 route 前，先完成 read-only source audit，確認實際資料邊界：

```text
Net Worth
= confirmed/effective cash
+ holdings market value
+ insurance net surrender value
+ other included assets
- liabilities not already netted in an asset value
```

Oneal 的既有規則必須保留：

- 儲蓄險以淨解約金計入淨資產。
- 保單借款若已在淨解約金內扣除，不得再作第二次負債扣除。
- 買入／賣出的 T+2 cash adjustment 不能改寫過去已產生的 confirmed snapshot。
- 歷史 snapshot、目前 live view、post-snapshot trade 必須各自標示時間與狀態。

預計新增或調整：

- Modify: `lib/analytics/net-worth.ts`
- Possibly create: `lib/analytics/net-worth-composition.ts`
- Modify: `lib/data/finance-repository.ts`
- Modify: `lib/data/portfolio-repository.ts`
- Modify: `lib/data/reconciliation-repository.ts`
- Modify: `lib/data/insurance-policy-repository.ts`
- Modify: `app/api/growth/route.ts`
- Modify: `app/api/portfolio/reconciliation/route.ts`
- Tests: `tests/unit/analytics/net-worth.test.ts`
- Tests: `tests/unit/data/*reconciliation*.test.ts`

不要在沒有完成 source audit 前直接把 Portfolio 市值加進 `/api/growth`。

---

## 3. 第一個 implementation slice：Trust Layer + Home Decision Cockpit

### First slice goal

先完成一個可單獨驗收的 vertical slice：

1. 全站統一 Taipei date/month handling。
2. Finance、Obsidian、Market 三個來源都有實際 freshness/status。
3. API 與首頁顯示 `asOf/source/quality/state`。
4. 首頁移除 hardcoded「已載入」與來源數量。
5. 首頁顯示有效現金、淨資產、投資市值、本月結餘與 action queue 的可信狀態。
6. Navigation 使用單一來源。
7. `All` 的歷史 coverage 不再誤導。

### First slice out of scope

第一個 slice 不做：

- Web write API
- 預算目標設定 UI
- broker CSV import UI
- target allocation drift
- portfolio volatility/correlation
- 情境模擬
- Telegram notification
- Docker production deployment
- Cloudflare/Tunnel 變更
- Obsidian note 修改

---

## 4. 分階段實作任務

## Phase 0 — Baseline、source audit 與 contract freeze

### Task 0.1：記錄 worktree 邊界

**Files:**

- Read: repository root
- Read: `git status --short --branch`
- Read: `git diff --stat`
- Read: `git diff --name-only`

**Steps:**

1. 記錄起始 branch、HEAD、tracked modifications、untracked files。
2. 將目前 uncommitted market layer 視為 externally owned changes。
3. 只建立本計畫 allowlist；禁止 `git add .`、`git add -A`。

**Checkpoint:**

- Input：目前 dirty worktree。
- Output：一份明確的 task file allowlist。
- Success：後續 diff 能區分既有修改、本計畫修改與執行期間新增檔案。
- Stop point：若發現其他 agent/process 正在修改同一檔案，先停止該檔案的 patch，不要猜測合併方式。

### Task 0.2：建立資料語意對照表

**Files:**

- Read: `app/api/growth/route.ts`
- Read: `app/api/overview/route.ts`
- Read: `app/api/portfolio/route.ts`
- Read: `app/api/portfolio/reconciliation/route.ts`
- Read: `lib/analytics/net-worth.ts`
- Read: `lib/data/finance-repository.ts`
- Read: `lib/data/portfolio-repository.ts`
- Read: `lib/data/reconciliation-repository.ts`
- Read: `lib/data/insurance-policy-repository.ts`
- Read: `lib/schemas/finance.ts`
- Read: `lib/schemas/portfolio.ts`
- Read: `lib/schemas/reconciliation.ts`

**Output:**

建立 plan execution note 或 implementation PR description，列出：

| 顯示欄位 | source | as-of | 是否含 pending | 是否可能重複 | UI consumer |
|---|---|---|---|---|---|
| confirmed cash | Finance/reconciliation | cashAsOfDate | 否 | 否 | reconciliation/growth |
| effective cash | reconciliation | valuationDate | 是 | 否 | reconciliation |
| holdings market value | Portfolio/market snapshot | quote observedAt | 否 | 需確認 account snapshot | portfolio/growth |
| insurance net surrender | insurance repository | policy valuation date | 不適用 | 需避免 loan double count | accounts/net worth |

**Checkpoint:**

- 不得先寫 UI 來掩蓋未知的 source boundary。
- 若資料邊界無法確認，API 要回 `needs-review` 或 `partial`，不回一個看似精準的總數。

### Task 0.3：凍結第一 slice API contract

**Files:**

- Create/modify: `lib/schemas/provenance.ts`
- Modify: `lib/schemas/finance.ts`
- Modify: `lib/schemas/portfolio.ts`
- Modify: `lib/schemas/reconciliation.ts`
- Test: `tests/unit/schemas/provenance.test.ts`

**Tests first:**

加入以下 RED cases：

- datetime 沒有 timezone offset 時拒絕
- `quality` 不在 allowlist 時拒絕
- `state=closed_snapshot` 可存在且不等於 unavailable
- `isStale=true` 但 `asOf` 有值時可通過
- coverage 缺失時為 null，不轉成假日期
- schema 拒絕未知欄位，避免 API contract 靜默漂移

**Checkpoint:**

- `npx vitest run tests/unit/schemas/provenance.test.ts`
- Expected：先 RED，再在 schema 完成後 GREEN。

---

## Phase 1 — Taipei time 與 range correctness

### Task 1.1：建立 Taipei pure helpers

**Files:**

- Create: `lib/time/taipei.ts`
- Create: `tests/unit/time/taipei.test.ts`

**Implementation details:**

- `taipeiDate(reference)` 回傳 `YYYY-MM-DD`
- `taipeiMonth(reference)` 回傳 `YYYY-MM`
- `monthStart(month)` 驗證月份並回傳 date-only
- `rangeStart(range, reference)` 不使用 server local timezone
- 針對 leap day、year boundary、month boundary 做 explicit tests

**Verification:**

```bash
npx vitest run tests/unit/time/taipei.test.ts
```

### Task 1.2：替換 overview/growth local date arithmetic

**Files:**

- Modify: `app/api/overview/route.ts`
- Modify: `app/api/growth/route.ts`
- Modify: `app/page.tsx`
- Modify: `app/growth/growth-page.tsx`
- Test: `tests/unit/api/overview.test.ts`
- Test: `tests/unit/api/growth.test.ts`（若不存在則建立）

**Required changes:**

- `currentMonth` 改由 `taipeiMonth(now)` 產生。
- range lower bound 改由共用 helper 產生。
- API response 明確回傳 coverage metadata。
- `/api/growth` 的 12 個月限制要改成：
  - 真正支援 All；或
  - 將 UI label 改為近 12 個月並回傳 `coverageLabel`。
- 不要用 `new Date('YYYY-MM-DD')` 造成 UTC offset 誤解。

**Regression cases:**

- 2026-06-30 16:00Z 應屬於 Taipei 2026-07-01
- current month query 不得抓到未來日期
- YTD 以 Taipei 01-01 為界
- All 的 `coverageStart` 與實際資料第一筆一致
- no snapshot 時回空且有明確 `no-data`/`unavailable` 狀態

### Task 1.3：建立時間／coverage contract review checkpoint

**Input:** 變更後 overview/growth API。

**Validation:**

- unit tests
- API fixture response shape
- 手動針對月份邊界呼叫 pure functions

**Success criteria:**

- 不再有 route 內自行計算 Taipei 月份的 duplicate code。
- coverage 與 range label 一致。
- 沒有未來資料洩漏。

**Stop point:** 若淨資產來源是否包含 Portfolio 市值仍不清楚，先停在這裡，進行 source audit，不進入 valuation aggregation。

---

## Phase 2 — Unified source health / freshness

### Task 2.1：擴充 source status domain

**Files:**

- Modify: `lib/source-health.ts`
- Create or modify: `lib/data/source-status.ts`
- Modify: `app/api/data-status/route.ts`
- Test: `tests/unit/source-health.test.ts`
- Test: `tests/unit/data/source-status.test.ts`

**Sources to represent:**

1. `finance-db`
2. `obsidian-vault`
3. `market-snapshot`
4. `market-history`
5. optional future producer health, if observable without reading private paths

**Market checks:**

- snapshot file exists
- JSON parses
- Zod schema passes
- `observedAt` exists
- quote age relative to current time
- market session is `day`/`night`/`closed_snapshot`
- history file exists or is an expected pre-session empty state
- producer errors are summarized by safe reason code

**Important:**

- 不直接對外回傳 `MARKET_DATA_DIR`、absolute path 或 raw exception。
- `lastSuccessfulReadAt` 要代表真正成功讀取，不可單純把 file mtime 當成 read success without documenting semantics。
- market closed 是正常狀態，不應讓 overall health 變成 unavailable。

### Task 2.2：新增 data-status API schema 與安全錯誤測試

**Files:**

- Modify: `app/api/data-status/route.ts`
- Create/modify: `lib/schemas/data-status.ts`
- Test: `tests/unit/api/data-status.test.ts`

**Acceptance:**

- response 使用 `{ version, data }` envelope
- 每個 source 有 status、quality、lastSuccessfulReadAt、recordCount、warningCount
- 失敗時有固定安全 code
- 不含 vault path、DB path、filename、stack trace、raw note body
- `Cache-Control: private, no-store`

### Task 2.3：將 freshness 接入 AppShell/Sidebar

**Files:**

- Modify: `components/layout/app-shell.tsx`
- Modify: `components/layout/sidebar.tsx`
- Modify: `components/layout/data-status-card.tsx`
- Create/modify: `lib/hooks/use-data-status.ts`
- Test: `tests/unit/components/data-status-card.test.tsx`
- Test: `tests/unit/components/app-shell.test.tsx`（若測試 harness 已存在）

**UI states:**

| source state | UI |
|---|---|
| live/healthy | 綠色、顯示實際更新時間 |
| closed_snapshot | 中性／藍色，顯示收盤快照時間 |
| stale/degraded | 黃色，顯示 stale age 與原因 |
| unavailable | 紅色，顯示安全 reason code |

Data status card 應連到 `/settings/data-status`，不要只是靜態 footer。

### Task 2.4：修正首頁 freshness placeholders

**Files:**

- Modify: `app/page.tsx`
- Modify: `components/market/live-market-ticker.tsx`
- Modify: `components/market/intraday-line-chart.tsx`
- Test: `tests/unit/pages/overview.test.tsx`（若不存在則建立）
- Test: `tests/unit/components/intraday-line-chart.test.ts`

**Required changes:**

- 移除 `sourceCount = 3` hardcode。
- 移除「財務帳本／股價／持倉筆數」固定「已載入」文字。
- live ticker 綠點只能代表 live/healthy，不可只因 `data` 存在就變綠。
- `closed_snapshot`、`stale`、`unavailable` 要有不同 label/color。
- Portfolio table 若 position API 已帶 `priceSource`、`priceObservedAt`、`priceIsStale`，要在 row/detail 顯示最少一個明確 provenance indicator。

**Checkpoint:**

- focused tests
- local static render assertions
- inspect HTML/text for absence of hardcoded placeholder strings

---

## Phase 3 — Canonical navigation 與首頁 Decision Cockpit

### Task 3.1：合併 navigation source

**Files:**

- Modify: `app/page.tsx`
- Modify: `lib/nav-sections.ts`
- Modify: `components/layout/sidebar.tsx`
- Modify: `components/layout/mobile-nav.tsx`
- Test: `tests/unit/components/navigation.test.tsx`（建立）

**Required navigation contract:**

- 只保留一個 canonical `NAV_SECTIONS`。
- 所有頁面使用同一組 sections。
- `/portfolio/reconciliation` 出現在投資區。
- `/settings/data-status` 以明確的 settings/data health 入口出現在 desktop 與 mobile 的 canonical registry。
- `/growth` 與 `/insights` 不得有兩個名稱互相指向同一路徑而沒有清楚理由。
- 移除 `stubNavSections` 命名。
- active prefix 規則要對 `/portfolio/[symbol]`、`/portfolio/pnl`、`/portfolio/reconciliation`、`/growth` 正確。
- mobile nav 與 desktop nav 至少使用相同 href/source metadata。
- mobile nav 不可只硬編碼 5 個入口；對 PnL、績效、交易紀錄、研究、投資對帳等深層頁面提供「更多」抽屜或等價入口。
- 對所有 `Insight.drillThroughUrl` 做 route registry validation；目前 `lib/analytics/insights.ts` 的 `"/research"` 必須修正為現存 canonical route `/portfolio/research` 或明確的 symbol-specific route。

### Task 3.2：定義首頁 KPI contract

**Files:**

- Modify: `lib/analytics/types.ts`
- Modify: `lib/analytics/index.ts`
- Modify: `app/api/overview/route.ts`
- Modify: `lib/schemas/reconciliation.ts`
- Test: `tests/unit/analytics/overview-decision-summary.test.ts`
- Test: `tests/unit/api/overview.test.ts`

**Suggested view model:**

```ts
interface DecisionKpi {
  id: string;
  label: string;
  value: number | null;
  unit: "twd" | "percent" | "months" | "count";
  change: number | null;
  provenance: Provenance;
  drillThroughUrl: string | null;
  status: "available" | "partial" | "needs-review" | "unavailable";
}

interface DecisionSummary {
  kpis: DecisionKpi[];
  actionQueue: Insight[];
  sourceSummary: SourceSummary;
}
```

第一版 KPI 建議：

1. 淨資產
2. 有效現金
3. 持股市值
4. 本月結餘／可投資結餘
5. 對 0050 的相對績效（若比較區間可衡量）

若某項 source 不足，顯示 null + reason，不以 0 代替。

### Task 3.3：重排首頁視覺層級

**Files:**

- Modify: `app/page.tsx`
- Possibly modify: `components/ui/metric-card.tsx`
- Modify: `components/overview/overview-skeleton.tsx`
- Tests: `tests/unit/pages/overview.test.tsx`

**Page structure:**

1. Header：日期、資料狀態、最近更新
2. KPI row：淨資產／有效現金／投資市值／本月結餘
3. Action queue：action-needed 優先，提供 drill-through
4. Net worth + allocation
5. Monthly cash flow + savings rate
6. Source freshness summary

**Loading/error/empty/partial states:**

- loading：每個區塊有 skeleton
- partial：保留可用資料，明確顯示缺少來源
- empty：沒有資料時不得顯示 0 元 KPI 假裝正常
- error：只顯示 safe error code/message，提供 retry

### Task 3.4：第一 slice checkpoint

**Validation commands:**

```bash
npx vitest run \
  tests/unit/time/taipei.test.ts \
  tests/unit/schemas/provenance.test.ts \
  tests/unit/source-health.test.ts \
  tests/unit/data/source-status.test.ts \
  tests/unit/api/data-status.test.ts \
  tests/unit/api/overview.test.ts \
  tests/unit/components/data-status-card.test.tsx \
  tests/unit/components/navigation.test.tsx
npm run typecheck
npm run lint
npm test
npm run build
```

**First slice acceptance:**

- 所有核心 KPI 都帶 provenance。
- 首頁不再有固定「已載入」或固定 source count。
- Data status 包含 Finance、Obsidian、Market。
- market closed/stale/unavailable 狀態可被區分。
- navigation canonicalized。
- 時區與 coverage regression tests 通過。
- build 通過。
- production container 未重建，production 未重啟。

**Stop/decision point:**

在這個 checkpoint 由 Oneal review 首頁資訊層級與數據語意；未確認前不進行 Budget/Goals 或 Risk 功能，以免建立在錯誤的淨資產基礎上。

### Task 3.5：統一 current valuation read model

**Objective:** 讓 `/portfolio`、`/portfolio/[symbol]`、`/portfolio/pnl`、`/api/overview` 使用同一個 live/static fallback valuation，而不是各 route 各自計算。

**Files:**

- Create or refactor: `lib/data/current-valuation-repository.ts`
- Modify: `lib/data/live-market-pricing.ts`
- Modify: `app/api/overview/route.ts`
- Modify: `app/api/portfolio/route.ts`
- Modify: `app/api/portfolio/[symbol]/route.ts`
- Modify: `app/api/portfolio/pnl/route.ts`
- Modify: `lib/schemas/portfolio.ts`
- Test: `tests/unit/data/current-valuation-repository.test.ts`
- Test: `tests/unit/analytics/live-market-pricing.test.ts`
- Test: `tests/unit/api/portfolio-symbol.test.ts`
- Test: `tests/unit/api/portfolio-pnl.test.ts`

**Contract:**

每個 position valuation 都要從同一個 read model 產生：

- `currentPrice`
- `marketValue`
- `unrealizedPnl`
- `unrealizedPnlPct`
- `priceSource`
- `priceObservedAt`
- `priceIsStale`
- valuation-level `asOf`／quality／fallback reason

**Regression cases:**

- market snapshot available：四個 consumer 得到相同 current price/market value。
- market snapshot unavailable：全部 fallback 到 static source，且全部標示相同 unavailable/fallback reason。
- stale quote：仍可估值，但不得標示為 live。
- symbol canonicalization `0050.TW`／`0050.TWO`／`0050` 行為一致。
- missing/invalid quote 不得把 market value 變成 0。
- PnL route 不得重新使用未 overlay 的 static position。

**Checkpoint:**

以 fixture 產生同一個 snapshot fingerprint，確認 overview、portfolio、symbol detail、PnL 四個 API 的 quote `asOf` 與 valuation 結果一致。這個 checkpoint 不改 production data，也不需要 browser provider credential。

---

### Task 3.6：第一 slice 的 UX evidence 與 cross-link validation

**Files:**

- Modify: `lib/analytics/insights.ts`
- Modify: `app/insights/insights-page.tsx`
- Test: `tests/unit/analytics/insights.test.ts`
- Test: `tests/unit/components/navigation.test.tsx`

**Required behavior:**

- 所有 `drillThroughUrl` 必須指向現存 route registry entry。
- symbol/transaction-specific insight 要保留 query parameter，且 query 內容只使用 safe public identifiers。
- 對不存在的 `/research`、錯誤的 root-level route 或 malformed symbol 加入 regression。
- Insights 卡片顯示觸發值、as-of、source/quality、建議下一步與 drill-through。
- 只讀模式下「已檢查／暫不處理」若要做，先採 browser-local state，不寫入 Finance/Obsidian。

---

**First-slice addendum checkpoint:**

第一個 vertical slice 必須同時通過：

- canonical navigation
- broken drill-through validation
- unified current valuation across four consumers
- source freshness/status
- homepage provenance

不可只驗證首頁而留下點進 detail/PnL 後看到另一個價格的情況。

---

## Phase 4 — 淨資產 composition 與對帳一致性

### Task 4.1：完成 actual source graph audit

**Files:**

- Read-only: `lib/data/finance-queries.ts`
- Read-only: `lib/data/finance-repository.ts`
- Read-only: `lib/data/portfolio-repository.ts`
- Read-only: `lib/data/reconciliation-repository.ts`
- Read-only: `lib/data/insurance-policy-repository.ts`
- Read-only: fixtures under `lib/data/__fixtures__/`

**Output:**

- confirmed cash source
- investment account snapshot semantics
- Portfolio position valuation source
- insurance net surrender source
- loan liability source
- historical snapshot cutoff behavior
- duplicate/double-count risk assessment

若 source graph 無法證明完整，新增 `coverage` 與 `needs-review`，不要擴大公式。

### Task 4.2：建立 pure valuation composition

**Files:**

- Create: `lib/analytics/net-worth-composition.ts`
- Modify: `lib/analytics/net-worth.ts`
- Test: `tests/unit/analytics/net-worth-composition.test.ts`
- Test: `tests/unit/analytics/net-worth.test.ts`

**Test matrix:**

- complete confirmed cash + holdings + policy + liabilities
- missing holdings price
- stale holdings price
- pending buy payable
- pending sell receivable
- finance-settled but cash snapshot stale
- insurance loan already netted
- partial account coverage
- zero/negative/invalid amounts
- duplicate investment account inclusion
- historical snapshot vs live post-cutoff trade

### Task 4.3：把 composition 接入 Growth/Reconciliation

**Files:**

- Modify: `app/api/growth/route.ts`
- Modify: `app/api/portfolio/reconciliation/route.ts`
- Modify: `app/growth/growth-page.tsx`
- Modify: `app/portfolio/reconciliation/reconciliation-page.tsx`
- Test: `tests/unit/api/growth.test.ts`
- Test: `tests/unit/api/portfolio-reconciliation.test.ts`
- Test: `tests/unit/pages/growth-loan-investment.test.tsx`
- Test: `tests/unit/pages/portfolio-reconciliation.test.tsx`

**Rules:**

- 歷史 series 不因目前 live quote 重新改寫，除非它本來就是 current valuation view。
- 每個 composition component 有自己的 `asOf` 與 quality。
- `confirmed cash` 與 `effective cash` 分開顯示。
- 對帳公式要能從 API payload 重新計算並通過 invariant。
- `strategy value` 的 source cutoffs 要明確。

### Task 4.4：財務資料 integrity checkpoint

**Validation:**

- pure analytics tests
- API schema tests
- fixture-based equation assertions
- no-future-fill benchmark assertions
- no raw path/error leakage assertions

**Success criteria:**

```text
confirmedCash + pendingAdjustment = effectiveCash
 effectiveCash + holdingsMarketValue = strategyValue
 netWorth composition has no double-counted insurance loan
```

若任一等式只能靠 rounding 或 UI correction 成立，判定為不通過。

---

## Phase 5 — Budget、Goals 與 Monthly Close

這一階段必須在 Phase 4 通過後開始。

### Task 5.1：決定 goals/budget canonical source

**候選方案：**

A. Obsidian vault 下新增 read-only planning note，例如：

- `Finance/Planning/Wealth Targets.md`
- `Finance/Planning/Monthly Budget.md`

B. versioned YAML under a mounted planning data directory。

優先選 A，因為 Oneal 已把財務與研究資料維護在 Obsidian；但必須先確認 `vault-reader` whitelist 與現有資料結構。

**Required fields:**

- `type: wealth-targets`
- `effective_from`
- `currency: TWD`
- category-to-budget mapping
- emergency fund target months
- savings rate target
- cash allocation target
- portfolio target allocation
- optional financial independence target

Web 只讀，不提供寫入。

### Task 5.2：建立 strict budget mapping

**Files:**

- Create: `lib/data/planning-repository.ts`
- Create: `lib/schemas/planning.ts`
- Create: `lib/analytics/budget-actual.ts`
- Test: `tests/unit/data/planning-repository.test.ts`
- Test: `tests/unit/analytics/budget-actual.test.ts`

**Invariants:**

- budget key 只能映射 exact Finance `category_key`
- unknown category 保留為 `unmapped`，不可 fuzzy match
- no source row 與 known zero 必須區分
- target = 0 且 actual > 0 時為 overspent，percentage 為 null，不是 Infinity
- investment bucket、income、loan interest 與普通生活支出分開
- current month query 受 Taipei `asOf` 限制，不抓未來交易
- projection 在觀測天數不足時回 `not-ready`

### Task 5.3：新增 budget/goal API

**Files:**

- Create: `app/api/finance/budget/route.ts`
- Create: `app/api/goals/route.ts`
- Modify: `lib/schemas/finance.ts` or add view-model schema
- Tests: `tests/unit/api/finance-budget.test.ts`
- Tests: `tests/unit/api/goals.test.ts`

API 至少提供：

- actual
- target
- remaining
- utilizationPct nullable
- projection status
- asOf
- data quality
- unmapped warnings
- drill-through route

所有 error response 必須 `private, no-store` 且 safe。

### Task 5.4：新增 Monthly Close detail

**Files:**

- Modify: `app/finance/reviews/reviews-page.tsx`
- Create: `app/finance/reviews/[month]/page.tsx` 或等價 App Router route
- Create: `app/finance/reviews/[month]/monthly-review-page.tsx`
- Modify: `lib/nav-sections.ts` only if needed
- Tests: `tests/unit/pages/finance-monthly-review.test.tsx`

**UI:**

- 本月 vs 上月
- 本月 vs budget
- top category variance
- recurring expense candidates
- income/expense/savings trend
- investment contribution
- loan interest separately shown
- needs-review items
- source freshness

第一版仍不提供「完成 review」的 Web write action；可以提供 Obsidian path/deep link 或 copy summary。

### Task 5.5：Budget checkpoint

**Acceptance:**

- 完整歷史月份、當月資料不足、target missing、target zero、unmapped category、investment exclusion、loan-interest separation 全部有測試。
- UI 可分辨 `no-data`、`0`、`not-ready`、`overspent`。
- 與 Finance summary 的 signed amounts 可獨立重算。
- 不新增 Finance SQLite write path。

### Task 5.6：Finance/PnL 日常操作效率與資產負債 bridge

**Files:**

- Modify: `app/finance/page.tsx`
- Modify: `app/finance/finance-page.tsx`
- Modify: `app/finance/reviews/reviews-page.tsx`
- Modify: `app/finance/accounts/accounts-page.tsx`
- Modify: `app/portfolio/pnl/page.tsx`
- Modify: `app/portfolio/transactions/page.tsx`
- Modify: `lib/nav-sections.ts` only if a canonical route label changes
- Test: `tests/unit/pages/finance-filters.test.tsx`
- Test: `tests/unit/pages/finance-accounts.test.tsx`
- Test: `tests/unit/pages/portfolio-pnl.test.tsx`
- Test: `tests/unit/pages/portfolio-transactions.test.tsx`

**Finance controls:**

- month previous/next and explicit `YYYY-MM` selector
- category/account/transaction-type filters
- URL-preserved filters so a filtered view can be refreshed/shared safely
- separate living expense、investment settlement、loan interest、loan principal
- signed cash-flow semantics explicitly shown

**PnL/transactions cross-filter:**

- PnL period selector
- audit list 不限制只顯示前 12 筆，提供 bounded pagination 或「查看全部 needs-review」
- needs-review count 可以直接帶 filter 到交易列表
- transaction side、data quality、broker、settlement state filters
- individual PnL rows link to the corresponding transaction filter and symbol detail
- filter query 只接受 schema allowlist，不把 arbitrary query string 傳到 repository

**Existing `/finance/accounts` bridge:**

- 不建立新的資產負債表頁，直接在既有帳戶頁加入：
  - gross policy value
  - net surrender value
  - loan principal
  - accrued interest
  - included/excluded from net worth
  - assets minus liabilities bridge
- bridge 的最終值必須與 `/growth`／net-worth composition 使用相同 source contract，並顯示 reconciliation link。

---

### Task 5.7：Budget/Planning phase regression checkpoint

**Validation:**

- Finance month/filter query 的 deep link 可重現相同結果。
- PnL ↔ transactions ↔ symbol detail cross-link 不丟失 symbol/date/status filter。
- bridge 不重複扣保單借款，且 gross/net policy value label 清楚。
- mobile 與 desktop 對同一個 query state 產生一致的資料結果。
- 只讀 boundary、safe query schema、private cache policy 通過。

---

## Phase 6 — Cash Runway、Obligations 與 Portfolio Risk

### Task 6.1：現金 runway 與 30/90 天 obligations

**Files:**

- Create: `lib/analytics/cash-runway.ts`
- Create: `app/api/finance/cash-runway/route.ts`
- Modify: `app/finance/accounts/accounts-page.tsx`
- Test: `tests/unit/analytics/cash-runway.test.ts`
- Test: `tests/unit/api/finance-cash-runway.test.ts`
- Test: `tests/unit/pages/finance-accounts.test.tsx`

**Inputs:**

- confirmed cash
- pending T+2 adjustments
- average living expense
- current month expense as-of
- loan interest/principal schedule if available
- policy interest due date
- known recurring obligations

**Outputs:**

- current effective liquidity
- 30-day expected floor
- 90-day expected floor
- runway months
- obligations list
- quality/status per obligation
- missing schedule warnings

Unknown obligations 不得假設為 0。

### Task 6.2：target allocation 與 drift contract

**Files:**

- Modify: `lib/schemas/planning.ts`
- Create: `lib/analytics/allocation-drift.ts`
- Modify: `app/api/portfolio/route.ts`
- Test: `tests/unit/analytics/allocation-drift.test.ts`
- Test: `tests/unit/api/portfolio.test.ts`

**Outputs:**

- actual weight
- target weight
- drift percentage points
- drift amount
- target missing/unknown state
- theme multi-label semantics
- aggregate total handling

ETF look-through 在沒有可靠 holdings source 前不要假裝提供；先只做 vault taxonomy 與 direct holding exposure。

### Task 6.3：Portfolio risk surface

**Files:**

- Create: `lib/analytics/portfolio-risk.ts`
- Create: `app/api/portfolio/risk/route.ts`
- Create: `app/portfolio/risk/page.tsx`
- Test: `tests/unit/analytics/portfolio-risk.test.ts`
- Test: `tests/unit/api/portfolio-risk.test.ts`
- Test: `tests/unit/pages/portfolio-risk.test.tsx`

第一版只做可由現有資料證明的項目：

- largest position concentration
- sector/theme concentration
- target drift
- max drawdown from available snapshots
- stale/missing price coverage
- thesis/research missingness

波動度、correlation、factor exposure 必須等有足夠且可信的 time series 後才加入。

### Task 6.4：Position detail provenance 與 thesis monitoring

**Files:**

- Modify: `app/portfolio/[symbol]/page.tsx`
- Modify: `lib/schemas/portfolio.ts`
- Modify: `lib/data/research-repository.ts`
- Test: `tests/unit/pages/portfolio-symbol.test.tsx`
- Test: `tests/unit/data/research-repository.test.ts`

加入：

- quote as-of/source/stale
- research note date
- thesis status
- invalidation condition
- next step
- missing research warning
- target weight/drift

不要直接從 Web 修改研究 note；只顯示 link/path 或 copy action。

---

## Phase 7 — 情境、提醒與 operational maturity

此階段不屬於第一輪 release。

### Task 7.1：Scenario engine

**Files:**

- Create: `lib/analytics/scenarios.ts`
- Create: `app/api/scenarios/route.ts`
- Create: `app/scenarios/page.tsx`
- Tests: `tests/unit/analytics/scenarios.test.ts`
- Tests: `tests/unit/api/scenarios.test.ts`
- Tests: `tests/unit/pages/scenarios.test.tsx`

第一版 scenarios：

- monthly contribution change
- cash allocation change
- portfolio shock −10%/−20%
- loan principal repayment vs investment contribution

每個 scenario 都要標為 modelled/estimated，不得混入 historical confirmed chart。

### Task 7.2：Telegram alerts via external scheduler

不在 Web 內加入 broker/Finance write permission。

**Potential files outside dashboard:**

- host-side script or Hermes cron configuration
- dashboard read-only endpoint only if needed

Alerts：

- market snapshot stale
- data source unavailable
- reconciliation overdue
- needs-review count increased
- allocation drift above configured threshold
- monthly review available

必須有 dedupe、cooldown、unblock/reblock behavior；不要每分鐘重複通知相同警示。

### Task 7.3：Operations and acceptance docs

**Files:**

- Modify: `docs/acceptance-checklist.md`
- Modify: `docs/operations.md`
- Modify: `docs/deployment.md`
- Possibly create: `docs/data-contracts.md`

文件必須包含：

- route reference（包含 `/portfolio/pnl`、`/portfolio/reconciliation`、`/portfolio/research`、`/api/market/snapshot`、`/api/market/intraday`）
- route inventory 由 build output 或 script 產生，並在 CI/acceptance 時檢查 docs 是否漏列 route
- source freshness semantics
- stale/closed/unavailable distinction
- read-only guarantees
- data equation
- test command and actual counts
- local production probe command
- rollback procedure
- market producer/timer verification
- known limitations

---

## 5. 每個 phase 的共同 TDD 與驗證流程

任何會改 production code 的 task，都採：

1. 先寫最小 RED regression。
2. 執行 focused test，確認是 product behavior failure，而不是 test harness crash。
3. 寫最小 GREEN implementation。
4. 執行 focused test。
5. 執行相關 route/page test。
6. 檢查 diff 與 data contract。
7. 再進行同一 phase 的 integration test。

每個 phase checkpoint 執行：

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run build` 必須在其他 Node tests/agents 完成後 serial 執行，避免 `.next` 被並行流程污染。

若有 browser smoke test：

- 使用獨立 port，例如 `PLAYWRIGHT_PORT=4310`
- 預設 `reuseExistingServer=false`
- 只 bind `127.0.0.1`
- browser 未安裝時標註 NOT RUN，不把環境缺失誤判成 product failure

---

## 6. Final acceptance / deployment gate

### 6.1 Local acceptance

在使用者批准 deploy 前：

1. Build production image 或 local production artifact，但不重啟目前 production container。
2. 用非 production port 啟動 local production server。
3. 驗證：
   - `/api/health`
   - `/api/data-status`
   - `/api/overview?range=3M`
   - `/api/growth`
   - `/api/portfolio`
   - `/api/portfolio/reconciliation`
   - `/api/portfolio/performance?range=1Y`
   - `/api/finance/summary?month=YYYY-MM`
   - `/api/market/snapshot`
   - `/api/market/intraday`
4. 檢查 response shape、safe errors、cache headers、provenance、equation consistency。
5. 確認 server port 已釋放。

### 6.2 Safety audit

搜尋並確認：

- `lib/data` 無 INSERT/UPDATE/DELETE/DDL
- 所有 API route 的 error 使用 safe response
- 所有 API route `Cache-Control: private, no-store`
- 無 broker credential、token、password、secret 被送到 browser bundle
- market credential 仍只存在 host producer
- Docker source mounts 維持 `read_only: true`
- 對外仍由 localhost-only container + Cloudflare Access 保護

### 6.3 Production deployment approval boundary

沒有 Oneal 明確批准前，不做：

- `docker compose build` 後重建 production container
- `docker compose up -d`
- 修改 Cloudflare Tunnel/Access
- 修改 systemd timer
- 修改 Finance SQLite
- 修改 Obsidian vault
- 寫入 positions/transactions

批准後才做 deployment：

1. 保留 rollback image/tag。
2. 用 explicit file allowlist 產生 commit。
3. `docker compose build`。
4. `docker compose up -d`。
5. 驗證 container health、localhost binding、read-only mounts。
6. 驗證代表性 API 與 provenance。
7. 驗證 Cloudflare edge；302 到既有 Access login 是 edge success signal。
8. 查 systemd producer/timer 的實際 tick 與 journal，不只看 unit file。
9. 通過後才報告 release complete。

---

## 7. 建議的 commit/checkpoint 邊界

由於目前 worktree 已有未提交修改，正式執行時採 explicit allowlist，每個 checkpoint 各自 review：

1. `docs: add personal wealth upgrade plan`（本計畫；若使用者要求才 commit）
2. `feat: add Taipei time and provenance contracts`
3. `feat: expose unified source freshness`
4. `feat: unify dashboard navigation`
5. `feat: add trusted home decision summary`
6. `fix: reconcile net worth valuation semantics`
7. `feat: add budget and wealth goals`
8. `feat: add cash runway and portfolio drift`
9. `feat: add portfolio risk surface`
10. `docs: refresh acceptance and operations evidence`

每次 commit 前：

```bash
git diff --check
git diff --name-only
# 只 stage 本 task 的 explicit allowlist
git diff --cached --check
git diff --cached --stat
git diff --cached --name-only
```

不得因為要取得 clean worktree 而刪除或整理其他 agent/使用者的修改。

---

## 8. 主要風險、取捨與 open questions

### Risks

- **淨資產 double count：** Finance investment account snapshot 可能已含 broker value；必須先完成 source audit。
- **時間邊界：** server runtime timezone 與 Taipei business date 不一致會污染 monthly/YTD/settlement。
- **stale quote 誤導：** last-known quote 可以用來估值，但必須保留 stale provenance。
- **coverage 過度樂觀：** missing account/snapshot 不應被補成 0。
- **計畫過大：** 第一個 slice 只做 trust layer + home，不把 budget/risk/scenario 一次混入。
- **dirty worktree：** 現有 market layer 與其他修改不可被本計畫覆蓋。
- **UI/API 脫節：** 新 API route 沒有 navigation/page/loading/error/empty state 不算功能完成。

### Open questions to resolve at checkpoints

1. Portfolio investment account 的 balance snapshot 是否已包含持股市值？
2. Net worth historical series 的 canonical snapshot source 要保持 Finance snapshots，還是新增由多來源組成的 valuation snapshot？
3. Budget/goals 的 canonical source 是否採 Obsidian `Finance/Planning/`？
4. Portfolio target allocation 是全 portfolio target，還是只針對股票 bucket？
5. Cash runway 是否只納入已確認 recurring obligations，還是要保留 estimated obligations separately？
6. Scenario output 要不要顯示單一 deterministic projection，還是只做 range/band？
7. Telegram alerts 的接收位置與 cooldown threshold 是否沿用既有 Hermes notification convention？

每個 open question 都要在對應 phase checkpoint 解決，不可默默採用未記錄的假設。

---

## 9. Definition of Done

整個升級 roadmap 完成的必要條件：

- [ ] 所有核心財務數字有 as-of/source/quality/state
- [ ] Asia/Taipei 日期與月份邏輯集中且有 boundary tests
- [ ] 淨資產、有效現金、持股市值、保單淨解約金、負債無 double count
- [ ] confirmed/pending/effective cash 語意清楚
- [ ] 首頁是 decision cockpit，不只是圖表集合
- [ ] Finance budget/goal 對 unknown、zero、no-data、partial 有明確行為
- [ ] cash runway 與 obligations 不把未知當成零
- [ ] portfolio target drift 與 risk surface 有可靠 source coverage
- [ ] navigation 只有單一 canonical source
- [ ] data status 包含 Finance、Obsidian、Market
- [ ] 所有 API 安全錯誤與 `private, no-store` 通過檢查
- [ ] full tests/typecheck/lint/build 通過
- [ ] local production routes 驗證通過
- [ ] docs acceptance evidence 與實際 test/route 數量一致
- [ ] production deployment 另經明確批准並完成 rollback/health/edge/timer 驗證

**Recommended starting point:** 只執行 Phase 0 → Phase 3，先完成第一個 `Trust Layer + Home Decision Cockpit` checkpoint；確認數字語意與首頁 UX 後，再決定是否進入 Phase 4 的淨資產 composition 與 Phase 5 的 goals/budget。