export interface NetworkNode {
  id: string;
  lat?: number;
  lon?: number;
  home_ifsc?: string;
}

export interface NetworkEdge {
  source: string;
  target: string;
  amount: number;
  minutes_ago: number;
}

export interface NetworkGraph {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

export interface RankedPrediction {
  atm_id: string;
  atm_name: string;
  confidence: number;
  top_reasons: string[];
  features: {
    mule_score: number;
    burst_score: number;
    geo_score: number;
    hub_score: number;
  };
  lat: number;
  lon: number;
}

export interface PredictResponse {
  entry_account: string;
  mule_score: number;
  burst_score: number;
  predictions: RankedPrediction[];
}

export interface Alert {
  id: number;
  complaint_id: number;
  atm_id: string;
  atm_name: string;
  bank_name?: string;
  entry_account?: string;
  complaint_amount?: number;
  complaint_text?: string;
  confidence: number;
  reasons: string[];
  shap_explanation?: string[];
  shap_reasons?: string[];
  created_at: string;
  reviewed: number;
  audit_hash?: string;
  is_top_prediction: number;
  lat: number;
  lon: number;
  latitude: number;
  longitude: number;
}

export type TraceStatus = 
  | 'IDLE'
  | 'COMPLAINT_RECEIVED'
  | 'TRACING_INITIALIZING'
  | 'ACCOUNT_DISCOVERY'
  | 'NETWORK_RECONSTRUCTION'
  | 'TRACE_COMPLETE'
  | 'FEATURE_ANALYSIS'
  | 'XGBOOST_RUNNING'
  | 'PREDICTION_COMPLETE'
  | 'ATM_ANALYSIS'
  | 'TOP_3_REVEAL'
  | 'ALERT_READY'
  | 'ALERT_SENT';
