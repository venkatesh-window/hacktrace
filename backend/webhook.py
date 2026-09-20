"""
Step 5b — Razorpay webhook handler.

This is your live-demo trigger: a real ₹1 test-mode Razorpay payment
fires a real webhook to this endpoint, which is treated as "a new
fraud complaint just entered the system" and calls the SAME internal
prediction logic /predict already uses (Step 4).

SIGNATURE VERIFICATION: Razorpay signs each webhook with HMAC-SHA256
of the raw request body, using the webhook secret you set in the
Razorpay dashboard, sent in the `X-Razorpay-Signature` header. This
is the standard scheme — double-check the exact header name and
signing details against your Razorpay dashboard's webhook docs when
you set this up, since webhook configuration details can change and
this hasn't been tested against a real Razorpay account in this
environment (razorpay.com isn't reachable from this sandbox).

SETUP CHECKLIST (do this well before your demo slot — see earlier
discussion on why this is the highest-risk external dependency):
  1. Create a Razorpay test-mode account, get API keys
  2. In Razorpay dashboard: Settings -> Webhooks -> add endpoint,
     set a webhook secret, subscribe to "payment.captured"
  3. Run: ngrok http 8000
  4. Set the webhook URL in Razorpay to <ngrok-url>/webhook/razorpay
  5. Set RAZORPAY_WEBHOOK_SECRET below (or as an env var) to match
  6. Make a real test-mode payment, confirm this endpoint fires

Run it (same server as main.py — this router gets included there):
    uvicorn backend.main:app --reload --port 8000
"""
import os
import hmac
import hashlib
import json
from dotenv import load_dotenv
load_dotenv()

from fastapi import APIRouter, Request, HTTPException

router = APIRouter()

RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET")

# Which pre-seeded account this demo trigger attaches new complaints
# to — change this to whichever mule chain you want live on stage.
DEMO_ENTRY_ACCOUNT = "MULE_A3"


def verify_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/webhook/razorpay")
async def razorpay_webhook(request: Request):
    raw_body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")

    # skip verification only in the placeholder-secret dev state, so
    # this is testable before you've wired up a real Razorpay account
    secret = RAZORPAY_WEBHOOK_SECRET
    if secret and secret != "REPLACE_WITH_YOUR_WEBHOOK_SECRET":
        if not signature or not verify_signature(raw_body, signature, secret):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event = payload.get("event", "")
    if event != "payment.captured":
        # acknowledge other event types without acting on them
        return {"status": "ignored", "event": event}

    payment = payload.get("payload", {}).get("payment", {}).get("entity", {})
    amount_paise = payment.get("amount", 0)
    payment_id = payment.get("id", "unknown")

    # Convert actual captured payment from paise to rupees
    amount_rupees = int(amount_paise // 100) if amount_paise > 0 else 25000

    # call the SAME prediction pipeline /predict uses — import locally
    # to avoid a circular import between main.py and this router
    from backend.main import ComplaintInput, NewHop, predict as run_prediction

    complaint = ComplaintInput(
        entry_account=DEMO_ENTRY_ACCOUNT,
        new_hop=NewHop(amount=amount_rupees, minutes_ago=1),
        complaint_text=f"Live demo trigger via Razorpay payment {payment_id}",
    )
    result = run_prediction(complaint)

    return {
        "status": "processed",
        "razorpay_payment_id": payment_id,
        "razorpay_amount_paise": amount_paise,
        "prediction": result,
    }
