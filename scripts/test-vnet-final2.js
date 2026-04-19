/**
 * V-NET API with correct session - CUID=1026098, SID from browser
 * Also test with ACCESS_SID cookie like the real browser does
 */
const crypto = require('crypto');

const VNET_API = "https://asean.v-iec.com/api";
const SID = "b587a89300124115a777d6137e095372";
const CUID = "1026098";
const BOX_ID = 10009531; // Intersnack_LA

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

async function callAPI(label, url, body, method = "POST") {
    const wcommon = buildWcommon(SID, CUID);
    try {
        const opts = {
            method,
            headers: {
                "Content-Type": "application/json",
                "wcommon": wcommon,
                "Cookie": `ACCESS_SID=${SID}`,
            },
        };
        if (method === "POST") opts.body = JSON.stringify(body);
        
        const res = await fetch(url, opts);
        const json = await res.json();
        console.log(`\n[${label}] code=${json.code} msg=${json.msg}`);
        if (json.code === 200) {
            return json.result;
        }
        return null;
    } catch (err) {
        console.log(`\n[${label}] Error: ${err.message}`);
        return null;
    }
}

async function main() {
    // 1. Verify login works with CUID
    console.log("=== 1. DEVICE LIST ===");
    const devList = await callAPI("DeviceList", `${VNET_API}/m5/device/getList`, {});
    if (devList) console.log("  Result:", JSON.stringify(devList).substring(0, 300));

    // 2. Get device detail
    console.log("\n=== 2. DEVICE DETAIL ===");
    const detail = await callAPI("DevDetail", `${VNET_API}/m5/device/getList`, { boxId: BOX_ID });
    if (detail) console.log("  Result:", JSON.stringify(detail).substring(0, 500));

    // 3. Get real-time data (the key endpoint!)
    console.log("\n=== 3. REAL-TIME DATA ===");
    const rtEndpoints = [
        { l: "m1/device/getRealTimeData", u: `${VNET_API}/m1/device/getRealTimeData`, b: { boxId: BOX_ID } },
        { l: "m1/device/getRealTimeData+page", u: `${VNET_API}/m1/device/getRealTimeData`, b: { boxId: BOX_ID, pageNum: 1, pageSize: 200 } },
        { l: "m1/realTime/getTagList", u: `${VNET_API}/m1/realTime/getTagList`, b: { boxId: BOX_ID, pageNum: 1, pageSize: 200 } },
        { l: "m1/realTime/list", u: `${VNET_API}/m1/realTime/list`, b: { boxId: BOX_ID } },
        { l: "m5/realTime/getTagList", u: `${VNET_API}/m5/realTime/getTagList`, b: { boxId: BOX_ID, pageNum: 1, pageSize: 200 } },
    ];
    
    for (const ep of rtEndpoints) {
        const r = await callAPI(ep.l, ep.u, ep.b);
        if (r) {
            const items = r.list || r.tagList || r;
            if (Array.isArray(items)) {
                console.log(`  ✅ Got ${items.length} items!`);
                items.slice(0, 3).forEach(t => console.log(`    ${JSON.stringify(t).substring(0, 200)}`));
            } else {
                console.log("  Result:", JSON.stringify(r).substring(0, 500));
            }
        }
    }

    // 4. Try the "Data monitoring" tab endpoints (what the web UI calls)
    console.log("\n=== 4. TAG GROUP LIST ===");
    const groupEndpoints = [
        { l: "m5/tagGroup/getList", u: `${VNET_API}/m5/tagGroup/getList`, b: { boxId: BOX_ID } },
        { l: "m5/tagGroup/list", u: `${VNET_API}/m5/tagGroup/list`, b: { boxId: BOX_ID } },
        { l: "m5/tag/getGroupList", u: `${VNET_API}/m5/tag/getGroupList`, b: { boxId: BOX_ID } },
        { l: "m5/device/tagGroup", u: `${VNET_API}/m5/device/tagGroup`, b: { boxId: BOX_ID } },
    ];
    
    for (const ep of groupEndpoints) {
        const r = await callAPI(ep.l, ep.u, ep.b);
        if (r) {
            const items = r.list || r;
            if (Array.isArray(items)) {
                console.log(`  ✅ Got ${items.length} groups!`);
                items.slice(0, 10).forEach(t => console.log(`    ${JSON.stringify(t).substring(0, 200)}`));
            } else {
                console.log("  Result:", JSON.stringify(r).substring(0, 500));
            }
        }
    }

    // 5. Try tag list endpoints
    console.log("\n=== 5. TAG LIST ===");
    const tagEndpoints = [
        { l: "m5/tag/getList", u: `${VNET_API}/m5/tag/getList`, b: { boxId: BOX_ID, pageNum: 1, pageSize: 200 } },
        { l: "m5/tag/list", u: `${VNET_API}/m5/tag/list`, b: { boxId: BOX_ID, pageNum: 1, pageSize: 200 } },
        { l: "m5/tag/getTagList", u: `${VNET_API}/m5/tag/getTagList`, b: { boxId: BOX_ID, pageNum: 1, pageSize: 200 } },
        { l: "m5/device/getTagList", u: `${VNET_API}/m5/device/getTagList`, b: { boxId: BOX_ID, pageNum: 1, pageSize: 200 } },
        { l: "m5/device/tagList", u: `${VNET_API}/m5/device/tagList`, b: { boxId: BOX_ID, pageNum: 1, pageSize: 200 } },
    ];
    
    for (const ep of tagEndpoints) {
        const r = await callAPI(ep.l, ep.u, ep.b);
        if (r) {
            const items = r.list || r.tagList || r;
            if (Array.isArray(items)) {
                console.log(`  ✅ Got ${items.length} tags!`);
                items.slice(0, 5).forEach(t => console.log(`    ${JSON.stringify(t).substring(0, 250)}`));
                if (r.total) console.log(`  Total: ${r.total}`);
            } else {
                console.log("  Result:", JSON.stringify(r).substring(0, 500));
            }
        }
    }

    // 6. Try the third-party API domain
    console.log("\n=== 6. THIRD-PARTY API (api.asean.v-iec.com) ===");
    const thirdAPI = "https://api.asean.v-iec.com";
    const thirdEndpoints = [
        { l: "getRealTimeData", u: `${thirdAPI}/v1/device/getRealTimeData`, b: { boxId: BOX_ID } },
        { l: "getTagList", u: `${thirdAPI}/v1/tag/getList`, b: { boxId: BOX_ID, pageNum: 1, pageSize: 200 } },
        { l: "getDeviceList", u: `${thirdAPI}/v1/device/getList`, b: {} },
    ];
    
    for (const ep of thirdEndpoints) {
        const r = await callAPI(ep.l, ep.u, ep.b);
        if (r) {
            console.log("  ✅ Result:", JSON.stringify(r).substring(0, 500));
        }
    }
}

main();
