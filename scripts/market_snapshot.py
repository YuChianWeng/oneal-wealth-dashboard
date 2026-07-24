#!/usr/bin/env python3
"""Produce the latest one-minute read-only market snapshot for the dashboard.

Sources:
- KGI Gateway for open portfolio stock/ETF quotes.
- TWSE MIS for the TAIEX weighted index.
- TAIFEX MIS for the front-month TXF day/night quote.

The output is replaced atomically. The Next.js app only reads this file; the
producer owns credentials, network access, scheduling, and source fan-out.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
from datetime import datetime, time as dt_time, timedelta
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

REPO_SRC = Path("/home/ubuntu/projects/kgi-market-data-client/src")
if str(REPO_SRC) not in sys.path:
    sys.path.insert(0, str(REPO_SRC))

from kgi_market_data_client import KGIClient  # type: ignore[reportMissingImports]  # noqa: E402

TAIPEI = ZoneInfo("Asia/Taipei")
DEFAULT_TOKEN_FILE = Path("/home/ubuntu/kgi/token.txt")
DEFAULT_POSITIONS_DIR = Path(
    "/home/ubuntu/ObsidianVault/Trading/Portfolio/Positions"
)
DEFAULT_OUTPUT = Path("/home/ubuntu/data/market/wealth-market-snapshot.json")
DEFAULT_HISTORY_DIR = Path("/home/ubuntu/data/market/history")
KGI_BASE_URL = os.environ.get("KGI_GATEWAY_BASE_URL", "http://100.85.14.12:8787")
TOKEN_FILE = Path(os.environ.get("KGI_TOKEN_FILE", str(DEFAULT_TOKEN_FILE)))
POSITIONS_DIR = Path(
    os.environ.get("MARKET_POSITIONS_DIR", str(DEFAULT_POSITIONS_DIR))
)
OUTPUT_PATH = Path(os.environ.get("MARKET_SNAPSHOT_PATH", str(DEFAULT_OUTPUT)))
HISTORY_DIR = Path(os.environ.get("MARKET_HISTORY_DIR", str(DEFAULT_HISTORY_DIR)))
TWSE_URL = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw"
TAIFEX_URL = "https://mis.taifex.com.tw/futures/api/getQuoteList"

SYMBOL_RE = re.compile(r"^[A-Za-z0-9]{1,16}$")
KEY_VALUE_RE = re.compile(r"^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$")


def now_taipei() -> datetime:
    return datetime.now(TAIPEI)


def iso(value: datetime) -> str:
    return value.astimezone(TAIPEI).isoformat(timespec="seconds")


def parse_number(value: object) -> float | None:
    if value is None:
        return None
    text = str(value).strip().replace(",", "")
    if not text or text in {"-", "--", "N/A"}:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    return number if number == number and abs(number) != float("inf") else None


def parse_scalar(value: str) -> object:
    value = value.strip().strip('"\'')
    if value.lower() in {"true", "false"}:
        return value.lower() == "true"
    return value


def read_frontmatter(path: Path) -> dict[str, object]:
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    fields: dict[str, object] = {}
    for line in lines[1:]:
        if line.strip() == "---":
            break
        match = KEY_VALUE_RE.match(line)
        if match:
            fields[match.group(1)] = parse_scalar(match.group(2))
    return fields


def canonical_symbol(value: object) -> str:
    raw = str(value or "").strip().upper()
    raw = re.sub(r"\.(?:TW|TWO)$", "", raw)
    return raw if SYMBOL_RE.fullmatch(raw) else ""


def portfolio_symbols() -> tuple[dict[str, str], ...]:
    if not POSITIONS_DIR.is_dir():
        raise RuntimeError("portfolio positions directory is unavailable")
    results: dict[str, str] = {}
    for path in sorted(POSITIONS_DIR.glob("*.md")):
        try:
            fields = read_frontmatter(path)
        except OSError:
            continue
        if str(fields.get("type", "")).strip().lower() != "position":
            continue
        if str(fields.get("status", "")).strip().lower() != "open":
            continue
        symbol = canonical_symbol(fields.get("symbol") or fields.get("ticker"))
        if not symbol:
            continue
        name = str(fields.get("name") or fields.get("company_name") or path.stem)
        results.setdefault(symbol, name.strip() or symbol)
    return tuple({"symbol": symbol, "name": name} for symbol, name in results.items())


def fetch_json(url: str, *, method: str = "GET", body: bytes | None = None) -> object:
    request = Request(
        url,
        data=body,
        method=method,
        headers={
            "Accept": "application/json,text/plain,*/*",
            "Content-Type": "application/json",
            "User-Agent": "Oneal-Wealth-Market-Producer/1.0",
        },
    )
    with urlopen(request, timeout=12) as response:
        return json.loads(response.read().decode("utf-8"))


def session_kind(now: datetime) -> str:
    current = now.time()
    if dt_time(8, 45) <= current <= dt_time(13, 45):
        return "day"
    if current >= dt_time(15, 0) or current <= dt_time(5, 0):
        return "night"
    return "closed"


def session_date(now: datetime, session: str) -> str:
    """Return the Taiwan trading date owning a day/night session.

    A night session starts at 15:00 and ends at 05:00 the next calendar day,
    so observations after midnight still belong to the previous trading date.
    """
    value = now.astimezone(TAIPEI).date()
    if session == "night" and now.astimezone(TAIPEI).time() <= dt_time(5, 0):
        value -= timedelta(days=1)
    return value.isoformat()


def night_session_bounds(session_day: str) -> tuple[datetime, datetime]:
    start_date = datetime.fromisoformat(session_day).date()
    end_date = start_date + timedelta(days=1)
    return (
        datetime.fromisoformat(f"{start_date.isoformat()}T15:00:00+08:00"),
        datetime.fromisoformat(f"{end_date.isoformat()}T05:00:00+08:00"),
    )


def empty_quote(
    *,
    symbol: str,
    name: str,
    source: str,
    now: datetime,
    market_session: str = "unknown",
    contract: str | None = None,
) -> dict[str, object]:
    return {
        "symbol": symbol,
        "name": name,
        "last": None,
        "reference": None,
        "change": None,
        "changePct": None,
        "observedAt": iso(now),
        "providerSnapshotAt": None,
        "source": source,
        "marketSession": market_session,
        "dataStatus": "unavailable",
        "isStale": True,
        "snapshotAgeSeconds": 0.0,
        "contract": contract,
    }


def quote_record(
    *,
    symbol: str,
    name: str,
    source: str,
    last: float | None,
    reference: float | None,
    observed_at: datetime,
    provider_at: datetime | None,
    market_session: str,
    data_status: str,
    snapshot_age_seconds: float,
    contract: str | None = None,
) -> dict[str, object]:
    if last is not None and reference is not None and reference != 0:
        change = last - reference
        change_pct = change / reference * 100
    else:
        change = None
        change_pct = None
    live_expected = market_session in {"day", "night"}
    return {
        "symbol": symbol,
        "name": name,
        "last": last,
        "reference": reference,
        "change": change,
        "changePct": change_pct,
        "observedAt": iso(observed_at),
        "providerSnapshotAt": iso(provider_at) if provider_at else None,
        "source": source,
        "marketSession": market_session,
        "dataStatus": data_status,
        "isStale": live_expected and snapshot_age_seconds > 120,
        "snapshotAgeSeconds": max(0.0, round(snapshot_age_seconds, 3)),
        "contract": contract,
    }


def load_stocks(
    now: datetime, errors: list[dict[str, str]]
) -> list[dict[str, object]]:
    configured = portfolio_symbols()
    if not configured:
        return []
    names = {item["symbol"]: item["name"] for item in configured}
    symbols = tuple(names)
    try:
        token_raw = TOKEN_FILE.read_text(encoding="utf-8").strip()
        token = token_raw.split("=", 1)[1].strip() if "=" in token_raw else token_raw
        if not token or any(ch.isspace() for ch in token):
            raise RuntimeError("KGI token file format is invalid")
        client = KGIClient(token=token, base_url=KGI_BASE_URL, max_retries=2)
        try:
            batch = client.get_quotes(symbols)
        finally:
            client.close()
    except Exception as exc:  # noqa: BLE001
        errors.append(
            {
                "source": "kgi",
                "code": type(exc).__name__,
                "message": "KGI quote request failed",
            }
        )
        return [
            empty_quote(symbol=symbol, name=names[symbol], source="kgi", now=now)
            for symbol in symbols
        ]

    by_symbol = {quote.symbol.upper(): quote for quote in batch.data}
    for item in batch.errors:
        errors.append(
            {
                "source": "kgi",
                "code": item.code,
                "message": f"quote unavailable for {item.symbol}",
            }
        )

    records: list[dict[str, object]] = []
    for symbol in symbols:
        quote = by_symbol.get(symbol)
        if quote is None:
            records.append(
                empty_quote(symbol=symbol, name=names[symbol], source="kgi", now=now)
            )
            continue
        record = quote_record(
            symbol=symbol,
            name=names[symbol],
            source="kgi",
            last=quote.last,
            reference=quote.reference_price,
            observed_at=now,
            provider_at=quote.provider_snapshot_at,
            market_session=(
                quote.market_session
                if quote.market_session in {"day", "night", "closed"}
                else "unknown"
            ),
            data_status=quote.data_status,
            snapshot_age_seconds=float(quote.snapshot_age_seconds),
        )
        record["isStale"] = bool(quote.is_stale)
        records.append(record)
    return records


def parse_twse_provider_time(item: dict[str, object]) -> datetime | None:
    date_value = str(item.get("d") or item.get("^") or "")
    time_value = str(item.get("t") or item.get("%") or "")
    time_value = time_value.replace(":", "")
    if not re.fullmatch(r"\d{8}", date_value) or not re.fullmatch(r"\d{6}", time_value):
        return None
    try:
        parsed = datetime.strptime(date_value + time_value, "%Y%m%d%H%M%S")
        return parsed.replace(tzinfo=TAIPEI)
    except ValueError:
        return None


def load_taiex(now: datetime, errors: list[dict[str, str]]) -> dict[str, object]:
    try:
        payload = fetch_json(TWSE_URL)
        if not isinstance(payload, dict):
            raise ValueError("TWSE payload is not an object")
        messages = payload.get("msgArray")
        if not isinstance(messages, list):
            raise ValueError("TWSE payload has no msgArray")
        item = next(
            (
                row
                for row in messages
                if isinstance(row, dict)
                and (row.get("c") == "t00" or row.get("n") == "發行量加權股價指數")
            ),
            None,
        )
        if not isinstance(item, dict):
            raise ValueError("TAIEX row is unavailable")
        provider_at = parse_twse_provider_time(item)
        age = (now - provider_at).total_seconds() if provider_at else 0.0
        session = "day" if session_kind(now) == "day" else "closed"
        if provider_at and provider_at.date() != now.date():
            session = "closed"
        return quote_record(
            symbol="TAIEX",
            name="發行量加權股價指數",
            source="twse",
            last=parse_number(item.get("z")),
            reference=parse_number(item.get("y")),
            observed_at=now,
            provider_at=provider_at,
            market_session=session,
            data_status="live" if session == "day" else "closed_snapshot",
            snapshot_age_seconds=max(0.0, age),
        )
    except Exception as exc:  # noqa: BLE001
        errors.append(
            {
                "source": "twse",
                "code": type(exc).__name__,
                "message": "TAIEX request failed",
            }
        )
        return empty_quote(
            symbol="TAIEX",
            name="發行量加權股價指數",
            source="twse",
            now=now,
            market_session=session_kind(now),
        )


def parse_taifex_provider_time(item: dict[str, object]) -> datetime | None:
    date_value = str(item.get("CDate") or "")
    time_value = str(item.get("CTime") or "")
    if not re.fullmatch(r"\d{8}", date_value) or not re.fullmatch(r"\d{6}", time_value):
        return None
    try:
        parsed = datetime.strptime(date_value + time_value, "%Y%m%d%H%M%S")
        return parsed.replace(tzinfo=TAIPEI)
    except ValueError:
        return None


def choose_txf_item(items: list[object], session: str) -> dict[str, object] | None:
    suffix = "-M" if session == "night" else "-F"
    candidates = [
        item
        for item in items
        if isinstance(item, dict)
        and str(item.get("SymbolID") or "").startswith("TXF")
        and str(item.get("SymbolID") or "").endswith(suffix)
        and str(item.get("SymbolID") or "") not in {"TXF-P", "TXF-S"}
    ]
    if not candidates:
        return None
    active = [item for item in candidates if str(item.get("Status") or "") == "TC"]
    return (active or candidates)[0]


def load_txf(now: datetime, errors: list[dict[str, str]]) -> dict[str, object]:
    session = session_kind(now)
    try:
        payload = fetch_json(
            TAIFEX_URL,
            method="POST",
            body=b'{"SymbolType":"F","ProdID":"TXF"}',
        )
        if not isinstance(payload, dict):
            raise ValueError("TAIFEX payload is not an object")
        rt_data = payload.get("RtData")
        items = rt_data.get("QuoteList") if isinstance(rt_data, dict) else None
        if not isinstance(items, list):
            raise ValueError("TAIFEX QuoteList is unavailable")
        item = choose_txf_item(items, session)
        if item is None and session == "closed":
            item = choose_txf_item(items, "day")
        if item is None:
            raise ValueError("front-month TXF quote is unavailable")
        provider_at = parse_taifex_provider_time(item)
        age = (now - provider_at).total_seconds() if provider_at else 0.0
        symbol_id = str(item.get("SymbolID") or "TXF")
        contract = symbol_id.rsplit("-", 1)[0]
        selected_session = session if session in {"day", "night"} else "closed"
        return quote_record(
            symbol="TXF",
            name=str(item.get("DispCName") or "臺指期"),
            source="taifex",
            last=parse_number(item.get("CLastPrice")),
            reference=parse_number(item.get("CRefPrice")),
            observed_at=now,
            provider_at=provider_at,
            market_session=selected_session,
            data_status="live" if selected_session in {"day", "night"} else "closed_snapshot",
            snapshot_age_seconds=max(0.0, age),
            contract=contract,
        )
    except Exception as exc:  # noqa: BLE001
        errors.append(
            {
                "source": "taifex",
                "code": type(exc).__name__,
                "message": "TXF request failed",
            }
        )
        return empty_quote(
            symbol="TXF",
            name="臺指期",
            source="taifex",
            now=now,
            market_session=session,
        )


def build_snapshot() -> dict[str, Any]:
    now = now_taipei()
    errors: list[dict[str, str]] = []
    return {
        "version": 1,
        "observedAt": iso(now),
        "stocks": load_stocks(now, errors),
        "indices": {"taiex": load_taiex(now, errors)},
        "futures": {"txf": load_txf(now, errors)},
        "errors": errors,
    }


def intraday_point(
    quote: object,
    *,
    session_date: str,
    series_name: str,
    session: str,
) -> dict[str, object] | None:
    """Return a point inside the instrument's official day/night session."""
    if not isinstance(quote, dict) or quote.get("marketSession") != session:
        return None
    # TAIEX has no night-session quote. Keep its last TWSE close in the
    # snapshot/ticker, but never fabricate a night-session index line.
    if session == "night" and series_name != "txf":
        return None
    last = parse_number(quote.get("last"))
    raw_timestamp = quote.get("providerSnapshotAt") or quote.get("observedAt")
    if last is None or not isinstance(raw_timestamp, str):
        return None
    try:
        timestamp = datetime.fromisoformat(raw_timestamp).astimezone(TAIPEI)
    except ValueError:
        return None

    if session == "night":
        start, end = night_session_bounds(session_date)
        if not start <= timestamp <= end:
            return None
        return {"timestamp": iso(timestamp), "value": last}

    if timestamp.date().isoformat() != session_date:
        return None
    bounds = {
        "taiex": (dt_time(9, 0), dt_time(13, 30)),
        "txf": (dt_time(8, 45), dt_time(13, 45)),
    }
    start, end = bounds.get(series_name, (dt_time(8, 45), dt_time(13, 45)))
    if not start <= timestamp.time() <= end:
        return None
    return {"timestamp": iso(timestamp), "value": last}


def history_path(session_day: str, session: str) -> Path:
    return HISTORY_DIR / f"{session_day}-{session}.json"


def legacy_history_path(session_day: str) -> Path:
    return HISTORY_DIR / f"{session_day}.json"


def load_history(
    session_day: str,
    session: str,
    observed_at: str,
) -> dict[str, object]:
    path = history_path(session_day, session)
    # Preserve existing day-session files created by the first implementation.
    if not path.exists() and session == "day":
        legacy = legacy_history_path(session_day)
        if legacy.exists():
            path = legacy
    if not path.exists():
        return {
            "version": 1,
            "date": session_day,
            "session": session,
            "observedAt": observed_at,
            "taiex": [],
            "txf": [],
        }
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError("market history is unreadable") from exc
    if not isinstance(parsed, dict) or parsed.get("version") != 1:
        raise RuntimeError("market history has an unsupported schema")
    if parsed.get("date") != session_day or parsed.get("session") != session:
        raise RuntimeError("market history date/session mismatch")
    if not isinstance(parsed.get("taiex"), list) or not isinstance(parsed.get("txf"), list):
        raise RuntimeError("market history series are invalid")
    return parsed


def append_intraday_history(snapshot: dict[str, Any]) -> tuple[Path, int, int]:
    observed_at = str(snapshot["observedAt"])
    observed_datetime = datetime.fromisoformat(observed_at).astimezone(TAIPEI)
    current_session = session_kind(observed_datetime)
    # During the short closed windows, retain the current day's day history;
    # do not create a misleading closed-session line.
    session = current_session if current_session in {"day", "night"} else "day"
    session_day = session_date(observed_datetime, session)
    history = load_history(session_day, session, observed_at)
    taiex_history = history.get("taiex")
    txf_history = history.get("txf")
    counts = {
        "taiex": len(taiex_history) if isinstance(taiex_history, list) else 0,
        "txf": len(txf_history) if isinstance(txf_history, list) else 0,
    }
    if current_session not in {"day", "night"}:
        return history_path(session_day, session), counts["taiex"], counts["txf"]

    for key, quote in (
        ("taiex", snapshot["indices"].get("taiex")),
        ("txf", snapshot["futures"].get("txf")),
    ):
        point = intraday_point(
            quote,
            session_date=session_day,
            series_name=key,
            session=session,
        )
        if point is None:
            continue
        series = history[key]
        if not isinstance(series, list):
            raise RuntimeError(f"market history series is invalid: {key}")
        by_timestamp: dict[str, dict[str, object]] = {
            item["timestamp"]: item
            for item in series
            if isinstance(item, dict) and isinstance(item.get("timestamp"), str)
        }
        timestamp = point["timestamp"]
        assert isinstance(timestamp, str)
        by_timestamp[timestamp] = point
        updated_series = [by_timestamp[item_timestamp] for item_timestamp in sorted(by_timestamp)]
        history[key] = updated_series
        counts[key] = len(updated_series)
    history["observedAt"] = observed_at
    path = history_path(session_day, session)
    write_atomic(path, history)
    return path, counts["taiex"], counts["txf"]


def write_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
    finally:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass


def self_check() -> None:
    if not TOKEN_FILE.is_file():
        raise RuntimeError(f"KGI token file missing: {TOKEN_FILE}")
    if not POSITIONS_DIR.is_dir():
        raise RuntimeError(f"positions directory missing: {POSITIONS_DIR}")
    if not REPO_SRC.is_dir():
        raise RuntimeError(f"KGI client source missing: {REPO_SRC}")
    print(
        json.dumps(
            {
                "status": "self-check-pass",
                "token_file_present": True,
                "positions_dir_present": True,
                "output_path": str(OUTPUT_PATH),
                "sources": ["kgi", "twse", "taifex"],
                "refresh": "every minute via systemd timer",
            },
            ensure_ascii=False,
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-check", action="store_true")
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    if args.self_check:
        self_check()
        return
    if not args.once:
        parser.error("use --once for one producer run")
    payload = build_snapshot()
    history_file, taiex_points, txf_points = append_intraday_history(payload)
    write_atomic(OUTPUT_PATH, payload)
    print(
        json.dumps(
            {
                "status": "completed",
                "observed_at": payload["observedAt"],
                "stock_count": len(payload["stocks"]),
                "taiex_available": payload["indices"]["taiex"]["last"] is not None,
                "txf_available": payload["futures"]["txf"]["last"] is not None,
                "txf_session": payload["futures"]["txf"]["marketSession"],
                "history_path": str(history_file),
                "history_points": {"taiex": taiex_points, "txf": txf_points},
                "errors": len(payload["errors"]),
                "output_path": str(OUTPUT_PATH),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
