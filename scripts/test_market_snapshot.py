#!/usr/bin/env python3
"""Focused tests for market session routing and intraday history points."""

from __future__ import annotations

import importlib.util
import sys
import types
from datetime import datetime
from pathlib import Path

# The producer imports the private KGI client at module load. Stub only that
# dependency so these pure session/history tests stay offline and credential-free.
class _KGIClient:  # pragma: no cover - import stub only
    pass

sys.modules.setdefault(
    "kgi_market_data_client",
    types.SimpleNamespace(KGIClient=_KGIClient),
)

MODULE_PATH = Path(__file__).with_name("market_snapshot.py")
spec = importlib.util.spec_from_file_location("market_snapshot", MODULE_PATH)
assert spec and spec.loader
market_snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(market_snapshot)

TAIPEI = market_snapshot.TAIPEI


def test_session_date_for_cross_midnight_night():
    late = datetime(2026, 7, 21, 22, 0, tzinfo=TAIPEI)
    after_midnight = datetime(2026, 7, 22, 2, 0, tzinfo=TAIPEI)
    assert market_snapshot.session_kind(late) == "night"
    assert market_snapshot.session_kind(after_midnight) == "night"
    assert market_snapshot.session_date(late, "night") == "2026-07-21"
    assert market_snapshot.session_date(after_midnight, "night") == "2026-07-21"


def test_night_txf_point_is_written_to_night_history():
    quote = {
        "marketSession": "night",
        "last": 22450.0,
        "providerSnapshotAt": "2026-07-21T22:01:03+08:00",
    }
    point = market_snapshot.intraday_point(
        quote,
        session_date="2026-07-21",
        series_name="txf",
        session="night",
    )
    assert point == {
        "timestamp": "2026-07-21T22:01:03+08:00",
        "value": 22450.0,
    }


def test_taiex_has_no_fake_night_point():
    quote = {
        "marketSession": "closed",
        "last": 22450.0,
        "providerSnapshotAt": "2026-07-21T13:30:00+08:00",
    }
    assert (
        market_snapshot.intraday_point(
            quote,
            session_date="2026-07-21",
            series_name="taiex",
            session="night",
        )
        is None
    )


if __name__ == "__main__":
    tests = [
        test_session_date_for_cross_midnight_night,
        test_night_txf_point_is_written_to_night_history,
        test_taiex_has_no_fake_night_point,
    ]
    for test in tests:
        test()
    print(f"{len(tests)} market snapshot tests passed")
