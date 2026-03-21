const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    // Listen to console
    page.on('console', msg => {
        if (msg.type() === 'error') console.log('[Browser Error]', msg.text());
    });
    page.on('pageerror', err => {
        console.log('[Page Error]', err.toString());
    });

    try {
        await page.goto('http://localhost:3000/api/auth/auto-login?role=admin', { waitUntil: 'networkidle0' });
        await page.goto('http://localhost:3000/input', { waitUntil: 'networkidle0' });
        
        console.log("Waiting for input page to load...");
        await page.waitForTimeout(2000);
    } catch (e) {
        console.error("Scraper Error:", e);
    } finally {
        await browser.close();
    }
})();
