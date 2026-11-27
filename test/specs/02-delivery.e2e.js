import fs from 'node:fs';
import { byDesc, byDescStart, byDescHas, restartApp, openTab, softBug, descOf, money, assertLoggedIn, ensureClient, captureApi, PACKAGE, px } from '../support/app.js';
import { acceptOnCourier, finishOnCourier, courierOffline, clearCourier } from '../support/courier.js';

// Delivery (Yetkazish) — to'liq tekshiruv. Tartib: ekran va sozlamalar → negativlar → naqd buyurtmalar
// (kuryer ilovasida oxirigacha yetkaziladi) → bekor qilish (faqat kuryer qabul qilmasidan oldin) → ikki marta bosish.
// QOIDALAR: to'lov FAQAT naqd pul; kuryer qabul qilgan buyurtma bekor qilinmaydi (3 marta → akkaunt bloki);
// begona takliflar rad etiladi, kuryerga biriktirilgan begona buyurtmalar yetkaziladi (support/courier.js).
const SAVED = "Muqimiy ko'chasi, 2/1"; // saqlangan manzil
// Yetkazish manzili. Odatda saqlangan manzil; lekin telefon (GPS — olib ketish nuqtasi) aynan shu manzilda
// turgan bo'lsa, olib ketish va yetkazish bir xil bo'lib buyurtma yaratilmaydi — u holda qidiruvdan boshqa manzil olinadi
let DESTINATION = SAVED;
const ALT_SEARCH = 'Amir Temur';
// Ikkinchi nuqta: "Chorsu" qidiruvining birinchi natijasi (Yandex natijalari har safar boshqacha bo'ladi —
// nomi pickSearchResult() da aniqlanadi)
const SEARCH = 'Chorsu';
let SECOND_STOP = SEARCH;

// Qidiruv natijalaridan prefix bilan boshlanadigan birinchisini tanlaydi (bo'lmasa — saqlangan manzildan boshqa
// birinchi natijani) va nomini qaytaradi
async function pickSearchResult(prefix = SEARCH) {
    let res = await $(`android=new UiSelector().className("android.widget.ImageView").descriptionStartsWith("${prefix}").instance(0)`);
    if (!(await res.waitForDisplayed({ timeout: 10000 }).catch(() => false))) {
        res = null;
        for (const e of await $$('android.widget.ImageView')) {
            const d = (await e.getAttribute('content-desc').catch(() => '')) || '';
            if (d.includes('\n') && !d.startsWith(SAVED)) { res = e; break; }
        }
        expect(res).not.toBeNull();
    }
    const name = (await res.getAttribute('content-desc')).split('\n')[0];
    if (prefix === SEARCH) SECOND_STOP = name;
    console.log(`    Qidiruv natijasi tanlandi: ${name}`);
    await res.click();
    await driver.pause(1500);
    return name;
}

// Asosiy Yetkazish ekranidagi olib ketish manzili — "Qayerga?" qatoridan bevosita yuqoridagi manzil qatori
async function pickupAddress() {
    const qy = (await byDesc('Qayerga?').getLocation()).y;
    let best = '', bestY = -1;
    for (const e of await $$('android=new UiSelector().className("android.view.View").clickable(true)')) {
        const d = (await e.getAttribute('content-desc').catch(() => '')) || '';
        const y = await e.getLocation().then(l => l.y).catch(() => -1);
        if (d && d !== 'Qayerga?' && y < qy && y > bestY && !d.includes('\n')) { best = d; bestY = y; }
    }
    return best;
}

// Selektorga mos elementlardan ekranda eng pastdagisi (yo'q bo'lsa — mavjud bo'lmagan element)
async function lastOf(selector) {
    const els = await $$(selector);
    let best = null, bestY = -1;
    for (const e of els) {
        const y = await e.getLocation().then(l => l.y).catch(() => -1);
        if (y > bestY) { best = e; bestY = y; }
    }
    return best || $(selector);
}

// Yetkazish manzili elementi. Telefon shu manzilda turgan bo'lsa, olib ketish manzili ham "Muqimiy ko'chasi, 2/1"
// bo'ladi — shuning uchun doim ekrandagi eng pastdagisini olamiz
const destEl = () => lastOf(`android=new UiSelector().description("${DESTINATION}")`);

// Qo'shimcha nuqtalar uchun qidiruv so'zlari (F1/F2 da 3–4 ta yetkazish nuqtasi)
const STOP_PREFIXES = [SEARCH, 'Mustaqillik', 'Yunusobod'];
// Formada qo'shimcha nuqta bormi (oldingi testlardan qoralamada qolgan bo'lishi mumkin)
const extraStop = () => $(`android=new UiSelector().className("android.view.View").descriptionMatches("(?s)(${STOP_PREFIXES.join('|')}).*").instance(0)`);
const OTHER_PHONE = '901234567';              // boshqa qabul qiluvchi (+998 90 123 45 67)

// Formadagi yorliqsiz elementlar (ekran ulushida), bitta yetkazish nuqtasi va klaviatura yopiq holatda
const FORM = {
    pickupPodyezd: [0.72, 0.259], pickupComment: [0.3, 0.316],
    dropPodyezd: [0.72, 0.451], dropComment: [0.3, 0.509],
    receiverPhone: [0.486, 0.566], doorToggle: [0.89, 0.65], linkToggle: [0.89, 0.717],
    payment: [0.107, 0.905],
};
const MAIN_PAYMENT = [0.126, 0.862]; // asosiy Yetkazish ekranidagi to'lov ikonkasi

async function tap([xRatio, yRatio]) {
    await ensureClient();
    const { width, height } = await driver.getWindowSize();
    await driver.execute('mobile: clickGesture', { x: Math.round(width * xRatio), y: Math.round(height * yRatio) });
    await driver.pause(1500);
}

async function shellText(text) {
    await driver.execute('mobile: shell', { command: 'input', args: ['text', text.replace(/ /g, '%s')] });
    await driver.pause(1000);
}

// Fokuslangan matn maydonini tozalab yozadi. Klaviatura YOPILMAYDI ("orqaga"/ESC formani ham yopadi).
async function fillFocused(text) {
    const focused = await $('android=new UiSelector().className("android.widget.EditText").focused(true)');
    await focused.waitForExist({ timeout: 5000 }).catch(() => {});
    // Flutter maydonida clearValue har doim ishlamaydi (qoralamadan qolgan matn qoladi) — Ctrl+A va Delete bilan o'chiramiz
    // Ctrl+A bu maydonlarda ishlamaydi; ishonchli yo'l — oxirga o'tib, har doim 105 marta Delete (izoh chegarasi 100 belgi)
    const wipe = async () => {
        await focused.clearValue().catch(() => {});
        await driver.execute('mobile: shell', { command: 'input', args: ['keyevent', 'KEYCODE_MOVE_END'] });
        await driver.execute('mobile: shell', { command: 'input', args: ['keyevent', ...Array(105).fill('67')] });
    };
    for (let attempt = 0; attempt < 2; attempt++) {
        if (await focused.isExisting()) await wipe();
        await driver.pause(1000); // aks holda boshidagi belgilar yo'qoladi
        await shellText(text);
        if (!(await focused.isExisting())) return '';
        // Matn maydonga yetib kelishini kutamiz (qisqartirilgan pauzalar bilan darhol o'qilsa eski qiymat chiqadi)
        const ok = await driver.waitUntil(async () => (await focused.getText().catch(() => '')) === text, { timeout: 4000, interval: 400 }).catch(() => false);
        if (ok) return text;
    }
    return focused.getText();
}

// Fokus bor paytda ko'rinadigan keng izoh maydonlari (chapdan boshlanadi), yuqoridan pastga
async function wideEditTexts() {
    const out = [];
    for (const e of await $$('android.widget.EditText')) {
        const { x, y } = await e.getLocation();
        const { width } = await e.getSize();
        if (x < px(300) && width > px(900)) out.push({ e, y });
    }
    return out.sort((a, b) => a.y - b.y).map(o => o.e);
}

const price = async label => money((await descOf(await byDescStart(label))).split('\n').pop());

// Klaviaturani formani yopmasdan yopish: "orqaga"/ESC butun formani yopadi, shuning uchun
// bosilmaydigan matn blokini ("Eshikdan eshikgacha" sarlavhasi, kalitdan chapda) bosamiz
// Klaviatura holatini forma siljishidan aniqlaymiz: klaviatura ochilganda forma yuqoriga suriladi va
// yetkazish manzili ekranning yuqori yarmiga (~0.21) ko'tariladi; yopiq holatda u ~0.42 da turadi.
// (driver.isKeyboardShown() va 'mobile: shell dumpsys' bu Flutter ilovada ishonchsiz chiqdi.)
async function destY() {
    const dest = await destEl();
    if (!(await dest.isExisting().catch(() => false))) return null;
    return (await dest.getLocation()).y;
}

async function dismissKeyboard({ waitForIt = 0 } = {}) {
    const { width, height } = await driver.getWindowSize();
    // Ilova yangi nuqtaning izoh maydoniga kechikib fokus beradi — forma siljishini kutamiz
    for (let t = 0; t < waitForIt; t += 500) {
        const y = await destY();
        if (y !== null && y < height * 0.3) break;
        await driver.pause(500);
    }
    for (let attempt = 0; attempt < 3; attempt++) {
        const y = await destY();
        if (process.env.DEBUG_KB) console.log(`    [kb] dest y=${y}`);
        if (y === null || y >= height * 0.3) return; // klaviatura yopiq
        // Yetkazish kartasi tepasidagi bo'sh joy (kartalar orasi) — bosilmaydigan joy; adb input tap bilan
        await driver.execute('mobile: shell', { command: 'input', args: ['tap', String(Math.round(width / 2)), String(Math.round(y - px(40)))] });
        await driver.pause(1500);
    }
    // Kichik ekranlarda (Samsung A06) kartalar orasidagi bo'shliq juda tor — klaviatura ochiq qolsa, pastki paneldagi
    // "klaviaturani yashirish" (∨) tugmasini bosamiz. Faqat klaviatura ochiqligi aniq bo'lsa (aks holda u joyda "Orqaga")
    for (let attempt = 0; attempt < 2 && (await keyboardVisible()); attempt++) {
        await driver.execute('mobile: shell', { command: 'input', args: ['tap', String(Math.round(width * 0.775)), String(Math.round(height * 0.971))] });
        await driver.pause(1200);
    }
}

// Klaviatura ochiqmi: ochiq bo'lsa ilova oynasi qisqaradi va "Buyurtma berish" tugmasi ekranning yuqorirog'iga ko'tariladi
async function keyboardVisible() {
    const { height } = await driver.getWindowSize();
    const btn = await byDescStart('Buyurtma berish\n');
    const y = await btn.getLocation().then(l => l.y).catch(() => -1);
    return y > 0 && y < height * 0.75;
}

// Qabul qiluvchi telefoni qatori: yetkazish manzilidan keyingi "+998…" matni; bo'sh bo'lsa — koordinata
async function receiverRowPoint() {
    const dest = await destEl();
    const { height } = await driver.getWindowSize();
    if (await dest.isDisplayed().catch(() => false)) {
        const destY = (await dest.getLocation()).y;
        for (const t of await $$('android=new UiSelector().textStartsWith("+998")')) {
            const { y } = await t.getLocation();
            if (y > destY) return [0.486, (y + px(60)) / height];
        }
        return [0.486, (destY + px(440)) / height];
    }
    return FORM.receiverPhone;
}

async function openDelivery() {
    await restartApp();
    await byDesc('Yetkazish').click();
    await expect(byDesc('Qayerga?')).toBeDisplayed({ wait: 20000 });
}

// Bosh sahifa → Yetkazish → yetkazish manzili → narx.
// sameAsPickupAllowed=false: olib ketish manzili saqlangan manzil bilan bir xil bo'lsa, qidiruvdan boshqa manzil olinadi
async function openDeliveryWithDestination({ sameAsPickupAllowed = false } = {}) {
    await openDelivery();
    const pickup = await pickupAddress();
    await byDesc('Qayerga?').click();
    if (pickup === SAVED && !sameAsPickupAllowed) {
        await driver.pause(1500);
        await shellText(ALT_SEARCH);
        DESTINATION = await pickSearchResult(ALT_SEARCH);
        console.log(`    Olib ketish manzili saqlangan manzil bilan bir xil ("${pickup}") — yetkazish: ${DESTINATION}`);
    } else {
        DESTINATION = SAVED;
        const saved = await byDescStart(`${SAVED}\n`);
        await expect(saved).toBeDisplayed({ wait: 10000 });
        await saved.click();
    }
    await expect(byDescStart('Buyurtma tafsilotlari\n')).toBeDisplayed({ wait: 15000 });
    return price('Buyurtma tafsilotlari\n');
}

async function openForm() {
    const p = await openDeliveryWithDestination();
    await byDescStart('Buyurtma tafsilotlari\n').click();
    await expect(byDescStart('Buyurtma berish\n')).toBeDisplayed({ wait: 15000 });
    await removeExtraStops();
    return p;
}

// Formani pastga surish. MUHIM: surish matn maydoni ustidan boshlansa, maydon fokus oladi va klaviatura chiqadi —
// shuning uchun bosilmaydigan joydan ("Eshikdan eshikgacha" matni yoki oxirgi manzil yorlig'i) boshlaymiz
async function scrollFormToBottom() {
    const { width, height } = await driver.getWindowSize();
    for (let i = 0; i < 3 && !(await byDesc("Tartibni o'zgartirish").isExisting().catch(() => false)); i++) {
        let startY;
        const block = await byDescStart('Eshikdan eshikgacha');
        if (await block.isExisting().catch(() => false)) startY = (await block.getLocation()).y + px(40);
        else {
            const last = (await extraStop().isExisting().catch(() => false)) ? await extraStop() : await destEl();
            startY = (await last.getLocation()).y + px(40);
        }
        startY = Math.min(startY, Math.round(height * 0.8));
        await driver.execute('mobile: shell', { command: 'input', args: ['swipe', String(Math.round(width * 0.3)), String(startY), String(Math.round(width * 0.3)), String(Math.max(200, startY - Math.round(height * 0.45))), '700'] });
        await driver.pause(1500);
    }
}

// Ilova formani qoralama sifatida saqlaydi: oldingi test qo'shgan qo'shimcha nuqta qolib ketgan bo'lsa,
// "Marshrut" oynasida ✕ bilan o'chiramiz — har bir test toza formadan boshlanadi
async function removeExtraStops() {
    for (let i = 0; i < 5 &&(await extraStop().isExisting().catch(() => false)); i++) {
        const name = (await extraStop().getAttribute('content-desc')).split('\n')[0];
        await dismissKeyboard();
        await scrollFormToBottom();
        await byDesc("Tartibni o'zgartirish").click();
        await expect(byDesc('Marshrut')).toBeDisplayed({ wait: 8000 });
        const row = await byDescHas(name);
        const { y } = await row.getLocation();
        const { height } = await row.getSize();
        const { width } = await driver.getWindowSize();
        await driver.execute('mobile: clickGesture', { x: Math.round(width * 0.852), y: Math.round(y + height / 2) });
        await driver.pause(2000);
        if (await byDesc('Marshrut').isDisplayed().catch(() => false)) await byDesc('Bekor qilish').click().catch(() => {});
        await driver.pause(1500);
        console.log('    Qoralamadan qolgan qo\'shimcha nuqta o\'chirildi');
    }
}

const phonesOnForm = async () => (await $$('android=new UiSelector().textStartsWith("+998")')).length;

// Qabul qiluvchi oynasini ochadi (kontaktlarga ruxsat so'ralsa rad etadi)
async function openReceiverSheet(at) {
    await driver.pause(1500); // forma to'liq chizilishini kutamiz
    await dismissKeyboard();
    at = at || (await receiverRowPoint());
    await tap(at);
    if (!(await byDesc('Qabul qiluvchi').waitForDisplayed({ timeout: 4000 }).catch(() => false))
        && !(await $('android=new UiSelector().textStartsWith("Don")').isDisplayed().catch(() => false))) {
        await tap(at); // birinchi bosish ba'zan o'tmaydi
    }
    for (let i = 0; i < 2; i++) {
        const deny = await $('android=new UiSelector().textStartsWith("Don")');
        if (await deny.isDisplayed().catch(() => false)) {
            await deny.click(); await driver.pause(1500);
            if (i === 0 && await $('android=new UiSelector().textStartsWith("Don")').isDisplayed().catch(() => false)) {
                softBug('Delivery: kontaktlarga ruxsat rad etilgach, ilova uni darhol yana so\'raydi');
            }
        }
    }
    await expect(byDesc('Qabul qiluvchi')).toBeDisplayed({ wait: 8000 });
}

async function receiverSelf(at) {
    await openReceiverSheet(at);
    await ensureClient();
    await byDescStart("O'zim\n").click();
    await driver.pause(1500);
}

async function receiverOther(digits, at) {
    await openReceiverSheet(at);
    await tap([0.5, 0.432]); // "Telefon raqamni kiriting" maydoni
    await shellText(digits);
    const row = await byDescStart('+998');
    await expect(row).toBeDisplayed({ wait: 5000 });
    await row.click();
    await driver.pause(1500);
}

// To'lov usulini aniq "Naqd pul" qiladi (karta HECH QACHON tanlanmaydi)
// To'lov ikonkasini ochadi: formada — "Buyurtma berish" tugmasining chapidagi ikonka (joyi forma holatiga qarab o'zgaradi)
async function openPaymentSheet() {
    const btn = await byDescStart('Buyurtma berish\n');
    if (await btn.isDisplayed().catch(() => false)) {
        await dismissKeyboard();
        const { x, y } = await btn.getLocation();
        const { height } = await btn.getSize();
        await ensureClient();
        await driver.execute('mobile: clickGesture', { x: Math.max(px(40), Math.round(x - px(126))), y: Math.round(y + height / 2) });
        await driver.pause(1500);
    } else {
        await tap(MAIN_PAYMENT);
    }
}

async function selectCash() {
    await openPaymentSheet();
    await expect(byDesc("To'lov usulini o'zgartirish")).toBeDisplayed({ wait: 8000 });
    await byDesc('Naqd pul').click();
    await byDesc('Tayyor').click();
    await driver.pause(1200);
}

async function placeOrder({ doubleTap = false, payLabel = 'naqd' } = {}) {
    await ensureClient();
    const btn = await byDescStart('Buyurtma berish\n');
    await expect(btn).toBeDisplayed();
    const p = money((await descOf(btn)).split('\n').pop());
    if (doubleTap) {
        const { x, y } = await btn.getLocation();
        const { width, height } = await btn.getSize();
        const c = { x: Math.round(x + width / 2), y: Math.round(y + height / 2) };
        await driver.execute('mobile: doubleClickGesture', c);
    } else {
        await btn.click();
    }
    // Akkaunt bloklangan bo'lsa qisqa toast chiqadi — darhol ushlaymiz
    for (let t = 0; t < 3; t++) {
        const toast = await findDesc(/cheklov/i);
        if (toast) throw new Error(`Buyurtma rad etildi: "${toast}". Akkaunt bloklangan — blokni olib tashlang va testni qayta ishga tushiring.`);
        await driver.pause(700);
    }
    const noHouse = await byDesc('Uy raqamisiz davom etish');
    if (await noHouse.waitForDisplayed({ timeout: 4000 }).catch(() => false)) {
        console.log('    "Uy raqami kiritilmagan" oynasi → "Uy raqamisiz davom etish"');
        await noHouse.click();
    }
    let orderNo = '';
    await driver.waitUntil(async () => {
        await ensureClient();
        const d = await byDescStart('Buyurtma #').getAttribute('content-desc').catch(() => '');
        orderNo = (d || '').replace(/\D/g, '');
        return orderNo.length > 0;
    }, { timeout: 30000, interval: 1500 }).catch(() => {});
    // Diagnostika: STOP_ON_ORDER_FAIL=1 — ilovani qayta ishga tushirmasdan to'xtaymiz (Alice jurnalini qo'lda ko'rish uchun)
    if (!orderNo && process.env.STOP_ON_ORDER_FAIL) throw new Error('Buyurtma yaratilmadi — ilova shu holatda qoldirildi (STOP_ON_ORDER_FAIL)');
    if (!orderNo && await byDescStart('Buyurtma berish\n').isExisting().catch(() => false)) {
        // Hali formada — buyurtma yaratilmadi. Sababini API'dan (Alice inspektori) yozib olamiz
        const api = await captureApi('POST', /^\/api\/v1\/orders$/, 'order-fail');
        if (api) {
            const txt = fs.readFileSync(api.file, 'utf8');
            const msg = (txt.match(/"(message|error|detail)"\s*:\s*"([^"]+)"/) || [])[2] || '';
            throw new Error(`Buyurtma yaratilmadi — API: ${api.summary}${msg ? ` — "${msg}"` : ''} (to'liq: ${api.file})`);
        }
    }
    if (!orderNo) {
        // Zaxira: tarixdagi eng yangi Delivery buyurtmasi, agar u hozirgina (3 daqiqa ichida) yaratilgan bo'lsa.
        // (Yangi versiyada kuzatuv ekrani sarlavhasi har doim ham o'qilmaydi; holat nomi ham o'zgarishi mumkin)
        await restartApp();
        await openTab('Buyurtmalar');
        const top = await byDescStart('Yetkazib berish\n');
        if (await top.isExisting()) {
            const parts = (await descOf(top)).split('\n');
            const hm = (parts[parts.length - 1].match(/(\d{1,2}):(\d{2})$/) || []).slice(1).map(Number);
            const now = new Date();
            const diff = hm.length ? (now.getHours() * 60 + now.getMinutes()) - (hm[0] * 60 + hm[1]) : 99;
            if (diff >= 0 && diff <= 3 && !/Yakunlandi|Bekor qilindi/.test(parts[1])) {
                orderNo = parts[2];
                console.log(`    Buyurtma raqami tarixdan olindi (holati: "${parts[1]}")`);
            }
        }
    }
    if (!orderNo) {
        throw new Error('"Buyurtma berish" bosildi, lekin buyurtma yaratilmadi (akkaunt bloklangan bo\'lishi mumkin — "Ko\'p bekor qilish sababli cheklov qo\'yildi"; blokni olib tashlang)');
    }
    console.log(`    Buyurtma #${orderNo}, ${p} so'm, ${payLabel}`);
    return { orderNo, price: p };
}

// To'lov usuli sifatida birinchi saqlangan kartani tanlaydi. FAQAT G bo'limi uchun: bunday buyurtma yakunlanmaydi,
// kuryer qabul qilmasidan oldin bekor qilinadi (foydalanuvchi qoidasi)
async function selectCard() {
    await openPaymentSheet();
    await expect(byDesc("To'lov usulini o'zgartirish")).toBeDisplayed({ wait: 8000 });
    const card = await byDescStart('••••');
    await expect(card).toBeDisplayed();
    const name = await descOf(card);
    await card.click();
    await byDesc('Tayyor').click();
    await driver.pause(1200);
    return name;
}

// Yangi yetkazish nuqtasi: "Yangi manzil qo'shish" → qidiruv → birinchi natija. Nomini qaytaradi
async function addStop(prefix) {
    await dismissKeyboard();
    await scrollFormToBottom();
    await byDesc("Yangi manzil qo'shish").click();
    await driver.pause(1500);
    await shellText(prefix);
    const name = await pickSearchResult(prefix);
    await expect(await lastOf(`android=new UiSelector().description("${name}")`)).toBeExisting({ wait: 15000 });
    await dismissKeyboard({ waitForIt: 4000 }); // ilova yangi nuqtaning izoh maydoniga kechikib fokus beradi
    return name;
}

// Nuqta qabul qiluvchisini "O'zim" qiladi: nuqta yorlig'ini ekranning yuqori qismiga olib chiqib, undan pastdagi
// telefon qatorini bosamiz (nuqta nomidan ~440 px pastda)
async function receiverSelfForStop(name) {
    const { width, height } = await driver.getWindowSize();
    for (let i = 0; i < 4; i++) {
        const el = await lastOf(`android=new UiSelector().description("${name}")`);
        const y = await el.getLocation().then(l => l.y).catch(() => -1);
        if (y > px(150) && y < height * 0.55) {
            const before = await phonesOnForm();
            await receiverSelf([0.486, (y + px(440)) / height]);
            expect(await phonesOnForm()).toBeGreaterThan(before);
            return;
        }
        // Formani surish (bosilmaydigan joydan — nuqta yorlig'ining o'zidan)
        const from = y > 0 ? Math.min(y + px(20), Math.round(height * 0.8)) : Math.round(height * 0.6);
        await driver.execute('mobile: shell', { command: 'input', args: ['swipe', String(Math.round(width * 0.3)), String(from), String(Math.round(width * 0.3)), String(Math.max(px(250), from - Math.round(height * 0.35))), '700'] });
        await driver.pause(1500);
    }
    throw new Error(`"${name}" nuqtasining telefon qatoriga yetib bo'lmadi`);
}

// Nuqta maydonlarini to'ldiradi: Podyezd (nuqta nomi qatorida o'ngdagi EditText) va "Kuryerga izoh" (ostidagi EditText).
// Formada qavat/uy/kvartira uchun alohida maydon yo'q — ular izohga yoziladi. labelEl — nuqta nomi elementi
// getLabel — elementni qaytaruvchi funksiya (har urinishda qayta qidiriladi). Topilmasa — u yuqorida (pastdan yuqoriga
// to'ldiramiz), shuning uchun formani pastga surib (kontent yuqoridan tushadi) qidiramiz
async function fillStopFields(getLabel, { podyezd, comment }, anchors = []) {
    const { height } = await driver.getWindowSize();
    let labelEl;
    for (let i = 0; i < 6; i++) {
        labelEl = await getLabel();
        const y = await labelEl.getLocation().then(l => l.y).catch(() => -1);
        if (y > px(150) && y < height * 0.5) break;
        // Surish manzil yorlig'idan (input emas) boshlanadi; yorliq ko'rinmasa — ko'rinib turgan boshqa manzil yorlig'idan
        let from = y > 0 ? Math.max(px(400), Math.min(y + px(20), Math.round(height * 0.8))) : -1; // 400 dan yuqoridan surilsa bildirishnoma pardasi tushadi
        for (const a of anchors) {
            if (from > 0) break;
            const e = await $(`android=new UiSelector().description("${a}").instance(0)`);
            const ay = await e.getLocation().then(l => l.y).catch(() => -1);
            if (ay > 0 && ay < height * 0.75) from = Math.max(px(400), ay + px(20));
        }
        if (from < 0) from = Math.round(height * 0.35);
        const down = y < 0 || y <= px(150); // kontentni pastga tushirish (yuqoridagini ko'rsatish)
        const to = down ? from + Math.round(height * 0.3) : Math.max(px(250), from - Math.round(height * 0.35));
        await driver.execute('mobile: shell', { command: 'input', args: ['swipe', String(px(430)), String(from), String(px(430)), String(to), '700'] });
        await driver.pause(1500);
    }
    const label = { ...(await labelEl.getLocation()), ...(await labelEl.getSize()) };
    let pod = null, com = null;
    const seen = [];
    // Yorliq qisman yopilgan bo'lsa uning bounds'i kesilgan keladi — shuning uchun: Podyezd = yorliq pastidan yuqoridagi
    // eng yaqin o'ng EditText; izoh = Podyezd'dan pastdagi eng yaqin chap EditText
    const fields = [];
    for (const e of await $$('android.widget.EditText')) {
        const { x, y } = await e.getLocation();
        seen.push(`${x},${y}`);
        fields.push({ e, x, y });
    }
    const bottom = label.y + label.height;
    let podY = -1;
    for (const f of fields) if (f.x > label.x + px(300) && f.y <= bottom && f.y > bottom - px(260) && f.y > podY) { pod = f.e; podY = f.y; }
    let comY = 1e9;
    if (pod) for (const f of fields) if (f.x < label.x + px(300) && f.y > podY + px(60) && f.y < podY + px(400) && f.y < comY) { com = f.e; comY = f.y; }
    if (!pod || !com) throw new Error(`Nuqtaning Podyezd/izoh maydonlari topilmadi (yorliq ${JSON.stringify(label)}, EditText: ${seen.join(' ')})`);
    // Aynan shu maydonga yozamiz va natijani SHU maydondan o'qiymiz ("fokusdagi maydon"ni qidirish ba'zan oldingi
    // maydonni topardi). Qoralamadan qolgan eski matn oxiridan 105 marta Delete bilan o'chiriladi (Ctrl+A ishlamaydi)
    const typeInto = async (el, text) => {
        for (let attempt = 0; attempt < 3; attempt++) {
            await el.click();
            await driver.pause(1200);
            // Faqat maydonda bor belgilar soniche Delete (odatda 0) — 105 ta tugma bosish har maydonga 5–8 s olardi
            const old = (await el.getText().catch(() => '')) || '';
            const isHint = /^(Podyezd|Kuryerga izoh)$/.test(old);
            if (old && !isHint && old !== text) {
                await driver.execute('mobile: shell', { command: 'input', args: ['keyevent', 'KEYCODE_MOVE_END'] });
                await driver.execute('mobile: shell', { command: 'input', args: ['keyevent', ...Array(old.length + 2).fill('67')] });
                await driver.pause(300);
            }
            if (old === text) return text;
            if (process.env.DEBUG_TYPE) console.log(`    [typeInto ${attempt}] eski="${old}" o'chirilgach="${await el.getText().catch(e => 'ERR ' + e.message)}"`);
            await shellText(text);
            if (process.env.DEBUG_TYPE) console.log(`    [typeInto ${attempt}] yozilgach="${await el.getText().catch(e => 'ERR ' + e.message)}"`);
            const ok = await driver.waitUntil(async () => (await el.getText().catch(() => '')) === text, { timeout: 4000, interval: 400 }).catch(() => false);
            if (ok) return text;
        }
        return el.getText();
    };
    if (podyezd) expect(await typeInto(pod, podyezd)).toBe(podyezd);
    if (comment) expect(await typeInto(com, comment)).toBe(comment);
    await dismissKeyboard();
}

// Client kuzatuv ekranidagi holat sarlavhasi ("Kuryer qidirilmoqda" va h.k.) — "Buyurtma #…" ustidagi yozuv
async function trackingStatus() {
    const no = await byDescStart('Buyurtma #');
    if (!(await no.isExisting().catch(() => false))) return '';
    const ny = (await no.getLocation()).y;
    // Bitta so'rov bilan (page source) — har elementdan alohida so'rash juda sekin edi
    let best = '', bestY = -1;
    for (const n of nodesFromSource(await driver.getPageSource())) {
        const d = n.desc;
        if (/^\d+$/.test(d) || d.startsWith('Buyurtma #')) continue;
        if (n.y >= 0 && n.y < ny && n.y > bestY) { best = d.split('\n')[0]; bestY = n.y; }
    }
    return best;
}

// Buyurtma kuzatuv ekranini ilovani QAYTA ISHGA TUSHIRMASDAN ochadi (holat websocket orqali jonli kelishini
// tekshirish uchun): ochiq bo'lsa o'sha, aks holda orqaga → "Buyurtmalar" → buyurtma kartasi
async function openTrackingLive(orderNo) {
    await driver.activateApp(PACKAGE);
    await driver.pause(1000);
    if (await byDescStart(`Buyurtma #${orderNo}`).isExisting().catch(() => false)) return true;
    for (let i = 0; i < 4; i++) {
        if (await byDesc('Buyurtmalar').isExisting().catch(() => false)) break;
        await driver.back(); await driver.pause(1200);
        if ((await driver.getCurrentPackage()) !== PACKAGE) { await driver.activateApp(PACKAGE); await driver.pause(1500); }
    }
    await openTab('Buyurtmalar');
    const card = await byDescHas(`\n${orderNo}\n`);
    if (!(await card.waitForDisplayed({ timeout: 10000 }).catch(() => false))) return false;
    await card.click();
    await driver.pause(2500);
    return byDescStart(`Buyurtma #${orderNo}`).isExisting().catch(() => false);
}

// Kuryer har bir bosqichidan keyin client'dagi holat jonli o'zgarishini kuzatadi va skrinshot (xarita) saqlaydi
function liveStatusWatcher() {
    const log = {}; // orderNo → [{step, status}]
    let shot = 0;
    const onStep = async r => {
        const list = (log[r.order] = log[r.order] || []);
        const prev = list.length ? list[list.length - 1].status : 'Kuryer qidirilmoqda';
        let status = '';
        const opened = await openTrackingLive(r.order);
        // Websocket kechikishi uchun 15 soniyagacha holat o'zgarishini kutamiz (ilova qayta ochilmaydi)
        for (let t = 0; t < 8; t++) {
            status = opened ? await trackingStatus() : '';
            if (status && status !== prev) break;
            await driver.pause(1000);
            if (!opened) break;
        }
        // Boshqa buyurtma kuzatuvi ochilmaganini tekshirish (aralashib ketmasin)
        if (opened) expect(await byDescStart(`Buyurtma #${r.order}`).isExisting()).toBe(true);
        fs.mkdirSync('reports/tracking', { recursive: true });
        await driver.saveScreenshot(`reports/tracking/${r.order}-${String(++shot).padStart(2, '0')}-${r.step.replace(/\s+/g, '_')}.png`).catch(() => {});
        list.push({ step: r.step, status: status || (opened ? '(o\'qilmadi)' : '(kuzatuv yopildi)') });
        console.log(`    #${r.order} kuryer: ${r.step} → client: "${list[list.length - 1].status}"`);
    };
    return { onStep, log };
}

// Client: buyurtmani tarixdan ochadi
async function openFromHistory(orderNo) {
    await restartApp();
    await openTab('Buyurtmalar');
    const card = await byDescHas(`\n${orderNo}\n`);
    await expect(card).toBeDisplayed({ wait: 20000 });
    const parts = (await descOf(card)).split('\n');
    await card.click();
    await driver.pause(3000);
    return parts;
}

// Pastki oynani element ko'ringuncha yuqoriga suradi
// from — surish boshlanadigan balandlik (formada pastki "Buyurtma berish" paneli surilmaydi, shuning uchun 0.72)
async function revealInSheet(getEl, max = 6, from = 0.88) {
    const { width, height } = await driver.getWindowSize();
    // Element ko'rinib turishi va pastki panel (ekranning ~85% dan pasti) ostida qolmasligi kerak
    const visible = async () => {
        const el = await getEl();
        if (!(await el.isDisplayed().catch(() => false))) return false;
        const { y } = await el.getLocation();
        return y < height * 0.85;
    };
    for (let i = 0; i < max; i++) {
        if (process.env.DEBUG_KB) { const el = await getEl(); console.log(`    [reveal ${i}] exists=${await el.isExisting().catch(() => 'err')} displayed=${await el.isDisplayed().catch(() => 'err')} y=${await el.getLocation().then(l => l.y).catch(() => '-')}`); }
        if (await visible()) return true;
        await driver.execute('mobile: dragGesture', { startX: Math.round(width / 2), startY: Math.round(height * from), endX: Math.round(width / 2), endY: Math.round(height * 0.3), speed: 2500 });
        await driver.pause(1000);
    }
    return visible();
}

async function assertCashInTracking(p, orderNo) {
    await driver.activateApp(PACKAGE);
    if (!(await byDescStart('Buyurtma #').waitForDisplayed({ timeout: 8000 }).catch(() => false))) await openFromHistory(orderNo);
    await revealInSheet(async () => ((await byDescStart('Cash\n').isExisting()) ? byDescStart('Cash\n') : byDescStart('Naqd')));
    const cash = (await byDescStart('Cash\n').isExisting()) ? await byDescStart('Cash\n') : await byDescStart('Naqd');
    await expect(cash).toBeExisting();
    const d = await descOf(cash);
    expect(money(d.split('\n').pop())).toBe(p);
    if (d.startsWith('Cash')) softBug(`Delivery kuzatuv ekrani (UZ): to'lov turi inglizcha — "${d.replace(/\n/g, ' ')}"`);
}

async function assertInHistory(orderNo, status, p) {
    await driver.activateApp(PACKAGE);
    await restartApp();
    await openTab('Buyurtmalar');
    const card = await byDescHas(`\n${orderNo}\n`);
    await expect(card).toBeDisplayed({ wait: 20000 });
    const parts = (await descOf(card)).split('\n');
    console.log(`    Tarixda: ${parts.join(' / ')}`);
    expect(parts[1]).toBe(status);
    if (p !== undefined) expect(money(parts[3])).toBe(p);
    return parts;
}

// Buyurtma bildirishnomalarda ko'rinadi
async function assertNotified(orderNo) {
    await restartApp();
    await openTab('Akkaunt');
    await byDesc('Bildirishnomalar').click();
    const n = await byDescHas(`#${orderNo}`);
    const ok = await n.waitForExist({ timeout: 15000 }).catch(() => false);
    console.log(`    Bildirishnomalar: #${orderNo} ${ok ? 'bor' : 'YO\'Q'}`);
    if (!ok) softBug(`Delivery: #${orderNo} buyurtmasi bo'yicha bildirishnoma kelmadi`);
}

// To'liq naqd buyurtma: kuryer qabul qiladi → client'da naqd tekshiriladi → yetkaziladi → tarixda "Yakunlandi"
async function completeCashOrder(orderNo, p, destination = DESTINATION) {
    const courier = await acceptOnCourier(orderNo, { destination, price: p });
    console.log(`    Kuryer: to'lov "${courier.payment}", yetkazish narxi "${courier.deliveryPrice}"`);
    expect(courier.payment).toBe('Не оплачено');
    if (courier.deliveryPrice) expect(money(courier.deliveryPrice)).toBe(p);
    await assertCashInTracking(p, orderNo);
    const steps = await finishOnCourier(orderNo);
    console.log(`    Kuryer bosqichlari: ${steps.join(' → ')}`);
    await assertInHistory(orderNo, 'Yakunlandi', p);
    return { courier, steps };
}

// Kuryer qabul qilmasidan oldin bekor qilish. Kuryer allaqachon qabul qilgan bo'lsa — bekor qilinmaydi, yetkaziladi.
async function cancelBeforeCourier(orderNo, reason) {
    await driver.activateApp(PACKAGE);
    if (!(await byDescStart('Buyurtma #').waitForDisplayed({ timeout: 8000 }).catch(() => false))) await openFromHistory(orderNo);
    if (!(await byDesc('Kuryer qidirilmoqda').isExisting().catch(() => false))) {
        console.log(`    #${orderNo}: kuryer allaqachon qabul qilgan — blok xavfi tufayli bekor qilinmaydi, yetkaziladi`);
        await acceptOnCourier(orderNo, {}).catch(() => {});
        await finishOnCourier(orderNo);
        return false;
    }
    await revealInSheet(() => byDesc('Bekor qilish'));
    await byDesc('Bekor qilish').click();
    await expect(byDescHas('bekor qilish sababini')).toBeExisting({ wait: 8000 });
    if (reason) { await byDescHas(reason).click(); await driver.pause(800); }
    await byDescHas('Ha, bekor').click();
    await driver.pause(3000);
    return true;
}

// content-desc'i regex'ga mos birinchi elementning matni
async function findDesc(re) {
    for (const n of nodesFromSource(await driver.getPageSource())) if (re.test(n.desc)) return n.desc;
    return '';
}

// Page source'dan content-desc'li tugunlar: { desc, y } (bitta so'rov)
function nodesFromSource(xml) {
    const out = [];
    for (const m of xml.matchAll(/<[^>]*content-desc="([^"]*)"[^>]*>/g)) {
        const desc = m[1].replace(/&#10;/g, '\n').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        if (!desc || desc === 'null') continue;
        const b = m[0].match(/bounds="\[(\d+),(\d+)\]/);
        out.push({ desc, x: b ? Number(b[1]) : -1, y: b ? Number(b[2]) : -1 });
    }
    return out;
}

// Bekor qilish sabablari (ilovada ‘ belgilari ishlatilgan — qisman matn bilan qidiramiz)
const REASONS = { long: 'Juda uzoq qidiruv', wrongPoint: 'nash nuqtasi', changedMind: 'Fikrimni', other: 'Boshqa' };

describe('2. Delivery (Yetkazish)', () => {
    before(async () => {
        // Kuryer oflayn: boshqa testerlarning takliflari client ekranini yopmasin (onlayn faqat acceptOnCourier'da)
        // Kuryer bo'sh va oflayn bo'lsin: qolgan buyurtmalar yopiladi, takliflar rad etiladi (aks holda taklif oynasi
        // client ekranini yopib qo'yadi)
        await clearCourier().catch(e => console.log(`    Kuryerni tozalab bo'lmadi: ${String(e).split('\n')[0]}`));
        await restartApp();
        await assertLoggedIn();
    });

    // ───────────────────────────── A. Ekran va sozlamalar (buyurtma yaratilmaydi)
    describe('A. Ekran va sozlamalar', () => {
        it('A1. Yetkazish ekrani: olib ketish manzili, "Qayerga?", vaqt, to\'lov, manzilsiz narx yo\'q', async () => {
            await openDelivery();
            await expect(byDesc('Hozirga')).toBeDisplayed();
            await expect(byDescStart('Olib ketish')).toBeExisting();
            const details = await byDescStart('Buyurtma tafsilotlari');
            const d = await descOf(details);
            console.log(`    Manzilsiz tugma: "${d.replace(/\n/g, ' / ')}"`);
            expect(d).not.toMatch(/so[‘']m/); // manzil tanlanmaguncha narx yo'q
        });

        it('A2. Negativ: manzil tanlanmaganda "Buyurtma tafsilotlari" formani ochmaydi', async () => {
            await byDescStart('Buyurtma tafsilotlari').click();
            await driver.pause(2500);
            await expect(byDescStart('Buyurtma berish\n')).not.toBeExisting();
        });

        it('A3. Saqlangan manzilni tanlash — narx va yetib borish vaqti chiqadi', async () => {
            const p = await openDeliveryWithDestination();
            console.log(`    Narx: ${p} so'm`);
            expect(p).toBeGreaterThan(0);
            await expect(byDescStart(`${DESTINATION} ·`)).toBeDisplayed();
            await expect(byDescStart('Olib ketish vaqti')).toBeDisplayed();
        });

        it('A4. Manzilni qidiruv orqali tanlash — natijalar chiqadi, tanlangach narx o\'zgaradi', async () => {
            const before = await openDeliveryWithDestination();
            await byDescStart(`${DESTINATION} ·`).click();
            await driver.pause(1500);
            // Qidiruv oynasida ikkinchi maydon — yetkazish manzili (unda eski manzil turadi): tozalab yozamiz
            const field = await lastOf(`android=new UiSelector().className("android.widget.EditText").text("${DESTINATION}")`);
            await expect(field).toBeDisplayed({ wait: 8000 });
            await field.click();
            await driver.pause(800);
            await field.clearValue().catch(() => {});
            await shellText(SEARCH);
            await pickSearchResult();
            await expect(byDescStart(`${SECOND_STOP} ·`)).toBeDisplayed({ wait: 15000 });
            const after = await price('Buyurtma tafsilotlari\n');
            console.log(`    Narx: ${DESTINATION} → ${before}, ${SECOND_STOP} → ${after}`);
            expect(after).toBeGreaterThan(0);
            if (after === before) softBug(`Delivery: manzil o'zgarganda narx qayta hisoblanmadi (${before} so'm)`);
        });

        it('A5. To\'lov usullari: Naqd pul, kartalar (yashirin), "Karta qo\'shish"; naqd tanlanadi', async () => {
            await openDeliveryWithDestination();
            await tap(MAIN_PAYMENT);
            await expect(byDesc("To'lov usulini o'zgartirish")).toBeDisplayed({ wait: 8000 });
            await expect(byDesc('Naqd pul')).toBeDisplayed();
            await expect(byDesc("Karta qo'shish")).toBeDisplayed();
            const cards = await $$('android=new UiSelector().descriptionStartsWith("••••")');
            console.log(`    Kartalar: ${cards.length} ta`);
            for (const c of cards) expect(await descOf(c)).toMatch(/^•••• \d{4}$/);
            await byDesc('Naqd pul').click();
            await byDesc('Tayyor').click();
        });

        it('A6. "20 kggacha yuk" ma\'lumot oynasi: qoidalar va "Yopish"', async () => {
            await openForm();
            await byDescStart('Buyurtma\n20 kggacha').click();
            await expect(byDesc('Kuryer posilkani yetkazib beradi')).toBeDisplayed({ wait: 8000 });
            await expect(byDescHas('20 kg gacha')).toBeExisting();
            await byDesc('Yopish').click();
            await expect(byDescStart('Buyurtma berish\n')).toBeDisplayed({ wait: 8000 });
        });

        it('A7. Vaqt: "Rejalashtirilgan" — tanlangan soat saqlanadi', async () => {
            await openForm();
            await byDesc('Hozirga').click();
            await expect(byDesc('Kuryer posilkani olish sanasi va vaqti')).toBeDisplayed({ wait: 8000 });
            await byDesc('Rejalashtirilgan').click();
            const hour = await $('android=new UiSelector().className("android.widget.SeekBar").descriptionContains(" soat")');
            await expect(hour).toBeDisplayed({ wait: 5000 });
            const { x, y } = await hour.getLocation();
            const { width, height } = await hour.getSize();
            const cx = Math.round(x + width / 2);
            await driver.execute('mobile: dragGesture', { startX: cx, startY: Math.round(y + height * 0.68), endX: cx, endY: Math.round(y + height * 0.4), speed: 300 });
            await driver.pause(3500);
            const picked = (await descOf(hour)).replace(/\D/g, '');
            const minute = (await descOf(await $('android=new UiSelector().className("android.widget.SeekBar").descriptionContains(" daqiqa")'))).replace(/\D/g, '');
            await byDesc('Saqlash').click();
            await driver.pause(2000);
            const shown = await findDesc(/^\d{2}:\d{2}$/);
            console.log(`    Tanlangan: ${picked}:${minute}, formada: ${shown}`);
            if (shown.split(':')[0] !== picked.padStart(2, '0')) {
                softBug(`Delivery: "Rejalashtirilgan" vaqtda ${picked}:${minute} tanlanadi, lekin formada "${shown}" saqlanadi (tanlangan soat yo'qoladi)`);
            }
            // "Hozirga" ga qaytaramiz
            if (shown) await byDesc(shown).click(); else await byDesc('Hozirga').click();
            await byDesc('Hozirga').click();
            await byDesc('Saqlash').click();
            await expect(byDesc('Hozirga')).toBeDisplayed({ wait: 5000 });
        });

        it('A8. Qabul qiluvchi: boshqa raqamni qo\'lda kiritish', async () => {
            await openForm();
            await receiverOther(OTHER_PHONE);
            await expect($('android=new UiSelector().text("+998 90 123 45 67")')).toBeDisplayed();
        });

        it('A9. Negativ: qisqa telefon raqami qabul qilinmaydi', async () => {
            await openForm();
            await openReceiverSheet();
            await tap([0.5, 0.432]);
            await fillFocused('90123');
            await byDescStart('90123').click().catch(() => {});
            await driver.pause(1500);
            if (await byDesc('Qabul qiluvchi').isDisplayed().catch(() => false)) {
                // To'g'ri xatti-harakat: raqam qabul qilinmadi (lekin xato matni yo'q)
                softBug('Delivery: noto\'g\'ri (qisqa) telefon raqamida maydon faqat rangga bo\'yaladi — xato matni yo\'q; raqam uchun matnli klaviatura ochiladi');
                await driver.back();
                await driver.pause(1500);
            } else {
                const short = await $('android=new UiSelector().textStartsWith("+998 90 123")');
                const shown = (await short.isExisting()) ? await short.getText() : '';
                softBug(`Delivery: qisqa (noto'g'ri) telefon raqami qabul qiluvchi sifatida qabul qilindi — formada "${shown}"`);
                // Qoralamada noto'g'ri raqam qolmasin — "O'zim" ga qaytaramiz
                await receiverSelf();
            }
        });

        it('A10. Ko\'p nuqta: "Yangi manzil qo\'shish" → narx oshadi; "Marshrut" tartibi va o\'chirish', async () => {
            const base = await openForm();
            await byDesc("Yangi manzil qo'shish").click();
            await driver.pause(1500);
            await shellText(SEARCH);
            await pickSearchResult();
            await expect(byDesc(SECOND_STOP)).toBeDisplayed({ wait: 15000 });
            await dismissKeyboard({ waitForIt: 4000 }); // yangi nuqta qo'shilgach ilova uning izoh maydoniga kechikib fokus beradi
            const two = await price('Buyurtma berish\n');
            console.log(`    Narx: 1 nuqta ${base}, 2 nuqta ${two}`);
            expect(two).toBeGreaterThan(base);

            // Marshrut: ikkinchi nuqtani birinchi o'ringa sudraymiz
            const { width } = await driver.getWindowSize();
            await scrollFormToBottom();
            await byDesc("Tartibni o'zgartirish").click();
            await expect(byDesc('Marshrut')).toBeDisplayed({ wait: 8000 });
            const last = await byDescHas(SECOND_STOP);
            const { y: ly } = await last.getLocation();
            const { height: lh } = await last.getSize();
            await driver.execute('mobile: shell', { command: 'input', args: ['draganddrop', String(Math.round(width * 0.93)), String(Math.round(ly + lh / 2)), String(Math.round(width * 0.93)), String(Math.round(ly - lh * 0.6)), '1500'] });
            await driver.pause(2000);
            await expect(byDesc(`1\n${SECOND_STOP}`)).toBeExisting({ wait: 5000 });
            await byDesc('Bekor qilish').click();
            await driver.pause(2000);
            const reordered = await price('Buyurtma berish\n');
            console.log(`    Tartib o'zgargach narx: ${reordered}`);
            // "Bekor qilish" o'zgarishni qaytarishi kerak edi
            const first = await byDesc(SECOND_STOP);
            const second = await destEl();
            if ((await first.getLocation()).y < (await second.getLocation()).y) {
                softBug('Delivery: "Marshrut" oynasida "Bekor qilish" bosilsa ham nuqtalar tartibi o\'zgargan holda qoladi');
            }

            // Nuqtani o'chirish (✕) → narx qaytadi
            await scrollFormToBottom();
            await byDesc("Tartibni o'zgartirish").click();
            await expect(byDesc('Marshrut')).toBeDisplayed({ wait: 8000 });
            const row = await byDescHas(SECOND_STOP);
            const { y: ry } = await row.getLocation();
            const { height: rh } = await row.getSize();
            await driver.execute('mobile: clickGesture', { x: Math.round(width * 0.852), y: Math.round(ry + rh / 2) });
            await driver.pause(2000);
            if (await byDesc('Marshrut').isDisplayed().catch(() => false)) await byDesc('Bekor qilish').click().catch(() => {});
            await driver.pause(2000);
            await expect(byDesc(SECOND_STOP)).not.toBeExisting();
            console.log(`    Nuqta o'chirilgach narx: ${await price('Buyurtma berish\n')}`);
        });
    });

    // ───────────────────────────── B. Negativ holatlar (buyurtma yaratilmaydi)
    describe('B. Negativ holatlar', () => {
        it('B1. Qabul qiluvchi telefoni bo\'sh — buyurtma yaratilmaydi', async () => {
            await openForm();
            if ((await phonesOnForm()) > 1) { console.log('    Qabul qiluvchi qoralamada to\'ldirilgan — o\'tkazib yuborildi'); return; }
            await selectCash();
            await byDescStart('Buyurtma berish\n').click();
            await driver.pause(3000);
            await expect(byDescStart('Buyurtma #')).not.toBeExisting();
            await expect(byDescStart('Buyurtma berish\n')).toBeDisplayed();
            softBug('Delivery: qabul qiluvchi telefoni bo\'sh bo\'lsa faqat "!" belgisi chiqadi — xato matni yo\'q va u ekran o\'quvchiga ko\'rinmaydi');
        });

        it('B2. "Uy raqami kiritilmagan" oynasi: "Uy raqamini kiritish" formaga qaytaradi', async () => {
            if ((await phonesOnForm()) < 2) await receiverSelf();
            await selectCash();
            await tap(FORM.pickupPodyezd);
            await fillFocused('5');
            await byDescStart('Buyurtma berish\n').click();
            const dlg = await byDesc('Uy raqami kiritilmagan');
            if (!(await dlg.waitForDisplayed({ timeout: 5000 }).catch(() => false))) { console.log('    Oyna chiqmadi (manzilda uy raqami bor)'); return; }
            await expect(byDesc('Uy raqamisiz davom etish')).toBeDisplayed();
            await byDesc('Uy raqamini kiritish').click();
            await driver.pause(2000);
            await expect(byDescStart('Buyurtma berish\n')).toBeDisplayed();
            await expect(byDescStart('Buyurtma #')).not.toBeExisting();
            softBug('Delivery: "Uy raqamini kiritish" bosilganda formada uy raqami uchun alohida maydon ko\'rsatilmaydi');
        });

        it('B3. Juda uzun izoh (300 belgi) — ilova buzilmaydi', async () => {
            await openForm();
            await tap(FORM.pickupComment);
            const long = 'A'.repeat(300);
            const got = await fillFocused(long);
            console.log(`    Izoh maydoni qabul qildi: ${got.length} belgi`);
            await expect(byDescStart('Buyurtma berish\n')).toBeExisting();
        });

        it('B4. Olib ketish va yetkazish manzili bir xil — buyurtma yaratilmaydi, foydalanuvchiga sabab aytiladi', async () => {
            await openDelivery();
            const pickup = await pickupAddress();
            if (pickup !== SAVED) { console.log(`    Olib ketish manzili "${pickup}" — saqlangan manzil bilan bir xil emas, case o'tkazib yuborildi`); return; }
            await openDeliveryWithDestination({ sameAsPickupAllowed: true });
            await byDescStart('Buyurtma tafsilotlari\n').click();
            await expect(byDescStart('Buyurtma berish\n')).toBeDisplayed({ wait: 15000 });
            await removeExtraStops();
            if ((await phonesOnForm()) < 2) await receiverSelf();
            await selectCash();
            await byDescStart('Buyurtma berish\n').click();
            await driver.pause(6000);
            await ensureClient();
            const created = await byDescStart('Buyurtma #').isExisting().catch(() => false);
            if (created) {
                const no = (await descOf(await byDescStart('Buyurtma #'))).replace(/\D/g, '');
                softBug(`Delivery: olib ketish va yetkazish manzili bir xil ("${SAVED}") bo'lsa ham buyurtma #${no} yaratildi`);
                // Bekor qilmaymiz (blok xavfi) — kuryer orqali yakunlaymiz
                await acceptOnCourier(no, {});
                await finishOnCourier(no);
                await assertInHistory(no, 'Yakunlandi');
                return;
            }
            // Buyurtma yaratilmadi — ekranda sabab yozilgan xabar bo'lishi kerak
            const msg = await findDesc(/bir xil|xato|mumkin emas|cheklov/i);
            console.log(`    Buyurtma yaratilmadi; ekrandagi xabar: "${msg || 'yo\'q'}"`);
            if (/cheklov/i.test(msg)) throw new Error(`Akkaunt bloklangan ("${msg}") — B4 natijasini aniqlab bo'lmaydi`);
            if (!msg) {
                softBug(`Delivery: olib ketish va yetkazish manzili bir xil bo'lganda (${SAVED}) "Buyurtma berish" hech narsa qilmaydi — buyurtma yaratilmaydi va sababi aytilmaydi`);
            }
            await expect(byDescStart('Buyurtma #')).not.toBeExisting();
        });
    });

    // ───────────────────────────── C. Naqd buyurtmalar (kuryer ilovasida yakunlanadi)
    describe('C. Buyurtmalar (naqd pul)', () => {
        it('C1. Oddiy buyurtma: qabul qiluvchi "O\'zim" → kuryer yetkazadi → "Yakunlandi" → bildirishnoma', async () => {
            await openForm();
            if ((await phonesOnForm()) < 2) await receiverSelf();
            expect(await phonesOnForm()).toBe(2);
            await selectCash();
            const { orderNo, price: p } = await placeOrder();
            await completeCashOrder(orderNo, p);
            softBug('Kuryer ilovasi: naqd buyurtma "Не оплачено" holatida turib "Доставлено" qilinadi — naqd pul olinganini tasdiqlash qadami yo\'q');
            await assertNotified(orderNo);
        });

        it('C2. Boshqa qabul qiluvchi, yetkazish nuqtasiga podyezd va izoh, "Havola yuborilsinmi?" yoqilgan', async () => {
            await openForm();
            await receiverOther(OTHER_PHONE);
            await tap(FORM.linkToggle);
            await selectCash();
            // Yetkazish nuqtasi podyezdi va izohi (oxirida — klaviatura ochiq qoladi)
            await tap(FORM.dropPodyezd);
            await fillFocused('2');
            const comment = `Autotest-yetkazish-${Date.now() % 100000}`;
            const fields = await wideEditTexts();
            const drop = fields[fields.length - 1];
            await drop.click();
            await fillFocused(comment);
            const { orderNo, price: p } = await placeOrder();
            const courier = await acceptOnCourier(orderNo, { destination: DESTINATION, price: p });
            const saw = courier.texts.some(t => t.includes(comment));
            console.log(`    Kuryer panelida yetkazish izohi: ${saw ? 'bor' : 'YO\'Q'}`);
            if (!saw) softBug(`Delivery: yetkazish nuqtasiga yozilgan izoh ("${comment}") kuryer ilovasida ko'rinmadi`);
            await assertCashInTracking(p, orderNo);
            const recipient = await $('android=new UiSelector().descriptionContains("90 123 45 67")');
            if (!(await recipient.isExisting())) softBug('Delivery: kuzatuv ekranida qabul qiluvchining boshqa raqami ko\'rinmadi');
            await finishOnCourier(orderNo);
            await assertInHistory(orderNo, 'Yakunlandi', p);
        });

        it('C3. Olib ketish nuqtasiga podyezd va izoh + "Eshikdan eshikgacha" (narx oshadi) — kuryer izohni ko\'radi', async () => {
            const base = await openForm();
            if ((await phonesOnForm()) < 2) await receiverSelf();
            const before = await price('Buyurtma berish\n');
            await tap(FORM.doorToggle);
            await driver.pause(2500);
            const after = await price('Buyurtma berish\n');
            console.log(`    Narx: ${base} → ${before} → eshikdan eshikgacha ${after}`);
            if (after === before) softBug(`Delivery: "Eshikdan eshikgacha" yoqilganda narx o'zgarmadi (${before} so'm)`);
            await selectCash();
            await tap(FORM.pickupPodyezd);
            await fillFocused('3');
            const comment = `Autotest-izoh-${Date.now() % 100000}`;
            const [pickupComment] = await wideEditTexts();
            await pickupComment.click();
            expect(await fillFocused(comment)).toBe(comment);
            const { orderNo, price: p } = await placeOrder();
            expect(p).toBe(after);
            const courier = await acceptOnCourier(orderNo, { destination: DESTINATION, price: p });
            const saw = courier.texts.some(t => t.includes(comment));
            console.log(`    Kuryer panelida izoh: ${saw ? 'bor' : 'YO\'Q'}`);
            if (!saw) softBug(`Delivery: kuryerga yozilgan izoh ("${comment}") kuryer ilovasida ko'rinmadi`);
            await assertCashInTracking(p, orderNo);
            await finishOnCourier(orderNo);
            await assertInHistory(orderNo, 'Yakunlandi', p);
        });

        it('C4. Ko\'p nuqtali buyurtma (2 ta yetkazish) — kuryer ikkala nuqtaga yetkazadi', async () => {
            await openForm();
            if ((await phonesOnForm()) < 2) await receiverSelf();
            await byDesc("Yangi manzil qo'shish").click();
            await driver.pause(1500);
            await shellText(SEARCH);
            await pickSearchResult();
            await expect(byDesc(SECOND_STOP)).toBeDisplayed({ wait: 15000 });
            await dismissKeyboard({ waitForIt: 4000 }); // yangi nuqta qo'shilgach ilova uning izoh maydoniga kechikib fokus beradi
            // Ikkinchi nuqta qabul qiluvchisi: uning telefon qatori nuqta nomidan ~0.11 ekran pastda
            const stop = await byDesc(SECOND_STOP);
            const { y } = await stop.getLocation();
            const { height } = await driver.getWindowSize();
            await receiverSelf([0.486, (y / height) + 0.13]);
            expect(await phonesOnForm()).toBe(3);
            await selectCash();
            const { orderNo, price: p } = await placeOrder();
            const { steps } = await completeCashOrder(orderNo, p);
            expect(steps.filter(s => s === 'Доставлено').length).toBe(2);
        });

        it('C5. Yakunlangan buyurtma tafsiloti: "Kvitansiya OFD" va "Qo\'llab-quvvatlash" ochiladi', async () => {
            await restartApp();
            await openTab('Buyurtmalar');
            const done = await byDescStart('Yetkazib berish\nYakunlandi\n');
            await expect(done).toBeDisplayed({ wait: 15000 });
            await done.click();
            await driver.pause(3000);
            await revealInSheet(() => byDesc('Kvitansiya OFD'));
            await byDesc('Kvitansiya OFD').click();
            await driver.pause(3000);
            console.log(`    Kvitansiya: ${await driver.getCurrentPackage()} / ${(await $('android=new UiSelector().descriptionMatches(".+").instance(1)').getAttribute('content-desc').catch(() => ''))}`);
            await driver.activateApp(PACKAGE);
            await driver.back();
            await driver.pause(1500);
        });
    });

    // ───────────────────────────── D. Bekor qilish
    // DIQQAT: har qanday bekor qilish (kuryer qabul qilmasdan oldin ham) blok hisobiga kiradi — ~4 tadan keyin
    // "Ko'p bekor qilish sababli cheklov qo'yildi". Shuning uchun haqiqiy bekor qilish butun yurishda BITTA:
    // oynadagi barcha sabablar va "Yo'q, qaytish" tekshiriladi, keyin bitta sabab bilan bekor qilinadi.
    // Karta bilan to'lov: foydalanuvchi ruxsati — karta buyurtmasi FAQAT bekor qilinadi, hech qachon yakunlanmaydi.
    // Shu sababli bu yagona haqiqiy bekor qilish ham shu yerda (kuryer oflayn turadi, hech kim qabul qilmaydi).
    describe('D. Karta bilan to\'lov va bekor qilish', () => {
        it('D1. Karta bilan buyurtma: kuzatuvda karta ko\'rinadi; bekor qilish oynasi — 4 sabab, "Yo\'q, qaytish"; so\'ng bekor qilinadi', async () => {
            await openForm();
            if ((await phonesOnForm()) < 2) await receiverSelf();
            const card = await selectCard();
            const { orderNo, price: p } = await placeOrder({ payLabel: `karta ${card}` });
            await driver.activateApp(PACKAGE);
            if (!(await byDescStart('Buyurtma #').waitForDisplayed({ timeout: 8000 }).catch(() => false))) await openFromHistory(orderNo);
            if (!(await byDesc('Kuryer qidirilmoqda').isExisting().catch(() => false))) {
                // Karta buyurtmasini yakunlash taqiqlangan — bekor qilamiz va foydalanuvchiga xabar beramiz
                softBug(`Delivery: karta buyurtmasi #${orderNo} ni kimdir darhol qabul qildi (kuryerlar oflayn bo'lishi kerak edi)`);
                throw new Error(`Karta buyurtmasi #${orderNo} kuryer tomonidan qabul qilindi — uni QO'LDA bekor qiling (yakunlanmasin!)`);
            }
            // Kuzatuv ekranida to'lov turi — karta (naqd emas)
            // Kuzatuvda karta qatori: "Card\n5614********9539\n13 000 so'm" (UZ tilida ham "Card")
            const last4 = card.replace(/\D/g, '').slice(-4);
            const cardRow = () => $(`android=new UiSelector().descriptionMatches("(?s).*[*]{4,}${last4}.*").instance(0)`);
            const shown = await revealInSheet(cardRow);
            const payRow = shown ? await descOf(await cardRow()) : '';
            console.log(`    Kuzatuvda to'lov: "${payRow.replace(/\n/g, ' ') || 'topilmadi'}"`);
            if (!payRow) softBug(`Delivery: karta bilan to'langan #${orderNo} kuzatuv ekranida karta (*${last4}) ko'rsatilmadi`);
            else {
                expect(money(payRow.split('\n').pop())).toBe(p);
                if (payRow.startsWith('Card')) softBug(`Delivery kuzatuv ekrani (UZ): to'lov turi inglizcha — "Card" ("Karta" bo'lishi kerak)`);
            }
            if (await byDescStart('Cash\n').isExisting().catch(() => false) || await byDescStart('Naqd').isExisting().catch(() => false)) {
                softBug(`Delivery: karta bilan to'langan #${orderNo} kuzatuvda naqd ("Cash/Naqd") deb ko'rsatildi`);
            }
            await revealInSheet(() => byDesc('Bekor qilish'));
            await byDesc('Bekor qilish').click();
            await expect(byDescHas('qaytish')).toBeDisplayed({ wait: 8000 });
            // Har bir sabab ro'yxatda bor va tanlanadi (tanlash o'zi bekor qilmaydi)
            for (const r of Object.values(REASONS)) {
                const opt = await byDescHas(r);
                if (!(await opt.isExisting())) { softBug(`Delivery: bekor qilish sabablari ro'yxatida "${r}" yo'q`); continue; }
                await opt.click();
                await driver.pause(600);
            }
            await byDescHas('qaytish').click();
            await driver.pause(2000);
            await expect(byDescStart('Buyurtma #')).toBeExisting();
            await expect(byDesc('Kuryer qidirilmoqda')).toBeExisting();
            // Yagona haqiqiy bekor qilish (kuryer hali qabul qilmagan — cancelBeforeCourier yetkazishga o'tmasligi uchun
            // yuqorida "Kuryer qidirilmoqda" tekshirildi)
            await revealInSheet(() => byDesc('Bekor qilish'));
            await byDesc('Bekor qilish').click();
            await expect(byDescHas('bekor qilish sababini')).toBeExisting({ wait: 8000 });
            await byDescHas(REASONS.changedMind).click();
            await driver.pause(800);
            await byDescHas('Ha, bekor').click();
            await driver.pause(3000);
            const parts = await assertInHistory(orderNo, 'Bekor qilindi');
            if (money(parts[3]) !== 0) softBug(`Delivery: bekor qilingan karta buyurtmasi #${orderNo} tarixda "${parts[3]}" ko'rsatadi (0 so'm bo'lishi kerak)`);
        });
    });

    // ───────────────────────────── F. Ko'p manzilli buyurtmalar va bitta kuryerda ikki buyurtma (naqd)
    describe('F. Ko\'p manzil, barcha maydonlar, jonli holatlar, bitta kuryerda 2 buyurtma', () => {
        // Formada qo'shimcha nuqtalar qo'shib, har biriga qabul qiluvchi "O'zim" qo'yadi
        async function addStops(prefixes) {
            const names = [];
            let last = await price('Buyurtma berish\n');
            for (const prefix of prefixes) {
                const name = await addStop(prefix);
                await receiverSelfForStop(name);
                await driver.pause(1500);
                const now = await price('Buyurtma berish\n');
                console.log(`    + ${name}: narx ${last} → ${now}`);
                if (now < last) softBug(`Delivery: "${name}" nuqtasi qo'shilganda narx kamaydi (${last} → ${now} so'm)`);
                names.push(name); last = now;
            }
            return names;
        }

        // Ko'p manzilli naqd buyurtma: har bir nuqtaga podyezd va izoh (qavat/kv/uy izohda — formada alohida
        // maydon yo'q), ixtiyoriy "Eshikdan eshikgacha"
        async function richOrder(prefixes, tag, { door = false } = {}) {
            await openForm();
            if ((await phonesOnForm()) < 2) await receiverSelf();
            const info = {};
            const fieldsFor = i => ({ podyezd: String(i + 1), comment: `${tag}_N${i}_qavat${i + 2}_kv${10 + i}_uy${5 + i}` });
            // 1) Forma tepada turganda: olib ketish va birinchi yetkazish manzili (keyin yuqoriga surish shart emas)
            let pickup = '';
            for (const n of nodesFromSource(await driver.getPageSource())) {
                if (n.desc.includes('\n') || n.x < px(120) || n.x > px(300) || n.y < px(500)) continue;
                pickup = n.desc; break; // sarlavhadan keyingi birinchi chap yorliq — olib ketish manzili
            }
            if (!pickup) throw new Error('Formada olib ketish manzili topilmadi');
            const pf = fieldsFor(0);
            await fillStopFields(() => $(`android=new UiSelector().description("${pickup}").instance(0)`), pf, [DESTINATION]);
            info[`olib ketish (${pickup})`] = pf;
            const df = fieldsFor(1);
            await fillStopFields(() => lastOf(`android=new UiSelector().description("${DESTINATION}")`), df, [DESTINATION]);
            info[DESTINATION] = df;
            // 2) Yangi manzillar va ularning maydonlari (har biri qo'shilgach — u ekranning pastida turadi)
            const names = await addStops(prefixes);
            const drops = [DESTINATION, ...names];
            for (let i = drops.length; i >= 2; i--) {
                const f = fieldsFor(i);
                await fillStopFields(() => lastOf(`android=new UiSelector().description("${drops[i - 1]}")`), f, drops);
                info[drops[i - 1]] = f;
            }
            const stops = [pickup, ...drops];
            if (door) {
                // "Eshikdan eshikgacha" kalitigacha pastga surish — ko'rinib turgan manzil yorlig'idan (input emas)
                const { height } = await driver.getWindowSize();
                await dismissKeyboard();
                for (let i = 0; i < 6 && (await $$('android.widget.Switch')).length === 0; i++) {
                    let from = Math.round(height * 0.6);
                    for (const a of [...stops].reverse()) {
                        const e = await $(`android=new UiSelector().description("${a}").instance(0)`);
                        const ay = await e.getLocation().then(l => l.y).catch(() => -1);
                        if (ay > px(200) && ay < height * 0.8) { from = ay + px(20); break; }
                    }
                    await driver.execute('mobile: shell', { command: 'input', args: ['swipe', String(px(430)), String(from), String(px(430)), String(Math.max(px(250), from - Math.round(height * 0.4))), '700'] });
                    await driver.pause(1500);
                }
                const before = await price('Buyurtma berish\n');
                const sw = await $$('android.widget.Switch');
                await sw[0].click();
                await driver.pause(2500);
                const after = await price('Buyurtma berish\n');
                console.log(`    Eshikdan eshikgacha: ${before} → ${after}`);
                if (after === before) softBug(`Delivery: "Eshikdan eshikgacha" yoqilganda narx o'zgarmadi (${before} so'm)`);
            }
            await selectCash();
            const o = await placeOrder();
            await assertCashInTracking(o.price, o.orderNo);
            return { ...o, stops: stops.slice(1), info, tag };
        }

        // Formadagi olib ketish manzili yorlig'i — eng yuqoridagi manzil elementi (Podyezd maydoni yonidagi)
        // Forma surilganda olib ketish yorlig'i daraxtdan chiqib ketadi — manzil yorlig'idan (input emas) pastga surib qaytaramiz
        async function pickupLabelOnForm(stopNames) {
            const pickup = await $('android=new UiSelector().descriptionStartsWith("Buyurtma\n20 kg").instance(0)');
            for (let i = 0; i < 5 && !(await pickup.isExisting().catch(() => false)); i++) {
                let from = px(900);
                for (const n of stopNames) {
                    const e = await $(`android=new UiSelector().description("${n}").instance(0)`);
                    if (await e.isExisting().catch(() => false)) { from = Math.max(px(400), (await e.getLocation()).y + px(30)); break; }
                }
                await driver.execute('mobile: shell', { command: 'input', args: ['swipe', String(px(430)), String(from), String(px(430)), String(from + px(1100)), '600'] });
                await driver.pause(1200);
            }
            // Sarlavha ostidagi birinchi bir qatorli manzil yorlig'i — olib ketish
            const hy = await pickup.getLocation().then(l => l.y).catch(() => 0);
            // Manzil nomlari chap tomonda (x≈182); "O'zim", "Hozirga" kabi yozuvlar o'ngda — ularni olmaymiz
            let best = '', bestY = 1e9;
            for (const n of nodesFromSource(await driver.getPageSource())) {
                const d = n.desc;
                if (d.includes('\n') || /^\d+$/.test(d) || n.x < px(120) || n.x > px(300)) continue;
                if (n.y > hy + 200 && n.y < bestY) { best = d; bestY = n.y; }
            }
            if (!best) throw new Error('Formada olib ketish manzili topilmadi');
            return best;
        }

        // Kuryer bosqichlarda ko'rgan matnlarda har bir nuqta izohi bo'lishi va boshqa buyurtma izohi bo'lmasligi kerak
        function assertCourierSawInfo(order, seen) {
            const all = (seen || []).flatMap(s => s.texts).join('\n');
            for (const [stop, { podyezd, comment }] of Object.entries(order.info)) {
                const ok = all.includes(comment);
                console.log(`    Kuryer #${order.orderNo} — ${stop}: izoh ${ok ? 'bor' : 'YO\'Q'}, podyezd ${podyezd}`);
                if (!ok) softBug(`Kuryer ilovasi: #${order.orderNo} "${stop}" nuqtasi izohi ("${comment}") kuryerga ko'rinmadi`);
            }
            const foreign = all.match(/F\d[AB]_N\d/g) || [];
            const wrong = foreign.filter(t => !t.startsWith(order.tag));
            if (wrong.length) softBug(`Kuryer ilovasi: #${order.orderNo} bosqichlarida boshqa buyurtma ma'lumoti ko'rindi (${[...new Set(wrong)].join(', ')})`);
            expect(wrong.length).toBe(0);
        }

        function assertLiveStatuses(orderNo, list) {
            const statuses = list.map(s => s.status);
            console.log(`    #${orderNo} client holatlari: ${statuses.join(' → ')}`);
            const distinct = [...new Set(statuses.filter(s => !s.startsWith('(')))];
            if (statuses.includes('Kuryer qidirilmoqda')) softBug(`Delivery: #${orderNo} kuryer qabul qilgach ham client'da "Kuryer qidirilmoqda" ko'rsatildi (holat jonli yangilanmadi)`);
            if (distinct.length < 2) softBug(`Delivery: #${orderNo} kuryer bosqichlari o'zgarganda client holati jonli (ilovani qayta ochmasdan) yangilanmadi: ${statuses.join(' → ')}`);
            expect(list.length).toBeGreaterThan(0);
        }

        // 3 va 4 manzil: test serverda tarif yo'q (order.delivery.tariff.not.found) — shunda bug yoziladi va case o'tkaziladi
        it('F1. 3 va 4 yetkazish manzili (barcha maydonlar) — narx har nuqtada hisoblanadi, kuryer 4 nuqtaga yetkazadi, holatlar jonli', async function () {
            this.timeout(45 * 60 * 1000);
            let o1;
            try {
                o1 = await richOrder(STOP_PREFIXES, 'F1A'); // 1 + 3 = 4 ta yetkazish manzili (3-manzilda ham eval tekshiriladi)
            } catch (e) {
                // Alice javob tanasini accessibility orqali bermaydi — 3+ manzilda 422 = shu ma'lum backend bugi
                if (/tariff\.not\.found|\| 422\b/.test(String(e))) {
                    softBug('Delivery (backend): 3+ yetkazish manzilli buyurtma yaratilmaydi — 422 "order.delivery.tariff.not.found"; ilova xatoni ko\'rsatmaydi, narx eski qoladi');
                    this.skip();
                }
                throw e;
            }
            const watch = liveStatusWatcher();
            await acceptOnCourier(o1.orderNo, { destination: DESTINATION, price: o1.price });
            const steps = await finishOnCourier(o1.orderNo, { onStep: watch.onStep });
            expect(steps.filter(s => s === 'Доставлено').length).toBe(4);
            assertCourierSawInfo(o1, steps.seen[o1.orderNo]);
            assertLiveStatuses(o1.orderNo, watch.log[o1.orderNo] || []);
            await assertInHistory(o1.orderNo, 'Yakunlandi', o1.price);
        });

        // Ikki buyurtma bitta kuryerda: har biri 2 manzilli, barcha maydonlar to'ldirilgan, 1-sida eshikdan eshikgacha.
        // Kuryerda bitta buyurtma bo'lsa ikkinchisi avtomatik tushmaydi — 2-buyurtmani foydalanuvchi admin paneldan
        // qo'lda biriktiradi (test 15 daqiqagacha kutadi)
        it('F2. Ikki buyurtma bitta kuryerda — barcha maydonlar kuryerga to\'g\'ri boradi, holatlar jonli, aralashmaydi', async function () {
            this.timeout(50 * 60 * 1000);
            // Qo'lda biriktirish kerak — to'liq avtomatik yurishda o'tkazib yuboriladi. Ishga tushirish: $env:WITH_MANUAL='1'
            if (!process.env.WITH_MANUAL) { console.log("    F2 o'tkazib yuborildi (qo'lda biriktirish kerak; WITH_MANUAL=1 bilan ishga tushiring)"); this.skip(); }
            await clearCourier(); // kuryer bo'sh bo'lsin: u bir vaqtda 2 tadan ortiq buyurtma ololmaydi
            const o1 = await richOrder([SEARCH], 'F2A', { door: true });
            await acceptOnCourier(o1.orderNo, { destination: DESTINATION, price: o1.price });
            const o2 = await richOrder(['Mustaqillik'], 'F2B');
            expect(o2.orderNo).not.toBe(o1.orderNo);
            console.log(`    ⏳ ⏳ ⏳  #${o2.orderNo} (${o2.price} so'm) ni kuryer 997274471 ga QO'LDA BIRIKTIRING — 15 daqiqa kutiladi`);
            fs.writeFileSync('reports/assign-request.txt', `${new Date().toISOString()} #${o2.orderNo} ni kuryer 997274471 ga biriktiring\n`);
            const c2 = await acceptOnCourier(o2.orderNo, { keep: [o1.orderNo], timeout: 15 * 60 * 1000, marker: 'F2B_N' });
            if (c2.courierNo !== o2.orderNo) softBug(`Delivery: admin paneldan qo'lda biriktirilgan buyurtma kuryer ilovasida boshqa raqam bilan chiqadi — client #${o2.orderNo}, kuryer #${c2.courierNo}`);
            const watch = liveStatusWatcher();
            const steps = await finishOnCourier([o1.orderNo, o2.orderNo], { onStep: watch.onStep, aliases: { [c2.courierNo]: o2.orderNo } });
            const by = steps.byOrder;
            for (const [no, s] of Object.entries(by)) console.log(`    Kuryer #${no}: ${s.join(' → ')}`);
            expect(by[o1.orderNo].filter(s => s === 'Доставлено').length).toBe(2);
            expect(by[o2.orderNo].filter(s => s === 'Доставлено').length).toBe(2);
            assertCourierSawInfo(o1, steps.seen[o1.orderNo]);
            assertCourierSawInfo(o2, steps.seen[o2.orderNo]);
            assertLiveStatuses(o1.orderNo, watch.log[o1.orderNo] || []);
            assertLiveStatuses(o2.orderNo, watch.log[o2.orderNo] || []);
            // Tarix: ikkala buyurtma o'z holati va narxi bilan
            await restartApp();
            await openTab('Buyurtmalar');
            for (const o of [o1, o2]) {
                const card = await byDescHas(`\n${o.orderNo}\n`);
                await expect(card).toBeDisplayed({ wait: 20000 });
                const parts = (await descOf(card)).split('\n');
                console.log(`    Tarixda: ${parts.join(' / ')} | ${o.stops.join(' → ')}`);
                expect(parts[1]).toBe('Yakunlandi');
                expect(money(parts[3])).toBe(o.price);
            }
        });
    });

    // ───────────────────────────── G. Bildirishnoma tili + eshikdan eshikgacha
    // Ilova tili qaysi bo'lsa, buyurtma bildirishnomalari (push) ham shu tilda kelishi kerak.
    // Buyurtma o'zbekcha interfeysda yaratiladi (yordamchilar o'zbekcha yozuvlarga tayanadi), keyin til
    // almashtiriladi va kuryer yetkazadi — shu paytdagi bildirishnomalar tekshiriladi. Oxirida til O'zbekchaga qaytadi.
    describe('G. Bildirishnoma tili va eshikdan eshikgacha', () => {
        const LANGS = {
            ru: { label: 'Русский', check: t => /[А-Яа-яЁё]/.test(t), name: 'ruscha' },
            en: { label: 'English', check: t => !/[А-Яа-яЁё]/.test(t) && /\b(order|courier|deliver|arriv|accept|picked|on the way|your)/i.test(t), name: 'inglizcha' },
            uz: { label: "O'zbek tili", check: t => !/[А-Яа-яЁё]/.test(t) && /(buyurtma|kuryer|yetkaz|qabul|yo['‘ʻ]l)/i.test(t), name: "o'zbekcha" },
        };

        // Ilova tilini almashtiradi: Akkaunt (pastki menyu 4-tabi) → Til/Язык/Language → til
        async function setLanguage(label) {
            await restartApp();
            const { width, height } = await driver.getWindowSize();
            await driver.execute('mobile: clickGesture', { x: Math.round(width * 0.875), y: Math.round(height * 0.917) });
            await driver.pause(1500);
            let opened = false;
            for (const name of ['Til', 'Язык', 'Language']) {
                const el = await byDesc(name);
                if (await el.isDisplayed().catch(() => false)) { await el.click(); opened = true; break; }
            }
            if (!opened) throw new Error('Akkauntda "Til" bo\'limi topilmadi');
            await driver.pause(1500);
            await byDescHas(label).click();
            await driver.pause(2500);
            console.log(`    Ilova tili: ${label}`);
        }

        // Telefondagi joriy bildirishnomalar (faqat client ilovasi), begona "E2E … рассылки" yuborilmalari chiqarib tashlanadi
        async function clientPushes() {
            const raw = String(await driver.execute('mobile: shell', { command: 'dumpsys', args: ['notification', '--noredact'] }));
            const out = [];
            let pkg = '', cur = {};
            const flush = () => { if (pkg === PACKAGE && (cur.title || cur.text)) out.push(`${cur.title || ''} | ${cur.text || ''}`.trim()); cur = {}; };
            for (const line of raw.split('\n')) {
                const rec = line.match(/NotificationRecord\(.*pkg=(\S+)/);
                if (rec) { flush(); pkg = rec[1]; continue; }
                const m = line.match(/android\.(title|text|bigText)=(?:String|SpannableString)?\s*\((.*)\)\s*$/);
                if (m && m[1] !== 'bigText') cur[m[1]] = m[2];
            }
            flush();
            return [...new Set(out)].filter(n => !/^E2E\b|рассылк/i.test(n));
        }

        // Bitta yetkazish manzilli, eshikdan eshikgacha yoqilgan naqd buyurtma (o'zbekcha interfeysda)
        async function doorToDoorOrder() {
            await openForm();
            if ((await phonesOnForm()) < 2) await receiverSelf();
            const before = await price('Buyurtma berish\n');
            await tap(FORM.doorToggle);
            await driver.pause(2500);
            const after = await price('Buyurtma berish\n');
            console.log(`    Eshikdan eshikgacha: ${before} → ${after}`);
            expect(after).toBeGreaterThan(before);
            await selectCash();
            const o = await placeOrder();
            expect(o.price).toBe(after);
            return o;
        }

        for (const code of ['ru', 'en', 'uz']) {
            const L = LANGS[code];
            it(`G${['ru', 'en', 'uz'].indexOf(code) + 1}. Til ${L.label}: eshikdan eshikgacha buyurtma — bildirishnomalar ${L.name}, kuryer "От двери до двери" ni ko'radi`, async function () {
                this.timeout(25 * 60 * 1000);
                if (code !== 'uz') await setLanguage("O'zbek tili"); // buyurtma o'zbekcha interfeysda yaratiladi
                const o = await doorToDoorOrder();
                const seenBefore = new Set(await clientPushes());
                if (code !== 'uz') await setLanguage(L.label);
                await driver.execute('mobile: shell', { command: 'cmd', args: ['statusbar', 'collapse'] }).catch(() => {});
                const courier = await acceptOnCourier(o.orderNo, { destination: DESTINATION, price: o.price });
                const doorSeen = courier.texts.some(t => /двери до двери/i.test(t));
                console.log(`    Kuryer: "От двери до двери" ${doorSeen ? 'ko\'rinadi' : 'KO\'RINMADI'}`);
                if (!doorSeen) softBug(`Kuryer ilovasi: eshikdan eshikgacha buyurtma #${o.orderNo} da "От двери до двери" belgisi ko'rinmadi`);
                await finishOnCourier(o.orderNo);
                await driver.pause(8000); // push kelishi uchun
                const fresh = (await clientPushes()).filter(n => !seenBefore.has(n));
                console.log(`    Yangi bildirishnomalar (${fresh.length}):\n${fresh.map(n => `      • ${n}`).join('\n') || '      —'}`);
                if (!fresh.length) softBug(`Bildirishnoma: ${L.label} tilida #${o.orderNo} buyurtma bo'yicha telefonga push kelmadi`);
                const wrong = fresh.filter(n => !L.check(n));
                if (wrong.length) softBug(`Bildirishnoma tili: ilova ${L.label} bo'lsa ham push boshqa tilda keldi — ${wrong.map(w => `"${w}"`).join('; ')}`);
                // Tilni qaytarib, tarixni tekshiramiz
                if (code !== 'uz') await setLanguage("O'zbek tili");
                await assertInHistory(o.orderNo, 'Yakunlandi', o.price);
                expect(wrong.length).toBe(0);
            });
        }

        after(async () => { await setLanguage("O'zbek tili").catch(() => {}); });
    });

    // ───────────────────────────── E. Ikki marta bosish
    describe('E. Takroriy bosish', () => {
        it('E1. "Buyurtma berish" ni ikki marta tez bosish — faqat bitta buyurtma yaratiladi', async () => {
            await openForm();
            if ((await phonesOnForm()) < 2) await receiverSelf();
            await selectCash();
            const { orderNo } = await placeOrder({ doubleTap: true });
            // Tarixda hozir "Buyurtma yaratildi" holatidagi buyurtmalar — bittadan ko'p bo'lmasligi kerak
            await restartApp();
            await openTab('Buyurtmalar');
            const created = [];
            for (const c of await $$('android.view.View')) {
                const d = (await c.getAttribute('content-desc').catch(() => '')) || '';
                if (d.startsWith('Yetkazib berish\nBuyurtma yaratildi\n')) created.push(d.split('\n')[2]);
            }
            console.log(`    Yaratilgan (kuryer kutayotgan) buyurtmalar: ${created.join(', ') || orderNo}`);
            if (created.length > 1) softBug(`Delivery: "Buyurtma berish" ikki marta bosilganda ${created.length} ta buyurtma yaratildi (${created.join(', ')})`);
            // Bekor qilmaymiz (blok xavfi) — kuryer orqali yetkazamiz
            for (const no of created.length ? created : [orderNo]) {
                await acceptOnCourier(no, { destination: DESTINATION });
                await finishOnCourier(no);
                await assertInHistory(no, 'Yakunlandi');
            }
        });
    });
    // ───────────────────────────── H. Yuklama: ko'p buyurtma ketma-ket (faqat LOAD_COUNT berilganda)
    // Ishga tushirish: $env:LOAD_COUNT='20'; npm run test:load   (20 / 30 / 40). Faqat naqd Delivery buyurtmalar.
    // Foydalanuvchi qarori (2026-11-27): yaratilgan buyurtmalar bekor qilinmaydi va yopilmaydi — qoldiriladi.
    describe('H. Yuklama — ko\'p buyurtma ketma-ket', () => {
        const N = Number(process.env.LOAD_COUNT || 0);
        const created = [];
        const failed = [];

        before(function () {
            if (!N) { console.log('    H o\'tkazib yuborildi (yuklama testi uchun LOAD_COUNT=20 kabi bering)'); this.skip(); }
        });

        it(`H1. ${N || 'N'} ta naqd buyurtma ketma-ket yaratiladi (vaqt, xatolar, sekinlashish)`, async function () {
            this.timeout(N * 5 * 60 * 1000 + 60000);
            const started = Date.now();
            // Many open orders → the courier app on the same phone keeps jumping to the front and covers the
            // client screen. It is closed before every order (force-stop does not log the courier out).
            const closeCourier = () => driver.execute('mobile: shell', { command: 'am', args: ['force-stop', 'com.delivery.noor'] }).catch(() => {});
            for (let i = 1; i <= N; i++) {
                const t = Date.now();
                try {
                    await closeCourier();
                    await openForm();
                    if ((await phonesOnForm()) < 2) await receiverSelf();
                    await selectCash();
                    const { orderNo, price: p } = await placeOrder();
                    const sec = (Date.now() - t) / 1000;
                    created.push({ i, orderNo, price: p, sec: Number(sec.toFixed(1)) });
                    console.log(`    [${i}/${N}] #${orderNo}, ${p} so'm — ${sec.toFixed(1)} s`);
                } catch (e) {
                    const msg = String(e.message || e).split('\n')[0].slice(0, 300);
                    failed.push({ i, msg, sec: Number(((Date.now() - t) / 1000).toFixed(1)) });
                    console.log(`    [${i}/${N}] ✘ ${msg}`);
                    // Akkaunt bloklangan yoki faol buyurtmalar chegarasi — davom etish ma'nosiz
                    if (/cheklov|bloklangan|limit|chegara/i.test(msg)) {
                        softBug(`Yuklama: ${created.length} ta buyurtmadan keyin yangi buyurtma rad etildi — "${msg.slice(0, 200)}"`);
                        break;
                    }
                    if (failed.length >= 5 && failed.length > created.length) break;
                }
            }
            const total = (Date.now() - started) / 1000;
            const secs = created.map(c => c.sec);
            const avg = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
            const first5 = avg(secs.slice(0, 5));
            const last5 = avg(secs.slice(-5));
            console.log(`    ── Yuklama natijasi: ${created.length}/${N} yaratildi, ${failed.length} xato, jami ${(total / 60).toFixed(1)} daq`);
            if (secs.length) console.log(`    ── Bitta buyurtma: o'rtacha ${avg(secs).toFixed(1)} s, eng tez ${Math.min(...secs)} s, eng sekin ${Math.max(...secs)} s; dastlabki 5 ta o'rtacha ${first5.toFixed(1)} s, oxirgi 5 ta ${last5.toFixed(1)} s`);
            if (secs.length >= 10 && last5 > first5 * 1.5) softBug(`Yuklama: buyurtmalar ko'paygan sari ilova sekinlashdi — dastlabki 5 ta o'rtacha ${first5.toFixed(1)} s, oxirgi 5 ta ${last5.toFixed(1)} s`);
            if (failed.length) softBug(`Yuklama: ${failed.length}/${N} ta buyurtma yaratilmadi — ${[...new Set(failed.map(f => f.msg.slice(0, 120)))].join(' | ')}`);
            fs.mkdirSync('reports', { recursive: true });
            const file = `reports/load-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}-${N}.json`;
            fs.writeFileSync(file, JSON.stringify({ requested: N, created, failed, totalSec: Math.round(total), avgSec: Number(avg(secs).toFixed(1)), first5, last5 }, null, 2));
            console.log(`    ── Hisobot: ${file}`);
            expect(created.length).toBeGreaterThan(0);
        });

        it('H2. Ko\'p buyurtmada ilova: "faol buyurtma" soni va Buyurtmalar ro\'yxatida hammasi ko\'rinadi', async () => {
            if (!created.length) { console.log('    Yaratilgan buyurtma yo\'q — o\'tkazib yuborildi'); return; }
            await restartApp();
            // Bosh sahifadagi "Sizda N ta faol buyurtma bor"
            const banner = (await findDesc(/Sizda \d+ ta faol buyurtma/)) || '';
            const active = Number((banner.match(/Sizda (\d+) ta/) || [])[1] || 0);
            console.log(`    Bosh sahifa: "${banner.split('\n')[0] || 'banner yo\'q'}"`);
            if (active < created.length) softBug(`Yuklama: bosh sahifada ${active} ta faol buyurtma ko'rsatilgan, testda ${created.length} ta yaratildi`);
            // Buyurtmalar ro'yxati: ochilish vaqti va har bir yaratilgan raqam
            const t = Date.now();
            await openTab('Buyurtmalar');
            await expect(byDescStart('Yetkazib berish\n')).toBeDisplayed({ wait: 30000 });
            console.log(`    Buyurtmalar ro'yxati ${((Date.now() - t) / 1000).toFixed(1)} s da ochildi`);
            const seen = new Map();
            const { width, height } = await driver.getWindowSize();
            let stale = 0;
            for (let s = 0; s < 60 && stale < 3; s++) {
                const before = seen.size;
                for (const n of nodesFromSource(await driver.getPageSource())) {
                    const m = n.desc.match(/^Yetkazib berish\n([^\n]+)\n(\d{5,})\n/);
                    if (m) seen.set(m[2], m[1]);
                }
                stale = seen.size === before ? stale + 1 : 0;
                if (created.every(c => seen.has(c.orderNo))) break;
                await driver.execute('mobile: shell', { command: 'input', args: ['swipe', String(Math.round(width / 2)), String(Math.round(height * 0.75)), String(Math.round(width / 2)), String(Math.round(height * 0.3)), '400'] });
                await driver.pause(1200);
            }
            const missing = created.filter(c => !seen.has(c.orderNo)).map(c => c.orderNo);
            const statuses = {};
            for (const c of created) if (seen.has(c.orderNo)) statuses[seen.get(c.orderNo)] = (statuses[seen.get(c.orderNo)] || 0) + 1;
            console.log(`    Ro'yxatda ${created.length - missing.length}/${created.length} ta yaratilgan buyurtma topildi; holatlari: ${Object.entries(statuses).map(([k, v]) => `${k} — ${v}`).join(', ')}`);
            if (missing.length) softBug(`Yuklama: ${missing.length} ta yaratilgan buyurtma "Buyurtmalar" ro'yxatida ko'rinmadi: ${missing.slice(0, 10).join(', ')}`);
            await openTab('Bosh sahifa');
        });
    });
});
