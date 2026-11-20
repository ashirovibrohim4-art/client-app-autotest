import SettingsPage from '../pageobjects/settings.page.js';

describe('Muhit tekshiruvi (smoke)', () => {
    it('Appium qurilmaga ulanadi', async () => {
        const caps = driver.capabilities;
        console.log(`Qurilma: ${caps.deviceName}, Android ${caps.platformVersion}`);
        expect(driver.isAndroid).toBe(true);
    });

    it('Settings ilovasi ochiladi va "About" bo\'limi topiladi', async () => {
        await SettingsPage.waitForOpen();
        const about = await SettingsPage.scrollTo('About');
        await expect(about).toBeDisplayed();
    });
});
