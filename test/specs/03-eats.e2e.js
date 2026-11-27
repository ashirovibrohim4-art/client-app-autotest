import { byDesc, byDescStart, byDescHas, restartApp, goBack, softBug, descOf, money, tapAt, scrollTo, assertLoggedIn } from '../support/app.js';

// Taomlar → restoran → mahsulot → savat → rasmiylashtirish ekrani.
// DIQQAT: "Buyurtma … so'm" tugmasi HECH QACHON bosilmaydi (haqiqiy buyurtma va kartadan to'lov).
// Oxirida savat tozalanadi.
const RESTAURANT = 'Test Merchant';
const PRODUCT = "Go'sh-nan";

// Savatdagi qatorlar: "Nomi\n…\nsoni\nnarxi so'm" ko'rinishidagi desc'lar
async function cartLines() {
    const out = [];
    for (const el of await $$('android.view.View')) {
        const d = (await el.getAttribute('content-desc')) || '';
        if (/\n\d+\n[^\n]*so[‘']m$/.test(d) && !d.startsWith('Yana nima')) out.push(d);
    }
    return out;
}

describe('3. Taomlar, savat va rasmiylashtirish', () => {
    before(async () => {
        await restartApp();
        await assertLoggedIn();
    });

    it('Taomlar bo\'limi: restoranlar va kategoriyalar ko\'rinadi', async () => {
        await byDesc('Taomlar').click();
        await expect(byDescStart('Taomlar\n')).toBeDisplayed({ wait: 15000 });
        await expect(byDesc('Yaqin atrofdagi restoranlar')).toBeDisplayed();
        for (const c of ['Burgerlar', 'Chegirmalar', 'Kaboblar', 'Palov', 'Pitsa']) await expect(byDesc(c)).toBeDisplayed();
        const tm = await byDescStart(`${RESTAURANT}\n`);
        const text = await descOf(tm);
        if (/\b0-0\b/.test(text)) softBug(`Taomlar: "${RESTAURANT}" kartasida yetkazish vaqti "0-0 min" — vaqt ko'rsatilmagan`);
    });

    it('restoran sahifasi ochiladi: nomi, yetkazish shartlari, menyu', async () => {
        await byDescStart(`${RESTAURANT}\n`).click();
        await expect(byDesc(RESTAURANT)).toBeDisplayed({ wait: 15000 });
        await expect(byDescHas('bepul yetkazish')).toBeDisplayed();
        await expect(byDescStart('Yetkazish vaqti')).toBeDisplayed();
        const time = await descOf(await byDescStart('Yetkazish vaqti'));
        if (/0-0/.test(time)) softBug(`Restoran sahifasi: "${time}" — yetkazish vaqti 0-0`);
        await expect(byDescHas(PRODUCT)).toBeDisplayed();
    });

    it('mahsulot kartasi: nom, narx, vazn, tavsif va "Qo\'shish"', async () => {
        const item = await byDescHas(PRODUCT);
        const desc = await descOf(item);
        const weight = desc.split('\n').pop();
        if (/\d+\s*kg/i.test(weight) && Number(weight.replace(/\D/g, '')) >= 100) {
            softBug(`Mahsulot vazni ehtimol noto'g'ri birlikda: "${desc.replace(/\n/g, ' / ')}" (bitta porsiya ${weight})`);
        }
        await item.click();
        await expect(byDesc("Qo'shish")).toBeDisplayed({ wait: 10000 });
        await expect(byDescStart(PRODUCT)).toBeDisplayed();
        await expect(byDesc('Siz uchun tanlov')).toBeDisplayed();
    });

    it('mahsulot savatga qo\'shiladi va "Davom etish" tugmasi summa bilan chiqadi', async () => {
        await byDesc("Qo'shish").click();
        const cont = await byDescHas('Davom etish');
        await expect(cont).toBeDisplayed({ wait: 10000 });
        const d = await descOf(cont);
        console.log(`    Tugma: ${d.replace(/\n/g, ' / ')}`);
        expect(money(d.split('\n').pop())).toBeGreaterThan(0);
        // Restoran menyusida mahsulot kartasida soni (1) paydo bo'ladi
        await expect(byDescStart(`1\n`)).toBeExisting();
    });

    it('savat: mahsulot, soni va narxi ko\'rinadi', async () => {
        await byDescHas('Davom etish').click();
        await expect(byDesc('Savat')).toBeDisplayed({ wait: 10000 });
        const line = await byDescStart(PRODUCT);
        await expect(line).toBeDisplayed();
        expect(await descOf(line)).toMatch(/\n1\n/);
        await expect(byDescStart('Yana nima')).toBeExisting();
        const pack = await byDescStart('Quti\n');
        if (await pack.isExisting()) console.log(`    Avtomatik qadoq: ${(await descOf(pack)).replace(/\n/g, ' / ')}`);
    });

    it('rasmiylashtirish ekrani: manzil, qabul qiluvchi, to\'lov va to\'g\'ri jami summa', async () => {
        await byDescHas('Davom etish').click();
        await expect(byDesc('Buyurtma')).toBeDisplayed({ wait: 15000 });
        await expect(byDescStart('Yetkazib berish manzili')).toBeDisplayed();
        await expect(byDescStart('Qabul qiluvchi raqami')).toBeDisplayed();
        await expect(byDesc("To'lov")).toBeDisplayed();
        await expect(byDesc('Karta qo\'shish')).toBeDisplayed();

        const priceBlock = await scrollTo(() => byDescStart('Buyurtma narxi'));
        const lines = (await descOf(priceBlock)).split('\n');
        const val = label => money(lines[lines.indexOf(label) + 1] || '');
        const items = val('Savatdagi mahsulotlar');
        const fee = val("Xizmat yig'imi");
        const delivery = val('Yetkazish');
        const total = val('Jami');
        console.log(`    Mahsulotlar ${items} + xizmat ${fee} + yetkazish ${delivery} = jami ${total}`);
        expect(items + fee + delivery).toBe(total);
        // Buyurtma tugmasidagi summa ham jamiga teng
        const orderBtn = await byDescHas('\nBuyurtma\n');
        expect(money((await descOf(orderBtn)).split('\n').pop())).toBe(total);
        // Buyurtma tugmasi BOSILMAYDI
    });

    it('test mahsuloti savatdan olib tashlanadi (foydalanuvchining boshqa mahsulotlari qoladi)', async () => {
        await goBack(); // rasmiylashtirishdan savatga
        await expect(byDesc('Savat')).toBeDisplayed();
        const lines = await cartLines();
        const others = lines.filter(l => !l.startsWith(PRODUCT) && !l.startsWith('Quti\n'));
        if (!others.length) {
            // Savatda faqat test mahsuloti — 🗑 bilan to'liq tozalaymiz va tasdiqlash oynasini tekshiramiz
            await tapAt(0.94, 0.083); // yuqori o'ngdagi 🗑 (yorlig'i yo'q)
            const confirm = await byDescHas("savatdan o'chirilsinmi");
            await expect(confirm).toBeDisplayed({ wait: 8000 });
            const q = await descOf(confirm);
            if (/^\s/.test(q)) softBug(`Savatni tozalash oynasi: matn bo'sh joy bilan boshlanadi — "${q}" (nima o'chirilishi yozilmagan)`);
            await byDesc("O'chirish").click();
            await expect(byDesc("Savat bo'sh")).toBeDisplayed({ wait: 10000 });
            await expect(byDesc('Xarid qilish')).toBeDisplayed();
        } else {
            // Savatda foydalanuvchining mahsulotlari bor — faqat o'zimiznikini "−" bilan olib tashlaymiz
            console.log(`    Savatda boshqa mahsulotlar bor (${others.map(o => o.split('\n')[0]).join(', ')}) — ular tegilmaydi`);
            const row = await byDescStart(`${PRODUCT}`);
            const { x, y } = await row.getLocation();
            const { width, height } = await row.getSize();
            await driver.execute('mobile: clickGesture', { x: Math.round(x + width * 0.292), y: Math.round(y + height * 0.735) });
            await driver.pause(1500);
            await expect(byDescStart(PRODUCT)).not.toBeExisting({ wait: 8000 });
            for (const o of others) await expect(byDescStart(o.split('\n')[0])).toBeExisting();
        }
    });
});
