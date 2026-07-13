#!/usr/bin/env python3
"""Regression tests for policy-loan investment snapshot cash reconciliation."""
from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("loan_investment_snapshot.py")
SPEC = importlib.util.spec_from_file_location("loan_investment_snapshot", SCRIPT)
assert SPEC and SPEC.loader
snapshot = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(snapshot)


def write_trade(
    directory: Path,
    filename: str,
    *,
    trade_date: str,
    side: str,
    net_cashflow: float,
    settlement_date: str | None = None,
    note_type: str = "transaction",
) -> None:
    settlement_line = (
        f"settlement_date: '{settlement_date}'\n" if settlement_date else ""
    )
    (directory / filename).write_text(
        "---\n"
        f"type: {note_type}\n"
        f"trade_date: '{trade_date}'\n"
        f"side: {side}\n"
        f"net_cashflow: {net_cashflow}\n"
        f"{settlement_line}"
        "---\n"
        "# fixture\n",
        encoding="utf-8",
    )


class PendingTradeCashAdjustmentTests(unittest.TestCase):
    def test_sell_after_confirmed_cash_date_becomes_receivable(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            trades = Path(tmp)
            write_trade(
                trades,
                "sell.md",
                trade_date="2026-07-13",
                side="sell",
                net_cashflow=8743,
            )
            with patch.object(snapshot, "TRANSACTIONS", trades):
                adjustment, count = snapshot.pending_trade_cash_adjustment(
                    "2026-07-12", "2026-07-13"
                )
            self.assertEqual(adjustment, 8743)
            self.assertEqual(count, 1)

    def test_buy_is_payable_and_sell_is_receivable(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            trades = Path(tmp)
            write_trade(
                trades,
                "buy.md",
                trade_date="2026-07-07",
                side="buy",
                net_cashflow=-10096,
            )
            write_trade(
                trades,
                "sell.md",
                trade_date="2026-07-13",
                side="sell",
                net_cashflow=8743,
            )
            with patch.object(snapshot, "TRANSACTIONS", trades):
                adjustment, count = snapshot.pending_trade_cash_adjustment(
                    "2026-07-06", "2026-07-13"
                )
            self.assertEqual(adjustment, -1353)
            self.assertEqual(count, 2)

    def test_trade_is_not_reapplied_once_cash_snapshot_covers_settlement_date(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            trades = Path(tmp)
            write_trade(
                trades,
                "sell.md",
                trade_date="2026-07-13",
                settlement_date="2026-07-15",
                side="sell",
                net_cashflow=8743,
            )
            with patch.object(snapshot, "TRANSACTIONS", trades):
                adjustment, count = snapshot.pending_trade_cash_adjustment(
                    "2026-07-15", "2026-07-15"
                )
            self.assertEqual(adjustment, 0)
            self.assertEqual(count, 0)

    def test_trade_remains_pending_when_cash_is_newer_than_trade_but_before_settlement(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            trades = Path(tmp)
            write_trade(
                trades,
                "sell.md",
                trade_date="2026-07-13",
                settlement_date="2026-07-15",
                side="sell",
                net_cashflow=8743,
            )
            with patch.object(snapshot, "TRANSACTIONS", trades):
                adjustment, count = snapshot.pending_trade_cash_adjustment(
                    "2026-07-14", "2026-07-14"
                )
            self.assertEqual(adjustment, 8743)
            self.assertEqual(count, 1)

    def test_ignores_future_invalid_and_non_transaction_notes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            trades = Path(tmp)
            write_trade(
                trades,
                "future.md",
                trade_date="2026-07-14",
                side="sell",
                net_cashflow=500,
            )
            write_trade(
                trades,
                "invalid-side.md",
                trade_date="2026-07-13",
                side="transfer",
                net_cashflow=500,
            )
            write_trade(
                trades,
                "not-a-trade.md",
                trade_date="2026-07-13",
                side="sell",
                net_cashflow=500,
                note_type="note",
            )
            with patch.object(snapshot, "TRANSACTIONS", trades):
                adjustment, count = snapshot.pending_trade_cash_adjustment(
                    "2026-07-12", "2026-07-13"
                )
            self.assertEqual(adjustment, 0)
            self.assertEqual(count, 0)

    def test_side_normalizes_incorrect_cashflow_sign(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            trades = Path(tmp)
            write_trade(
                trades,
                "buy.md",
                trade_date="2026-07-13",
                side="buy",
                net_cashflow=100,
            )
            write_trade(
                trades,
                "sell.md",
                trade_date="2026-07-13",
                side="sell",
                net_cashflow=-250,
            )
            with patch.object(snapshot, "TRANSACTIONS", trades):
                adjustment, count = snapshot.pending_trade_cash_adjustment(
                    "2026-07-12", "2026-07-13"
                )
            self.assertEqual(adjustment, 150)
            self.assertEqual(count, 2)


class AccountFreshnessTests(unittest.TestCase):
    def test_later_same_day_policy_update_does_not_refresh_cathay_cash(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            raw = Path(tmp) / "raw"
            entries = Path(tmp) / "entries"
            raw.mkdir()
            entries.mkdir()
            events = [
                {
                    "created_at": "2026-07-12T20:00:17+08:00",
                    "event_type": "balance_snapshot",
                    "result_status": "created",
                    "payload": {
                        "balances": {
                            "CathayBank": "44847",
                            "Brokerage": "164884.8",
                        },
                        "source": "weekly-balance-md-cron",
                        "timestamp": "2026-07-12T20:00:17+08:00",
                    },
                },
                {
                    "created_at": "2026-07-12T21:21:00+08:00",
                    "event_type": "balance_snapshot",
                    "result_status": "updated",
                    "payload": {
                        "balances": {"保單借款": 0, "保單價值": 726318},
                        "source": "policy-insurance-net-surrender-correction",
                        "timestamp": "2026-07-12T21:21:00+08:00",
                    },
                },
            ]
            (raw / "2026-07-12.jsonl").write_text(
                "\n".join(json.dumps(event, ensure_ascii=False) for event in events)
                + "\n",
                encoding="utf-8",
            )
            with (
                patch.object(snapshot, "RAW_BALANCE_LOGS", raw),
                patch.object(snapshot, "ENTRIES", entries),
            ):
                result = snapshot.latest_confirmed_account_balance(
                    "CathayBank", "2026-07-13"
                )
            self.assertEqual(
                result,
                {
                    "balance": 44847.0,
                    "as_of_date": "2026-07-12",
                    "source": "weekly-balance-md-cron",
                    "quality": "confirmed-explicit-event",
                },
            )

    def test_note_fallback_is_explicitly_marked_inferred(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            raw = Path(tmp) / "raw"
            entries = Path(tmp) / "entries"
            raw.mkdir()
            entries.mkdir()
            (entries / "2026-07-12.md").write_text(
                "---\n"
                "type: balance-entry\n"
                "date: 2026-07-12\n"
                "CathayBank: 44847\n"
                "---\n",
                encoding="utf-8",
            )
            with (
                patch.object(snapshot, "RAW_BALANCE_LOGS", raw),
                patch.object(snapshot, "ENTRIES", entries),
            ):
                result = snapshot.latest_confirmed_account_balance(
                    "CathayBank", "2026-07-13"
                )
            self.assertEqual(result["balance"], 44847.0)
            self.assertEqual(result["as_of_date"], "2026-07-12")
            self.assertEqual(result["quality"], "inferred-from-balance-entry")


if __name__ == "__main__":
    unittest.main()
