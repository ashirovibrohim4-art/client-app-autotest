// Kuryer ilovasi (Noor Drivers, com.delivery.noor) — test buyurtmalarini yakunlash uchun.
// Ilova shu telefonda o'rnatilgan va test kuryeri bilan kirilgan bo'lishi kerak (test kodi 555555).
// Interfeysi ruscha. Oqim:
//   "Примите новый заказ" → [Принять] (bosiladi)
//   → surma tugmalar: Прибыл к отправителю → Забрать продукт → Прибыл к получателю → Доставлено
// Test serverda boshqa testerlarning buyurtmalari ham shu kuryerga tushadi (foydalanuvchi qoidasi):
//   • begona TAKLIF — ✕ bilan rad etiladi;
//   • tizim o'zi biriktirgan begona buyurtma — kuryer uni bekor qila olmaydi ("Отмена" faqat operator chatini
//     ochadi), shuning uchun u ham yetkazib yakunlanadi.
// Yangi buyurtma kelganda kuryer ilovasi o'zi oldinga chiqib oladi.
import { byDesc, byDescHas, byDescStart, px } from './app.js';

export const COURIER = 'com.delivery.noor';
const STEPS = ['Прибыл к отправителю', 'Забрать продукт', 'Прибыл к получателю', 'Доставлено'];
const sum = s => Number(String(s).replace(/[^\d]/g, ''));

// Test kuryeri: telefon va test OTP kodi (kuryer ilovasi test serverda doimiy 555555 kodini qabul qiladi)
const COURIER_PHONE = process.env.COURIER_PHONE || '997274471';
const COURIER_OTP = process.env.COURIER_OTP || '555555';
const shell = (...args) => driver.execute('mobile: shell', { command: 'input', args: args.map(String) });

// Kuryer ilovasi o'z-o'zidan tizimdan chiqib qolishi mumkin — test o'zi qayta kiradi
async function courierLogin() {
    console.log('    Kuryer ilovasi tizimdan chiqib qolgan — test kodi bilan qayta kirilyapti');
    const phone = await $('android.widget.EditText');
    await phone.click();
    await driver.pause(1000);
    await phone.clearValue().catch(() => {});
    await shell('text', COURIER_PHONE);
    await driver.pause(1000);
    await shell('keyevent', 111); // klaviaturani yopamiz (bu ekranda xavfsiz)
    await driver.pause(1500);
    // Rozilik belgisi — "Продолжая, вы соглашаетесь…" matnining chapida (yorlig'i yo'q)
    const terms = await byDescStart('Продолжая');
    const { y } = await terms.getLocation();
    const { width } = await driver.getWindowSize();
    await shell('tap', Math.round(width * 0.078), Math.round(y + px(60)));
    await driver.pause(1000);
    await byDesc('Продолжить').click();
    await driver.pause(4000);
    await shell('text', COURIER_OTP);
    await driver.pause(8000);
    if (await byDesc('Добро пожаловать!').isDisplayed().catch(() => false)) {
        throw new Error('Kuryer ilovasiga qayta kirib bo\'lmadi (Noor Drivers). Telefonda kuryer bilan kiring (test kodi 555555).');
    }
}

// Kuryer ilovasini ochadi (kerak bo'lsa qayta kiradi). online=true — oflayn bo'lsa "GO" bilan onlayn qiladi.
async function openCourier({ online = true } = {}) {
    await driver.activateApp(COURIER);
    if (await byDesc('Добро пожаловать!').waitForDisplayed({ timeout: 5000 }).catch(() => false)) await courierLogin();
    await closeBreakSheet();
    await dismissCashPrompt();
    if (online && (await byDescStart('ОФЛАЙН').isDisplayed().catch(() => false))) {
        console.log('    Kuryer onlayn qilindi ("GO")');
        await byDesc('GO').click();
        await driver.pause(3000);
    }
}

// "Перерыв курьера" oynasi ochiq qolgan bo'lsa yopamiz (fon — "Маска")
async function closeBreakSheet() {
    const mask = await byDesc('Маска');
    if (await mask.isDisplayed().catch(() => false)) { await mask.click(); await driver.pause(1500); }
}

// Kuryerni OFLAYN qiladi: client'da forma to'ldirilayotganda boshqa testerlarning takliflari kuryer ilovasini
// oldinga chiqarib client ekranini yopmasligi uchun. Yo'l: chap yuqoridagi qizil ⏹ → "Прекратить работу" surmasi.
// Kuryerda faol buyurtma bo'lsa oflayn qilinmaydi.
export async function courierOffline() {
    await openCourier({ online: false });
    // Taklif kelib turgan bo'lsa — begona, rad etamiz
    if (await byDesc('Принять').isDisplayed().catch(() => false)) await declineOffer();
    if (await byDescStart('ОФЛАЙН').isDisplayed().catch(() => false)) return;
    if (!(await byDescStart('ОНЛАЙН').isDisplayed().catch(() => false))) {
        console.log('    Kuryerda faol buyurtma bor — oflayn qilinmadi');
        return;
    }
    const { width, height } = await driver.getWindowSize();
    await shell('tap', Math.round(width * 0.12), Math.round(height * 0.092)); // qizil ⏹ (yorlig'i yo'q)
    const stop = await byDesc('Прекратить работу');
    if (!(await stop.waitForDisplayed({ timeout: 6000 }).catch(() => false))) { console.log('    "Прекратить работу" topilmadi'); return; }
    await swipeSlider(stop);
    await closeBreakSheet();
    console.log(`    Kuryer oflayn qilindi: ${await byDescStart('ОФЛАЙН').isDisplayed().catch(() => false) ? 'ha' : 'tekshirib bo\'lmadi'}`);
}

// Ekrandagi barcha content-desc'lar — BITTA so'rov bilan (page source). Har elementdan alohida so'rash 100+ HTTP
// chaqiruv (10–20 s) edi
export function descsFromSource(xml) {
    const unesc = s => s.replace(/&#10;/g, '\n').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const out = [];
    for (const m of xml.matchAll(/content-desc="([^"]*)"/g)) {
        const d = unesc(m[1]);
        if (d && d !== 'null') out.push(d);
    }
    return out;
}

async function texts() {
    return descsFromSource(await driver.getPageSource());
}

async function swipeSlider(el) {
    const { x, y } = await el.getLocation();
    const { width, height } = await el.getSize();
    const cy = Math.round(y + height / 2);
    await driver.execute('mobile: dragGesture', { startX: Math.round(x + width * 0.07), startY: cy, endX: Math.round(x + width * 0.98), endY: cy, speed: 2500 });
    await driver.pause(2200);
}

// Joriy (paneldagi) buyurtma raqami, yo'q bo'lsa ''
async function currentOrder() {
    // Buyurtma paneli — desc'da "#raqam" bor yagona element
    const panel = await $('android=new UiSelector().descriptionContains("#").instance(0)');
    if (!(await panel.isExisting().catch(() => false))) return '';
    return ((await panel.getAttribute('content-desc')).match(/#(\d+)/) || [])[1] || '';
}

// Ko'rinib turgan surma tugmani bitta o'tkazadi (panel yig'ilgan bo'lsa ochadi). Qaysi buyurtma va bosqich edi — qaytaradi.
async function driveOneStep() {
    for (let attempt = 0; attempt < 2; attempt++) {
        for (const step of STEPS) {
            const s = await byDesc(step);
            if (await s.isDisplayed().catch(() => false)) {
                const order = await currentOrder();
                const seen = await texts(); // kuryer shu bosqichda ko'rgan ma'lumot (manzil, izoh, podyezd, telefon)
                // texts() vaqt oladi — shu orada surma yangilanishi mumkin, shuning uchun qayta topamiz
                const s2 = await byDesc(step);
                if (!(await s2.isDisplayed().catch(() => false))) continue;
                try { await swipeSlider(s2); } catch { continue; }
                return { order, step, seen };
            }
        }
        const panel = await $('android=new UiSelector().descriptionContains("Свернуто").descriptionContains("#").instance(0)');
        if (await panel.isDisplayed().catch(() => false)) { await panel.click(); await driver.pause(2000); } else break;
    }
    return null;
}

async function dismissCashPrompt() {
    const noCash = await byDesc('Нет наличных');
    if (await noCash.isDisplayed().catch(() => false)) { await noCash.click(); await driver.pause(1500); }
}

// Begona taklifni rad etish: "Примите новый заказ" sarlavhasi qatoridagi o'ng ✕
async function declineOffer() {
    const title = await byDesc('Примите новый заказ').isDisplayed().catch(() => false)
        ? await byDesc('Примите новый заказ') : await byDesc('Заказ с оплатой наличными');
    const { y } = await title.getLocation();
    const { height } = await title.getSize();
    const { width } = await driver.getWindowSize();
    await driver.execute('mobile: clickGesture', { x: Math.round(width * 0.91), y: Math.round(y + height / 2) });
    await driver.pause(2500);
}

// 1) O'zimizning buyurtma taklifini kutadi va qabul qiladi. Shu orada:
//    begona takliflar rad etiladi, kuryerga biriktirilgan begona buyurtmalar yetkazib yakunlanadi.
// keep — o'zimizning boshqa (allaqachon qabul qilingan) buyurtmalarimiz: ular begona deb yetkazilmaydi
// timeout — buyurtma kuryerda paydo bo'lishini qancha kutish (qo'lda biriktirish uchun uzoqroq beriladi)
// marker — buyurtma izohidagi noyob matn: admin paneldan qo'lda biriktirilgan buyurtma kuryerda BOSHQA raqam bilan
// chiqadi (bug: client #24675335 ↔ kuryer #34329673), shuning uchun uni izoh bo'yicha taniymiz.
// Qaytaradi: .courierNo — kuryer ilovasidagi raqam
export async function acceptOnCourier(orderNo, { destination, price, keep = [], timeout = 240000, marker } = {}) {
    await openCourier();
    const log = [];
    let offer = [];
    let courierNo = '';
    let deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        await dismissCashPrompt();
        const cur = await currentOrder();
        if (cur === orderNo) { courierNo = cur; break; } // biznikini tizim o'zi biriktirgan
        // Panelda o'zimizning boshqa buyurtmamiz bo'lsa — kuryer matnlaridan yangisini qidiramiz (raqam yoki izoh bo'yicha)
        if (cur && keep.includes(cur)) {
            const list = await texts();
            const joined = list.join('\n');
            if (joined.includes(`№: ${orderNo}`) || joined.includes(`#${orderNo}`)) { courierNo = orderNo; break; }
            const nums = [...joined.matchAll(/(?:#|№:\s*)(\d{6,})/g)].map(m => m[1]).filter(n => !keep.includes(n));
            if (marker && joined.includes(marker)) { courierNo = nums[0] || ''; break; }
            if (nums.length) { courierNo = nums[0]; break; } // kuryerda yangi buyurtma paydo bo'ldi (boshqa raqam bilan)
        }
        const accept = await byDesc('Принять');
        if (await accept.isDisplayed().catch(() => false)) {
            const t = await texts();
            const offerPrice = sum(t[t.indexOf('Цена доставки') + 1] || '');
            const ours = (!destination || t.includes(destination)) && (!price || offerPrice === price);
            if (ours) {
                offer = t;
                // "Принять" ba'zan birinchi bosishda ishlamaydi (oyna animatsiyasi) — kerak bo'lsa qayta bosamiz
                for (let i = 0; i < 3 && (await accept.isDisplayed().catch(() => false)); i++) { await accept.click(); await driver.pause(3500); }
                continue;
            }
            log.push(`begona taklif rad etildi (${offerPrice} сум)`);
            await declineOffer();
            continue;
        }
        if (cur && cur !== orderNo && !keep.includes(cur)) {
            // Begona buyurtma kuryerga biriktirilgan — uni yetkazib bo'shatamiz (bu vaqt kutish muddatiga kirmaydi)
            const t0 = Date.now();
            const r = await driveOneStep();
            if (r) log.push(`begona #${r.order}: ${r.step}`);
            deadline += Date.now() - t0;
            continue;
        }
        // Kuryer ilovasi o'zi oflayn bo'lib qolishi mumkin — taklif kelishi uchun qayta "GO"
        if (await byDescStart('ОФЛАЙН').isDisplayed().catch(() => false)) {
            console.log('    Kuryer oflayn bo\'lib qolgan — "GO"');
            await byDesc('GO').click().catch(() => {});
            await driver.pause(3000);
            continue;
        }
        await driver.pause(3000);
    }
    if (log.length) console.log(`    Kuryer: ${[...new Set(log)].join('; ')}`);
    // Bizning buyurtma paneli (bir nechta buyurtma bo'lsa — paneldagi joriy buyurtma boshqasi bo'lishi mumkin)
    if (!keep.length) {
        const panel = await byDescHas(`#${orderNo}`);
        await panel.waitForExist({ timeout: 20000, timeoutMsg: `Kuryer ilovasida #${orderNo} buyurtmasi qabul qilinmadi` });
        if ((await panel.getAttribute('content-desc')).includes('Свернуто')) { await panel.click(); await driver.pause(2000); }
    } else {
        // Qo'lda biriktirish kutilgan — buyurtma kuryerda paydo bo'lmasa jim davom etmaymiz
        if (!courierNo) {
            throw new Error(`#${orderNo} ${Math.round(timeout / 60000)} daqiqa ichida kuryerga biriktirilmadi (admin paneldan qo'lda biriktirilishi kerak edi)`);
        }
        if (courierNo !== orderNo) console.log(`    ⚠ Kuryer ilovasida #${orderNo} boshqa raqam bilan chiqdi: #${courierNo}`);
    }
    const t = offer.length ? offer : await texts();
    const after = label => t[t.indexOf(label) + 1] || '';
    return {
        courierNo: courierNo || orderNo,
        payment: t.includes('Не оплачено') ? 'Не оплачено' : (t.includes('Оплачено') ? 'Оплачено' : ''),
        deliveryPrice: t.includes('Цена доставки') ? after('Цена доставки') : '',
        texts: await texts(),
    };
}

// 2) Kuryer bo'shaguncha (ОНЛАЙН) barcha bosqichlarni o'tadi — bizning buyurtma va marshrutga tushib qolgan
//    begona buyurtmalar ham yetkaziladi. Bizning buyurtmamiz bosqichlarini qaytaradi.
// orderNo — bitta raqam yoki o'zimizning buyurtmalar ro'yxati. Qaytaradi: birinchi buyurtma bosqichlari;
// .byOrder — har bir buyurtma bo'yicha bosqichlar (bir nechta buyurtma bitta kuryerda aralashmasligini tekshirish uchun)
// Kuryerdagi barcha faol buyurtmalarni (oldingi yurishlardan qolgan va begona) yetkazib yopadi — kuryer bo'sh bo'ladi.
// Kuryer bir vaqtda 2 tadan ortiq buyurtma ololmaydi, shuning uchun ko'p buyurtmali testlardan oldin chaqiriladi
export async function clearCourier() {
    await openCourier();
    for (let i = 0; i < 40; i++) {
        await dismissCashPrompt();
        if (await byDesc('Принять').isDisplayed().catch(() => false)) { await declineOffer(); continue; }
        if (await byDescHas('ОНЛАЙН').isDisplayed().catch(() => false)) break;
        const r = await driveOneStep();
        if (r) console.log(`    Kuryer tozalanmoqda: #${r.order} — ${r.step}`);
        else await driver.pause(2000);
    }
    await courierOffline();
}

// onStep(r) — bizning buyurtmaning har bir bosqichidan keyin chaqiriladi ({order, step, seen}); masalan client'dagi
// holatni jonli tekshirish uchun. Undan keyin kuryer ilovasi qayta oldinga chiqariladi.
// .seen — har bir buyurtma bo'yicha kuryer ko'rgan matnlar (bosqichlar bo'yicha)
// aliases — { kuryerdagiRaqam: clientRaqam } (qo'lda biriktirilgan buyurtma kuryerda boshqa raqam bilan chiqadi)
export async function finishOnCourier(orderNo, { onStep, aliases = {} } = {}) {
    const ourOrders = Array.isArray(orderNo) ? orderNo : [orderNo];
    await openCourier();
    const byOrder = Object.fromEntries(ourOrders.map(o => [o, []]));
    const seen = Object.fromEntries(ourOrders.map(o => [o, []]));
    for (let i = 0; i < 14 * ourOrders.length + 12; i++) {
        await dismissCashPrompt();
        if (await byDescHas('ОНЛАЙН').isDisplayed().catch(() => false)) break;
        const r = await driveOneStep();
        if (!r) { await driver.pause(2000); continue; }
        if (aliases[r.order]) { r.courierNo = r.order; r.order = aliases[r.order]; }
        if (byOrder[r.order]) {
            byOrder[r.order].push(r.step);
            seen[r.order].push({ step: r.step, texts: r.seen });
            if (onStep) { await onStep(r); await openCourier(); }
        } else console.log(`    Kuryer: begona #${r.order} — ${r.step}`);
    }
    await dismissCashPrompt();
    await expect(byDescHas('ОНЛАЙН')).toBeDisplayed({ wait: 20000 });
    await courierOffline(); // keyingi test client'da xalaqitsiz ishlashi uchun
    const ours = byOrder[ourOrders[0]];
    ours.byOrder = byOrder;
    ours.seen = seen;
    return ours;
}
