import { useEffect, useState, useRef, useMemo, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrace } from '../contexts/TraceContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getNetwork, runPrediction } from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import { Network, ShieldAlert, Cpu, Activity } from 'lucide-react';
import Map, { Marker, Source, Layer, type MapRef } from 'react-map-gl/maplibre';


// Utility to generate a quadratic bezier curve array for GeoJSON
const getArcCoords = (source: [number, number], target: [number, number], points = 40) => {
  const [sx, sy] = source;
  const [tx, ty] = target;
  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.sqrt(dx*dx + dy*dy);
  
  // 15% perpendicular offset for a nice arc
  const cx = (sx + tx) / 2 - (dy / len) * (len * 0.15);
  const cy = (sy + ty) / 2 + (dx / len) * (len * 0.15);

  const coords = [];
  for (let i = 0; i <= points; i++) {
    const t = i / points;
    const x = (1-t)*(1-t)*sx + 2*(1-t)*t*cx + t*t*tx;
    const y = (1-t)*(1-t)*sy + 2*(1-t)*t*cy + t*t*ty;
    coords.push([x, y]);
  }
  return coords;
};

export const TraceLive = () => {
  const navigate = useNavigate();
  const { 
    entryAccount, amount, status, setStatus, 
    networkData, setNetworkData, setPredictionData,
    hoveredNodeId, selectedNodeId, setHoveredNodeId, saveToDb
  } = useTrace();
  const { t } = useLanguage();

  const [activeNodes, setActiveNodes] = useState<string[]>([]);
  const [activeEdges, setActiveEdges] = useState<any[]>([]);
  const mapRef = useRef<MapRef>(null);

  // Particle animation state
  const [time, setTime] = useState(0);
  
  useEffect(() => {
    let animationFrameId: number;
    const animateParticles = () => {
      setTime(prev => (prev + 0.01) % 1);
      animationFrameId = requestAnimationFrame(animateParticles);
    };
    animationFrameId = requestAnimationFrame(animateParticles);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  useEffect(() => {
    if (status === 'IDLE' || status === 'COMPLAINT_RECEIVED') {
      if (status === 'IDLE') navigate('/');
      return;
    }
    
    if (status === 'TRACING_INITIALIZING') {
      getNetwork(entryAccount, amount).then(data => {
        setNetworkData(data);
        setStatus('ACCOUNT_DISCOVERY');
      }).catch(err => {
        console.error(err);
      });
    }
  }, [status, entryAccount, amount, navigate, setStatus, setNetworkData]);

  useEffect(() => {
    if (!networkData) return;

    if (status === 'ACCOUNT_DISCOVERY') {
      let currentDelay = 0;
      networkData.nodes.forEach((node, i) => {
        setTimeout(() => {
          setActiveNodes(prev => prev.includes(node.id) ? prev : [...prev, node.id]);
          if (i === networkData.nodes.length - 1) {
            setTimeout(() => {
              if (mapRef.current) {
                const lats = networkData.nodes.map(n => n.lat).filter(Boolean) as number[];
                const lons = networkData.nodes.map(n => n.lon).filter(Boolean) as number[];
                if (lats.length && lons.length) {
                  mapRef.current.fitBounds(
                    [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
                    { padding: 100, duration: 1500, pitch: 45 }
                  );
                }
              }
              setStatus('NETWORK_RECONSTRUCTION');
            }, 1000);
          }
        }, currentDelay);
        currentDelay += 600;
      });
    }

    if (status === 'NETWORK_RECONSTRUCTION') {
      let currentDelay = 0;
      networkData.edges.forEach((edge, i) => {
        setTimeout(() => {
          setActiveEdges(prev => [...prev, edge]);
          if (i === networkData.edges.length - 1) {
            setTimeout(() => setStatus('TRACE_COMPLETE'), 1500);
          }
        }, currentDelay);
        currentDelay += 500;
      });
    }

    if (status === 'TRACE_COMPLETE') {
      setTimeout(() => setStatus('FEATURE_ANALYSIS'), 1500);
    }

    if (status === 'FEATURE_ANALYSIS') {
      setTimeout(() => setStatus('XGBOOST_RUNNING'), 2500);
    }

    if (status === 'XGBOOST_RUNNING') {
      runPrediction(entryAccount, amount, 5, saveToDb).then(res => {
        setPredictionData(res);
        setStatus('PREDICTION_COMPLETE');
        setTimeout(() => {
          setStatus('ATM_ANALYSIS');
          navigate('/atm');
        }, 3000);
      });
    }
  }, [status, networkData, setStatus, entryAccount, amount, setPredictionData, navigate, saveToDb]);

  const activeNodesData = useMemo(() => {
    if (!networkData) return [];
    return networkData.nodes.filter(n => activeNodes.includes(n.id) && n.lat && n.lon);
  }, [networkData, activeNodes]);

  // Construct GeoJSON for arcs and particles
  const arcGeoJSON = useMemo(() => {
    if (!networkData || activeEdges.length === 0) return null;
    
    const features = activeEdges.map((e, i) => {
      const source = networkData.nodes.find(n => n.id === e.source);
      const target = networkData.nodes.find(n => n.id === e.target);
      if (!source?.lat || !source?.lon || !target?.lat || !target?.lon) return null;
      
      const coords = getArcCoords([source.lon, source.lat], [target.lon, target.lat]);
      return {
        type: 'Feature',
        properties: { amount: e.amount, isNewest: i === activeEdges.length - 1 },
        geometry: { type: 'LineString', coordinates: coords }
      };
    }).filter(Boolean);

    return { type: 'FeatureCollection', features };
  }, [networkData, activeEdges]);

  const particleGeoJSON = useMemo(() => {
    if (!networkData || activeEdges.length === 0) return null;
    
    const features = activeEdges.map((e, i) => {
      const source = networkData.nodes.find(n => n.id === e.source);
      const target = networkData.nodes.find(n => n.id === e.target);
      if (!source?.lat || !source?.lon || !target?.lat || !target?.lon) return null;
      
      const coords = getArcCoords([source.lon, source.lat], [target.lon, target.lat]);
      
      // Calculate particle position based on time + offset
      const offset = i * 0.3;
      let progress = (time + offset) % 1;
      
      const idx = Math.floor(progress * (coords.length - 1));
      if (idx < 0 || idx >= coords.length) return null;
      
      return {
        type: 'Feature',
        properties: { amount: e.amount },
        geometry: { type: 'Point', coordinates: coords[idx] }
      };
    }).filter(Boolean);

    return { type: 'FeatureCollection', features };
  }, [networkData, activeEdges, time]);
  return (
    <div className="page-container no-padding" style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
      
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Map View */}
        <div className="map-container" style={{ position: 'relative', flex: 1 }}>
            <Map
              ref={mapRef}
              initialViewState={{ longitude: 80.23, latitude: 13.04, zoom: 11, pitch: 45 }}
              mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
              interactive={true}
            >
              {arcGeoJSON && (
                <Source id="arcs" type="geojson" data={arcGeoJSON as any}>
                  <Layer 
                    id="arc-line" 
                    type="line" 
                    paint={{
                      'line-color': ['case', ['boolean', ['get', 'isNewest'], false], '#4f46e5', '#94a3b8'],
                      'line-width': ['case', ['boolean', ['get', 'isNewest'], false], 4, 2],
                      'line-opacity': 0.6
                    }} 
                  />
                </Source>
              )}

              {particleGeoJSON && (
                <Source id="particles" type="geojson" data={particleGeoJSON as any}>
                  <Layer 
                    id="particle-point" 
                    type="circle" 
                    paint={{
                      'circle-radius': 4,
                      'circle-color': '#3b82f6',
                      'circle-stroke-width': 2,
                      'circle-stroke-color': '#ffffff',
                      'circle-pitch-alignment': 'map'
                    }} 
                  />
                </Source>
              )}

              {activeNodesData.map((n: any) => {
                const isHovered = hoveredNodeId === n.id;
                const isSelected = selectedNodeId === n.id;
                const activeStateClass = isHovered || isSelected ? 'scale-110' : '';
                return (
                  <Marker key={n.id} longitude={n.lon!} latitude={n.lat!} style={{ transition: 'all 0.2s ease', zIndex: isHovered ? 10 : 1 }}>
                    <div 
                      className={`pulse-marker-core ${n.id === entryAccount ? 'marker-danger' : 'marker-primary'} ${activeStateClass}`}
                      onMouseEnter={() => setHoveredNodeId(n.id)}
                      onMouseLeave={() => setHoveredNodeId(null)}
                    >
                      <div className="pulse-marker-ring" />
                      <div className="pulse-marker-ring-2" />
                    </div>
                    {(isHovered || isSelected) && (
                      <div className="mono" style={{ position: 'absolute', top: -30, left: '50%', transform: 'translateX(-50%)', background: 'white', padding: '4px 8px', borderRadius: '4px', boxShadow: 'var(--shadow-md)', whiteSpace: 'nowrap', zIndex: 20 }}>
                        {n.id}
                      </div>
                    )}
                  </Marker>
                );
              })}
            </Map>
          </div>
        
        {/* Network View Overlay */}
        <motion.div 
          initial={{ x: 450 }}
          animate={{ x: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 25 }}
          style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '450px', zIndex: 30, background: 'transparent', display: 'flex', flexDirection: 'column', pointerEvents: 'none' }}
        >
          <div style={{ flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'auto' }}>
            <AnimatePresence>
              {activeNodes.map((nodeId, index) => {
                const isVictim = index === 0;
                const isTarget = nodeId === entryAccount || index === activeNodes.length - 1;
                const nextNodeId = activeNodes[index + 1];
                const transferEdge = networkData?.edges.find(e => e.source === nodeId && e.target === nextNodeId);

                let cardColor = '#8b5cf6';
                let badgeText = `MULE LAYER #${index}`;
                let borderColor = '1.5px solid #c4b5fd';
                let glowColor = '0 0 15px rgba(139, 92, 246, 0.3)';

                if (isVictim) {
                  cardColor = '#2563eb';
                  badgeText = 'VICTIM / SOURCE OF FUNDS';
                  borderColor = '1.5px solid #60a5fa';
                  glowColor = '0 0 18px rgba(37, 99, 235, 0.35)';
                } else if (isTarget) {
                  cardColor = 'var(--danger-color)';
                  badgeText = 'TARGET MULE (CASH-OUT)';
                  borderColor = '2px solid var(--danger-color)';
                  glowColor = 'var(--danger-glow)';
                }

                return (
                  <Fragment key={nodeId}>
                    {/* The Node Card */}
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8, y: -20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      className="mono"
                      onMouseEnter={() => setHoveredNodeId(nodeId)}
                      onMouseLeave={() => setHoveredNodeId(null)}
                      style={{ 
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,255,255,0.85))',
                        backdropFilter: 'blur(16px)',
                        padding: '14px 22px', 
                        borderRadius: '16px', 
                        border: borderColor, 
                        boxShadow: isTarget ? glowColor : `${glowColor}, 0 12px 36px rgba(0,0,0,0.08)`,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px',
                        position: 'relative',
                        zIndex: 10,
                        width: '100%',
                        maxWidth: '280px',
                        cursor: 'pointer',
                        overflow: 'hidden'
                      }}
                    >
                      {/* Scanning laser effect */}
                      <motion.div
                        animate={{ top: ['-10%', '110%'] }}
                        transition={{ repeat: Infinity, duration: 2.5, ease: 'linear' }}
                        style={{ position: 'absolute', left: 0, right: 0, height: '2px', background: cardColor, opacity: 0.35, boxShadow: glowColor }}
                      />
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: cardColor, boxShadow: glowColor }} />
                        <span style={{ fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '1px', fontSize: '15px' }}>{nodeId}</span>
                      </div>
                      <div style={{ fontSize: '10px', color: cardColor, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {badgeText}
                      </div>
                      
                      {/* Background grid pattern */}
                      <div style={{ position: 'absolute', inset: 0, opacity: 0.05, backgroundImage: 'radial-gradient(var(--text-primary) 1px, transparent 1px)', backgroundSize: '12px 12px', pointerEvents: 'none' }} />
                    </motion.div>

                    {/* Connecting Line to next node */}
                    {index < activeNodes.length - 1 && (
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 52, opacity: 1 }}
                          transition={{ delay: 0.1, duration: 0.3 }}
                          style={{
                            width: '3px',
                            background: 'repeating-linear-gradient(to bottom, var(--primary-color) 0, var(--primary-color) 6px, transparent 6px, transparent 12px)',
                            position: 'relative',
                            zIndex: 1,
                            opacity: 0.6
                          }}
                        >
                          <motion.div
                            animate={{ top: ['0%', '100%'], opacity: [0, 1, 0] }}
                            transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                            style={{
                              position: 'absolute',
                              left: '-4px',
                              width: '11px',
                              height: '11px',
                              borderRadius: '50%',
                              backgroundColor: 'white',
                              border: '2px solid var(--primary-color)',
                              boxShadow: 'var(--primary-glow)'
                            }}
                          />
                        </motion.div>

                        {/* Transfer Amount Pill on Edge */}
                        {transferEdge && (
                          <div style={{
                            position: 'absolute',
                            left: '20px',
                            background: '#ffffff',
                            border: '1px solid #c7d2fe',
                            borderRadius: '6px',
                            padding: '2px 8px',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#4338ca',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                            whiteSpace: 'nowrap',
                            fontFamily: 'JetBrains Mono, monospace'
                          }}>
                            ₹{transferEdge.amount.toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      <div style={{ position: 'absolute', bottom: 32, left: 32, width: '400px', zIndex: 30, display: 'flex', flexDirection: 'column', gap: '24px', pointerEvents: 'none' }}>
        <div className="card" style={{ pointerEvents: 'auto' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase' }}>
            <Activity size={16} /> {t.trace_title}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '180px', overflowY: 'auto', paddingRight: '8px' }}>
            <AnimatePresence>
              {activeEdges.map((e, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                  style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px', padding: '8px', borderRadius: '6px', background: i === activeEdges.length - 1 ? 'var(--bg-hover)' : 'transparent' }}
                >
                  <div className="mono" style={{ flex: 1, display: 'flex', justifyContent: 'space-between', border: 'none', background: 'transparent' }}>
                    <span style={{ color: 'var(--text-primary)' }}>{e.source}</span>
                    <span style={{ color: 'var(--text-muted)' }}>→</span>
                    <span style={{ color: 'var(--text-primary)' }}>{e.target}</span>
                  </div>
                  <div className="mono" style={{ fontWeight: 700, color: 'var(--primary-color)', background: 'transparent', border: 'none' }}>
                    ₹{e.amount}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {status === 'TRACE_COMPLETE' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginTop: '8px', color: 'var(--success-color)', fontWeight: 600, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--success-color)', boxShadow: 'var(--success-glow)' }} />
                Network Reconstructed
              </motion.div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {(status === 'FEATURE_ANALYSIS' || status === 'XGBOOST_RUNNING' || status === 'PREDICTION_COMPLETE') && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 20 }}
              className="card"
              style={{ pointerEvents: 'auto', border: '1px solid var(--primary-color)', boxShadow: 'var(--primary-glow)' }}
            >
              <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary-color)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase' }}>
                <Cpu size={16} /> Intelligence Engine
              </h3>
              {status === 'FEATURE_ANALYSIS' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Extracting Risk Features...</div>
                  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="mono" style={{ background: 'transparent', border: 'none' }}>Mule Score Pattern...</motion.div>
                  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 }} className="mono" style={{ background: 'transparent', border: 'none' }}>Transaction Burst Risk...</motion.div>
                  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.0 }} className="mono" style={{ background: 'transparent', border: 'none' }}>Geographic Density...</motion.div>
                  <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.4 }} className="mono" style={{ background: 'transparent', border: 'none' }}>ATM Hub Risk...</motion.div>
                </div>
              )}
              {(status === 'XGBOOST_RUNNING' || status === 'PREDICTION_COMPLETE') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', justifyContent: 'center', height: '120px' }}>
                  {status === 'XGBOOST_RUNNING' ? (
                    <>
                      <div className="pulse-marker-core marker-primary"><div className="pulse-marker-ring" /></div>
                      <div className="mono" style={{ fontWeight: 600, color: 'var(--primary-color)', marginTop: '8px', background: 'transparent', border: 'none' }}>Running XGBoost Inference...</div>
                    </>
                  ) : (
                    <>
                      <ShieldAlert size={36} color="var(--danger-color)" style={{ filter: 'drop-shadow(var(--danger-glow))' }} />
                      <div style={{ fontWeight: 800, color: 'var(--danger-color)', fontSize: '18px', letterSpacing: '0.5px' }}>ANALYSIS COMPLETE</div>
                    </>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div style={{ position: 'absolute', top: 32, left: '50%', transform: 'translateX(-50%)', zIndex: 40, background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(16px)', padding: '12px 24px', borderRadius: '30px', boxShadow: 'var(--shadow-md)', fontWeight: 700, color: 'var(--primary-color)', display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid var(--border-color)', textTransform: 'uppercase', fontSize: '13px', letterSpacing: '1px' }}>
        <Network size={18} />
        {status === 'TRACING_INITIALIZING' && "SEARCHING TRANSACTION NETWORK..."}
        {status === 'ACCOUNT_DISCOVERY' && "DISCOVERING LINKED ACCOUNTS..."}
        {status === 'NETWORK_RECONSTRUCTION' && "RECONSTRUCTING MONEY FLOW..."}
        {status === 'TRACE_COMPLETE' && "NETWORK TRACE COMPLETE"}
        {status === 'FEATURE_ANALYSIS' && "EXTRACTING RISK FEATURES"}
        {(status === 'XGBOOST_RUNNING' || status === 'PREDICTION_COMPLETE') && "AI RISK INFERENCE"}
      </div>
    </div>
  );
};
