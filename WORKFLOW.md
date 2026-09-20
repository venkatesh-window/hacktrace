STEP 1 — You trigger a real payment (on stage, live)
  You (or a teammate) make a ₹1 test-mode Razorpay payment
  via Razorpay Checkout or a payment link
        ↓
STEP 2 — Razorpay's servers fire a webhook
  POST https://<your-ngrok-url>/webhook/razorpay
  Headers: X-Razorpay-Signature: <HMAC-SHA256 of the body>
  Body: { "event": "payment.captured", "payload": {...} }
        ↓
STEP 3 — backend/webhook.py receives it
  (a) Verifies the signature (HMAC check) — rejects with 401 if forged
  (b) Checks event == "payment.captured" — ignores anything else
  (c) IGNORES the actual payment amount (it's just ₹1, meaningless)
  (d) Constructs a fake "new complaint": entry_account="MULE_A3",
      new_hop={amount: 190000, minutes_ago: 1}
        ↓
STEP 4 — Calls your REAL prediction pipeline internally
  Same function /predict already uses — nothing special happens here
  just because it came from a webhook instead of curl:
    1. Attach the new hop to MULE_A3 in a COPY of the seed graph
    2. Compute mule_score, burst_score at MULE_A3
    3. Compute geo_score, hub_score against all 12 ATMs
    4. XGBoost ranks the top-3 ATMs
    5. SHAP explains each ranking
        ↓
STEP 5 — Persist to SQLite
  Complaint + all 3 ranked alerts written to trace.db
  #1 prediction also updates hub_score history for future calls
  Each alert gets a SHA-256 audit hash
        ↓
STEP 6 — Response returned to Razorpay (just an HTTP 200 ack)
  AND simultaneously available at GET /alerts for anyone polling it
        ↓
STEP 7 — Dashboard (not yet built — this is Step 6 in our build order)
  Polls GET /alerts every 2-3s, sees the new row, renders:
    - Map pin lighting up on the predicted ATM
    - Notification card: confidence %, SHAP reasons, "Mark reviewed" button

# Actual Workflow

Here is the step-by-step path the input takes from start to final output:

```
[ Input: Webhook / Frontend ]
          │
          ▼
1. backend/main.py  ──> (Receives entry_account, amount, minutes_ago)
          │
          ▼
2. model/scoring.py ──> (Calculates 4 numerical features for each ATM)
          │             ├── mule_score  (Graph analysis on seed_graph.pkl)
          │             ├── burst_score (Velocity/urgency of money incoming)
          │             ├── geo_score   (Distance between branch IFSC and ATM)
          │             └── hub_score   (Historical cash-out recency from trace.db)
          │
          ▼
3. XGBoost Model    ──> (saved_risk_model.json + SHAP TreeExplainer)
          │             ├── Predicts probability score (0.0 to 1.0)
          │             └── Explains why (top 2 positive/negative reasons)
          │
          ▼
4. backend/db.py    ──> (Slices top 3, generates SHA-256 audit hash)
          │             ├── Writes complaint into 'complaints' table
          │             └── Writes top 3 alerts + lat/lon into 'alerts' table
          │
          ▼
[ Final Output: GET /alerts & POST /predict ]
```

---

### Detailed Breakdown of the 5 Stages:

#### 1. Input Ingestion
* **Trigger**: Either a Razorpay webhook (`/webhook/razorpay` in [`backend/webhook.py`]) or a direct call (`POST /predict` in [`backend/main.py`]).
* **Data passed**: `entry_account` (e.g. `MULE_A3`), `amount` (e.g. ₹1,90,000), and `minutes_ago` (e.g. 1 min).

#### 2. Feature Extraction ([`model/scoring.py`])
For all 12 ATMs in Chennai, the system calculates 4 features:
1. **`mule_score`**: Analyzes the account's position and degree in the transaction network graph ([`data/seed_graph.pkl`]).
2. **`burst_score`**: Evaluates how quickly and urgently large amounts landed in this account.
3. **`geo_score`**: Takes the home branch coordinates of the mule account (from IFSC in [`data/atms.py`]) and calculates spatial distance decay to each ATM.
4. **`hub_score`**: Queries SQLite ([`backend/db.py`]) to see if this ATM was recently used for previous cash-outs.

#### 3. ML Risk Prediction ([`model/saved_risk_model.json`])
* The 4 features are passed as a table into the **XGBoost Classifier**.
* It outputs a **confidence probability** for every ATM.
* **SHAP TreeExplainer** calculates feature contributions to generate human-readable explanations (e.g. *"geographic proximity (0.90) raised the score by 0.95"*).

#### 4. Ranking, Auditing & Persistence ([`backend/db.py`])
* Sorts ATMs by confidence descending and takes the top 3 (`[:3]`).
* Computes an immutable SHA-256 `audit_hash`: `sha256(complaint_id : atm_id : confidence : timestamp)`.
* Saves the complaint and alerts (including coordinates `lat`, `lon`, and `bank_name`) into `trace.db`.

#### 5. Output Delivery
* Returned directly as JSON to the frontend caller and served live at **`GET http://localhost:8000/alerts`** for the officer dashboard and map view.

