import path from 'node:path';

// APK tayyor bo'lganda: apps/ papkasiga qo'ying va APP o'zgaruvchisini bering:
//   $env:APP="app-debug.apk"; npm test
const APP = process.env.APP;

const appCaps = APP
    ? { 'appium:app': path.resolve('apps', APP) }
    : {
        // Ilova hali yo'q — muhitni tekshirish uchun Android Settings ilovasi
        'appium:appPackage': 'com.android.settings',
        'appium:appActivity': '.Settings',
    };

export const config = {
    runner: 'local',
    specs: ['./test/specs/**/*.js'],
    maxInstances: 1,

    // Appium serverni WebdriverIO o'zi ishga tushiradi va to'xtatadi
    port: 4723,
    services: [['appium', { command: 'appium', args: { relaxedSecurity: true } }]],

    capabilities: [{
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        'appium:deviceName': process.env.DEVICE || 'Android Emulator',
        'appium:avd': process.env.AVD || 'Pixel_7',   // emulyator yopiq bo'lsa o'zi yoqadi
        'appium:avdLaunchTimeout': 180000,
        'appium:newCommandTimeout': 240,
        'appium:autoGrantPermissions': true,
        ...appCaps,
    }],

    logLevel: 'warn',
    waitforTimeout: 30000,
    connectionRetryTimeout: 300000,
    connectionRetryCount: 1,

    framework: 'mocha',
    reporters: ['spec'],
    mochaOpts: { ui: 'bdd', timeout: 120000 },

    // Test yiqilsa — skrinshot screenshots/ papkasiga
    afterTest: async function (test, context, { passed }) {
        if (!passed) {
            const name = test.title.replace(/[^a-z0-9]+/gi, '_');
            await browser.saveScreenshot(`./screenshots/${name}_${Date.now()}.png`);
        }
    },
};
