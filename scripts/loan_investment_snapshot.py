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
                    'source': str(payload.get('source') or 'finance-raw-event'),
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
        'source': str(fm.get('source') or 'balance-entry'),
        'quality': 'inferred-from-balance-entry',
    }


def pending_trade_cash_adjustment(cash_as_of: str, valuation_date: str) -> tuple[float, int]:
    """Return unsettled brokerage cash value after the confirmed cash snapshot.

    Position notes reflect a trade on trade date, while the confirmed Cathay
    settlement-account balance may lag until settlement or the next manual
    balance entry. For strategy NAV, a sell becomes a receivable and a buy
    becomes a payable on trade date. A confirmed cash balance clears a trade
    only on or after its settlement date; older notes without settlement_date
    conservatively fall back to trade date.
    """
    adjustment = 0.0
    count = 0
    if not TRANSACTIONS.exists():
        return adjustment, count

    for path in sorted(TRANSACTIONS.glob('*.md')):
        try:
            fm = frontmatter(path)
        except Exception as exc:
            print(f'WARN: skipping transaction with invalid frontmatter {path}: {exc}', file=sys.stderr)
            continue
        if str(fm.get('type') or '') != 'transaction':
            continue
        trade_date = iso(fm.get('trade_date') or fm.get('date'))
        if not trade_date or trade_date > valuation_date:
            continue
        settlement_date = iso(fm.get('settlement_date'))
        coverage_date = (
            settlement_date
            if settlement_date and settlement_date >= trade_date
            else trade_date
        )
        if cash_as_of >= coverage_date:
            continue
        side = str(fm.get('side') or '').strip().lower()
        raw_cashflow = num(fm.get('net_cashflow'))
        if side in {'buy', '現買', 'b'}:
            adjustment -= abs(raw_cashflow)
        elif side in {'sell', '現賣', 's'}:
            adjustment += abs(raw_cashflow)
        else:
            continue
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
cash_as_of_source: "{cash_as_of_source or 'unavailable'}"
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
- 現金來源／品質：{cash_as_of_source or '—'}／{cash_as_of_quality or 'unavailable'}
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
