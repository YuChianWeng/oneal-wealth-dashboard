#!/usr/bin/env python3
"""Regression tests for policy-loan investment snapshot cash reconciliation."""
from __future__ import annotations

import importlib.util
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
    note_type: str = "transaction",
) -> None:
    (directory / filename).write_text(
        "---\n"
        f"type: {note_type}\n"
        f"trade_date: '{trade_date}'\n"
        f"side: {side}\n"
        f"net_cashflow: {net_cashflow}\n"
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

    def test_trade_is_not_reapplied_once_cash_snapshot_covers_its_date(self) -> None:
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
                    "2026-07-13", "2026-07-13"
                )
            self.assertEqual(adjustment, 0)
            self.assertEqual(count, 0)

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


if __name__ == "__main__":
    unittest.main()
