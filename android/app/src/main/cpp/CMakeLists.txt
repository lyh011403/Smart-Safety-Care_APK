cmake_minimum_required(VERSION 3.10.2)

project("yolov8_ncnn")

# Set OpenCV path (You need to point this to your OpenCV Android SDK)
# set(OpenCV_DIR "path/to/OpenCV-android-sdk/sdk/native/jni")
# find_package(OpenCV REQUIRED)

# Set NCNN path
# set(ncnn_DIR "path/to/ncnn-android-vulkan/${ANDROID_ABI}/lib/cmake/ncnn")
# find_package(ncnn REQUIRED)

add_library(yolov8_ncnn SHARED
    yolov8_ncnn.cpp
)

target_link_libraries(yolov8_ncnn
    # ${OpenCV_LIBS}
    # ncnn
    android
    log
    jnigraphics
)
