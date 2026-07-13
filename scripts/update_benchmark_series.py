#!/usr/bin/env python3
"""Refresh validated benchmark history for the read-only Wealth Dashboard.

The dashboard process never reaches the network. This producer downloads complete
history, validates it, and atomically writes an auditable JSON read model under the
Obsidian vault. Complete-history refresh is intentional: adjusted-close history may
be revised after ETF distributions, so appending one daily value would break the
total-return chain.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import pandas as pd

TZ = ZoneInfo("Asia/Taipei")
DEFAULT_OUTPUT_DIR = Path(
    "/home/ubuntu/ObsidianVault/Trading/Portfolio/Benchmarks"
)
SYMBOLS = {
    "0050.TW": {
        "name": "元大台灣50",
        "basis": "adjusted-close-total-return-proxy",
        "currency": "TWD",
        "requires_volume": True,
    },
    "^TWII": {
        "name": "TAIEX 加權指數",
        "basis": "price-index",
        "currency": "TWD",
        "requires_volume": False,
    },
}


def finite_number(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def _single_symbol_frame(frame: pd.DataFrame, symbol: str) -> pd.DataFrame:
    if not isinstance(frame.columns, pd.MultiIndex):
        return frame.copy()
    for level in range(frame.columns.nlevels - 1, -1, -1):
        if symbol in frame.columns.get_level_values(level):
            selected = frame.xs(symbol, axis=1, level=level, drop_level=True)
            if isinstance(selected, pd.Series):
                return selected.to_frame()
            return selected.copy()
    return frame.iloc[0:0].copy()


def normalize_history_frame(frame: pd.DataFrame, symbol: str) -> list[dict[str, Any]]:
    """Convert a yfinance frame to deterministic, validated daily points."""
    if symbol not in SYMBOLS:
        raise ValueError(f"unsupported benchmark symbol: {symbol}")
    if frame is None or frame.empty:
        return []

    source = _single_symbol_frame(frame, symbol)
    required = {"Close", "Adj Close"}
    if not required.issubset(set(source.columns)):
        return []

    source = source.sort_index(kind="stable")
    by_date: dict[str, dict[str, Any]] = {}
    requires_volume = bool(SYMBOLS[symbol]["requires_volume"])

    for index, row in source.iterrows():
        try:
            date = pd.Timestamp(str(index)).date().isoformat()
        except Exception:
            continue
        close = finite_number(row.get("Close"))
        adjusted = finite_number(row.get("Adj Close"))
        volume = finite_number(row.get("Volume"))
        if close is None or adjusted is None or close <= 0 or adjusted <= 0:
            continue
        if requires_volume and (volume is None or volume <= 0):
            continue

        point: dict[str, Any] = {
            "date": date,
            "close": close,
            "adjustedClose": adjusted,
        }
        dividend = finite_number(row.get("Dividends"))
        split = finite_number(row.get("Stock Splits"))
        if volume is not None:
            point["volume"] = int(volume) if volume.is_integer() else volume
        if dividend is not None:
            point["dividend"] = dividend
        if split is not None:
            point["stockSplit"] = split
        by_date[date] = point

    return [by_date[date] for date in sorted(by_date)]


def build_payload(
    symbol: str,
    points: list[dict[str, Any]],
    *,
    fetched_at: datetime,
    source_version: str,
) -> dict[str, Any]:
    if symbol not in SYMBOLS:
        raise ValueError(f"unsupported benchmark symbol: {symbol}")
    if fetched_at.tzinfo is None or fetched_at.utcoffset() is None:
        raise ValueError("fetched_at must be timezone-aware")
    metadata = SYMBOLS[symbol]
    return {
        "version": 1,
        "symbol": symbol,
        "name": metadata["name"],
        "basis": metadata["basis"],
        "currency": metadata["currency"],
        "exchangeTimezone": "Asia/Taipei",
        "source": "yfinance",
        "sourceVersion": source_version,
        "fetchedAt": fetched_at.astimezone(TZ).isoformat(timespec="seconds"),
        "points": points,
    }


def validate_payload(payload: dict[str, Any]) -> None:
    if payload.get("version") != 1:
        raise ValueError("benchmark payload version must be 1")
    symbol = payload.get("symbol")
    if symbol not in SYMBOLS:
        raise ValueError("benchmark payload has unsupported symbol")
    expected = SYMBOLS[str(symbol)]
    if payload.get("name") != expected["name"]:
        raise ValueError("benchmark payload name does not match symbol")
    if payload.get("basis") != expected["basis"]:
        raise ValueError("benchmark payload basis does not match symbol")
    if payload.get("currency") != expected["currency"]:
        raise ValueError("benchmark payload currency does not match symbol")
    if payload.get("exchangeTimezone") != "Asia/Taipei":
        raise ValueError("benchmark payload exchangeTimezone must be Asia/Taipei")
    if payload.get("source") != "yfinance":
        raise ValueError("benchmark payload source must be yfinance")
    source_version = payload.get("sourceVersion")
    if not isinstance(source_version, str) or not source_version.strip():
        raise ValueError("benchmark payload sourceVersion is missing")
    fetched_at = payload.get("fetchedAt")
    if not isinstance(fetched_at, str):
        raise ValueError("benchmark payload fetchedAt is missing")
    try:
        parsed_fetched_at = datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("benchmark payload fetchedAt is invalid") from exc
    if parsed_fetched_at.tzinfo is None or parsed_fetched_at.utcoffset() is None:
        raise ValueError("benchmark payload fetchedAt must have an offset")
    if parsed_fetched_at.utcoffset() != timedelta(hours=8):
        raise ValueError("benchmark payload fetchedAt must use Asia/Taipei +08:00")

    points = payload.get("points")
    if not isinstance(points, list) or not points:
        raise ValueError("benchmark payload must contain at least one point")
    previous = ""
    for point in points:
        if not isinstance(point, dict):
            raise ValueError("benchmark point must be an object")
        date = point.get("date")
        if not isinstance(date, str):
            raise ValueError("benchmark point date is missing")
        try:
            if datetime.strptime(date, "%Y-%m-%d").date().isoformat() != date:
                raise ValueError
        except ValueError as exc:
            raise ValueError("benchmark point date is invalid") from exc
        if previous and date <= previous:
            raise ValueError("benchmark point dates must be strictly increasing")
        previous = date
        for key in ("close", "adjustedClose"):
            value = finite_number(point.get(key))
            if value is None or value <= 0:
                raise ValueError(f"benchmark point {key} must be positive and finite")


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    """Validate then atomically replace `path`, preserving the last good file on error."""
    validate_payload(payload)
    if path.exists():
        existing = json.loads(path.read_text(encoding="utf-8"))
        validate_payload(existing)
        if existing.get("symbol") != payload.get("symbol"):
            raise ValueError("existing benchmark symbol does not match candidate")
        old_points = existing["points"]
        new_points = payload["points"]
        if new_points[-1]["date"] < old_points[-1]["date"]:
            raise ValueError("benchmark provider history is older than last good file")
        if new_points[0]["date"] > old_points[0]["date"]:
            raise ValueError("benchmark provider history is truncated")
        old_dates = {point["date"] for point in old_points}
        new_dates = {point["date"] for point in new_points}
        missing_dates = sorted(old_dates - new_dates)
        if missing_dates:
            raise ValueError(
                "benchmark provider history is missing previously stored dates: "
                + ", ".join(missing_dates[:5])
            )
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temp_path = Path(handle.name)
            json.dump(payload, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)
        temp_path = None
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


def fetch_history(symbol: str) -> tuple[pd.DataFrame, str]:
    try:
        import yfinance as yf
    except ImportError as exc:
        raise RuntimeError("yfinance is required to refresh benchmarks") from exc
    frame = yf.download(
        symbol,
        period="max",
        interval="1d",
        auto_adjust=False,
        actions=True,
        progress=False,
        threads=False,
    )
    if frame is None:
        raise RuntimeError(f"benchmark provider returned no frame for {symbol}")
    return frame, str(yf.__version__)


def refresh_symbol(
    symbol: str,
    output_dir: Path,
    *,
    dry_run: bool,
    fetched_at: datetime,
) -> dict[str, Any]:
    frame, source_version = fetch_history(symbol)
    points = normalize_history_frame(frame, symbol)
    payload = build_payload(
        symbol,
        points,
        fetched_at=fetched_at,
        source_version=source_version,
    )
    validate_payload(payload)
    if not dry_run:
        atomic_write_json(output_dir / f"{symbol}.json", payload)
    return payload


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="benchmark JSON directory"
    )
    parser.add_argument(
        "--symbol",
        action="append",
        choices=sorted(SYMBOLS),
        help="symbol to refresh; repeatable; defaults to all supported symbols",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    fetched_at = datetime.now(TZ).replace(microsecond=0)
    symbols = args.symbol or list(SYMBOLS)
    for symbol in symbols:
        payload = refresh_symbol(
            symbol,
            args.output_dir,
            dry_run=args.dry_run,
            fetched_at=fetched_at,
        )
        points = payload["points"]
        prefix = "DRY-RUN " if args.dry_run else "UPDATED "
        print(
            f"{prefix}{symbol}: points={len(points)} "
            f"first={points[0]['date']} last={points[-1]['date']} "
            f"basis={payload['basis']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
