import { useRef, useState, useEffect } from 'react';
import { TerminalSquare } from 'lucide-react';

export default function DraggableLog({ isDark, logs, onClose }) {
    const logRef = useRef(null);
    const [position, setPosition] = useState({
        x: window.innerWidth - 420,
        y: window.innerHeight - 700
    });

    const isDragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    const handleMouseDown = (e) => {
        if (e.target.closest('button')) return;
        isDragging.current = true;
        dragOffset.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y
        };
        };
    useEffect(() => {
        const handleMouseMove = (e) => {
        if (!isDragging.current) return;
        setPosition({
            x: e.clientX - dragOffset.current.x,
            y: e.clientY - dragOffset.current.y
        });
        };

        const handleMouseUp = () => {
        isDragging.current = false;
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        };
        }, [position]);

        return (
            <div
            ref={logRef}
            className={`fixed w-96 max-h-[75vh] overflow-hidden rounded-3xl border shadow-2xl backdrop-blur-2xl select-none z-[999999]
            ${isDark ? 'bg-[#0A0E14] border-white/10' : 'bg-white border-slate-300'}`}
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`
            }}
            >
            <div
                className={`px-5 py-3 border-b flex items-center justify-between font-black text-sm cursor-move
                ${isDark ? 'border-white/10 bg-[#11171f]' : 'border-slate-200 bg-slate-50'}`}
                onMouseDown={handleMouseDown}
            >
            <div className="flex items-center gap-2">
            <TerminalSquare size={16} className="text-yellow-500" />
            SYSTEM LOG
            </div>
            <button
            onClick={onClose}
            className="text-slate-400 hover:text-red-500 text-xl leading-none hover:scale-110 transition-all"
            >
            ✕
            </button>
        </div>

        <div className={`p-4 font-mono text-xs leading-relaxed overflow-y-auto max-h-[58vh] custom-scroll
        ${isDark ? 'text-emerald-300/90' : 'text-slate-700'}`}>
            {logs.length === 0 ? (
            <p className="text-slate-500 italic">Chưa có hoạt động nào...</p>
            ) : (
            logs.map((log, i) => (
                <div
                key={i}
                className="py-1 border-b border-white/5 last:border-0 break-words"
                >
                {log}
                </div>
            ))
            )}
        </div>
        <div className="px-4 py-2.5 text-[10px] text-center text-slate-500 border-t border-white/10">
            Kéo tiêu đề để di chuyển • ESC để đóng
        </div>
        </div>
        );
    }