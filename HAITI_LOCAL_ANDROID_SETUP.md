# Haiti Inji Wallet 0.20.0 — Local Android validation

## Scope
This branch is based on the existing `v0.20.0` release tag, not `master`.
- `.env` contains the Haiti Mimoto and eSignet base hosts.
- `APPLICATION_LANGUAGE=fr`.
- `i18n.ts` restricts selection, initialization and fallback to French.
- `locales/fr.json` covers the complete English locale key set (763 strings), preserving interpolation placeholders.

## Haiti URLs
- Mimoto base host: `https://injiweb.haiti-pilot.mosip.net`
- Mimoto public API path: `https://injiweb.haiti-pilot.mosip.net/v1/mimoto`
- eSignet host: `https://esignet.haiti-pilot.mosip.net` (validate public reachability and certificate before production)
- Inji Certify issuer: `https://injicertify.haiti-pilot.mosip.net`
- Inji Certify discovery: `https://injicertify.haiti-pilot.mosip.net/v1/certify/issuance/.well-known/openid-credential-issuer`
- Inji Verify: `https://injiverify.haiti-pilot.mosip.net`

The wallet's `MIMOTO_HOST` points to the base host, as in the upstream wallet configuration. It is **not** the Certify URL; available issuers are discovered through Mimoto.

## Windows prerequisites
1. Install Git, Android Studio, **JDK 17** and **Node.js 18.17.1** (npm 8.19.3).
2. In Android Studio SDK Manager, install Android SDK Platform **35**, Build-Tools **35.0.0**, NDK **21.4.7075529** and Android SDK Platform-Tools.
3. In **Settings > About phone**, enable developer mode, then enable USB debugging.
4. Connect the phone via USB, approve the device's RSA debugging prompt, and check `adb devices` (status must be `device`).

## Check out the working branch
Run in PowerShell:

```powershell
cd C:\mosip
git clone --branch feature/haiti-0.20.0-fr-local-test https://github.com/Manas0606/inji-wallet.git
cd inji-wallet
node --version
npm --version
java -version
adb devices
```

If the folder is already cloned, use `git fetch origin` then `git switch feature/haiti-0.20.0-fr-local-test`.

## Android SDK setup
Create `android/local.properties` if Android Studio has not already created it. Example (replace username):

```properties
sdk.dir=C:\\Users\\YOUR_WINDOWS_USERNAME\\AppData\\Local\\Android\\Sdk
```

Use **Android Studio > Open > project/android** and select **JDK 17** as the Gradle JDK.

## Install and run on USB-connected Android phone
From the repository root:

```powershell
npm install
adb devices
npm run android:mosip
```

A successful `npm run android:mosip` starts the Metro bundler and installs the `residentappDebug` variant on the connected device. If the app still uses stale environment settings, stop Metro and run:

```powershell
npx react-native start --reset-cache
```

Then run `npm run android:mosip` in a second terminal.

## Build an APK without publishing
From the repository root:

```powershell
cd android
.\gradlew.bat :app:assembleResidentappDebug
```

Find the APK(s) inside `android/app/build/outputs/apk/residentapp/debug/`. The project enables architecture-specific APKs and a universal APK.

Use `adb install -r <actual-apk-path>` to install the relevant debug APK if needed.

## Test scenarios
1. Setup screens, prompts, menus and credential labels are in French.
2. Mimoto issuer discovery works.
3. Download a test Haiti credential using the configured eSignet login.
4. Check name, DOB, gender, photo, phone, separate address lines, department, commune, locality and postal code.
5. Check credential QR sharing and Inji Verify interoperability.
6. Check offline behavior and permission prompts.

## Notes / deployment dependencies
- The phone needs internet access and valid TLS certificates for all public Haiti hosts.
- eSignet hostname and OAuth compatibility must be verified against the live environment; this branch has not been run on a connected phone.
- The existing `GOOGLE_ANDROID_CLIENT_ID='<client_id>'` is a placeholder. Google backup requires registering an Android OAuth client with the correct package name and signing certificate.
- A local debug APK does not prove a release signing configuration is ready.
- No APK has been built by this commit; installation requires running the steps on the user's laptop.
