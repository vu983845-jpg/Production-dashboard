const crypto = require('crypto');

const SECRET_KEY = '5cee621329f24e5cbdc43daa959ce9a1';
const ACCOUNT_ID = '123456789';
const SID = '8c4d288ebcb342ad9f5abba1d16d45fa';
const DOMAIN = 'web.asean.v-iec.com';
const API_BASE = 'https://api.asean.v-iec.com';
const PROJECT_ID = 10001417;

function buildWcommon(params = {}) {
    const wc = {
        cuid: ACCOUNT_ID, pid: '1', sv: '1.0', ts: Date.now(),
        mt: 255, lan: 'zh', dap: '', sid: SID, sign: '', domain: DOMAIN
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

async function tryPath(path, body = {}) {
    const wcommon = buildWcommon(body);
    const formBody = Object.entries(body).map(([k, v]) => `${k}=${v}`).join('&');
    try {
        const r = await fetch(`${API_BASE}/${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'wcommon': JSON.stringify(wcommon) },
            body: formBody,
            signal: AbortSignal.timeout(5000),
        });
        const j = await r.json();
        return j;
    } catch (e) { return { error: e.message }; }
}

async function main() {
    const now = Date.now();
    const fiveMinAgo = now - 5 * 60 * 1000;

    // Try history endpoints for recent data (last 5 min = essentially "current")
    const tests = [
        // m9 project-based history
        ['m9/ztProjectVariable/getHistoryData', {
            ztProjectId: PROJECT_ID, plcId: 10023625,
            startTime: fiveMinAgo, endTime: now, limit: 5
        }],
        ['m9/ztProjectVariable/getCurrentValue', { ztProjectId: PROJECT_ID }],
        ['m9/ztProjectVariable/getLatestValue', { ztProjectId: PROJECT_ID }],
        ['m9/ztTagData/getLastValue', { ztProjectId: PROJECT_ID }],
        ['m9/ztTagData/getLatestValue', { ztProjectId: PROJECT_ID }],
        ['m9/ztProjectAction/getCurrentData', { ztProjectId: PROJECT_ID }],
        ['m9/ztProjectAction/getTagLastValue', { ztProjectId: PROJECT_ID }],
        // m1 tag data
        ['m1/tagData/getLastValue', { plcId: 10023625 }],
        ['m1/tagData/getLatestValue', { plcId: 10023625 }],
        ['m1/tagRecord/getLastRecord', { plcId: 10023625 }],
        // Try with different module (the project is on MODULE 6/m6?)
        ['m6/device/getRealTimeData', { plcId: 10023625 }],
        ['m6/tagData/getLastValue', { plcId: 10023625 }],
        ['m6/ztProjectAction/getProject', { ztProjectId: PROJECT_ID, appVersion: '2.1.0' }],
    ];

    for (const [path, body] of tests) {
        const r = await tryPath(path, body);
        const ok = r.code === 200;
        if (ok) {
            console.log(`✅ ${path} -> ${r.code} | ${JSON.stringify(r.result).substring(0, 300)}`);
        } else if (r.code !== 405) {
            console.log(`⚠️  ${path} -> code:${r.code} ${r.msg || r.error || ''}`);
        }
        // 405 = skip silently
    }
    console.log('Done');
}

main().catch(console.error);
