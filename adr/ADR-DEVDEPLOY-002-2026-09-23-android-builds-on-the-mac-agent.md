# ADR-DEVDEPLOY-002: Android builds run on the Mac agent; APKs install to a phone via adb on the Pi

Date: 2026-09-23

## Status

Accepted.

## Context

`Platform.ANDROID` and artifact kind `apk` already existed in `core`, but no
provider claimed Android, so an Android profile could never be dispatched.
Sean asked to build out Android support (his word was "andronium"; no
project by that name exists in his workspace, ADRs, or memory, so per
ADR-GLOBAL-002 it was asked directly and he chose "Android support in
DevDeploy").

Where can an Android build actually run?

- **Pi 5 (LOCAL_PI / LOCAL_CONTAINER):** Google ships no aarch64-Linux Android
  SDK build-tools (`aapt2` and friends are x86_64), so a native Gradle Android
  build there is fragile, and an x86_64 image under emulation is slow while
  sharing the CPU/RAM of the live family kiosk (see ADR-DEVDEPLOY-001,
  decision 4).
- **Mac agent (MAC_XCODE worker):** Apple-silicon macOS has a fully supported
  Android SDK, and MacinCloud's image advertises Android Studio support.
  Sean already pays for this machine (period runs to 2026-10-12).
- **Expo EAS cloud:** viable later; needs an EAS token on the Pi. Out of scope.

## Decisions

1. **The remote agent builds Android too.** `MacXcodeProvider.canHandle`
   accepts `ANDROID` when the agent reports `hasAndroidSdk` and `hasJava`.
   The provider type keeps its name `MAC_XCODE` — renaming would invalidate
   stored `workers.json` entries and memory for no behavioral gain; it is
   documented as "the Mac agent worker".
2. **Existing cost rule applies unchanged.** The MacinCloud worker is
   `costSensitive`, so an Android profile must set
   `requireCostAuthorization: true` to be dispatched there. Android does not
   get a back door around "never silently incur paid cloud time".
3. **Debug-signed release APK.** `expo prebuild --platform android` produces a
   project whose `release` variant is signed with the template debug keystore,
   so `assembleRelease` yields an APK that installs on a device with no
   keystore management. `signed` is reported `false` (not a Play-Store-grade
   signature). A production keystore is a separate future decision.
4. **The agent learns the job's platform.** `createJob` now sends `platform`;
   the agent branches build/export per platform. iOS-only steps
   (CocoaPods, the expo-modules-jsi patches from ADR-HEARTH-031) are not run
   for Android.
5. **Install tool lives on the Pi, not the Mac.** A phone is plugged into the
   Pi (ADR-HEARTH-043, feedback_pi5_dev_target), and a cloud Mac has no USB
   passthrough. `POST /api/android/install/:artifactId` runs
   `adb install -r` on the Pi (only for `apk` artifacts; optional `serial`
   in the body when more than one phone is ready); `GET /api/android/devices`
   lists connected devices. `adb` must be installed on the Pi (Debian trixie package `adb`, installed 2026-09-23).

## Consequences

- One pipeline serves both mobile platforms; Android adds two agent step
  modules and a Pi-side installer, no new provider class.
- The Gradle build is **untested end-to-end until the Mac is unlocked** and
  Android tooling is confirmed present there; unit tests cover the pure logic
  (APK discovery, capability parsing, adb output parsing).
- Android builds on the MacinCloud box consume paid session time like iOS
  builds do.
