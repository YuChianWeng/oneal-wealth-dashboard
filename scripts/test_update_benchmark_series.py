#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import tempfile
import unittest
from unittest.mock import patch
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

from scripts import update_benchmark_series as target


class NormalizeHistoryFrameTests(unittest.TestCase):
    def frame(self) -> pd.DataFrame:
        index = pd.to_datetime(["2026-01-21", "2026-01-22", "2026-01-23"])
        return pd.DataFrame(
            {
                "Close": [71.85, 71.80, 72.10],
                "Adj Close": [70.85, 71.80, 72.10],
                "Dividends": [0.0, 1.0, 0.0],
                "Stock Splits": [0.0, 0.0, 0.0],
                "Volume": [100, 200, 0],
            },
            index=index,
        )

    def test_etf_rows_use_adjusted_close_and_drop_zero_volume_provider_rows(self) -> None:
        points = target.normalize_history_frame(self.frame(), "0050.TW")
        self.assertEqual([point["date"] for point in points], ["2026-01-21", "2026-01-22"])
        self.assertEqual(points[0]["close"], 71.85)
        self.assertEqual(points[0]["adjustedClose"], 70.85)
        self.assertEqual(points[1]["dividend"], 1.0)

    def test_index_rows_do_not_require_positive_volume(self) -> None:
        frame = self.frame()
        frame["Volume"] = 0
        points = target.normalize_history_frame(frame, "^TWII")
        self.assertEqual(len(points), 3)

    def test_multi_index_yfinance_columns_are_flattened_for_requested_symbol(self) -> None:
        frame = self.frame()
        frame.columns = pd.MultiIndex.from_product([frame.columns, ["0050.TW"]])
        points = target.normalize_history_frame(frame, "0050.TW")
        self.assertEqual(len(points), 2)
        self.assertEqual(points[0]["date"], "2026-01-21")

    def test_multi_index_for_another_ticker_is_rejected(self) -> None:
        frame = self.frame()
        frame.columns = pd.MultiIndex.from_product([frame.columns, ["OTHER"]])
        self.assertEqual(target.normalize_history_frame(frame, "0050.TW"), [])

    def test_duplicate_dates_are_deduplicated_and_sorted(self) -> None:
        frame = self.frame().iloc[[1, 0, 1]].copy()
        frame.iloc[2, frame.columns.get_loc("Close")] = 72.0
        points = target.normalize_history_frame(frame, "0050.TW")
        self.assertEqual([p["date"] for p in points], ["2026-01-21", "2026-01-22"])
        self.assertEqual(points[-1]["close"], 72.0)

    def test_invalid_or_missing_adjusted_close_is_rejected(self) -> None:
        frame = self.frame()
        frame.loc[pd.Timestamp("2026-01-21"), "Adj Close"] = float("nan")
        frame.loc[pd.Timestamp("2026-01-22"), "Adj Close"] = 0
        points = target.normalize_history_frame(frame, "0050.TW")
        self.assertEqual(points, [])


class PayloadTests(unittest.TestCase):
    def test_build_payload_has_explicit_basis_source_and_taipei_timestamp(self) -> None:
        fetched_at = datetime(2026, 7, 13, 14, 10, tzinfo=ZoneInfo("Asia/Taipei"))
        payload = target.build_payload(
            "0050.TW",
            [{"date": "2026-01-22", "close": 71.8, "adjustedClose": 71.8}],
            fetched_at=fetched_at,
            source_version="1.4.1",
        )
        self.assertEqual(payload["version"], 1)
        self.assertEqual(payload["symbol"], "0050.TW")
        self.assertEqual(payload["basis"], "adjusted-close-total-return-proxy")
        self.assertEqual(payload["source"], "yfinance")
        self.assertEqual(payload["fetchedAt"], "2026-07-13T14:10:00+08:00")
        target.validate_payload(payload)

    def test_validate_payload_rejects_contract_metadata_mismatches(self) -> None:
        base = target.build_payload(
            "0050.TW",
            [{"date": "2026-01-22", "close": 71.8, "adjustedClose": 71.8}],
            fetched_at=datetime(2026, 7, 13, 14, 10, tzinfo=ZoneInfo("Asia/Taipei")),
            source_version="test",
        )
        invalid_payloads = [
            {**base, "currency": "USD"},
            {**base, "sourceVersion": None},
            {**base, "sourceVersion": ""},
            {**base, "fetchedAt": "2026-07-13T06:10:00+00:00"},
        ]
        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError):
                    target.validate_payload(payload)

    def test_validate_payload_rejects_empty_non_monotonic_and_nonfinite_data(self) -> None:
        base = target.build_payload(
            "0050.TW",
            [{"date": "2026-01-22", "close": 71.8, "adjustedClose": 71.8}],
            fetched_at=datetime(2026, 7, 13, 14, 10, tzinfo=ZoneInfo("Asia/Taipei")),
            source_version="test",
        )
        for points in (
            [],
            [
                {"date": "2026-01-22", "close": 71.8, "adjustedClose": 71.8},
                {"date": "2026-01-21", "close": 71.0, "adjustedClose": 71.0},
            ],
            [{"date": "2026-01-22", "close": math.inf, "adjustedClose": 71.8}],
        ):
            payload = {**base, "points": points}
            with self.assertRaises(ValueError):
                target.validate_payload(payload)

    def test_atomic_write_does_not_replace_last_good_file_when_payload_invalid(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "0050.TW.json"
            path.write_text('{"last":"good"}\n', encoding="utf-8")
            with self.assertRaises(ValueError):
                target.atomic_write_json(path, {"version": 1, "symbol": "0050.TW", "points": []})
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), {"last": "good"})

    def test_atomic_write_rejects_provider_history_older_than_last_good_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "0050.TW.json"
            fetched_at = datetime(2026, 7, 13, 14, 10, tzinfo=ZoneInfo("Asia/Taipei"))
            last_good = target.build_payload(
                "0050.TW",
                [{"date": "2026-01-23", "close": 72.1, "adjustedClose": 72.1}],
                fetched_at=fetched_at,
                source_version="test",
            )
            path.write_text(json.dumps(last_good), encoding="utf-8")
            stale = target.build_payload(
                "0050.TW",
                [{"date": "2026-01-22", "close": 71.8, "adjustedClose": 71.8}],
                fetched_at=fetched_at,
                source_version="test",
            )
            with self.assertRaises(ValueError):
                target.atomic_write_json(path, stale)
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), last_good)

    def test_atomic_write_rejects_an_interior_gap_in_existing_history(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "0050.TW.json"
            fetched_at = datetime(2026, 7, 13, 14, 10, tzinfo=ZoneInfo("Asia/Taipei"))
            last_good = target.build_payload(
                "0050.TW",
                [
                    {"date": "2026-01-21", "close": 71.0, "adjustedClose": 71.0},
                    {"date": "2026-01-22", "close": 71.8, "adjustedClose": 71.8},
                    {"date": "2026-01-23", "close": 72.1, "adjustedClose": 72.1},
                ],
                fetched_at=fetched_at,
                source_version="test",
            )
            path.write_text(json.dumps(last_good), encoding="utf-8")
            gapped = target.build_payload(
                "0050.TW",
                [last_good["points"][0], last_good["points"][2]],
                fetched_at=fetched_at,
                source_version="test",
            )
            with self.assertRaises(ValueError):
                target.atomic_write_json(path, gapped)
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), last_good)

    def test_atomic_replace_failure_preserves_old_file_and_removes_temp(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "0050.TW.json"
            path.write_text('{"last":"good"}\n', encoding="utf-8")
            payload = target.build_payload(
                "0050.TW",
                [{"date": "2026-01-22", "close": 71.8, "adjustedClose": 71.8}],
                fetched_at=datetime(2026, 7, 13, 14, 10, tzinfo=ZoneInfo("Asia/Taipei")),
                source_version="test",
            )
            with patch.object(target.os, "replace", side_effect=OSError("replace failed")):
                with self.assertRaises(OSError):
                    target.atomic_write_json(path, payload)
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), {"last": "good"})
            self.assertFalse(any(path.parent.glob(f".{path.name}.*.tmp")))

    def test_atomic_write_round_trips_valid_payload(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "0050.TW.json"
            payload = target.build_payload(
                "0050.TW",
                [{"date": "2026-01-22", "close": 71.8, "adjustedClose": 71.8}],
                fetched_at=datetime(2026, 7, 13, 14, 10, tzinfo=ZoneInfo("Asia/Taipei")),
                source_version="test",
            )
            target.atomic_write_json(path, payload)
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), payload)
            self.assertFalse(any(path.parent.glob(f".{path.name}.*.tmp")))


if __name__ == "__main__":
    unittest.main()
