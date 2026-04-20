/**
 * vnet-data-fetcher.js
 * 
 * Khác với vnet-session-refresher.js (chỉ lấy SID),
 * script này dùng Puppeteer để:
 * 1. Login vào V-NET
 * 2. Điều hướng đến trang Data monitoring của từng thiết bị
 * 3. Extract data thật trực tiếp từ trang (bypass API restriction)
 * 4. Lưu data vào Supabase để Vercel dashboard đọc
 * 
 * Chạy: node vnet-data-fetcher.js
 * Task Scheduler: mỗi 5 phút
 */

const puppeteer = require("puppeteer");

const VNET_USERNAME = "Intersnack_Vu";
const VNET_PASSWORD = "Longan11";

const SUPABASE_URL = "https://iekjajbmbkqrbalnjwit.supabase.co";
const SUPABASE_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlla2phamJtYmtxcmJhbG5qd2l0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjYwNzEwMiwiZXhwIjoyMDg4MTgzMTAyfQ.XZaEyZGWgEB3PheVg559X-kyyIfARl-KAo83Wzeclg8";

const BORMA_BOX_ID = 10009531;
const STEAM_BOX_ID = 6417916;

function log(msg) {
  console.log(`[${new Date().toLocaleString("vi-VN")}] ${msg}`);
}

async function supabaseUpsert(table, data) {
  const body = JSON.stringify(data);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body,
  });
  return res.ok || res.status === 204;
}

/**
 * Use Puppeteer to call the V-NET API directly from within the browser context
 * (same origin, so no CORS/auth issues)
 */
async function fetchVnetDataInBrowser(page, boxId) {
  return await page.evaluate(async (boxId) => {
    // Get wcommon from localStorage (set after login)
    function buildWcommon() {
      const userStr = localStorage.getItem("userInfo") || "{}";
      let user = {};
      try { user = JSON.parse(userStr); } catch {}
      
      const sid = user.sid || "";
      const cuid = String(user.accountId || user.cuid || "");
      const ts = Date.now();
      
      // MD5 implementation (inline since we can't import crypto in browser)
      // Use the fact that V-NET's own JS has MD5 — or read from the wcommon cookie
      const wcommonStr = localStorage.getItem("wcommon") || sessionStorage.getItem("wcommon") || "";
      if (wcommonStr) {
        try {
          const wc = JSON.parse(wcommonStr);
          if (wc.sid) return wcommonStr;
        } catch {}
      }
      return null;
    }

    // Try to get the wcommon header from a fresh request intercepted in memory
    // Actually, let's use fetch interceptor approach - intercept XMLHttpRequest
    // The simplest: call the API the same way the page does, via fetch with credentials
    const tryUrls = [
      { url: "/api/m3/device/getRealTimeData", body: { boxId } },
      { url: "/api/m1/device/getRealTimeData", body: { boxId } },
      { url: "/api/m5/device/getRealTimeData", body: { boxId } },
      { url: "/api/m1/realTime/getTagList", body: { boxId, pageNum: 1, pageSize: 300 } },
    ];

    // Read cookies from document.cookie for Access_SID
    const sidMatch = document.cookie.match(/ACCESS_SID=([^;]+)/);
    const sid = sidMatch ? sidMatch[1] : "";
    
    for (const { url, body } of tryUrls) {
      try {
        const res = await fetch(`https://asean.v-iec.com${url}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // The browser will automatically include cookies (same domain)
          },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (json.code === 200 && json.result) {
          const list = json.result?.list || json.result?.tagList || [];
          if (Array.isArray(list) && list.length > 0) {
            return { success: true, url, count: list.length, tags: list };
          }
        }
      } catch (e) {
        // Continue trying
      }
    }
    
    return { success: false, sid };
  }, boxId);
}

async function main() {
  log("=== V-NET Data Fetcher bắt đầu ===");
  
  let browser;
  let capturedSid = null;
  let capturedCuid = null;
  let bormaData = null;
  let steamData = null;

  try {
    log("Đang mở Puppeteer...");
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });

    const page = await browser.newPage();
    
    // Enable request interception to capture wcommon from requests
    // Also: intercept responses from data API calls
    let capturedWcommon = null;
    let capturedRealTimeData = [];
    
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const wc = req.headers()["wcommon"];
      if (wc) capturedWcommon = wc;
      req.continue();
    });

    page.on("response", async (response) => {
      const url = response.url();
      try {
        if (url.includes("/m4/sign/login")) {
          const json = await response.json();
          if (json?.code === 200 && json?.result?.sid) {
            capturedSid = json.result.sid;
            capturedCuid = String(json.result.accountId || json.result.cuid || "1026098");
            log(`✅ SID: ${capturedSid.substring(0, 16)}... CUID: ${capturedCuid}`);
          }
        }
        // Capture any realtime data responses automatically
        if (url.includes("getRealTimeData") || url.includes("realTime") || url.includes("tagList")) {
          const json = await response.json();
          if (json?.code === 200 && json?.result) {
            const list = json.result?.list || json.result?.tagList || [];
            if (Array.isArray(list) && list.length > 0) {
              log(`📡 Auto-captured ${list.length} tags from ${url.split("/api/")[1] || url}`);
              capturedRealTimeData.push({ url, list });
            }
          }
        }
      } catch {}
    });

    // Login
    log("Đang login...");
    await page.goto("https://asean.v-iec.com/#/login", { waitUntil: "networkidle2", timeout: 30000 });
    await page.waitForSelector('input[type="text"]', { timeout: 15000 });
    await page.click('input[type="text"]');
    await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control");
    await page.type('input[type="text"]', VNET_USERNAME, { delay: 50 });
    await page.click('input[type="password"]');
    await page.type('input[type="password"]', VNET_PASSWORD, { delay: 50 });
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(
        b => b.textContent?.toLowerCase().includes("login") || b.getAttribute("type") === "submit"
      );
      if (btn) btn.click();
    });
    await page.waitForNavigation({ timeout: 20000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));
    log(`URL sau login: ${page.url()}`);

    // Navigate to BORMA device monitoring page directly  
    log("Đang mở trang monitoring BORMA...");
    await page.goto(
      `https://asean.v-iec.com/#/deviceMonitor?boxId=${BORMA_BOX_ID}`,
      { waitUntil: "networkidle2", timeout: 20000 }
    ).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));
    log(`URL: ${page.url()} — captured so far: ${capturedRealTimeData.length} response(s)`);

    // Try the Data Monitoring tab (triggers API calls)
    await page.goto(
      `https://asean.v-iec.com/#/dataCenter?boxId=${BORMA_BOX_ID}&tab=realtime`,
      { waitUntil: "networkidle2", timeout: 20000 }
    ).catch(() => {});
    await new Promise(r => setTimeout(r, 4000));
    log(`Captured so far: ${capturedRealTimeData.length} response(s)`);

    // Also try navigating to the device data page
    await page.goto(
      `https://asean.v-iec.com/#/dashBoard?boxid=${BORMA_BOX_ID}`,
      { waitUntil: "networkidle2", timeout: 20000 }
    ).catch(() => {});
    await new Promise(r => setTimeout(r, 4000));
    log(`After dashboard: ${capturedRealTimeData.length} response(s)`);

    // Try calling V-NET API from within the browser page (same-origin, cookies included)
    log("Calling V-NET APIs from browser context (same-origin)...");
    const bormaResult = await fetchVnetDataInBrowser(page, BORMA_BOX_ID);
    log(`BORMA in-browser fetch: ${JSON.stringify(bormaResult).substring(0, 200)}`);

    // Process any auto-captured data
    for (const captured of capturedRealTimeData) {
      log(`Processing captured data from ${captured.url}: ${captured.list.length} tags`);
      // Build tag map
      const tagMap = {};
      for (const t of captured.list) {
        const name = t.name || t.tagName || t.tag || "";
        const val = t.value ?? t.val ?? t.numerical ?? 0;
        if (name) tagMap[name] = val;
      }
      
      // Check which device (BORMA has BM1_TEMP_CTR, STEAM has Cooker1_Run)
      const isBorma = "BM1_TEMP_CTR" in tagMap || "HUMI_PHA" in tagMap;
      const isSteam = "Cooker1_Run" in tagMap || "CookerA_Run" in tagMap;
      
      if (isBorma) {
        log(`  → BORMA data! Tags: ${Object.keys(tagMap).slice(0, 10).join(", ")}`);
        bormaData = parseBormaData(tagMap);
      }
      if (isSteam) {
        log(`  → STEAM data! Tags: ${Object.keys(tagMap).slice(0, 10).join(", ")}`);
        steamData = parseSteamData(tagMap);
      }
    }

    // Process in-browser fetch results
    if (bormaResult?.success && bormaResult.tags) {
      const tagMap = {};
      for (const t of bormaResult.tags) {
        tagMap[t.name || t.tagName || ""] = t.value ?? 0;
      }
      bormaData = parseBormaData(tagMap);
      log(`✅ BORMA data from in-browser fetch: ${Object.keys(tagMap).length} tags`);
    }

    // Save to Supabase
    if (capturedSid) {
      await supabaseUpsert("vnet_sessions", {
        id: 1, sid: capturedSid, cuid: capturedCuid, updated_at: new Date().toISOString(),
      });
      log("✅ Session lưu vào Supabase");
    }

    if (bormaData) {
      await supabaseUpsert("vnet_realtime_data", {
        id: "borma", data: bormaData, demo: false, updated_at: new Date().toISOString(),
      });
      log("✅ BORMA data lưu vào Supabase");
    } else {
      log("⚠️ Không lấy được data BORMA — giữ nguyên data cũ trong Supabase");
    }

    if (steamData) {
      await supabaseUpsert("vnet_realtime_data", {
        id: "steam", data: steamData, demo: false, updated_at: new Date().toISOString(),
      });
      log("✅ STEAM data lưu vào Supabase");
    }

    log("=== Hoàn tất ===");
  } catch (err) {
    log(`❌ Lỗi: ${err.message}`);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

function parseBormaData(tags) {
  const ovens = [];
  for (let i = 1; i <= 6; i++) {
    const tempCtr = Number(tags[`BM${i}_TEMP_CTR`] || 0);
    const pid = Boolean(tags[`BM${i}_PID`]);
    const sv1 = Boolean(tags[`BM${i}_SV1`]);
    const running = pid || sv1 || tempCtr > 30;
    ovens.push({
      id: i, label: `BORMA ${i}`, running, tempCtr,
      temps: [1,2,3,4,5,6,7].map(j => ({ tag: `TI410${j}-${i}`, value: Number(tags[`TI410${j}-${i}`] || 0) }))
        .concat([{ tag: `HI4101-${i}`, value: Number(tags[`HI4101-${i}`] || 0) }]),
      pid, lv1: Boolean(tags[`BM${i}_LV1`]), sv1,
      lv1VL: Number(tags[`BM${i}_LV1_VL`] || 0),
      motors: [1,2,3,4].map(m => Boolean(tags[`BM${i}_M${m}`])),
      gdTempSV: Number(tags[`BM${i}_GD1_TEMP_SV`] || 0),
    });
  }
  return { ovens, humidity: Number(tags["HUMI_PHA"] || 0) };
}

function parseSteamData(tags) {
  const cookers = [
    { id: "A", n: 1, label: "Cooker A", runTag: "Cooker1_Run" },
    { id: "B", n: 2, label: "Cooker B", runTag: "CookerB_Run" },
    { id: "C", n: 3, label: "Cooker C", runTag: "CookerC_Run" },
    { id: "D1", n: 4, label: "Cooker D1", runTag: "CookerD1_Run" },
    { id: "D2", n: 5, label: "Cooker D2", runTag: "CookerD2_Run" },
  ];
  return cookers.map(c => ({
    id: c.id, label: c.label,
    running: Boolean(tags[c.runTag] || tags[`Cooker${c.n}_Run`]),
    t1: Number(tags[`Cooker${c.n}_T1`] || 0),
    t2: Number(tags[`Cooker${c.n}_T2`] || 0),
    steamPressure: Number(tags[`Cooker${c.n}_Press`] || 0),
    inputPressure: Number(tags[`Cooker${c.n}_InputPress`] || 0),
  }));
}

main();
