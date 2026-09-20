"""
Step 4 — FastAPI backend. This is the "Risk Prediction Engine" +
"Output & Alerts" stages from the architecture slide, wired together.

Design choice worth being able to explain to a judge: the endpoint
accepts an `entry_account` that already exists in the seed graph
(anchoring which mule chain this complaint belongs to), plus an
optional `new_hop` representing a fresh incoming transaction — this
is exactly what the Razorpay-webhook demo trigger will call: "a new
complaint just came in, attach it to this pre-seeded entry account
and predict from there."

Run it:
    uvicorn backend.main:app --reload --port 8000

Test it:
    curl -X POST http://localhost:8000/predict \
      -H "Content-Type: application/json" \
      -d '{"entry_account": "MULE_A3", "new_hop": {"amount": 190000, "minutes_ago": 5}}'
"""
import os
import sys
import pickle
import time
import math
import hashlib
from datetime import datetime, timedelta
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import networkx as nx
import xgboost as xgb
import shap
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from data.atms import ATMS, BRANCHES
from model.scoring import mule_score, burst_score, hub_score, geo_score
from backend.db import (
    init_db,
    insert_complaint,
    insert_alert,
    get_history_with_minutes_ago,
    get_recent_alerts,
    mark_reviewed,
)
from backend.webhook import router as webhook_router
from backend.checkout import router as checkout_router

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FEATURES = ["mule_score", "burst_score", "geo_score", "hub_score"]
BRANCH_LOOKUP = {b["ifsc"]: b for b in BRANCHES}
ATM_LOOKUP = {a["id"]: a for a in ATMS}

app = FastAPI(title="T.R.A.C.E. — Risk Prediction API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(webhook_router)
app.include_router(checkout_router)

# Initialize database tables on startup / import
init_db(reset=False)


@app.on_event("startup")
def startup_event():
    init_db(reset=False)


# ---------------------------------------------------------------------
# Load the seed graph and trained model ONCE at startup
# ---------------------------------------------------------------------
with open(os.path.join(BASE_DIR, "data", "seed_graph.pkl"), "rb") as f:
    SEED_GRAPH: nx.DiGraph = pickle.load(f)

MODEL = xgb.XGBClassifier()
MODEL.load_model(os.path.join(BASE_DIR, "model", "saved_risk_model.json"))
EXPLAINER = shap.TreeExplainer(MODEL)


# ---------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------
class NewHop(BaseModel):
    amount: int
    minutes_ago: int = 2  # how long ago this incoming transfer landed — small = urgent


class ComplaintInput(BaseModel):
    entry_account: str          # must already exist in the seed graph
    new_hop: Optional[NewHop] = None
    complaint_text: Optional[str] = None
    save_to_db: bool = True


class RankedPrediction(BaseModel):
    atm_id: str
    atm_name: str
    confidence: float
    top_reasons: list[str]
    features: dict[str, float]
    lat: float
    lon: float
    audit_hash: Optional[str] = None


class PredictResponse(BaseModel):
    entry_account: str
    mule_score: float
    burst_score: float
    predictions: list[RankedPrediction]


# ---------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------


def readable_reason(feature: str, value: float, contribution: float) -> str:
    labels = {
        "mule_score": "mule-chain relationship strength",
        "burst_score": "transaction burst / urgency",
        "geo_score": "geographic proximity",
        "hub_score": "historical cash-out reuse at this ATM",
    }
    direction = "raised" if contribution >= 0 else "lowered"
    return f"{labels[feature]} ({value:.2f}) {direction} the score by {abs(contribution):.2f}"


# ---------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok", "atms_loaded": len(ATMS), "graph_nodes": SEED_GRAPH.number_of_nodes()}


@app.get("/network/{entry_account}")
def get_network(entry_account: str, amount: Optional[float] = None):
    if entry_account not in SEED_GRAPH.nodes:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Get weakly connected component containing entry_account
    undirected_G = SEED_GRAPH.to_undirected()
    connected_nodes = nx.node_connected_component(undirected_G, entry_account)
    subgraph = SEED_GRAPH.subgraph(connected_nodes)
    
    # Order nodes topologically from root source (victim) to terminal cash-out mule
    try:
        ordered_node_ids = list(nx.topological_sort(subgraph))
    except Exception:
        ordered_node_ids = list(subgraph.nodes)
    
    nodes = []
    for n in ordered_node_ids:
        node_data = {"id": n}
        home_ifsc = subgraph.nodes[n].get("home_ifsc")
        if home_ifsc and home_ifsc in BRANCH_LOOKUP:
            node_data["lat"] = BRANCH_LOOKUP[home_ifsc]["lat"]
            node_data["lon"] = BRANCH_LOOKUP[home_ifsc]["lon"]
        nodes.append(node_data)
        
    raw_edges = []
    for u, v, d in subgraph.edges(data=True):
        raw_edges.append((u, v, d))
    
    # Sort edges chronologically: oldest transfer first (highest minutes_ago)
    raw_edges.sort(key=lambda e: e[2].get("minutes_ago", 0), reverse=True)

    # Scale edge amounts if amount is provided so the first transfer matches the flagged complaint amount
    first_edge_amt = raw_edges[0][2].get("amount", 200000) if raw_edges else 200000
    scale = (amount / first_edge_amt) if (amount and amount > 0 and first_edge_amt > 0) else 1.0

    edges = []
    for u, v, d in raw_edges:
        orig_amt = d.get("amount", 0)
        final_amt = int(round(orig_amt * scale)) if amount else orig_amt
        edges.append({
            "source": u,
            "target": v,
            "amount": final_amt,
            "minutes_ago": d.get("minutes_ago", 0)
        })
        
    return {"nodes": nodes, "edges": edges}


@app.post("/predict", response_model=PredictResponse)
def predict(complaint: ComplaintInput):
    if complaint.entry_account not in SEED_GRAPH.nodes:
        raise HTTPException(
            status_code=404,
            detail=f"'{complaint.entry_account}' not found in graph. "
                    f"Known accounts include: {list(SEED_GRAPH.nodes)[:8]}...",
        )

    # Work on a COPY so a live demo run never mutates the shared seed graph
    G = SEED_GRAPH.copy()

    if complaint.new_hop:
        fresh_node = f"COMPLAINT_{int(time.time() * 1000)}"
        G.add_edge(
            fresh_node,
            complaint.entry_account,
            amount=complaint.new_hop.amount,
            minutes_ago=complaint.new_hop.minutes_ago,
        )

    m_score = mule_score(G, complaint.entry_account)
    b_score = burst_score(G, complaint.entry_account)
    home_ifsc = G.nodes[complaint.entry_account].get("home_ifsc")
    if home_ifsc is None:
        raise HTTPException(status_code=400, detail=f"'{complaint.entry_account}' has no home_ifsc set")
    branch = BRANCH_LOOKUP[home_ifsc]

    history = get_history_with_minutes_ago()

    rows = []
    for atm in ATMS:
        g_score = geo_score(branch["lat"], branch["lon"], atm["lat"], atm["lon"])
        h_score = hub_score(atm["id"], history)
        rows.append({
            "atm_id": atm["id"],
            "atm_name": atm["name"],
            "mule_score": m_score,
            "burst_score": b_score,
            "geo_score": g_score,
            "hub_score": h_score,
        })

    import pandas as pd
    feat_df = pd.DataFrame(rows)[FEATURES]
    probs = MODEL.predict_proba(feat_df)[:, 1]
    shap_values = EXPLAINER.shap_values(feat_df)

    for i, row in enumerate(rows):
        row["confidence"] = float(probs[i])
        row["shap"] = dict(zip(FEATURES, shap_values[i]))

    ranked = sorted(rows, key=lambda r: r["confidence"], reverse=True)[:3]

    amount = complaint.new_hop.amount if complaint.new_hop else None
    
    complaint_id = None
    if complaint.save_to_db:
        complaint_id = insert_complaint(
            entry_account=complaint.entry_account,
            amount=amount,
            complaint_text=complaint.complaint_text,
        )

    now_iso = datetime.now().isoformat()
    predictions = []
    for i, r in enumerate(ranked):
        contribs = sorted(r["shap"].items(), key=lambda kv: abs(kv[1]), reverse=True)
        reasons = [readable_reason(feat, r[feat], val) for feat, val in contribs[:2]]
        conf = round(r["confidence"], 4)
        
        audit_hash = None
        if complaint.save_to_db and complaint_id is not None:
            audit_hash = hashlib.sha256(
                f"{complaint_id}:{r['atm_id']}:{conf}:{now_iso}".encode()
            ).hexdigest()
            is_top = (i == 0)

            # Step 5: Persist alert to SQLite (#1 updates hub_score history via is_top_prediction=1)
            insert_alert(
                complaint_id=complaint_id,
                atm_id=r["atm_id"],
                atm_name=r["atm_name"],
                confidence=conf,
                reasons=reasons,
                audit_hash=audit_hash,
                is_top_prediction=is_top,
                lat=ATM_LOOKUP[r["atm_id"]]["lat"],
                lon=ATM_LOOKUP[r["atm_id"]]["lon"],
            )

        predictions.append(RankedPrediction(
            atm_id=r["atm_id"],
            atm_name=r["atm_name"],
            confidence=conf,
            top_reasons=reasons,
            features={
                "mule_score": round(r["mule_score"], 4),
                "burst_score": round(r["burst_score"], 4),
                "geo_score": round(r["geo_score"], 4),
                "hub_score": round(r["hub_score"], 4),
            },
            lat=ATM_LOOKUP[r["atm_id"]]["lat"],
            lon=ATM_LOOKUP[r["atm_id"]]["lon"],
            audit_hash=audit_hash,
        ))

    # Step 6: Dispatch real-time Email & SMS alerts to law enforcement / nodal officers
    if complaint_id is not None and predictions:
        top_pred = predictions[0]
        try:
            from backend.notifications import dispatch_high_risk_notifications
            dispatch_high_risk_notifications(
                complaint_id=complaint_id,
                amount=int(amount) if amount else 25000,
                entry_account=complaint.entry_account,
                top_atm={
                    "atm_id": top_pred.atm_id,
                    "atm_name": top_pred.atm_name,
                    "confidence": top_pred.confidence,
                    "lat": top_pred.lat,
                    "lon": top_pred.lon,
                },
                reasons=top_pred.top_reasons,
            )
        except Exception as notify_err:
            print(f"[NOTIFICATIONS] Dispatch error: {notify_err}")

    return PredictResponse(
        entry_account=complaint.entry_account,
        mule_score=round(m_score, 4),
        burst_score=round(b_score, 4),
        predictions=predictions,
    )


@app.get("/alerts")
def get_alerts(limit: int = 20):
    return get_recent_alerts(limit=limit)


@app.post("/alerts/{alert_id}/reviewed")
def review_alert(alert_id: int):
    mark_reviewed(alert_id)
    return {"status": "success", "alert_id": alert_id}
