"""
Order-creation endpoint for Razorpay test-mode Checkout.

Why this exists: Checkout.js can't just be pointed at a static URL —
it needs a fresh "order" object created via the Razorpay API first,
then the JS widget opens using that order's ID. This endpoint does
that order-creation step. Call it once per test attempt (the HTML
page below does this automatically on button click) — you never touch
the Razorpay dashboard for this, unlike Payment Links.

Setup:
  export RAZORPAY_KEY_ID="rzp_test_xxxxxxxxxx"
  export RAZORPAY_KEY_SECRET="your_test_key_secret"

This uses the official `razorpay` Python SDK (pip install razorpay).
"""
import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import APIRouter, HTTPException
import razorpay

router = APIRouter()

RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")

_client = None


def get_client():
    global _client
    key_id = os.environ.get("RAZORPAY_KEY_ID", RAZORPAY_KEY_ID)
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET", RAZORPAY_KEY_SECRET)
    if _client is None and key_id and key_secret:
        _client = razorpay.Client(auth=(key_id, key_secret))
    return _client, key_id


from pydantic import BaseModel
from typing import Optional

class CreateOrderRequest(BaseModel):
    amount: Optional[int] = 25000  # in Rupees, defaults to ₹25,000


@router.post("/create-order")
def create_order(req: Optional[CreateOrderRequest] = None):
    client, key_id = get_client()
    if client is None:
        raise HTTPException(
            status_code=500,
            detail="RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set — export them before starting the server.",
        )
    
    amount_rupees = req.amount if (req and req.amount and req.amount > 0) else 25000
    amount_paise = int(amount_rupees * 100)

    order = client.order.create({
        "amount": amount_paise,
        "currency": "INR",
        "payment_capture": 1,    # auto-capture, so payment.captured fires immediately
    })
    return {
        "order_id": order["id"],
        "amount": order["amount"],
        "amount_rupees": amount_rupees,
        "key_id": key_id
    }
