"""
Step 1b — Seed account/transaction graph.

Hand-crafted so the demo is reliable: a few obvious mule chains
(victim -> mule hop -> mule hop -> cash-out-ready account) plus some
"noise" accounts that look superficially similar but are NOT mules,
so the scoring functions in model/scoring.py have something real to
discriminate against instead of trivially flagging everyone.

Each account is tagged with a home branch IFSC (from data/atms.py
BRANCHES) so the geo layer has something to anchor distance-decay to.
"""
import networkx as nx
import random
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from data.atms import BRANCHES

random.seed(42)


def build_seed_graph() -> nx.DiGraph:
    G = nx.DiGraph()

    # ---- Chain 1: clean 3-hop mule chain, fast timing (should score HIGH) ----
    G.add_edge("VICTIM_001", "MULE_A1", amount=200000, minutes_ago=180)
    G.add_edge("MULE_A1", "MULE_A2", amount=195000, minutes_ago=170)
    G.add_edge("MULE_A2", "MULE_A3", amount=190000, minutes_ago=155)  # last hop before cash-out

    # ---- Chain 2: 2-hop chain, slightly slower (should score MEDIUM-HIGH) ----
    G.add_edge("VICTIM_002", "MULE_B1", amount=85000, minutes_ago=300)
    G.add_edge("MULE_B1", "MULE_B2", amount=80000, minutes_ago=260)

    # ---- Chain 3: longer 4-hop chain, deliberately slow (tests burst-score
    #      distinguishing "fast" fraud from "spread out" activity) ----
    G.add_edge("VICTIM_003", "MULE_C1", amount=50000, minutes_ago=1200)
    G.add_edge("MULE_C1", "MULE_C2", amount=48000, minutes_ago=900)
    G.add_edge("MULE_C2", "MULE_C3", amount=47000, minutes_ago=600)
    G.add_edge("MULE_C3", "MULE_C4", amount=46000, minutes_ago=100)

    # ---- Noise: legitimate-looking accounts (high fan-in, e.g. payroll-style,
    #      but NO fast pass-through) so mule_score must use BOTH fan-in AND
    #      holding-time, not fan-in alone ----
    for i in range(5):
        G.add_edge(f"PAYER_{i}", "PAYROLL_ACC", amount=random.randint(20000, 60000),
                   minutes_ago=random.randint(2000, 10000))  # old, slow — not a mule pattern

    # ---- Noise: a few isolated, low-activity accounts (should score LOW
    #      on everything — cold accounts, not part of any chain) ----
    for i in range(4):
        G.add_edge(f"MISC_SRC_{i}", f"MISC_DST_{i}",
                   amount=random.randint(500, 5000), minutes_ago=random.randint(5000, 20000))

    # ---- Assign each account a home branch (for geo scoring) ----
    branch_ids = [b["ifsc"] for b in BRANCHES]
    for node in G.nodes():
        G.nodes[node]["home_ifsc"] = random.choice(branch_ids)

    return G


def graph_summary(G: nx.DiGraph):
    print(f"Nodes: {G.number_of_nodes()}   Edges: {G.number_of_edges()}")
    print("\nSample edges:")
    for u, v, d in list(G.edges(data=True))[:6]:
        print(f"  {u:14s} -> {v:14s}  amount={d['amount']:>7}  {d['minutes_ago']}min ago")
    print("\nSample home branches:")
    for n in list(G.nodes())[:5]:
        print(f"  {n:14s} home_ifsc={G.nodes[n]['home_ifsc']}")


if __name__ == "__main__":
    G = build_seed_graph()
    graph_summary(G)
    nx.write_gpickle = getattr(nx, "write_gpickle", None)  # networkx>=3.0 removed this; handled below
    import pickle
    with open(os.path.join(os.path.dirname(__file__), "seed_graph.pkl"), "wb") as f:
        pickle.dump(G, f)
    print("\nSaved -> data/seed_graph.pkl")
