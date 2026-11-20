// Page Object namunasi: ekrandagi elementlar va amallar shu yerda saqlanadi,
// testlar esa faqat shu metodlarni chaqiradi.
class SettingsPage {
    // UiAutomator selektori — matn bo'yicha qidirish
    byText(text) {
        return $(`android=new UiSelector().textContains("${text}")`);
    }

    get searchButton() {
        return $('~Search settings'); // ~ = accessibility id (content-desc)
    }

    async waitForOpen() {
        await driver.waitUntil(
            async () => (await driver.getCurrentPackage()) === 'com.android.settings',
            { timeout: 15000, timeoutMsg: 'Settings ilovasi ochilmadi' },
        );
    }

    async scrollTo(text) {
        return $(`android=new UiScrollable(new UiSelector().scrollable(true)).scrollTextIntoView("${text}")`);
    }
}

export default new SettingsPage();
