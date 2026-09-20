"""
Step 5b test — simulates what Razorpay's servers would actually send,
including a correctly-computed HMAC signature, so signature
verification is tested WITHOUT needing a live Razorpay account or
network access to razorpay.com (not reachable from this environment).

Run: PYTHONPATH=. python backend/test_webhook.py
"""
import sys, os, json, hmac, hashlib
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
import backend.webhook as webhook_module
from backend.main import app

client = TestClient(app)

TEST_SECRET = "test_webhook_secret_12345"


def build_payload(payment_id="pay_TEST123", amount_paise=100, event="payment.captured"):
    return {
        "event": event,
        "payload": {
            "payment": {
                "entity": {
                    "id": payment_id,
                    "amount": amount_paise,
                    "status": "captured",
                }
            }
        },
    }


def sign(body_bytes: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), body_bytes, hashlib.sha256).hexdigest()


def send(payload: dict, secret_to_sign_with: str, expect_status: int, label: str):
    body_bytes = json.dumps(payload).encode()
    signature = sign(body_bytes, secret_to_sign_with)
    resp = client.post(
        "/webhook/razorpay",
        content=body_bytes,
        headers={"Content-Type": "application/json", "X-Razorpay-Signature": signature},
    )
    status_ok = resp.status_code == expect_status
    print(f"\n{'='*70}\n{label}")
    print(f"  expected HTTP {expect_status}, got {resp.status_code}  ->  {'PASS' if status_ok else 'FAIL'}")
    print(f"  response: {json.dumps(resp.json(), indent=2, default=str)[:500]}")
    return resp


if __name__ == "__main__":
    # --- Test 1: signature verification is ON, correct secret used ---
    webhook_module.RAZORPAY_WEBHOOK_SECRET = TEST_SECRET
    send(build_payload(), TEST_SECRET, 200, "Valid signature, payment.captured -> should process and predict")

    # --- Test 2: wrong secret (simulates a forged/incorrect webhook) ---
    send(build_payload(), "wrong_secret_attempt", 401, "Invalid signature -> should reject with 401")

    # --- Test 3: correct signature, but a non-payment event ---
    send(build_payload(event="payment.failed"), TEST_SECRET, 200, "Valid signature, wrong event type -> should ignore, not predict")

    # --- Test 4: dev mode (placeholder secret) skips verification ---
    webhook_module.RAZORPAY_WEBHOOK_SECRET = "REPLACE_WITH_YOUR_WEBHOOK_SECRET"
    send(build_payload(), "any_random_string", 200, "Dev mode (no real secret set yet) -> verification skipped, still processes")
