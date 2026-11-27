import { byDesc, byDescHas, byDescStart, restartApp, softBug, descOf, PACKAGE } from '../support/app.js';

// 1. Avtorizatsiya: chiqish → negativ holatlar → noto'g'ri OTP → SMS kod bilan kirish.
// Kirish raqami — qurilmada hozir kirilgan akkaunt (Profil'dan o'qiladi) yoki $env:LOGIN_PHONE (9 raqam).
// SMS kodni foydalanuvchi o'zi kiritadi (client ilovasi test kodini qabul qilmaydi) — test 5 daqiqa kutadi.
// Yakunda ilova TIZIMGA KIRILGAN holatda qoladi (keyingi spec'lar uchun).

let LOGIN_PHONE = process.env.LOGIN_PHONE || '997274471'; // foydalanuvchining test raqami
const VALIDATION = []; // har bir noto'g'ri kiritishda ko'rsatilgan xabarlar (oxirida jamlanadi)
const shell = (...args) => driver.execute('mobile: shell', { command: 'input', args: args.map(String) });

async function openAccount() {
    const { width, height } = await driver.getWindowSize();
    await driver.execute('mobile: clickGesture', { x: Math.round(width * 0.875), y: Math.round(height * 0.9125) });
    await driver.pause(1500);
}

const onLoginScreen = () => byDesc('Telefon raqamni kiriting').isExisting().catch(() => false);
const loggedIn = async () => (await byDesc('Bosh sahifa').isExisting().catch(() => false)) && !(await onLoginScreen());

async function typePhone(digits) {
    const f = await $('android.widget.EditText');
    await f.click();
    await driver.pause(600);
    await shell('keyevent', 'KEYCODE_MOVE_END');
    await shell('keyevent', ...Array(16).fill('67'));
    if (digits) await shell('text', digits);
    await driver.pause(800);
    await driver.hideKeyboard().catch(() => {});
    await driver.pause(500);
}

// Rozilik belgilari — "Davom etar ekanman…" va "Maxfiylik siyosati…" matnlarining chapida
async function termCheckboxes() {
    const boxes = await $$('android.widget.CheckBox');
    if (boxes.length >= 2) return boxes;
    const out = [];
    for (const t of ['Davom etar ekanman', 'Maxfiylik siyosati']) {
        const el = await byDescHas(t);
        if (await el.isExisting().catch(() => false)) out.push(el);
    }
    return out;
}

// Telefon maydonidagi joriy qiymat
async function phoneValue() {
    const f = await $('android.widget.EditText');
    return (await f.getText().catch(() => '')) || '';
}

// Rozilik belgilari holati: kirish ekrani ochilganda ikkalasi ham bo'sh (belgilanmagan)
const TERMS = [false, false];
async function setTerms(first, second) {
    const want = [first, second];
    const boxes = await termCheckboxes();
    const { width } = await driver.getWindowSize();
    for (let i = 0; i < 2 && i < boxes.length; i++) {
        if (TERMS[i] === want[i]) continue;
        const el = boxes[i];
        const cls = await el.getAttribute('class').catch(() => '');
        if (/CheckBox/.test(cls)) await el.click();
        else {
            const { y } = await el.getLocation();
            const { height } = await el.getSize();
            await shell('tap', Math.round(width * 0.1), Math.round(y + height / 2));
        }
        TERMS[i] = want[i];
        await driver.pause(500);
    }
}

// OTP ekraniga o'tib ketgan bo'lsa — telefon ekraniga qaytish
async function backToPhoneScreen() {
    for (let i = 0; i < 2 && !(await onLoginScreen()); i++) { await driver.back(); await driver.pause(1500); }
}

async function allDescs() {
    const xml = await driver.getPageSource();
    return [...xml.matchAll(/content-desc="([^"]+)"/g)].map(m => m[1].replace(/&#10;/g, ' ')).filter(d => d !== 'null');
}
async function allTexts() {
    const xml = await driver.getPageSource();
    return [...xml.matchAll(/ text="([^"]+)"/g)].map(m => m[1]);
}

// "Kodni olish" bosilsa OTP ekraniga o'tadimi (true) yoki joyida qoladimi (false)
async function getCodePasses() {
    const btn = await byDescHas('Kodni olish');
    await expect(btn).toBeExisting();
    console.log(`    "Kodni olish": enabled=${await btn.getAttribute('enabled').catch(() => '?')}`);
    await btn.click();
    await driver.pause(3000);
    return !(await onLoginScreen());
}

describe('1. Avtorizatsiya', () => {
    before(async () => {
        // Ilova boshqa tilda qolgan bo'lishi mumkin (restartApp o'zbekcha 'Bosh sahifa'ni kutadi)
        await restartApp().catch(async () => { await driver.terminateApp(PACKAGE); await driver.activateApp(PACKAGE); await driver.pause(4000); });
    });

    it('L0. Akkauntdan chiqish: "Yo\'q, qaytish" akkauntda qoldiradi, "Ha, chiqish" kirish ekraniga olib chiqadi', async () => {
        // Oldingi yurishdan ochiq qolgan chiqish oynasini yopamiz
        if (await byDesc("Yo'q, qaytish").isExisting().catch(() => false)) { await byDesc("Yo'q, qaytish").click(); await driver.pause(1500); }
        if (await onLoginScreen()) { console.log('    Ilova allaqachon tizimdan chiqqan'); return; }
        await openAccount();
        // Mehmon rejimi (allaqachon chiqilgan) — to'g'ridan-to'g'ri kirish ekraniga
        const guest = await byDescHas('Akkauntingizga kiring');
        if (await guest.isExisting().catch(() => false)) {
            console.log("    Ilova mehmon rejimida (allaqachon chiqilgan) — kirish ekraniga o'tamiz");
            await guest.click(); await driver.pause(2000);
            await expect(byDesc('Telefon raqamni kiriting')).toBeExisting({ wait: 10000 });
            return;
        }
        const profile = await byDescHas('+998');
        await expect(profile).toBeExisting({ wait: 8000 });
        const phone = ((await descOf(profile)).match(/\+998[\d ]+/) || [''])[0].replace(/\D/g, '').slice(3);
        if (!LOGIN_PHONE) LOGIN_PHONE = phone;
        console.log(`    Akkaunt: +998 ${phone} (kirish shu raqam bilan bo'ladi: ${LOGIN_PHONE})`);
        await byDesc('Akkauntdan chiqish').click();
        await expect(byDescHas('Haqiqatan ham akkauntdan chiqmoqchimisiz')).toBeExisting({ wait: 5000 });
        await byDesc("Yo'q, qaytish").click();
        await driver.pause(1500);
        await expect(byDesc('Akkauntdan chiqish')).toBeExisting();
        await byDesc('Akkauntdan chiqish').click();
        await driver.pause(1000);
        await byDesc('Ha, chiqish').click();
        await driver.pause(3000);
        // Chiqqandan keyin ilova kirish ekranini yoki mehmon rejimini ko'rsatadi
        if (!(await onLoginScreen())) {
            await openAccount();
            const enter = await byDescHas('Akkauntingizga kiring');
            if (await enter.isExisting().catch(() => false)) { await enter.click(); await driver.pause(2000); }
        }
        await expect(byDesc('Telefon raqamni kiriting')).toBeExisting({ wait: 10000 });
    });

    // ── Kirish sahifasi 3 tilda: barcha matnlar va validatsiya xabarlari tarjima qilinganmi ──
    // Har til uchun: Akkaunt (mehmon) → Til → til → kirish ekrani → matnlar → bo'sh/qisqa raqam xabari →
    // OTP ekrani → noto'g'ri kod xabari. Tarjima qilinmagan (boshqa tildagi) matnlar bug sifatida yoziladi.
    const UZ_WORDS = /\b(kiriting|raqam|Kodni|olish|noto.?g.?ri|formatda|Davom|ekanman|tanishganimni|roziligimni|Maxfiylik|siyosati|Foydalanish|shartlari|yubordik|Yangi kod|Endi|quyidagi|Hisob|yaratish|tizimga|kirish|uchun)\b/i;
    const LANG_CHECK = {
        ru: { label: 'Русский', bad: t => !/[А-Яа-яЁё]/.test(t) || UZ_WORDS.test(t) },
        en: { label: 'English', bad: t => /[А-Яа-яЁё]/.test(t) || UZ_WORDS.test(t) },
    };
    // Til, brend va raqamlar tekshirilmaydi
    const neutral = d => /^(noor|\+998|[\d\s:+\-()®]+|null|.{0,2})$/i.test(d.trim()) || /O.zbek tili|Русский|English/.test(d);

    async function goAccountTab() {
        const { width, height } = await driver.getWindowSize();
        await driver.execute('mobile: clickGesture', { x: Math.round(width * 0.875), y: Math.round(height * 0.9125) });
        await driver.pause(1500);
    }
    async function guestSetLanguage(label) {
        await driver.activateApp(PACKAGE);
        await driver.pause(1500);
        // Kirish/OTP ekranida bo'lsak — ✕ bilan mehmon bosh sahifasiga chiqamiz
        const { width, height } = await driver.getWindowSize();
        for (let i = 0; i < 2 && (await $('android.widget.EditText').isExisting().catch(() => false)); i++) {
            await driver.execute('mobile: clickGesture', { x: Math.round(width * 0.07), y: Math.round(height * 0.06) });
            await driver.pause(1500);
        }
        await goAccountTab();
        for (const name of ['Til', 'Язык', 'Language']) {
            const el = await byDesc(name);
            if (await el.isExisting().catch(() => false)) { await el.click(); break; }
        }
        await driver.pause(1500);
        await byDescHas(label).click();
        // Til almashganda ilova o'zini qayta ishga tushiradi (qora ekran) va "Yetkazib berish manzili" oynasini ochadi
        await driver.pause(5000);
        await dismissAddressDialog();
    }
    // "Адрес доставки / Yetkazib berish manzili" oynasi: chap tugma — "Оставить / Qoldirish / Keep"
    async function dismissAddressDialog() {
        for (let i = 0; i < 3; i++) {
            const keep = await $('android=new UiSelector().descriptionMatches("Оставить|Qoldirish|Keep|Leave").instance(0)');
            if (await keep.isExisting().catch(() => false)) { await keep.click(); await driver.pause(1500); return; }
            await driver.pause(1500);
        }
    }
    // Mehmon akkaunt qatori (profil sarlavhasi ostidagi birinchi qator) — kirish ekranini ochadi
    async function guestOpenLogin() {
        await dismissAddressDialog();
        await goAccountTab();
        const { width, height } = await driver.getWindowSize();
        await driver.execute('mobile: clickGesture', { x: Math.round(width * 0.5), y: Math.round(height * 0.137) });
        await driver.pause(2500);
        await expect($('android.widget.EditText')).toBeExisting({ wait: 8000 });
    }
    // Ekranning pastki yarmidagi eng keng bosiladigan element — asosiy tugma ("Kodni olish" / "Получить код" / …)
    async function mainButton() {
        const { width, height } = await driver.getWindowSize();
        let best = null, bestY = -1;
        for (const e of await $$('android=new UiSelector().clickable(true)')) {
            const { x, y } = await e.getLocation();
            const s = await e.getSize();
            if (y > height * 0.45 && s.width > width * 0.7 && s.height < height * 0.12 && y > bestY) { best = e; bestY = y; }
        }
        return best;
    }
    // Rozilik matnlari (tilga bog'liq emas): telefon maydoni va tugma orasidagi 2 ta uzun matn
    async function termRows() {
        const field = await $('android.widget.EditText');
        const fy = (await field.getLocation()).y;
        const rows = [];
        for (const e of await $$('android.view.View')) {
            const d = (await e.getAttribute('content-desc').catch(() => '')) || '';
            if (d.length < 25 || d === 'null') continue;
            const { y } = await e.getLocation();
            if (y > fy) rows.push({ e, y });
        }
        return rows.sort((a, b) => a.y - b.y).slice(0, 2).map(r => r.e);
    }
    async function tickBoth() {
        const { width } = await driver.getWindowSize();
        for (const el of await termRows()) {
            const { y } = await el.getLocation();
            const { height } = await el.getSize();
            await shell('tap', Math.round(width * 0.1), Math.round(y + height / 2));
            await driver.pause(500);
        }
    }
    async function pressMain() {
        const before = new Set(await allDescs());
        const btn = await mainButton();
        if (!btn) throw new Error('Asosiy tugma topilmadi');
        await btn.click();
        await driver.pause(3000);
        return (await allDescs()).filter(d => !before.has(d));
    }
    function untranslated(code, descs) {
        return [...new Set(descs.filter(d => !neutral(d) && LANG_CHECK[code].bad(d)))];
    }

    for (const code of ['ru', 'en']) {
        const L = LANG_CHECK[code];
        it(`I18N-${code.toUpperCase()}. Kirish sahifasi ${L.label}: barcha matnlar, validatsiya va OTP xabarlari tarjima qilingan`, async function () {
            this.timeout(6 * 60 * 1000);
            await guestSetLanguage(L.label);
            await guestOpenLogin();
            const screen = await allDescs();
            console.log(`    [${code}] Kirish ekrani: ${screen.filter(d => !neutral(d)).join(' | ')}`);
            const found = [];
            found.push(...untranslated(code, screen));

            // Bo'sh raqam
            await tickBoth();
            const emptyMsg = await pressMain();
            console.log(`    [${code}] Bo'sh raqam xabari: ${emptyMsg.join(' | ') || '—'}`);
            if (!emptyMsg.length) softBug(`Til ${L.label}: kirishda bo'sh raqam uchun validatsiya xabari ko'rsatilmadi`);
            found.push(...untranslated(code, emptyMsg));

            // Qisqa raqam
            await typePhone('90123');
            const shortMsg = await pressMain();
            console.log(`    [${code}] Qisqa raqam xabari: ${shortMsg.join(' | ') || '—'}`);
            found.push(...untranslated(code, shortMsg));

            // OTP ekrani va noto'g'ri kod
            await typePhone(LOGIN_PHONE);
            const otp = await pressMain();
            console.log(`    [${code}] OTP ekrani (SMS yuborildi): ${otp.join(' | ') || '—'}`);
            found.push(...untranslated(code, otp));
            await shell('text', '000000');
            await driver.pause(4000);
            const wrong = (await allDescs()).filter(d => /000000/.test(d) === false);
            const wrongMsg = wrong.filter(d => !otp.includes(d) && !screen.includes(d) && !neutral(d));
            console.log(`    [${code}] Noto'g'ri kod xabari: ${wrongMsg.join(' | ') || '—'}`);
            found.push(...untranslated(code, wrongMsg));
            await shell('keyevent', ...Array(8).fill('67'));

            const uniq = [...new Set(found)];
            VALIDATION.push(`${L.label}: tarjima qilinmagan — ${uniq.length ? uniq.map(u => `"${u}"`).join(', ') : 'yo\'q'}`);
            if (uniq.length) softBug(`Kirish sahifasi (${L.label}): tarjima qilinmagan matnlar — ${uniq.map(u => `"${u}"`).join('; ')}`);

            // OTP va kirish ekranidan ✕ bilan chiqamiz (yuqori chap burchak)
            const { width, height } = await driver.getWindowSize();
            for (let i = 0; i < 2 && (await $('android.widget.EditText').isExisting().catch(() => false)); i++) {
                await driver.execute('mobile: clickGesture', { x: Math.round(width * 0.07), y: Math.round(height * 0.06) });
                await driver.pause(1500);
            }
        });
    }

    it("I18N-UZ. Til O'zbekchaga qaytariladi va kirish ekrani o'zbekcha", async () => {
        await guestSetLanguage("O'zbek tili");
        await guestOpenLogin();
        await expect(byDesc('Telefon raqamni kiriting')).toBeExisting({ wait: 8000 });
        TERMS[0] = false; TERMS[1] = false; // yangi ochilgan kirish ekranida belgilar bo'sh
    });

    // ── Telefon raqami ekrani: noto'g'ri qiymatlar (SMS yuborilmaydi) ────────────────
    // Har biri uchun: kod so'ralmasligi kerak + qanday validatsiya xabari chiqqani yoziladi
    const PHONE_CASES = [
        ['bo\'sh', ''],
        ['1 ta raqam', '9'],
        ['5 ta raqam', '90123'],
        ['8 ta raqam (bittasi kam)', LOGIN_PHONE.slice(0, 8)],
        ['faqat nollar', '000000000'],
        ['mavjud bo\'lmagan operator 00', '001234567'],
        ['mavjud bo\'lmagan operator 12', '121234567'],
        ['mavjud bo\'lmagan operator 66', '661234567'],
        ['harflar va belgilar', 'abc!@#'],
        ['probelli 8 raqam', `${LOGIN_PHONE.slice(0, 2)} ${LOGIN_PHONE.slice(2, 5)} ${LOGIN_PHONE.slice(5, 7)} ${LOGIN_PHONE.slice(7, 8)}`],
    ];
    PHONE_CASES.forEach(([name, value], i) => {
        it(`P${i + 1}. Negativ telefon: ${name} ("${value}") — kod so'ralmaydi, validatsiya xabari ko'rsatiladi`, async () => {
            if (i === 0) await setTerms(true, true);
            await typePhone(value);
            const shown = await phoneValue();
            const before = new Set(await allDescs());
            const passes = await getCodePasses();
            const msg = (await allDescs()).filter(d => !before.has(d) && !/^\d+$/.test(d)).join(' | ');
            VALIDATION.push(`${name}: maydon="${shown}", xabar="${msg || '—'}"${passes ? ', KOD SO\'RALDI' : ''}`);
            console.log(`    Maydonda: "${shown}" | xabar: "${msg || 'yo\'q'}"`);
            if (passes) {
                softBug(`Avtorizatsiya: noto'g'ri telefon (${name}: "${value}") bilan SMS kod so'raldi`);
                await backToPhoneScreen();
            } else if (!msg && value) {
                softBug(`Avtorizatsiya: noto'g'ri telefon (${name}) — "Kodni olish" jim ishlamaydi, xato matni ko'rsatilmaydi`);
            }
            if (/[a-z!@#]/i.test(shown)) softBug(`Avtorizatsiya: telefon maydoni harf/belgilarni qabul qildi ("${shown}")`);
            expect(passes).toBe(false);
        });
    });

    it('P11. Juda uzun raqam (13 raqam) — maydonda ko\'pi bilan 9 raqam qoladi', async () => {
        await typePhone(`${LOGIN_PHONE}9999`);
        const digits = (await phoneValue()).replace(/\D/g, '').replace(/^998/, '');
        console.log(`    Maydonda raqamlar: ${digits} (${digits.length} ta)`);
        if (digits.length > 9) softBug(`Avtorizatsiya: telefon maydoni 9 tadan ko'p raqam qabul qildi (${digits})`);
        expect(digits.length).toBeLessThanOrEqual(9);
    });

    it('P12. "+998" bilan kiritilsa (+998XXXXXXXXX) — 9 raqamga to\'g\'ri keltiriladi', async () => {
        await typePhone(`+998${LOGIN_PHONE}`);
        const digits = (await phoneValue()).replace(/\D/g, '');
        console.log(`    Maydonda: ${digits}`);
        if (digits !== LOGIN_PHONE && digits !== `998${LOGIN_PHONE}`) softBug(`Avtorizatsiya: "+998…" bilan kiritilgan raqam noto'g'ri saqlandi ("${digits}")`);
        expect(digits.length).toBeGreaterThan(0);
    });

    for (const [id, a, b, name] of [['T1', true, false, 'faqat 1-belgi (Foydalanish shartlari)'], ['T2', false, true, 'faqat 2-belgi (Maxfiylik siyosati)'], ['T3', false, false, 'hech bir belgi']]) {
        it(`${id}. Negativ rozilik: ${name} — kod so'ralmaydi`, async () => {
            await typePhone(LOGIN_PHONE);
            await setTerms(a, b);
            const before = new Set(await allDescs());
            const passes = await getCodePasses();
            const msg = (await allDescs()).filter(d => !before.has(d)).join(' | ');
            VALIDATION.push(`Rozilik — ${name}: xabar="${msg || '—'}"${passes ? ', KOD SO\'RALDI' : ''}`);
            if (passes) { softBug(`Avtorizatsiya: rozilik — ${name} holatida ham kod so'raldi`); await backToPhoneScreen(); }
            expect(passes).toBe(false);
        });
    }

    // ── SMS kod (OTP) ekrani ────────────────────────────────────────────────────────
    it('O1. To\'g\'ri raqam va ikkala belgi — kod so\'raladi; OTP ekranida raqam va "Qayta yuborish" taymeri', async () => {
        await typePhone(LOGIN_PHONE);
        await setTerms(true, true);
        expect(await getCodePasses()).toBe(true);
        console.log(`    1-SMS kod +998 ${LOGIN_PHONE} raqamiga yuborildi`);
        const descs = await allDescs();
        console.log(`    OTP ekrani: ${descs.slice(0, 10).join(' | ')}`);
        const showsPhone = descs.some(d => d.replace(/\D/g, '').includes(LOGIN_PHONE));
        if (!showsPhone) softBug('Avtorizatsiya: OTP ekranida kod qaysi raqamga yuborilgani ko\'rsatilmadi');
        const timer = descs.find(d => /\d{1,2}:\d{2}|qayta|yuborish|soniya/i.test(d)) || '';
        console.log(`    Qayta yuborish/taymer: "${timer || 'topilmadi'}"`);
        if (!timer) softBug('Avtorizatsiya: OTP ekranida "Qayta yuborish" yoki taymer ko\'rinmadi');
    });

    for (const [id, code, name] of [['O2', '123', '3 xonali kod'], ['O3', '12345', '5 xonali kod'], ['O4', 'abcdef', 'harfli kod']]) {
        it(`${id}. Negativ OTP: ${name} ("${code}") — kirilmaydi`, async () => {
            await shell('text', code);
            await driver.pause(3000);
            expect(await loggedIn()).toBe(false);
            if (/[a-z]/.test(code) && (await allDescs()).concat(await allTexts()).some(d => d.includes(code))) {
                softBug('Avtorizatsiya: SMS kod maydoni harflarni qabul qildi');
            }
            await shell('keyevent', ...Array(8).fill('67'));
        });
    }

    for (const [id, code] of [['O5', '000000'], ['O6', '123456']]) {
        it(`${id}. Noto'g'ri OTP (${code}) — kirilmaydi, xato xabari ko'rsatiladi, blok tushmaydi`, async () => {
            await shell('text', code);
            await driver.pause(4000);
            expect(await loggedIn()).toBe(false);
            const descs = await allDescs();
            const msg = descs.find(d => /noto.?g.?ri|xato|неверн|invalid|wrong/i.test(d)) || '';
            const block = descs.find(d => /blok|cheklov|urinish|попыт|limit|kuting/i.test(d)) || '';
            VALIDATION.push(`OTP ${code}: xabar="${msg || '—'}"${block ? `, cheklov="${block}"` : ''}`);
            console.log(`    Xabar: "${msg || 'yo\'q'}"${block ? ` | cheklov: "${block}"` : ''}`);
            if (!msg) softBug(`Avtorizatsiya: noto'g'ri SMS kod (${code}) kiritilganda xato matni ko'rsatilmadi`);
            await shell('keyevent', ...Array(8).fill('67'));
        });
    }

    it('O7. OTP ekranidan "Orqaga" — telefon ekraniga qaytadi, raqam saqlanadi; kod qayta so\'raladi (2-SMS)', async () => {
        await driver.back();
        await driver.pause(2000);
        const back = await onLoginScreen();
        if (!back) softBug('Avtorizatsiya: OTP ekranidan "Orqaga" telefon raqami ekraniga qaytarmadi');
        expect(back).toBe(true);
        const kept = (await phoneValue()).replace(/\D/g, '');
        console.log(`    Qaytgandan keyin maydonda: ${kept || 'bo\'sh'}`);
        if (!kept.endsWith(LOGIN_PHONE)) { softBug('Avtorizatsiya: OTP ekranidan qaytilganda telefon raqami saqlanmadi'); await typePhone(LOGIN_PHONE); }
        if (!TERMS[0] || !TERMS[1]) await setTerms(true, true);
        expect(await getCodePasses()).toBe(true);
        console.log(`    2-SMS kod +998 ${LOGIN_PHONE} raqamiga yuborildi — OXIRGI kelgan kodni kiriting`);
    });

    it('L1. To\'g\'ri SMS kod bilan kirish (oxirgi kodni foydalanuvchi kiritadi) → bosh sahifa va Profil\'da shu raqam', async function () {
        this.timeout(8 * 60 * 1000);
        console.log(`    ⏳ ⏳ ⏳  TELEFONDA OXIRGI SMS KODNI KIRITING (+998 ${LOGIN_PHONE}) — 5 daqiqa kutiladi`);
        await driver.waitUntil(loggedIn, { timeout: 5 * 60 * 1000, interval: 3000, timeoutMsg: 'SMS kod 5 daqiqa ichida kiritilmadi' });
        await openAccount();
        const profile = await byDescHas('+998');
        await expect(profile).toBeExisting({ wait: 10000 });
        const phone = ((await descOf(profile)).match(/\+998[\d ]+/) || [''])[0].replace(/\D/g, '').slice(3);
        console.log(`    Kirildi: +998 ${phone}`);
        expect(phone).toBe(LOGIN_PHONE);
    });

    it('L2. Ilova qayta ochilganda sessiya saqlanadi (qayta kirish so\'ralmaydi)', async () => {
        await restartApp();
        await openAccount();
        await expect(byDescHas('+998')).toBeExisting({ wait: 10000 });
        expect(await byDescHas('Akkauntingizga kiring').isExisting().catch(() => false)).toBe(false);
    });

    after(() => {
        if (VALIDATION.length) console.log(`\n    ── Validatsiya xabarlari jamlanmasi ──\n${VALIDATION.map(v => `    • ${v}`).join('\n')}`);
    });
});
