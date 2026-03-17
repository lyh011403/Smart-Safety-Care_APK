import React, { useState, useEffect } from "react";
import { MonitorTab } from "./components/MonitorTab";
import { motion, AnimatePresence } from "motion/react";
import { HealthTab } from "./components/HealthTab";
import { CareTab, Task, INITIAL_TASKS, INITIAL_JOURNAL_ENTRIES, JournalEntry } from "./components/CareTab";
import { SettingsTab } from "./components/SettingsTab";
import { Mic, MicOff, Sparkles, BellRing, X as XIcon } from "lucide-react";

type Tab = "monitor" | "health" | "care" | "settings";

const NAV_ITEMS: { id: Tab; label: string; emoji: string }[] = [
  { id: "monitor", label: "監控", emoji: "🔍" },
  { id: "health", label: "健康", emoji: "❤️" },
  { id: "care", label: "照護", emoji: "🤝" },
  { id: "settings", label: "設置", emoji: "⚙️" },
];

const orbStyles = `
  @keyframes orb-ripple {
    0% { transform: scale(1); opacity: 0.8; }
    100% { transform: scale(2.2); opacity: 0; }
  }
  @keyframes orb-breathe {
    0%, 100% { transform: scale(1); filter: brightness(1) drop-shadow(0 0 5px rgba(255,255,255,0.4)); }
    50% { transform: scale(1.1); filter: brightness(1.3) drop-shadow(0 0 15px rgba(255,255,255,0.8)); }
  }
  .ripple-layer {
    position: absolute;
    inset: 0;
    border-radius: 9999px;
    border: 2px solid rgba(6, 182, 212, 0.5);
    animation: orb-ripple 2s linear infinite;
    pointer-events: none;
  }
  .ripple-layer:nth-child(2) { animation-delay: 0.6s; border-color: rgba(59, 130, 246, 0.4); }
  .ripple-layer:nth-child(3) { animation-delay: 1.2s; border-color: rgba(167, 139, 250, 0.3); }
`;

export default function App() {
  return (
    <>
      <style>{orbStyles}</style>
      <AppContent />
    </>
  );
}

function HeadsUpNotification({
  score,
  onClose,
  onSeeDetails
}: {
  score: number;
  onClose: () => void;
  onSeeDetails: () => void
}) {
  return (
    <motion.div
      initial={{ y: -100, opacity: 0, scale: 0.9 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: -100, opacity: 0, scale: 0.9 }}
      className="absolute top-5 left-4 right-4 z-[9999] p-3 rounded-2xl flex items-center gap-3 cursor-pointer"
      style={{
        background: "rgba(255, 255, 255, 0.85)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 15px 35px rgba(244, 63, 94, 0.2), inset 0 0 0 1px rgba(255, 255, 255, 0.5)",
        border: "1.5px solid rgba(244, 63, 94, 0.3)",
      }}
      onClick={onSeeDetails}
    >
      <div className="w-10 h-10 rounded-xl bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30 animate-pulse">
        <BellRing size={20} className="text-white" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-red-600 font-black text-xs">SECURITY ALERT</span>
          <span className="text-gray-400 text-[10px] font-bold">NOW</span>
        </div>
        <p className="text-gray-800 font-extrabold text-[13px] leading-tight">感應到異常威脅！ (風險: {score}%)</p>
        <p className="text-gray-500 text-[10px] font-semibold">點擊立即查看照護分頁截圖檔案</p>
      </div>
      <button
        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        <XIcon size={16} className="text-gray-400" />
      </button>
    </motion.div>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<Tab>("monitor");
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('smart_care_tasks');
    return saved ? JSON.parse(saved) : INITIAL_TASKS;
  });
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(() => {
    const saved = localStorage.getItem('smart_care_journal_entries');
    return saved ? JSON.parse(saved) : INITIAL_JOURNAL_ENTRIES;
  });

  // Persist Data
  useEffect(() => {
    localStorage.setItem('smart_care_tasks', JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem('smart_care_journal_entries', JSON.stringify(journalEntries));
  }, [journalEntries]);

  // --- Voice Assistant State & Logic ---
  const [voicePosition, setVoicePosition] = useState({ x: 300, y: 450 });
  const [isVoiceCollapsed, setIsVoiceCollapsed] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);

  // --- Global Risk Monitoring ---
  const [riskAlert, setRiskAlert] = useState<{ active: boolean; score: number }>({ active: false, score: 0 });
  const [backendUrl] = useState(() => {
    const saved = localStorage.getItem('smart_care_backend_url') || 'http://127.0.0.1:8080';
    return saved.endsWith('/') ? saved.slice(0, -1) : saved;
  });

  useEffect(() => {
    const checkGlobalRisk = async () => {
      try {
        const res = await fetch(`${backendUrl}/risk_data?t=${Date.now()}`);
        const data = await res.json();
        if (data && data.score >= 90) {
          setRiskAlert({ active: true, score: data.score });
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
      } catch (e) { }
    };

    const interval = setInterval(checkGlobalRisk, 2000);
    return () => clearInterval(interval);
  }, [backendUrl]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.lang = 'zh-TW';
      rec.continuous = false;
      rec.interimResults = false;
      rec.onstart = () => setIsListening(true);
      rec.onend = () => setIsListening(false);
      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const newEntry: JournalEntry = {
          id: Date.now(),
          time: timeStr,
          type: "🎤 語音紀錄",
          category: "activity",
          message: transcript,
          description: `此紀錄由語音助理於 ${timeStr} 自動辨識生成。`,
          color: "#06b6d4"
        };
        setJournalEntries(prev => [newEntry, ...prev]);
        setActiveTab("care");
      };
      setRecognition(rec);
    }
  }, []);

  const toggleListening = () => {
    if (!recognition) return;
    if (isListening) {
      recognition.stop();
    } else {
      try { recognition.start(); } catch (e) { }
    }
  };

  useEffect(() => {
    let timer: any;
    if (!isVoiceCollapsed && !isListening) {
      timer = setTimeout(() => setIsVoiceCollapsed(true), 5000);
    }
    return () => clearTimeout(timer);
  }, [isVoiceCollapsed, isListening]);

  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };
  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    const currentIndex = NAV_ITEMS.findIndex(item => item.id === activeTab);
    if (isLeftSwipe && currentIndex < NAV_ITEMS.length - 1) setActiveTab(NAV_ITEMS[currentIndex + 1].id);
    if (isRightSwipe && currentIndex > 0) setActiveTab(NAV_ITEMS[currentIndex - 1].id);
  };

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.haptic-btn') || target.closest('button')) {
        if (navigator.vibrate) navigator.vibrate(15);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-0 sm:p-4"
      style={{ background: isMobile ? "#f0f4f8" : "linear-gradient(135deg,#e8edf2 0%,#dde4ed 100%)" }}
    >
      <div
        className="relative flex flex-col overflow-hidden"
        style={{
          width: isMobile ? "100%" : 375,
          height: isMobile ? "100vh" : 812,
          borderRadius: isMobile ? 0 : 40,
          background: "rgba(240, 244, 248, 0.7)",
          backdropFilter: isMobile ? "none" : "blur(20px)",
          boxShadow: isMobile ? "none" : "20px 20px 60px #b8c4d4, -20px -20px 60px #ffffff, 0 0 0 1px rgba(255,255,255,0.8)",
          border: isMobile ? "none" : "1px solid rgba(255,255,255,0.4)"
        }}
      >
        <style>{`
          @keyframes shimmer {
            0% { transform: translateX(-150%) skewX(-25deg); opacity: 0; }
            50% { opacity: 1; }
            100% { transform: translateX(150%) skewX(-25deg); opacity: 0; }
          }
          .glass-panel {
            background: rgba(255, 255, 255, 0.4);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.5);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.05);
          }
          .shimmer-container { position: relative; overflow: hidden; }
          .shimmer-effect {
            position: absolute; top: 0; left: 0; width: 50%; height: 100%;
            background: linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0) 100%);
            transform: skewX(-25deg); pointer-events: none; z-index: 5; animation: shimmer 4s ease-in-out infinite;
          }
        `}</style>

        <div
          className="flex-1 relative overflow-hidden"
          style={{ zIndex: 10, paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <AnimatePresence>
            {riskAlert.active && (
              <HeadsUpNotification
                score={riskAlert.score}
                onClose={() => setRiskAlert({ ...riskAlert, active: false })}
                onSeeDetails={() => {
                  setRiskAlert({ ...riskAlert, active: false });
                  setActiveTab("care");
                }}
              />
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="w-full h-full overflow-y-auto"
              style={{ scrollbarWidth: "none" }}
            >
              {activeTab === "monitor" && (
                <MonitorTab isActive={activeTab === "monitor"} isMobile={isMobile} tasks={tasks} onUpdateTasks={setTasks} onTabChange={setActiveTab} />
              )}
              {activeTab === "health" && <HealthTab isActive={activeTab === "health"} isMobile={isMobile} />}
              {activeTab === "care" && (
                <CareTab isActive={activeTab === "care"} isMobile={isMobile} tasks={tasks} setTasks={setTasks} journalEntries={journalEntries} setJournalEntries={setJournalEntries} />
              )}
              {activeTab === "settings" && <SettingsTab isMobile={isMobile} />}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex-shrink-0 px-4 pb-5 pt-3 relative" style={{ background: "#F0F4F8", zIndex: 50 }}>
          <div style={{ height: 1, marginBottom: 10, background: "linear-gradient(90deg,transparent,#d1d9e688,transparent)" }} />
          <div className="flex rounded-2xl p-1" style={{ background: "#F0F4F8", boxShadow: "inset 5px 5px 10px #d1d9e6, inset -5px -5px 10px #ffffff" }}>
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button key={item.id} onClick={() => setActiveTab(item.id)} className="flex-1 flex flex-col items-center py-2.5 rounded-xl gap-1 relative transition-all duration-300 active:scale-95">
                  {isActive && (
                    <motion.div
                      layoutId="nav-glow" className="absolute inset-0 rounded-xl z-0"
                      style={{ background: "linear-gradient(135deg,#4facfe,#00c6fb)", boxShadow: "4px 4px 10px rgba(79,172,254,0.45), -2px -2px 8px rgba(255,255,255,0.7)" }}
                    />
                  )}
                  <motion.span animate={{ scale: isActive ? 1.1 : 1, y: isActive ? -2 : 0 }} className="z-10" style={{ fontSize: 18, filter: isActive ? "none" : "grayscale(0.5) opacity(0.6)" }}>
                    {item.emoji}
                  </motion.span>
                  <span className="z-10" style={{ fontSize: 10, fontWeight: 700, color: isActive ? "#ffffff" : "#9ba8b4" }}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex justify-center mt-3">
            <div className="rounded-full" style={{ width: 120, height: 4, background: "#c8d0dc" }} />
          </div>
        </div>

        <motion.div
          drag dragMomentum={false}
          onDragStart={() => setIsVoiceCollapsed(false)}
          onDragEnd={(e, info) => {
            const newX = info.point.x > 195 ? 320 : 10;
            setVoicePosition({ x: newX, y: voicePosition.y + info.offset.y });
          }}
          animate={{
            x: isVoiceCollapsed ? (voicePosition.x > 100 ? voicePosition.x + 40 : voicePosition.x - 40) : voicePosition.x,
            y: voicePosition.y,
            scale: isVoiceCollapsed ? 0.65 : (isListening ? 1.15 : 1),
            opacity: isVoiceCollapsed ? 0.5 : 1,
            rotate: isVoiceCollapsed ? (voicePosition.x > 100 ? 15 : -15) : 0
          }}
          className="fixed z-[9999] cursor-pointer" style={{ width: 62, height: 62, touchAction: "none" }}
        >
          <div
            onClick={() => { if (isVoiceCollapsed) setIsVoiceCollapsed(false); else toggleListening(); }}
            className="w-full h-full rounded-full flex items-center justify-center relative overflow-hidden active:scale-95"
            style={{ background: "linear-gradient(135deg, rgba(6, 182, 212, 0.4), rgba(59, 130, 246, 0.4))", backdropFilter: "blur(25px)", border: "1.2px solid rgba(255, 255, 255, 0.45)" }}
          >
            <AnimatePresence mode="wait">
              {isListening ? (
                <div key="mic-on" style={{ animation: "orb-breathe 1.5s ease-in-out infinite" }}><Sparkles size={30} className="text-white" /></div>
              ) : (
                <motion.div key="mic-off" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}><Mic size={28} className="text-white" /></motion.div>
              )}
            </AnimatePresence>
            {isListening && <><div className="ripple-layer" /><div className="ripple-layer" /><div className="ripple-layer" /></>}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
