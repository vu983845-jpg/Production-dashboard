/**
 * vnet-dom-scraper.js v7 — Navigate through Device Management list
 * 
 * KEY INSIGHT: V-NET Vue app only shows "Data monitoring" tab when navigating 
 * through the correct route: Device management → Click device → Device details
 * Direct URL navigation (#/dashBoard?boxid=X) skips the Device details component
 * and doesn't mount the bottom tabs.
 */

const puppeteer = require("puppeteer");

const VNET_USERNAME = "Intersnack_Vu";
const VNET_PASSWORD = "Longan11";
const SUPABASE_URL = "https://iekjajbmbkqrbalnjwit.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlla2phamJtYmtxcmJhbG5qd2l0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjYwNzEwMiwiZXhwIjoyMDg4MTgzMTAyfQ.XZaEyZGWgEB3PheVg559X-kyyIfARl-KAo83Wzeclg8";

function log(msg) {
  console.log(`[${new Date().toLocaleString("vi-VN")}] ${msg}`);
}

async function supabaseUpsert(table, dataPayload) {
  // 1. Fetch existing row to preserve history
  let history = [];
  try {
    const getRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${dataPayload.id}&select=data`, {
      method: "GET",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const currentRows = await getRes.json();
    if (currentRows && currentRows.length > 0 && currentRows[0].data && currentRows[0].data.history) {
      if (Array.isArray(currentRows[0].data.history)) {
        history = currentRows[0].data.history;
      }
    }
  } catch (err) {
    log(`Failed to fetch history for ${dataPayload.id}: ${err.message}`);
  }

  // 2. Append new history point, clone data to avoid circular reference!
  const dataClone = JSON.parse(JSON.stringify(dataPayload.data));
  // ensure clone doesn't contain history array itself
  delete dataClone.history;

  const newPoint = {
    timestamp: dataPayload.updated_at,
    data: dataClone,
  };
  history.push(newPoint);

  // Keep last 288 points (24 hours at 5-minute intervals)
  if (history.length > 288) {
    history = history.slice(-288);
  }
  
  dataPayload.data.history = history;

  // 3. Upsert
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(dataPayload),
  });
  return res.ok || res.status === 204;
}

async function login(page) {
  log("Đang login...");
  await page.goto("https://asean.v-iec.com/#/login", { waitUntil: "networkidle2", timeout: 30000 });
  await page.waitForSelector('input[type="text"]', { timeout: 15000 });
  await page.click('input[type="text"]');
  await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control");
  await page.type('input[type="text"]', VNET_USERNAME, { delay: 30 });
  await page.click('input[type="password"]');
  await page.type('input[type="password"]', VNET_PASSWORD, { delay: 30 });
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(
      b => b.textContent?.toLowerCase().includes("login") || b.getAttribute("type") === "submit"
    );
    if (btn) btn.click();
  });
  await page.waitForNavigation({ timeout: 20000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));
  log(`Login OK — ${page.url()}`);
}

async function navigateToDeviceDetails(page, deviceName) {
  // Step 1: Go to Device management page via sidebar click
  log(`   Navigating to Device management...`);
  const menuClicked = await page.evaluate(() => {
    const items = document.querySelectorAll(".el-menu-item, .el-sub-menu__title");
    for (const item of items) {
      if (item.textContent?.trim().includes("Device management")) {
        item.click();
        return true;
      }
    }
    return false;
  });
  
  if (!menuClicked) {
    // Direct URL fallback
    await page.goto("https://asean.v-iec.com/#/deviceMng", { waitUntil: "networkidle2", timeout: 30000 });
  }
  await new Promise(r => setTimeout(r, 3000));
  log(`   URL: ${page.url()}`);
  
  // Step 2: Find and click the device name in the device list
  log(`   Looking for device: ${deviceName}`);
  const clicked = await page.evaluate((name) => {
    // The device list has device names as clickable links/spans
    const candidates = document.querySelectorAll("a, span, .device-name, td .cell");
    for (const el of candidates) {
      const text = el.textContent?.trim() || "";
      if (text === name || text.includes(name)) {
        el.click();
        return text;
      }
    }
    // Try finding in table rows
    const rows = document.querySelectorAll(".el-table__row, tr");
    for (const row of rows) {
      if (row.textContent?.includes(name)) {
        const link = row.querySelector("a") || row.querySelector("span") || row;
        link.click();
        return `row: ${row.textContent?.substring(0, 40)}`;
      }
    }
    return null;
  }, deviceName);
  
  if (clicked) {
    log(`   Clicked: ${clicked}`);
    await new Promise(r => setTimeout(r, 5000));
    log(`   URL: ${page.url()}`);
    return true;
  }
  return false;
}

/**
 * Wait for "Data monitoring" tab and click it
 */
async function clickDataMonitoringTab(page) {
  for (let attempt = 0; attempt < 20; attempt++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    
    if (attempt % 5 === 0) {
      const tabNames = await page.evaluate(() => {
        return Array.from(document.querySelectorAll(".el-tabs__item, [role='tab'], .el-tabs__nav *")).map(t => t.textContent?.trim()).filter(Boolean);
      });
      log(`   [${attempt}] tabs: ${JSON.stringify(tabNames)}`);
    }
    
    const clicked = await page.evaluate(() => {
      // Search ALL elements for "Data monitoring" text
      const all = document.querySelectorAll("*");
      for (const el of all) {
        if (el.children.length > 0) continue; // Only leaf nodes
        const text = el.textContent?.trim()?.toLowerCase() || "";
        if (text === "data monitoring" || text === "nodata monitoring") {
          el.click();
          return el.textContent?.trim();
        }
      }
      // Also try specific selectors
      const tabs = document.querySelectorAll(".el-tabs__item, [role='tab']");
      for (const tab of tabs) {
        const text = tab.textContent?.trim()?.toLowerCase() || "";
        if (text.includes("data monitor")) {
          tab.click();
          return tab.textContent?.trim();
        }
      }
      return null;
    });
    if (clicked) {
      await new Promise(r => setTimeout(r, 2000));
      log(`   ✅ Tab: "${clicked}"`);
      return true;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

/**
 * Read tags from Data monitoring table
 */
async function readTagsFromTable(page) {
  return page.evaluate(() => {
    const tags = {};
    const rows = document.querySelectorAll(".el-table__body-wrapper .el-table__row, .el-table__row");
    for (const row of rows) {
      const cells = row.querySelectorAll("td");
      if (cells.length < 4) continue;
      const nameCell = cells[1]?.querySelector(".cell") || cells[1];
      const valueCell = cells[3]?.querySelector(".cell") || cells[3];
      const name = nameCell?.textContent?.trim() || "";
      if (!name || name.includes("Status") || name.includes("Name")) continue;
      const switchEl = valueCell?.querySelector(".el-switch");
      if (switchEl) {
        tags[name] = switchEl.classList.contains("is-checked") ? 1 : 0;
      } else {
        const rawVal = valueCell?.textContent?.trim() || "0";
        const num = parseFloat(rawVal);
        tags[name] = isNaN(num) ? 0 : num;
      }
    }
    return tags;
  });
}

/**
 * Select a tag group from dropdown
 */
async function selectTagGroup(page, groupName) {
  const opened = await page.evaluate(() => {
    const selects = document.querySelectorAll(".el-select__wrapper, .el-select .el-input__wrapper, .el-input__inner");
    // Find the one near "Tags Group" text
    for (const sel of selects) {
      const parent = sel.closest(".el-select") || sel.parentElement;
      if (parent) {
        sel.click();
        return true;
      }
    }
    return false;
  });
  if (!opened) return false;
  await new Promise(r => setTimeout(r, 800));
  
  const found = await page.evaluate((target) => {
    const options = document.querySelectorAll(".el-select-dropdown__item, .el-scrollbar__view .el-option, li[class*='option']");
    for (const opt of options) {
      const text = opt.textContent?.trim() || "";
      if (text.toLowerCase() === target.toLowerCase() || text === target) {
        opt.click();
        return text;
      }
    }
    return null;
  }, groupName);
  
  if (found) {
    await new Promise(r => setTimeout(r, 1500));
    return true;
  }
  await page.keyboard.press("Escape");
  return false;
}

/**
 * Get all available group names from dropdown
 */
async function listTagGroups(page) {
  await page.evaluate(() => {
    const selects = document.querySelectorAll(".el-select__wrapper, .el-select .el-input__wrapper, .el-input__inner");
    for (const sel of selects) { sel.click(); return; }
  });
  await new Promise(r => setTimeout(r, 800));
  
  const groups = await page.evaluate(() => {
    const options = document.querySelectorAll(".el-select-dropdown__item, .el-scrollbar__view .el-option, li[class*='option']");
    return Array.from(options)
      .map(o => o.textContent?.trim())
      .filter(t => t && !t.match(/^\d+\/page$/)); // Filter out pagination like "10/page"
  });
  await page.keyboard.press("Escape");
  return groups;
}

function parseBormaData(tags) {
  const ovens = [];
  for (let i = 1; i <= 6; i++) {
    const tempCtr = Number(tags[`BM${i}_TEMP_CTR`] ?? 0);
    const pid = Boolean(tags[`BM${i}_PID`]);
    const sv1 = Boolean(tags[`BM${i}_SV1`]);
    const running = pid || sv1 || tempCtr > 30;
    ovens.push({ id: i, label: `BORMA ${i}`, running, tempCtr,
      temps: [1,2,3,4,5,6,7].map(j => ({ tag: `TI410${j}-${i}`, value: Number(tags[`TI410${j}-${i}`] ?? 0) }))
             .concat([{ tag: `HI4101-${i}`, value: Number(tags[`HI4101-${i}`] ?? 0) }]),
      pid, lv1: Boolean(tags[`BM${i}_LV1`]), sv1,
      lv1VL: Number(tags[`BM${i}_LV1_VL`] ?? 0),
      motors: [1,2,3,4].map(m => Boolean(tags[`BM${i}_M${m}`])),
      gdTempSV: Number(tags[`BM${i}_GD1_TEMP_SV`] ?? 0),
    });
  }
  return { ovens, humidity: Number(tags["HUMI_PHA"] ?? 0), rawTagCount: Object.keys(tags).length };
}

function parseSteamData(tags) {
  return [
    { id: "A", n: 1, label: "Cooker A", runTag: "Cooker1_Run" },
    { id: "B", n: 2, label: "Cooker B", runTag: "CookerB_Run" },
    { id: "C", n: 3, label: "Cooker C", runTag: "CookerC_Run" },
    { id: "D1", n: 4, label: "Cooker D1", runTag: "CookerD1_Run" },
    { id: "D2", n: 5, label: "Cooker D2", runTag: "CookerD2_Run" },
  ].map(c => ({
    id: c.id, label: c.label,
    running: Boolean(tags[c.runTag] ?? tags[`Cooker${c.n}_Run`]),
    t1: Number(tags[`Cooker${c.n}_T1`] ?? 0),
    t2: Number(tags[`Cooker${c.n}_T2`] ?? 0),
    steamPressure: Number(tags[`Cooker${c.n}_Press`] ?? 0),
    inputPressure: Number(tags[`Cooker${c.n}_InputPress`] ?? 0),
  }));
}

/**
 * Scrape all tags from current device's Data monitoring tab
 */
async function scrapeCurrentDevice(page) {
  const groups = await listTagGroups(page);
  log(`   Groups: ${JSON.stringify(groups)}`);

  const allTags = {};
  for (const group of groups) {
    const ok = await selectTagGroup(page, group);
    if (!ok) continue;
    const tags = await readTagsFromTable(page);
    if (Object.keys(tags).length > 0) {
      log(`   📋 ${group}: ${Object.keys(tags).length} tags`);
      Object.assign(allTags, tags);
    }
  }
  return allTags;
}

/**
 * Click a device in sidebar tree by name
 */
async function clickSidebarDevice(page, deviceName) {
  const clicked = await page.evaluate((name) => {
    const nodes = document.querySelectorAll(
      ".el-tree-node__content span, .custom-tree-node span, .el-tree-node__label"
    );
    for (const node of nodes) {
      const text = node.textContent?.trim() || "";
      if (text === name || text.includes(name)) {
        node.click();
        return text;
      }
    }
    return null;
  }, deviceName);
  if (clicked) {
    await new Promise(r => setTimeout(r, 3000));
    return clicked;
  }
  return null;
}

async function main() {
  log("=== V-NET Scraper v7 ===");

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      "--no-sandbox", "--disable-setuid-sandbox", "--start-maximized",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    await login(page);

    // ═══ BORMA ═══
    log("\n=== BORMA (Intersnack_LA) ===");
    const ok = await navigateToDeviceDetails(page, "Intersnack_LA");
    if (!ok) {
      log("❌ Could not navigate to Intersnack_LA");
      await page.goto("https://asean.v-iec.com/#/dashBoard?boxid=10009531", {
        waitUntil: "networkidle2", timeout: 30000,
      });
      await new Promise(r => setTimeout(r, 5000));
    }

    if (!await clickDataMonitoringTab(page)) {
      log("❌ BORMA: Data monitoring tab not found");
    } else {
      const bormaTags = await scrapeCurrentDevice(page);
      log(`   BORMA total: ${Object.keys(bormaTags).length} tags`);
      
      if (Object.keys(bormaTags).length > 0) {
        const d = parseBormaData(bormaTags);
        await supabaseUpsert("vnet_realtime_data", {
          id: "borma", data: d, demo: false, updated_at: new Date().toISOString(),
        });
        log(`✅ BORMA → Supabase (running=${d.ovens.filter(o => o.running).length}/6, humidity=${d.humidity}%)`);
      }
    }

    // ═══ STEAM ═══
    log("\n=== STEAM (STEAM_LA) ===");
    // Click STEAM_LA in sidebar tree (should be visible since we're already on the dashboard)
    const steamClicked = await clickSidebarDevice(page, "STEAM_LA");
    if (steamClicked) {
      log(`   Sidebar: "${steamClicked}"`);
      // Re-click Data monitoring tab for new device
      if (!await clickDataMonitoringTab(page)) {
        log("   ⚠️ STEAM: Data monitoring tab not found");
      } else {
        const steamTags = await scrapeCurrentDevice(page);
        log(`   STEAM total: ${Object.keys(steamTags).length} tags`);
        
        if (Object.keys(steamTags).length > 0) {
          const cookers = parseSteamData(steamTags);
          await supabaseUpsert("vnet_realtime_data", {
            id: "steam", data: { cookers }, demo: false, updated_at: new Date().toISOString(),
          });
          log(`✅ STEAM → Supabase (running=${cookers.filter(c => c.running).length}/5)`);
        }
      }
    } else {
      log("   ⚠️ STEAM_LA not found in sidebar");
    }

    log("\n=== Done ===");
  } finally {
    await browser.close();
  }
}

main().catch(e => { log(`❌ ${e.message}`); process.exit(1); });
