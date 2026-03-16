from ultralytics import YOLO
import os

model_path = r"c:\Users\user\Desktop\Smart Safety Care_APK\pt\best_int8.tflite"
if os.path.exists(model_path):
    try:
        model = YOLO(model_path)
        print("Success: Initialized YOLO with TFLite model")
        # Try a dummy inference
        import numpy as np
        dummy = np.zeros((640, 640, 3), dtype=np.uint8)
        results = model(dummy)
        print("Success: Inference worked")
    except Exception as e:
        print(f"Error: {e}")
else:
    print(f"File not found: {model_path}")
