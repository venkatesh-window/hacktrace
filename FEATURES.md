

# Features As of Step - 4: 

---

### 1. Data & Network Graph Layer

* **Chennai ATM & Branch Geographic Registry**:
  * **12 real ATM locations** across key Chennai hubs (T Nagar, Anna Nagar, Velachery, Adyar, Mylapore, Porur, Tambaram, etc.) with coordinates.
  * **5 bank branch anchors** mapped to IFSC codes (`SBIN0001`, `CNRB0002`, etc.) to locate each account's home branch.
* **Realistic Directed Transaction Graph**:
  * **Chain 1 (Fast 3-Hop Fraud)**: `VICTIM_001` $\rightarrow$ `MULE_A1` $\rightarrow$ `MULE_A2` $\rightarrow$ `MULE_A3` (rapid money velocity).
  * **Chain 2 (Medium 2-Hop Fraud)**: `VICTIM_002` $\rightarrow$ `MULE_B1` $\rightarrow$ `MULE_B2`.
  * **Chain 3 (Slow 4-Hop Fraud)**: Tests burst score differentiation for spread-out transfers.
  * **Legitimate Noise Accounts**: Payroll-style high fan-in accounts (`PAYROLL_ACC`) and cold/dormant accounts (`MISC_SRC` $\rightarrow$ `MISC_DST`) to prevent false positives.

---

### 2. Heuristic Scoring Engine 1

Four lightweight, closed-form heuristic scoring functions, each normalized in $[0, 1]$:

1. **`mule_score(G, account)`** *(GraphSAGE substitute)*:
   * **Fan ratio**: Ratio of incoming to outgoing connections.
   * **Recency gating**: Exponential decay preventing old payroll accounts from scoring high.
   * **Holding time**: Penalizes money that moves forward too quickly.
   * **Pass-through ratio**: Compares incoming vs. outgoing transaction amounts.
2. **`burst_score(G, account)`** *(Hawkes Process substitute)*:
   * Analyzes temporal clustering of transactions and inter-arrival gaps.
3. **`hub_score(atm_id, cashout_history)`** *(Centrality substitute)*:
   * Calculates recency-weighted frequency of ATM reuse by fraud rings (1-week half-life).
4. **`geo_score(mule_lat, mule_lon, atm_lat, atm_lon)`** *(Rossmo Profiling substitute)*:
   * **Haversine great-circle distance** calculation.
   * **1.5 km buffer zone**: Suppresses probability directly adjacent to the mule's own branch.
   * **Exponential distance decay** beyond the buffer edge.

---

### 3. Machine Learning & Explainability Engine

* **Synthetic Data Generation with Real PaySim Calibration**:
  * Generates 300 multi-hop cases $\times$ 12 candidate ATMs = **3,600 training rows**.
  * **Real PaySim integration**: Samples real amounts from 8,213 fraudulent `TRANSFER` & `CASH_OUT` transactions.
  * **Hub ATM reuse simulation**: 70% probability bias toward known hub ATMs (`ATM001`, `ATM005`, `ATM010`).
  * Simulates accumulating cash-out history chronologically without future data leakage.
* **XGBoost Risk Combiner & Ranking**:
  * Learns the optimal weights combining the 4 heuristic scores into an ATM cash-out probability.
  * **Chronological evaluation**: **70.7% Precision@3** (the true ATM is in the top-3 predictions ~7 out of 10 times).
  * **SHAP Explainability**: Integrates `TreeExplainer` to compute exact feature attribution values per candidate ATM.

---

### 4. API & Real-Time Backend

* **FastAPI Microservice**:
  * **`GET /health`**: Returns system status, number of active ATMs, and graph nodes.
  * **`POST /predict`**:
    * Accepts an `entry_account` (from seed graph) + optional `new_hop` (amount & minutes_ago simulating an incoming complaint).
    * Runs on an immutable copy of the graph to avoid mutating baseline data.
    * Computes scores for all 12 candidate ATMs and ranks the **Top-3 most likely cash-out locations**.
    * Translates raw SHAP values into **plain-English reasons** (e.g. *"geographic proximity (0.90) raised the score by 1.73"*).
* **Live "Learning" Demo Feature**:
  * Manages an in-memory `ALERT_HISTORY`. 
  * Calling the endpoint repeatedly with the same case visibly **increases the winning ATM's `hub_score`** in real-time, demonstrating live fraud-pattern adaptation on stage.

---

### 5. Automated Verification & Testing

* End-to-end integration test client testing 4 scenarios:
  1. Health check verification.
  2. Baseline prediction on an existing mule chain (`MULE_A3`).
  3. Live complaint trigger with a fresh urgent incoming transfer.
  4. Repeated trigger demonstrating dynamic `hub_score` increase.
  5. Clean `HTTP 404` error handling for unrecognized accounts.

---

### 6. Documentation

* **SCORING.md**: Full mathematical formulas, diagrams, and theoretical justifications.
* **README.md**: Project architecture, pipeline execution guide, evaluation metrics, and API curl examples.