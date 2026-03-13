import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { 
  Settings, 
  Globe, 
  Bell, 
  ShieldCheck, 
  Info, 
  Smartphone, 
  Database,
  ChevronRight,
  ExternalLink,
  RotateCcw,
  Save,
  Cpu,
  Video,
  Mic,
  Volume2,
  Wifi,
  Sparkles
} from "lucide-react";

export function SettingsTab({ isMobile = false }: { isMobile?: boolean }) {
  const [backendUrl, setBackendUrl] = useState(() => {
    const saved = localStorage.getItem('smart_care_backend_url') || 'http://127.0.0.1:8080';
    return saved.endsWith('/') ? saved.slice(0, -1) : saved;
  });
  const [webhookUrl, setWebhookUrl] = useState(() => localStorage.getItem('smart_care_webhook_url') || '');
  const [sensitivity, setSensitivity] = useState(() => Number(localStorage.getItem('smart_care_sensitivity')) || 70);
  const [notificationEnabled, setNotificationEnabled] = useState(() => localStorage.getItem('smart_care_notifications') !== 'false');
  const [cameraSource, setCameraSource] = useState(() => localStorage.getItem('cameraSource') || '');
  const [videoQuality, setVideoQuality] = useState(() => localStorage.getItem('smart_care_video_quality') || 'High');
  const [micEnabled, setMicEnabled] = useState(() => localStorage.getItem('smart_care_mic_enabled') !== 'false');
  const [speakerEnabled, setSpeakerEnabled] = useState(() => localStorage.getItem('smart_care_speaker_enabled') !== 'false');
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success">("idle");
  const [availableModels, setAvailableModels] = useState<{name: string, path: string, display_path: string, type: string}[]>([]);
  const [currentModel, setCurrentModel] = useState<string>("");
  const [modelType, setModelType] = useState<string>("PyTorch");

  useEffect(() => {
    fetchModels();
  }, [backendUrl]);

  const fetchModels = async () => {
    if (!backendUrl) return;
    const cleanUrl = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
    try {
      const res = await fetch(`${cleanUrl}/get_available_models`);
      const data = await res.json();
      setAvailableModels(data.models || []);
      setCurrentModel(data.current || "");
      
      const current = data.models?.find((m: any) => m.path === data.current);
      if (current) setModelType(current.type);
    } catch (err) {
      console.error("Fetch Models Error:", err);
    }
  };

  const handleModelChange = async (path: string) => {
    if (!backendUrl) return;
    const cleanUrl = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
    try {
      const res = await fetch(`${cleanUrl}/set_model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      const data = await res.json();
      if (data.success) {
        setCurrentModel(data.current);
        const current = availableModels.find(m => m.path === data.current);
        if (current) setModelType(current.type);
      } else {
        alert(`❌ 模型切換失敗: ${data.message}`);
      }
    } catch (err) {
      alert("❌ 無法與後端連線切換模型");
    }
  };

  const handleSave = () => {
    setSaveStatus("saving");
    localStorage.setItem('smart_care_backend_url', backendUrl);
    localStorage.setItem('smart_care_webhook_url', webhookUrl);
    localStorage.setItem('smart_care_sensitivity', sensitivity.toString());
    localStorage.setItem('smart_care_notifications', notificationEnabled.toString());
    localStorage.setItem('cameraSource', cameraSource);
    localStorage.setItem('smart_care_video_quality', videoQuality);
    localStorage.setItem('smart_care_mic_enabled', micEnabled.toString());
    localStorage.setItem('smart_care_speaker_enabled', speakerEnabled.toString());
    
    // Sync with backend
    syncWebhook();

    setTimeout(() => {
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2000);
    }, 800);
  };

  const syncWebhook = async () => {
    if (!backendUrl) return;
    const cleanUrl = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
    try {
      await fetch(`${cleanUrl}/set_webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl })
      });
    } catch (err) {
      console.error("Webhook Sync Error:", err);
    }
  };

  const handleTestWebhook = async () => {
    if (!backendUrl) {
      alert("請先設定後端伺服器位址");
      return;
    }
    const cleanUrl = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
    try {
      // First, sync the current webhook URL to ensure we test the latest one
      await syncWebhook();
      
      const res = await fetch(`${cleanUrl}/test_webhook`);
      const data = await res.json();
      if (data.success) {
        alert(`✅ 測試成功: ${data.message}`);
      } else {
        alert(`❌ 測試失敗: ${data.message}`);
      }
    } catch (err) {
      alert("❌ 無法連線至後端伺服器，請檢查位址是否正確或伺服器是否已啟動。");
    }
  };

  const SettingGroup = ({ title, icon: Icon, children }: { title: string, icon: any, children: React.ReactNode }) => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center">
          <Icon className="text-blue-500" size={14} />
        </div>
        <h3 className="text-sm font-bold text-gray-700 tracking-wide uppercase" style={{ fontSize: 11 }}>{title}</h3>
      </div>
      <div className="flex flex-col gap-2">
        {children}
      </div>
    </div>
  );

  const SettingRow = ({ label, children, description }: { label: string, children: React.ReactNode, description?: string }) => (
    <div 
      className="p-4 rounded-2xl bg-white/40 border border-white/50 backdrop-blur-md flex flex-col gap-2"
      style={{ boxShadow: "inset 0 0 10px rgba(255,255,255,0.2)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-gray-700">{label}</span>
        {children}
      </div>
      {description && <p className="text-[10px] text-gray-400 font-medium leading-relaxed">{description}</p>}
    </div>
  );

  return (
    <div className="flex flex-col gap-6 px-4 pb-24 relative">
      <style>{`
        .settings-input {
          background: rgba(240, 244, 248, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.7);
          box-shadow: inset 2px 2px 5px #d1d9e6, inset -2px -2px 5px #ffffff;
          padding: 8px 12px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
          color: #3a4a5c;
          width: 100%;
          outline: none;
          transition: all 0.3s;
        }
        .settings-input:focus {
          border-color: #4facfe;
          background: rgba(255, 255, 255, 0.8);
        }
        .toggle-switch {
          position: relative;
          display: inline-block;
          width: 44px;
          height: 24px;
        }
        .toggle-switch input { opacity: 0; width: 0; height: 0; }
        .slider {
          position: absolute;
          cursor: pointer;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: #cbd5e1;
          transition: .4s;
          border-radius: 24px;
        }
        .slider:before {
          position: absolute;
          content: "";
          height: 18px; width: 18px;
          left: 3px; bottom: 3px;
          background-color: white;
          transition: .4s;
          border-radius: 50%;
        }
        input:checked + .slider { background: linear-gradient(135deg, #4facfe, #00f2fe); }
        input:checked + .slider:before { transform: translateX(20px); }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h2 className="text-gray-700 font-bold text-lg">系統設置</h2>
          <p className="text-xs text-gray-400 font-medium tracking-tight">配置核心感應與通訊參數</p>
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={handleSave}
          className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white border border-white transition-all shadow-md"
          style={{ 
            boxShadow: saveStatus === "success" ? "0 0 15px rgba(16, 185, 129, 0.4)" : "6px 6px 12px #d1d9e6, -6px -6px 12px #ffffff" 
          }}
        >
          {saveStatus === "idle" && <Save size={18} className="text-blue-500" />}
          {saveStatus === "saving" && <RotateCcw size={18} className="text-blue-500 animate-spin" />}
          {saveStatus === "success" && <motion.span initial={{ scale: 0.5 }} animate={{ scale: 1 }} className="text-green-500">✅</motion.span>}
        </motion.button>
      </div>

      {/* Network Config */}
      <SettingGroup title="通訊配置" icon={Globe}>
        <SettingRow label="伺服器位址" description="影像辨識後端 API 的入口位址。">
          <input 
            className="settings-input"
            value={backendUrl}
            onChange={(e) => setBackendUrl(e.target.value)}
            placeholder="http://192.168.1.100:8080"
          />
        </SettingRow>
        <SettingRow label="n8n 通知掛鉤" description="當偵測到高度風險時，發送 JSON 數據至此 URL。">
          <div className="flex flex-col gap-2 w-full">
            <input 
              className="settings-input"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://n8n.example.com/webhook/..."
            />
            <button
              onClick={handleTestWebhook}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[11px] font-bold shadow-md active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Sparkles size={14} /> 發送測試通知
            </button>
          </div>
        </SettingRow>
      </SettingGroup>

      {/* AI & Detection */}
      <SettingGroup title="AI 感應參數" icon={Cpu}>
        <SettingRow label="YOLO 辨識模型" description="選擇不同的辨識引擎版本 (如 TFLite 可加快行動端速度)。">
          <select 
            className="settings-input mt-1"
            value={currentModel}
            onChange={(e) => handleModelChange(e.target.value)}
          >
            {availableModels.map(m => (
              <option key={m.path} value={m.path}>
                {m.name} ({m.type})
              </option>
            ))}
            {availableModels.length === 0 && <option>未偵測到模型檔案</option>}
          </select>
        </SettingRow>
        <SettingRow label="警報觸發閾值" description={`目前設定: ${sensitivity}。當風險分數超過此值時，系統將發出強大警報音與通知。`}>
          <div className="flex items-center gap-3 w-full mt-2">
            <input 
              type="range"
              min="10"
              max="100"
              value={sensitivity}
              onChange={(e) => setSensitivity(Number(e.target.value))}
              className="flex-1 accent-blue-500 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-xs font-black text-blue-500 w-8">{sensitivity}</span>
          </div>
        </SettingRow>
        <SettingRow label="系統通知開關">
          <label className="toggle-switch">
            <input 
              type="checkbox" 
              checked={notificationEnabled}
              onChange={(e) => setNotificationEnabled(e.target.checked)}
            />
            <span className="slider"></span>
          </label>
        </SettingRow>
      </SettingGroup>

      {/* Device Config */}
      <SettingGroup title="設備設置" icon={Smartphone}>
        <SettingRow label="WiFi 攝影機 (RTSP)" description="填寫 RTSP 位址，例如 SJCAM 的網址。">
          <input 
            className="settings-input"
            value={cameraSource}
            onChange={(e) => setCameraSource(e.target.value)}
            placeholder="rtsp://192.168.1.254/sjcam.mov"
          />
        </SettingRow>
        <SettingRow label="影像串流品質">
          <div className="flex rounded-xl p-1 bg-gray-200/50 w-32" style={{ boxShadow: "inset 1px 1px 3px rgba(0,0,0,0.1)" }}>
            {["Low", "Mid", "High"].map((level) => (
              <button
                key={level}
                onClick={() => setVideoQuality(level)}
                className={`flex-1 py-1 rounded-lg text-[10px] font-black transition-all ${videoQuality === level ? 'bg-white text-blue-500 shadow-sm' : 'text-gray-400'}`}
              >
                {level[0]}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow label="現場收音開關">
          <label className="toggle-switch">
            <input 
              type="checkbox" 
              checked={micEnabled}
              onChange={(e) => setMicEnabled(e.target.checked)}
            />
            <span className="slider"></span>
          </label>
        </SettingRow>
        <SettingRow label="雙向通話開關">
          <label className="toggle-switch">
            <input 
              type="checkbox" 
              checked={speakerEnabled}
              onChange={(e) => setSpeakerEnabled(e.target.checked)}
            />
            <span className="slider"></span>
          </label>
        </SettingRow>
      </SettingGroup>

      {/* System Info */}
      <SettingGroup title="系統狀態" icon={Info}>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl bg-white/40 border border-white/50 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-gray-400 uppercase">軟體版本</span>
            <span className="text-xs font-black text-gray-700">v2.4.1 (Stable)</span>
          </div>
          <div className="p-4 rounded-2xl bg-white/40 border border-white/50 flex flex-col gap-1">
            <span className="text-[10px] font-bold text-gray-400 uppercase">核心引擎</span>
            <span className="text-xs font-black text-blue-500">YOLOv8-{modelType}</span>
          </div>
        </div>
      </SettingGroup>

      <div className="mt-4 p-5 rounded-[32px] bg-gradient-to-br from-gray-800 to-gray-900 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <ShieldCheck size={80} />
        </div>
        <div className="relative z-10">
          <h4 className="text-sm font-bold flex items-center gap-2">
            <span className="text-emerald-400">●</span> 系統安全性已啟用
          </h4>
          <p className="text-[10px] text-gray-400 mt-1 font-medium leading-relaxed">
            所有生理數據與監控影像均經過端對端加密傳輸，本機運算確保隱私不外洩。
          </p>
          <button className="mt-4 px-4 py-2 bg-white/10 rounded-xl hover:bg-white/20 transition-all text-[11px] font-bold flex items-center gap-2">
            查看安全協議 <ExternalLink size={12} />
          </button>
        </div>
      </div>

      <div className="text-center opacity-30 mt-4">
        <p className="text-[9px] font-bold tracking-widest text-gray-400">SMART SAFETY CARE · LYH-LAB 2026</p>
      </div>
    </div>
  );
}
