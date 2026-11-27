import { byDesc, byDescHas, restartApp, openTab, screenSize, allByDesc } from '../support/app.js';

// Tilni almashtirib, pastki menyu va akkaunt bo'limi tarjima qilinganini tekshiradi.
// Oxirida til o'zbekchaga qaytariladi.
async function bottomTabs() {
    // Pastki menyu: ekran pastidagi, kengligi ekranning ~1/4 qismi bo'lgan 4 ta ikonka
    // (restoran kartalari ham ImageView, lekin ular kengroq va ko'p qatorli)
    const { width, height } = await screenSize();
    const els = await $$('android=new UiSelector().className("android.widget.ImageView").clickable(true)');
    const out = [];
    for (const el of els) {
        const { y } = await el.getLocation();
        const size = await el.getSize();
        const desc = (await el.getAttribute('content-desc')) || '';
        // tab balandligi ~5% (restoran kartasi ancha baland), joylashuvi ekranning eng pastida
        if (y > height * 0.85 && size.height < height * 0.07 && size.width > width * 0.2 && size.width < width * 0.3 && !desc.includes('\n')) out.push(desc);
    }
    return out;
}

// Yuqori chapdagi "orqaga" tugmasi (nomi tilga qarab: Orqaga / Назад / Back)
async function pressTopBack() {
    for (const b of await $$('android.widget.Button')) {
        const { x, y } = await b.getLocation();
        if (x < 250 && y < 450) { await b.click(); await driver.pause(1500); return true; }
    }
    return false;
}

async function openLanguageScreen() {
    // Akkaunt tabi — pastki menyuning 4-tabi (nomi tilga qarab o'zgaradi)
    const { width, height } = await screenSize();
    await driver.execute('mobile: clickGesture', { x: Math.round(width * 0.875), y: Math.round(height * 0.917) });
    await driver.pause(1500);
    // "Til" / "Язык" / "Language"
    for (const name of ['Til', 'Язык', 'Language']) {
        const el = byDesc(name);
        if (await el.isDisplayed().catch(() => false)) { await el.click(); await driver.pause(1500); return; }
    }
    throw new Error('Til bo\'limi topilmadi');
}

describe('5. Til almashtirish', () => {
    before(async () => {
        await restartApp();
    });

    after(async () => {
        // Har qanday holatda o'zbekchaga qaytaramiz
        await restartApp().catch(() => {});
        await openLanguageScreen().catch(() => {});
        const uz = byDescHas("O'zbek tili");
        if (await uz.isDisplayed().catch(() => false)) await uz.click();
        await driver.pause(1500);
    });

    for (const [lang, expectTabs] of [
        ['Русский', /[А-Яа-я]/],
        ['English', /^[A-Za-z ]+$/],
    ]) {
        it(`${lang}: pastki menyu va akkaunt bo'limi tarjima qilingan`, async () => {
            await openLanguageScreen();
            await byDescHas(lang).click();
            await driver.pause(2500);
            await pressTopBack();
            const tabs = await bottomTabs();
            console.log(`    ${lang} tablari: ${tabs.join(', ')}`);
            expect(tabs.length).toBe(4);
            for (const t of tabs) expect(t).toMatch(expectTabs);
            expect(tabs).not.toContain('Akkaunt');
        });
    }

    it("O'zbek tiliga qaytadi", async () => {
        await openLanguageScreen();
        await byDescHas("O'zbek tili").click();
        await driver.pause(2500);
        await pressTopBack();
        expect(await bottomTabs()).toEqual(['Bosh sahifa', 'Buyurtmalar', 'Sevimlilar', 'Akkaunt']);
        expect((await allByDesc('Akkaunt')).length).toBeGreaterThan(0);
    });
});
