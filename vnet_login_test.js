const crypto = require('crypto');
const zlib = require('zlib');

const SECRET_KEY = '5cee621329f24e5cbdc43daa959ce9a1';
const DOMAIN = 'web.asean.v-iec.com';
const API_BASE = 'https://api.asean.v-iec.com';
const PROJECT_ID = 10001417;

// Anonymous wcommon for login (before we have SID)
function buildWcommonAnon(params = {}) {
    const wc = {
        cuid: '123456789', pid: '1', sv: '1.0', ts: Date.now(),
        mt: 255, lan: 'zh', dap: '', sid: '', sign: '', domain: DOMAIN
    };
    const keys = [...new Set([...Object.keys(params), ...Object.keys(wc)])].sort();
    let qs = '';
    for (const k of keys) {
        const pv = params[k]; if (pv != null && pv !== '' && pv !== undefined) qs += `${k}=${pv}&`;
        const wv = wc[k]; if (wv != null && wv !== '' && wv !== undefined) qs += `${k}=${wv}&`;
    }
    qs += `key=${SECRET_KEY}`;
    wc.sign = crypto.createHash('md5').update(qs).digest('hex');
    return wc;
}

function buildWcommon(params = {}, sid, cuid = '123456789') {
    const wc = {
        cuid, pid: '1', sv: '1.0', ts: Date.now(),
        mt: 255, lan: 'zh', dap: '', sid, sign: '', domain: DOMAIN
    };
    const keys = [...new Set([...Object.keys(params), ...Object.keys(wc)])].sort();
    let qs = '';
    for (const k of keys) {
        const pv = params[k]; if (pv != null && pv !== '' && pv !== undefined) qs += `${k}=${pv}&`;
        const wv = wc[k]; if (wv != null && wv !== '' && wv !== undefined) qs += `${k}=${wv}&`;
    }
    qs += `key=${SECRET_KEY}`;
    wc.sign = crypto.createHash('md5').update(qs).digest('hex');
    return wc;
}

async function post(path, body, wcommon) {
    const formBody = Object.entries(body).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const res = await fetch(`${API_BASE}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', wcommon: JSON.stringify(wcommon) },
        body: formBody,
        signal: AbortSignal.timeout(8000),
    });
    return res.json();
}

async function main() {
    const username = 'Intersnack_Phuong';
    const password = 'Longan8';

    // Try multiple login endpoints
    const loginPaths = [
        'm4/sign/login',
        'm4/user/login',
        'm4/auth/login',
        'm9/sign/login',
        'admin/sign/login',
        'm4/sign/loginByUsername',
    ];

    let sid = null, accountId = null;

    for (const path of loginPaths) {
        console.log(`Trying login: ${path}`);
        const wc = buildWcommonAnon({ username, password });
        const r = await post(path, { username, password }, wc);
        if (r.code === 200) {
            console.log('✅ LOGIN OK!', JSON.stringify(r.result).substring(0, 400));
            sid = r.result?.sid || r.result?.token || r.result?.accessToken;
            accountId = r.result?.accountId || r.result?.id;
            break;
        } else if (r.code !== 405) {
            console.log(`  ⚠️ code:${r.code} msg:${r.msg}`);
        }
        await new Promise(r => setTimeout(r, 200));
    }

    if (!sid) {
        console.log('\n❌ Could not login via API. Trying browser-based SID capture...');
        // Fallback: use the SID visible in browser (monitor page)
        return;
    }

    console.log('\n✅ Got SID:', sid, '| accountId:', accountId);

    // Now probe history endpoints with real SID
    const now = Date.now();
    const ago5m = now - 5 * 60 * 1000;

    const testEndpoints = [
        ['m9/ztProjectVariable/getHistoryData', { cfgId: 10713915, startTime: ago5m, endTime: now, limit: 5 }],
        ['m9/ztTagData/getLastValue', { cfgId: 10713915 }],
        ['m9/ztTagData/getBatchLastValue', { cfgIds: '10713915,10713917,10713925' }],
        ['m3/device/getRealTimeData', { plcId: 10023625 }],
        ['m4/device/getRealTimeData', { plcId: 10023625 }],
    ];

    console.log('\n=== Probing with authenticated SID ===');
    for (const [path, body] of testEndpoints) {
        const wc = buildWcommon(body, sid, String(accountId));
        const r = await post(path, body, wc);
        if (r.code === 200) {
            console.log(`✅ ${path} → ${JSON.stringify(r.result).substring(0, 300)}`);
        } else if (r.code !== 405) {
            console.log(`⚠️  ${path} → ${r.code} ${r.msg}`);
        }
    }
}

main().catch(console.error);
