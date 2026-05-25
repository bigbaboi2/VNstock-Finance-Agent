import React from 'react';

export default function AtomLoader({ message = "QUANT MATRIX IS LOADING..." }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 w-full h-full min-h-[200px]">
      {/* KHỐI STYLE EFFECT */}
      <style>
        {`
          .quantum-spinner {
            position: relative;
            width: 80px;
            height: 80px;
            display: flex;
            align-items: center;
            justify-content: center;
            perspective: 800px;
          }
          
          /* Hạt nhân bốc cháy */
          .nucleus {
            width: 14px;
            height: 14px;
            background: radial-gradient(circle, #fb923c 20%, #ea580c 80%);
            border-radius: 50%;
            box-shadow: 0 0 20px 5px rgba(249,115,22,0.6);
            z-index: 10;
            animation: pulse-nucleus 1.5s ease-in-out infinite alternate;
          }

          /* Vòng quỹ đạo Elip */
          .orbit {
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            border: 1px solid rgba(249, 115, 22, 0.15); /* Viền mờ */
            transform-style: preserve-3d;
          }

          /* 3 Quỹ đạo nghiêng theo 3 góc khác nhau trong không gian 3D */
          .orbit:nth-child(2) { transform: rotateX(65deg) rotateY(45deg); animation: spin-orbit1 2s linear infinite; }
          .orbit:nth-child(3) { transform: rotateX(65deg) rotateY(-45deg); animation: spin-orbit2 2.5s linear infinite; }
          .orbit:nth-child(4) { transform: rotateX(75deg) rotateY(0deg); animation: spin-orbit3 1.8s linear infinite; }

          /* Hạt Electron chạy trên viền */
          .electron {
            position: absolute;
            top: -3px; /* Bám sát lên đỉnh của vòng tròn */
            left: 50%;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            transform: translateX(-50%);
          }

          /* Màu electron theo vibe */
          .orbit:nth-child(2) .electron { background-color: #fb923c; box-shadow: 0 0 10px 2px rgba(251,146,60,0.8); }
          .orbit:nth-child(3) .electron { background-color: #facc15; box-shadow: 0 0 10px 2px rgba(250,204,21,0.8); }
          .orbit:nth-child(4) .electron { background-color: #f87171; box-shadow: 0 0 10px 2px rgba(248,113,113,0.8); }

          /* Keyframes xoay quanh trục Z sau khi đã nghiêng X, Y (Tạo cảm giác elip 3D) */
          @keyframes spin-orbit1 { 0% { transform: rotateX(65deg) rotateY(45deg) rotateZ(0deg); } 100% { transform: rotateX(65deg) rotateY(45deg) rotateZ(360deg); } }
          @keyframes spin-orbit2 { 0% { transform: rotateX(65deg) rotateY(-45deg) rotateZ(0deg); } 100% { transform: rotateX(65deg) rotateY(-45deg) rotateZ(360deg); } }
          @keyframes spin-orbit3 { 0% { transform: rotateX(75deg) rotateY(0deg) rotateZ(0deg); } 100% { transform: rotateX(75deg) rotateY(0deg) rotateZ(360deg); } }
          
          /* Keyframe nhịp đập hạt nhân */
          @keyframes pulse-nucleus { 0% { transform: scale(0.9); opacity: 0.8; } 100% { transform: scale(1.2); opacity: 1; box-shadow: 0 0 25px 8px rgba(249,115,22,0.8); } }
        `}
      </style>

      {/* RENDER MÔ HÌNH NGUYÊN TỬ */}
      <div className="quantum-spinner mb-6">
        <div className="nucleus"></div>
        <div className="orbit"><div className="electron"></div></div>
        <div className="orbit"><div className="electron"></div></div>
        <div className="orbit"><div className="electron"></div></div>
      </div>

      {/* DÒNG CHỮ TRẠNG THÁI */}
      {message && (
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-500/80 animate-pulse text-center">
          {message}
        </p>
      )}
    </div>
  );
}