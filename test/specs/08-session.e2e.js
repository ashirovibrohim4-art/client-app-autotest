import { byDesc, byDescHas, PACKAGE, openTab, dismissAddressPrompt, softBug } from '../support/app.js';

// 8. Sessiya barqarorligi — ilova hech qaysi holatda akkauntdan chiqarib yubormasligi kerak.
// Telefon va tizim holatlari adb (mobile: shell) orqali yaratiladi, har biridan keyin Akkaunt tabida
// telefon raqami borligi tekshiriladi. Oxirida barcha sozlamalar asl holiga qaytariladi.
// Eng oxirgi spec bo'lib ishlaydi (wdio.conf.js da 08). Telefonni qayta yoqish va ilovani qayta o'rnatish
// bu yerda yo'q: ular Appium sessiyasini uzadi — qo'lda tekshirilgan (2026-11-27, sessiya saqlandi).

const sh = (command, ...args) => driver.execute('mobile: shell', { command, args, timeout: 60000 }).catch(e => `XATO: ${e.message}`);
const launch = async () => { await driver.activateApp(PACKAGE); await driver.pause(3000); await dismissAddressPrompt(); };
const coldStart = async () => { await driver.terminateApp(PACKAGE); await launch(); };
const toBackground = async () => { await sh('input', 'keyevent', 'KEYCODE_HOME'); await driver.pause(2000); };

let loggedOut = false;

// Akkaunt tabida "+998 …" bo'lsa — sessiya joyida; "Akkauntingizga kiring" bo'lsa — chiqarib yuborilgan
async function expectStillLoggedIn(caseName) {
    if ((await driver.getCurrentPackage()) !== PACKAGE) await launch();
    await dismissAddressPrompt();
    await expect(byDesc('Bosh sahifa')).toBeDisplayed({ wait: 30000 });
    await openTab('Akkaunt');
    const out = await byDesc('Akkauntingizga kiring').isDisplayed().catch(() => false);
    const phone = await byDescHas('+998').isDisplayed().catch(() => false);
    if (out || !phone) {
        loggedOut = true;
        softBug(`Sessiya: "${caseName}" holatidan keyin ilova akkauntdan chiqarib yubordi`);
        throw new Error(`"${caseName}" dan keyin akkauntdan chiqib ketdi — qolgan holatlar uchun qayta kirish kerak (SMS kod)`);
    }
    console.log(`    ✓ ${caseName}: sessiya saqlandi`);
    await openTab('Bosh sahifa');
}

describe('8. Sessiya — ilova akkauntdan chiqarib yubormasligi kerak', () => {
    before(async () => {
        await launch();
        await openTab('Akkaunt');
        if (await byDesc('Akkauntingizga kiring').isDisplayed().catch(() => false)) {
            throw new Error('Ilovada tizimga kirilmagan — avval 01-auth yoki qo\'lda SMS kod bilan kiring');
        }
        await openTab('Bosh sahifa');
    });

    beforeEach(function () {
        if (loggedOut) this.skip();
    });

    // Har qanday holatda telefon sozlamalari tiklanadi
    after(async () => {
        await sh('settings', 'put', 'global', 'auto_time', '1');
        await sh('svc', 'wifi', 'enable');
        await sh('svc', 'data', 'enable');
        await sh('cmd', 'connectivity', 'airplane-mode', 'disable');
        await sh('dumpsys', 'deviceidle', 'unforce');
        await sh('am', 'set-standby-bucket', PACKAGE, 'active');
        await sh('cmd', 'power', 'set-mode', '0');
        await sh('settings', 'put', 'global', 'always_finish_activities', '0');
        await sh('settings', 'put', 'system', 'user_rotation', '0');
        await sh('cmd', 'uimode', 'night', 'no');
        await sh('settings', 'put', 'system', 'font_scale', '1.0');
        for (const p of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'POST_NOTIFICATIONS']) await sh('pm', 'grant', PACKAGE, `android.permission.${p}`);
        await launch().catch(() => {});
    });

    it('S1: ilovani majburan yopib qayta ochish', async () => {
        await coldStart();
        await expectStillLoggedIn('force-stop + qayta ochish');
    });

    it('S2: fondagi ilovani tizim o\'chiradi (xotira yetishmasligi)', async () => {
        await toBackground();
        await sh('am', 'kill', PACKAGE);
        await launch();
        await expectStillLoggedIn('fon + am kill');
    });

    it('S3: xotirani tozalash signali (trim-memory COMPLETE)', async () => {
        await toBackground();
        await sh('am', 'send-trim-memory', PACKAGE, 'COMPLETE');
        await launch();
        await expectStillLoggedIn('trim-memory COMPLETE');
    });

    it('S4: internetsiz ochish, keyin internet qaytadi', async () => {
        await driver.terminateApp(PACKAGE);
        await sh('svc', 'wifi', 'disable'); await sh('svc', 'data', 'disable');
        await driver.pause(3000);
        await launch();
        await driver.pause(20000);
        await sh('svc', 'wifi', 'enable'); await sh('svc', 'data', 'enable');
        await driver.pause(8000);
        await expectStillLoggedIn('offline start → online');
    });

    it('S5: ilova ochiq turganda internet 40 s uziladi', async () => {
        await launch();
        await sh('svc', 'wifi', 'disable'); await sh('svc', 'data', 'disable');
        await driver.pause(40000);
        await sh('svc', 'wifi', 'enable'); await sh('svc', 'data', 'enable');
        await driver.pause(8000);
        await expectStillLoggedIn('internet uzilishi (40 s)');
    });

    it('S6: samolyot rejimi (30 s)', async () => {
        await sh('cmd', 'connectivity', 'airplane-mode', 'enable');
        await driver.pause(30000);
        await sh('cmd', 'connectivity', 'airplane-mode', 'disable');
        await driver.pause(10000);
        await expectStillLoggedIn('samolyot rejimi');
    });

    it('S7: telefon uyqu rejimi (Doze, 60 s)', async () => {
        await sh('input', 'keyevent', 'KEYCODE_SLEEP');
        await sh('dumpsys', 'deviceidle', 'force-idle');
        await driver.pause(60000);
        await sh('dumpsys', 'deviceidle', 'unforce');
        await sh('input', 'keyevent', 'KEYCODE_WAKEUP');
        await sh('wm', 'dismiss-keyguard');
        await launch();
        await expectStillLoggedIn('Doze');
    });

    it('S8: ilova "restricted" standby holatida', async () => {
        await toBackground();
        await sh('am', 'set-standby-bucket', PACKAGE, 'restricted');
        await driver.pause(5000);
        await launch();
        await expectStillLoggedIn('standby restricted');
        await sh('am', 'set-standby-bucket', PACKAGE, 'active');
    });

    it('S9: quvvat tejash rejimi', async () => {
        await sh('cmd', 'power', 'set-mode', '1');
        await coldStart();
        await expectStillLoggedIn('quvvat tejash');
        await sh('cmd', 'power', 'set-mode', '0');
    });

    it('S10: "Don\'t keep activities" — fonga o\'tib qaytish', async () => {
        await sh('settings', 'put', 'global', 'always_finish_activities', '1');
        await toBackground();
        await launch();
        await expectStillLoggedIn('Don\'t keep activities');
        await sh('settings', 'put', 'global', 'always_finish_activities', '0');
    });

    it('S11: joylashuv ruxsati olib qo\'yiladi (tizim jarayonni o\'chiradi)', async () => {
        await sh('pm', 'revoke', PACKAGE, 'android.permission.ACCESS_FINE_LOCATION');
        await sh('pm', 'revoke', PACKAGE, 'android.permission.ACCESS_COARSE_LOCATION');
        await driver.pause(2000);
        await launch();
        await expectStillLoggedIn('joylashuv ruxsati olindi');
        await sh('pm', 'grant', PACKAGE, 'android.permission.ACCESS_FINE_LOCATION');
        await sh('pm', 'grant', PACKAGE, 'android.permission.ACCESS_COARSE_LOCATION');
    });

    it('S12: bildirishnoma ruxsati olib qo\'yiladi', async () => {
        await sh('pm', 'revoke', PACKAGE, 'android.permission.POST_NOTIFICATIONS');
        await driver.pause(2000);
        await launch();
        await expectStillLoggedIn('bildirishnoma ruxsati olindi');
        await sh('pm', 'grant', PACKAGE, 'android.permission.POST_NOTIFICATIONS');
    });

    it('S13–S15: ekran burilishi, tungi rejim, shrift o\'lchami', async () => {
        await sh('settings', 'put', 'system', 'accelerometer_rotation', '0');
        await sh('settings', 'put', 'system', 'user_rotation', '1');
        await driver.pause(4000);
        await sh('settings', 'put', 'system', 'user_rotation', '0');
        await sh('cmd', 'uimode', 'night', 'yes');
        await driver.pause(4000);
        await sh('cmd', 'uimode', 'night', 'no');
        await sh('settings', 'put', 'system', 'font_scale', '1.3');
        await driver.pause(4000);
        await sh('settings', 'put', 'system', 'font_scale', '1.0');
        await driver.pause(3000);
        await expectStillLoggedIn('burilish / tungi rejim / shrift');
    });

    it('S16: kesh tozalanadi (pm trim-caches)', async () => {
        await driver.terminateApp(PACKAGE);
        await sh('pm', 'trim-caches', '999G');
        await launch();
        await expectStillLoggedIn('kesh tozalash');
    });

    it('S17–S18: telefon soati 2 va 10 kun oldinga (token muddati)', async () => {
        await sh('settings', 'put', 'global', 'auto_time', '0');
        for (const days of [2, 10]) {
            const now = Number(String(await sh('date', '+%s')).trim());
            const target = (Math.round(Date.now() / 1000) + days * 86400) * 1000;
            await sh('cmd', 'alarm', 'set-time', String(Number.isFinite(now) && now > 0 ? (now + days * 86400) * 1000 : target));
            console.log(`    telefon vaqti: ${String(await sh('date')).trim()}`);
            await coldStart();
            await expectStillLoggedIn(`soat +${days} kun (sovuq start)`);
            // Buyurtmalar serverdan yuklanishi — token haqiqatan ishlayapti
            await openTab('Buyurtmalar');
            await expect(byDescHas('Buyurtmalar ro')).toBeDisplayed({ wait: 20000 });
            await openTab('Bosh sahifa');
            await sh('settings', 'put', 'global', 'auto_time', '1');
            await driver.pause(5000);
            await sh('settings', 'put', 'global', 'auto_time', '0');
        }
        await sh('settings', 'put', 'global', 'auto_time', '1');
    });

    it('S19: uzoq fonda turish (token yangilanishi, 6 daqiqa)', async () => {
        await launch();
        await toBackground();
        await driver.pause(6 * 60 * 1000);
        await launch();
        // Fondan qaytgach bir nechta so'rov birdan ketadi (bosh sahifa + buyurtmalar) — refresh poygasi
        await openTab('Buyurtmalar');
        await openTab('Akkaunt');
        await openTab('Bosh sahifa');
        await expectStillLoggedIn('6 daqiqa fonda');
    });

    it('S20: ilova tilini almashtirish (ilova o\'zini qayta ishga tushiradi)', async () => {
        await openTab('Akkaunt');
        await byDesc('Til').click();
        await byDescHas('Русский').click();
        await driver.pause(8000);
        await launch();
        await byDesc('Оставить').click().catch(() => {});
        await openTab('Аккаунт');
        const ok = await byDescHas('+998').isDisplayed().catch(() => false);
        // O'zbekchaga qaytarish
        await byDesc('Язык').click();
        await byDescHas('O\'zbek tili').click();
        await driver.pause(8000);
        await launch();
        if (!ok) { loggedOut = true; softBug('Sessiya: til almashtirilganda ilova akkauntdan chiqarib yubordi'); throw new Error('Til almashtirilganda akkauntdan chiqib ketdi'); }
        await expectStillLoggedIn('til almashtirish RU → UZ');
    });
});
