"""
T.R.A.C.E. Officer Notification Dispatcher
Sends automated, real-time Email and SMS forensic alerts to cyber cell officers,
field patrol units, and bank nodal officers when high-risk cash-out activity is detected.
"""

import os
import smtplib
import threading
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import httpx
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("trace.notifications")


def _is_placeholder(val: str | None) -> bool:
    if not val:
        return True
    val = val.strip().lower()
    return val in {"", "your_email@gmail.com", "your_app_password_here", "your_fast2sms_api_key_here", "your_twilio_sid_here", "none"}


def send_sms_alert(complaint_id: int, amount: int, entry_account: str, atm: dict, reasons: list[str]) -> bool:
    """Dispatches SMS alert to law enforcement / bank nodal officers."""
    phones_raw = os.environ.get("OFFICER_PHONES", "")
    if _is_placeholder(phones_raw):
        logger.info("[SMS ALERT] Skipped: OFFICER_PHONES not configured in .env")
        return False

    phone_list = [p.strip() for p in phones_raw.split(",") if p.strip()]
    if not phone_list:
        return False

    atm_name = atm.get("atm_name", "Unknown ATM")
    confidence = atm.get("confidence", 0.0)
    lat = atm.get("lat")
    lon = atm.get("lon")
    map_link = f"https://maps.google.com/?q={lat},{lon}" if (lat and lon) else "N/A"
    top_reason = reasons[0] if reasons else "High anomaly velocity"

    message = (
        f"[T.R.A.C.E. ALERT] HIGH-RISK CASH-OUT IMMINENT\n"
        f"Complaint: CMP-{complaint_id}\n"
        f"Amount: Rs. {amount:,}\n"
        f"Mule Acct: {entry_account}\n"
        f"Target ATM: {atm_name} ({confidence * 100:.1f}% Risk)\n"
        f"GPS Intercept: {map_link}\n"
        f"Driver: {top_reason}\n"
        f"Action: Dispatch field patrol immediately."
    )

    # 1. Fast2SMS Provider (Popular in India)
    fast2sms_key = os.environ.get("FAST2SMS_API_KEY", "").strip()
    if not _is_placeholder(fast2sms_key):
        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(
                    "https://www.fast2sms.com/dev/bulkV2",
                    headers={"authorization": fast2sms_key},
                    json={
                        "route": "q",
                        "message": message,
                        "language": "english",
                        "flash": 0,
                        "numbers": ",".join(phone_list),
                    },
                )
                logger.info(f"[SMS ALERT] Fast2SMS dispatched: status={resp.status_code}")
                return resp.status_code == 200
        except Exception as e:
            logger.error(f"[SMS ALERT] Fast2SMS dispatch failed: {e}")

    # 2. Twilio Provider (Global standard)
    twilio_sid = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
    twilio_auth = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
    twilio_from = os.environ.get("TWILIO_FROM_NUMBER", "").strip()

    if not _is_placeholder(twilio_sid) and not _is_placeholder(twilio_auth) and not _is_placeholder(twilio_from):
        try:
            success = True
            with httpx.Client(timeout=10.0) as client:
                for to_phone in phone_list:
                    formatted_phone = to_phone if to_phone.startswith("+") else f"+91{to_phone}"
                    resp = client.post(
                        f"https://api.twilio.com/2010-04-01/Accounts/{twilio_sid}/Messages.json",
                        auth=(twilio_sid, twilio_auth),
                        data={
                            "From": twilio_from,
                            "To": formatted_phone,
                            "Body": message,
                        },
                    )
                    if resp.status_code not in (200, 201):
                        success = False
                        logger.error(f"[SMS ALERT] Twilio failed for {to_phone}: {resp.text}")
                return success
        except Exception as e:
            logger.error(f"[SMS ALERT] Twilio dispatch failed: {e}")

    logger.info(f"[SMS ALERT] Ready to send (simulate mode). Content:\n{message}")
    return True


def send_email_alert(complaint_id: int, amount: int, entry_account: str, atm: dict, reasons: list[str]) -> bool:
    """Dispatches rich HTML forensic alert email to officers."""
    sender_email = os.environ.get("ALERT_SENDER_EMAIL", "").strip()
    sender_password = os.environ.get("ALERT_SENDER_PASSWORD", "").strip()
    smtp_server = os.environ.get("SMTP_SERVER", "smtp.gmail.com").strip()
    smtp_port = int(os.environ.get("SMTP_PORT", "587").strip() or 587)
    officer_emails_raw = os.environ.get("OFFICER_EMAILS", "").strip()

    if _is_placeholder(sender_email) or _is_placeholder(sender_password) or _is_placeholder(officer_emails_raw):
        logger.info("[EMAIL ALERT] Skipped: ALERT_SENDER_EMAIL / ALERT_SENDER_PASSWORD / OFFICER_EMAILS not configured in .env")
        return False

    recipient_list = [e.strip() for e in officer_emails_raw.split(",") if e.strip()]
    if not recipient_list:
        return False

    atm_name = atm.get("atm_name", "Unknown ATM")
    confidence = atm.get("confidence", 0.0)
    lat = atm.get("lat")
    lon = atm.get("lon")
    map_link = f"https://maps.google.com/?q={lat},{lon}" if (lat and lon) else "#"

    subject = f"T.R.A.C.E. Intercept Alert: High-Risk Cash-Out Detected (CMP-{complaint_id})"

    plain_text = (
        f"T.R.A.C.E. LAW ENFORCEMENT ALERT\n"
        f"Incident ID: CMP-{complaint_id}\n"
        f"Amount: Rs. {amount:,}\n"
        f"Mule Account: {entry_account}\n"
        f"Target ATM: {atm_name} ({confidence * 100:.1f}% Risk)\n"
        f"GPS Intercept: {map_link}\n"
        f"Key ML Attribution Drivers:\n"
        + "\n".join([f"- {r}" for r in reasons])
        + "\n\nAction: Dispatch field patrol immediately."
    )

    reasons_html = "".join([
        f"<li style='margin-bottom: 6px; color: {'#166534' if 'raised' in r else '#92400e'};'>"
        f"{'▲' if 'raised' in r else '▼'} {r}</li>"
        for r in reasons
    ])

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; }}
    .container {{ max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }}
    .header {{ background: #dc2626; color: #ffffff; padding: 20px 24px; text-align: left; }}
    .badge {{ display: inline-block; background: rgba(255,255,255,0.25); padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }}
    .title {{ margin: 10px 0 0 0; font-size: 20px; font-weight: 800; }}
    .content {{ padding: 24px; color: #1e293b; }}
    .grid {{ display: table; width: 100%; margin-bottom: 20px; }}
    .row {{ display: table-row; }}
    .cell {{ display: table-cell; padding: 10px; background: #f8fafc; border: 1px solid #edf2f7; }}
    .label {{ font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }}
    .val {{ font-size: 15px; font-weight: 700; color: #0f172a; font-family: monospace; }}
    .val-danger {{ font-size: 18px; font-weight: 800; color: #dc2626; font-family: monospace; }}
    .shap-card {{ background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; margin-bottom: 20px; }}
    .btn {{ display: inline-block; background: #111827; color: #ffffff !important; padding: 12px 24px; border-radius: 8px; font-weight: 700; font-size: 14px; text-decoration: none; text-align: center; }}
    .footer {{ padding: 16px 24px; background: #f1f5f9; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; text-align: center; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="badge">INTERCEPTION PROTOCOL ACTIVE</span>
      <h1 class="title">T.R.A.C.E. Law Enforcement Dispatch</h1>
    </div>
    <div class="content">
      <p style="margin-top: 0; font-size: 14px; color: #475569;">
        A high-velocity transaction chain has been traced to a probable imminent physical cash-out location.
      </p>

      <div class="grid">
        <div class="row">
          <div class="cell">
            <div class="label">Incident ID</div>
            <div class="val">CMP-{complaint_id}</div>
          </div>
          <div class="cell">
            <div class="label">Mule Account</div>
            <div class="val" style="color: #4f46e5;">{entry_account}</div>
          </div>
        </div>
        <div class="row">
          <div class="cell">
            <div class="label">Target ATM Node</div>
            <div class="val">{atm_name}</div>
          </div>
          <div class="cell">
            <div class="label">Risk Confidence</div>
            <div class="val-danger">{confidence * 100:.1f}% PRIORITY 1</div>
          </div>
        </div>
        <div class="row">
          <div class="cell">
            <div class="label">Flagged Amount</div>
            <div class="val-danger">₹{amount:,}</div>
          </div>
          <div class="cell">
            <div class="label">GPS Coordinates</div>
            <div class="val">{lat}, {lon}</div>
          </div>
        </div>
      </div>

      <div class="shap-card">
        <div style="font-weight: 800; font-size: 12px; color: #166534; text-transform: uppercase; margin-bottom: 8px;">
          Key ML Attribution Drivers (SHAP Tree Analysis):
        </div>
        <ul style="margin: 0; padding-left: 18px; font-size: 13px; font-family: monospace;">
          {reasons_html}
        </ul>
      </div>

      <div style="text-align: center; margin: 24px 0 10px 0;">
        <a href="{map_link}" target="_blank" class="btn">📍 Open ATM Location in Google Maps</a>
      </div>
    </div>
    <div class="footer">
      Automated dispatch generated by T.R.A.C.E. AI Engine • Ministry of Home Affairs / I4C Framework
    </div>
  </div>
</body>
</html>"""

    try:
        from email.utils import formataddr, make_msgid, formatdate
        msg = MIMEMultipart("alternative")
        msg["From"] = formataddr(("T.R.A.C.E. Intelligence", sender_email))
        msg["To"] = ", ".join(recipient_list)
        msg["Subject"] = subject
        msg["Date"] = formatdate(localtime=True)
        msg["Message-ID"] = make_msgid()
        msg.attach(MIMEText(plain_text, "plain", "utf-8"))
        msg.attach(MIMEText(html_content, "html", "utf-8"))

        with smtplib.SMTP(smtp_server, smtp_port, timeout=12.0) as server:
            server.starttls()
            server.login(sender_email, sender_password)
            server.send_message(msg)

        logger.info(f"[EMAIL ALERT] Successfully dispatched alert email for CMP-{complaint_id} to {len(recipient_list)} recipients.")
        return True
    except Exception as e:
        logger.error(f"[EMAIL ALERT] Failed to send alert email: {e}")
        return False


def dispatch_high_risk_notifications(complaint_id: int, amount: int, entry_account: str, top_atm: dict, reasons: list[str]):
    """
    Spawns non-blocking background thread to send SMS and Email alerts.
    Does not slow down the API response.
    """
    threshold = float(os.environ.get("ALERT_CONFIDENCE_THRESHOLD", "0.70"))
    confidence = top_atm.get("confidence", 0.0)

    if confidence < threshold:
        logger.debug(f"[NOTIFICATIONS] Confidence {confidence:.2f} below threshold {threshold:.2f} - skipping dispatch.")
        return

    def _worker():
        try:
            send_sms_alert(complaint_id, amount, entry_account, top_atm, reasons)
        except Exception as err:
            logger.error(f"[NOTIFICATIONS] Error in SMS worker: {err}")

        try:
            send_email_alert(complaint_id, amount, entry_account, top_atm, reasons)
        except Exception as err:
            logger.error(f"[NOTIFICATIONS] Error in Email worker: {err}")

    thread = threading.Thread(target=_worker, daemon=True)
    thread.start()
