# Where Does the Dataset is actually used? (dataset/PS_20174392719_1491204439457_log.csv)


The dataset (`dataset/PS_20174392719_1491204439457_log.csv`, the Kaggle **PaySim** mobile fraud dataset) is used in **training the machine learning model**, not during live API requests.

Here is the exact pipeline of how and where it is used:

---

### 1. In [`model/generate_training_data.py`]
```python
# --- Load real PaySim fraud amounts ---
DATASET_PATH = os.path.join(..., "dataset", "PS_20174392719_1491204439457_log.csv")
_paysim_df = pd.read_csv(DATASET_PATH, usecols=["type", "amount", "isFraud"])
_fraud_rows = _paysim_df[(_paysim_df["isFraud"] == 1) & (_paysim_df["type"].isin(["TRANSFER", "CASH_OUT"]))]
PAYSIM_AMOUNTS = _fraud_rows["amount"].dropna().tolist()
```
* **Purpose**: Rather than guessing artificial transaction amounts, it extracts real-world fraud transfer/cash-out values directly from the PaySim dataset.
* **Output**: It generates synthetic mule chains with realistic fraud amounts and computes the 4 features (`mule_score`, `burst_score`, `geo_score`, `hub_score`) to create **[`model/training_data.csv`]
---

### 2. In [`model/train_risk_model.py`]
```python
def load_data() -> pd.DataFrame:
    return pd.read_csv(os.path.join(HERE, "training_data.csv"))
```
* **Purpose**: Takes the dataset created in step 1 and trains the **XGBoost Classifier**.
* **Output**: Compiles and exports the trained model to **[`model/saved_risk_model.json`]

---

### 3. What Happens at Runtime (When You Run `uvicorn`)
In [`backend/main.py`]
* The backend does **not** read the multi-gigabyte PaySim CSV during live requests (which would be slow).
* Instead, it loads **`saved_risk_model.json`** into memory at startup. All patterns, weights, and fraud relationships learned from the dataset are encapsulated inside that model.

--- 

# What is actually being predicted and what is hardcoded?

Here is the clear breakdown of what is hardcoded, what is dynamically predicted, and how to change the hardcoded parts.

---

### 1. What is Hardcoded

1. **The ATM & Branch List** ([`data/atms.py`]
   * **12 ATMs** in Chennai with static names, IDs (`ATM001`–`ATM012`), and GPS coordinates.
   * **5 Bank Branches** with static IFSC codes and coordinates.
2. **The Account Graph** ([`data/seed_graph.pkl`]
   * 26 synthetic accounts (`VICTIM_001`, `MULE_A1`, `MULE_A2`, `MULE_A3`, etc.) with predefined transaction edges between them.
   * Each account is hard-linked to a static branch IFSC (e.g., `MULE_A3` is tied to `AXIS0005` in Nungambakkam).
3. **The Webhook Trigger** [`backend/webhook.py`]:
   * `DEMO_ENTRY_ACCOUNT = "MULE_A3"` is hardcoded.
   * `simulated_fraud_amount = 190000` is hardcoded.
   * `minutes_ago = 1` is hardcoded.
4. **Top 3 Slice** [`backend/main.py`]:
   * `[:3]` cuts off the ranking at 3 ATMs.
5. **Initial Cash-Out History** [`backend/db.py`]:
   * 4 seed rows in SQLite (`ATM001`, `ATM005`, `ATM010`) to give the model initial hub-decay history.

---

### 2. What is Actually Predicted by the ML Model

1. **The 4 Feature Calculations** [`model/scoring.py`]:
   * **`mule_score`**: Dynamically computed via graph traversal algorithms (shortest paths, node degree, connectivity back to victim accounts).
   * **`burst_score`**: Dynamically computed from transaction velocity (amount / time window).
   * **`geo_score`**: Calculated via real-time spatial distance formula between the account's branch and each ATM.
   * **`hub_score`**: Calculated via mathematical time-decay function from actual timestamps in SQLite.
2. **The Confidence Probability** [`backend/main.py`]:
   * **XGBoost Classifier (`saved_risk_model.json`)**: Takes the 4 features and predicts the exact probability (e.g., `0.2739`, `0.0820`) of cash-out at each ATM.
3. **SHAP Explanations** [`backend/main.py`]:
   * The tree explainer calculates the exact mathematical impact of each feature (why the score was raised or lowered).
4. **Ranking**:
   * The order of the ATMs is dynamically sorted based on the XGBoost output scores.

---

### 3. What You Should Do to Change the Hardcoded Things

#### A. To test different accounts and different ATM winners:
In [`backend/webhook.py`], change:
```python
DEMO_ENTRY_ACCOUNT = "MULE_C1"  # Anchored to Velachery (HDFC0003)
# OR
DEMO_ENTRY_ACCOUNT = "MULE_B1"  # Anchored to Anna Nagar (CNRB0002)
```
*If you switch to `MULE_C1` (Velachery), South Chennai ATMs (`ATM003` Velachery, `ATM007` Guindy, `ATM011` Chromepet) will start winning instead.*

#### B. To accept any account dynamically from the trigger:
In [`backend/webhook.py`], read `entry_account` and `amount` from the payment notes or request instead of hardcoding:
```python
entry_account = payment.get("notes", {}).get("account", "MULE_A3")
amount = payment.get("amount", 100) / 100
```

#### C. To add new or real ATMs and Branches:
Open [`data/atms.py`] and add new entries with their real latitude and longitude to the `ATMS` and `BRANCHES` lists.

#### D. To return more than 3 ATMs:
In [`backend/main.py`], change:
```python
# Change [:3] to [:5] or remove it completely to return all 12 ATMs:
ranked = sorted(rows, key=lambda r: r["confidence"], reverse=True)[:5]
```



