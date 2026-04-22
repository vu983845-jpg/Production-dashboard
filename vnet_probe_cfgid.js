const crypto = require('crypto');
const zlib = require('zlib');

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

async function callApi(path, body = {}) {
    const wcommon = buildWcommon(body);
    const formBody = Object.entries(body).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
    const res = await fetch(`${API_BASE}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'wcommon': JSON.stringify(wcommon) },
        body: formBody,
        signal: AbortSignal.timeout(6000),
    });
    return res.json();
}

async function main() {
    // Get project and extract cfgIds
    const proj = await callApi('m9/ztProjectAction/getProject', { ztProjectId: PROJECT_ID, appVersion: '2.1.0' });
    const raw = Buffer.from(proj.result.ztProject.projectInfo, 'base64');
    const data = JSON.parse(zlib.gunzipSync(raw).toString('utf8'));

    // Extract sample cfgIds for key sensors
    const seen = new Map();
    function extract(elements) {
        for (const el of elements || []) {
            const db = el.dataBind;
            if (db && db.plc_id && db.cfg_name && db.cfg_id) {
                if (!seen.has(db.cfg_name)) seen.set(db.cfg_name, { tagName: db.cfg_name, plcId: db.plc_id, cfgId: db.cfg_id });
            }
            if (Array.isArray(el.children)) extract(el.children);
        }
    }
    for (const page of data.page) extract(page.element);

    const tags = [...seen.values()];
    const priority = ['TI4101-1', 'TI4102-1', 'TI4103-1', 'BM1_T1', 'BM1_HUMI', 'HI4101-1', 'BM1_RUN'];
    const sample = priority.map(t => seen.get(t)).filter(Boolean).slice(0, 5);
    if (sample.length === 0) sample.push(...tags.slice(0, 5));

    console.log('Sample tags to test:');
    for (const t of sample) console.log(' ', t.tagName, '→ cfgId:', t.cfgId, 'plcId:', t.plcId);

    const now = Date.now();
    const ago5m = now - 5 * 60 * 1000;
    const ago1h = now - 60 * 60 * 1000;

    const { cfgId, plcId, tagName } = sample[0];
    const cfgIds = sample.map(s => s.cfgId).join(',');
    const plcIds = [...new Set(sample.map(s => s.plcId))].join(',');

    console.log('\n=== Probing history endpoints with cfgId=' + cfgId + ' ===');

    const endpoints = [
        // m9 project-scoped history
        ['m9/ztProjectVariable/getHistoryData', { cfgId, startTime: ago5m, endTime: now, limit: 5 }],
        ['m9/ztProjectVariable/getHistoryDataValue', { cfgId, startTime: ago5m, endTime: now }],
        ['m9/ztTagData/getHistoryData', { cfgId, startTime: ago5m, endTime: now, limit: 5 }],
        ['m9/ztTagData/getLastValue', { cfgId }],
        ['m9/ztTagData/getLatestValue', { cfgId }],
        ['m9/ztTagData/getCurrentValue', { cfgId }],
        // m9 batch
        ['m9/ztProjectVariable/getBatchLastValue', { cfgIds }],
        ['m9/ztTagData/getBatchLastValue', { cfgIds }],
        ['m9/ztTagData/getBatchCurrentValue', { cfgIds }],
        // With plcId
        ['m9/ztProjectVariable/getHistoryData', { plcId, tagName, startTime: ago5m, endTime: now, limit: 5 }],
        ['m9/ztTagData/getHistoryByTag', { plcId, tagName, startTime: ago5m, endTime: now }],
        // m3/m4/m5 history (already found these 405 but try with cfgId)
        ['m3/historyData/getByTag', { cfgId, startTime: ago5m, endTime: now }],
        ['m4/historyData/getByTag', { cfgId, startTime: ago5m, endTime: now }],
        ['m1/historyData/getByTag', { cfgId }],
    ];

    for (const [path, body] of endpoints) {
        try {
            const r = await callApi(path, body);
            if (r.code === 200) {
                console.log(`✅ ${path}`);
                console.log('   Result:', JSON.stringify(r.result).substring(0, 400));
            } else if (r.code !== 405) {
                console.log(`⚠️  ${path} → ${r.code} ${r.msg}`);
            }
        } catch (e) {
            console.log(`❌ ${path} → ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 100));
    }
    console.log('\nDone.');
}

main().catch(console.error);
