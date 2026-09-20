import { useEffect } from 'react';
import { 
  ReactFlow, 
  useNodesState, useEdgesState,
  Handle, Position, BaseEdge, getBezierPath, EdgeLabelRenderer
} from '@xyflow/react';
import { useTrace } from '../../contexts/TraceContext';
import { motion } from 'framer-motion';
import '@xyflow/react/dist/style.css';

// --- Extreme Custom Node ---
const AnimatedNode = ({ data }: any) => {
  const isVictim = data.isVictim;
  const isTarget = data.isTarget;
  
  let primaryColor = '#8b5cf6';
  let badgeText = data.hopNumber ? `MULE LAYER #${data.hopNumber}` : 'TRANSIT MULE';
  let borderColor = 'rgba(255, 255, 255, 0.8)';
  let shadow = '0 8px 32px rgba(0,0,0,0.05)';

  if (isVictim) {
    primaryColor = '#2563eb';
    badgeText = 'VICTIM / SOURCE OF FUNDS';
    borderColor = '#93c5fd';
    shadow = '0 0 20px rgba(37, 99, 235, 0.25)';
  } else if (isTarget) {
    primaryColor = 'var(--danger-color)';
    badgeText = 'TARGET MULE (CASH-OUT)';
    borderColor = 'var(--danger-color)';
    shadow = 'var(--danger-glow)';
  }

  return (
    <motion.div 
      animate={{ y: [0, -4, 0] }}
      transition={{ repeat: Infinity, duration: 3 + Math.random() * 2, ease: "easeInOut" }}
      style={{ position: 'relative' }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      
      {/* Sonar Pulse Rings for Cash-Out Target & Victim */}
      {(isTarget || isVictim) && (
        <>
          <motion.div
            animate={{ scale: [1, 2.3], opacity: [0.4, 0] }}
            transition={{ repeat: Infinity, duration: 2.5, ease: "easeOut" }}
            style={{
              position: 'absolute', top: -8, left: -8, right: -8, bottom: -8,
              borderRadius: '16px', border: `2px solid ${primaryColor}`, zIndex: 0,
              pointerEvents: 'none'
            }}
          />
          <motion.div
            animate={{ scale: [1, 2.3], opacity: [0.3, 0] }}
            transition={{ repeat: Infinity, duration: 2.5, ease: "easeOut", delay: 0.8 }}
            style={{
              position: 'absolute', top: -8, left: -8, right: -8, bottom: -8,
              borderRadius: '16px', border: `1px solid ${primaryColor}`, zIndex: 0,
              pointerEvents: 'none'
            }}
          />
        </>
      )}

      {/* Main Node Card */}
      <div className="mono" style={{ 
        background: 'rgba(255, 255, 255, 0.85)', 
        backdropFilter: 'blur(14px)',
        padding: '12px 22px', 
        borderRadius: '16px', 
        border: `1.5px solid ${borderColor}`, 
        boxShadow: shadow,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        position: 'relative',
        zIndex: 10,
        minWidth: '180px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: primaryColor }} />
          <span style={{ fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '1px', fontSize: '14px' }}>
            {data.label}
          </span>
        </div>
        <div style={{ 
          fontSize: '10px', 
          color: primaryColor, 
          fontWeight: 800, 
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          {badgeText}
        </div>
      </div>
      
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </motion.div>
  );
};

// --- Extreme Custom Edge (Particles along path) ---
const AnimatedParticleEdge = ({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data
}: any) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ stroke: 'var(--border-color)', strokeWidth: 2 }} />
      {/* Animated glowing stroke */}
      <BaseEdge 
        id={`${id}-glow`} 
        path={edgePath} 
        style={{ 
          stroke: 'var(--primary-color)', 
          strokeWidth: 3,
          strokeDasharray: '10 20',
          animation: 'dash 1s linear infinite'
        }} 
      />
      {/* Particle moving along the path */}
      <circle r="4" fill="var(--primary-color)" filter="drop-shadow(0 0 4px var(--primary-color))">
        <animateMotion dur="1.5s" repeatCount="indefinite" path={edgePath} />
      </circle>
      
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan"
        >
          <div className="mono" style={{
            background: 'rgba(255,255,255,0.95)',
            border: '1px solid var(--primary-color)',
            boxShadow: 'var(--primary-glow)',
            padding: '4px 8px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 700,
            color: 'var(--primary-color)'
          }}>
            ₹{data?.amount?.toLocaleString ? data.amount.toLocaleString() : data?.amount}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

const nodeTypes = { animated: AnimatedNode };
const edgeTypes = { particle: AnimatedParticleEdge };

export const AccountGraph = ({ activeNodes, activeEdges }: { activeNodes: string[], activeEdges: any[] }) => {
  const { networkData, entryAccount, setHoveredNodeId, selectedNodeId, setSelectedNodeId } = useTrace();
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);

  useEffect(() => {
    // Add CSS for edge dash animation
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes dash {
        to { stroke-dashoffset: -30; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  useEffect(() => {
    if (!networkData) return;

    // 1. Calculate in-degrees and outgoing adjacency
    const inDegree = new Map<string, number>();
    const outEdges = new Map<string, string[]>();
    
    networkData.nodes.forEach(n => {
      inDegree.set(n.id, 0);
      outEdges.set(n.id, []);
    });

    networkData.edges.forEach(e => {
      if (!outEdges.has(e.source)) outEdges.set(e.source, []);
      outEdges.get(e.source)!.push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    });

    // 2. Identify root sources (nodes with in-degree = 0, e.g. VICTIM_001)
    const roots = networkData.nodes.filter(n => inDegree.get(n.id) === 0);
    const depthMap = new Map<string, number>();

    // BFS from root sources down to the final cash-out mule
    const queue: { id: string; depth: number }[] = (roots.length > 0 ? roots : [networkData.nodes[0]]).map(r => ({ id: r.id, depth: 0 }));
    queue.forEach(item => depthMap.set(item.id, 0));

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      const neighbors = outEdges.get(id) || [];
      for (const nextId of neighbors) {
        const nextDepth = depth + 1;
        if (!depthMap.has(nextId) || nextDepth > depthMap.get(nextId)!) {
          depthMap.set(nextId, nextDepth);
          queue.push({ id: nextId, depth: nextDepth });
        }
      }
    }

    // Fallback for any unreached nodes
    networkData.nodes.forEach((n, idx) => {
      if (!depthMap.has(n.id)) depthMap.set(n.id, idx);
    });

    const depthCounts = new Map<number, number>();
    
    const flowNodes = networkData.nodes.filter(n => activeNodes.includes(n.id)).map(n => {
      const depth = depthMap.get(n.id) || 0;
      const currentCount = depthCounts.get(depth) || 0;
      depthCounts.set(depth, currentCount + 1);
      
      const isVictim = inDegree.get(n.id) === 0;
      const isTarget = n.id === entryAccount || (outEdges.get(n.id) || []).length === 0;
      const hopNumber = (isVictim || isTarget) ? undefined : depth;

      return {
        id: n.id,
        type: 'animated',
        position: { x: currentCount * 280, y: depth * 150 },
        data: { 
          label: n.id, 
          isVictim, 
          isTarget, 
          hopNumber 
        }
      };
    });

    const flowEdges = activeEdges.map((e, i) => ({
      id: `e-${e.source}-${e.target}-${i}`,
      source: e.source,
      target: e.target,
      type: 'particle',
      data: { amount: e.amount }
    }));

    setNodes(flowNodes);
    setEdges(flowEdges);

  }, [networkData, activeNodes, activeEdges, entryAccount]);

  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
        onNodeMouseLeave={() => setHoveredNodeId(null)}
        onNodeClick={(_, node) => setSelectedNodeId(node.id === selectedNodeId ? null : node.id)}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        nodesDraggable={false}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
      >
      </ReactFlow>
    </div>
  );
};
