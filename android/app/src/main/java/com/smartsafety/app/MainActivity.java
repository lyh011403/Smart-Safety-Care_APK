package com.smartsafety.app;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.RectF;
import android.os.Bundle;
import android.util.Log;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.widget.Button;
import android.widget.EditText;

import com.getcapacitor.BridgeActivity;

import org.opencv.android.OpenCVLoader;
import org.opencv.android.Utils;
import org.opencv.core.Mat;
import org.opencv.videoio.VideoCapture;
import org.opencv.videoio.Videoio;

import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "SmartSafetyStream";
    private BoundingBoxView boundingBoxView;
    private SurfaceView surfaceView;
    private EditText ipInput;
    private Button connectButton;
    
    private boolean isRunning = false;
    private Thread streamThread;

    static {
        System.loadLibrary("yolov8_ncnn");
    }

    public native boolean loadModel(String paramPath, String binPath);
    public native List<BoundingBoxView.Box> detect(long matAddr);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (!OpenCVLoader.initDebug()) {
            Log.e(TAG, "OpenCV initialization failed");
        }

        ipInput = findViewById(R.id.ipAddressInput);
        connectButton = findViewById(R.id.connectButton);
        surfaceView = findViewById(R.id.surfaceView);
        boundingBoxView = findViewById(R.id.boundingBoxOverlay);

        connectButton.setOnClickListener(v -> {
            if (!isRunning) {
                String ip = ipInput.getText().toString().trim();
                if (!ip.isEmpty()) {
                    startStreaming(ip);
                    connectButton.setText("Disconnect");
                }
            } else {
                isRunning = false;
                connectButton.setText("Connect");
            }
        });
    }

    private void startStreaming(String ip) {
        isRunning = true;
        streamThread = new Thread(() -> {
            String rtspUrl = "rtsp://" + ip + "/live?rtsp_transport=udp";
            VideoCapture capture = new VideoCapture();
            
            capture.open(rtspUrl, Videoio.CAP_FFMPEG);
            capture.set(Videoio.CAP_PROP_BUFFERSIZE, 1);

            if (!capture.isOpened()) {
                Log.e(TAG, "Failed to open RTSP stream");
                isRunning = false;
                runOnUiThread(() -> connectButton.setText("Connect"));
                return;
            }

            Mat frame = new Mat();
            while (isRunning) {
                // 1. Capture frame
                if (capture.read(frame)) {
                    if (frame.empty()) continue;

                    // 2 & 3. Preprocessing & Recognition (Native)
                    // The detect() call handles resizing to 640x640 and NCNN inference
                    List<BoundingBoxView.Box> results = detect(frame.getNativeObjAddr());

                    // 4. Draw and display
                    drawFrameToSurface(frame);
                    runOnUiThread(() -> {
                        boundingBoxView.setResults(results);
                    });
                }
            }
            capture.release();
        });
        streamThread.start();
    }

    private void drawFrameToSurface(Mat frame) {
        SurfaceHolder holder = surfaceView.getHolder();
        Canvas canvas = holder.lockCanvas();
        if (canvas != null) {
            try {
                Bitmap bitmap = Bitmap.createBitmap(frame.cols(), frame.rows(), Bitmap.Config.ARGB_8888);
                Utils.matToBitmap(frame, bitmap);
                canvas.drawBitmap(bitmap, null, new RectF(0, 0, canvas.getWidth(), canvas.getHeight()), null);
                bitmap.recycle();
            } finally {
                holder.unlockCanvasAndPost(canvas);
            }
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        isRunning = false;
    }
}
