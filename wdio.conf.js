import fs from 'node:fs';
import path from 'node:path';

// Noor client ilovasi (app.buchet.go) — USB orqali ulangan haqiqiy telefonda.
// Ilova telefonda o'rnatilgan va tizimga kirilgan bo'lishi kerak (noReset: login saqlanadi).
// Boshqa APK ni o'rnatib test qilish:  $env:APP="noor.apk"; npm test   (apps\noor.apk)
const APP = process.env.APP;
const PACKAGE = 'app.buchet.go';

const appCaps = APP
    ? { 'appium:app': path.resolve('apps', APP) }
    : { 'appium:appPackage': PACKAGE, 'appium:appActivity': `${PACKAGE}.MainActivity` };

export const BUGS_FILE = path.resolve('reports', 'bugs.log');

export const config = {
    runner: 'local',
    // Qat'iy tartib (foydalanuvchi talabi): avtorizatsiya → Delivery → Eats → qolganlari.
    // 01-auth hali yozilmagan — fayl paydo bo'lganda ro'yxatga avtomatik kiradi
    specs: [
        './test/specs/01-auth.e2e.js',
        './test/specs/02-delivery.e2e.js',
        './test/specs/03-eats.e2e.js',
        './test/specs/04-home.e2e.js',
        './test/specs/05-account.e2e.js',
        './test/specs/06-orders.e2e.js',
        './test/specs/07-language.e2e.js',
        // Sessiya barqarorligi — eng oxirida (telefon sozlamalarini vaqtincha o'zgartiradi)
        './test/specs/08-session.e2e.js',
    ].filter(f => fs.existsSync(f)),
    // Eski namuna (Android Settings ilovasi uchun) — client testlariga tegishli emas
    exclude: ['./test/specs/smoke.e2e.js'],
    maxInstances: 1,

    // Appium serverni WebdriverIO o'zi ishga tushiradi va to'xtatadi
    port: 4723,
    services: [['appium', { command: 'appium', args: { relaxedSecurity: true } }]],

    capabilities: [{
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        // Bitta telefon ulangan bo'lsa udid shart emas; bir nechta bo'lsa: $env:DEVICE_UDID="21221FDEE001SB"
        ...(process.env.DEVICE_UDID ? { 'appium:udid': process.env.DEVICE_UDID } : {}),
        'appium:deviceName': 'Android',
        'appium:noReset': true,            // ilova ma'lumotlari (login) o'chirilmaydi
        'appium:autoGrantPermissions': true,
        'appium:newCommandTimeout': 240,
        // Tezlik: xarita doim animatsiyada — UiAutomator2 har buyruqdan oldin ilova "tinchlanishini" (standart 10 s gacha)
        // kutmasin; tizim animatsiyalari o'chiriladi
        'appium:settings[waitForIdleTimeout]': 100,
        'appium:disableWindowAnimation': true,
        ...appCaps,
    }],

    logLevel: 'warn',
    waitforTimeout: 20000,
    connectionRetryTimeout: 180000,
    connectionRetryCount: 1,

    framework: 'mocha',
    reporters: ['spec'],
    mochaOpts: { ui: 'bdd', timeout: 900000 },

    onPrepare() {
        fs.mkdirSync('reports', { recursive: true });
        fs.mkdirSync('screenshots', { recursive: true });
        fs.writeFileSync(BUGS_FILE, '');
    },

    // Test yiqilsa — skrinshot screenshots/ papkasiga
    // Tezlik: kodagi barcha qat'iy kutishlar (driver.pause) shu koeffitsientga ko'paytiriladi.
    // Standart 0.6 (40% qisqaroq). Biror joy buzilsa: $env:PAUSE_FACTOR='1' — eski holat
    async before() {
        // Ekran kengligi — testlardagi piksel qiymatlarini moslashtirish uchun (px() yordamchisi)
        globalThis.__SCREEN_W = (await browser.getWindowSize()).width;
        console.log(`Ekran: ${globalThis.__SCREEN_W}px kenglik (masshtab ${(globalThis.__SCREEN_W / 1440).toFixed(2)})`);
        const factor = Number(process.env.PAUSE_FACTOR || 0.6);
        browser.overwriteCommand('pause', async (origPause, ms = 1000) => origPause(Math.max(300, Math.round(ms * factor))));
    },

    afterTest: async function (test, context, { passed }) {
        if (!passed) {
            const name = test.title.replace(/[^a-z0-9]+/gi, '_');
            await browser.saveScreenshot(`./screenshots/${name}_${Date.now()}.png`);
        }
    },

    // Oxirida topilgan buglar ro'yxati
    onComplete() {
        const bugs = fs.existsSync(BUGS_FILE) ? fs.readFileSync(BUGS_FILE, 'utf8').trim() : '';
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log(bugs ? `⚠ TOPILGAN BUGLAR:\n${bugs}` : '✓ Bug topilmadi');
        console.log('═══════════════════════════════════════════════════════════\n');
    },
};
