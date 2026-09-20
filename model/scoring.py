"""
Step 2 — Heuristic scoring functions.

These are the lightweight, honest substitutes for GraphSAGE / Temporal
GNN+Hawkes / recency-weighted centrality / Rossmo's distance-decay —
each one computes the SAME kind of signal, just via a closed-form
formula or simple statistic instead of a trained deep model. This is
what actually runs live in the demo (see conversation: BUILD tier).

    mule_score()  <- stands in for GraphSAGE      (network intelligence)
    burst_score() <- stands in for Hawkes process (temporal intelligence)
    hub_score()   <- recency-weighted centrality   (hub intelligence)
    geo_score()   <- Rossmo-style distance-decay   (geo intelligence)

All four return a value in [0, 1]. They get combined downstream by
the XGBoost risk model (model/train_risk_model.py, next step).
"""
import math
import networkx as nx


# ---------------------------------------------------------------------
# 1. Network / mule score — fan-in/fan-out + holding-time + pass-through
# ---------------------------------------------------------------------
def mule_score(G: nx.DiGraph, account: str) -> float:
    """
    High when: many distinct senders (fan-in), few/one receiver
    (fan-out), money passes through FAST (short holding time), AND
    that activity is RECENT. The recency gate matters a lot in
    practice — PAYROLL_ACC in the seed graph has high fan-in but the
    incoming payments are old/stale, so without gating by recency it
    would score higher than an actual active mule, which is wrong.
    """
    in_edges = list(G.in_edges(account, data=True))
    out_edges = list(G.out_edges(account, data=True))

    fan_in = len(in_edges)
    fan_out = len(out_edges)
    if fan_in == 0:
        return 0.0

    latest_in_time = min(d["minutes_ago"] for _, _, d in in_edges)
    recency = math.exp(-latest_in_time / 240.0)  # ~1.0 if <~1hr old, ~0 if very stale

    fan_ratio = fan_in / max(fan_out, 1)
    fan_component = min(fan_ratio / 5.0, 1.0)

    if fan_out > 0:
        latest_out_time = min(d["minutes_ago"] for _, _, d in out_edges)
        holding_minutes = max(latest_in_time - latest_out_time, 0)
        holding_component = math.exp(-holding_minutes / 240.0)
        avg_in = sum(d["amount"] for _, _, d in in_edges) / fan_in
        avg_out = sum(d["amount"] for _, _, d in out_edges) / fan_out
        pass_through = 1.0 - min(abs(avg_in - avg_out) / max(avg_in, 1), 1.0)
    else:
        # money has arrived but hasn't moved on yet — pass-through can't
        # be confirmed, so lean on recency of arrival instead
        holding_component = recency
        pass_through = 0.4  # neutral, unconfirmed

    # gate fan-in by recency: a lot of senders from long ago (e.g. a
    # payroll-style account) should NOT score like an active mule just
    # because it has many historical inbound transfers
    gated_fan = fan_component * (0.3 + 0.7 * recency)

    score = 0.45 * gated_fan + 0.35 * holding_component + 0.20 * pass_through
    return round(min(max(score, 0.0), 1.0), 4)


# ---------------------------------------------------------------------
# 2. Burst / temporal score — rolling "how fast is this chain moving"
# ---------------------------------------------------------------------
def burst_score(G: nx.DiGraph, account: str) -> float:
    """
    High when the account's transactions are clustered close together
    in time (a burst) rather than spread out. Stands in for a Hawkes
    self-exciting process: recent, tightly-clustered activity raises
    the score sharply; old/spread-out activity does not.
    """
    edges = list(G.in_edges(account, data=True)) + list(G.out_edges(account, data=True))
    if not edges:
        return 0.0

    times = sorted(d["minutes_ago"] for _, _, d in edges)
    if len(times) == 1:
        # single event: score by recency alone
        return round(math.exp(-times[0] / 300.0), 4)

    # average gap between consecutive events (smaller gap = burstier)
    gaps = [times[i + 1] - times[i] for i in range(len(times) - 1)]
    avg_gap = sum(gaps) / len(gaps)
    recency = math.exp(-min(times) / 300.0)     # how recent is the latest event
    burstiness = math.exp(-avg_gap / 60.0)       # how tightly clustered

    score = 0.5 * recency + 0.5 * burstiness
    return round(min(max(score, 0.0), 1.0), 4)


# ---------------------------------------------------------------------
# 3. Hub score — recency-weighted reuse count for an ATM
# ---------------------------------------------------------------------
def hub_score(atm_id: str, cashout_history: list) -> float:
    """
    cashout_history: list of {"atm_id": str, "minutes_ago": int}
    covering past (simulated) cash-out events. Older reuse counts
    less than recent reuse — an ATM used twice last week outranks
    one used five times a year ago.
    """
    relevant = [h for h in cashout_history if h["atm_id"] == atm_id]
    if not relevant:
        return 0.0
    weighted = sum(math.exp(-h["minutes_ago"] / 10080.0) for h in relevant)  # 10080min = 1 week half-life-ish
    return round(min(weighted / 3.0, 1.0), 4)  # normalize so ~3 recent reuses saturates near 1.0


# ---------------------------------------------------------------------
# 4. Geo score — Haversine distance + Rossmo-style distance-decay
# ---------------------------------------------------------------------
def haversine_km(lat1, lon1, lat2, lon2) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def geo_score(mule_lat, mule_lon, atm_lat, atm_lon,
              buffer_km: float = 1.5, decay_km: float = 8.0) -> float:
    """
    Rossmo-style distance-decay: probability is LOW right at distance 0
    (a buffer zone — offenders/mules don't cash out right next to their
    own registered branch), rises to a peak a short distance out, then
    decays smoothly with distance.
    """
    d = haversine_km(mule_lat, mule_lon, atm_lat, atm_lon)
    if d < buffer_km:
        # inside the buffer zone: suppressed but not zero
        return round(0.3 * (d / buffer_km), 4)
    # beyond the buffer: exponential decay from the buffer edge
    decayed = math.exp(-(d - buffer_km) / decay_km)
    return round(min(max(decayed, 0.0), 1.0), 4)


if __name__ == "__main__":
    import pickle, os
    from data.atms import ATMS, BRANCHES

    with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "seed_graph.pkl"), "rb") as f:
        G = pickle.load(f)

    branch_lookup = {b["ifsc"]: b for b in BRANCHES}

    print(f"{'Account':16s} {'mule_score':>11s} {'burst_score':>12s}")
    print("-" * 42)
    for acc in ["MULE_A3", "MULE_B2", "MULE_C4", "PAYROLL_ACC", "MISC_DST_0"]:
        m = mule_score(G, acc)
        b = burst_score(G, acc)
        print(f"{acc:16s} {m:>11.3f} {b:>12.3f}")

    print("\nGeo score, MULE_A3's home branch -> each ATM:")
    home_ifsc = G.nodes["MULE_A3"]["home_ifsc"]
    branch = branch_lookup[home_ifsc]
    print(f"  MULE_A3 home branch: {branch['name']} ({home_ifsc})")
    for atm in ATMS:
        g = geo_score(branch["lat"], branch["lon"], atm["lat"], atm["lon"])
        print(f"    {atm['name']:32s} geo_score={g:.3f}")
