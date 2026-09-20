"""
Step 4 test — exercises /predict exactly the way curl/Postman would,
using FastAPI's TestClient (no need to run a live server for this).

Run: PYTHONPATH=. python backend/test_predict.py
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def call(entry_account, new_hop=None, label=""):
    payload = {"entry_account": entry_account}
    if new_hop:
        payload["new_hop"] = new_hop
    resp = client.post("/predict", json=payload)
    print(f"\n{'='*70}\n{label}  ->  HTTP {resp.status_code}")
    if resp.status_code != 200:
        print(resp.json())
        return
    data = resp.json()
    print(f"entry_account={data['entry_account']}  mule_score={data['mule_score']}  burst_score={data['burst_score']}")
    for i, p in enumerate(data["predictions"], 1):
        print(f"  #{i}  {p['atm_id']} ({p['atm_name']})  confidence={p['confidence']}")
        for reason in p["top_reasons"]:
            print(f"       - {reason}")


if __name__ == "__main__":
    print("Health check:", client.get("/health").json())

    # Case 1: existing mule chain terminal node, no new hop
    call("MULE_A3", label="Existing mule chain (MULE_A3, no new hop)")

    # Case 2: simulates the live Razorpay-webhook trigger — a fresh
    # urgent incoming transfer just landed on a pre-seeded entry account
    call("MULE_A3", new_hop={"amount": 190000, "minutes_ago": 2},
         label="LIVE DEMO TRIGGER — fresh urgent hop into MULE_A3")

    # Case 3: run the SAME call again — hub_score for the winning ATM
    # from case 2 should now be higher, since it was just appended to
    # ALERT_HISTORY
    call("MULE_A3", new_hop={"amount": 190000, "minutes_ago": 2},
         label="Same trigger again — check hub_score rose for reused ATM")

    # Case 4: error handling — unknown account
    call("NOT_A_REAL_ACCOUNT", label="Unknown account (should 404 cleanly)")
