import React, { useEffect, useState } from 'react';

export default function AtomLoader({ message = "QUANT MATRIX IS LOADING...", progress = null }) {
  const [displayProgress, setDisplayProgress] = useState(
    typeof progress === 'number' ? progress : 0
  );

  useEffect(() => {
    if (typeof progress !== 'number') return;
    setDisplayProgress(prev => {
      if (progress > prev) return progress;
      return prev;
    });
  }, [progress]);

  const pct = typeof progress === 'number' ? Math.min(Math.max(displayProgress, 0), 100) : null;

  return (
    <div className="flex flex-col items-center w-full select-none" style={{ gap: 0 }}>
      <style>{`
        /* ── Nucleus ── */
        .oa-nucleus {
          position: absolute;
          inset: 0;
          margin: auto;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, #fff9c4 0%, #facc15 40%, #22c55e 100%);
          box-shadow:
            0 0 0 3px rgba(250,204,21,0.12),
            0 0 12px 4px rgba(250,204,21,0.5),
            0 0 28px 8px rgba(74,222,128,0.3);
          animation: oa-pulse 2s ease-in-out infinite;
          z-index: 4;
        }

        /* ── Orbits ── */
        .oa-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 1px solid transparent;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }

        .oa-ring-1 {
          border-color: rgba(250,204,21,0.25);
          box-shadow: inset 0 0 6px rgba(250,204,21,0.06);
          transform: rotateX(66deg) rotateY(30deg);
          animation: oa-spin-1 2.6s linear infinite;
        }
        .oa-ring-2 {
          border-color: rgba(74,222,128,0.2);
          box-shadow: inset 0 0 6px rgba(74,222,128,0.05);
          transform: rotateX(66deg) rotateY(-30deg);
          animation: oa-spin-2 3.4s linear infinite;
        }
        .oa-ring-3 {
          border-color: rgba(134,239,172,0.15);
          transform: rotateX(78deg) rotateY(0deg);
          animation: oa-spin-3 2s linear infinite;
        }

        /* ── Electrons ── */
        .oa-electron {
          position: absolute;
          top: -4px;
          left: 50%;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          transform: translateX(-50%);
        }
        .oa-ring-1 .oa-electron {
          background: #facc15;
          box-shadow: 0 0 6px 2px rgba(250,204,21,1), 0 0 14px 4px rgba(250,204,21,0.4);
        }
        .oa-ring-2 .oa-electron {
          background: #4ade80;
          box-shadow: 0 0 6px 2px rgba(74,222,128,1), 0 0 14px 4px rgba(74,222,128,0.4);
        }
        .oa-ring-3 .oa-electron {
          width: 5px; height: 5px;
          background: #86efac;
          box-shadow: 0 0 5px 2px rgba(134,239,172,0.9), 0 0 12px 3px rgba(134,239,172,0.3);
        }

        /* ── Glow halo behind atom ── */
        .oa-halo {
          position: absolute;
          inset: -18px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(74,222,128,0.07) 0%, transparent 70%);
          animation: oa-halo-pulse 3s ease-in-out infinite alternate;
          pointer-events: none;
        }

        @keyframes oa-spin-1 {
          to { transform: rotateX(66deg) rotateY(30deg) rotateZ(360deg); }
        }
        @keyframes oa-spin-2 {
          to { transform: rotateX(66deg) rotateY(-30deg) rotateZ(360deg); }
        }
        @keyframes oa-spin-3 {
          to { transform: rotateX(78deg) rotateY(0deg) rotateZ(360deg); }
        }
        @keyframes oa-pulse {
          0%, 100% { transform: scale(0.88); opacity: 0.8; }
          50% { transform: scale(1.18); opacity: 1;
            box-shadow:
              0 0 0 4px rgba(250,204,21,0.15),
              0 0 18px 6px rgba(250,204,21,0.55),
              0 0 36px 12px rgba(74,222,128,0.35);
          }
        }
        @keyframes oa-halo-pulse {
          from { opacity: 0.5; transform: scale(0.95); }
          to   { opacity: 1;   transform: scale(1.05); }
        }

        /* ── Message gradient text ── */
        .oa-label {
          background: linear-gradient(90deg, #facc15 0%, #4ade80 50%, #facc15 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: oa-label-move 3s linear infinite;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          text-align: center;
          line-height: 1.4;
        }
        @keyframes oa-label-move {
          from { background-position: 0% center; }
          to   { background-position: 200% center; }
        }

        /* ── Progress track ── */
        .oa-track {
          width: 100%;
          max-width: 200px;
          height: 3px;
          border-radius: 99px;
          background: rgba(255,255,255,0.06);
          overflow: hidden;
          position: relative;
        }
        .oa-fill {
          height: 100%;
          border-radius: 99px;
          background: linear-gradient(90deg, #facc15, #4ade80);
          transition: width 0.6s cubic-bezier(0.4,0,0.2,1);
          position: relative;
        }
        /* shimmer trên fill */
        .oa-fill::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%);
          background-size: 200% 100%;
          animation: oa-shimmer 1.4s linear infinite;
        }
        /* indeterminate shimmer khi không có số */
        .oa-track-indet .oa-fill {
          width: 42% !important;
          animation: oa-indet 1.8s ease-in-out infinite;
        }
        @keyframes oa-shimmer {
          from { background-position: 200% 0; }
          to   { background-position: -200% 0; }
        }
        @keyframes oa-indet {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(340%); }
        }

        /* ── Pct number ── */
        .oa-pct {
          font-size: 9px;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.05em;
          color: rgba(250,204,21,0.6);
          text-align: right;
          width: 100%;
          max-width: 200px;
          margin-top: 3px;
          transition: color 0.3s;
        }
      `}</style>

      {/* ── Atom spinner ── */}
      <div style={{ position: 'relative', width: 80, height: 80, perspective: '700px', marginBottom: 20 }}>
        <div className="oa-halo" />
        <div className="oa-ring oa-ring-1"><div className="oa-electron" /></div>
        <div className="oa-ring oa-ring-2"><div className="oa-electron" /></div>
        <div className="oa-ring oa-ring-3"><div className="oa-electron" /></div>
        <div className="oa-nucleus" />
      </div>

      {/* ── Message ── */}
      {message && (
        <p className="oa-label" style={{ marginBottom: 14, maxWidth: 240 }}>
          {message}
        </p>
      )}

      {/* ── Progress ── */}
      <div className={`oa-track ${pct === null ? 'oa-track-indet' : ''}`}>
        <div
          className="oa-fill"
          style={{ width: pct !== null ? `${pct}%` : '42%' }}
        />
      </div>
      {pct !== null && (
        <span className="oa-pct">{pct}%</span>
      )}
    </div>
  );
}