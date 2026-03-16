import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import { Plus, Trash2, CheckSquare, Clock, BookOpen, X, ChevronRight, Search, Mic, Calendar, SearchCheck, Info, MessageSquare, Image as ImageIcon, ExternalLink, RefreshCw } from "lucide-react";

export type Category = "Medication" | "Nutrition" | "Exercise" | "Health" | "General";

export const CATEGORY_META: Record<Category, { label: string; emoji: string; color: string; bg: string }> = {
  Medication: { label: "服藥", emoji: "💊", color: "#f5516c", bg: "rgba(245,81,108,0.12)" },
  Nutrition: { label: "飲食", emoji: "🥗", color: "#00c48c", bg: "rgba(0,196,140,0.12)" },
  Exercise: { label: "運動", emoji: "🏃", color: "#4facfe", bg: "rgba(79,172,254,0.12)" },
  Health: { label: "檢查", emoji: "🩺", color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  General: { label: "一般", emoji: "📋", color: "#f9a825", bg: "rgba(249,168,37,0.12)" },
};

export interface Task {
  id: number;
  title: string;
  note: string;
  time: string;
  category: Category;
  done: boolean;
}

export interface JournalEntry {
  id: number;
  time: string;
  type: string;
  category: "alert" | "person" | "health" | "activity" | "system";
  message: string;
  description: string;
  color: string;
}

export const INITIAL_TASKS: Task[] = [
  { id: 1, title: "服用早晨藥物", note: "降血壓藥 × 1 顆", time: "08:00", category: "Medication", done: true },
  { id: 2, title: "量測血壓", note: "記錄數值回報醫師", time: "09:00", category: "Health", done: true },
  { id: 3, title: "午餐均衡飲食", note: "低鹽低糖原則", time: "12:00", category: "Nutrition", done: false },
  { id: 4, title: "散步 30 分鐘", note: "飯後緩步行走", time: "14:00", category: "Exercise", done: false },
  { id: 5, title: "服用晚間藥物", note: "助眠藥 × 1 顆", time: "21:00", category: "Medication", done: false },
];

export const INITIAL_JOURNAL_ENTRIES: JournalEntry[] = [
  { id: 1, time: "14:32", type: "⚠️ 危險警報", category: "alert", message: "偵測到疑似火源，已通知管理員", description: "客廳視角辨識出 45cm 寬之明火火焰，系統於 2 秒內立即觸發警報並推播至管理端。建議立即前往確認。", color: "#f5516c" },
  { id: 2, time: "12:08", type: "👤 人員偵測", category: "person", message: "陌生訪客進入玄關區域", description: "門口攝影機捕捉到陌生中年男性停留超過 30 秒，特徵：藍色上衣、黑色後背包。已啟動鎖定追蹤。", color: "#4facfe" },
  { id: 3, time: "09:45", type: "🏃 活動記錄", category: "activity", message: "長者完成早晨散步 25 分鐘", description: "庭院區域偵測到受照護者穩定行走，平均步速 1.2m/s。活動指標符合今日健康規範。", color: "#00c48c" },
  { id: 4, time: "08:03", type: "💊 用藥提醒", category: "health", message: "早晨藥物服用確認完成", description: "AI 辨識到患者於藥盒提取動作，並有飲水吞服行為，標記為「已按時服用」。", color: "#a78bfa" },
  { id: 5, time: "07:30", type: "🌅 系統啟動", category: "system", message: "SmartGuard 日間防護模式已開啟", description: "全屋 4 處監控點已同步上線，AI 視覺引擎加載完畢，錄影儲存空間剩餘 1.2TB。", color: "#f9a825" },
];

export function CareTab({
  isActive = true,
  isMobile = false,
  tasks,
  setTasks,
  journalEntries,
  setJournalEntries
}: {
  isActive?: boolean,
  isMobile?: boolean,
  tasks: Task[],
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>,
  journalEntries: JournalEntry[],
  setJournalEntries: React.Dispatch<React.SetStateAction<JournalEntry[]>>
}) {
  const [activeMode, setActiveMode] = useState<"tasks" | "journal">("tasks");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Journal State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [confirmDeleteJournalId, setConfirmDeleteJournalId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // Gallery State
  const [showGallery, setShowGallery] = useState(false);
  const [galleryItems, setGalleryItems] = useState<any[]>([]);
  const [isGalleryLoading, setIsGalleryLoading] = useState(false);

  const fetchGallery = async () => {
    setIsGalleryLoading(true);
    try {
      const res = await fetch(`${backendUrl}/list_alerts?t=${Date.now()}`);
      const data = await res.json();
      if (data && data.alerts) {
        setGalleryItems(data.alerts);
      }
    } catch (e) {
      console.error("Fetch Gallery Error:", e);
    } finally {
      setIsGalleryLoading(false);
    }
  };

  useEffect(() => {
    if (showGallery) fetchGallery();
  }, [showGallery]);

  // Safety Integration
  const [latestAlertImage, setLatestAlertImage] = useState<string | null>(null);
  const [riskScore, setRiskScore] = useState(0);
  const [dismissedImage, setDismissedImage] = useState<string | null>(null);
  const [backendUrl] = useState(() => {
    const saved = localStorage.getItem('smart_care_backend_url') || 'http://127.0.0.1:8080';
    return saved.endsWith('/') ? saved.slice(0, -1) : saved;
  });

  useEffect(() => {
    if (!isActive) return;

    const checkRiskAndAlerts = async () => {
      try {
        const ts = Date.now();
        const riskRes = await fetch(`${backendUrl}/risk_data?t=${ts}`);
        const riskData = await riskRes.json();
        if (riskData) {
          setRiskScore(riskData.score);
          if (riskData.latest_alert_image && riskData.latest_alert_image !== dismissedImage) {
            setLatestAlertImage(riskData.latest_alert_image);
          }
        }
      } catch (e) {
        console.error("CareTab Data Fetch Error:", e);
      }
    };

    const interval = setInterval(checkRiskAndAlerts, 1000);
    checkRiskAndAlerts();
    return () => clearInterval(interval);
  }, [isActive, backendUrl, dismissedImage]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formTime, setFormTime] = useState("");
  const [formCategory, setFormCategory] = useState<Category>("General");

  const overlayRef = useRef<HTMLDivElement>(null);

  const completedCount = tasks.filter((t) => t.done).length;
  const progress = tasks.length === 0 ? 0 : Math.round((completedCount / tasks.length) * 100);

  const toggleTask = (id: number) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const handleDeleteClick = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDeleteId === id) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
    }
  };

  const handleAddTask = () => {
    if (!formTitle.trim()) return;
    const newTask: Task = {
      id: Date.now(),
      title: formTitle.trim(),
      note: formNote.trim(),
      time: formTime || "--:--",
      category: formCategory,
      done: false,
    };
    setTasks((prev) => [...prev, newTask]);
    setFormTitle("");
    setFormNote("");
    setFormTime("");
    setFormCategory("General");
    setShowForm(false);
  };

  // Dismiss delete confirm when clicking elsewhere
  useEffect(() => {
    if (confirmDeleteId === null) return;
    const handler = () => setConfirmDeleteId(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [confirmDeleteId]);

  return (
    <div className="flex flex-col gap-4 px-4 pb-24 relative">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h2 className="text-gray-700" style={{ fontWeight: 700, fontSize: 18 }}>照護管理</h2>
          <p className="text-xs text-gray-400" style={{ fontWeight: 500 }}>任務與事件紀錄</p>
        </div>
        {activeMode === "tasks" && (
          <button
            onClick={() => setShowForm(true)}
            className="w-10 h-10 rounded-xl flex items-center justify-center shimmer-container transition-all active:scale-90"
            style={{
              background: "linear-gradient(135deg, rgba(79, 172, 254, 0.9), rgba(0, 242, 254, 0.9))",
              boxShadow: "3px 3px 10px rgba(79,172,254,0.4), inset 0 0 0 1px rgba(255,255,255,0.3)",
            }}
          >
            <div className="shimmer-effect" />
            <Plus size={20} className="text-white relative z-10" />
          </button>
        )}
      </div>

      {/* Mode Toggle */}
      <div className="flex p-1.5 rounded-2xl glass-panel relative">
        {(["tasks", "journal"] as const).map((mode) => (
          <motion.button
            key={mode}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            onClick={() => setActiveMode(mode)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all duration-300 relative z-10"
          >
            {activeMode === mode && (
              <motion.div
                layoutId="active-mode-bg"
                className="absolute inset-0 bg-blue-500 rounded-xl shadow-lg"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-20 flex items-center gap-2">
              {mode === "tasks" ? (
                <CheckSquare size={16} className={activeMode === mode ? "text-white" : "text-gray-400"} />
              ) : (
                <BookOpen size={16} className={activeMode === mode ? "text-white" : "text-gray-400"} />
              )}
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: activeMode === mode ? "#fff" : "#9ba8b4",
                }}
              >
                {mode === "tasks" ? "待辦任務" : "事件日誌"}
              </span>
            </span>
          </motion.button>
        ))}
      </div>

      {/* Emergency Alert Section */}
      {latestAlertImage && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-3xl p-4 overflow-hidden relative shimmer-container"
          style={{
            background: "rgba(255, 238, 238, 0.8)",
            border: "2px solid #fecaca",
            boxShadow: "0 10px 25px -5px rgba(244, 63, 94, 0.2)"
          }}
        >
          <div className="shimmer-effect opacity-30" />
          <div className="flex justify-between items-center mb-3 relative z-10">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-black text-red-600 tracking-wide">緊急安全警訊</span>
            </div>
            <span className="text-[10px] font-bold text-red-400 bg-red-50 px-2 py-0.5 rounded-full">LIVE EVIDENCE</span>
          </div>

          <div className="flex gap-4">
            <div
              className="w-24 h-24 rounded-2xl overflow-hidden shadow-lg border-2 border-white cursor-zoom-in flex-shrink-0"
              onClick={() => window.open(`${backendUrl}/alerts?file=${latestAlertImage}`, '_blank')}
            >
              <img
                src={`${backendUrl}/alerts?file=${latestAlertImage}`}
                className="w-full h-full object-cover"
                alt="Alert Clip"
              />
            </div>
            <div className="flex-1 flex flex-col justify-center">
              <p className="text-gray-800 font-extrabold text-[15px] leading-tight mb-1">偵測到異常活動</p>
              <p className="text-gray-500 text-[11px] font-semibold mb-2">影像已存檔於系統目錄</p>
              <div className="flex gap-2">
                <button
                  onClick={() => window.open(`${backendUrl}/alerts?file=${latestAlertImage}`, '_blank')}
                  className="px-3 py-1.5 rounded-xl bg-red-500 text-white text-[10px] font-black shadow-md shadow-red-500/30 active:scale-95 transition-all"
                >
                  查看原圖
                </button>
                <button
                  onClick={() => {
                    setDismissedImage(latestAlertImage);
                    setLatestAlertImage(null);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white text-gray-400 text-[10px] font-black border border-gray-100 active:scale-95 transition-all"
                >
                  暫時隱藏
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-red-200/50 flex justify-center">
            <button
              onClick={() => setShowGallery(true)}
              className="flex items-center gap-2 text-red-500 font-bold text-xs hover:underline active:scale-95 transition-all"
            >
              <ImageIcon size={14} /> 查看歷史紀錄存檔庫
            </button>
          </div>
        </motion.div>
      )}

      {/* Tasks Mode */}
      {activeMode === "tasks" && (
        <>
          {/* Progress Bar */}
          <div
            className="rounded-3xl px-5 py-4 glass-panel"
            style={{
              background: "rgba(255, 255, 255, 0.4)",
              border: "1px solid rgba(255, 255, 255, 0.5)",
            }}
          >
            <div className="flex justify-between items-center mb-3">
              <span className="text-gray-600 font-extrabold" style={{ fontSize: 13 }}>
                今日進度 · {completedCount}/{tasks.length}
              </span>
              <span className="text-blue-500 font-black" style={{ fontSize: 13 }}>{progress}%</span>
            </div>
            <div
              className="h-3 rounded-full overflow-hidden bg-white/30 backdrop-blur-inner"
              style={{
                boxShadow: "inset 1px 1px 3px rgba(0,0,0,0.05)",
              }}
            >
              <motion.div
                className="h-full rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: "circOut" }}
                style={{
                  background: "linear-gradient(90deg, #4facfe, #00f2fe)",
                  boxShadow: "0 0 10px rgba(79,172,254,0.5)",
                }}
              />
            </div>
          </div>

          {/* Task List */}
          {tasks.length === 0 ? (
            <div
              className="flex flex-col items-center py-10 gap-3 rounded-2xl"
              style={{
                background: "#F0F4F8",
                boxShadow: "inset 4px 4px 8px #d1d9e6, inset -4px -4px 8px #ffffff",
              }}
            >
              <span style={{ fontSize: 36 }}>🎉</span>
              <p className="text-gray-500" style={{ fontSize: 13, fontWeight: 700 }}>所有任務已完成！</p>
              <p className="text-gray-400" style={{ fontSize: 11, fontWeight: 500 }}>點擊右上角「＋」新增任務</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 mt-1">
              {tasks.map((task) => {
                const meta = CATEGORY_META[task.category];
                const isConfirming = confirmDeleteId === task.id;
                return (
                  <motion.div
                    key={task.id}
                    layout
                    whileTap={{ scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                    className="flex items-center gap-4 px-4 py-4 rounded-[24px] cursor-pointer transition-all duration-300 glass-panel"
                    style={{
                      background: task.done ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.5)",
                      border: task.done ? "1px solid rgba(255, 255, 255, 0.3)" : "1.5px solid rgba(255, 255, 255, 0.6)",
                      opacity: task.done ? 0.65 : 1,
                    }}
                    onClick={() => toggleTask(task.id)}
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center transition-all duration-300"
                      style={
                        task.done
                          ? {
                            background: "linear-gradient(135deg,#4facfe,#00f2fe)",
                            boxShadow: "0 0 12px rgba(79,172,254,0.5)",
                          }
                          : {
                            background: "rgba(255,255,255,0.4)",
                            border: "1.5px solid rgba(0,0,0,0.05)",
                          }
                      }
                    >
                      {task.done && (
                        <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                          <path d="M2 7l4 4 6-6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p
                        className="text-gray-800"
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          textDecoration: task.done ? "line-through" : "none",
                          color: task.done ? "#9ba8b4" : "#2d3748",
                        }}
                      >
                        {task.title}
                      </p>
                      {task.note && (
                        <p className="text-gray-500 truncate mt-0.5" style={{ fontSize: 11, fontWeight: 600 }}>
                          {task.note}
                        </p>
                      )}
                      <div className="flex items-center gap-2.5 mt-2">
                        <span
                          className="flex items-center gap-1.5 px-3 py-1 rounded-full backdrop-blur-md"
                          style={{ background: `${meta.color}20`, color: meta.color, fontSize: 10, fontWeight: 800, border: `1px solid ${meta.color}30` }}
                        >
                          {meta.emoji} {task.category}
                        </span>
                        {task.time !== "--:--" && (
                          <span className="flex items-center gap-1 text-gray-400 font-bold" style={{ fontSize: 10 }}>
                            <Clock size={11} /> {task.time}
                          </span>
                        )}
                      </div>
                    </div>

                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.96 }}
                      transition={{ type: "spring", stiffness: 400, damping: 17 }}
                      onClick={(e) => handleDeleteClick(task.id, e)}
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300 glass-panel"
                      style={
                        isConfirming
                          ? {
                            background: "linear-gradient(135deg,#f43f5e,#fb923c)",
                            border: "none",
                          }
                          : {
                            background: "rgba(0,0,0,0.03)",
                            border: "1px solid rgba(0,0,0,0.05)",
                          }
                      }
                    >
                      <Trash2
                        size={16}
                        style={{ color: isConfirming ? "#fff" : "#a0aec0" }}
                      />
                    </motion.button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Journal Mode */}
      {activeMode === "journal" && (
        <div className="flex flex-col gap-4 pb-20">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="搜尋事件或紀錄..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-2xl glass-panel outline-none text-sm font-semibold text-gray-700 transition-all focus:ring-2 focus:ring-blue-400/20"
                style={{ background: "rgba(255,255,255,0.4)" }}
              />
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {[
              { id: "all", label: "全部", icon: <SearchCheck size={14} /> },
              { id: "alert", label: "警報", icon: "🚨" },
              { id: "health", label: "用藥", icon: "💊" },
              { id: "person", label: "人員", icon: "👤" },
              { id: "activity", label: "活動", icon: "🏃" }
            ].map(cat => (
              <motion.button
                key={cat.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex-shrink-0 px-4 py-2 rounded-full flex items-center gap-1.5 border transition-all duration-300 ${selectedCategory === cat.id
                  ? "bg-blue-500 text-white border-blue-400 shadow-lg shadow-blue-400/30"
                  : "bg-white/40 text-gray-500 border-white/50 backdrop-blur-md"
                  }`}
                style={{ fontSize: 12, fontWeight: 700 }}
              >
                {cat.icon} {cat.label}
              </motion.button>
            ))}
          </div>

          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar size={14} className="text-blue-500" />
              <span style={{ fontSize: 13, fontWeight: 800 }}>歷史日期</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowGallery(true)}
                className="flex items-center gap-1 px-3 py-1 rounded-lg bg-blue-50 text-blue-500 border border-blue-100 text-[10px] font-bold active:scale-95 transition-all"
              >
                <ImageIcon size={12} /> 歷史存檔庫
              </button>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-3xl glass-panel relative overflow-hidden shimmer-container"
            style={{
              background: "linear-gradient(135deg, rgba(79, 172, 254, 0.1), rgba(0, 242, 254, 0.1))",
              border: "1.5px solid rgba(79, 172, 254, 0.2)"
            }}
          >
            <div className="shimmer-effect" />
            <div className="flex items-center gap-2 mb-2 relative z-10">
              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
                <Info size={16} />
              </div>
              <span className="text-blue-600" style={{ fontSize: 13, fontWeight: 800 }}>AI 今日生活觀察總結</span>
            </div>
            <p className="text-gray-600 leading-relaxed relative z-10" style={{ fontSize: 12, fontWeight: 600 }}>
              今日整體狀況穩定。上午完成散步活動，步態指標正常；血壓量測紀錄與服藥行為皆準時完成。中午有陌生訪客（推測為外送員），目前防護狀態良好。
            </p>
          </motion.div>

          <div className="flex flex-col gap-3">
            {journalEntries
              .filter(e => (selectedCategory === "all" || e.category === selectedCategory))
              .filter(e => e.message.includes(searchQuery) || e.type.includes(searchQuery))
              .map((entry) => {
                const isExpanded = expandedId === entry.id;
                return (
                  <motion.div
                    key={entry.id}
                    layout
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    className="rounded-2xl overflow-hidden glass-panel cursor-pointer transition-all duration-300"
                    style={{
                      background: isExpanded ? "rgba(255, 255, 255, 0.8)" : "rgba(255, 255, 255, 0.45)",
                      border: isExpanded ? "1.5px solid rgba(59, 130, 246, 0.4)" : "1px solid rgba(255, 255, 255, 0.5)",
                      boxShadow: isExpanded ? "0 20px 40px -15px rgba(0,0,0,0.1)" : "0 4px 12px rgba(0,0,0,0.03)"
                    }}
                  >
                    <div className="flex items-center gap-3 px-4 py-4">
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: entry.color, boxShadow: `0 0 10px ${entry.color}` }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="flex items-center gap-1.5" style={{ fontSize: 13, fontWeight: 800, color: entry.color }}>
                            {entry.type}
                          </span>
                          <div className="flex items-center gap-1 text-gray-400">
                            <Clock size={10} />
                            <span style={{ fontSize: 10, fontWeight: 600 }}>{entry.time}</span>
                          </div>
                        </div>
                        <p className={`text-gray-600 transition-all ${isExpanded ? 'font-bold' : 'font-medium'}`} style={{ fontSize: 13 }}>
                          {entry.message}
                        </p>
                      </div>
                      <motion.div animate={{ rotate: isExpanded ? 90 : 0 }}>
                        <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
                      </motion.div>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="px-4 pb-4 border-t border-gray-100/50 pt-3"
                        >
                          <div className="flex flex-col gap-3">
                            <div className="flex items-start gap-2 bg-blue-50/50 p-2.5 rounded-xl border border-blue-100/30">
                              <MessageSquare size={14} className="text-blue-500 mt-0.5" />
                              <p className="text-gray-600 leading-relaxed" style={{ fontSize: 12, fontWeight: 600 }}>
                                {entry.description}
                              </p>
                            </div>

                            <div className="flex gap-2">
                              {confirmDeleteJournalId === entry.id ? (
                                <motion.button
                                  initial={{ scale: 0.9, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setJournalEntries(prev => prev.filter(item => item.id !== entry.id));
                                    setConfirmDeleteJournalId(null);
                                  }}
                                  className="flex-1 py-2 rounded-xl bg-red-500 text-white text-[11px] font-bold shadow-lg shadow-red-500/30"
                                >
                                  確認刪除紀錄？
                                </motion.button>
                              ) : (
                                <>
                                  <button className="flex-1 py-2 rounded-xl bg-blue-500 text-white text-[11px] font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-transform">
                                    查看錄影回放
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmDeleteJournalId(entry.id);
                                    }}
                                    className="px-4 py-2 rounded-xl glass-panel text-red-400 text-[11px] font-bold active:scale-95 transition-transform"
                                    style={{ background: "rgba(245,81,108,0.1)" }}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      <AnimatePresence>
        {mounted && showForm && createPortal(
          <div
            ref={overlayRef}
            className="fixed inset-0 z-[9999] flex items-end justify-center"
            style={{ background: "rgba(20,30,48,0.45)", backdropFilter: "blur(8px)" }}
            onClick={(e) => { if (e.target === overlayRef.current) setShowForm(false); }}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="w-full max-w-sm rounded-t-3xl p-5"
              style={{
                background: "rgba(240,244,248,0.92)",
                backdropFilter: "blur(20px)",
                boxShadow: "0 -8px 32px rgba(79,172,254,0.15), 0 -2px 10px rgba(0,0,0,0.1)",
                maxHeight: "85vh",
                overflowY: "auto",
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-gray-700 font-bold text-base">新增照護任務</p>
                <button
                  onClick={() => setShowForm(false)}
                  className="w-7 h-7 rounded-full flex items-center justify-center bg-gray-100 shadow-sm"
                >
                  <X size={14} className="text-gray-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-gray-500 text-[11px] font-bold mb-1 block">任務名稱 *</label>
                  <input
                    type="text"
                    placeholder="輸入任務名稱..."
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-100 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="text-gray-500 text-[11px] font-bold mb-1 block">備註說明</label>
                  <input
                    type="text"
                    placeholder="額外備注（選填）..."
                    value={formNote}
                    onChange={(e) => setFormNote(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-100 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="text-gray-500 text-[11px] font-bold mb-1 block">時間設定</label>
                  <input
                    type="time"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white border border-gray-100 outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="text-gray-500 text-[11px] font-bold mb-1 block">類別選擇</label>
                  <div className="grid grid-cols-5 gap-2">
                    {(Object.keys(CATEGORY_META) as Category[]).map((cat) => {
                      const m = CATEGORY_META[cat];
                      const selected = formCategory === cat;
                      return (
                        <button
                          key={cat}
                          onClick={() => setFormCategory(cat)}
                          className={`flex flex-col items-center py-2 rounded-xl gap-1 transition-all ${selected ? "bg-blue-50 border-blue-200" : "bg-white border-transparent"}`}
                          style={{ border: "1px solid" }}
                        >
                          <span className="text-lg">{m.emoji}</span>
                          <span className="text-[8px] font-bold">{m.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={handleAddTask}
                  disabled={!formTitle.trim()}
                  className="w-full py-4 rounded-2xl bg-blue-500 text-white font-black text-sm shadow-lg shadow-blue-500/30 disabled:opacity-50"
                >
                  ＋ 新增照護任務
                </button>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
      </AnimatePresence>

      {/* Global Safety Gallery Portal */}
      {mounted && showGallery && createPortal(
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10000] flex flex-col pt-12"
          style={{ background: "rgba(240, 244, 248, 0.98)", backdropFilter: "blur(20px)" }}
        >
          {/* Gallery Header */}
          <div className="px-6 flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-500 text-white shadow-lg shadow-blue-500/30">
                <ImageIcon size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black text-gray-800 tracking-tight">安全紀錄檔案庫</h2>
                <p className="text-[10px] font-bold text-gray-400">系統自動擷取之警報影像證據</p>
              </div>
            </div>
            <button
              onClick={() => setShowGallery(false)}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-md active:scale-90 transition-all border border-gray-100"
            >
              <X size={20} className="text-gray-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-20 no-scrollbar">
            {isGalleryLoading ? (
              <div className="h-40 flex flex-col items-center justify-center gap-2">
                <RefreshCw size={24} className="text-blue-500 animate-spin" />
                <span className="text-xs font-bold text-gray-400">正在加載影像...</span>
              </div>
            ) : galleryItems.length === 0 ? (
              <div className="py-20 flex flex-col items-center gap-4 text-gray-400">
                <ImageIcon size={48} strokeWidth={1} />
                <p className="font-bold text-sm tracking-wide">目前尚無任何紀錄存檔</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 pb-10">
                {galleryItems.map((item, idx) => (
                  <motion.div
                    key={item.filename}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    className="group relative rounded-3xl overflow-hidden bg-white shadow-sm border border-gray-100"
                  >
                    <div
                      className="aspect-square relative cursor-zoom-in overflow-hidden"
                      onClick={() => window.open(`${backendUrl}/alerts?file=${item.filename}`, '_blank')}
                    >
                      <img
                        src={`${backendUrl}/alerts?file=${item.filename}`}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        alt="History Alert"
                        loading="lazy"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-6">
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          <span className="text-white font-bold text-[9px] uppercase tracking-widest">{item.label}</span>
                        </div>
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-black text-gray-800">{item.timestamp}</span>
                        <span className="text-[9px] font-black text-blue-500">SCORE {item.score}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setGalleryItems(prev => prev.filter(i => i.filename !== item.filename));
                        }}
                        className="w-full py-1.5 rounded-xl bg-gray-50 text-gray-400 text-[9px] font-bold border border-gray-100/50 flex items-center justify-center gap-1 hover:bg-red-50 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={10} /> 移除檔案
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          <div className="absolute bottom-8 inset-x-0 px-6 pointer-events-none">
            <div className="p-4 rounded-2xl bg-white/40 border border-white/50 text-center backdrop-blur-md">
              <p className="text-[10px] font-bold text-gray-400">影像永久儲存於 ./alerts 目錄下，佔用磁碟空間約 {(galleryItems.length * 0.15).toFixed(1)} MB</p>
            </div>
          </div>
        </motion.div>,
        document.body
      )}
    </div>
  );
}
