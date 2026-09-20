import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrace } from '../contexts/TraceContext';
import { useLanguage, type Language } from '../contexts/LanguageContext';
import { 
  ShieldAlert, Zap, Activity, ExternalLink, Terminal, CheckCircle, 
  Clock, MapPin, X, BrainCircuit, ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp, Layers,
  Search, Filter, RotateCcw, FileText, Printer, Shield
} from 'lucide-react';
import { useMotionValue, animate } from 'framer-motion';
import MapGL, { Marker } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getAlerts, reviewAlert } from '../services/api';
import indiaWatermark from '../assets/india.webp';
import type { Alert } from '../types/trace';
import { IntelligenceGraphs } from '../components/dashboard/IntelligenceGraphs';

const parseReasons = (reasons: any): string[] => {
  if (Array.isArray(reasons)) return reasons;
  if (typeof reasons === 'string') {
    try {
      const parsed = JSON.parse(reasons);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      const cleaned = reasons.replace(/[\[\]'"]/g, '').split(',').map((s: string) => s.trim()).filter(Boolean);
      if (cleaned.length > 0) return cleaned;
      return [reasons];
    }
  }
  return [];
};

const translateReason = (reason: string, lang: Language): string => {
  if (lang === 'en') return reason;
  if (lang === 'ta') {
    return reason
      .replace(/geographic proximity \(([\d.]+)\) raised the score by ([\d.]+)/g, 'புவியியல் அருகாமை ($1) மதிப்பெண்ணை $2 உயர்த்தியது')
      .replace(/historical cash-out reuse at this ATM \(([\d.]+)\) raised the score by ([\d.]+)/g, 'ஏடிஎம் முந்தைய பணப்பறிப்பு ($1) மதிப்பெண்ணை $2 உயர்த்தியது')
      .replace(/historical cash-out reuse at this ATM \(([\d.]+)\) lowered the score by ([\d.]+)/g, 'ஏடிஎம் முந்தைய பணப்பறிப்பு ($1) மதிப்பெண்ணை $2 குறைத்தது')
      .replace(/raised the score by/g, 'மதிப்பெண்ணை உயர்த்தியது')
      .replace(/lowered the score by/g, 'மதிப்பெண்ணைக் குறைத்தது');
  }
  if (lang === 'hi') {
    return reason
      .replace(/geographic proximity \(([\d.]+)\) raised the score by ([\d.]+)/g, 'भौगोलिक निकटता ($1) ने स्कोर को $2 बढ़ाया')
      .replace(/historical cash-out reuse at this ATM \(([\d.]+)\) raised the score by ([\d.]+)/g, 'इस एटीएम पर ऐतिहासिक निकासी ($1) ने स्कोर $2 बढ़ाया')
      .replace(/historical cash-out reuse at this ATM \(([\d.]+)\) lowered the score by ([\d.]+)/g, 'इस एटीएम पर ऐतिहासिक निकासी ($1) ने स्कोर $2 घटाया')
      .replace(/raised the score by/g, 'ने स्कोर बढ़ाया')
      .replace(/lowered the score by/g, 'ने स्कोर घटाया');
  }
  return reason;
};

const getAtmZone = (atmName: string): 'central' | 'south' | 'north' => {
  const name = atmName.toLowerCase();
  if (name.includes('nagar') && name.includes('t')) return 'central';
  if (name.includes('mylapore') || name.includes('nungambakkam')) return 'central';
  if (name.includes('velachery') || name.includes('adyar') || name.includes('guindy') || name.includes('tambaram') || name.includes('chromepet')) return 'south';
  if (name.includes('anna') || name.includes('porur') || name.includes('perambur') || name.includes('ambattur')) return 'north';
  return 'central';
};

const getCrimeCategory = (amount: number, compId: number): 'phishing' | 'mule' | 'investment' | 'atm' => {
  if (amount >= 100000) return 'mule';
  if (compId % 4 === 1) return 'phishing';
  if (compId % 4 === 2) return 'investment';
  if (compId % 4 === 3) return 'atm';
  return 'phishing';
};

const AnimatedCounter = ({ from, to }: { from: number, to: number }) => {
  const count = useMotionValue(from);
  const [display, setDisplay] = useState(from);

  useEffect(() => {
    const controls = animate(count, to, {
      duration: 1.5,
      ease: "easeOut",
      onUpdate: (value) => {
        setDisplay(Math.round(value));
      }
    });
    return controls.stop;
  }, [to]);

  return <span>{display.toLocaleString()}</span>;
};

const Sparkline = ({ color }: { color: string }) => {
  return (
    <svg width="60" height="20" viewBox="0 0 60 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0 15L10 10L20 18L30 5L40 12L50 2L60 8" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M0 15L10 10L20 18L30 5L40 12L50 2L60 8L60 20L0 20Z" fill={color} fillOpacity="0.1"/>
    </svg>
  );
};

export interface ComplaintIncident {
  complaint_id: number;
  entry_account: string;
  complaint_amount: number;
  created_at: string;
  reviewed: boolean;
  atms: Alert[];
}

export const Dashboard = () => {
  const navigate = useNavigate();
  const { setCaseId, setComplaintId, setTransactionId, setEntryAccount, setAmount, setSaveToDb, startTracing } = useTrace();
  const { language, t } = useLanguage();
  
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedPinpointAlert, setSelectedPinpointAlert] = useState<Alert | null>(null);
  const [selectedDossierIncident, setSelectedDossierIncident] = useState<ComplaintIncident | null>(null);
  const [reviewingComplaintId, setReviewingComplaintId] = useState<number | null>(null);
  const [expandedComplaintId, setExpandedComplaintId] = useState<number | null>(null);

  // Drill-Down Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTime, setFilterTime] = useState<'all' | '1h' | 'today' | '7d'>('all');
  const [filterZone, setFilterZone] = useState<'all' | 'central' | 'south' | 'north'>('all');
  const [filterCrime, setFilterCrime] = useState<'all' | 'phishing' | 'mule' | 'investment' | 'atm'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'reviewed'>('all');
  
  const dossierPrintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const data = await getAlerts(100);
        setAlerts(data);
      } catch (err) {
        console.error('Failed to fetch alerts', err);
      }
    };
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 1500);

    // Instant real-time listener: wakes up the millisecond payment is approved in checkout.html
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('trace_alerts_channel');
      bc.onmessage = () => {
        fetchAlerts();
        setTimeout(fetchAlerts, 800);
        setTimeout(fetchAlerts, 2000);
      };
    } catch (e) {}

    return () => {
      clearInterval(interval);
      if (bc) bc.close();
    };
  }, []);

  // Group alerts by complaint so each complaint appears as 1 unified row with top-ranked ATMs
  const allIncidents = useMemo(() => {
    const map = new Map<number | string, ComplaintIncident>();
    for (const alert of alerts) {
      const key = alert.complaint_id || `ALT-${alert.id}`;
      if (!map.has(key)) {
        map.set(key, {
          complaint_id: alert.complaint_id || alert.id,
          entry_account: alert.entry_account || 'MULE_A3',
          complaint_amount: alert.complaint_amount || 25000,
          created_at: alert.created_at,
          reviewed: alert.reviewed === 1,
          atms: [],
        });
      }
      const inc = map.get(key)!;
      if (alert.reviewed === 0) {
        inc.reviewed = false;
      }
      inc.atms.push(alert);
    }

    // Sort ATMs within each complaint: #1 (highest confidence) at top
    const result = Array.from(map.values());
    for (const inc of result) {
      inc.atms.sort((a, b) => b.confidence - a.confidence);
    }
    return result;
  }, [alerts]);

  // Apply Drill-down Filters
  const filteredIncidents = useMemo(() => {
    const now = Date.now();

    return allIncidents.filter((inc) => {
      // 1. Search Query Filter (Matches Complaint ID or Mule Account or ATM name)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesComp = `cmp-${inc.complaint_id}`.toLowerCase().includes(query) || `${inc.complaint_id}`.includes(query);
        const matchesAccount = inc.entry_account.toLowerCase().includes(query);
        const matchesAtm = inc.atms.some(a => a.atm_name.toLowerCase().includes(query) || a.atm_id.toLowerCase().includes(query));
        if (!matchesComp && !matchesAccount && !matchesAtm) return false;
      }

      // 2. Time Window Filter
      if (filterTime !== 'all') {
        const incTime = new Date(inc.created_at).getTime();
        if (filterTime === '1h' && now - incTime > 3600 * 1000) return false;
        if (filterTime === 'today' && now - incTime > 24 * 3600 * 1000) return false;
        if (filterTime === '7d' && now - incTime > 7 * 24 * 3600 * 1000) return false;
      }

      // 3. Location Zone Filter
      if (filterZone !== 'all') {
        const topAtm = inc.atms[0];
        if (!topAtm) return false;
        const atmZone = getAtmZone(topAtm.atm_name);
        if (atmZone !== filterZone) return false;
      }

      // 4. Crime Category Filter
      if (filterCrime !== 'all') {
        const category = getCrimeCategory(inc.complaint_amount, inc.complaint_id);
        if (category !== filterCrime) return false;
      }

      // 5. Status Filter
      if (filterStatus === 'pending' && inc.reviewed) return false;
      if (filterStatus === 'reviewed' && !inc.reviewed) return false;

      return true;
    });
  }, [allIncidents, searchQuery, filterTime, filterZone, filterCrime, filterStatus]);

  const hasActiveFilters = searchQuery !== '' || filterTime !== 'all' || filterZone !== 'all' || filterCrime !== 'all' || filterStatus !== 'all';

  const resetFilters = () => {
    setSearchQuery('');
    setFilterTime('all');
    setFilterZone('all');
    setFilterCrime('all');
    setFilterStatus('all');
  };

  // #1 most favourite / top predicted ATM of the latest complaint
  const latestAlert = allIncidents.length > 0 && allIncidents[0].atms.length > 0
    ? allIncidents[0].atms[0]
    : (alerts.length > 0 ? alerts[0] : null);

  const handleStartTracing = () => {
    if (latestAlert) {
      setEntryAccount(latestAlert.entry_account || 'MULE_A3');
      setAmount(latestAlert.complaint_amount || 25000);
      setComplaintId(`CMP-${latestAlert.complaint_id}`);
      setCaseId(`CASE-2026-${1000 + latestAlert.complaint_id}`);
      setTransactionId(`TXN-${latestAlert.id}`);
      setSaveToDb(false);
    } else {
      setSaveToDb(true);
    }
    startTracing();
    navigate('/trace');
  };

  const handleStartTracingIncident = (inc: ComplaintIncident) => {
    const topAtm = inc.atms[0] || latestAlert;
    setEntryAccount(inc.entry_account || 'MULE_A3');
    setAmount(inc.complaint_amount || 25000);
    setComplaintId(`CMP-${inc.complaint_id}`);
    setCaseId(`CASE-2026-${1000 + inc.complaint_id}`);
    setTransactionId(`TXN-${topAtm?.id || inc.complaint_id}`);
    setSaveToDb(false);
    startTracing();
    navigate('/trace');
  };

  const handlePinpointAtm = (alert: Alert) => {
    setSelectedPinpointAlert(alert);
  };

  const handleReviewIncident = async (inc: ComplaintIncident) => {
    setReviewingComplaintId(inc.complaint_id);
    const idsToReview = inc.atms.map(a => a.id);
    try {
      await Promise.all(idsToReview.map(id => reviewAlert(id)));
      setAlerts(prev => prev.map(a => idsToReview.includes(a.id) ? { ...a, reviewed: 1 } : a));
      if (selectedPinpointAlert && idsToReview.includes(selectedPinpointAlert.id)) {
        setSelectedPinpointAlert(prev => prev ? { ...prev, reviewed: 1 } : null);
      }
    } catch (err) {
      console.error('Failed to review incident alerts', err);
    } finally {
      setReviewingComplaintId(null);
    }
  };

  // Find related candidate ATMs for currently opened modal
  const modalRelatedAtms = useMemo(() => {
    if (!selectedPinpointAlert) return [];
    const compId = selectedPinpointAlert.complaint_id;
    if (!compId) return [selectedPinpointAlert];
    return alerts.filter(a => a.complaint_id === compId).sort((a, b) => b.confidence - a.confidence);
  }, [selectedPinpointAlert, alerts]);

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', position: 'relative', backgroundColor: 'var(--bg-primary)' }}>
      
      {/* Print Stylesheet for Dossier Export */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-dossier, #printable-dossier * {
            visibility: visible !important;
          }
          #printable-dossier {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: 100% !important;
            padding: 20px !important;
            background: #ffffff !important;
            box-shadow: none !important;
            border: none !important;
            z-index: 99999 !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Subtle Watermark */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.03, pointerEvents: 'none', zIndex: 0 }}>
        <img src={indiaWatermark} alt="watermark" style={{ width: '800px', filter: 'grayscale(100%)' }} />
      </div>

      <div style={{ padding: '32px 36px 80px 36px', display: 'flex', flexDirection: 'column', gap: '32px', zIndex: 1 }}>
        
        {/* Top Header Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Activity size={24} color="var(--primary-color)" />
            <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, letterSpacing: '0.5px' }}>{t.system_dashboard}</h2>
          </div>
          <a href="/checkout.html" target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '13px', textDecoration: 'none' }}>
            <ExternalLink size={16} /> {t.trigger_payment}
          </a>
        </div>

        {/* Top Section: Split Layout for Threat Command & Metrics */}
        <div style={{ display: 'flex', gap: '24px' }}>
          
          {/* Left: Intelligence Metrics (Zone A) - 2x2 Grid */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
            <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #eaeaea', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ color: '#6b7280', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t.metric_transactions}</div>
                <Sparkline color="#6b7280" />
              </div>
              <div style={{ fontSize: '36px', fontWeight: 800, color: '#111827', letterSpacing: '-0.5px' }}><AnimatedCounter from={0} to={1284} /></div>
            </div>
            <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #eaeaea', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ color: '#4f46e5', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t.metric_active_complaints}</div>
                <Sparkline color="#4f46e5" />
              </div>
              <div style={{ fontSize: '36px', fontWeight: 800, color: '#4f46e5', letterSpacing: '-0.5px' }}><AnimatedCounter from={0} to={allIncidents.length} /></div>
            </div>
            <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #eaeaea', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ color: '#f59e0b', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t.metric_suspicious_chains}</div>
                <Sparkline color="#f59e0b" />
              </div>
              <div style={{ fontSize: '36px', fontWeight: 800, color: '#f59e0b', letterSpacing: '-0.5px' }}><AnimatedCounter from={0} to={7 + Math.floor(allIncidents.length / 2)} /></div>
            </div>
            <div style={{ background: '#ffffff', padding: '24px', borderRadius: '12px', border: '1px solid #eaeaea', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ color: '#dc2626', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t.metric_high_risk}</div>
                <Sparkline color="#dc2626" />
              </div>
              <div style={{ fontSize: '36px', fontWeight: 800, color: '#dc2626', letterSpacing: '-0.5px' }}><AnimatedCounter from={0} to={3 + allIncidents.length} /></div>
            </div>
          </div>

          {/* Right: Active Threat Command (Zone B) */}
          <div style={{ flex: 1.2, background: '#ffffff', borderRadius: '12px', padding: '28px 32px', boxShadow: '0 4px 24px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', border: '1px solid #eaeaea' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#ef4444' }} />
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '14px', height: '14px' }}>
                  <div style={{ position: 'absolute', width: '100%', height: '100%', background: '#ef4444', borderRadius: '50%', opacity: 0.2, animation: 'pulse 2s infinite' }} />
                  <div style={{ width: '8px', height: '8px', background: '#dc2626', borderRadius: '50%' }} />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#111827', margin: 0, letterSpacing: '0.5px' }}>{t.active_threat_protocol}</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#fef2f2', color: '#991b1b', padding: '6px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, border: '1px solid #fee2e2' }}>
                <ShieldAlert size={14} />
                {t.target_prefix}: {latestAlert ? latestAlert.atm_name : 'Indian Bank, Mylapore'}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
              <div style={{ background: '#fafafa', padding: '14px', borderRadius: '8px', border: '1px solid #f3f4f6' }}>
                <div style={{ color: '#6b7280', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>{t.complaint_id}</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '15px', color: '#111827', fontWeight: 600 }}>{latestAlert ? `CMP-${latestAlert.complaint_id}` : 'CMP-001'}</div>
              </div>
              <div style={{ background: '#fafafa', padding: '14px', borderRadius: '8px', border: '1px solid #f3f4f6' }}>
                <div style={{ color: '#6b7280', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>{t.top_prediction_confidence}</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '15px', color: '#dc2626', fontWeight: 700 }}>{latestAlert ? `${(latestAlert.confidence * 100).toFixed(1)}%` : '80.1%'}</div>
              </div>
              <div style={{ background: '#fef2f2', padding: '14px', borderRadius: '8px', border: '1px solid #fee2e2' }}>
                <div style={{ color: '#991b1b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>{t.flagged_amount}</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '18px', color: '#dc2626', fontWeight: 700 }}>₹{(latestAlert ? (latestAlert.complaint_amount || 25000) : 25000).toLocaleString()}</div>
              </div>
              <div style={{ background: '#fafafa', padding: '14px', borderRadius: '8px', border: '1px solid #f3f4f6' }}>
                <div style={{ color: '#6b7280', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>{t.time_detected}</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '14px', color: '#111827', fontWeight: 500 }}>{latestAlert ? new Date(latestAlert.created_at).toLocaleTimeString() : '10:42 PM'}</div>
              </div>
              <div style={{ background: '#eef2ff', padding: '14px', borderRadius: '8px', border: '1px solid #e0e7ff', gridColumn: 'span 2' }}>
                <div style={{ color: '#4338ca', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>{t.target_account_routing}</div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '15px', color: '#4f46e5', fontWeight: 600 }}>{latestAlert ? latestAlert.entry_account : 'MULE_A3'} <span style={{ color: '#9ca3af' }}>→ {t.in_transit}</span></div>
              </div>
            </div>

            <div style={{ marginTop: 'auto' }}>
              <button 
                onClick={handleStartTracing} 
                style={{ width: '100%', background: '#111827', color: 'white', border: 'none', padding: '14px', borderRadius: '8px', fontSize: '14px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 14px rgba(0, 0, 0, 0.1)' }}
                onMouseOver={(e) => e.currentTarget.style.background = '#374151'}
                onMouseOut={(e) => e.currentTarget.style.background = '#111827'}
              >
                <Zap size={18} fill="currentColor" /> {t.analyze_incident_routing}
              </button>
            </div>
          </div>
        </div>

        {/* Visual Intelligence Analytics (24h Trend, Top Hotspots, Category Donut) */}
        <IntelligenceGraphs alerts={alerts} onSelectAtm={(atmId) => setSearchQuery(atmId)} />

        {/* Zone C: Threat Tracking Logs (Grouped by Complaint Incident) */}
        <div style={{ display: 'flex', flexDirection: 'column', background: '#ffffff', borderRadius: '16px', border: '1px solid #eaeaea', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', overflow: 'hidden' }}>
          
          {/* Header Title Bar */}
          <div style={{ padding: '20px 28px', borderBottom: '1px solid #eaeaea', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Terminal size={22} color="#6b7280" />
              <h4 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b', letterSpacing: '0.5px' }}>{t.threat_incidents_title}</h4>
              <span style={{ fontSize: '13px', background: '#e0e7ff', color: '#4338ca', padding: '3px 10px', borderRadius: '12px', fontWeight: 700 }}>
                {allIncidents.length} {t.unique_complaints}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={15} color="#2563eb" />
              <span>{t.table_hint}</span>
            </div>
          </div>

          {/* Multi-Dimensional Drill-Down Filter Toolbar */}
          <div style={{ padding: '18px 28px', background: '#ffffff', borderBottom: '1px solid #eaeaea', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '280px' }}>
              {/* Search Box */}
              <div style={{ position: 'relative', flex: 1, maxWidth: '340px' }}>
                <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder={t.filter_search_placeholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px 9px 36px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    outline: 'none',
                    background: '#f8fafc',
                    color: '#1e293b'
                  }}
                />
              </div>

              {/* Time Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={15} color="#64748b" />
                <select
                  value={filterTime}
                  onChange={(e) => setFilterTime(e.target.value as any)}
                  style={{
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#334155',
                    background: '#f8fafc',
                    cursor: 'pointer'
                  }}
                >
                  <option value="all">{t.filter_time_all}</option>
                  <option value="1h">{t.filter_time_1h}</option>
                  <option value="today">{t.filter_time_today}</option>
                  <option value="7d">{t.filter_time_7d}</option>
                </select>
              </div>

              {/* Location Zone Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin size={15} color="#64748b" />
                <select
                  value={filterZone}
                  onChange={(e) => setFilterZone(e.target.value as any)}
                  style={{
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#334155',
                    background: '#f8fafc',
                    cursor: 'pointer'
                  }}
                >
                  <option value="all">{t.filter_zone_all}</option>
                  <option value="central">{t.filter_zone_central}</option>
                  <option value="south">{t.filter_zone_south}</option>
                  <option value="north">{t.filter_zone_north}</option>
                </select>
              </div>

              {/* Crime Category Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Filter size={15} color="#64748b" />
                <select
                  value={filterCrime}
                  onChange={(e) => setFilterCrime(e.target.value as any)}
                  style={{
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#334155',
                    background: '#f8fafc',
                    cursor: 'pointer'
                  }}
                >
                  <option value="all">{t.filter_crime_all}</option>
                  <option value="phishing">{t.filter_crime_phishing}</option>
                  <option value="mule">{t.filter_crime_mule}</option>
                  <option value="investment">{t.filter_crime_investment}</option>
                  <option value="atm">{t.filter_crime_atm}</option>
                </select>
              </div>
            </div>

            {/* Right: Status Filter Pills & Live Result Count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
                <button
                  onClick={() => setFilterStatus('all')}
                  style={{
                    border: 'none',
                    background: filterStatus === 'all' ? '#ffffff' : 'transparent',
                    color: filterStatus === 'all' ? '#1e293b' : '#64748b',
                    fontWeight: 700,
                    fontSize: '12px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    boxShadow: filterStatus === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  {t.filter_status_all}
                </button>
                <button
                  onClick={() => setFilterStatus('pending')}
                  style={{
                    border: 'none',
                    background: filterStatus === 'pending' ? '#ffffff' : 'transparent',
                    color: filterStatus === 'pending' ? '#d97706' : '#64748b',
                    fontWeight: 700,
                    fontSize: '12px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    boxShadow: filterStatus === 'pending' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  {t.filter_status_pending}
                </button>
                <button
                  onClick={() => setFilterStatus('reviewed')}
                  style={{
                    border: 'none',
                    background: filterStatus === 'reviewed' ? '#ffffff' : 'transparent',
                    color: filterStatus === 'reviewed' ? '#059669' : '#64748b',
                    fontWeight: 700,
                    fontSize: '12px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    boxShadow: filterStatus === 'reviewed' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  {t.filter_status_verified}
                </button>
              </div>

              {/* Reset Filters button */}
              {hasActiveFilters && (
                <button
                  onClick={resetFilters}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    color: '#ef4444',
                    fontSize: '12px',
                    fontWeight: 600,
                    padding: '7px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                  title="Reset all filters"
                >
                  <RotateCcw size={13} /> {t.filter_reset}
                </button>
              )}

              {/* Counter Badge */}
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>
                {t.filter_showing} <strong>{filteredIncidents.length}</strong> {t.filter_of} {allIncidents.length} {t.filter_incidents}
              </span>
            </div>
          </div>
          
          <div style={{ width: '100%', overflowX: 'auto', padding: '0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead style={{ background: '#f8fafc', borderBottom: '1px solid #eaeaea' }}>
                <tr>
                  <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', width: '160px' }}>{t.col_incident_time}</th>
                  <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', width: '200px' }}>{t.col_mule_amount}</th>
                  <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>{t.col_ranked_atms}</th>
                  <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', width: '330px' }}>{t.col_shap_drivers}</th>
                  <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', width: '210px' }}>{t.col_actions}</th>
                </tr>
              </thead>
              <tbody>
                {filteredIncidents.map((inc, idx) => {
                  const topAtm = inc.atms[0];
                  const topReasons = topAtm ? parseReasons(topAtm.reasons || topAtm.shap_explanation) : [];
                  const isExpanded = expandedComplaintId === inc.complaint_id;

                  return (
                    <React.Fragment key={inc.complaint_id || idx}>
                      <tr style={{ borderBottom: isExpanded ? 'none' : '1px solid #eef2f6', background: idx === 0 ? '#fff8f8' : 'transparent', transition: 'background 0.2s' }}>
                        {/* Incident / Time */}
                        <td style={{ padding: '24px 24px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '15px', fontWeight: 800, color: '#dc2626' }}>
                              CMP-{inc.complaint_id}
                            </span>
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', color: '#64748b', fontWeight: 500 }}>
                              {new Date(inc.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </div>
                        </td>

                        {/* Mule Account & Amount */}
                        <td style={{ padding: '24px 24px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '15px', color: '#4338ca', fontWeight: 700 }}>
                              {inc.entry_account}
                            </span>
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '15px', fontWeight: 800, color: '#111827' }}>
                              ₹{inc.complaint_amount.toLocaleString()}
                            </span>
                          </div>
                        </td>

                        {/* Ranked ATM Predictions (#1 prominent + #2, #3 runner-up chips) */}
                        <td style={{ padding: '24px 24px', verticalAlign: 'top' }}>
                          {topAtm ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              {/* #1 Primary ATM Card */}
                              <div 
                                onClick={() => handlePinpointAtm(topAtm)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '12px 18px',
                                  background: idx === 0 ? '#fee2e2' : '#fef2f2',
                                  border: '1.5px solid #fecaca',
                                  borderRadius: '10px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                  boxShadow: '0 2px 6px rgba(220, 38, 38, 0.06)'
                                }}
                                title="Click to pinpoint #1 Primary ATM on map"
                                onMouseOver={(e) => e.currentTarget.style.borderColor = '#ef4444'}
                                onMouseOut={(e) => e.currentTarget.style.borderColor = '#fecaca'}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                  <span style={{ background: '#dc2626', color: 'white', fontSize: '12px', fontWeight: 900, padding: '4px 9px', borderRadius: '6px' }}>
                                    #1
                                  </span>
                                  <div>
                                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      {topAtm.atm_name}
                                      <MapPin size={15} color="#dc2626" />
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace', marginTop: '2px' }}>
                                      {topAtm.lat ? `GPS: ${topAtm.lat.toFixed(4)}, ${topAtm.lon.toFixed(4)}` : topAtm.atm_id}
                                    </div>
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right', paddingLeft: '16px' }}>
                                  <div style={{ fontSize: '17px', fontWeight: 900, color: '#dc2626', fontFamily: 'monospace' }}>
                                    {(topAtm.confidence * 100).toFixed(1)}%
                                  </div>
                                  <div style={{ fontSize: '10px', color: '#991b1b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t.top_target_badge}</div>
                                </div>
                              </div>

                              {/* Runner up #2 and #3 Chips */}
                              {inc.atms.length > 1 && (
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                                  {inc.atms.slice(1, 3).map((atm, aIdx) => (
                                    <button
                                      key={atm.id || aIdx}
                                      onClick={() => handlePinpointAtm(atm)}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '6px 14px',
                                        background: '#f8fafc',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '8px',
                                        fontSize: '13px',
                                        color: '#334155',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s',
                                        fontWeight: 600
                                      }}
                                      title={`Click to pinpoint #${aIdx + 2} on map`}
                                      onMouseOver={(e) => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.borderColor = '#cbd5e1'; }}
                                      onMouseOut={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                                    >
                                      <span style={{ fontWeight: 800, color: '#64748b' }}>#{aIdx + 2}</span>
                                      <span>{atm.atm_name}</span>
                                      <span style={{ fontFamily: 'monospace', fontWeight: 800, color: atm.confidence > 0.5 ? '#d97706' : '#64748b' }}>
                                        {(atm.confidence * 100).toFixed(1)}%
                                      </span>
                                      <MapPin size={12} color="#64748b" />
                                    </button>
                                  ))}
                                  <button
                                    onClick={() => setExpandedComplaintId(isExpanded ? null : inc.complaint_id)}
                                    style={{
                                      background: '#eef2ff',
                                      border: '1px solid #e0e7ff',
                                      padding: '6px 12px',
                                      borderRadius: '8px',
                                      fontSize: '12px',
                                      color: '#4338ca',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}
                                  >
                                    {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                    {isExpanded ? t.collapse_btn : t.all_atms_btn}
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: '#9ca3af', fontSize: '13px' }}>{t.no_incidents}</span>
                          )}
                        </td>

                        {/* Primary SHAP Drivers for #1 ATM */}
                        <td style={{ padding: '24px 24px', verticalAlign: 'top' }}>
                          {topReasons.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {topReasons.slice(0, 2).map((reason: string, rIdx: number) => {
                                const isRaised = reason.includes('raised') || reason.includes('உயர்த்தியது') || reason.includes('बढ़ाया');
                                const translated = translateReason(reason, language);
                                return (
                                  <div 
                                    key={rIdx} 
                                    style={{ 
                                      fontSize: '12px', 
                                      background: isRaised ? '#f0fdf4' : '#fffbeb',
                                      color: isRaised ? '#166534' : '#92400e',
                                      border: isRaised ? '1px solid #bbf7d0' : '1px solid #fde68a',
                                      padding: '6px 12px', 
                                      borderRadius: '6px',
                                      fontFamily: 'system-ui, -apple-system, sans-serif',
                                      lineHeight: 1.4,
                                      fontWeight: 500
                                    }}
                                    title={translated}
                                  >
                                    {isRaised ? '▲ ' : '▼ '} {translated}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <span style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>ML Feature Combiner</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '24px 24px', verticalAlign: 'top' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <button
                              onClick={() => handleReviewIncident(inc)}
                              disabled={inc.reviewed || reviewingComplaintId === inc.complaint_id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                background: inc.reviewed ? '#ecfdf5' : '#fef3c7',
                                color: inc.reviewed ? '#059669' : '#d97706',
                                border: inc.reviewed ? '1px solid #a7f3d0' : '1px solid #fde68a',
                                padding: '8px 14px',
                                borderRadius: '8px',
                                fontSize: '13px',
                                fontWeight: 700,
                                cursor: inc.reviewed ? 'default' : 'pointer',
                                transition: 'all 0.2s',
                              }}
                              title={inc.reviewed ? t.status_verified : t.mark_reviewed}
                            >
                              {inc.reviewed ? <CheckCircle size={15} /> : <Clock size={15} />}
                              {inc.reviewed ? t.reviewed : (reviewingComplaintId === inc.complaint_id ? t.saving : t.mark_reviewed)}
                            </button>

                            <button
                              onClick={() => handleStartTracingIncident(inc)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                background: '#111827',
                                color: '#ffffff',
                                border: 'none',
                                padding: '8px 14px',
                                borderRadius: '8px',
                                fontSize: '13px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.15s'
                              }}
                              onMouseOver={(e) => e.currentTarget.style.background = '#374151'}
                              onMouseOut={(e) => e.currentTarget.style.background = '#111827'}
                            >
                              <Zap size={14} /> {t.trace_route}
                            </button>

                            {/* Court-Admissible Dossier Export Button */}
                            <button
                              onClick={() => setSelectedDossierIncident(inc)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                background: '#f8fafc',
                                color: '#334155',
                                border: '1px solid #cbd5e1',
                                padding: '8px 14px',
                                borderRadius: '8px',
                                fontSize: '13px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                              }}
                              title="Export Court-Admissible Law Enforcement Evidence Dossier"
                              onMouseOver={(e) => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; }}
                              onMouseOut={(e) => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#334155'; }}
                            >
                              <FileText size={14} color="#4f46e5" /> {t.dossier_btn}
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable row showing all 3 ATMs with their individual SHAP explanations side-by-side */}
                      {isExpanded && (
                        <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                          <td colSpan={5} style={{ padding: '16px 24px' }}>
                            <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                <Layers size={16} color="#4f46e5" />
                                <span style={{ fontSize: '13px', fontWeight: 700, color: '#374151' }}>
                                  {t.full_risk_breakdown} #{inc.complaint_id}
                                </span>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                                {inc.atms.slice(0, 3).map((atm, rIndex) => {
                                  const rList = parseReasons(atm.reasons || atm.shap_explanation);
                                  return (
                                    <div 
                                      key={atm.id || rIndex}
                                      style={{
                                        background: rIndex === 0 ? '#fef2f2' : '#f9fafb',
                                        border: rIndex === 0 ? '1px solid #fee2e2' : '1px solid #e5e7eb',
                                        borderRadius: '8px',
                                        padding: '12px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px'
                                      }}
                                    >
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 800, color: rIndex === 0 ? '#dc2626' : '#6b7280' }}>
                                          {t.rank_prefix} #{rIndex + 1}
                                        </span>
                                        <span style={{ fontSize: '14px', fontWeight: 800, color: rIndex === 0 ? '#dc2626' : '#374151', fontFamily: 'monospace' }}>
                                          {(atm.confidence * 100).toFixed(1)}%
                                        </span>
                                      </div>
                                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>
                                        {atm.atm_name}
                                      </div>
                                      <div style={{ fontSize: '11px', color: '#6b7280', fontFamily: 'monospace' }}>
                                        {atm.lat ? `GPS: ${atm.lat.toFixed(4)}, ${atm.lon.toFixed(4)}` : atm.atm_id}
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                                        {rList.map((reason, reIdx) => {
                                          const isRaised = reason.includes('raised') || reason.includes('உயர்த்தியது') || reason.includes('बढ़ाया');
                                          const trans = translateReason(reason, language);
                                          return (
                                            <div key={reIdx} style={{ fontSize: '10px', color: isRaised ? '#166534' : '#92400e', background: isRaised ? '#f0fdf4' : '#fffbeb', padding: '2px 6px', borderRadius: '4px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                                              {isRaised ? '▲' : '▼'} {trans}
                                            </div>
                                          );
                                        })}
                                      </div>
                                      <button
                                        onClick={() => handlePinpointAtm(atm)}
                                        style={{
                                          marginTop: '6px',
                                          background: '#ffffff',
                                          border: '1px solid #d1d5db',
                                          padding: '5px 10px',
                                          borderRadius: '6px',
                                          fontSize: '11px',
                                          fontWeight: 600,
                                          color: '#2563eb',
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          gap: '4px'
                                        }}
                                      >
                                        <MapPin size={12} /> {t.pinpoint_on_map}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {filteredIncidents.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      {t.no_incidents}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Interactive Map Pinpoint Modal */}
      {selectedPinpointAlert && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(17, 24, 39, 0.7)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '24px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '750px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.3)',
            border: '1px solid #eaeaea'
          }}>
            {/* Modal Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #eaeaea', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#fee2e2', color: '#dc2626', padding: '6px', borderRadius: '8px', display: 'flex' }}>
                  <MapPin size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#111827' }}>
                    {selectedPinpointAlert.atm_name}
                  </h3>
                  <div style={{ fontSize: '12px', color: '#6b7280', display: 'flex', gap: '12px', marginTop: '2px' }}>
                    <span>{t.modal_complaint}: <strong>CMP-{selectedPinpointAlert.complaint_id}</strong></span>
                    <span>{t.modal_alert}: <strong>ALT-{selectedPinpointAlert.id}</strong></span>
                    <span>{t.modal_confidence}: <strong>{(selectedPinpointAlert.confidence * 100).toFixed(1)}%</strong></span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedPinpointAlert(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: '6px', display: 'flex', color: '#6b7280' }}
                onMouseOver={(e) => e.currentTarget.style.background = '#f3f4f6'}
                onMouseOut={(e) => e.currentTarget.style.background = 'none'}
              >
                <X size={20} />
              </button>
            </div>

            {/* Quick switcher between all 3 predicted ATMs in this incident */}
            {modalRelatedAtms.length > 1 && (
              <div style={{ display: 'flex', gap: '8px', padding: '10px 24px', background: '#f3f4f6', borderBottom: '1px solid #e5e7eb' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', alignSelf: 'center' }}>{t.switch_atm}:</span>
                {modalRelatedAtms.map((atm, idx) => (
                  <button
                    key={atm.id || idx}
                    onClick={() => setSelectedPinpointAlert(atm)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: atm.id === selectedPinpointAlert.id ? '2px solid #dc2626' : '1px solid #d1d5db',
                      background: atm.id === selectedPinpointAlert.id ? '#fee2e2' : '#ffffff',
                      color: atm.id === selectedPinpointAlert.id ? '#991b1b' : '#374151',
                    }}
                  >
                    #{idx + 1} {atm.atm_name} ({(atm.confidence * 100).toFixed(1)}%)
                  </button>
                ))}
              </div>
            )}

            {/* Modal Body */}
            <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Map Preview */}
              <div style={{ height: '300px', width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e5e7eb', position: 'relative' }}>
                <MapGL
                  key={`${selectedPinpointAlert.lat}-${selectedPinpointAlert.lon}`}
                  initialViewState={{
                    longitude: selectedPinpointAlert.lon || 80.23,
                    latitude: selectedPinpointAlert.lat || 13.04,
                    zoom: 14,
                    pitch: 35
                  }}
                  mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
                  style={{ width: '100%', height: '100%' }}
                >
                  {selectedPinpointAlert.lat && selectedPinpointAlert.lon && (
                    <Marker longitude={selectedPinpointAlert.lon} latitude={selectedPinpointAlert.lat} anchor="bottom">
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{
                          background: '#dc2626',
                          color: 'white',
                          padding: '5px 12px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: 700,
                          boxShadow: '0 4px 14px rgba(220, 38, 38, 0.4)',
                          whiteSpace: 'nowrap',
                          marginBottom: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <MapPin size={14} /> {selectedPinpointAlert.atm_name}
                        </div>
                        <div style={{
                          width: '16px',
                          height: '16px',
                          background: '#ef4444',
                          borderRadius: '50%',
                          border: '3px solid white',
                          boxShadow: '0 0 0 6px rgba(239, 68, 68, 0.35)'
                        }} />
                      </div>
                    </Marker>
                  )}
                </MapGL>
              </div>

              {/* SHAP XAI Explanation Card */}
              <div style={{ background: '#f8fafc', padding: '18px 20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <BrainCircuit size={18} color="#4f46e5" />
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {t.shap_explanation_title}
                  </h4>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {parseReasons(selectedPinpointAlert.reasons || selectedPinpointAlert.shap_explanation).map((reason: string, idx: number) => {
                    const isRaised = reason.includes('raised') || reason.includes('உயர்த்தியது') || reason.includes('बढ़ाया');
                    const translated = translateReason(reason, language);
                    return (
                      <div 
                        key={idx} 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '10px', 
                          padding: '10px 14px', 
                          background: isRaised ? '#f0fdf4' : '#fffbeb', 
                          border: isRaised ? '1px solid #bbf7d0' : '1px solid #fde68a', 
                          borderRadius: '8px', 
                          fontSize: '13px' 
                        }}
                      >
                        {isRaised ? <ArrowUpRight size={18} color="#16a34a" /> : <ArrowDownRight size={18} color="#d97706" />}
                        <span style={{ color: isRaised ? '#166534' : '#92400e', fontWeight: 600, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                          {translated}
                        </span>
                      </div>
                    );
                  })}
                  {parseReasons(selectedPinpointAlert.reasons || selectedPinpointAlert.shap_explanation).length === 0 && (
                    <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>{t.no_shap_factors}</p>
                  )}
                </div>
              </div>

              {/* Forensic Details Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div style={{ background: '#fafafa', padding: '12px 14px', borderRadius: '8px', border: '1px solid #f3f4f6' }}>
                  <div style={{ color: '#6b7280', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>{t.gps_coords}</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', fontWeight: 600, color: '#111827', marginTop: '2px' }}>
                    {selectedPinpointAlert.lat ? `${selectedPinpointAlert.lat.toFixed(4)}, ${selectedPinpointAlert.lon.toFixed(4)}` : 'N/A'}
                  </div>
                </div>
                <div style={{ background: '#fafafa', padding: '12px 14px', borderRadius: '8px', border: '1px solid #f3f4f6' }}>
                  <div style={{ color: '#6b7280', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>{t.account_route}</div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', fontWeight: 600, color: '#4f46e5', marginTop: '2px' }}>
                    {selectedPinpointAlert.entry_account || 'MULE_A3'}
                  </div>
                </div>
                <div style={{ background: '#fafafa', padding: '12px 14px', borderRadius: '8px', border: '1px solid #f3f4f6' }}>
                  <div style={{ color: '#6b7280', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>{t.review_status}</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: selectedPinpointAlert.reviewed ? '#059669' : '#d97706', marginTop: '2px' }}>
                    {selectedPinpointAlert.reviewed ? t.status_verified : t.status_pending}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #eaeaea', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa' }}>
              <button
                onClick={async () => {
                  try {
                    await reviewAlert(selectedPinpointAlert.id);
                    setAlerts(prev => prev.map(a => a.id === selectedPinpointAlert.id ? { ...a, reviewed: 1 } : a));
                    setSelectedPinpointAlert(prev => prev ? { ...prev, reviewed: 1 } : null);
                  } catch (e) {
                    console.error('Failed to review alert', e);
                  }
                }}
                disabled={selectedPinpointAlert.reviewed === 1}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: selectedPinpointAlert.reviewed ? '#ecfdf5' : '#10b981',
                  color: selectedPinpointAlert.reviewed ? '#059669' : '#ffffff',
                  border: selectedPinpointAlert.reviewed ? '1px solid #a7f3d0' : 'none',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: selectedPinpointAlert.reviewed ? 'default' : 'pointer'
                }}
              >
                <CheckCircle size={16} />
                {selectedPinpointAlert.reviewed ? t.marked_as_reviewed : t.mark_as_reviewed}
              </button>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => {
                    setEntryAccount(selectedPinpointAlert.entry_account || 'MULE_A3');
                    setAmount(selectedPinpointAlert.complaint_amount || 25000);
                    setComplaintId(`CMP-${selectedPinpointAlert.complaint_id}`);
                    setCaseId(`CASE-2026-${1000 + selectedPinpointAlert.complaint_id}`);
                    setTransactionId(`TXN-${selectedPinpointAlert.id}`);
                    setSaveToDb(false);
                    startTracing();
                    navigate('/trace');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: '#111827',
                    color: 'white',
                    border: 'none',
                    padding: '10px 18px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Zap size={16} /> {t.launch_live_trace}
                </button>
                <button
                  onClick={() => setSelectedPinpointAlert(null)}
                  style={{
                    background: '#ffffff',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    padding: '10px 18px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {t.close}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Court-Admissible Law Enforcement Forensic Dossier Modal */}
      {selectedDossierIncident && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '850px',
            maxHeight: '94vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            border: '1px solid #cbd5e1'
          }}>
            {/* Top Toolbar (Hidden during print) */}
            <div className="no-print" style={{ padding: '14px 24px', background: '#0f172a', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Shield size={18} color="#38bdf8" />
                <span style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.5px' }}>
                  {t.dossier_title} • CMP-{selectedDossierIncident.complaint_id}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  onClick={() => window.print()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)'
                  }}
                >
                  <Printer size={15} /> {t.dossier_print_btn}
                </button>
                <button
                  onClick={() => setSelectedDossierIncident(null)}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Printable Dossier Container */}
            <div id="printable-dossier" ref={dossierPrintRef} style={{ padding: '36px 40px', overflowY: 'auto', background: '#ffffff', color: '#0f172a', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
              
              {/* Official Header (Text-Only) */}
              <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '20px', marginBottom: '24px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: '#475569', letterSpacing: '1.5px' }}>
                  Government of India • Ministry of Home Affairs
                </div>
                <div style={{ fontSize: '20px', fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', marginTop: '4px', letterSpacing: '0.5px' }}>
                  Indian Cyber Crime Coordination Centre (I4C)
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#b91c1c', letterSpacing: '1.5px', marginTop: '6px', textTransform: 'uppercase' }}>
                  T.R.A.C.E. Law Enforcement Forensic Evidence Dossier
                </div>
              </div>

              {/* Case Metadata Banner */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', marginBottom: '20px' }}>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Incident Reference</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', fontFamily: 'monospace', marginTop: '2px' }}>
                    CASE-2026-{1000 + selectedDossierIncident.complaint_id}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>National Portal Complaint</div>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#dc2626', fontFamily: 'monospace', marginTop: '2px' }}>
                    CMP-{selectedDossierIncident.complaint_id}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Detection Timestamp</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginTop: '2px' }}>
                    {new Date(selectedDossierIncident.created_at).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Triage Classification</div>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
                    {selectedDossierIncident.reviewed ? 'Verified & Reviewed' : 'Pending Field Action'}
                  </div>
                </div>
              </div>

              {/* Section 65B Indian Evidence Act Compliance Box */}
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '14px 18px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#991b1b', marginBottom: '6px' }}>
                  <Shield size={16} />
                  <span style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {t.dossier_evidence_cert}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.5, color: '#7f1d1d' }}>
                  {t.dossier_cert_body}
                </p>
                <div style={{ marginTop: '10px', padding: '8px 12px', background: '#ffffff', borderRadius: '6px', border: '1px solid #fee2e2', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>{t.dossier_hash_label}:</span>
                  <span style={{ fontSize: '12px', fontWeight: 800, fontFamily: 'monospace', color: '#0f172a' }}>
                    {selectedDossierIncident.atms[0]?.audit_hash || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'}
                  </span>
                </div>
              </div>

              {/* Financial Transaction & Money Mule Details */}
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '12px' }}>
                  1. Financial Incident & Mule Routing Profile
                </h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 0', color: '#64748b', width: '220px', fontWeight: 600 }}>Identified Mule Account:</td>
                      <td style={{ padding: '8px 0', fontFamily: 'monospace', fontWeight: 800, color: '#4f46e5' }}>{selectedDossierIncident.entry_account}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 0', color: '#64748b', fontWeight: 600 }}>Stolen / Flagged Amount:</td>
                      <td style={{ padding: '8px 0', fontFamily: 'monospace', fontWeight: 800, color: '#dc2626' }}>₹{selectedDossierIncident.complaint_amount.toLocaleString()} INR</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 0', color: '#64748b', fontWeight: 600 }}>Crime Modus Operandi:</td>
                      <td style={{ padding: '8px 0', fontWeight: 600 }}>UPI Layering / Phishing Compromise with Rapid ATM Extraction Attempt</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Primary Suspect Cash-Out Node */}
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '12px' }}>
                  2. Predicted Imminent Physical Cash-Out Location (Rank #1)
                </h4>
                {selectedDossierIncident.atms[0] ? (
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div>
                        <span style={{ background: '#dc2626', color: 'white', fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', marginRight: '8px' }}>
                          PRIORITY #1 TARGET
                        </span>
                        <strong style={{ fontSize: '16px', color: '#0f172a' }}>{selectedDossierIncident.atms[0].atm_name}</strong>
                      </div>
                      <span style={{ fontSize: '18px', fontWeight: 900, color: '#dc2626', fontFamily: 'monospace' }}>
                        {(selectedDossierIncident.atms[0].confidence * 100).toFixed(1)}% RISK
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', gap: '16px', marginBottom: '12px' }}>
                      <span>ATM ID: <strong>{selectedDossierIncident.atms[0].atm_id}</strong></span>
                      <span>Coordinates: <strong>{selectedDossierIncident.atms[0].lat?.toFixed(4)}, {selectedDossierIncident.atms[0].lon?.toFixed(4)}</strong></span>
                      <span>Google Maps: <a href={`https://maps.google.com/?q=${selectedDossierIncident.atms[0].lat},${selectedDossierIncident.atms[0].lon}`} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 700 }}>Open Link</a></span>
                    </div>

                    {/* SHAP Drivers */}
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '6px' }}>
                      XGBoost TreeSHAP Decision Attribution Factors:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {parseReasons(selectedDossierIncident.atms[0].reasons || selectedDossierIncident.atms[0].shap_explanation).map((r: string, rIdx: number) => (
                        <div key={rIdx} style={{ fontSize: '12px', fontFamily: 'monospace', padding: '6px 10px', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', color: r.includes('raised') ? '#166534' : '#92400e' }}>
                          {r.includes('raised') ? '▲ ' : '▼ '} {r}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: '13px', color: '#94a3b8' }}>No ATM target available.</p>
                )}
              </div>

              {/* Runner Up ATM Candidates */}
              {selectedDossierIncident.atms.length > 1 && (
                <div style={{ marginBottom: '28px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '12px' }}>
                    3. Secondary Risk ATM Hotspots
                  </h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                        <th style={{ padding: '8px 12px' }}>Rank</th>
                        <th style={{ padding: '8px 12px' }}>ATM Location</th>
                        <th style={{ padding: '8px 12px' }}>GPS Lat, Lon</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDossierIncident.atms.slice(1, 3).map((atm, aIdx) => (
                        <tr key={atm.id || aIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 700 }}>#{aIdx + 2}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 600 }}>{atm.atm_name}</td>
                          <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{atm.lat?.toFixed(4)}, {atm.lon?.toFixed(4)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#d97706', fontFamily: 'monospace' }}>
                            {(atm.confidence * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Signatures & Certification Stamp Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '40px', paddingTop: '20px', borderTop: '2px dashed #cbd5e1' }}>
                <div style={{ textAlign: 'center', width: '220px' }}>
                  <div style={{ height: '50px' }}></div>
                  <div style={{ borderTop: '1px solid #0f172a', paddingTop: '6px', fontSize: '12px', fontWeight: 700 }}>
                    {t.dossier_officer_sig}
                  </div>
                </div>

                <div style={{ textAlign: 'center', width: '180px', height: '90px', border: '2px solid #b91c1c', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#b91c1c', transform: 'rotate(-5deg)' }}>
                  <div style={{ fontSize: '9px', fontWeight: 900, textTransform: 'uppercase' }}>Govt of India / MHA</div>
                  <div style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase' }}>CYBER CRIME CELL</div>
                  <div style={{ fontSize: '9px', fontWeight: 700 }}>OFFICIAL DISPATCH</div>
                </div>

                <div style={{ textAlign: 'center', width: '220px' }}>
                  <div style={{ height: '50px' }}></div>
                  <div style={{ borderTop: '1px solid #0f172a', paddingTop: '6px', fontSize: '12px', fontWeight: 700 }}>
                    {t.dossier_station_stamp}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
};
