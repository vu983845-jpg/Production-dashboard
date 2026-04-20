/**
 * Quick test - V-NET m3 without /api prefix
 */
const crypto = require("crypto");

const SUPABASE_URL = "https://iekjajbmbkqrbalnjwit.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlla2phamJtYmtxcmJhbG5qd2l0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjYwNzEwMiwiZXhwIjoyMDg4MTgzMTAyfQ.XZaEyZGWgEB3PheVg559X-kyyIfARl-KAo83Wzeclg8";

const BORMA_BOX_ID = 10009531;
const BORMA_DEVICE_NO = "V14000251016022f4f8dec5b95d";

async function getSession() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/vnet_sessions?id=eq.1&select=sid,cuid`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  return (await res.json())[0];
}

function buildWcommon(sid, cuid) {
  const ts = Date.now();
  const raw = `${cuid}${sid}${ts}`;
  const sign = crypto.createHash("md5").update(raw).digest("hex");
  return JSON.stringify({ cuid, pid: "1", sv: "1.0", ts, mt: 255, lan: "en", sid, sign, domain: "asean.v-iec.com" });
}

async function tryUrl(label, url, body, sid, cuid) {
  const wcommon = buildWcommon(sid, cuid);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", wcommon, Cookie: `ACCESS_SID=${sid}` },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = null; }
    const list = json?.result?.list || json?.result?.tagList || json?.result || [];
    const count = Array.isArray(list) ? list.length : 0;
    const status = res.status;
    console.log(`[${status}][${label}] code=${json?.code} msg=${json?.msg} items=${count}`);
    if (count > 0) {
      console.log("  ✅ Sample:", JSON.stringify(list.slice(0,2)));
    }
    return count > 0;
  } catch (e) {
    console.log(`[ERR][${label}] ${e.message}`);
    return false;
  }
}

async function main() {
  const { sid, cuid } = await getSession();
  console.log(`SID: ${sid.substring(0,16)}...  CUID: ${cuid}\n`);

  const V = "https://asean.v-iec.com";
  
  // Test WITHOUT /api/ prefix
  console.log("=== WITHOUT /api prefix ===");
  await tryUrl("m3 getRealTimeData boxId", `${V}/m3/device/getRealTimeData`, { boxId: BORMA_BOX_ID }, sid, cuid);
  await tryUrl("m3 getRealTimeData deviceNo", `${V}/m3/device/getRealTimeData`, { deviceNo: BORMA_DEVICE_NO }, sid, cuid);
  await tryUrl("m1 getRealTimeData boxId", `${V}/m1/device/getRealTimeData`, { boxId: BORMA_BOX_ID }, sid, cuid);
  await tryUrl("m5 getRealTimeData boxId", `${V}/m5/device/getRealTimeData`, { boxId: BORMA_BOX_ID }, sid, cuid);
  
  // Test WITH /api prefix
  console.log("\n=== WITH /api prefix ===");
  await tryUrl("api/m3 getRealTimeData boxId", `${V}/api/m3/device/getRealTimeData`, { boxId: BORMA_BOX_ID }, sid, cuid);
  await tryUrl("api/m3 getRealTimeData deviceNo", `${V}/api/m3/device/getRealTimeData`, { deviceNo: BORMA_DEVICE_NO }, sid, cuid);
  
  // GET requests
  console.log("\n=== GET requests ===");
  try {
    const wc = buildWcommon(sid, cuid);
    const res1 = await fetch(`${V}/m3/device/getRealTimeData?boxId=${BORMA_BOX_ID}`, {
      headers: { wcommon: wc, Cookie: `ACCESS_SID=${sid}` }
    });
    const j1 = await res1.json();
    console.log(`[GET m3] code=${j1.code} msg=${j1.msg}`);
  } catch(e) { console.log(`[GET m3] ${e.message}`); }
  
  try {
    const wc = buildWcommon(sid, cuid);
    const res2 = await fetch(`${V}/m3/device/getRealTimeData?deviceNo=${BORMA_DEVICE_NO}`, {
      headers: { wcommon: wc, Cookie: `ACCESS_SID=${sid}` }
    });
    const j2 = await res2.json();
    console.log(`[GET m3 deviceNo] code=${j2.code} msg=${j2.msg}`);
  } catch(e) { console.log(`[GET m3 deviceNo] ${e.message}`); }
}

main().catch(console.error);
