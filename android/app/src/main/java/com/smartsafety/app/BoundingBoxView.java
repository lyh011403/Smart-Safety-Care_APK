package com.smartsafety.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.view.View;
import java.util.ArrayList;
import java.util.List;

public class BoundingBoxView extends View {
    private Paint paint = new Paint();
    private List<Box> boxes = new ArrayList<>();

    public static class Box {
        public RectF rect;
        public String label;
        public Box(RectF rect, String label) {
            this.rect = rect;
            this.label = label;
        }
    }

    public BoundingBoxView(Context context) {
        super(context);
        init();
    }

    public BoundingBoxView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        paint.setColor(Color.RED);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(5.0f);
        paint.setTextSize(40.0f);
    }

    public void setResults(List<Box> newBoxes) {
        this.boxes = newBoxes;
        postInvalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        for (Box box : boxes) {
            canvas.drawRect(box.rect, paint);
            canvas.drawText(box.label, box.rect.left, box.rect.top - 10, paint);
        }
    }
}
