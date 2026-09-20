"""
Step 3b — Train the XGBoost risk-combiner model and wire up SHAP.

This is the "Risk Prediction Engine" from the architecture slide. It
does NOT generate a new signal — it takes the 4 scores computed by
model/scoring.py and learns how to weight them together into one
final risk score per (case, candidate ATM) pair.

Evaluation uses precision@3 (hit-rate), matching the report's
evaluation methodology — never call this "accuracy" in a demo, since
it's trained on synthetic data.
"""
import os
import pandas as pd
import numpy as np
import xgboost as xgb
import shap
from sklearn.model_selection import GroupShuffleSplit

FEATURES = ["mule_score", "burst_score", "geo_score", "hub_score"]
HERE = os.path.dirname(os.path.abspath(__file__))


def load_data() -> pd.DataFrame:
    return pd.read_csv(os.path.join(HERE, "training_data.csv"))


def chronological_split(df: pd.DataFrame, test_frac: float = 0.25):
    """Split by case_id, chronologically — train on EARLIER cases, test
    on LATER ones. Mimics real deployment: predicting the future, not
    the past. (Never shuffle-split randomly for this kind of task —
    see report Section 7.2.3 for why.)"""
    case_ids = sorted(df["case_id"].unique())
    split_at = int(len(case_ids) * (1 - test_frac))
    train_cases = set(case_ids[:split_at])
    test_cases = set(case_ids[split_at:])
    train_df = df[df["case_id"].isin(train_cases)].reset_index(drop=True)
    test_df = df[df["case_id"].isin(test_cases)].reset_index(drop=True)
    return train_df, test_df


def train_model(train_df: pd.DataFrame) -> xgb.XGBClassifier:
    model = xgb.XGBClassifier(
        n_estimators=150,
        max_depth=3,
        learning_rate=0.1,
        scale_pos_weight=10,
        eval_metric="logloss",
        random_state=42,
    )
    model.fit(train_df[FEATURES], train_df["label"])
    return model


def precision_at_k(model, test_df: pd.DataFrame, k: int = 3) -> float:
    """For each case, does the true ATM appear in the model's top-k
    ranked predictions? Average across all test cases = hit-rate."""
    hits = 0
    cases = test_df["case_id"].unique()
    for cid in cases:
        sub = test_df[test_df["case_id"] == cid].copy()
        sub["pred_prob"] = model.predict_proba(sub[FEATURES])[:, 1]
        top_k = sub.nlargest(k, "pred_prob")
        if top_k["label"].sum() > 0:
            hits += 1
    return hits / len(cases)


def explain_one_case(model, test_df: pd.DataFrame, explainer: shap.TreeExplainer, case_id=None):
    """Print a SHAP-explained ranking for one test case — this is
    exactly what the dashboard's 'top reasons' panel will show."""
    if case_id is None:
        case_id = test_df["case_id"].iloc[0]
    sub = test_df[test_df["case_id"] == case_id].copy()
    sub["pred_prob"] = model.predict_proba(sub[FEATURES])[:, 1]
    sub = sub.sort_values("pred_prob", ascending=False).reset_index(drop=True)

    shap_values = explainer.shap_values(sub[FEATURES])

    print(f"\n=== Case {case_id} — ranked predictions ===")
    for i in range(min(3, len(sub))):
        row = sub.iloc[i]
        marker = " <-- TRUE ATM" if row["label"] == 1 else ""
        print(f"\n#{i+1}  {row['atm_id']}  risk_score={row['pred_prob']:.3f}{marker}")
        contribs = list(zip(FEATURES, shap_values[i]))
        contribs.sort(key=lambda x: abs(x[1]), reverse=True)
        for feat, val in contribs:
            sign = "+" if val >= 0 else ""
            print(f"     {feat:12s} contributed {sign}{val:.3f}  (value={row[feat]:.3f})")


if __name__ == "__main__":
    df = load_data()
    train_df, test_df = chronological_split(df)
    print(f"Train: {train_df['case_id'].nunique()} cases  |  Test: {test_df['case_id'].nunique()} cases")

    model = train_model(train_df)

    p_at_1 = precision_at_k(model, test_df, k=1)
    p_at_3 = precision_at_k(model, test_df, k=3)
    print(f"\nPrecision@1 (hit-rate): {p_at_1*100:.1f}%")
    print(f"Precision@3 (hit-rate): {p_at_3*100:.1f}%")
    print("(synthetic-data validation only — not a real-world accuracy claim)")

    explainer = shap.TreeExplainer(model)
    test_case_ids = sorted(test_df["case_id"].unique())
    explain_one_case(model, test_df, explainer, case_id=test_case_ids[0])
    explain_one_case(model, test_df, explainer, case_id=test_case_ids[10])

    model.save_model(os.path.join(HERE, "saved_risk_model.json"))
    print("\nSaved -> model/saved_risk_model.json")
