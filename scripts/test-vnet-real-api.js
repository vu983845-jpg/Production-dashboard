/**
 * Test V-NET REAL API endpoint: api.asean.v-iec.com/m5/s
 * This is the actual endpoint used by Data Monitoring tab!
 */
const crypto = require('crypto');

const API_BASE = "https://api.asean.v-iec.com";
const SID = "b587a89300124115a777d6137e095372";
const CUID = "1026098";
const BOX_ID = 10009531;

// From Data Monitoring page - Borma 1 tag IDs:
// BM1_TEMP_CTR=10713977, BM1_PID=10713975, BM1_LV1=10713973, BM1_SV1=10713971
// TI4107-1=10713969, BM1_LV1_VL=10713967, BM1_M4=10713965, BM1_M3=10713963
// BM1_M2=10713961, BM1_M1=10713959

const BORMA1_TAG_IDS = [10713977, 10713975, 10713973, 10713971, 10713969, 10713967, 10713965, 10713963, 10713961, 10713959];

function buildWcommon(sid, cuid) {
    const ts = Date.now();
    const raw = `${cuid}${sid}${ts}`;
    const sign = crypto.createHash("md5").update(raw).digest("hex");
    return JSON.stringify({
        cuid,
        pid: "1",
        sv: "1.0",
        ts,
        mt: 255,
        lan: "en",
        sid,
        sign,
        domain: "asean.v-iec.com",
    });
}

async function callAPI(label, path, body) {
    console.log(`\n--- ${label} ---`);
    const wcommon = buildWcommon(SID, CUID);
    const url = `${API_BASE}${path}`;
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "wcommon": wcommon,
            },
            body: JSON.stringify(body),
        });
        const text = await res.text();
        console.log(`  Status: ${res.status}`);
        try {
            const json = JSON.parse(text);
            console.log(`  code: ${json.code}, msg: ${json.msg}`);
            if (json.code === 200 && json.result) {
                return json.result;
            }
            console.log(`  Full response: ${text.substring(0, 500)}`);
        } catch {
            console.log(`  Response: ${text.substring(0, 500)}`);
        }
        return null;
    } catch (err) {
        console.log(`  Error: ${err.message}`);
        return null;
    }
}

async function main() {
    // 1. Try /m5/s with tag IDs
    console.log("========== /m5/s - Real-time tag values ==========");
    let r = await callAPI("m5/s with tag IDs array", "/m5/s", BORMA1_TAG_IDS);
    if (r) {
        console.log("  ✅ Result:", JSON.stringify(r).substring(0, 1000));
    }

    // Try with object wrapping
    r = await callAPI("m5/s with ids object", "/m5/s", { ids: BORMA1_TAG_IDS });
    if (r) console.log("  ✅ Result:", JSON.stringify(r).substring(0, 1000));

    r = await callAPI("m5/s with tagIds", "/m5/s", { tagIds: BORMA1_TAG_IDS });
    if (r) console.log("  ✅ Result:", JSON.stringify(r).substring(0, 1000));

    r = await callAPI("m5/s with boxId+tagIds", "/m5/s", { boxId: BOX_ID, tagIds: BORMA1_TAG_IDS });
    if (r) console.log("  ✅ Result:", JSON.stringify(r).substring(0, 1000));

    // 2. Try getting tag list from api domain
    console.log("\n========== Device & Tag List from api domain ==========");
    const endpoints = [
        { l: "m5/device/getList", p: "/m5/device/getList", b: {} },
        { l: "m5/device/getDetail", p: "/m5/device/getDetail", b: { boxId: BOX_ID } },
        { l: "m5/tag/getList", p: "/m5/tag/getList", b: { boxId: BOX_ID, pageNum: 1, pageSize: 200 } },
        { l: "m5/tagGroup/getList", p: "/m5/tagGroup/getList", b: { boxId: BOX_ID } },
        { l: "m1/device/getRealTimeData", p: "/m1/device/getRealTimeData", b: { boxId: BOX_ID } },
        { l: "m5/device/getRealTimeData", p: "/m5/device/getRealTimeData", b: { boxId: BOX_ID } },
        { l: "m5/tag/getRealTimeData", p: "/m5/tag/getRealTimeData", b: { boxId: BOX_ID } },
        { l: "m5/point/getList", p: "/m5/point/getList", b: { boxId: BOX_ID, pageNum: 1, pageSize: 200 } },
        { l: "m5/point/getRealTimeValues", p: "/m5/point/getRealTimeValues", b: { boxId: BOX_ID } },
    ];

    for (const ep of endpoints) {
        const result = await callAPI(ep.l, ep.p, ep.b);
        if (result) {
            const items = result.list || result.tagList || result;
            if (Array.isArray(items)) {
                console.log(`  ✅ Got ${items.length} items!`);
                items.slice(0, 3).forEach(t => console.log(`    ${JSON.stringify(t).substring(0, 300)}`));
                if (result.total) console.log(`  Total: ${result.total}`);
            } else {
                console.log("  ✅ Result:", JSON.stringify(result).substring(0, 500));
            }
        }
    }
}

main();
