/**
 * Test V-NET API with extracted session token
 * SID: b587a89300124115a777d6137e095372
 * Box ID: 10009531 (Intersnack_LA)
 * SCADA Project: BORMA LONG AN (projectId: 10001417)
 */
const crypto = require('crypto');

const VNET_API = "https://asean.v-iec.com/api";
const WEB_API = "https://web.asean.v-iec.com";
const SID = "b587a89300124115a777d6137e095372";
const CUID = ""; // unknown yet, try different values
const BOX_ID = 10009531;

function buildWcommon(sid, cuid = "") {
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

async function tryAPI(label, url, body, sid, cuid = "") {
    console.log(`\n--- ${label} ---`);
    const wcommon = buildWcommon(sid, cuid);
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", wcommon },
            body: JSON.stringify(body),
        });
        const json = await res.json();
        console.log(`  code: ${json.code}, msg: ${json.msg}`);
        if (json.code === 200 && json.result) {
            const r = json.result;
            if (Array.isArray(r.list || r)) {
                const items = r.list || r;
                console.log(`  ✅ Got ${items.length} items`);
                items.slice(0, 10).forEach(item => {
                    const name = item.boxName || item.name || item.tagName || JSON.stringify(item).substring(0, 80);
                    const val = item.value ?? item.val ?? item.boxId ?? '';
                    console.log(`    ${name} = ${val}`);
                });
                return items;
            } else {
                console.log(`  Result keys: ${Object.keys(r).join(', ')}`);
                console.log(`  Result: ${JSON.stringify(r).substring(0, 500)}`);
                return r;
            }
        }
        return null;
    } catch (err) {
        console.log(`  Error: ${err.message}`);
        return null;
    }
}

async function main() {
    // First try with empty cuid
    console.log("========== Testing with empty CUID ==========");
    
    // 1. Get device list
    let devices = await tryAPI("Device List", `${VNET_API}/m5/device/getList`, {}, SID);
    
    // 2. If that worked, also try getting tag list
    if (devices) {
        // Extract cuid from user info if available
        await tryAPI("User Info", `${VNET_API}/m4/user/getInfo`, {}, SID);
    }

    // 3. Try different tag endpoints
    const tagEndpoints = [
        { label: "m5/tag/getList (boxId)", url: `${VNET_API}/m5/tag/getList`, body: { boxId: BOX_ID, pageNum: 1, pageSize: 50 } },
        { label: "m5/tag/getRealTimeData", url: `${VNET_API}/m5/tag/getRealTimeData`, body: { boxId: BOX_ID } },
        { label: "m1/device/getRealTimeData", url: `${VNET_API}/m1/device/getRealTimeData`, body: { boxId: BOX_ID } },
        { label: "m5/data/getRealTimeData", url: `${VNET_API}/m5/data/getRealTimeData`, body: { boxId: BOX_ID } },
        { label: "m5/device/getTagList", url: `${VNET_API}/m5/device/getTagList`, body: { boxId: BOX_ID, pageNum: 1, pageSize: 200 } },
        { label: "m5/device/getDetail", url: `${VNET_API}/m5/device/getDetail`, body: { boxId: BOX_ID } },
    ];

    for (const ep of tagEndpoints) {
        await tryAPI(ep.label, ep.url, ep.body, SID);
    }

    // 4. Try the web API (web.asean.v-iec.com)
    console.log("\n\n========== Testing WEB API ==========");
    const webEndpoints = [
        { label: "web/browse data", url: `${WEB_API}/api/project/browse`, body: { projectId: 10001417 } },
        { label: "web/project info", url: `${WEB_API}/api/project/getInfo`, body: { projectId: 10001417 } },
        { label: "web/getRealTimeData", url: `${WEB_API}/api/data/getRealTimeData`, body: { projectId: 10001417 } },
    ];

    for (const ep of webEndpoints) {
        try {
            console.log(`\n--- ${ep.label} ---`);
            const res = await fetch(ep.url, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Cookie": `sid=${SID}`,
                },
                body: JSON.stringify(ep.body),
            });
            const text = await res.text();
            console.log(`  Status: ${res.status}`);
            console.log(`  Response: ${text.substring(0, 500)}`);
        } catch (err) {
            console.log(`  Error: ${err.message}`);
        }
    }

    // 5. Try fetching the SCADA browse page directly
    console.log("\n\n========== Fetching SCADA Browse Page ==========");
    try {
        const res = await fetch(`${WEB_API}/browse?projectId=10001417&queryId=${SID}`, {
            headers: { "Cookie": `sid=${SID}` },
        });
        const html = await res.text();
        console.log(`Status: ${res.status}`);
        // Look for script tags with data or WebSocket URLs
        const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
        if (scriptMatch) {
            scriptMatch.forEach((s, i) => {
                if (s.includes('websocket') || s.includes('wss://') || s.includes('ws://') || 
                    s.includes('api') || s.includes('getRealTime') || s.includes('boxId') ||
                    s.includes('tagName') || s.includes('BM') || s.includes('TI41')) {
                    console.log(`\nRelevant script ${i}:`);
                    console.log(s.substring(0, 1000));
                }
            });
        }
        // Look for WebSocket URLs
        const wsMatch = html.match(/wss?:\/\/[^\s"']+/g);
        if (wsMatch) {
            console.log("\nWebSocket URLs found:", wsMatch);
        }
        // Look for API URLs
        const apiMatch = html.match(/https?:\/\/[^\s"']*api[^\s"']*/g);
        if (apiMatch) {
            console.log("\nAPI URLs found:", [...new Set(apiMatch)]);
        }
    } catch (err) {
        console.log(`Error: ${err.message}`);
    }
}

main();
