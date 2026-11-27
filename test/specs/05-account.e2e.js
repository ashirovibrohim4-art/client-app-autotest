import { byDesc, byDescStart, byDescHas, restartApp, openTab, goBack, descOf, assertLoggedIn } from '../support/app.js';

// Akkaunt bo'limi: faqat ochib-yopamiz, hech narsa saqlanmaydi.
// "Akkauntdan chiqish" bosilmaydi — qayta kirish uchun SMS kod kerak bo'ladi.
describe('2. Akkaunt', () => {
    before(async () => {
        await restartApp();
        await assertLoggedIn();
        await openTab('Akkaunt');
    });

    it('Profil sahifasida barcha bo\'limlar bor', async () => {
        await expect(byDesc('Profil')).toBeDisplayed();
        for (const item of ['Manzillar', "To'lov kartalari", 'Bildirishnomalar', 'Til', 'Qo‘llab-quvvatlash', 'Servis haqida', 'Akkauntdan chiqish']) {
            await expect(byDesc(item)).toBeDisplayed();
        }
        const user = await descOf(await byDescHas('+998'));
        console.log(`    Foydalanuvchi: ${user.replace(/\n/g, ' / ')}`);
        expect(user).toMatch(/\+998 \d{2} \d{3} \d{2} \d{2}/);
    });

    it('shaxsiy ma\'lumotlar: ism, familiya, tug\'ilgan kun, jins, telefon to\'ldirilgan', async () => {
        await byDescHas('+998').click();
        await expect(byDesc('Saqlash')).toBeDisplayed({ wait: 10000 });
        for (const label of ['Ism ', 'Familiya ', "Tug'ilgan kun ", 'Jins ', 'Telefon raqami ']) {
            await expect(byDesc(label)).toBeDisplayed();
        }
        const fields = await $$('android.widget.EditText');
        expect(fields.length).toBeGreaterThanOrEqual(2);
        for (const f of fields.slice(0, 2)) expect((await f.getText()).trim().length).toBeGreaterThan(0);
        await goBack(); // saqlamasdan chiqamiz
        await expect(byDesc('Akkauntdan chiqish')).toBeDisplayed();
    });

    it('Manzillar: saqlangan manzil ko\'rinadi', async () => {
        await byDesc('Manzillar').click();
        await expect(byDesc('Manzillar')).toBeDisplayed();
        await expect(byDesc('Orqaga')).toBeDisplayed();
        const addr = await $('android=new UiSelector().className("android.widget.ImageView").descriptionMatches(".+")');
        expect((await descOf(addr)).length).toBeGreaterThan(3);
        await goBack();
    });

    it('To\'lov kartalari: kartalar yashirin raqam bilan ko\'rsatiladi', async () => {
        await byDesc("To'lov kartalari").click();
        const card = await byDescHas('****');
        await expect(card).toBeDisplayed({ wait: 10000 });
        const text = await descOf(card);
        // To'liq karta raqami ko'rinmasligi kerak: faqat oxirgi 4 raqam
        expect(text).toMatch(/\d{4}\*{8}\d{4}/);
        expect(text).not.toMatch(/\d{16}/);
        await goBack();
    });

    it('Bildirishnomalar: ro\'yxat ochiladi', async () => {
        await byDesc('Bildirishnomalar').click();
        await expect(byDesc('Orqaga')).toBeDisplayed();
        const n = await byDescHas('buyurtma');
        if (await n.isExisting()) console.log(`    Oxirgi bildirishnoma: ${(await descOf(n)).split('\n')[0]}`);
        await goBack();
    });

    it('Til: uchta til taklif qilinadi', async () => {
        await byDesc('Til').click();
        await expect(byDescHas("O'zbek tili")).toBeDisplayed();
        await expect(byDescHas('Русский')).toBeDisplayed();
        await expect(byDescHas('English')).toBeDisplayed();
        await goBack();
    });

    it('Qo\'llab-quvvatlash: qo\'ng\'iroq va chat mavjud', async () => {
        await byDesc('Qo‘llab-quvvatlash').click();
        await expect(byDesc("Qo'ngiroq qilish")).toBeDisplayed();
        await expect(byDesc("Qo'llab quvvatlash chati")).toBeDisplayed();
        await goBack();
    });

    it('Servis haqida: hujjatlar va ilova versiyasi', async () => {
        await byDesc('Servis haqida').click();
        for (const d of ['Kompaniya haqida', 'Foydalanish shartlari', 'Maxfiylik siyosati']) await expect(byDesc(d)).toBeDisplayed();
        const ver = await descOf(await byDescStart('Ilova versiyasi'));
        console.log(`    ${ver}`);
        expect(ver).toMatch(/\d+\.\d+\.\d+/);
        await goBack();
        await expect(byDesc('Akkauntdan chiqish')).toBeDisplayed();
    });
});
