/**
 * Test V-NET on MAIN domain: asean.v-iec.com/api/
 * The Data Monitoring page uses the main domain, not api.asean.v-iec.com
 */
const crypto = require('crypto');

const API_BASE = "https://asean.v-iec.com/api";
const SID = "b587a89300124115a777d6137e095372";
const CUID = "1026098";
const BOX_ID = 10009531;

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
    const wcommon = buildWcommon(SID, CUID);
    const url = `${API_BASE}${path}`;
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "wcommon": wcommon,
                "Cookie": `ACCESS_SID=${SID}`,
            },
            body: JSON.stringify(body),
        });
        const text = await res.text();
        try {
            const json = JSON.parse(text);
            if (json.code === 200) {
                console.log(`  ✅ ${label}: SUCCESS`);
                return json;
            } else {
                console.log(`  ❌ ${label}: code=${json.code} msg=${json.msg}`);
            }
        } catch {
            console.log(`  ❌ ${label}: non-JSON (${text.substring(0, 100)})`);
        }
        return null;
    } catch (err) {
        console.log(`  ❌ ${label}: ${err.message}`);
        return null;
    }
}

async function main() {
    // 1. Try tag group list to get all Borma groups
    console.log("=== TAG GROUPS ===");
    const tagGroupEndpoints = [
        "/m5/tagGroup/getList",
        "/m5/tagGroup/list",
        "/m5/tag/getGroupList",
        "/m5/device/tagGroupList",
        "/m5/device/getTagGroupList",
        "/m5/pointGroup/getList",
    ];
    for (const ep of tagGroupEndpoints) {
        const r = await callAPI(ep, ep, { boxId: BOX_ID });
        if (r?.result) console.log(`    Result: ${JSON.stringify(r.result).substring(0, 500)}`);
    }

    // 2. Try real-time data
    console.log("\n=== REAL-TIME DATA ===");
    const rtEndpoints = [
        { p: "/m5/device/getRealTimeData", b: { boxId: BOX_ID } },
        { p: "/m5/point/getRealTimeData", b: { boxId: BOX_ID } },
        { p: "/m5/point/getList", b: { boxId: BOX_ID, pageNum: 1, pageSize: 200 } },
        { p: "/m5/tag/getList", b: { boxId: BOX_ID, pageNum: 1, pageSize: 200 } },
        { p: "/m5/tag/list", b: { boxId: BOX_ID, pageNum: 1, pageSize: 200 } },
        { p: "/m5/point/list", b: { boxId: BOX_ID, pageNum: 1, pageSize: 200 } },
    ];
    for (const ep of rtEndpoints) {
        const r = await callAPI(ep.p, ep.p, ep.b);
        if (r?.result) {
            const items = r.result.list || r.result;
            if (Array.isArray(items)) {
                console.log(`    Got ${items.length} items. First:`, JSON.stringify(items[0]).substring(0, 300));
            } else {
                console.log(`    Result: ${JSON.stringify(r.result).substring(0, 500)}`);
            }
        }
    }

    // 3. Try /m5/s endpoint (from browser intercept)
    console.log("\n=== /m5/s ENDPOINT ===");
    const tagIds = [10713977, 10713975, 10713973, 10713971, 10713969, 10713967, 10713965, 10713963, 10713961, 10713959];
    const sVariants = [
        { l: "/m5/s with array", b: tagIds },
        { l: "/m5/s with ids", b: { ids: tagIds } },
        { l: "/m5/s with boxId+ids", b: { boxId: BOX_ID, ids: tagIds } },
        { l: "/m5/s with tagIds", b: { tagIds: tagIds, boxId: BOX_ID } },
    ];
    for (const v of sVariants) {
        const r = await callAPI(v.l, "/m5/s", v.b);
        if (r?.result) console.log(`    Result: ${JSON.stringify(r.result).substring(0, 500)}`);
    }

    // 4. Try the real-time data endpoint via the same route the SPA would use
    console.log("\n=== SPA-STYLE ENDPOINTS ===");
    const spaEndpoints = [
        { p: "/m5/realTime/getTagValues", b: { boxId: BOX_ID, ids: tagIds } },
        { p: "/m5/realTime/getValue", b: { boxId: BOX_ID, ids: tagIds } },
        { p: "/m5/realTime/data", b: { boxId: BOX_ID } },
        { p: "/m5/device/realTimeData", b: { boxId: BOX_ID, groupId: -1, pageNum: 1, pageSize: 50 } },
        { p: "/m5/device/pointList", b: { boxId: BOX_ID, groupId: -1, pageNum: 1, pageSize: 50 } },
        { p: "/m5/device/allPointRealTimeData", b: { boxId: BOX_ID } },
    ];
    for (const ep of spaEndpoints) {
        const r = await callAPI(ep.p, ep.p, ep.b);
        if (r?.result) {
            const items = r.result.list || r.result;
            if (Array.isArray(items)) {
                console.log(`    Got ${items.length} items. First:`, JSON.stringify(items[0]).substring(0, 200));
            } else {
                console.log(`    Result: ${JSON.stringify(r.result).substring(0, 500)}`);
            }
        }
    }
    
    // 5. Try fetching main V-NET app.js to search for endpoint patterns
    console.log("\n=== SEARCHING V-NET app.js for API patterns ===");
    try {
        const jsRes = await fetch("https://asean.v-iec.com/js/app.56f44c59.js");
        const jsText = await jsRes.text();
        console.log(`  app.js size: ${jsText.length} bytes`);
        
        // Find API URL patterns
        const patterns = jsText.match(/["'](?:m5|m1)\/[a-zA-Z\/]+["']/g) || [];
        console.log(`  Found ${patterns.length} API paths:`);
        [...new Set(patterns)].sort().forEach(p => console.log(`    ${p}`));
    } catch (err) {
        console.log(`  Error: ${err.message}`);
    }
}

main();
