/**
 * Test V-NET API to fetch BORMA oven data from Intersnack_LA device
 * 
 * Device: Intersnack_LA (V-BOX H-WF)
 * Product code: XT30421000600002510160W0022070
 * Machine code: V14000251016022f4f8dec5b95d
 * 
 * Tags pattern per BORMA (1-6):
 *   BM{n}_TEMP_CTR  - Temperature controller (Word, MD 74)
 *   BM{n}_PID       - PID status (Bit, M 2.6)
 *   BM{n}_LV1       - Level valve 1 (Bit, DBxDB 40010.0)
 *   BM{n}_SV1       - Solenoid valve 1 (Bit, Q 0.3)
 *   BM{n}_LV1_VL    - Level valve 1 value (Word, MD 50)
 *   ...plus more tags per group (32 total per BORMA)
 */

const crypto = require('crypto');

const VNET_API = "https://asean.v-iec.com/api";
const USERNAME = "Intersnack_Vu";
const PASSWORD = "Longan11";

function buildWcommon(sid = "", cuid = "") {
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

async function login() {
    const passwordMd5 = crypto.createHash("md5").update(PASSWORD).digest("hex");
    const wcommon = buildWcommon();

    console.log("=== LOGIN ===");
    console.log("Password MD5:", passwordMd5);
    
    const res = await fetch(`${VNET_API}/m4/sign/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", wcommon },
        body: JSON.stringify({ account: USERNAME, password: passwordMd5 }),
    });
    const json = await res.json();
    console.log("Login response code:", json.code, "msg:", json.msg);
    
    if (json.code !== 200 || !json.result?.sid) {
        console.error("Login failed!", JSON.stringify(json, null, 2));
        throw new Error(`Login failed: ${json.msg}`);
    }

    const sid = json.result.sid;
    const cuid = String(json.result.cuid || json.result.userId || json.result.accountId || "");
    console.log("SID:", sid);
    console.log("CUID:", cuid);
    return { sid, cuid };
}

async function getDeviceList(sid, cuid) {
    console.log("\n=== GET DEVICE LIST ===");
    const wcommon = buildWcommon(sid, cuid);
    const res = await fetch(`${VNET_API}/m5/device/getList`, {
        method: "POST",
        headers: { "Content-Type": "application/json", wcommon },
        body: JSON.stringify({}),
    });
    const json = await res.json();
    console.log("Device list response code:", json.code);
    
    if (json.result) {
        const devices = json.result.list || json.result || [];
        if (Array.isArray(devices)) {
            devices.forEach(d => {
                console.log(`  Device: ${d.boxName || d.name} | boxId: ${d.boxId} | online: ${d.online}`);
            });
        }
    }
    return json;
}

async function getRealTimeData(sid, cuid, boxId) {
    console.log(`\n=== GET REAL TIME DATA (boxId: ${boxId}) ===`);
    const wcommon = buildWcommon(sid, cuid);
    
    // Try different API endpoints that V-NET might use
    const endpoints = [
        { url: `${VNET_API}/m1/device/getRealTimeData`, body: { boxId } },
        { url: `${VNET_API}/m5/device/getRealTimeData`, body: { boxId } },
        { url: `${VNET_API}/m1/tag/getRealTimeData`, body: { boxId } },
        { url: `${VNET_API}/m5/tag/list`, body: { boxId, pageNum: 1, pageSize: 200 } },
        { url: `${VNET_API}/m5/tag/getList`, body: { boxId, pageNum: 1, pageSize: 200 } },
        { url: `${VNET_API}/m5/data/getRealTimeData`, body: { boxId } },
    ];

    for (const ep of endpoints) {
        try {
            console.log(`\nTrying: ${ep.url}`);
            const res = await fetch(ep.url, {
                method: "POST",
                headers: { "Content-Type": "application/json", wcommon },
                body: JSON.stringify(ep.body),
            });
            const json = await res.json();
            console.log(`  Response code: ${json.code}, msg: ${json.msg}`);
            
            if (json.code === 200) {
                const result = json.result;
                if (result) {
                    // Check different possible structures
                    const items = result.list || result.tagList || result.tags || result.data || result;
                    if (Array.isArray(items) && items.length > 0) {
                        console.log(`  ✅ SUCCESS! Found ${items.length} items`);
                        console.log(`  First 5 items:`, JSON.stringify(items.slice(0, 5), null, 2));
                        return { endpoint: ep.url, data: json };
                    } else if (typeof result === 'object') {
                        console.log(`  Result keys:`, Object.keys(result));
                        console.log(`  Result sample:`, JSON.stringify(result).substring(0, 500));
                    }
                }
            }
        } catch (err) {
            console.log(`  Error: ${err.message}`);
        }
    }
    return null;
}

async function getTagsByGroup(sid, cuid, boxId, groupName) {
    console.log(`\n=== GET TAGS BY GROUP: ${groupName} ===`);
    const wcommon = buildWcommon(sid, cuid);
    
    // Try fetching tags with group filter
    const endpoints = [
        { url: `${VNET_API}/m5/tag/getList`, body: { boxId, groupName, pageNum: 1, pageSize: 100 } },
        { url: `${VNET_API}/m5/tag/list`, body: { boxId, groupName, pageNum: 1, pageSize: 100 } },
        { url: `${VNET_API}/m5/tagGroup/getTagList`, body: { boxId, groupName, pageNum: 1, pageSize: 100 } },
    ];

    for (const ep of endpoints) {
        try {
            const res = await fetch(ep.url, {
                method: "POST",
                headers: { "Content-Type": "application/json", wcommon },
                body: JSON.stringify(ep.body),
            });
            const json = await res.json();
            if (json.code === 200 && json.result) {
                const items = json.result.list || json.result.tagList || json.result;
                if (Array.isArray(items) && items.length > 0) {
                    console.log(`  ✅ ${ep.url} returned ${items.length} tags`);
                    items.forEach(t => {
                        const name = t.name || t.tagName || '?';
                        const val = t.value ?? t.val ?? t.numerical ?? '?';
                        console.log(`    ${name} = ${val}`);
                    });
                    return items;
                }
            }
        } catch (err) {
            console.log(`  Error: ${err.message}`);
        }
    }
    return null;
}

async function main() {
    try {
        const { sid, cuid } = await login();
        
        // Step 1: Get device list to find box IDs
        const deviceResult = await getDeviceList(sid, cuid);
        
        // Step 2: Try to get real-time data for Intersnack_LA
        // From screenshots: Intersnack_LA product code starts with XT304210006...
        // We need the boxId. Let's try multiple approaches.
        
        // First, extract boxIds from device list
        const devices = deviceResult?.result?.list || deviceResult?.result || [];
        let intersnackLA_boxId = null;
        
        if (Array.isArray(devices)) {
            for (const d of devices) {
                const name = d.boxName || d.name || '';
                if (name.includes('Intersnack_LA') && !name.includes('LA1')) {
                    intersnackLA_boxId = d.boxId;
                    console.log(`\nFound Intersnack_LA boxId: ${intersnackLA_boxId}`);
                }
            }
        }

        // Try known boxIds
        const boxIds = [intersnackLA_boxId, 10009531, 6417916].filter(Boolean);
        
        for (const boxId of boxIds) {
            const result = await getRealTimeData(sid, cuid, boxId);
            if (result) {
                console.log(`\n🎉 Working endpoint found for boxId ${boxId}!`);
                console.log(`Endpoint: ${result.endpoint}`);
                break;
            }
        }

        // Step 3: Try to get tags by BORMA group
        if (intersnackLA_boxId) {
            for (const group of ["Borma 1", "Borma 2", "Borma 3", "Borma 4", "Borma 5", "Borma 6"]) {
                await getTagsByGroup(sid, cuid, intersnackLA_boxId, group);
            }
        }

    } catch (err) {
        console.error("Fatal error:", err.message);
    }
}

main();
