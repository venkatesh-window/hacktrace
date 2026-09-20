# T.R.A.C.E. — Threat Routing Analysis for Cybercrime Enforcement

> **Real-time financial transaction tracing, mule network intelligence, and predictive ATM cash-out risk modeling.**

T.R.A.C.E. is an intelligence and enforcement platform that intercepts incoming cyber fraud complaints, reconstructs mule account transaction networks, and leverages machine learning to predict the high-probability physical ATMs where criminals will attempt cash-out operations.

---

## Architecture & Data Flow

```
[ Incoming Complaint / Webhook Trigger ]
                   │
                   ▼
       FastAPI Risk Engine (`backend/main.py`)
                   │
                   ├──> 1. Graph Analysis (`model/scoring.py` + `data/seed_graph.pkl`)
                   │       • mule_score: Network centrality & path depth
                   │       • burst_score: Transaction velocity & urgency
                   │
                   ├──> 2. Spatial & Historical Scoring (`data/atms.py` + `backend/db.py`)
                   │       • geo_score: Haversine distance decay from mule branch to ATMs
                   │       • hub_score: Time-decayed historical cash-out reuse
                   │
                   ▼
         XGBoost Risk Combiner (`model/saved_risk_model.json`)
                   │
                   ├──> Probability confidence score (0.0 to 1.0)
                   └──> SHAP Explainability (feature attribution factors)
                   │
                   ▼
       SQLite Persistence & Audit Trail (`backend/db.py`)
                   │
                   ├──> Immutable SHA-256 Audit Hash
                   └──> Enriched with Lat, Lon & Bank metadata
                   │
                   ▼
      Enforcement Officers Dashboard (`frontend/`)
          • MapLibre GL Interactive ATM Map
          • Real-time Alert Dispatch & Polling (`GET /alerts`)
```

---

## Core Features

- **Transaction Graph Reconstruction**: Traverses mule accounts using directed graph analysis (NetworkX) to score chain depth and connectivity back to victims.
- **Multimodal Risk Scoring**: Combines graph topology, transfer velocity, geographic spatial decay, and temporal ATM reuse patterns into a unified predictive model.
- **Explainable AI (XAI)**: Every prediction is accompanied by SHAP tree-attribution reasons explaining *why* an ATM was flagged (e.g., proximity impact vs. mule-chain strength).
- **Cryptographic Audit Trail**: Every alert is permanently hashed (`SHA-256(complaint_id : atm_id : confidence : timestamp)`) to ensure integrity for evidence and chain-of-custody.
- **Live Demo Integration**: Triggered via a real test payment through Razorpay webhooks (`backend/webhook.py`), firing the entire ML inference and alerting pipeline end-to-end.
- **Interactive Officer Dashboard**: Built with React, TypeScript, Vite, and MapLibre GL, rendering live heatmaps, network graph visualizations, and alert dispatch queues.

---

## Repository Structure

```
.
├── backend/
│   ├── main.py              # FastAPI server (predict, alerts, network, health)
│   ├── db.py                # SQLite layer, migrations, audit logging, backfilling
│   ├── webhook.py           # Razorpay webhook listener (live demo trigger)
│   ├── checkout.py          # Razorpay order generation endpoint
│   ├── test_predict.py      # Automated test client for inference & ranking
│   └── trace.db             # Zero-ops SQLite database
├── data/
│   ├── atms.py              # Chennai ATM coordinates & branch IFSC directory
│   ├── build_graph.py       # Seed graph generation (mule chains + noise)
│   └── seed_graph.pkl       # Serialized NetworkX transaction graph
├── model/
│   ├── scoring.py           # Mathematical scoring algorithms (mule, burst, geo, hub)
│   ├── generate_training_data.py # PaySim fraud amount ingestion & synthetic cases
│   ├── train_risk_model.py  # XGBoost training & SHAP integration
│   ├── training_data.csv    # Generated labeled dataset
│   └── saved_risk_model.json# Serialized XGBoost production model
├── dataset/
│   └── PS_20174392719_*.csv # Kaggle PaySim financial fraud benchmark dataset
├── frontend/
│   ├── src/
│   │   ├── components/      # UI components & graph visualizations
│   │   ├── pages/           # Dashboard, ATM Intelligence, Live Trace
│   │   ├── services/api.ts  # Backend API client
│   │   └── types/trace.ts   # TypeScript interfaces (Predictions, Alerts, Nodes)
│   ├── checkout.html        # Demo trigger page (Razorpay checkout)
│   └── package.json
├── SCORING.md               # Mathematical formulation of all scoring metrics
├── WORKFLOW.md              # Detailed end-to-end execution workflow
└── TECHNICAL.md             # Dataset usage and prediction vs. hardcoded details
```

---

## Getting Started

### 1. Backend Setup

```bash
# 1. Activate Python virtual environment
source venv/bin/activate    # On Windows: venv\Scripts\activate

# 2. Install dependencies
pip install fastapi uvicorn networkx xgboost shap pandas scikit-learn python-dotenv razorpay

# 3. Start the FastAPI backend
uvicorn backend.main:app --reload --port 8000
```
API server runs at `http://localhost:8000`. Interactive OpenAPI documentation is available at `http://localhost:8000/docs`.

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```
Frontend runs at `http://localhost:5173`.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Service health status, node count & ATM directory size |
| `POST` | `/predict` | Ingests a complaint, computes scores, returns top-3 ATMs with SHAP reasons |
| `GET` | `/alerts` | Returns recent alerts with coordinates (`lat`, `lon`, `latitude`, `longitude`) & bank details |
| `POST` | `/alerts/{id}/reviewed` | Marks an alert as reviewed by an officer |
| `GET` | `/network/{account}` | Returns connected subgraphs (nodes & edges) for network visualization |
| `POST` | `/webhook/razorpay` | Receives live Razorpay webhook and executes pipeline automatically |
| `POST` | `/create-order` | Creates a ₹1 test order for checkout demo |

---

## Testing & Verification

Run the inference pipeline test suite:
```bash
venv/bin/python3 backend/test_predict.py
```

Test the live `/alerts` endpoint:
```bash
curl -s http://localhost:8000/alerts?limit=2
```

Sample Response:
```json
[
  {
    "id": 29,
    "complaint_id": 9,
    "atm_id": "ATM010",
    "atm_name": "Canara Bank, Perambur",
    "bank_name": "Canara Bank, Perambur",
    "confidence": 0.082,
    "lat": 13.1141,
    "lon": 80.232,
    "latitude": 13.1141,
    "longitude": 80.232,
    "reasons": [
      "mule-chain relationship strength (0.61) raised the score by 0.19",
      "historical cash-out reuse at this ATM (0.31) lowered the score by 0.16"
    ],
    "created_at": "2026-08-30T12:22:15.981988",
    "reviewed": 0,
    "audit_hash": "d950710c177fe81c036401436c65c573b17077c52a2cbbcbaccc1fb24ffba469",
    "is_top_prediction": 0
  }
]
```

---

## Deep-Dive Documentation

- **[SCORING.md](SCORING.md)**: Mathematical specifications for `mule_score`, `burst_score`, `geo_score`, and `hub_score`.
- **[WORKFLOW.md](WORKFLOW.md)**: End-to-end execution path from trigger to officer response.
- **[TECHNICAL.md](TECHNICAL.md)**: Dataset utilization (PaySim) and breakdown of predicted vs. simulated parameters.
