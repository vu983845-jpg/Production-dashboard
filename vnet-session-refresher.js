/**
 * vnet-session-refresher.js
 * 
 * Chạy script này trên máy Windows này bằng Task Scheduler mỗi 2-4 tiếng.
 * Nó sẽ tự login vào V-NET, lấy SID mới, và lưu vào Supabase.
 * Dashboard trên Vercel sẽ tự đọc SID mới từ Supabase → luôn có data thật.
 * 
 * Cách chạy thủ công:  node vnet-session-refresher.js
 * Cách cài Task Scheduler: Xem cuối file
 */

const puppeteer = require("puppeteer");
const https = require("https");

// ──── Cấu hình ────────────────────────────────────────────────────────────
const VNET_URL = "https://asean.v-iec.com/#/login";
const VNET_USERNAME = "Intersnack_Vu";
const VNET_PASSWORD = "Longan11";

const SUPABASE_URL = "https://iekjajbmbkqrbalnjwit.supabase.co";
const SUPABASE_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlla2phamJtYmtxcmJhbG5qd2l0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjYwNzEwMiwiZXhwIjoyMDg4MTgzMTAyfQ.XZaEyZGWgEB3PheVg559X-kyyIfARl-KAo83Wzeclg8";
// ─────────────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toLocaleString("vi-VN");
  console.log(`[${ts}] ${msg}`);
}

async function saveToSupabase(sid, cuid) {
  const body = JSON.stringify({
    id: 1, // always upsert the same row
    sid,
    cuid,
    updated_at: new Date().toISOString(),
  });

  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/vnet_sessions`);
    const options = {
      hostname: url.hostname,
      path: url.pathname + "?id=eq.1",
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: "return=minimal",
      },
    };

    const req = https.request(options, (res) => {
      // If PATCH returns 404 (row doesn't exist yet), do a POST instead
      if (res.statusCode === 404 || res.statusCode === 0) {
        insertToSupabase(sid, cuid).then(resolve).catch(reject);
        return;
      }
      // Read and handle the response
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else {
          // Try INSERT instead
          insertToSupabase(sid, cuid).then(resolve).catch(reject);
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function insertToSupabase(sid, cuid) {
  const body = JSON.stringify({ id: 1, sid, cuid, updated_at: new Date().toISOString() });

  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/vnet_sessions`);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else {
          reject(new Error(`Supabase insert failed: ${res.statusCode} ${data}`));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  log("=== V-NET Session Refresher bắt đầu ===");

  let browser;
  let capturedSid = null;
  let capturedCuid = null;

  try {
    log("Đang mở trình duyệt ẩn Puppeteer...");
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();

    // Intercept network requests to capture the wcommon token from login response
    page.on("response", async (response) => {
      const url = response.url();
      if (url.includes("/m4/sign/login") || url.includes("/sign/login")) {
        try {
          const json = await response.json();
          if (json?.code === 200 && json?.result?.sid) {
            capturedSid = json.result.sid;
            // CUID may be in result directly, or as userId/id
            capturedCuid = String(
              json.result.cuid ||
              json.result.accountId ||
              json.result.userId ||
              json.result.id ||
              ""
            );
            log(`✅ Đã capture SID từ network: ${capturedSid.substring(0, 16)}...`);
            log(`   RAW result keys: ${Object.keys(json.result).join(", ")}`);
            log(`   CUID raw: ${JSON.stringify(json.result).substring(0, 200)}`);
          }
        } catch {}
      }
    });

    // Also capture cookies after login
    log(`Đang truy cập ${VNET_URL}...`);
    await page.goto("https://asean.v-iec.com/#/login", {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Wait for login form
    await page.waitForSelector('input[type="text"], input[placeholder*="account"], input[placeholder*="tài khoản"], input[name="account"], input[name="username"]', {
      timeout: 15000,
    });

    // Fill username
    const usernameSelector = 'input[type="text"], input[name="account"], input[name="username"], input[placeholder*="account"]';
    await page.click(usernameSelector);
    await page.keyboard.down("Control");
    await page.keyboard.press("a");
    await page.keyboard.up("Control");
    await page.type(usernameSelector, VNET_USERNAME, { delay: 50 });
    log(`Đã nhập username: ${VNET_USERNAME}`);

    // Fill password
    await page.click('input[type="password"]');
    await page.type('input[type="password"]', VNET_PASSWORD, { delay: 50 });
    log("Đã nhập password");

    // Click login button — use evaluate to find by text content (avoid :has-text which isn't standard CSS)
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const btn = btns.find(
        (b) =>
          b.textContent?.toLowerCase().includes("login") ||
          b.textContent?.toLowerCase().includes("đăng nhập") ||
          b.textContent?.toLowerCase().includes("sign in") ||
          b.getAttribute("type") === "submit"
      );
      if (btn) btn.click();
    });

    log("Đã click nút Login, đang chờ redirect...");

    // Wait for redirect to overview
    await page.waitForNavigation({ timeout: 20000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 3000));

    // Try to get SID from cookies
    if (!capturedSid) {
      const cookies = await page.cookies();
      const sidCookie = cookies.find(
        (c) => c.name === "ACCESS_SID" || c.name === "sid" || c.name === "SID"
      );
      if (sidCookie) {
        capturedSid = sidCookie.value;
        log(`✅ Đã lấy SID từ cookie: ${capturedSid.substring(0, 16)}...`);
      }
    }

    // Try localStorage — CUID is almost always stored here even if not in login response
    const lsResult = await page.evaluate(() => {
      const result = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const val = localStorage.getItem(key) || "";
        // Look for keys containing cuid, userId, or user objects
        if (val.includes('"cuid"') || val.includes('"userId"') || val.includes('"sid"')) {
          try {
            const obj = JSON.parse(val);
            if (obj.cuid) result.cuid = String(obj.cuid);
            if (obj.userId) result.cuid = result.cuid || String(obj.userId);
            if (obj.sid && !capturedSid) result.sid = obj.sid;
          } catch {}
        }
      }
      return result;
    });
    if (lsResult.cuid) {
      capturedCuid = lsResult.cuid;
      log(`   CUID từ localStorage: ${capturedCuid}`);
    }
    if (!capturedSid && lsResult.sid) {
      capturedSid = lsResult.sid;
      log(`✅ Đã lấy SID từ localStorage: ${capturedSid.substring(0, 16)}...`);
    }

    // Fallback CUID to known value if still empty
    if (!capturedCuid) {
      capturedCuid = "1026098";
      log(`   CUID không tìm thấy, dùng fallback: ${capturedCuid}`);
    }

    const currentUrl = page.url();
    log(`URL hiện tại: ${currentUrl}`);

    if (!capturedSid) {
      log("❌ Không lấy được SID. Kiểm tra lại thông tin đăng nhập hoặc trang login thay đổi.");
      process.exit(1);
    }

    // Save to Supabase
    log(`Đang lưu SID vào Supabase...`);
    await saveToSupabase(capturedSid, capturedCuid);
    log(`✅ Đã lưu thành công!`);
    log(`   SID: ${capturedSid}`);
    log(`   CUID: ${capturedCuid}`);
    log("=== Hoàn tất ===");
  } catch (err) {
    log(`❌ Lỗi: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

main();

/*
═══════════════════════════════════════════════════════════════════
  CÁCH CÀI WINDOWS TASK SCHEDULER để chạy tự động mỗi 4 tiếng:

  1. Mở "Task Scheduler" (tìm trong Start Menu)
  2. "Create Basic Task" → Đặt tên: "VNET Session Refresher"
  3. Trigger: "Daily" → "Repeat task every: 4 hours"
  4. Action: "Start a program"
     Program: node
     Arguments: C:\Users\Cashew\.gemini\Dassboard\factory-dashboard\vnet-session-refresher.js
     Start in:  C:\Users\Cashew\.gemini\Dassboard\factory-dashboard
  5. Finish

  Hoặc chạy file .bat dưới đây:
═══════════════════════════════════════════════════════════════════
*/
