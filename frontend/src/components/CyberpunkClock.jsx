import React, { useEffect, useState } from 'react'

export default function CyberpunkClock({ marketOpen, theme }) {
  const isDark = theme === 'dark';
  
  const [h, setH] = useState('00')
  const [m, setM] = useState('00')
  const [s, setS] = useState('00')
  const [ms, setMs] = useState('000')
  const [burst, setBurst] = useState(false)

  useEffect(() => {
    const updateClock = () => {
      const now = new Date()
      setH(String(now.getHours()).padStart(2, '0'))
      setM(String(now.getMinutes()).padStart(2, '0'))
      setS(String(now.getSeconds()).padStart(2, '0'))
      setMs(String(Math.floor(now.getMilliseconds())).padStart(3, '0'))
    }
    updateClock()
    const interval = setInterval(updateClock, 40)
    return () => clearInterval(interval)
  }, [])

  const handleBurst = () => {
    setBurst(true)
    setTimeout(() => setBurst(false), 700)
  }

  // Logic màu sắc đồng bộ 100%
  const themeBase = marketOpen ? '16, 185, 129' : '239, 68, 68';
  const themeColor = `rgba(${themeBase}`;
  
  const textColor = marketOpen 
    ? (isDark ? 'text-emerald-400' : 'text-emerald-600') 
    : (isDark ? 'text-red-400' : 'text-red-600');

  const faceBg = isDark ? '#030610' : 'rgba(255, 255, 255, 0.7)';

  // Component Ăng-ten đã được fix lỗi đồng bộ màu
  const Antenna = ({ left, right, height, rotate }) => (
    <div 
      className={`absolute top-0 w-[8px] border-2 origin-bottom transition-all duration-500 z-0
        ${marketOpen 
          ? (isDark ? 'bg-emerald-900 border-emerald-500/50' : 'bg-emerald-100 border-emerald-400') 
          : (isDark ? 'bg-red-900 border-red-500/50' : 'bg-red-100 border-red-400')}`}
      style={{ 
        left, right, 
        height, 
        transform: `translateY(-100%) rotateZ(${rotate}deg)`,
        boxShadow: isDark ? `0 0 15px ${themeColor}, 0.3)` : 'none'
      }}
    >
      {/* Đèn tín hiệu trên chóp */}
      <div className={`absolute -top-4 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full animate-pulse shadow-lg
        ${marketOpen ? 'bg-emerald-500' : 'bg-red-500'}`} 
      />
    </div>
  )

  const Rivet = ({ top, bottom, left, right }) => (
    <div className={`absolute w-2.5 h-2.5 rounded-full border-[1.5px] z-20 transition-all duration-500
      ${marketOpen 
        ? (isDark ? 'border-emerald-500/50 bg-emerald-900/80 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'border-emerald-600/50 bg-emerald-100') 
        : (isDark ? 'border-red-500/50 bg-red-900/80 shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'border-red-600/50 bg-red-100')}`} 
      style={{ top, bottom, left, right }}>
      <div className={`w-full h-[1px] absolute top-1/2 -translate-y-1/2 rotate-45 ${isDark ? 'bg-white/30' : 'bg-black/20'}`}></div>
    </div>
  )

  return (
    <>
      <style>{`
        @font-face { font-family: 'Technology'; src: url('/fonts/Technology.ttf') format('truetype'); }
        .clock-scene { perspective: 1400px; }
        .clock-cube {
          width: 480px; height: 270px; position: relative; transform-style: preserve-3d;
          transform: rotateX(-12deg) rotateY(20deg); transition: transform 0.6s ease;
        }
        .clock-face {
          position: absolute; border-radius: 20px; border: 2.5px solid ${themeColor}, ${isDark ? '0.8' : '0.5'});
          background: ${faceBg};
          backdrop-filter: blur(${isDark ? '0px' : '10px'});
          box-shadow: 0 0 ${isDark ? '30px' : '10px'} ${themeColor}, 0.2), inset 0 0 20px ${themeColor}, 0.1);
          overflow: hidden;
          transition: all 0.5s ease-in-out;
        }
        .c-front, .c-back { width: 480px; height: 270px; left: 0; top: 0; }
        .c-right, .c-left { width: 180px; height: 270px; left: 150px; top: 0; }
        .c-top, .c-bottom { width: 480px; height: 180px; left: 0; top: 45px; }
        .c-front { transform: translateZ(90px); }
        .c-back  { transform: rotateY(180deg) translateZ(90px); }
        .c-right { transform: rotateY(90deg) translateZ(240px); }
        .c-left  { transform: rotateY(-90deg) translateZ(240px); }
        .c-top   { transform: rotateX(90deg) translateZ(135px); overflow: visible; }
        .c-bottom{ transform: rotateX(-90deg) translateZ(135px); box-shadow: 0 0 80px 40px ${themeColor}, ${isDark ? '0.4' : '0.15'}); }
        
        @keyframes c-scan { 0% { top: -10%; } 100% { top: 110%; } }
        .c-scanline { 
          position: absolute; width: 100%; height: 15px; 
          background: linear-gradient(to bottom, transparent, ${isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.05)'}, transparent); 
          filter: blur(4px); animation: c-scan 4s linear infinite; 
        }
        @keyframes c-smoke-anim { 0% { transform: scale(0.6); opacity: 1; } 100% { transform: scale(2); opacity: 0; } }
        .c-smoke { position: absolute; inset: -30px; background: ${themeColor}, 0.7); filter: blur(60px); border-radius: 50%; animation: c-smoke-anim 0.8s ease-out forwards; pointer-events: none; }
      `}</style>

      <div className="relative w-[135px] h-[85px] flex items-center justify-center scale-[0.26] origin-center">
        <div className="clock-scene">
          <div className="clock-cube" onClick={handleBurst}>
            
            {/* ĂNG-TEN ĐÃ ĐƯỢC FIX LỖI ĐỒNG BỘ */}
            <Antenna left="70px" height="100px" rotate={-12} />
            <Antenna right="70px" height="150px" rotate={15} />
            
            <div className="clock-face c-back"></div>
            <div className="clock-face c-bottom"></div>
            <div className="clock-face c-left"></div>
            <div className="clock-face c-right"></div>
            <div className="clock-face c-top"></div>

            <div className="clock-face c-front cursor-pointer flex flex-col items-center justify-center">
              <Rivet top="18px" left="18px" /><Rivet top="18px" right="18px" /><Rivet bottom="18px" left="18px" /><Rivet bottom="18px" right="18px" />
              {burst && <div className="c-smoke" />}
              <div className="c-scanline" />

              <div className="relative z-10 flex flex-col items-center justify-center w-full h-full p-6">
                <div className={`relative flex flex-col items-center justify-center w-full h-full border-[4px] rounded-[24px] transition-all duration-500
                  ${marketOpen 
                    ? (isDark ? 'bg-[#041611] border-emerald-900/60 shadow-[inset_0_0_40px_rgba(0,0,0,0.9)]' : 'bg-white/90 border-emerald-200 shadow-[inset_0_0_20px_rgba(0,0,0,0.05)]') 
                    : (isDark ? 'bg-[#1a0707] border-red-900/60 shadow-[inset_0_0_40px_rgba(0,0,0,0.9)]' : 'bg-white/90 border-red-200 shadow-[inset_0_0_20px_rgba(0,0,0,0.05)]')}`}>
                   
                   <div className={`relative z-10 flex flex-col items-center`}>
                      <div className={`text-[95px] leading-none whitespace-nowrap font-black ${textColor} transition-colors duration-500`} 
                           style={{ fontFamily: 'Technology', letterSpacing: '10px', textShadow: isDark ? `0 0 25px ${themeColor}, 1)` : 'none' }}>
                        {h}<span className="animate-pulse mx-1">:</span>{m}<span className="animate-pulse opacity-70 mx-1">:</span>{s}
                      </div>
                      
                      {/* MS: ĐÃ ĐƯỢC ĐẨY CỠ CHỮ TO HƠN (text-4xl) */}
                      <div className={`text-4xl mt-6 font-bold opacity-80 tracking-[18px] ${textColor}`} style={{ fontFamily: 'Technology' }}>
                        .{ms} MS
                      </div>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}