"use client";

import React, { useState, useEffect, useRef } from "react";
import { Network, RefreshCw, Layers, ShieldCheck, Tag, Info } from "lucide-react";

interface Node {
  id: string;
  name: string;
  type: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface Link {
  id: string;
  source: string;
  target: string;
  relationship: string;
  confidence: number;
}

export default function KnowledgeGraphPage() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const canvasRef = useRef<SVGSVGElement>(null);
  const [simulatedNodes, setSimulatedNodes] = useState<Node[]>([]);

  useEffect(() => {
    loadGraph();
  }, []);

  const loadGraph = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/graph");
      if (res.ok) {
        const data = await res.json();
        const rawNodes: Node[] = data.nodes || [];
        const rawLinks: Link[] = data.links || [];

        // Initialize node positions in a circular formation
        const width = 800;
        const height = 500;
        const radius = Math.min(width, height) * 0.35;
        const center = { x: width / 2, y: height / 2 };

        const positioned = rawNodes.map((n, idx) => {
          const angle = (idx / (rawNodes.length || 1)) * 2 * Math.PI;
          return {
            ...n,
            x: center.x + radius * Math.cos(angle) + (Math.random() - 0.5) * 40,
            y: center.y + radius * Math.sin(angle) + (Math.random() - 0.5) * 40,
            vx: 0,
            vy: 0,
          };
        });

        setNodes(positioned);
        setLinks(rawLinks);
        runSimulation(positioned, rawLinks);
      }
    } catch (e) {
      console.error("Failed to load graph data:", e);
    } finally {
      setLoading(false);
    }
  };

  // Simple, stable spring-force simulation loop
  const runSimulation = (nodeList: Node[], linkList: Link[]) => {
    const iterations = 80;
    const current = nodeList.map((n) => ({ ...n }));
    const nodeMap = new Map(current.map((n) => [n.id, n]));

    for (let iter = 0; iter < iterations; iter++) {
      // 1. Repulsion between all pairs
      for (let i = 0; i < current.length; i++) {
        for (let j = i + 1; j < current.length; j++) {
          const n1 = current[i];
          const n2 = current[j];
          const dx = (n2.x || 0) - (n1.x || 0);
          const dy = (n2.y || 0) - (n1.y || 0);
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < 220) {
            const force = (220 - dist) / dist * 0.4;
            n1.x = (n1.x || 0) - dx * force * 0.2;
            n1.y = (n1.y || 0) - dy * force * 0.2;
            n2.x = (n2.x || 0) + dx * force * 0.2;
            n2.y = (n2.y || 0) + dy * force * 0.2;
          }
        }
      }

      // 2. Attraction along links
      for (const link of linkList) {
        const source = nodeMap.get(link.source);
        const target = nodeMap.get(link.target);
        if (source && target) {
          const dx = (target.x || 0) - (source.x || 0);
          const dy = (target.y || 0) - (source.y || 0);
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (dist - 140) * 0.03;
          source.x = (source.x || 0) + (dx / dist) * force;
          source.y = (source.y || 0) + (dy / dist) * force;
          target.x = (target.x || 0) - (dx / dist) * force;
          target.y = (target.y || 0) - (dy / dist) * force;
        }
      }
    }

    setSimulatedNodes(current);
  };

  const nodePositionMap = new Map(simulatedNodes.map((n) => [n.id, n]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-rule pb-4">
        <div>
          <h1 className="font-serif text-3xl text-ink font-normal">
            Knowledge Graph Visualizer
          </h1>
          <p className="text-sm text-ink/70 font-sans mt-0.5">
            PostgreSQL property graph of cross-document entities and relationships extracted by Llama 3.1 8B.
          </p>
        </div>

        <button
          onClick={loadGraph}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono border border-rule rounded bg-paper-dim hover:bg-paper transition-colors text-ink"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Graph</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Interactive SVG Canvas */}
        <div className="lg:col-span-8 bg-paper-dim border border-rule rounded-lg p-4 shadow-2xs overflow-hidden">
          {loading ? (
            <div className="h-[520px] flex items-center justify-center font-mono text-xs text-ink/60">
              Generating knowledge graph layout...
            </div>
          ) : simulatedNodes.length === 0 ? (
            <div className="h-[520px] flex flex-col items-center justify-center font-mono text-xs text-ink/50 space-y-2">
              <Network className="w-8 h-8 text-ink/30" />
              <span>No graph entities extracted yet. Seed or upload docs to view relationships.</span>
            </div>
          ) : (
            <svg
              ref={canvasRef}
              viewBox="0 0 800 520"
              className="w-full h-[520px] select-none"
            >
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="22"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#A8402F" />
                </marker>
              </defs>

              {/* Edge Lines */}
              {links.map((l) => {
                const s = nodePositionMap.get(l.source);
                const t = nodePositionMap.get(l.target);
                if (!s || !t) return null;

                const midX = ((s.x || 0) + (t.x || 0)) / 2;
                const midY = ((s.y || 0) + (t.y || 0)) / 2;

                return (
                  <g key={l.id}>
                    <line
                      x1={s.x}
                      y1={s.y}
                      x2={t.x}
                      y2={t.y}
                      stroke="#A8402F"
                      strokeWidth="1.5"
                      strokeOpacity="0.45"
                      markerEnd="url(#arrow)"
                    />
                    <text
                      x={midX}
                      y={midY - 4}
                      fill="#1C1B19"
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="middle"
                      className="bg-paper"
                    >
                      {l.relationship}
                    </text>
                  </g>
                );
              })}

              {/* Nodes */}
              {simulatedNodes.map((n) => {
                const isSelected = selectedNode?.id === n.id;
                const isRegulation = n.type === "regulation" || n.type === "policy";

                return (
                  <g
                    key={n.id}
                    transform={`translate(${n.x}, ${n.y})`}
                    onClick={() => setSelectedNode(n)}
                    className="cursor-pointer group"
                  >
                    <circle
                      r={isSelected ? 16 : 12}
                      fill={isRegulation ? "#FAF8F4" : "#F0ECE3"}
                      stroke={isSelected ? "#A8402F" : "#1C1B19"}
                      strokeWidth={isSelected ? 3 : 1.5}
                      className="transition-all"
                    />
                    <text
                      y={22}
                      textAnchor="middle"
                      fontSize="10"
                      fontFamily="sans-serif"
                      fontWeight={isSelected ? "bold" : "normal"}
                      fill="#1C1B19"
                    >
                      {n.name}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* Selected Entity Inspector Panel */}
        <div className="lg:col-span-4 bg-paper border border-rule rounded-lg p-5 space-y-4 shadow-2xs font-mono text-xs">
          <div className="flex items-center justify-between border-b border-rule pb-3">
            <span className="font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-index-red" />
              Entity Inspector
            </span>
            {selectedNode && (
              <button
                onClick={() => setSelectedNode(null)}
                className="text-ink/40 hover:text-ink text-[11px]"
              >
                Clear
              </button>
            )}
          </div>

          {selectedNode ? (
            <div className="space-y-3">
              <div>
                <span className="text-ink/50 text-[11px] block">Concept / Entity:</span>
                <span className="text-sm font-bold text-ink block mt-0.5">
                  {selectedNode.name}
                </span>
              </div>

              <div>
                <span className="text-ink/50 text-[11px] block">Type:</span>
                <span className="inline-block bg-paper-dim border border-rule px-2 py-0.5 rounded text-[11px] uppercase text-ink/80 mt-0.5">
                  {selectedNode.type}
                </span>
              </div>

              {/* Connected Relationships */}
              <div className="pt-2 border-t border-rule space-y-2">
                <span className="text-ink/50 text-[11px] block font-semibold">
                  Connected Relationships:
                </span>
                {links
                  .filter(
                    (l) => l.source === selectedNode.id || l.target === selectedNode.id
                  )
                  .map((rel) => {
                    const otherNodeId =
                      rel.source === selectedNode.id ? rel.target : rel.source;
                    const otherNode = simulatedNodes.find((n) => n.id === otherNodeId);

                    return (
                      <div
                        key={rel.id}
                        className="p-2.5 bg-paper-dim border border-rule rounded space-y-1 text-[11px]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-index-red font-semibold">
                            {rel.relationship}
                          </span>
                          <span className="text-ink/40">
                            {(rel.confidence * 100).toFixed(0)}% conf
                          </span>
                        </div>
                        <div className="text-ink font-sans text-xs">
                          {otherNode?.name || "Connected Entity"}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-ink/50 italic text-[11px]">
              Click any node in the graph to inspect its properties and multi-hop relationship links.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
