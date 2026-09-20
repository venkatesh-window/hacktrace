import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrace } from '../contexts/TraceContext';
import { useLanguage } from '../contexts/LanguageContext';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Send, CheckCircle2, Landmark, Crosshair } from 'lucide-react';
import Map, { Marker, Popup, Source, Layer } from 'react-map-gl/maplibre';

export const ATMIntelligence = () => {
  const navigate = useNavigate();
  const { predictionData, status, setStatus, resetCase } = useTrace();
  const { t } = useLanguage();
  const [revealedCount, setRevealedCount] = useState(0);
  const [alertSent, setAlertSent] = useState<Record<string, boolean>>({});
  const [hoveredAtm, setHoveredAtm] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'ATM_ANALYSIS') {
      const timer1 = setTimeout(() => setRevealedCount(1), 1000);
      const timer2 = setTimeout(() => setRevealedCount(2), 2500);
      const timer3 = setTimeout(() => {
        setRevealedCount(3);
        setStatus('ALERT_READY');
      }, 4000);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
      };
    } else if (status === 'ALERT_READY' || status === 'ALERT_SENT') {
      setRevealedCount(3);
    }
  }, [status, setStatus]);

  if (!predictionData) {
    return (
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <h2 style={{ color: 'var(--text-muted)' }}>No prediction data available. Run trace first.</h2>
      </div>
    );
  }

  const handleSendAlert = (type: string) => {
    setAlertSent(prev => ({ ...prev, [type]: true }));
    setStatus('ALERT_SENT');
  };

  const predictions = predictionData.predictions.slice(0, 3);
  const activePredictions = predictions.slice(0, revealedCount);

  // Generate heatmap source from active predictions based on confidence
  const heatmapGeoJSON = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: activePredictions.map(p => ({
        type: 'Feature',
        properties: { weight: Math.max(0.1, (p.confidence - 0.7) * 3) }, // scale weight
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] }
      }))
    };
  }, [activePredictions]);

  return (
    <div className="page-container no-padding" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="map-container" style={{ right: '450px', width: 'auto' }}>
        <Map
          initialViewState={{ longitude: 80.23, latitude: 13.04, zoom: 11.5, pitch: 30 }}
          mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        >
          {/* Risk Heatmap Layer */}
          <Source id="risk-heatmap" type="geojson" data={heatmapGeoJSON as any}>
            <Layer
              id="heatmap-layer"
              type="heatmap"
              paint={{
                'heatmap-weight': ['get', 'weight'],
                'heatmap-intensity': 1,
                'heatmap-color': [
                  'interpolate', ['linear'], ['heatmap-density'],
                  0, 'rgba(239, 68, 68, 0)',
                  0.2, 'rgba(245, 158, 11, 0.2)',
                  0.5, 'rgba(239, 68, 68, 0.5)',
                  1, 'rgba(220, 38, 38, 0.8)'
                ],
                'heatmap-radius': 80,
                'heatmap-opacity': 0.7
              }}
            />
          </Source>

          {activePredictions.map((p, i) => (
            <Marker 
              key={p.atm_id} 
              longitude={p.lon} 
              latitude={p.lat}
              style={{ zIndex: hoveredAtm === p.atm_id ? 10 : 1 }}
            >
              <div 
                onMouseEnter={() => setHoveredAtm(p.atm_id)}
                onMouseLeave={() => setHoveredAtm(null)}
                style={{ position: 'relative', cursor: 'pointer', transition: 'transform 0.2s', transform: hoveredAtm === p.atm_id ? 'scale(1.1)' : 'scale(1)' }}
              >
                {/* Custom ATM Badge */}
                <div style={{
                  backgroundColor: 'white',
                  borderRadius: '24px',
                  padding: '4px 12px 4px 4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: i === 0 ? 'var(--danger-glow)' : 'var(--shadow-md)',
                  border: `2px solid ${i === 0 ? 'var(--danger-color)' : i === 1 ? 'var(--warning-color)' : 'var(--accent-color)'}`,
                  position: 'relative',
                  zIndex: 2
                }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%',
                    backgroundColor: i === 0 ? 'var(--danger-color)' : i === 1 ? 'var(--warning-color)' : 'var(--accent-color)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
                    fontWeight: 800, fontSize: '14px'
                  }}>
                    {i + 1}
                  </div>
                  <Landmark size={16} color="var(--text-primary)" />
                  <span className="mono" style={{ fontSize: '11px', background: 'transparent', border: 'none', padding: 0 }}>
                    {(p.confidence * 100).toFixed(1)}%
                  </span>
                </div>
                
                {/* Continuous pulse for #1 ATM */}
                {i === 0 && (
                  <>
                    <div className="pulse-marker-ring" style={{ backgroundColor: 'rgba(239, 68, 68, 0.4)' }} />
                    <div className="pulse-marker-ring-2" style={{ backgroundColor: 'rgba(239, 68, 68, 0.4)' }} />
                  </>
                )}
              </div>
            </Marker>
          ))}

          {/* Sync Popup with Map Hover */}
          {hoveredAtm && (
            <Popup
              longitude={predictions.find(p => p.atm_id === hoveredAtm)!.lon}
              latitude={predictions.find(p => p.atm_id === hoveredAtm)!.lat}
              anchor="bottom"
              offset={40}
              closeButton={false}
              className="custom-popup"
              style={{ padding: 0 }}
            >
              <div style={{ padding: '16px', width: '280px', borderRadius: '12px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {predictions.find(p => p.atm_id === hoveredAtm)!.atm_name}
                </h4>
                <div className="mono" style={{ fontSize: '11px', marginTop: '4px', marginBottom: '12px', border: 'none', background: 'transparent', padding: 0 }}>
                  ID: {hoveredAtm}
                </div>
                <div style={{ backgroundColor: 'var(--bg-hover)', padding: '10px', borderRadius: '6px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '6px' }}>Top Risk Factors</div>
                  <ul style={{ paddingLeft: '14px', fontSize: '12px', margin: 0, color: 'var(--text-primary)' }}>
                    {predictions.find(p => p.atm_id === hoveredAtm)!.top_reasons.map((r, idx) => (
                      <li key={idx} style={{ marginBottom: '4px' }}>{r}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </Popup>
          )}
        </Map>
      </div>

      {/* Right Sidebar */}
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '450px', backgroundColor: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(20px)', borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', zIndex: 10, boxShadow: 'var(--shadow-lg)' }}>
        
        <div style={{ padding: '24px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
            <Crosshair size={24} color="var(--primary-color)" /> {t.atm_title}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px', fontWeight: 500 }}>{t.atm_subtitle}</p>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Target Ranking
            </div>
            {status === 'ATM_ANALYSIS' && <div className="pulse-marker-core marker-primary" style={{ width: '10px', height: '10px', borderWidth: '1px' }}><div className="pulse-marker-ring" /></div>}
          </div>

          <AnimatePresence>
            {predictions.map((p, i) => (
              i < revealedCount && (
                <motion.div
                  key={p.atm_id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                  className="card"
                  onMouseEnter={() => setHoveredAtm(p.atm_id)}
                  onMouseLeave={() => setHoveredAtm(null)}
                  style={{ 
                    borderLeft: `4px solid ${i === 0 ? 'var(--danger-color)' : i === 1 ? 'var(--warning-color)' : 'var(--accent-color)'}`,
                    boxShadow: hoveredAtm === p.atm_id ? 'var(--shadow-lg)' : 'var(--shadow-md)',
                    borderColor: hoveredAtm === p.atm_id ? 'var(--primary-color)' : 'var(--border-color)',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>#{i + 1} {p.atm_name}</span>
                      </div>
                      <div className="mono" style={{ marginTop: '8px' }}>
                        ID: {p.atm_id}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="mono" style={{ fontSize: '18px', fontWeight: 800, color: i === 0 ? 'var(--danger-color)' : 'var(--text-primary)', background: 'transparent', border: 'none', padding: 0 }}>
                        {(p.confidence * 100).toFixed(1)}%
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px', fontWeight: 600 }}>
                        Risk Confidence
                      </div>
                    </div>
                  </div>

                  <div style={{ backgroundColor: 'var(--bg-primary)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Primary Risk Factors
                    </div>
                    <ul style={{ paddingLeft: '16px', fontSize: '13px', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '8px', fontWeight: 500 }}>
                      {p.top_reasons.map((reason, j) => (
                        <li key={j}>{reason}</li>
                      ))}
                    </ul>
                  </div>

                  {i === 0 && (
                    <div style={{ marginTop: '16px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div style={{ backgroundColor: 'var(--bg-primary)', padding: '12px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>Mule Score</div>
                          <div className="mono" style={{ fontWeight: 700, background: 'transparent', border: 'none', padding: 0 }}>{p.features.mule_score.toFixed(2)}</div>
                        </div>
                        <div style={{ backgroundColor: 'var(--bg-primary)', padding: '12px', borderRadius: '8px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>Hub Score</div>
                          <div className="mono" style={{ fontWeight: 700, background: 'transparent', border: 'none', padding: 0 }}>{p.features.hub_score.toFixed(2)}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )
            ))}
          </AnimatePresence>
        </div>

        {/* Action Bottom Bar */}
        {(status === 'ALERT_READY' || status === 'ALERT_SENT') && (
          <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            style={{ padding: '24px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)' }}
          >
            <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Investigation Action Required
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button 
                onClick={() => handleSendAlert('bank')}
                className="btn" 
                style={{ width: '100%', justifyContent: 'space-between', padding: '16px', border: alertSent['bank'] ? '1px solid var(--success-color)' : '1px solid var(--border-color)', fontWeight: 600 }}
                disabled={alertSent['bank']}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {alertSent['bank'] ? <CheckCircle2 size={20} color="var(--success-color)" /> : <Send size={20} />}
                  SEND BANK ALERT
                </span>
                {alertSent['bank'] && <span style={{ color: 'var(--success-color)', fontSize: '13px', fontWeight: 700 }}>SENT ✓</span>}
              </button>
              
              <button 
                onClick={() => handleSendAlert('cyber')}
                className="btn" 
                style={{ width: '100%', justifyContent: 'space-between', padding: '16px', border: alertSent['cyber'] ? '1px solid var(--success-color)' : '1px solid var(--border-color)', fontWeight: 600 }}
                disabled={alertSent['cyber']}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {alertSent['cyber'] ? <CheckCircle2 size={20} color="var(--success-color)" /> : <AlertTriangle size={20} color="var(--danger-color)" style={{ filter: 'drop-shadow(var(--danger-glow))' }} />}
                  SEND CYBERCRIME ALERT
                </span>
                {alertSent['cyber'] && <span style={{ color: 'var(--success-color)', fontSize: '13px', fontWeight: 700 }}>SENT ✓</span>}
              </button>
            </div>
            
            {status === 'ALERT_SENT' && (
              <motion.button 
                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
                onClick={() => {
                  resetCase();
                  navigate('/');
                }}
                className="btn" 
                style={{ width: '100%', padding: '12px', border: '1px solid var(--border-color)', fontWeight: 600, backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'center' }}
              >
                RETURN TO DASHBOARD
              </motion.button>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};
