// Noor client (Flutter) uchun umumiy yordamchilar.
// Flutter elementlari matnni content-desc (accessibility) da saqlaydi, shuning uchun
// asosan UiSelector().description*() bilan qidiramiz. Ko'p qatorli desc'lar "\n" bilan ajratilgan.
import fs from 'node:fs';
import path from 'node:path';

export const PACKAGE = 'app.buchet.go';

// Piksel qiymatlari Pixel 6 Pro (kenglik 1440) uchun yozilgan — boshqa ekranda kenglikka qarab moslashtiriladi.
// Ekran kengligi wdio.conf before() da globalThis.__SCREEN_W ga yoziladi
export const px = n => Math.round(n * (globalThis.__SCREEN_W || 1440) / 1440);
const q = s => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

// .instance(0) — bir xil yozuv ekranda ikki joyda bo'lsa (masalan sarlavha va pastki tab), birinchisini oladi
export const byDesc = d => $(`android=new UiSelector().description("${q(d)}").instance(0)`);
export const byDescStart = d => $(`android=new UiSelector().descriptionStartsWith("${q(d)}").instance(0)`);
export const byDescHas = d => $(`android=new UiSelector().descriptionContains("${q(d)}").instance(0)`);
export const allByDescStart = d => $$(`android=new UiSelector().descriptionStartsWith("${q(d)}")`);
export const allByDesc = d => $$(`android=new UiSelector().description("${q(d)}")`);

// Topilgan bug: test yiqilmaydi, lekin logga va oxirgi xulosaga yoziladi
export function softBug(message) {
    console.log(`    ⚠ BUG: ${message}`);
    fs.mkdirSync('reports', { recursive: true });
    fs.appendFileSync(path.resolve('reports', 'bugs.log'), `• ${message}\n`);
}

// Ilovadagi Alice inspektori (ko'k "bug" tugmasi) orqali oxirgi API so'rovini o'qiydi va faylga yozadi.
// method/pathRe — qidiriladigan so'rov (masalan 'POST', /^\/api\/v1\/orders$/). Qaytaradi: { summary, file } yoki null
export async function captureApi(method, pathRe, label = 'api') {
    const allDescs = async () => {
        const out = [];
        for (const e of await $$('//*')) {
            const d = (await e.getAttribute('content-desc').catch(() => '')) || '';
            const t = (await e.getAttribute('text').catch(() => '')) || '';
            for (const v of [d, t]) if (v && !out.includes(v)) out.push(v);
        }
        return out;
    };
    try {
        // Modal oynalar (masalan buyurtma formasi) ustida tugma accessibility daraxtida ko'rinmaydi —
        // topilmasa orqaga qaytib qayta qidiramiz (ilova o'chirilmaydi, Alice jurnali saqlanadi)
        const bubble = await $('android=new UiSelector().descriptionMatches("[0-9]+").instance(0)');
        for (let i = 0; i < 3 && !(await bubble.isExisting().catch(() => false)); i++) {
            await driver.back(); await driver.pause(1500);
        }
        if (!(await bubble.isExisting())) { console.log('    Alice tugmasi topilmadi'); return null; }
        await bubble.click();
        await byDesc('Alice - Inspector').waitForExist({ timeout: 8000 });
        let item = null;
        for (const e of await $$(`android=new UiSelector().descriptionStartsWith("${method}\n")`)) {
            const p = (await e.getAttribute('content-desc')).split('\n')[1];
            if (pathRe.test(p)) { item = e; break; } // ro'yxat yangidan eskiga — birinchisi eng oxirgi so'rov
        }
        if (!item) { console.log(`    Alice: ${method} ${pathRe} so'rovi topilmadi`); await driver.back(); return null; }
        const summary = (await item.getAttribute('content-desc')).replace(/\n/g, ' | ');
        await item.click();
        await driver.pause(2000);
        const parts = [`# ${summary}`, '## Umumiy', ...(await allDescs())];
        // Request / Response yorliqlari
        for (const tab of ['Request', "So'rov", 'Response', 'Javob']) {
            const t = await $(`android=new UiSelector().descriptionContains("${tab}").instance(0)`);
            if (await t.isExisting().catch(() => false)) {
                await t.click().catch(() => {}); await driver.pause(1500);
                parts.push(`## ${tab}`, ...(await allDescs()));
            }
        }
        fs.mkdirSync('reports', { recursive: true });
        const file = path.resolve('reports', `${label}-${Date.now()}.txt`);
        fs.writeFileSync(file, parts.join('\n'));
        await driver.saveScreenshot(file.replace(/\.txt$/, '.png')).catch(() => {});
        console.log(`    Alice: ${summary} → ${file}`);
        for (let i = 0; i < 2; i++) { await driver.back(); await driver.pause(800); }
        return { summary, file };
    } catch (e) {
        console.log(`    Alice'dan o'qib bo'lmadi: ${String(e).split('\n')[0]}`);
        return null;
    }
}

export async function screenSize() {
    return driver.getWindowSize();
}

// Ilovani noldan ochadi (login saqlangan) va "Yetkazib berish manzili" so'rovini yopadi
export async function restartApp() {
    await driver.terminateApp(PACKAGE);
    await driver.activateApp(PACKAGE);
    await dismissAddressPrompt();
    // Boshqa ilova (masalan kuryer ilovasi yangi buyurtma bilan) oldinga chiqib olgan bo'lsa — qaytamiz
    if ((await driver.getCurrentPackage()) !== PACKAGE) {
        await driver.activateApp(PACKAGE);
        await dismissAddressPrompt();
    }
    await expect(byDesc('Bosh sahifa')).toBeDisplayed({ wait: 30000 });
}

// Shu telefondagi kuryer ilovasi yangi buyurtma kelganda (boshqa testerlarniki ham) oldinga chiqib oladi —
// client ilovada amal qilishdan oldin uni qaytaramiz
export async function ensureClient() {
    if ((await driver.getCurrentPackage()) !== PACKAGE) {
        await driver.activateApp(PACKAGE);
        await driver.pause(1500);
    }
}

// Akkaunt, buyurtmalar va savat testlari tizimga kirilgan foydalanuvchini talab qiladi
export async function assertLoggedIn() {
    await openTab('Akkaunt');
    if (await byDesc('Akkauntingizga kiring').isDisplayed().catch(() => false)) {
        throw new Error('Ilovada tizimga kirilmagan ("Akkauntingizga kiring"). Telefonda Noor ilovasiga SMS kod bilan kiring va testni qayta ishga tushiring.');
    }
    await expect(byDescHas('+998')).toBeDisplayed();
    await openTab('Bosh sahifa');
}

export async function dismissAddressPrompt() {
    const keep = byDesc('Qoldirish');
    if (await keep.waitForDisplayed({ timeout: 10000 }).catch(() => false)) await keep.click();
}

// Pastki menyu tabi (Bosh sahifa / Buyurtmalar / Sevimlilar / Akkaunt).
// "Buyurtmalar" Akkaunt ro'yxatida ham bor, shuning uchun ekranning eng pastidagisini tanlaymiz.
export async function openTab(name) {
    const { height } = await screenSize();
    for (const el of await allByDesc(name)) {
        const { y } = await el.getLocation();
        if (y > height * 0.8) { await el.click(); await driver.pause(1500); return; }
    }
    throw new Error(`Pastki menyuda "${name}" tabi topilmadi`);
}

export async function goBack() {
    const btn = byDesc('Orqaga');
    if (await btn.isDisplayed().catch(() => false)) await btn.click();
    else await driver.back();
    await driver.pause(1200);
}

// Ekran bo'ylab surish (Flutter ro'yxatlari UiScrollable bilan ishlamaydi)
export async function swipe(direction = 'up', percent = 0.6) {
    const { width, height } = await screenSize();
    await driver.execute('mobile: swipeGesture', {
        left: width * 0.1, top: height * 0.25, width: width * 0.8, height: height * 0.5, direction, percent,
    });
    await driver.pause(800);
}

export async function scrollTo(getEl, max = 6) {
    for (let i = 0; i <= max; i++) {
        const el = await getEl();
        if (await el.isDisplayed().catch(() => false)) return el;
        await swipe('up', 0.5);
    }
    throw new Error('Element ekranni surib ham topilmadi');
}

// Koordinata bo'yicha bosish (yorlig'i yo'q ikonkalar uchun) — ekran ulushida
export async function tapAt(xRatio, yRatio) {
    const { width, height } = await screenSize();
    await driver.execute('mobile: clickGesture', { x: Math.round(width * xRatio), y: Math.round(height * yRatio) });
    await driver.pause(1200);
}

// "1 010 so‘m" → 1010, "Bepul" → 0
export function money(text) {
    if (/bepul|tekin/i.test(text)) return 0;
    return Number(String(text).replace(/[^\d]/g, ''));
}

export async function descOf(el) {
    return (await el.getAttribute('content-desc')) || '';
}
