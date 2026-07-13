# Operations Runbook

Day-to-day procedures for the Oneal Wealth Dashboard production deployment.

## Health Check

```bash
# Basic liveness
curl -fsS http://localhost:3003/api/health
# → {"version":1,"data":{"status":"ok","timestamp":"2026-07-11T15:36:40.950Z"}}

# Full dashboard availability
curl -s -o /dev/null -w "%{http_code}" http://localhost:3003/
# → 200
```

## Container Management

All commands run from the project root (`/home/ubuntu/services/oneal-wealth-dashboard`).

| Action | Command |
|--------|---------|
| **Start** | `docker compose up -d` |
| **Stop** | `docker compose stop` |
| **Restart** | `docker compose restart` |
| **Stop & remove** | `docker compose down` |
| **Rebuild after code change** | `docker compose up -d --build` |
| **View logs (recent)** | `docker compose logs --tail=100` |
| **Follow logs** | `docker compose logs -f` |
| **Check container status** | `docker compose ps` |
| **Shell into container** | `docker compose exec dashboard sh` |

## Source Freshness Check

Visit `/settings/data-status` or call the API:

```bash
curl -s http://localhost:3003/api/data-status | python3 -m json.tool
```

This returns a health report for each data source (finance DB, Obsidian vault) including:
- Whether the source is available
- Last-modified timestamp
- Row counts where applicable

## Rollback

```bash
# 1. Stop and remove the container
docker compose down

# 2. Checkout the previous commit
git checkout <previous-commit-sha>

# 3. Rebuild and start
docker compose up -d --build

# 4. Verify health
curl -fsS http://localhost:3003/api/health
```

## Viewing Routes

| Route | Purpose |
|-------|---------|
| `/` | Dashboard homepage (KPIs, allocation, cashflow) |
| `/finance` | Finance overview |
| `/finance/accounts` | Account balances and summaries |
| `/finance/reviews` | Periodic review history |
| `/portfolio` | All portfolio positions |
| `/portfolio/2330.TW` | Single position detail |
| `/portfolio/transactions` | Trade transaction ledger |
| `/portfolio/performance` | Performance charts |
| `/growth` | Net worth growth over time |
| `/insights` | Computed financial insights |
| `/settings/data-status` | Source data health report |

## Troubleshooting

### Container won't start
```bash
# Check logs for errors
docker compose logs --tail=50

# Common issues:
# - FINANCE_DB_PATH not set → data source will be unavailable but app still starts
# - OBSIDIAN_VAULT_PATH not set → vault data unavailable but app still starts
# - Port 3003 already in use → check with `ss -tlnp | grep 3003`
```

### Data sources unavailable
The dashboard degrades gracefully when data sources are missing:
- Missing finance DB: finance pages show "no data" states
- Missing vault: portfolio pages show "no data" states
- Health endpoint still returns 200 regardless

### API returns 400
Finance routes (`/api/finance/summary`, `/api/finance/transactions`) require query parameters:
```bash
# Correct:
curl "http://localhost:3003/api/finance/summary?month=2026-07"

# Incorrect (returns 400 VALIDATION_ERROR):
curl "http://localhost:3003/api/finance/summary"
```

### Cloudflare Tunnel down
The dashboard is bound to `127.0.0.1` only. If `wealth.onealweng.com` is unreachable:
```bash
# Check cloudflared is running
systemctl status cloudflared

# Restart if needed
sudo systemctl restart cloudflared
```

See [cloudflare-access-handoff.md](cloudflare-access-handoff.md) for tunnel setup details.

## Data Safety

- **All Docker mounts are read-only.** The container cannot modify source data.
- **No write APIs exist.** Every route is GET-only and data access is read-only.
- **No credentials in the image.** Secrets live in `.env.production` (git-ignored).
- **Localhost-only binding.** The container port is `127.0.0.1:3003` — not reachable from the network without a tunnel.

## Policy-loan investment financing cost

The policy note may provide an auditable accrued-interest baseline for the loan-funded investment strategy:

```yaml
loan_investment_interest_baseline_date: 2026-06-20
loan_investment_interest_baseline_amount: <confirmed insurer amount>
```

Both fields are required as a pair. Missing, partial, negative, or otherwise invalid baseline data must not be estimated. The repository reports `financingCostStatus: needs-review`, and the dashboard hides the net-return value until the source is confirmed.

The attributable strategy financing cost is:

```text
interest payments safely linked to the strategy since its start
+ current accrued policy-loan interest
+ current estimated daily adjustment
- confirmed interest baseline amount
```

Accounting boundaries:

- The TWD 200,000 principal is the strategy's capital base and is never subtracted from strategy value a second time.
- Interest accrued before the baseline date is excluded by the baseline subtraction.
- Policy `net_surrender_value` remains the canonical net-worth asset value. Financing cost is a strategy-economics metric, not another balance-sheet deduction.
- Unlinked or ambiguous `loan_interest_payment` transactions force `needs-review`; they are not guessed or silently treated as zero.
- No production policy note receives these baseline fields until the date and insurer-confirmed amount pass the Phase 1 decision checkpoint.

## Monitoring

The Docker Compose healthcheck runs every 30s:
```yaml
healthcheck:
  test: ["CMD-SHELL", "curl -fsS http://localhost:3003/api/health || exit 1"]
  interval: 30s
  timeout: 5s
  start_period: 15s
  retries: 3
```

Check container health:
```bash
docker compose ps
# Look for "(healthy)" in the STATUS column
```
