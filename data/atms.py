"""
Step 1a — Seed ATM/branch location data.

Real Chennai ATM/branch coordinates, hand-picked from public map data.
In production this comes from the OpenStreetMap Overpass API
(amenity=atm / amenity=bank) — for the prototype we hardcode a
representative set so the geo-decay layer has real, meaningful
coordinates to work with.
"""

ATMS = [
    {"id": "ATM001", "name": "SBI ATM, T Nagar",              "lat": 13.03925, "lon": 80.239971},
    {"id": "ATM002", "name": "Canara Bank, Anna Nagar",        "lat": 13.0946, "lon": 80.2058},
    {"id": "ATM003", "name": "HDFC ATM, Velachery",            "lat": 12.975991, "lon": 80.22049},
    {"id": "ATM004", "name": "ICICI ATM, Adyar",               "lat": 13.006927, "lon": 80.258436},
    {"id": "ATM005", "name": "Indian Bank, Mylapore",          "lat": 13.0348, "lon": 80.2682},
    {"id": "ATM006", "name": "Axis Bank ATM, Nungambakkam",    "lat": 13.0536, "lon": 80.2357},
    {"id": "ATM007", "name": "SBI ATM, Guindy",                "lat": 13.0168, "lon": 80.2055},
    {"id": "ATM008", "name": "PNB ATM, Porur",                 "lat": 13.034224, "lon": 80.159327},
    {"id": "ATM009", "name": "Bank of Baroda, Tambaram",       "lat": 12.9254, "lon": 80.1136},
    {"id": "ATM010", "name": "Canara Bank, Perambur",          "lat": 13.109868, "lon": 80.244183},
    {"id": "ATM011", "name": "HDFC ATM, Chromepet",            "lat": 12.95051, "lon": 80.138058},
    {"id": "ATM012", "name": "ICICI ATM, Ambattur",            "lat": 13.120205, "lon": 80.149686},
]

# One branch coordinate per synthetic account "home IFSC" — this is
# what the mule account's location actually anchors to (see
# graph.py). Kept deliberately small: 5-6 branches is enough to
# demonstrate the geo layer without needing real IFSC data.
BRANCHES = [
    {"ifsc": "SBIN0001",  "name": "SBI, T Nagar branch",       "lat": 13.0400, "lon": 80.2350},
    {"ifsc": "CNRB0002",  "name": "Canara Bank, Anna Nagar",   "lat": 13.0860, "lon": 80.2110},
    {"ifsc": "HDFC0003",  "name": "HDFC, Velachery branch",    "lat": 12.9800, "lon": 80.2200},
    {"ifsc": "ICIC0004",  "name": "ICICI, Adyar branch",       "lat": 13.0020, "lon": 80.2570},
    {"ifsc": "AXIS0005",  "name": "Axis Bank, Nungambakkam",   "lat": 13.0610, "lon": 80.2420},
]

if __name__ == "__main__":
    print(f"{len(ATMS)} ATMs, {len(BRANCHES)} branches loaded")
    for a in ATMS[:3]:
        print(" ", a)
