# Android Build & Deployment Guide

## Prerequisites

1. **Android Studio** - Download from https://developer.android.com/studio
2. **Android SDK** - Installed via Android Studio
3. **Java JDK 17+** - Required for Gradle builds
4. **USB Debugging enabled** on your Android device

### Enable USB Debugging on Device
1. Go to Settings > About Phone
2. Tap "Build Number" 7 times to enable Developer Options
3. Go to Settings > Developer Options
4. Enable "USB Debugging"

## NPM Scripts

```bash
# Build React app and sync to Android
npm run cap:build

# Build debug APK (shareable)
npm run android:build

# Build and install on connected device
npm run android:run

# Open project in Android Studio
npm run cap:android
```

## Manual Commands

### Check Connected Devices
```bash
adb devices
```

### Build Debug APK
```bash
cd android && ./gradlew assembleDebug
```
APK location: `android/app/build/outputs/apk/debug/app-debug.apk`

### Build Release APK (unsigned)
```bash
cd android && ./gradlew assembleRelease
```
APK location: `android/app/build/outputs/apk/release/app-release-unsigned.apk`

### Install APK on Device
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

### Build and Run in One Command
```bash
cd android && ./gradlew installDebug
```

## Troubleshooting

### "No connected devices" error
- Ensure USB debugging is enabled
- Try a different USB cable (use data cable, not charge-only)
- Run `adb kill-server && adb start-server`

### Build fails with SDK errors
- Open Android Studio and install missing SDK components
- Set `ANDROID_HOME` environment variable:
  ```bash
  export ANDROID_HOME=$HOME/Library/Android/sdk
  export PATH=$PATH:$ANDROID_HOME/platform-tools
  ```

### App crashes on launch
- Check if your API URLs are accessible from the device
- For local development, use `10.0.2.2` (emulator) or your machine's IP address

## Sharing the APK

After running `npm run android:build`, share the APK file located at:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

You can send this file to anyone to install on their Android device (they need to enable "Install from unknown sources").
