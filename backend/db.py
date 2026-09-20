"""
Step 5a — SQLite persistence.

Zero-ops storage: a single file (trace.db), no server process to
start/keep alive during the demo. See earlier discussion for why
this beats Postgres/Mongo/Neo4j at hackathon scale — one less thing
that can fail on venue wifi right before your slot.

Replaces the in-memory ALERT_HISTORY list from backend/main.py with
a real table, so a server restart mid-demo doesn't silently lose the
"system learns from reuse" behavior verified in Step 4.
"""
import sqlite3
import os
import sys
import json
from datetime import datetime, timedelta
from contextlib import contextmanager

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from data.atms import ATMS

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "trace.db")
ATM_LOOKUP = {a["id"]: a for a in ATMS}


_initialized = False


def ensure_tables_exist():
    global _initialized
    if _initialized and os.path.exists(DB_PATH) and os.path.getsize(DB_PATH) > 0:
        return
    init_db(reset=False)


@contextmanager
def get_db():
    ensure_tables_exist()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db(reset: bool = False):
    """Create tables. Pass reset=True to wipe and reseed (useful right
    before a demo run, so hub_score starts from a known state)."""
    global _initialized
    if reset and os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("""CREATE TABLE IF NOT EXISTS complaints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_account TEXT NOT NULL,
            amount INTEGER,
            complaint_text TEXT,
            created_at TEXT NOT NULL
        )""")
        conn.execute("""CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            complaint_id INTEGER,
            atm_id TEXT NOT NULL,
            atm_name TEXT,
            confidence REAL,
            reasons TEXT,
            created_at TEXT NOT NULL,
            reviewed INTEGER DEFAULT 0,
            audit_hash TEXT,
            is_top_prediction INTEGER DEFAULT 0,
            lat REAL,
            lon REAL,
            FOREIGN KEY(complaint_id) REFERENCES complaints(id)
        )""")

        # Migration: ensure lat and lon columns exist if table was already created
        cursor = conn.execute("PRAGMA table_info(alerts)")
        existing_cols = [row["name"] for row in cursor.fetchall()]
        if "lat" not in existing_cols:
            conn.execute("ALTER TABLE alerts ADD COLUMN lat REAL")
        if "lon" not in existing_cols:
            conn.execute("ALTER TABLE alerts ADD COLUMN lon REAL")

        # Backfill existing alerts where lat/lon are missing
        for atm_id, atm in ATM_LOOKUP.items():
            conn.execute(
                "UPDATE alerts SET lat = ?, lon = ? WHERE atm_id = ? AND (lat IS NULL OR lon IS NULL)",
                (atm["lat"], atm["lon"], atm_id),
            )

        # seed with the same plausible starting history used in Step 4,
        # so behavior matches what was already verified
        existing = conn.execute("SELECT COUNT(*) AS c FROM alerts").fetchone()["c"]
        if existing == 0:
            now = datetime.now()
            seed_rows = [
                ("ATM001", "SBI ATM, T Nagar", now - timedelta(hours=2)),
                ("ATM005", "Indian Bank, Mylapore", now - timedelta(hours=5)),
                ("ATM005", "Indian Bank, Mylapore", now - timedelta(days=1)),
                ("ATM010", "Canara Bank, Perambur", now - timedelta(hours=8)),
            ]
            for atm_id, atm_name, ts in seed_rows:
                atm = ATM_LOOKUP.get(atm_id)
                lat = atm["lat"] if atm else None
                lon = atm["lon"] if atm else None
                conn.execute(
                    "INSERT INTO alerts (atm_id, atm_name, confidence, reasons, created_at, is_top_prediction, lat, lon) "
                    "VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
                    (atm_id, atm_name, 0.0, "[]", ts.isoformat(), lat, lon),
                )
        conn.commit()
        _initialized = True
    finally:
        conn.close()


def insert_complaint(entry_account: str, amount: int, complaint_text: str = None) -> int:
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO complaints (entry_account, amount, complaint_text, created_at) "
            "VALUES (?, ?, ?, ?)",
            (entry_account, amount, complaint_text, datetime.now().isoformat()),
        )
        return cur.lastrowid


def insert_alert(complaint_id: int, atm_id: str, atm_name: str, confidence: float,
                  reasons: list, audit_hash: str = None, is_top_prediction: bool = False,
                  lat: float = None, lon: float = None) -> int:
    reasons_val = json.dumps(reasons) if isinstance(reasons, (list, dict)) else str(reasons)
    if lat is None or lon is None:
        atm = ATM_LOOKUP.get(atm_id)
        if atm:
            lat = lat if lat is not None else atm.get("lat")
            lon = lon if lon is not None else atm.get("lon")
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO alerts (complaint_id, atm_id, atm_name, confidence, reasons, created_at, audit_hash, is_top_prediction, lat, lon) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (complaint_id, atm_id, atm_name, confidence, reasons_val, datetime.now().isoformat(),
             audit_hash, 1 if is_top_prediction else 0, lat, lon),
        )
        return cur.lastrowid


def get_history_with_minutes_ago() -> list[dict]:
    """Same shape model/scoring.py's hub_score() expects — this is a
    drop-in replacement for the old in-memory ALERT_HISTORY list.

    IMPORTANT: only pulls rows where is_top_prediction=1. hub_score is
    meant to reflect actual reuse of an ATM as the (predicted) actual
    cash-out point — feeding it every candidate shown to an officer
    (including #2/#3 that likely DIDN'T happen) would corrupt the
    signal it's supposed to represent."""
    now = datetime.now()
    with get_db() as conn:
        rows = conn.execute(
            "SELECT atm_id, created_at FROM alerts WHERE is_top_prediction = 1"
        ).fetchall()
    out = []
    for r in rows:
        ts = datetime.fromisoformat(r["created_at"])
        out.append({"atm_id": r["atm_id"], "minutes_ago": (now - ts).total_seconds() / 60.0})
    return out


def get_recent_alerts(limit: int = 20) -> list[dict]:
    """Powers the dashboard's GET /alerts polling endpoint (Step 6)."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT a.*, c.entry_account, c.amount as complaint_amount "
            "FROM alerts a "
            "LEFT JOIN complaints c ON a.complaint_id = c.id "
            "WHERE a.complaint_id IS NOT NULL "
            "ORDER BY COALESCE(a.complaint_id, 0) DESC, a.confidence DESC, a.id DESC LIMIT ?", (limit,)
        ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        if isinstance(d.get("reasons"), str):
            try:
                d["reasons"] = json.loads(d["reasons"])
            except Exception:
                try:
                    import ast
                    val = ast.literal_eval(d["reasons"])
                    d["reasons"] = val if isinstance(val, list) else [str(val)]
                except Exception:
                    d["reasons"] = [d["reasons"]] if d["reasons"] else []
        elif not isinstance(d.get("reasons"), list):
            d["reasons"] = []

        atm = ATM_LOOKUP.get(d.get("atm_id"))
        lat = d.get("lat") if d.get("lat") is not None else (atm["lat"] if atm else None)
        lon = d.get("lon") if d.get("lon") is not None else (atm["lon"] if atm else None)

        d["lat"] = lat
        d["lon"] = lon
        d["latitude"] = lat
        d["longitude"] = lon
        d["bank_name"] = d.get("atm_name")
        d["shap_explanation"] = d.get("reasons", [])
        d["shap_reasons"] = d.get("reasons", [])

        result.append(d)
    return result


def mark_reviewed(alert_id: int):
    with get_db() as conn:
        conn.execute("UPDATE alerts SET reviewed = 1 WHERE id = ?", (alert_id,))


if __name__ == "__main__":
    init_db(reset=True)
    print(f"DB created at {DB_PATH}")
    cid = insert_complaint("MULE_A3", 190000, "test complaint")
    print(f"Inserted complaint id={cid}")
    aid = insert_alert(cid, "ATM005", "Indian Bank, Mylapore", 0.45, ["geo proximity high"])
    print(f"Inserted alert id={aid}")
    print("\nHistory (with minutes_ago):")
    for h in get_history_with_minutes_ago():
        print(" ", h)
    print("\nRecent alerts:")
    for a in get_recent_alerts():
        print(" ", a)
