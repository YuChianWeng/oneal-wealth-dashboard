#!/usr/bin/env python3
"""Create shared daily policy-loan investment snapshots for Wealth and Obsidian.

This never writes Finance/Entries or SQLite. It combines the most recently
confirmed Cathay settlement cash with the latest Portfolio market value, writes
one auditable note under Finance/Insurance/Loan Investment Snapshots, and keeps
cash_as_of_date explicit. --backfill creates the approved 2026-06-20 seed plus
historical observations from existing balance entries.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import re
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

VAULT = Path('/home/ubuntu/ObsidianVault')
POLICY = VAULT / 'Finance/Insurance/Policies/SavingsPolicy_2011.md'
ENTRIES = VAULT / 'Finance/Entries'
PORTFOLIO = VAULT / 'Trading/Portfolio/Snapshots'
TRANSACTIONS = VAULT / 'Trading/Portfolio/Transactions'
OUTPUT = VAULT / 'Finance/Insurance/Loan Investment Snapshots'
RAW_BALANCE_LOGS = Path('/home/ubuntu/.hermes/logs/finance/raw')
TZ = ZoneInfo('Asia/Taipei')
_REPO_CALENDAR = Path(__file__).resolve().parents[1] / 'data/market/twse-calendar.json'
_DEFAULT_CALENDAR = (
    _REPO_CALENDAR
    if _REPO_CALENDAR.exists()
    else Path('/home/ubuntu/services/oneal-wealth-dashboard/data/market/twse-calendar.json')
)
TWSE_CALENDAR = Path(os.environ.get('TWSE_CALENDAR_PATH', _DEFAULT_CALENDAR))


def frontmatter(path: Path) -> dict:
    text = path.read_text(encoding='utf-8')
    if not text.startswith('---\n'):
        raise ValueError(f'missing frontmatter: {path.name}')
    end = text.find('\n---', 4)
    if end < 0:
        raise ValueError(f'unterminated frontmatter: {path.name}')
    return yaml.safe_load(text[4:end]) or {}


def num(value, default=0.0):
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def iso(value) -> str:
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()[:10]
    return str(value or '')[:10]


_PUBLIC_SOURCE_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$')


def public_source(value, fallback: str) -> str:
    source = str(value or '').strip()
    return source if _PUBLIC_SOURCE_RE.fullmatch(source) else fallback


def required_iso_date(value, label: str, source: str) -> str:
    """Parse a date-only source value without truncating timestamps or garbage."""
    if isinstance(value, dt.datetime):
        raise ValueError(f'invalid {label} in {source}')
    raw = value.isoformat() if isinstance(value, dt.date) else str(value or '').strip()
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', raw):
        raise ValueError(f'invalid {label} in {source}')
    try:
        parsed = dt.date.fromisoformat(raw)
    except ValueError as exc:
        raise ValueError(f'invalid {label} in {source}') from exc
    if parsed.isoformat() != raw:
        raise ValueError(f'invalid {label} in {source}')
    return raw


def verified_twse_holidays() -> dict[str, set[str]]:
    """Load and validate the canonical checked-in TWSE holiday artifact."""
    try:
        payload = json.loads(TWSE_CALENDAR.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError('verified TWSE calendar is unavailable') from exc
    if (
        not isinstance(payload, dict)
        or payload.get('schemaVersion') != 1
        or payload.get('market') != 'TWSE'
        or payload.get('timezone') != 'Asia/Taipei'
        or not isinstance(payload.get('source'), str)
        or not payload['source']
        or not isinstance(payload.get('holidaysByYear'), dict)
        or not isinstance(payload.get('verifiedYears'), list)
    ):
        raise ValueError('verified TWSE calendar is invalid')

    holidays_by_year: dict[str, set[str]] = {}
    for year, holidays in payload['holidaysByYear'].items():
        if not re.fullmatch(r'\d{4}', str(year)) or not isinstance(holidays, list):
            raise ValueError('verified TWSE calendar is invalid')
        normalized: set[str] = set()
        for holiday in holidays:
            parsed = required_iso_date(holiday, 'holiday', 'TWSE calendar')
            if not parsed.startswith(f'{year}-'):
                raise ValueError('verified TWSE calendar is invalid')
            normalized.add(parsed)
        holidays_by_year[str(year)] = normalized

    verified_years = {str(year) for year in payload['verifiedYears']}
    if verified_years != set(holidays_by_year):
        raise ValueError('verified TWSE calendar is invalid')
    return holidays_by_year


def add_twse_trading_days(date: str, trading_days: int) -> str | None:
    if trading_days < 0:
        return None
    holidays_by_year = verified_twse_holidays()
    if date[:4] not in holidays_by_year:
        return None
    candidate = dt.date.fromisoformat(date)
    remaining = trading_days
    while remaining:
        candidate += dt.timedelta(days=1)
        year = candidate.isoformat()[:4]
        if year not in holidays_by_year:
            return None
        if candidate.weekday() < 5 and candidate.isoformat() not in holidays_by_year[year]:
            remaining -= 1
    return candidate.isoformat()


def policy_config() -> dict:
    fm = frontmatter(POLICY)
    required = ['loan_investment_start_date', 'loan_investment_first_observation_date', 'loan_investment_initial_principal']
    missing = [k for k in required if not fm.get(k)]
    if missing:
        raise ValueError('policy note missing: ' + ', '.join(missing))
    return {
        'start_date': iso(fm['loan_investment_start_date']),
        'first_observation_date': iso(fm['loan_investment_first_observation_date']),
        'principal': num(fm['loan_investment_initial_principal']),
        'benchmark': str(fm.get('loan_investment_benchmark') or '^TWII'),
    }


def entry_notes():
    notes = []
    for path in sorted(ENTRIES.glob('????-??-??.md')):
        try:
            fm = frontmatter(path)
        except Exception:
            continue
        if str(fm.get('type')) != 'balance-entry':
            continue
        date = iso(fm.get('date') or path.stem)
        if date:
            notes.append((date, fm))
    return notes


def latest_confirmed_account_balance(account_key: str, valuation_date: str) -> dict:
    """Return the latest explicit account event, with an auditable fallback.

    Balance notes carry omitted account values forward. Their document date is
    therefore not proof that every account was reconfirmed on that date. Raw
    intake events preserve the exact submitted account map and are authoritative
    for per-account freshness. Older data without raw provenance remains usable,
    but is labelled inferred rather than confirmed.
    """
    explicit = []
    if RAW_BALANCE_LOGS.exists():
        for path in sorted(RAW_BALANCE_LOGS.glob('????-??-??.jsonl')):
            if path.stem > valuation_date:
                continue
            for line in path.read_text(encoding='utf-8').splitlines():
                if not line.strip():
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if event.get('event_type') != 'balance_snapshot':
                    continue
                if event.get('result_status') not in {'created', 'updated'}:
                    continue
                payload = event.get('payload')
                balances = payload.get('balances') if isinstance(payload, dict) else None
                if not isinstance(balances, dict) or account_key not in balances:
                    continue
                try:
                    balance = float(balances[account_key])
                except (TypeError, ValueError):
                    continue
                if not math.isfinite(balance):
                    continue
                timestamp = str(payload.get('timestamp') or event.get('created_at') or '')
                as_of_date = iso(timestamp)
                if not as_of_date or as_of_date > valuation_date:
                    continue
                explicit.append((timestamp, {
                    'balance': balance,
                    'as_of_date': as_of_date,
                    'source': public_source(payload.get('source'), 'finance-raw-event'),
                    'quality': 'confirmed-explicit-event',
                }))
    if explicit:
        return sorted(explicit, key=lambda item: item[0])[-1][1]

    candidates = [
        (date, fm) for date, fm in entry_notes()
        if date <= valuation_date and account_key in fm
    ]
    if not candidates:
        raise ValueError(f'no Finance balance available for {account_key}')
    date, fm = candidates[-1]
    try:
        balance = float(fm[account_key])
    except (TypeError, ValueError) as exc:
        raise ValueError(f'invalid Finance balance for {account_key} on {date}') from exc
    if not math.isfinite(balance):
        raise ValueError(f'invalid Finance balance for {account_key} on {date}')
    return {
        'balance': balance,
        'as_of_date': date,
        'source': public_source(fm.get('source'), 'balance-entry'),
        'quality': 'inferred-from-balance-entry',
    }


def pending_trade_cash_adjustment(cash_as_of: str, valuation_date: str) -> tuple[float, int]:
    """Return unsettled brokerage cash value after the confirmed cash snapshot.

    Transaction notes are parsed fail-closed. Aliases match the TypeScript
    repository, and malformed dates, sides, or cashflows abort the snapshot
    instead of producing a plausible partial NAV.
    """
    adjustment = 0.0
    count = 0
    seen_transactions: set[tuple] = set()
    if not TRANSACTIONS.exists():
        return adjustment, count

    def first_value(fm: dict, *keys: str):
        for key in keys:
            value = fm.get(key)
            if value is not None and value != '':
                return value
        return None

    def finite_number(value, label: str, filename: str, *, required: bool):
        if value is None or (isinstance(value, str) and not value.strip()):
            if required:
                raise ValueError(f'missing {label} in transaction {filename}')
            return None
        try:
            parsed = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f'invalid {label} in transaction {filename}') from exc
        if not math.isfinite(parsed):
            raise ValueError(f'invalid {label} in transaction {filename}')
        return parsed

    def required_cashflow(value, filename: str) -> float:
        parsed = finite_number(value, 'net cashflow', filename, required=True)
        assert parsed is not None
        if parsed == 0:
            raise ValueError(f'invalid net cashflow in transaction {filename}')
        return parsed

    for path in sorted(TRANSACTIONS.glob('*.md')):
        try:
            fm = frontmatter(path)
        except Exception as exc:
            raise ValueError(f'invalid transaction frontmatter: {path.name}') from exc
        if str(fm.get('type') or '').lower() != 'transaction':
            continue

        trade_date = required_iso_date(
            first_value(fm, 'tradeDate', 'trade-date', 'trade_date', 'date'),
            'trade date',
            f'transaction {path.name}',
        )
        raw_settlement = first_value(
            fm, 'settlementDate', 'settlement-date', 'settlement_date'
        )
        if raw_settlement is None:
            settlement_date = None
            coverage_date = add_twse_trading_days(trade_date, 2)
            if coverage_date is None:
                raise ValueError(
                    f'missing settlement date without verified TWSE calendar coverage in {path.name}'
                )
        else:
            settlement_date = required_iso_date(
                raw_settlement,
                'settlement date',
                f'transaction {path.name}',
            )
            if settlement_date < trade_date:
                raise ValueError(f'settlement date precedes trade date in {path.name}')
            coverage_date = settlement_date

        side = str(first_value(fm, 'side', 'Side') or '').strip().lower()
        if side not in {'buy', 'sell'}:
            raise ValueError(f'invalid side in transaction {path.name}')
        symbol = str(first_value(fm, 'symbol', 'ticker', 'Symbol') or '').strip()
        if not symbol:
            raise ValueError(f'missing symbol in transaction {path.name}')
        shares = finite_number(
            first_value(fm, 'shares', 'Shares'), 'shares', path.name, required=True
        )
        price = finite_number(
            first_value(fm, 'price', 'Price'), 'price', path.name, required=True
        )
        gross_amount = finite_number(
            first_value(fm, 'grossAmount', 'gross-amount', 'gross_amount'),
            'gross amount', path.name, required=False,
        )
        fee_tax = finite_number(
            first_value(fm, 'feeTax', 'fee-tax', 'fee_tax'),
            'fee tax', path.name, required=False,
        )
        raw_cashflow = required_cashflow(
            first_value(fm, 'netCashflow', 'net-cashflow', 'net_cashflow'),
            path.name,
        )

        order_id = str(
            first_value(fm, 'orderId', 'order-id', 'order_id') or ''
        ).strip()
        if order_id:
            identity = (
                'order',
                str(first_value(fm, 'broker', 'Broker') or 'unknown').strip().lower(),
                order_id,
            )
        else:
            identity = (
                'trade',
                trade_date,
                symbol,
                side,
                shares,
                price,
                gross_amount,
                fee_tax,
                raw_cashflow,
                settlement_date or '',
            )
        if identity in seen_transactions:
            raise ValueError(f'duplicate transaction: {path.name}')
        seen_transactions.add(identity)

        if trade_date > valuation_date or cash_as_of >= coverage_date:
            continue
        adjustment += abs(raw_cashflow) if side == 'sell' else -abs(raw_cashflow)
        count += 1
    return adjustment, count


def portfolio_notes():
    notes = []
    for path in sorted(PORTFOLIO.glob('????-??-??.md')):
        try:
            fm = frontmatter(path)
        except Exception:
            continue
        if str(fm.get('type')) != 'portfolio-snapshot':
            continue
        date = iso(fm.get('date') or path.stem)
        if date and num(fm.get('benchmark_close')) > 0:
            notes.append((date, fm))
    return notes


def benchmark_at(date: str, notes: list[tuple[str, dict]]):
    candidates = [(d, fm) for d, fm in notes if d <= date]
    if not candidates:
        raise ValueError(f'no TAIEX snapshot on or before {date}')
    d, fm = candidates[-1]
    return num(fm['benchmark_close']), d


def write_snapshot(*, date: str, principal: float, strategy_value: float, cash_balance: float | None,
                   cash_as_of: str | None, pending_trade_cash: float, pending_trade_count: int,
                   effective_cash_value: float | None, brokerage_value: float | None, benchmark_close: float,
                   benchmark_snapshot_date: str, benchmark_ticker: str, is_seed: bool, dry_run: bool,
                   cash_as_of_source: str | None = None, cash_as_of_quality: str | None = None):
    return_pct = (strategy_value / principal - 1) * 100 if principal else 0
    safe_cash_as_of_source = public_source(cash_as_of_source, 'unavailable')
    path = OUTPUT / f'{date}.md'
    content = f'''---
type: loan-investment-snapshot
date: {date}
currency: TWD
initial_principal: {principal:.2f}
strategy_value: {strategy_value:.2f}
strategy_return_pct: {return_pct:.6f}
cash_balance: {cash_balance if cash_balance is not None else 'null'}
cash_as_of_date: {cash_as_of or 'null'}
cash_as_of_source: "{safe_cash_as_of_source}"
cash_as_of_quality: "{cash_as_of_quality or 'unavailable'}"
pending_trade_cash_adjustment: {pending_trade_cash}
pending_trade_count: {pending_trade_count}
effective_cash_value: {effective_cash_value if effective_cash_value is not None else 'null'}
brokerage_market_value: {brokerage_value if brokerage_value is not None else 'null'}
benchmark_ticker: "{benchmark_ticker}"
benchmark_close: {benchmark_close:.4f}
benchmark_snapshot_date: {benchmark_snapshot_date}
is_seed: "{'true' if is_seed else 'false'}"
source: "loan-investment-snapshot"
---
# 🏦 保單借款投資快照 {date}

- 策略資產：TWD {strategy_value:,.0f}
- 起始本金：TWD {principal:,.0f}
- 累積報酬：{return_pct:+.2f}%
- 國泰投資交割戶已確認現金：{'TWD ' + format(cash_balance, ',.0f') if cash_balance is not None else '起始點，不拆分'}（截至 {cash_as_of or '—'}）
- 現金來源／品質：{safe_cash_as_of_source}／{cash_as_of_quality or 'unavailable'}
- 未交割交易應收／應付：{'TWD ' + format(pending_trade_cash, '+,.0f')}（{pending_trade_count} 筆）
- 有效現金價值：{'TWD ' + format(effective_cash_value, ',.0f') if effective_cash_value is not None else '起始點，不拆分'}
- 股票市值：{'TWD ' + format(brokerage_value, ',.0f') if brokerage_value is not None else '起始點，不拆分'}
- TAIEX：{benchmark_close:,.2f}（Portfolio snapshot {benchmark_snapshot_date}）

> 策略資產 = 已確認的國泰投資交割戶現金 + 現金日期後交易的未交割應收／應付 + 股票市值。Finance 真實餘額不會被估算值覆寫。
'''
    if dry_run:
        print(f'DRY-RUN {path}: strategy={strategy_value:.2f} cash_as_of={cash_as_of} cash_source={cash_as_of_source} cash_quality={cash_as_of_quality} pending_trade_cash={pending_trade_cash:.2f} pending_trade_count={pending_trade_count} brokerage={brokerage_value} benchmark={benchmark_close:.4f}')
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding='utf-8')
        print(f'Loan investment snapshot updated: {path} strategy={strategy_value:.2f} cash_as_of={cash_as_of}')


def backfill(config: dict, dry_run: bool):
    benchmarks = portfolio_notes()
    base_close, base_date = benchmark_at(config['start_date'], benchmarks)
    write_snapshot(date=config['start_date'], principal=config['principal'], strategy_value=config['principal'],
                   cash_balance=None, cash_as_of=None, pending_trade_cash=0.0, pending_trade_count=0,
                   effective_cash_value=None, brokerage_value=None, benchmark_close=base_close,
                   benchmark_snapshot_date=base_date, benchmark_ticker=config['benchmark'], is_seed=True,
                   dry_run=dry_run, cash_as_of_source='unavailable', cash_as_of_quality='unavailable')
    for date, fm in entry_notes():
        if date < config['first_observation_date']:
            continue
        cash = num(fm.get('CathayBank'))
        brokerage = num(fm.get('Brokerage'))
        close, benchmark_date = benchmark_at(date, benchmarks)
        write_snapshot(date=date, principal=config['principal'], strategy_value=cash + brokerage,
                       cash_balance=cash, cash_as_of=date, pending_trade_cash=0.0, pending_trade_count=0,
                       effective_cash_value=cash, brokerage_value=brokerage, benchmark_close=close,
                       benchmark_snapshot_date=benchmark_date, benchmark_ticker=config['benchmark'],
                       is_seed=False, dry_run=dry_run,
                       cash_as_of_source=str(fm.get('source') or 'balance-entry'),
                       cash_as_of_quality='inferred-from-balance-entry')


def daily(config: dict, date: str, dry_run: bool):
    portfolio_path = PORTFOLIO / f'{date}.md'
    if not portfolio_path.exists():
        print(f'SKIP no same-day portfolio snapshot: {portfolio_path}')
        return
    portfolio_fm = frontmatter(portfolio_path)
    brokerage = num(portfolio_fm.get('market_value'))
    benchmark = num(portfolio_fm.get('benchmark_close'))
    if brokerage <= 0 or benchmark <= 0:
        raise ValueError('same-day portfolio snapshot lacks market_value or benchmark_close')
    cash_state = latest_confirmed_account_balance('CathayBank', date)
    cash_date = cash_state['as_of_date']
    cash = cash_state['balance']
    pending_trade_cash, pending_trade_count = pending_trade_cash_adjustment(cash_date, date)
    effective_cash = cash + pending_trade_cash
    write_snapshot(date=date, principal=config['principal'], strategy_value=effective_cash + brokerage,
                   cash_balance=cash, cash_as_of=cash_date, pending_trade_cash=pending_trade_cash,
                   pending_trade_count=pending_trade_count, effective_cash_value=effective_cash,
                   brokerage_value=brokerage, benchmark_close=benchmark,
                   benchmark_snapshot_date=iso(portfolio_fm.get('date') or date), benchmark_ticker=config['benchmark'],
                   is_seed=False, dry_run=dry_run, cash_as_of_source=cash_state['source'],
                   cash_as_of_quality=cash_state['quality'])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--backfill', action='store_true')
    parser.add_argument('--date', help='YYYY-MM-DD; default today Asia/Taipei')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    config = policy_config()
    if args.backfill:
        backfill(config, args.dry_run)
    else:
        date = args.date or dt.datetime.now(TZ).date().isoformat()
        daily(config, date, args.dry_run)

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        raise SystemExit(1)
