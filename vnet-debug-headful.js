/**
 * v4-sniff — Login rồi điều hướng vào trang Data Monitoring
 * để bắt chính xác URL API endpoint thật mà V-NET gọi
 */
const puppeteer = require("puppeteer");

async function main() {
  const browser = await puppeteer.launch({
    headless: false, defaultViewport: null,
    args: ["--no-sandbox", "--start-maximized"],
  });
  const page = await browser.newPage();
  
  // Log ALL network requests going to v-iec.com
  page.on("response", async (res) => {
    const url = res.url();
    if (!url.includes("v-iec.com")) return;
    if (url.endsWith(".js") || url.endsWith(".css") || url.endsWith(".png") || url.endsWith(".svg") || url.endsWith(".woff2") || url.endsWith(".ico")) return;
    
    const ct = res.headers()["content-type"] || "";
    if (!ct.includes("json")) return;
    
    const method = res.request().method();
    try {
      const json = await res.json().catch(() => null);
      if (!json) return;
      const code = json.code;
      const msg = json.msg || "";
      const hasData = json.result && JSON.stringify(json.result).length > 10;
      
      // Highlight successful data responses
      const prefix = (code === 200 && hasData) ? "✅" : "  ";
      const path = url.replace(/https?:\/\/[^/]+/, "");
      console.log(`${prefix} [${method}] ${path} → code=${code} msg=${msg}`);
      
      // If it has real list data, show sample
      if (code === 200) {
        const list = json.result?.list || json.result?.tagList || json.result?.records || [];
        if (Array.isArray(list) && list.length > 0) {
          console.log(`   📡 ${list.length} items! Sample: ${JSON.stringify(list[0]).substring(0, 150)}`);
          
          // Also log the request body
          const postData = res.request().postData();
          if (postData) {
            console.log(`   📦 Request body: ${postData.substring(0, 200)}`);
          }
          // Log request headers
          const headers = res.request().headers();
          if (headers.wcommon) {
            console.log(`   🔑 wcommon: ${headers.wcommon.substring(0, 100)}...`);
          }
        }
      }
    } catch {}
  });

  // Login
  await page.goto("https://asean.v-iec.com/#/login", { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForSelector('input[type="text"]', { timeout: 15000 });
  await page.click('input[type="text"]');
  await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control");
  await page.type('input[type="text"]', "Intersnack_Vu", { delay: 30 });
  await page.click('input[type="password"]');
  await page.type('input[type="password"]', "Longan11", { delay: 30 });
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(
      b => b.textContent?.toLowerCase().includes("login") || b.getAttribute("type") === "submit"
    );
    if (btn) btn.click();
  });
  await page.waitForNavigation({ timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));
  console.log(`\nURL: ${page.url()}\n`);

  // Navigate to Device Management to find link to Data Monitoring
  console.log("=== Clicking Device management ===");
  await page.evaluate(() => {
    const items = document.querySelectorAll(".el-menu-item, [class*='menu']");
    for (const item of items) {
      if (item.textContent?.includes("Device management")) {
        item.click();
        return;
      }
    }
  });
  await new Promise(r => setTimeout(r, 3000));
  console.log(`URL: ${page.url()}\n`);

  // Look for BORMA device
  console.log("=== Looking for devices ===");
  const devices = await page.evaluate(() => {
    const links = document.querySelectorAll("a[href], [data-id], tr, .el-table__row");
    return Array.from(links).slice(0, 20).map(el => ({
      text: el.textContent?.substring(0, 80).trim(),
      href: el.href || "",
      tag: el.tagName,
    }));
  });
  devices.forEach(d => console.log(`  ${d.tag}: ${d.text?.substring(0, 60)} [${d.href}]`));

  // Try navigating directly to BORMA dashboard
  console.log("\n=== Navigating to BORMA dashboard ===");
  await page.goto("https://asean.v-iec.com/#/dashBoard?boxid=10009531", {
    waitUntil: "networkidle2", timeout: 30000
  });
  await new Promise(r => setTimeout(r, 5000));

  // Look for all links/tabs on the page
  const pageInfo = await page.evaluate(() => {
    const allLinks = Array.from(document.querySelectorAll("a, .el-tabs__item, .el-menu-item, [role='tab'], .el-sub-menu__title"));
    return allLinks.map(a => ({
      text: a.textContent?.trim().substring(0, 50),
      href: a.href || "",
      id: a.id || "",
      class: a.className?.substring(0, 40),
    }));
  });
  console.log("\nAll links/tabs/menu on BORMA page:");
  pageInfo.forEach(l => console.log(`  [${l.class}] ${l.text} → ${l.href || l.id}`));

  // Keep open for manual inspection  
  console.log("\n=== Anh nhìn màn hình, nhấp vào Data Monitoring ===");
  console.log("=== Em sẽ log API calls tự động. Browser mở 3 phút ===");
  await new Promise(r => setTimeout(r, 180000));
  await browser.close();
}

main().catch(console.error);
