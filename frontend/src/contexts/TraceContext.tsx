import { createContext, useContext, useState, type ReactNode } from 'react';
import type { TraceStatus, PredictResponse, NetworkGraph } from '../types/trace';

interface TraceContextType {
  status: TraceStatus;
  setStatus: (status: TraceStatus) => void;
  entryAccount: string;
  setEntryAccount: (account: string) => void;
  amount: number;
  setAmount: (amount: number) => void;
  caseId: string;
  setCaseId: (id: string) => void;
  complaintId: string;
  setComplaintId: (id: string) => void;
  transactionId: string;
  setTransactionId: (id: string) => void;
  saveToDb: boolean;
  setSaveToDb: (save: boolean) => void;
  networkData: NetworkGraph | null;
  setNetworkData: (data: NetworkGraph | null) => void;
  predictionData: PredictResponse | null;
  setPredictionData: (data: PredictResponse | null) => void;
  hoveredNodeId: string | null;
  setHoveredNodeId: (id: string | null) => void;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  startTracing: () => void;
  resetCase: () => void;
}

const TraceContext = createContext<TraceContextType | undefined>(undefined);

export const TraceProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<TraceStatus>('COMPLAINT_RECEIVED');
  const [networkData, setNetworkData] = useState<NetworkGraph | null>(null);
  const [predictionData, setPredictionData] = useState<PredictResponse | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  
  const [caseId, setCaseId] = useState<string>("CASE-2026-992");
  const [complaintId, setComplaintId] = useState<string>("CMP-001");
  const [transactionId, setTransactionId] = useState<string>("TXN-20260830-001");
  const [entryAccount, setEntryAccount] = useState<string>("MULE_A3");
  const [amount, setAmount] = useState<number>(25000);
  const [saveToDb, setSaveToDb] = useState<boolean>(true);

  const startTracing = () => {
    setStatus('TRACING_INITIALIZING');
  };

  const resetCase = () => {
    setStatus('COMPLAINT_RECEIVED');
    setNetworkData(null);
    setPredictionData(null);
  };

  return (
    <TraceContext.Provider value={{
      status, setStatus, 
      caseId, setCaseId, 
      complaintId, setComplaintId, 
      transactionId, setTransactionId, 
      entryAccount, setEntryAccount, 
      amount, setAmount,
      saveToDb, setSaveToDb,
      networkData, setNetworkData, 
      predictionData, setPredictionData,
      hoveredNodeId, setHoveredNodeId, 
      selectedNodeId, setSelectedNodeId,
      startTracing, resetCase
    }}>
      {children}
    </TraceContext.Provider>
  );
};

export const useTrace = () => {
  const context = useContext(TraceContext);
  if (!context) throw new Error("useTrace must be used within a TraceProvider");
  return context;
};
