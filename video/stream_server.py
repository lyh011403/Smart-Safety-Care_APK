import os
from dotenv import load_dotenv

# 加載環境變數
load_dotenv()

os.environ["OPENCV_LOG_LEVEL"] = "SILENT"
os.environ["OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS"] = "0"
import cv2
import http.server
import socketserver
import threading
import time
import requests
import json
from ultralytics import YOLO
import smtplib
from email.message import EmailMessage

# 獲取當前腳本目錄以確保路徑正確
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# 使用 YOLOv8 目錄下的最新權重
MODEL_PATH = os.path.join(os.path.dirname(BASE_DIR), 'YOLOv8', 'best.pt')

# 導入危險計算引擎
import sys
# 將 YOLOv8 目錄加入路徑以便導入 danger_engine
sys.path.append(os.path.join(os.path.dirname(BASE_DIR), 'YOLOv8'))
try:
    from danger_engine import DangerEngine
except ImportError:
    print("[警告] 無法導入 DangerEngine，請檢查 YOLOv8/danger_engine.py 路徑")
    DangerEngine = None

from datetime import datetime

# ========================
# ========================
#  設定
# ========================
PORT = 8080
CONF_THRESHOLD = 0.3   
FPS_TARGET = 30         
STREAM_WIDTH = 480      
JPEG_QUALITY = 30       

ROOT_DIR = os.path.dirname(BASE_DIR)
DEFAULT_MODEL = os.path.join(ROOT_DIR, 'pt', 'best.pt')
ALERTS_DIR = os.path.join(ROOT_DIR, 'alerts')
current_model_path = DEFAULT_MODEL
model = None
engine = None

def load_yolo_model(path):
    global model, engine
    print(f">> [系統] 正在嘗試載入模型: {path}")
    try:
        # 建立新模型實例
        new_model = YOLO(path)
        
        # 簡單測試一次推理以確保相依性程式庫已安裝 (例如 TFLite 需要 tensorflow)
        import numpy as np
        dummy = np.zeros((640, 640, 3), dtype=np.uint8)
        new_model(dummy, verbose=False)
        
        model = new_model
        # 重新初始化危險引擎
        if DangerEngine:
            engine = DangerEngine(frame_width=STREAM_WIDTH, frame_height=int(STREAM_WIDTH * 0.75))
        print(f">> [系統] 模型 {os.path.basename(path)} 載入成功！")
        return True, "成功"
    except Exception as e:
        error_msg = str(e)
        if "tensorflow" in error_msg.lower():
            error_msg = "環境缺少 tensorflow，無法執行 TFLite 模型。"
        print(f"[錯誤] 無法載入模型 {path}: {error_msg}")
        return False, error_msg

# 初始載入
load_yolo_model(current_model_path)

caps = {}
latest_jpegs = {}
latest_risk_data = {
    "score": 0, 
    "subScores": {"distance": 0, "level": 0, "duration": 0}, 
    "alerts": [],
    "latest_alert_image": None
}
is_running = True
webhook_url = "" # 由前端同步
last_webhook_time = 0
notification_cooldown = 10 
email_config = {
    "receiver": "",
    "sender": "",
    "password": "", # App Password
    "enabled": False
}
# 系統內置發信帳號 (由 .env 檔案讀取以保安全)
SYSTEM_EMAIL_SENDER = os.getenv("SYSTEM_EMAIL_SENDER", "")
SYSTEM_EMAIL_PASSWORD = os.getenv("SYSTEM_EMAIL_PASSWORD", "")

def send_webhook_notification(score, sub_scores, alerts, is_test=False):
    global last_webhook_time
    if not webhook_url: 
        print("[警告] Webhook URL 為空，取消發送")
        return False, "Webhook URL 為空"
    
    current_time = time.time()
    if not is_test and (current_time - last_webhook_time < notification_cooldown):
        return False, "冷卻中"
        
    try:
        primary_alert = alerts[0] if alerts else {}
        payload = {
            "event": "risk_detected" if not is_test else "test_event",
            "score": score,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "object": primary_alert.get("object_label", "unknown"),
            "details": {
                "distance": sub_scores["distance"],
                "level": sub_scores["level"],
                "duration": sub_scores["duration"]
            },
            "is_test": is_test
        }
        
        if is_test:
            # 測試模式：同步發送以獲取結果
            try:
                print(f">> [Webhook] 正在發送測試請求至: {webhook_url}...")
                resp = requests.post(webhook_url, json=payload, timeout=5)
                if resp.status_code >= 200 and resp.status_code < 300:
                    print(f">> [Webhook] 測試發送成功！狀態碼: {resp.status_code}")
                    return True, "發送成功"
                else:
                    err_msg = f"n8n 回傳錯誤代碼: {resp.status_code}, 內容: {resp.text[:100]}"
                    print(f"[警告] Webhook 測試失敗: {err_msg}")
                    return False, err_msg
            except Exception as e:
                err_msg = f"網路連線失敗: {str(e)}"
                print(f"[錯誤] Webhook 測試異常: {err_msg}")
                return False, err_msg
        else:
            # 一般模式：非同步發送，不等待結果
            def post():
                try:
                    resp = requests.post(webhook_url, json=payload, timeout=3)
                    print(f">> [Webhook] 自動發送成功 | 狀態: {resp.status_code} | 對象: {payload['object']}")
                except Exception as e:
                    print(f"[警告] Webhook 自動發送失敗: {e}")
            
            threading.Thread(target=post).start()
            last_webhook_time = current_time
            return True, "已異步啟動"
            
    except Exception as e:
        print(f"[錯誤] 準備 Webhook 時出錯: {e}")
        return False, str(e)

def send_email_notification(score, label, timestamp, image_path, is_test=False):
    """
    發送帶有擷圖附件的電子郵件通知 (使用 EmailMessage 優化版)
    """
    if not is_test and (not email_config["enabled"] or not email_config["receiver"]):
        return False, "郵件功能未啟用或收件人為空"
    
    if is_test and not email_config["receiver"]:
        return False, "測試失敗：未填寫收件人信箱"

    def post_email():
        try:
            # 優先使用系統內置帳號
            sender = email_config["sender"] or SYSTEM_EMAIL_SENDER
            password = email_config["password"] or SYSTEM_EMAIL_PASSWORD
            
            if not sender or not password:
                print("[錯誤] 缺少發件人帳號或密碼 (內置帳號未設定)")
                return False, "缺少發送憑證"

            msg = EmailMessage()
            msg['Subject'] = f"【SmartCare {'測試' if is_test else '警報'}】偵測到高度風險 ({score}%)"
            msg['From'] = f"Smart Safety Care <{sender}>"
            msg['To'] = email_config["receiver"]

            body = f"""
            <h3>Smart Safety Care {'功能測試' if is_test else '系統警報'}</h3>
            <p><b>觸發時間:</b> {timestamp}</p>
            <p><b>風險分數:</b> <span style="color:red; font-size:18px;">{score}</span></p>
            <p><b>偵測對象:</b> {label}</p>
            <p>{'這是一封功能測試郵件，若您收到此信代表設定正確。' if is_test else '系統已自動擷取影像作為證據，請見附件。'}</p>
            <hr>
            <p style="font-size:11px; color:gray;">此郵件由 Smart Safety Care 系統自動發送。</p>
            """
            msg.set_content(body, subtype='html')

            if image_path and os.path.exists(image_path):
                with open(image_path, 'rb') as f:
                    file_data = f.read()
                    msg.add_attachment(
                        file_data, 
                        maintype='image', 
                        subtype='jpeg', 
                        filename=os.path.basename(image_path)
                    )

            # 改用 587 埠 (STARTTLS) 通常比 465 埠更容易穿透防火牆
            try:
                with smtplib.SMTP("smtp.gmail.com", 587, timeout=10) as server:
                    server.starttls()
                    server.login(sender, password)
                    server.send_message(msg)
                    print(f">> [郵件] {'測試' if is_test else '警報'}郵件已發送至: {email_config['receiver']}")
            except Exception as e:
                # 如果 587 失敗，最後嘗試一下 465
                print(f"[警告] 587 埠連線失敗，點試嘗試 465 埠: {e}")
                with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as server:
                    server.login(sender, password)
                    server.send_message(msg)
                    print(f">> [郵件] (465) {'測試' if is_test else '警報'}郵件已發送至: {email_config['receiver']}")

            return True, "發送成功"
                
        except Exception as e:
            print(f"[錯誤] 發送電子郵件失敗: {e}")
            return False, str(e)

    if is_test:
        return post_email()
    else:
        threading.Thread(target=post_email, daemon=True).start()
        return True, "已啟動發送"

def save_alert_image(frame, score, alerts):
    """
    儲存警示影像擷圖
    """
    try:
        if not os.path.exists(ALERTS_DIR):
            os.makedirs(ALERTS_DIR)
            
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        obj_label = alerts[0].get("object_label", "unknown") if alerts else "unknown"
        filename = f"ALARM_{timestamp}_Score{score}_{obj_label}.jpg"
        filepath = os.path.join(ALERTS_DIR, filename)
        
        # 儲存影像 (包含標註)
        # 在影像底部加入時間戳記
        display_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cv2.putText(frame, display_time, (15, frame.shape[0] - 20), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 4, cv2.LINE_AA) # 黑色描邊
        cv2.putText(frame, display_time, (15, frame.shape[0] - 20), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1, cv2.LINE_AA) # 白色文字
        
        cv2.imwrite(filepath, frame)
        print(f">> [系統] 警示影像已儲存: {filepath}")
        
        # 更新最新截圖路徑 (僅存檔名，透過路由讀取)
        latest_risk_data["latest_alert_image"] = filename
        
        # 觸發郵件通知
        send_email_notification(score, obj_label, display_time, filepath)
        
        return filepath
    except Exception as e:
        print(f"[錯誤] 儲存警示影像失敗: {e}")
        return None

def get_dummy_frame(text="NO SIGNAL"):
    import numpy as np
    width, height = STREAM_WIDTH, int(STREAM_WIDTH * 0.75)
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    frame[:] = (39, 24, 17) # 深色背景
    
    # 計算文字位置以置中
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.8
    thickness = 1
    color = (130, 130, 130) # 稍微亮一點的灰色
    
    (text_w, text_h), baseline = cv2.getTextSize(text, font, font_scale, thickness)
    text_x = (width - text_w) // 2
    text_y = (height + text_h) // 2
    
    cv2.putText(frame, text, (text_x, text_y), font, font_scale, color, thickness, cv2.LINE_AA)
    _, buf = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
    return buf.tobytes()

print(">> 啟動攝影機偵測 (頻道 1)...")
# 預設嘗試開啟第一個相機給頻道 1
for idx in [0, 1, 2]: 
    temp_cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
    if not temp_cap.isOpened() or not temp_cap.read()[0]:
        temp_cap.release()
        temp_cap = cv2.VideoCapture(idx)
    
    if temp_cap.isOpened() and temp_cap.read()[0]:
        caps[1] = temp_cap
        # 設定相機硬體解析度 (選擇較小解析度可減輕讀取負擔)
        temp_cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        temp_cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        print(f">> 攝影機 {idx} 已分配至頻道 1")
        break
    temp_cap.release()

# ========================
#  攝影機擷取執行緒
# ========================
def capture_loop():
    global latest_jpegs
    while is_running:
        start_time = time.time()
        # 遍歷所有已開啟的頻道
        active_channels = list(caps.keys())
        for ch in active_channels:
            cap = caps.get(ch)
            if cap and cap.isOpened():
                ret, frame = cap.read()
                if ret:
                    # 1. 調整大小 (縮圖)
                    h, w = frame.shape[:2]
                    scale = STREAM_WIDTH / w
                    new_size = (STREAM_WIDTH, int(h * scale))
                    small_frame = cv2.resize(frame, new_size, interpolation=cv2.INTER_AREA)

                    # 2. YOLO 辨識
                    if model is not None:
                        # 使用縮小後的圖進行辨識可提升速度
                        results = model(small_frame, conf=CONF_THRESHOLD, verbose=False)
                        annotated = results[0].plot()
                        
                        # 3. 危險計算 (僅針對頻道 1 進行精細計算)
                        if ch == 1 and engine is not None:
                            try:
                                persons = []
                                dangerous_objects = []
                                
                                # 提取 YOLO 預測框
                                for r in results:
                                    boxes = r.boxes
                                    for i, box in enumerate(boxes):
                                        cls_id = int(box.cls[0])
                                        label = r.names[cls_id]
                                        x1, y1, x2, y2 = box.xyxy[0].tolist()
                                        obj_data = {"id": i, "box": (int(x1), int(y1), int(x2), int(y2)), "label": label}
                                        
                                        if label == 'person':
                                            persons.append(obj_data)
                                        elif label in ['scissors', 'knife', 'cutter']:
                                            dangerous_objects.append(obj_data)
                                
                                # 評估風險
                                alerts = engine.evaluate(persons, dangerous_objects, fps=FPS_TARGET)
                                
                                # 更新全局風險數據
                                if alerts:
                                    best_alert = max(alerts, key=lambda a: a["danger_score"])
                                    max_score = best_alert["danger_score"]
                                    # 正規化分數至 0-100 (假設 30 為極度危險)
                                    normalized_score = min(100, int((max_score / 30.0) * 100))
                                    
                                    # 正規化各子項 (0-100)
                                    dist_val = int(best_alert["distance_factor"] * 100)
                                    level_val = min(100, int((best_alert["danger_level"] / 10.0) * 100))
                                    # 持續時間正規化，假設 3 秒 (約 60 幀) 為滿分
                                    dur_val = min(100, int((best_alert["duration_frames"] / 35.0) * 100))

                                    latest_risk_data["score"] = normalized_score
                                    latest_risk_data["subScores"] = {
                                        "distance": dist_val,
                                        "level": level_val,
                                        "duration": dur_val
                                    }
                                    latest_risk_data["alerts"] = alerts
                                    
                                    # 觸發 Webhook 通知與截圖 (如果達成警報門檻，加入分數過濾)
                                    is_triggered = any(a.get("triggered", False) for a in alerts)
                                    if is_triggered and normalized_score >= 90:
                                        # 檢查冷卻時間 (與 Webhook 共用)
                                        current_time = time.time()
                                        if current_time - last_webhook_time >= notification_cooldown:
                                            # 1. 儲存截圖
                                            img_path = save_alert_image(annotated, normalized_score, alerts)
                                            # 2. 發送 Webhook (傳入圖片路徑資訊)
                                            send_webhook_notification(normalized_score, latest_risk_data["subScores"], alerts)
                                else:
                                    # 無警報時，分數緩慢下降
                                    latest_risk_data["score"] = max(0, latest_risk_data["score"] - 5)
                                    latest_risk_data["subScores"] = {
                                        "distance": max(0, latest_risk_data["subScores"]["distance"] - 5),
                                        "level": max(0, latest_risk_data["subScores"]["level"] - 10),
                                        "duration": 0
                                    }

                            except Exception as e:
                                print(f"[錯誤] 危險引擎計算失敗: {e}")
                    else:
                        annotated = small_frame

                    # 4. 編碼與壓縮
                    _, buf = cv2.imencode('.jpg', annotated, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
                    latest_jpegs[ch] = buf.tobytes()

                else:
                    # 讀取失敗，暫時移除以避免卡頓，等待手動或自動重連
                    print(f">> 頻道 {ch} 讀取失敗，移除連線")
                    cap.release()
                    del caps[ch]
                    if ch in latest_jpegs: del latest_jpegs[ch]
        
        # 動態計算休眠時間以維持穏定 FPS
        elapsed = time.time() - start_time
        sleep_time = max(0, (1.0 / FPS_TARGET) - elapsed)
        time.sleep(sleep_time)

# ========================
#  HTTP 串流 Handler
# ========================
class StreamHandler(http.server.BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PATCH, PUT, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
        self.send_header('Access-Control-Max-Age', '86400')
        self.end_headers()

    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')

    def do_POST(self):
        global current_model_path, webhook_url
        from urllib.parse import urlparse
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/set_webhook':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data)
                webhook_url = data.get('url', "")
                print(f">> [Webhook] URL 已由前端設定為: {webhook_url}")
                
                self.send_response(200)
                self.send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "url": webhook_url}).encode())
            except Exception as e:
                self.send_response(400)
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(str(e).encode())
        elif parsed_path.path == '/set_model':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data)
                target_path = data.get('path')
                
                if not target_path or not os.path.exists(target_path):
                    success, msg = False, "路徑無效或檔案不存在"
                else:
                    success, msg = load_yolo_model(target_path)
                    if success:
                        current_model_path = target_path

                self.send_response(200)
                self.send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": success, "message": msg, "current": current_model_path}).encode())
            except Exception as e:
                self.send_response(400)
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(str(e).encode())
        elif parsed_path.path == '/set_email_config':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data)
                email_config["receiver"] = data.get('receiver', "")
                email_config["sender"] = data.get('sender', "")
                email_config["password"] = data.get('password', "")
                email_config["enabled"] = data.get('enabled', False)
                
                print(f">> [郵件] 設定已更新: 收件人={email_config['receiver']}, 啟用={email_config['enabled']}")
                
                self.send_response(200)
                self.send_cors_headers()
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success"}).encode())
            except Exception as e:
                self.send_response(400)
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(str(e).encode())
        else:
            self.send_response(404)
            self.send_cors_headers()
            self.end_headers()

    def do_GET(self):
        global current_model_path, webhook_url
        from urllib.parse import urlparse, parse_qs
        parsed_path = urlparse(self.path)
        params = parse_qs(parsed_path.query)
        
        if parsed_path.path == '/video_feed':
            ch = int(params.get('ch', [1])[0]) # 預設頻道 1
            
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Cache-Control', 'no-cache, private')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=FRAME')
            self.end_headers()
            
            try:
                while is_running:
                    frame_data = latest_jpegs.get(ch)
                    if not frame_data:
                        # 若無訊號，動態生成虛擬畫面
                        frame_data = get_dummy_frame(f"CH-{ch:02d} NO SIGNAL")
                    
                    self.wfile.write(b'--FRAME\r\n')
                    self.send_header('Content-Type', 'image/jpeg')
                    self.send_header('Content-Length', len(frame_data))
                    self.end_headers()
                    self.wfile.write(frame_data)
                    self.wfile.write(b'\r\n')
                    time.sleep(1.0 / FPS_TARGET)
            except Exception:
                pass
                
        elif parsed_path.path == '/camera_status':
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            # 回傳所有頻道的連線狀態
            status = {ch: True for ch in caps}
            self.wfile.write(json.dumps(status).encode())
            
        elif parsed_path.path == '/reconnect_camera':
            ch = int(params.get('ch', [1])[0])
            source_param = params.get('source', [None])[0]
            
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            
            if ch in caps:
                caps[ch].release()
                del caps[ch]
                
            print(f">> 收到頻道 {ch} 重新連線請求，來源: {source_param if source_param else '自動掃描'}")
            
            success = False
            if source_param:
                try:
                    if source_param.isdigit():
                        src = int(source_param)
                        temp_cap = cv2.VideoCapture(src, cv2.CAP_DSHOW)
                    else:
                        src = source_param
                        temp_cap = cv2.VideoCapture(src)
                        
                    if temp_cap.isOpened() and temp_cap.read()[0]:
                        caps[ch] = temp_cap
                        print(f">> 頻道 {ch} 手動連線成功: {src}")
                        success = True
                    else:
                        temp_cap.release()
                except Exception as e:
                    print(f">> 手動連線出錯: {e}")
            
            if not success:
                # 自動掃描未被佔用的相機
                for idx in [0, 1, 2]:
                    temp_cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
                    if temp_cap.isOpened() and temp_cap.read()[0]:
                        caps[ch] = temp_cap
                        print(f">> 頻道 {ch} 自動連線成功：攝影機 {idx}")
                        success = True
                        break
                    temp_cap.release()
                
            self.wfile.write(json.dumps({"connected": success, "ch": ch}).encode())
            
        elif parsed_path.path == '/risk_data':
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(latest_risk_data).encode())
            
        elif parsed_path.path == '/get_available_models':
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            
            # 掃描 YOLOv8 跟 pt 目錄
            model_files = []
            scan_dirs = [
                os.path.join(ROOT_DIR, 'YOLOv8'),
                os.path.join(ROOT_DIR, 'pt')
            ]
            
            for d in scan_dirs:
                if os.path.exists(d):
                    for f in os.listdir(d):
                        if f.endswith('.pt') or f.endswith('.tflite') or f.endswith('.onnx'):
                            full_path = os.path.join(d, f)
                            rel_path = os.path.relpath(full_path, ROOT_DIR)
                            model_files.append({
                                "name": f,
                                "path": full_path,
                                "display_path": rel_path,
                                "type": "TFLite" if f.endswith('.tflite') else ("ONNX" if f.endswith('.onnx') else "PyTorch")
                            })
            
            self.wfile.write(json.dumps({
                "models": model_files,
                "current": current_model_path
            }).encode())

        elif parsed_path.path == '/test_email':
            # 測試發送郵件
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            # 嘗試找最新的警報圖作為測試附件，若無則不附圖
            latest_img = None
            if os.path.exists(ALERTS_DIR):
                import glob
                files = glob.glob(os.path.join(ALERTS_DIR, "*.jpg"))
                if files:
                    latest_img = max(files, key=os.path.getmtime)

            success, msg = send_email_notification(99, "測試對象", timestamp, latest_img, is_test=True)
            self.wfile.write(json.dumps({"success": success, "message": msg}).encode())

        elif parsed_path.path == '/alerts':
            # 取得警示影像
            filename = params.get('file', [None])[0]
            if not filename:
                self.send_response(400)
                self.end_headers()
                return
                
            file_path = os.path.join(ALERTS_DIR, filename)
            if os.path.exists(file_path):
                self.send_response(200)
                self.send_cors_headers()
                self.send_header('Content-Type', 'image/jpeg')
                self.end_headers()
                with open(file_path, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.send_response(404)
                self.end_headers()
        elif parsed_path.path == '/list_alerts':
            # 列出所有警示影像
            self.send_response(200)
            self.send_cors_headers()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            
            alerts = []
            if os.path.exists(ALERTS_DIR):
                import glob
                # 取得所有 .jpg 檔案並依修改時間排序 (由新到舊)
                files = glob.glob(os.path.join(ALERTS_DIR, "*.jpg"))
                files.sort(key=os.path.getmtime, reverse=True)
                
                for f in files:
                    fname = os.path.basename(f)
                    # 從檔名解析資訊: ALARM_YYYYMMDD_HHMMSS_Score75_object.jpg
                    parts = fname.replace(".jpg", "").split("_")
                    timestamp = "Unknown"
                    score = 0
                    label = "unknown"
                    
                    if len(parts) >= 3:
                        timestamp = f"{parts[1]} {parts[2]}"
                    if len(parts) >= 4:
                        score = parts[3].replace("Score", "")
                    if len(parts) >= 5:
                        label = parts[4]
                        
                    alerts.append({
                        "filename": fname,
                        "timestamp": timestamp,
                        "score": score,
                        "label": label,
                        "mtime": os.path.getmtime(f)
                    })
            
            self.wfile.write(json.dumps({"alerts": alerts}).encode())
        elif parsed_path.path == '/':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(b'''
                <html><body style="background:#000;margin:0">
                <img src="/video_feed?ch=1" style="width:100%;height:auto">
                </body></html>
            ''')

# ========================
#  啟動
# ========================
capture_thread = threading.Thread(target=capture_loop, daemon=True)
capture_thread.start()

print(f">> 串流伺服器啟動於 http://127.0.0.1:{PORT}")
print(f">> 按 Ctrl+C 停止")

class StreamingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    allow_reuse_address = True
    daemon_threads = True

try:
    server = StreamingServer(('', PORT), StreamHandler)
    server.serve_forever()
except KeyboardInterrupt:
    print("\n>> 伺服器已停止。")
    is_running = False
    for cap in caps.values():
        cap.release()
