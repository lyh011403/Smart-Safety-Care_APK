#include <jni.h>
#include <android/log.h>
#include <opencv2/core/core.hpp>
#include <opencv2/imgproc/imgproc.hpp>
#include <vector>

// Note: You must include ncnn headers in your project to use ncnn::Mat
// #include "ncnn/net.h"
// #include "ncnn/gpu.h"

#define TAG "YoloV8Ncnn"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, TAG, __VA_ARGS__)

extern "C" {

JNIEXPORT jboolean JNICALL
Java_com_smartsafety_app_MainActivity_loadModel(JNIEnv *env, jobject thiz, jstring param_path, jstring bin_path) {
    LOGD("Initializing NCNN with GPU (Vulkan) support...");

    // ncnn::create_gpu_instance();
    // ncnn::Net yolov8;
    // yolov8.opt.use_vulkan_compute = true; // Enable GPU acceleration

    // TODO: Initialize NCNN Net and load .param and .bin files
    return JNI_TRUE;
}

JNIEXPORT jobject JNICALL
Java_com_smartsafety_app_MainActivity_detect(JNIEnv *env, jobject thiz, jlong mat_addr) {
    cv::Mat *frame = (cv::Mat *) mat_addr;
    if (frame->empty()) return nullptr;

    // --- 1. Image Preprocessing ---
    // Scale the image to the model's required 640 x 640 resolution
    cv::Mat resized_frame;
    cv::resize(*frame, resized_frame, cv::Size(640, 640));

    // --- 2. Perform Recognition (Prepared for GPU) ---
    // ncnn::Extractor ex = yolov8.create_extractor();
    // ex.set_vulkan_compute(true); // Ensure extractor uses GPU

    // --- 3. Draw and Display Preparation ---
    jclass arrayListClass = env->FindClass("java/util/ArrayList");
    jmethodID arrayListInit = env->GetMethodID(arrayListClass, "<init>", "()V");
    jobject arrayList = env->NewObject(arrayListClass, arrayListInit);
    jmethodID arrayListAdd = env->GetMethodID(arrayListClass, "add", "(Ljava/lang/Object;)Z");

    jclass boxClass = env->FindClass("com/smartsafety/app/BoundingBoxView$Box");
    jmethodID boxInit = env->GetMethodID(boxClass, "<init>", "(Landroid/graphics/RectF;Ljava/lang/String;)V");

    jclass rectFClass = env->FindClass("android/graphics/RectF");
    jmethodID rectFInit = env->GetMethodID(rectFClass, "<init>", "(FFFF)V");

    float scale_x = (float)frame->cols / 640.0f;
    float scale_y = (float)frame->rows / 640.0f;

    // Mock Result: Person scaled back to original resolution
    float left = 100.0f * scale_x;
    float top = 100.0f * scale_y;
    float right = 300.0f * scale_x;
    float bottom = 400.0f * scale_y;

    jobject rectF = env->NewObject(rectFClass, rectFInit, left, top, right, bottom);
    jstring label = env->NewStringUTF("Person 99%");
    jobject box = env->NewObject(boxClass, boxInit, rectF, label);

    env->CallBooleanMethod(arrayList, arrayListAdd, box);

    return arrayList;
}

}
