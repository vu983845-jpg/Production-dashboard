/**
 * Debug V-NET login - try different password encoding methods
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
        cuid: cuid || "",
        pid: "1",
        sv: "1.0",
        ts,
        mt: 255,
        lan: "en",
        sid: sid || "",
        sign,
        domain: "asean.v-iec.com",
    });
}

async function tryLogin(account, password, label) {
    console.log(`\n--- ${label} ---`);
    console.log(`  account: "${account}", password: "${password}"`);
    
    const wcommon = buildWcommon();
    
    try {
        const res = await fetch(`${VNET_API}/m4/sign/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json", wcommon },
            body: JSON.stringify({ account, password }),
        });
        const json = await res.json();
        console.log(`  Response: code=${json.code}, msg=${json.msg}`);
        if (json.code === 200) {
            console.log(`  ✅ SUCCESS! sid=${json.result?.sid}, cuid=${json.result?.cuid}`);
            return json;
        }
        if (json.result && Object.keys(json.result).length > 0) {
            console.log(`  Result:`, JSON.stringify(json.result));
        }
    } catch (err) {
        console.log(`  Error: ${err.message}`);
    }
    return null;
}

async function main() {
    const md5 = crypto.createHash("md5").update(PASSWORD).digest("hex");
    const md5Upper = md5.toUpperCase();
    const sha256 = crypto.createHash("sha256").update(PASSWORD).digest("hex");
    
    console.log("Password variants:");
    console.log(`  Plain: ${PASSWORD}`);
    console.log(`  MD5: ${md5}`);
    console.log(`  MD5 Upper: ${md5Upper}`);
    
    // Try 1: plain password
    let r = await tryLogin(USERNAME, PASSWORD, "Plain password");
    if (r) return r;
    
    // Try 2: MD5 lowercase
    r = await tryLogin(USERNAME, md5, "MD5 lowercase");
    if (r) return r;
    
    // Try 3: MD5 uppercase
    r = await tryLogin(USERNAME, md5Upper, "MD5 uppercase");
    if (r) return r;
    
    // Try 4: SHA256
    r = await tryLogin(USERNAME, sha256, "SHA256");
    if (r) return r;

    // Try 5: different username formats
    r = await tryLogin("Intersnack_Vu", md5, "Username exact + MD5");
    if (r) return r;
    
    r = await tryLogin("intersnack_vu", md5, "Username lowercase + MD5");
    if (r) return r;
    
    // Try 6: Maybe the API uses a different login endpoint
    console.log("\n--- Try alternate login endpoints ---");
    const wcommon = buildWcommon();
    const altEndpoints = [
        `${VNET_API}/m4/user/login`,
        `${VNET_API}/m4/account/login`,
        `${VNET_API}/user/login`,
        `${VNET_API}/sign/login`,
    ];
    
    for (const url of altEndpoints) {
        try {
            console.log(`\nTrying: ${url}`);
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", wcommon },
                body: JSON.stringify({ account: USERNAME, password: md5 }),
            });
            const json = await res.json();
            console.log(`  Response: code=${json.code}, msg=${json.msg}`);
            if (json.code === 200) {
                console.log(`  ✅ SUCCESS!`, JSON.stringify(json.result));
            }
        } catch (err) {
            console.log(`  Error: ${err.message}`);
        }
    }

    // Try 7: Maybe wcommon needs different format or the login body needs extra fields
    console.log("\n--- Try with extra body fields ---");
    const wc = buildWcommon();
    const bodies = [
        { account: USERNAME, password: md5, type: 0 },
        { account: USERNAME, password: md5, loginType: 1 },
        { userName: USERNAME, password: md5 },
        { username: USERNAME, password: md5 },
        { account: USERNAME, pwd: md5 },
    ];
    
    for (const body of bodies) {
        try {
            console.log(`\nBody:`, JSON.stringify(body));
            const res = await fetch(`${VNET_API}/m4/sign/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json", wcommon: wc },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            console.log(`  Response: code=${json.code}, msg=${json.msg}`);
            if (json.code === 200) {
                console.log(`  ✅ SUCCESS!`, JSON.stringify(json.result));
                return json;
            }
        } catch (err) {
            console.log(`  Error: ${err.message}`);
        }
    }

    console.log("\n❌ All login attempts failed");
}

main();
