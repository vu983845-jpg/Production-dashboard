/**
 * Test V-NET API with correct SID + CUID
 */
const crypto = require('crypto');

const VNET_API = "https://asean.v-iec.com/api";
const SID = "b587a89300124115a777d6137e095372";
const CUID = "1026098";
const BOX_ID_LA = 10009531;   // Intersnack_LA (BORMA) - online
const BOX_ID_LA1 = 21836;     // Intersnack_LA1 - online
const BOX_ID_STEAM = 6417916; // STEAM_LA - offline

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

async function callAPI(label, url, body) {
    console.log(`\n--- ${label} ---`);
    const wcommon = buildWcommon(SID, CUID);
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", wcommon },
            body: JSON.stringify(body),
        });
        const json = await res.json();
        console.log(`  code: ${json.code}, msg: ${json.msg}`);
        if (json.code === 200 && json.result) {
            return json.result;
        }
        return null;
    } catch (err) {
        console.log(`  Error: ${err.message}`);
        return null;
    }
}

async function main() {
    // 1. Device list
    console.log("========== DEVICE LIST ==========");
    const devResult = await callAPI("m5/device/getList", `${VNET_API}/m5/device/getList`, {});
    if (devResult) {
        const groups = devResult.list || devResult;
        console.log("  Result:", JSON.stringify(devResult).substring(0, 1000));
    }

    // 2. Get device details for Intersnack_LA (BORMA)
    console.log("\n========== DEVICE DETAILS - Intersnack_LA ==========");
    const endpoints = [
        { label: "getList with boxId", url: `${VNET_API}/m5/device/getList`, body: { boxId: BOX_ID_LA } },
        { label: "getDetail", url: `${VNET_API}/m5/device/getDetail`, body: { boxId: BOX_ID_LA } },
        { label: "getRealTimeData m1", url: `${VNET_API}/m1/device/getRealTimeData`, body: { boxId: BOX_ID_LA } },
        { label: "getRealTimeData m5", url: `${VNET_API}/m5/device/getRealTimeData`, body: { boxId: BOX_ID_LA } },
    ];
    
    for (const ep of endpoints) {
        const r = await callAPI(ep.label, ep.url, ep.body);
        if (r) {
            console.log("  ✅ Result:", JSON.stringify(r).substring(0, 1500));
        }
    }

    // 3. Try tag endpoints
    console.log("\n========== TAG DATA ==========");
    const tagEndpoints = [
        { label: "m5/tag/getTagList", url: `${VNET_API}/m5/tag/getTagList`, body: { boxId: BOX_ID_LA, pageNum: 1, pageSize: 200 } },
        { label: "m5/tag/list", url: `${VNET_API}/m5/tag/list`, body: { boxId: BOX_ID_LA, pageNum: 1, pageSize: 200 } },
        { label: "m5/tag/getList", url: `${VNET_API}/m5/tag/getList`, body: { boxId: BOX_ID_LA, pageNum: 1, pageSize: 200 } },
        { label: "m5/tagGroup/getList", url: `${VNET_API}/m5/tagGroup/getList`, body: { boxId: BOX_ID_LA } },
        { label: "m5/tagGroup/list", url: `${VNET_API}/m5/tagGroup/list`, body: { boxId: BOX_ID_LA } },
        { label: "m1/tag/getRealTimeData", url: `${VNET_API}/m1/tag/getRealTimeData`, body: { boxId: BOX_ID_LA } },
        { label: "m1/data/getRealTimeData", url: `${VNET_API}/m1/data/getRealTimeData`, body: { boxId: BOX_ID_LA } },
        { label: "m1/realTimeData/list", url: `${VNET_API}/m1/realTimeData/list`, body: { boxId: BOX_ID_LA } },
        { label: "m1/realTimeData/getList", url: `${VNET_API}/m1/realTimeData/getList`, body: { boxId: BOX_ID_LA, pageNum: 1, pageSize: 200 } },
    ];

    for (const ep of tagEndpoints) {
        const r = await callAPI(ep.label, ep.url, ep.body);
        if (r) {
            const items = r.list || r.tagList || r.tags || r;
            if (Array.isArray(items)) {
                console.log(`  ✅ Got ${items.length} items!`);
                items.slice(0, 5).forEach(t => {
                    console.log(`    ${JSON.stringify(t).substring(0, 200)}`);
                });
            } else {
                console.log("  ✅ Result:", JSON.stringify(r).substring(0, 500));
            }
        }
    }

    // 4. Try GET endpoints (instead of POST)
    console.log("\n========== GET ENDPOINTS ==========");
    const wcommon = buildWcommon(SID, CUID);
    const getUrls = [
        `${VNET_API}/m5/device/getList?boxId=${BOX_ID_LA}`,
        `${VNET_API}/m1/device/getRealTimeData?boxId=${BOX_ID_LA}`,
        `${VNET_API}/m5/tag/getList?boxId=${BOX_ID_LA}&pageNum=1&pageSize=50`,
    ];
    
    for (const url of getUrls) {
        try {
            console.log(`\nGET ${url}`);
            const res = await fetch(url, {
                method: "GET",
                headers: { wcommon },
            });
            const json = await res.json();
            console.log(`  code: ${json.code}, msg: ${json.msg}`);
            if (json.code === 200 && json.result) {
                console.log("  ✅ Result:", JSON.stringify(json.result).substring(0, 500));
            }
        } catch (err) {
            console.log(`  Error: ${err.message}`);
        }
    }
}

main();
