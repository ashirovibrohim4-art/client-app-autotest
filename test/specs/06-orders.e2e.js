import { byDesc, byDescStart, byDescHas, restartApp, openTab, goBack, softBug, descOf, allByDescStart, assertLoggedIn } from '../support/app.js';

// Pastki oynani (bottom sheet) element ko'ringuncha yuqoriga suradi
async function revealInSheet(getEl, max = 5) {
    const { width, height } = await driver.getWindowSize();
    for (let i = 0; i < max; i++) {
        if (await (await getEl()).isDisplayed().catch(() => false)) return;
        await driver.execute('mobile: dragGesture', { startX: Math.round(width / 2), startY: Math.round(height * 0.88), endX: Math.round(width / 2), endY: Math.round(height * 0.35), speed: 2500 });
        await driver.pause(1000);
    }
    await expect(await getEl()).toBeDisplayed();
}

describe('4. Buyurtmalar tarixi', () => {
    before(async () => {
        await restartApp();
        await assertLoggedIn();
        await openTab('Buyurtmalar');
    });

    it('xizmat tablari: Yetkazish, Taomlar, Dorixona', async () => {
        for (const t of ['Yetkazish', 'Taomlar', 'Dorixona']) await expect(byDescStart(`${t}\n`)).toBeDisplayed();
    });

    it('buyurtma kartasi: turi, holati, raqami, summasi, manzili va sanasi', async () => {
        const cards = await allByDescStart('Yetkazib berish\n');
        if (!cards.length) { console.log('    Buyurtmalar yo\'q — tekshiruv o\'tkazib yuborildi'); return; }
        const parts = (await descOf(cards[0])).split('\n');
        console.log(`    Birinchi buyurtma: ${parts.join(' / ')}`);
        expect(parts.length).toBeGreaterThanOrEqual(6);
        expect(parts[2]).toMatch(/^\d{6,}$/);           // buyurtma raqami
        expect(parts[3]).toMatch(/so‘m|so'm/);          // summa
        expect(parts[5]).toMatch(/\d{4} \d{2}:\d{2}$/); // sana va vaqt
    });

    it('Taomlar tabidagi buyurtmalar ochiladi', async () => {
        await byDescStart('Taomlar\n').click();
        await driver.pause(2000);
        await expect(byDescStart('Taomlar\n')).toBeDisplayed();
        await byDescStart('Yetkazish\n').click();
        await driver.pause(1500);
    });

    it('buyurtma tafsiloti: holat, kuryer, manzillar, to\'lov', async () => {
        const cards = await allByDescStart('Yetkazib berish\n');
        if (!cards.length) return;
        const status = (await descOf(cards[0])).split('\n')[1];
        await cards[0].click();
        // Kuryerga qo'ng'iroq tugmasi faqat kuryer biriktirilgan buyurtmalarda bo'ladi — shart qilmaymiz
        await driver.pause(3000);
        console.log(`    Tafsilot ochildi (holati: ${status})`);
        // Tafsilot xarita ustidagi pastki oynada: qolgan qismini ko'rish uchun oynani yuqoriga suramiz
        await revealInSheet(() => byDescHas('Qabul qiluvchi raqami'));
        await revealInSheet(() => byDesc('Qo‘llab-quvvatlash'));
        await expect(byDesc('Kvitansiya OFD')).toBeDisplayed();
        // O'zbekcha interfeysda to'lov turi inglizcha bo'lmasligi kerak
        const cash = await byDescStart('Cash\n');
        if (await cash.isExisting()) softBug(`Buyurtma tafsiloti (UZ): to'lov turi inglizcha — "${(await descOf(cash)).replace(/\n/g, ' ')}" ("Naqd pul" bo'lishi kerak)`);
        // Manzillar interfeys tilida bo'lishi kerak
        const ru = await byDescHas('улица');
        if (await ru.isExisting()) softBug(`Buyurtma tafsiloti (UZ): manzil ruscha ko'rsatiladi — "${(await descOf(ru)).split('\n')[0]}" (bosh sahifada o'zbekcha)`);
        await goBack();
        await expect(byDescStart("Buyurtmalar ro'y")).toBeDisplayed();
    });
});
