# Wealth Dashboard：資料可視化與研究顯示改善計畫

## 目標

在不寫入 Finance SQLite 或 Obsidian Vault、維持 Dashboard 完全唯讀與 Cloudflare Access 保護的前提下，完成以下四項可見性改善：

1. 修正首頁「淨資產成長」圖 Y 軸全顯示 `0K`。
2. 在「收支分析」與從「月度回顧」進入的月份頁，顯示該月每一筆收入／支出明細（保留現有帳戶與分類彙總）。
3. 讓個股詳情頁確實讀出既有 Obsidian `Trading/Stocks/*.md` 的研究內容。
4. 在「績效比較」清楚顯示外部現金流審計資料與 Modified Dietz 計算說明。

## 已確認的現況與根因

### A. 首頁淨資產圖 Y 軸 `0K`

- `components/overview/line-chart.tsx` 使用 `portfolioIndex`、`benchmarkIndex` 畫線。
- 這些值是標準化績效指數（基準約 `100`），而 `tickLabel()` 以貨幣單位格式化：
  - 小於一百萬 → `Math.round(v / 1_000) + "K"`
  - 所以 `100` 顯示成 `0K`。
- 首頁標題卻是「淨資產成長」，需求上應呈現新台幣淨資產，而非投資報酬指數。

### B. 收支頁沒有逐筆交易

- `app/finance/finance-page.tsx` 目前只使用 `useMonthlySummary(month)`，呈現 KPI、支出分類與帳戶彙總。
- 現有基礎設施已具備：
  - `lib/hooks/use-finance.ts` 的 `useTransactions(month, page, pageSize, category, account)`；
  - `app/api/finance/transactions/route.ts`；
  - `TransactionRow` schema 含日期、項目、金額、帳戶、分類、交易類型、商家與備註。
- API route 對 category/account filter 是在 pagination 後才過濾；這在多頁資料時會導致 filter 的 total 與頁碼不可靠，實作前應先改為 repository/SQL 層 filter 再 pagination。

### C. 個股研究看似空白

- Vault 中目前有 25 個 `Trading/Stocks/*.md` 研究 note。
- `lib/data/research-repository.ts` 目前只匹配英文標題：`## Thesis`、`## Catalyst`、`## Risk`、`## Invalidation`、`## Next Step/Action`。
- 個股詳情 UI (`app/portfolio/[symbol]/page.tsx`) 已能呈現 thesis/catalysts/risks/invalidation/nextStep；問題較可能在 repository 的 heading / frontmatter 相容性，而非 UI 缺失。
- 需要先對實際 note 做只讀樣本盤點，確認：
  - 中文或混合語言 heading 名稱；
  - frontmatter date 是否為 YAML `Date` object；
  - `source_checked` / `last_updated` / conviction 等 canonical snake_case 欄位；
  - 是否有部分持倉沒有對應研究 note（此情況應顯示可理解的空狀態，不偽稱資料錯誤）。

### D. 外部現金流審計未顯示

- `lib/analytics/portfolio-performance.ts` 已實作 Modified Dietz chain-linked return：
  `rᵢ = (Mᵢ − Mᵢ₋₁ − Cᵢ) / (Mᵢ₋₁ + Cᵢ/2)`。
- `lib/data/portfolio-repository.ts` 已讀取 snapshot 的 `external_cash_flow`、`market_value` 與 `benchmark_close`。
- `app/portfolio/performance/page.tsx` 目前只收到 dates、index 與 raw market value；外部現金流未被 API 回傳，因此無法審計或呈現說明。

---

## 先決原則

- Dashboard 僅讀取 `/home/ubuntu/data/finance/finance.db` 與 `/home/ubuntu/ObsidianVault`；不寫入資料庫與 Vault。
- 所有 API 維持 `Cache-Control: private, no-store`，錯誤維持 `toSafeResponse()`。
- 不以推測值補資料：缺研究 note、缺 benchmark、缺現金流時要清楚呈現狀態。
- 不將淨資產金額、投資組合市值與標準化績效指數混在同一資料型別或圖表 formatter。

---

## 分段實作計畫與驗證關卡

### Checkpoint 0：建立資料基線與 UI contract（只讀）

**輸入**
- Finance SQLite 的 balance snapshots / transactions。
- Vault 的 36 份 portfolio snapshots、52 筆交易、25 份 stock research notes。

**作業**
1. 以唯讀查詢記錄首頁各 range 的 net-worth point 數量、最小值、最大值、第一／最後日期。
2. 盤點至少 3 份研究 note 的 frontmatter 與二級 heading，建立 canonical heading alias 對照表。
3. 列出指定月份（先用 2026-06）所有 Finance transaction，確認收入／支出／投資結算／貸款還款的顯示規則。
4. 彙整 snapshot 中所有非零 `external_cash_flow`，確認正負號與日期語義；對照 reconciliation 記錄日與 estimated status。

**輸出**
- 不含敏感內容的測試 fixture / assertion 需求清單。
- 明確 UI contract：
  - 淨資產圖使用 TWD；
  - 投資績效圖使用 100-based index；
  - 現金流 audit 使用原始 TWD 與資料品質旗標。

**成功條件**
- 每一項顯示需求均有可驗證的真實 source 欄位。

**停止／決策點**
- 若研究 notes 的 heading 格式跨多種且無法可靠歸類，先提出 alias 表供確認，不直接猜測分類。

---

### Checkpoint 1：修正首頁淨資產圖（第一個實作切片）

**最小可交付範圍**
- 首頁「淨資產成長」正確顯示 TWD 金額、非零 Y 軸與 tooltip。
- 投資績效頁維持既有 100-based 指數語意，不受首頁變動影響。

**不包含**
- 收支逐筆表、研究 parser、外部現金流 audit UI。

**實作步驟**
1. 查明 overview API 建構 `performanceChart` 的位置與目前資料來源。
2. 新增明確的 `NetWorthChartData` view model（例如 `dates`, `netWorth`, 可選 assets/liabilities），不要重用 `PerformanceChartData`。
3. 調整 overview API：首頁回傳真正的 `balance_snapshots.net_worth` 序列；range filter 依 Asia/Taipei 日期處理。
4. 將 `components/overview/line-chart.tsx` 分拆為：
   - 可宣告資料語意的通用 chart primitive，或
   - `NetWorthLineChart` + 保留投資績效圖的獨立 formatter。
5. Y 軸金額 formatter：
   - `< 10,000` 顯示 `NT$1,234`；
   - `>= 10,000` 顯示 `NT$12.3萬`；
   - `>= 1,000,000` 顯示 `NT$123.4萬` 或統一中文萬單位；
   - tooltip 永遠顯示完整 `formatTWD()`。
6. 加入 0 值與單一點資料的 defensive handling，避免 `hi === lo` 導致 NaN 或重複 tick。

**可能修改檔案**
- `lib/analytics/types.ts`
- overview API 的 composition / route（以實際搜尋結果為準）
- `app/api/overview/route.ts`
- `app/page.tsx`
- `components/overview/line-chart.tsx`（或新增 `net-worth-line-chart.tsx`）
- 對應 analytics / component tests。

**驗證**
- Unit：currency tick formatter、非零／負淨資產／單一點 edge cases。
- API：overview 在 `3M` / `All` 回傳 TWD net worth，不是 100-based index。
- Browser：Y 軸不再有全 `0K`；hover 數字與 Finance balance snapshots 相符。

**成功條件**
- 2026-05 至 2026-07 的 Y 軸至少有兩個不同且合理的 TWD label。

---

### Checkpoint 2：Finance 月份逐筆收支清單

**實作步驟**
1. 擴充 `transactionsPage()`／`finance-repository`，在 SQL 層處理：month、category、account filter、總筆數、排序與 offset/limit。
2. 保持投資 bucket 排除的現有 Finance UX 語意；清楚定義是否顯示 `investment_settlement`：
   - 預設「生活收支」不混入投資結算；
   - 可用 type filter 顯示全部／收入／支出／投資／貸款。
3. 將 API query schema 增加 `type`（若現有 repository 支援），確保 filter 先於 pagination。
4. 在 `app/finance/finance-page.tsx` 使用既有 `useTransactions()`，新增「本月收支明細」Card：
   - 日期、項目、分類、帳戶、收入/支出金額；
   - merchant / note 有值才顯示；
   - 類型 chip（收入、支出、投資結算、貸款利息、本金還款）；
   - 預設最新日期在前；
   - 分頁與每頁 20/50 筆；
   - category/account/type filter；
   - loading、empty、error state。
5. 保持 URL month 作為唯一月份來源，讓月度回顧 `href=/finance?month=YYYY-MM` 自然帶出同一份逐筆明細。
6. 更新 Reviews 文案為「收支明細、分類與帳戶分析」，不需新增另一份 review data page。

**可能修改檔案**
- `lib/data/finance-repository.ts`
- `lib/data/finance-queries.ts`（若 query 層在此）
- `app/api/finance/transactions/route.ts`
- `lib/hooks/use-finance.ts`
- `app/finance/finance-page.tsx`
- 可新增 `components/finance/transaction-table.tsx`
- `tests/unit/data/finance-repository.test.ts`
- API route / component tests。

**驗證**
- API：`/api/finance/transactions?month=2026-06&page=1&pageSize=...` total 與 SQLite 讀值一致。
- API：category/account/type filter 跨頁的 `total` 正確。
- UI：從 2026-06 月度回顧點入後，KPI、分類、帳戶、每筆交易均為 2026-06。
- Read-only regression：對 Finance DB 執行 `PRAGMA query_only`／mutation guard，確認無寫入。

**成功條件**
- 使用者可在收支頁與任何月度回顧進入頁查到該月所有收入／支出交易，且可分頁及篩選。

---

### Checkpoint 3：個股研究 note parser 與詳情頁可視化

**實作步驟**
1. 先對 25 份真實 research notes 建立 heading / frontmatter matrix（只讀）。
2. 擴充 `SECTION_HEADINGS` 支援確認過的繁中與英文 aliases，例如：
   - thesis：`投資論點`、`投資假設`、`核心觀點`；
   - catalysts：`催化劑`、`利多`；
   - risks：`風險`、`風險因素`；
   - invalidation：`失效條件`、`反方觀點`；
   - next step：`下一步`、`追蹤事項`、`行動項目`。
3. 實作共用 YAML date 正規化，支援字串與 YAML `Date`，並映射 canonical snake_case：
   - `source_checked` / `sourceChecked`；
   - `last_updated` / `lastUpdated`；
   - `status`, `sector`, `theme`, `conviction`。
4. 將 `ResearchSummarySchema` validation 與 parser 對齊；日期無法驗證時回傳 null 或省略，而不是令整份研究失敗。
5. 檢查 detail API 對「沒有 research note」與「research note 格式不完整」的區別：
   - 無 note → 正常空狀態；
   - 解析失敗 → 安全錯誤／data status warning（不洩漏 note body）。
6. 在 `app/portfolio/[symbol]/page.tsx` 增加研究 metadata 顯示：狀態、信心、產業、主題、最後更新／資料檢查日；各 section 僅在有內容時顯示。

**可能修改檔案**
- `lib/data/research-repository.ts`
- `lib/schemas/research.ts`
- `app/api/portfolio/[symbol]/route.ts`
- `app/portfolio/[symbol]/page.tsx`
- `tests/unit/data/research-repository.test.ts`
- `tests/unit/schemas/research.test.ts`
- 可新增真實格式但去識別化的 Vault fixtures。

**驗證**
- Repository tests：英文、中文、snake_case、YAML Date、缺 section、缺 note。
- API：至少三個既有 symbol 回傳非空 research section，無 note 的 symbol 回傳 `research: null`。
- UI：個股 detail 能顯示論點／催化劑／風險等已存在內容，不改寫 Obsidian note。

**成功條件**
- 已有研究筆記的持倉，不再全部顯示「尚無研究筆記」。

---

### Checkpoint 4：績效頁外部現金流審計與計算說明

**實作步驟**
1. 設計明確、可審計的 `PerformanceAudit` API view model：
   - 計算方法版本（`modified-dietz-chain-linked-v1`）；
   - period count；
   - range 內外部現金流淨額、流入、流出；
   - 非零 cash-flow event：日期、金額、snapshot market value、資料品質／estimated flag（若 source 提供）；
   - benchmark availability、benchmark ticker（有資料才顯示）。
2. 不將 transaction 買賣自動當 external cash flow；只使用 snapshot 已記錄的 `external_cash_flow`，避免重複扣除。
3. 在 performance API 以同一 range filter 取得 series 與 audit，確保圖表、KPI、audit 日期一致。
4. 在 `app/portfolio/performance/page.tsx` 新增：
   - 方法說明 Card：以使用者提供的中文說明為主，但改成可驗證的精確文字；
   - audit KPI：期間外部流入、流出、淨額、事件數；
   - audit table：日期、外部現金流、snapshot 市值、是否 estimated／資料品質；
   - 若 range 無外部流量，顯示「本期間未記錄外部現金流」而非隱藏整個 section。
5. 將「績效指數」與「市值」圖表 axis/tooltip 明確標示，避免使用者把 index 100 當 TWD。

**可能修改檔案**
- `lib/analytics/types.ts`
- `lib/analytics/portfolio-performance.ts`
- `lib/data/portfolio-repository.ts`
- `app/api/portfolio/performance/route.ts`
- `app/portfolio/performance/page.tsx`
- `tests/unit/analytics/portfolio-performance.test.ts`
- `tests/unit/data/portfolio-repository.test.ts`
- API route tests。

**驗證**
- Unit：正、負、零 external cash flow；零分母；missing benchmark；estimated reconciliation flow。
- API：audit net flow 等於 range 內 snapshot `external_cash_flow` 加總。
- UI：使用者提供的 Modified Dietz 說明可見；audit 明細可見且與原始 snapshot 相符。

**成功條件**
- 能回答「某期間報酬是否被入金／出金扭曲？」並以日期與金額佐證。

---

### Checkpoint 5：整合品質與正式部署

**實作步驟**
1. Prettier、ESLint、TypeScript、Vitest、production build。
2. 增加／更新 Playwright 覆蓋：
   - 首頁 TWD Y 軸；
   - Finance 的指定月逐筆清單；
   - 月度回顧進入後 month persistence；
   - 已有 research 的個股 detail；
   - performance audit 可見。
3. Docker normal build、container recreate、health check。
4. 正式 localhost API 檢查：overview、finance summary/transactions、portfolio symbol、portfolio performance。
5. 確認 container mounts 仍為 readonly、host port 仍僅 `127.0.0.1:3003`，Cloudflare Access 未授權仍 302。
6. 只在 Docker Hub 可用時用正常 Dockerfile full rebuild；若 registry 暫時故障，需在部署記錄明確標示使用的 verified fallback 與後續 full rebuild 重試需求。

**成功條件**
- 全部測試與 build 通過。
- 真實來源資料在正式 API / UI 可見。
- 無對 Finance DB 或 Vault 的寫入。

---

## 優先順序與依賴

1. **Checkpoint 1**（首頁圖）— 獨立、最小、直接修正目前最明顯問題。
2. **Checkpoint 2**（收支明細）— 使用既有 API/hook，資料流程最完整。
3. **Checkpoint 3**（個股研究）— 先盤點真實 note 格式後再實作 parser aliases。
4. **Checkpoint 4**（外部現金流 audit）— 依賴正確 snapshot mapping，現已具備基礎。
5. **Checkpoint 5**（整合）— 每個 checkpoint 完成時先局部驗證，最後才做完整部署。

## 主要風險與取捨

- **淨資產與績效的概念混淆**：以分開型別、圖表與 formatter 解決，不靠 `boolean` 改顯示單位。
- **Finance filter pagination 不正確**：必須先把 filter 下推到 DB query，再加入 UI filter；不能在取得一頁後 client filter。
- **研究筆記格式不一致**：先盤點真實 heading，再只支援明確 alias；不應把整份 note body 未經選擇地回傳到 API。
- **對帳回補資料**：以 `estimated` / data quality 清楚標示，audit 使用記錄日但不偽稱為實際成交日。
- **外部現金流誤解**：只用 snapshots 的明確欄位，不從一般買賣交易推導，避免 double counting。
- **Docker registry 暫時不穩**：正式 release 仍以正常 Dockerfile full build 為標準，offline image replacement 僅為已 build 產物的可追溯緊急 fallback。

## 開始實作前的唯一確認事項

目前不需要阻塞式確認。實作時只要 Checkpoint 0 發現研究 note 標題存在無法自動歸類的新語意，就先回報 alias 對照表供確認，再繼續 parser 擴充。
