import { byDesc, byDescStart, byDescHas, restartApp, openTab, softBug, descOf, allByDescStart, PACKAGE } from '../support/app.js';

describe('1. Ilovani ochish va bosh sahifa', () => {
    it('ilova ochiladi; "Yetkazib berish manzili" so\'rovi chiqsa, "Qoldirish" uni yopadi', async () => {
        await driver.terminateApp(PACKAGE);
        await driver.activateApp(PACKAGE);
        // So'rov har ochilishda chiqmaydi — chiqsa, tugmalarini tekshirib yopamiz
        if (await byDesc('Yetkazib berish manzili').waitForDisplayed({ timeout: 12000 }).catch(() => false)) {
            await expect(byDesc("O'zgartirish")).toBeDisplayed();
            await byDesc('Qoldirish').click();
            await expect(byDesc('Qoldirish')).not.toBeDisplayed({ wait: 5000 });
        }
        await expect(byDesc('Bosh sahifa')).toBeDisplayed({ wait: 20000 });
        expect(await driver.getCurrentPackage()).toBe(PACKAGE);
    });

    it('bosh sahifada barcha xizmatlar va pastki menyu bor', async () => {
        for (const s of ['Yetkazish', 'Taomlar', 'Dorixona', "Do'kon", "Sovg'alar", 'Gullar']) {
            await expect(byDesc(s)).toBeDisplayed();
        }
        for (const t of ['Bosh sahifa', 'Buyurtmalar', 'Sevimlilar', 'Akkaunt']) {
            await expect(byDesc(t)).toBeExisting();
        }
    });

    it('yuqorida joriy yetkazib berish manzili ko\'rsatiladi', async () => {
        // Manzil tugmasi — bosh sahifaning eng yuqorisidagi ImageView (masalan "Muqimiy ko'chasi, 2/1")
        const addr = await $('android=new UiSelector().className("android.widget.ImageView").clickable(true).instance(0)');
        const text = await descOf(addr);
        console.log(`    Manzil: ${text}`);
        expect(text.length).toBeGreaterThan(3);
    });

    it('"Yaqiningizda — Restoranlar" bloki restoranlarni ko\'rsatadi', async () => {
        await expect(byDescStart('Yaqiningizda')).toBeDisplayed();
        const cards = await allByDescStart('Test Merchant');
        expect(cards.length).toBeGreaterThan(0);
        // Restoran kartasidagi yetkazish vaqti o'zbekcha bo'lishi kerak ("min"/"daq"), ruscha "мин" emas
        const art = byDescHas('мин');
        if (await art.isExisting()) softBug(`Bosh sahifa (UZ): restoran kartasida yetkazish vaqti ruscha — "${(await descOf(art)).replace(/\n/g, ' / ')}" ("мин" o'rniga "min")`);
    });

    it('pastki menyu tablari o\'z sahifalarini ochadi', async () => {
        await openTab('Buyurtmalar');
        await expect(byDescStart("Buyurtmalar ro'y")).toBeDisplayed();
        if (await byDesc("Buyurtmalar ro'yhati").isExisting()) softBug(`Buyurtmalar sahifasi sarlavhasida imlo xatosi: "Buyurtmalar ro'yhati" (to'g'risi "Buyurtmalar ro'yxati")`);
        await openTab('Sevimlilar');
        await expect(byDesc('Sevimlilar')).toBeDisplayed();
        await openTab('Akkaunt');
        await expect(byDesc('Profil')).toBeDisplayed();
        await openTab('Bosh sahifa');
        await expect(byDesc('Taomlar')).toBeDisplayed();
    });

    // Dorixona (apteka) hali tayyor emas — uning testlari keyin yoziladi
});
