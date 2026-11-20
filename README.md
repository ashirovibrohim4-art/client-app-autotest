# Android avtotestlar (WebdriverIO + Appium)

## Tuzilma
```
autotest/
├─ wdio.conf.js              # asosiy sozlama (qurilma, ilova, Appium)
├─ apps/                     # APK fayllar shu yerga
├─ screenshots/              # yiqilgan test skrinshotlari
└─ test/
   ├─ pageobjects/           # ekranlar (Page Object)
   │  └─ settings.page.js    # namuna
   └─ specs/                 # testlar
      └─ smoke.e2e.js        # muhitni tekshiruvchi namuna test
```

## Bir martalik sozlash (PowerShell)
```powershell
[Environment]::SetEnvironmentVariable('ANDROID_HOME','D:\Android','User')
[Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT','D:\Android','User')
```
Keyin VS Code va terminalni qayta oching.

## Ishga tushirish
```powershell
npm run test:smoke                 # Settings ilovasida muhitni tekshirish
$env:APP="myapp.apk"; npm test     # apps\myapp.apk ilovasini test qilish
```
Emulyator (Pixel_7) yopiq bo'lsa, Appium uni o'zi yoqadi.

## Elementlarni topish (Appium Inspector)
1. `npm run inspector` — Appium serverni yoqadi.
2. Appium Inspector'da Remote Host `127.0.0.1`, Port `4723`.
3. Capabilities:
```json
{
  "platformName": "Android",
  "appium:automationName": "UiAutomator2",
  "appium:deviceName": "emulator-5554"
}
```

## Selektorlar
| Usul | Misol |
|---|---|
| Accessibility id | `$('~login_button')` |
| Resource id | `$('id=com.myapp:id/login')` |
| Matn | `$('android=new UiSelector().text("Kirish")')` |
| XPath (oxirgi chora) | `$('//android.widget.Button[@text="Kirish"]')` |
