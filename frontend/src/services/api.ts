import type { NetworkGraph, PredictResponse } from '../types/trace';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const getNetwork = async (entryAccount: string, amount?: number): Promise<NetworkGraph> => {
  const url = amount ? `${API_BASE_URL}/network/${entryAccount}?amount=${amount}` : `${API_BASE_URL}/network/${entryAccount}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch network');
  return res.json();
};

export const runPrediction = async (
  entryAccount: string, 
  amount?: number, 
  minutesAgo?: number,
  saveToDb: boolean = true
): Promise<PredictResponse> => {
  const payload: any = { entry_account: entryAccount, save_to_db: saveToDb };
  if (amount !== undefined && minutesAgo !== undefined) {
    payload.new_hop = { amount, minutes_ago: minutesAgo };
  }
  const res = await fetch(`${API_BASE_URL}/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Prediction failed');
  return res.json();
};

export const getAlerts = async (limit: number = 20): Promise<any[]> => {
  const res = await fetch(`${API_BASE_URL}/alerts?limit=${limit}`);
  if (!res.ok) throw new Error('Failed to fetch alerts');
  return res.json();
};

export const reviewAlert = async (alertId: number): Promise<{ status: string; alert_id: number }> => {
  const res = await fetch(`${API_BASE_URL}/alerts/${alertId}/reviewed`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to review alert');
  return res.json();
};
