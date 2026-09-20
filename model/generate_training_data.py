"""
Step 3a — Generate synthetic training data for the XGBoost risk model.

Each "case" = one synthetic fraud complaint: a randomly generated
mule chain (2-4 hops, varied timing/amounts) with a TRUE cash-out ATM
assigned to it. A handful of ATMs are deliberately made "hubs" that
get reused across many cases (mirroring the real-world pattern that
fraud rings reuse the same cash-out points) — this is what gives
hub_score real signal to learn from, not just noise.

For each case we compute all 4 scores against EVERY candidate ATM,
producing one training row per (case, atm) pair with label=1 for the
true ATM and label=0 for the rest. This frames prediction as: "for
each candidate ATM, how likely is THIS to be the cash-out point" —
which is what gets ranked at inference time.

Note: PaySim (kaggle.com) is not reachable from this environment, so
amount/timing distributions here are reasoned approximations rather
than empirically pulled from PaySim's CASH_OUT rows. Swap in real
PaySim-derived stats for MEAN_AMOUNT / TIMING ranges below once
downloaded locally — the shape of this script doesn't change.
"""
import random
import math
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import networkx as nx
import pandas as pd
from data.atms import ATMS, BRANCHES
from model.scoring import mule_score, burst_score, hub_score, geo_score

random.seed(7)

# ATMs 001, 005, 010 are deliberately "hub" ATMs — fraud rings favor
# reusing them, mirroring real hub-reuse behavior
HUB_ATM_IDS = {"ATM001", "ATM005", "ATM010"}
BRANCH_IDS = [b["ifsc"] for b in BRANCHES]
BRANCH_LOOKUP = {b["ifsc"]: b for b in BRANCHES}
ATM_LOOKUP = {a["id"]: a for a in ATMS}

# --- Load real PaySim fraud amounts ---
DATASET_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dataset", "PS_20174392719_1491204439457_log.csv")
print("Loading PaySim fraud amounts...")
_paysim_df = pd.read_csv(DATASET_PATH, usecols=["type", "amount", "isFraud"])
_fraud_rows = _paysim_df[(_paysim_df["isFraud"] == 1) & (_paysim_df["type"].isin(["TRANSFER", "CASH_OUT"]))]
PAYSIM_AMOUNTS = _fraud_rows["amount"].dropna().tolist()
print(f"Loaded {len(PAYSIM_AMOUNTS)} real fraud transaction amounts.")


def build_random_chain(case_id: int) -> nx.DiGraph:
    """One synthetic mule chain: victim -> 1-3 mule hops."""
    G = nx.DiGraph()
    n_hops = random.choice([2, 2, 3, 3, 4])  # weighted toward 2-3 hops
    is_fast = random.random() < 0.6           # 60% of chains are "urgent" fast fraud

    victim = f"V{case_id}"
    prev = victim
    t = random.randint(60, 400) if is_fast else random.randint(500, 2000)
    amount = int(random.choice(PAYSIM_AMOUNTS))

    for hop in range(n_hops):
        node = f"M{case_id}_{hop}"
        G.add_edge(prev, node, amount=amount, minutes_ago=t)
        prev = node
        amount = int(amount * random.uniform(0.90, 0.99))  # small cut taken each hop
        gap = random.randint(5, 40) if is_fast else random.randint(100, 800)
        t = max(t - gap, 1)

    for node in G.nodes():
        G.nodes[node]["home_ifsc"] = random.choice(BRANCH_IDS)

    last_mule = prev
    return G, last_mule


def pick_true_atm(last_mule_branch: dict) -> str:
    """70% of the time: pick a hub ATM (weighted by proximity).
    30%: pick any nearby non-hub ATM. Mirrors real reuse behavior."""
    if random.random() < 0.7:
        candidates = list(HUB_ATM_IDS)
    else:
        candidates = [a["id"] for a in ATMS if a["id"] not in HUB_ATM_IDS]

    # weight by geo proximity to the mule's home branch
    weights = []
    for atm_id in candidates:
        atm = ATM_LOOKUP[atm_id]
        g = geo_score(last_mule_branch["lat"], last_mule_branch["lon"], atm["lat"], atm["lon"])
        weights.append(max(g, 0.01))
    return random.choices(candidates, weights=weights, k=1)[0]


def generate_dataset(n_cases: int = 300) -> pd.DataFrame:
    rows = []
    cashout_history = []  # grows over time -> feeds hub_score causally

    for case_id in range(n_cases):
        G, last_mule = build_random_chain(case_id)
        branch = BRANCH_LOOKUP[G.nodes[last_mule]["home_ifsc"]]
        true_atm = pick_true_atm(branch)

        m_score = mule_score(G, last_mule)
        b_score = burst_score(G, last_mule)

        # one row per candidate ATM
        for atm in ATMS:
            g_score = geo_score(branch["lat"], branch["lon"], atm["lat"], atm["lon"])
            h_score = hub_score(atm["id"], cashout_history)  # only PAST history — no leakage
            rows.append({
                "case_id": case_id,
                "atm_id": atm["id"],
                "mule_score": m_score,
                "burst_score": b_score,
                "geo_score": g_score,
                "hub_score": h_score,
                "label": 1 if atm["id"] == true_atm else 0,
            })

        # record this case's cash-out into history (with a "days ago" offset
        # so later cases see earlier ones as progressively more historical)
        cashout_history.append({"atm_id": true_atm, "minutes_ago": (n_cases - case_id) * 15})

    return pd.DataFrame(rows)


if __name__ == "__main__":
    df = generate_dataset(300)
    print(f"Generated {len(df)} rows across {df['case_id'].nunique()} cases")
    print(f"Positive labels: {df['label'].sum()}  ({df['label'].mean()*100:.1f}% of rows)")
    print("\nSample rows:")
    print(df.head(8).to_string(index=False))
    out_path = os.path.join(os.path.dirname(__file__), "training_data.csv")
    df.to_csv(out_path, index=False)
    print(f"\nSaved -> model/training_data.csv")
