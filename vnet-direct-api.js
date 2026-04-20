/**
 * vnet-direct-api.js
 * ===================
 * V-NET SCADA Direct API Module
 * 
 * ✅ Sign algorithm reverse-engineered from app.ef2b889d.js (module 532990)
 *    - SECRET_KEY: hardcoded in JS bundle module 622305
 *    - Algorithm: MD5( sorted(params ∪ wcommon) + "&key=SECRET_KEY" )
 * 
 * ✅ Validated endpoints (200 OK):
 *    - m9/ztProjectAction/getProject        → project schema + tag bindings
 *    - m4/role/getCurrentRole               → user role + auth info  
 *    - m4/frontTemplate/getConfig           → UI template config
 * 
 * ❌ Real-time sensor values: NOT available via HTTP REST.
 *    Data streams via WebSocket (ws://DEVICE:8081/focusmonitorweb-websocket/websocket)
 *    Port 8081 is firewalled externally → use Puppeteer fetcher for live values.
 * 
 * Usage:
 *   const { getProject, buildWcommon } = require('./vnet-direct-api');
 *   const project = await getProject();
 *   // project.ztProject.projectInfo → gzip+base64 project schema
 */

const crypto = require('crypto');
const zlib = require('zlib');

// ============================================================
// CREDENTIALS — extracted via browser reverse-engineering
// ============================================================
const SECRET_KEY = '5cee621329f24e5cbdc43daa959ce9a1'; // module 622305 (v.s)
const ACCOUNT_ID = '123456789';                          // public viewer cuid
const SID = '8c4d288ebcb342ad9f5abba1d16d45fa'; // localStorage ACCESS_SID
const DOMAIN = 'web.asean.v-iec.com';

const API_BASE = 'https://api.asean.v-iec.com';
const PROJECT_ID = 10001417;

// Device PLCIDs found in projectInfo (14 devices total)
const DEVICE_IDS = {
    BORMA1: 10023625,
    BORMA2: 10023627,
    BORMA3: 10023635,
    BORMA4: 10023629,
    BORMA5: 10023631,
    BORMA6: 10023637,
    BORMA7: 10023633,
    STEAM1: 10011501,
    STEAM2: 10024237,
};

// Tag names confirmed in projectInfo
const TAG_NAMES = {
    // BORMA temperatures
    TI4101: 'TI4101-1', TI4102: 'TI4102-1', TI4103: 'TI4103-1',
    TI4104: 'TI4104-1', TI4105: 'TI4105-1', TI4106: 'TI4106-5',
    TI4107: 'TI4107-1',
    // BORMA zones (per machine: BM1..BM5)
    BM1_T1: 'BM1_T1', BM1_T2: 'BM1_T2', BM1_T3: 'BM1_T3',
    BM1_T4: 'BM1_T4', BM1_T5: 'BM1_T5', BM1_T6: 'BM1_T6',
    BM1_HUMI: 'BM1_HUMI', BM1_RUN: 'BM1_RUN',
    // BM5 zone
    BM5_TEMP1: 'BM5_TEMP1', BM5_TEMP2: 'BM5_TEMP2',
    // Humidity/pressure
    HI4101: 'HI4101-1',
};

// ============================================================
// SIGN BUILDER (ported from app.js module 532990, function R)
// ============================================================
function buildWcommon(params = {}) {
    const wc = {
        cuid: ACCOUNT_ID,
        pid: '1',
        sv: '1.0',
        ts: Date.now(),
        mt: 255,
        lan: 'zh',
        dap: '',
        sid: SID,
        sign: '',
        domain: DOMAIN,
    };

    // Collect ALL keys from both params and wcommon, then sort alphabetically
    const keys = [...new Set([...Object.keys(params), ...Object.keys(wc)])].sort();

    // Build query string: for each sorted key, append param value then wcommon value
    let qs = '';
    for (const k of keys) {
        const pv = params[k];
        if (pv != null && pv !== '' && pv !== undefined) qs += `${k}=${pv}&`;
        const wv = wc[k];
        if (wv != null && wv !== '' && wv !== undefined) qs += `${k}=${wv}&`;
    }
    qs += `key=${SECRET_KEY}`;

    // MD5 hash = sign
    wc.sign = crypto.createHash('md5').update(qs).digest('hex');
    return wc;
}

// ============================================================
// HTTP API CALLER
// ============================================================
async function callApi(path, body = {}) {
    const wcommon = buildWcommon(body);
    const formBody = Object.entries(body)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');

    const res = await fetch(`${API_BASE}/${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'wcommon': JSON.stringify(wcommon),
        },
        body: formBody,
    });
    return res.json();
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Fetch the full project configuration (schema, tag bindings, page layouts).
 * The projectInfo field is gzip+base64 encoded — use decodeProjectInfo() to parse it.
 */
async function getProject(appVersion = '2.1.0') {
    const res = await callApi('m9/ztProjectAction/getProject', {
        ztProjectId: PROJECT_ID,
        appVersion,
    });
    if (res.code !== 200) throw new Error(`getProject failed: ${res.code} ${res.msg}`);
    return res.result;
}

/**
 * Decode the gzip+base64 projectInfo from getProject.
 * Returns a parsed JSON object with:
 *   - page[]: Array of 16 pages with widget/element configs
 *   - Each element has plc_id, tagName, cfg_role (data binding)
 */
function decodeProjectInfo(ztProject) {
    const raw = Buffer.from(ztProject.projectInfo, 'base64');
    return JSON.parse(zlib.gunzipSync(raw).toString('utf8'));
}

/**
 * Get all tag-to-device bindings from the decoded project info.
 * Returns an array of { tagName, plcId, elementType, ... }
 */
function getTagBindings(projectData) {
    const seen = new Map();
    function extract(elements, pageName) {
        for (const el of elements || []) {
            const db = el.dataBind;
            if (db && db.plc_id && db.cfg_name) {
                const key = db.plc_id + ':' + db.cfg_name;
                if (!seen.has(key)) seen.set(key, { tagName: db.cfg_name, plcId: db.plc_id, cfgId: db.cfg_id, pageName });
            }
            if (Array.isArray(el.children)) extract(el.children, pageName);
            for (const item of (el.items || [])) {
                const db2 = item.dataBind;
                if (db2 && db2.plc_id && db2.cfg_name) {
                    const k2 = db2.plc_id + ':' + db2.cfg_name;
                    if (!seen.has(k2)) seen.set(k2, { tagName: db2.cfg_name, plcId: db2.plc_id, cfgId: db2.cfg_id, pageName });
                }
            }
        }
    }
    for (const page of projectData.page || []) {
        const name = (page.carousel && page.carousel.name) || page.name || 'unknown';
        extract(page.element, name);  // 'element' not 'elements'
    }
    return [...seen.values()];
}

/**
 * Get current user role and permissions.
 */
async function getCurrentRole() {
    const res = await callApi('m4/role/getCurrentRole', {});
    if (res.code !== 200) throw new Error(`getCurrentRole failed: ${res.code}`);
    return res.result;
}

module.exports = {
    buildWcommon,
    getProject,
    decodeProjectInfo,
    getTagBindings,
    getCurrentRole,
    DEVICE_IDS,
    TAG_NAMES,
    SECRET_KEY,
    SID,
};

// ============================================================
// CLI Test (run directly: node vnet-direct-api.js)
// ============================================================
if (require.main === module) {
    (async () => {
        console.log('=== V-NET Direct API Test ===\n');

        console.log('1. Fetching project...');
        const project = await getProject();
        console.log('✅ Project OK. userType:', project.userType);
        console.log('   authRole:', project.authRole);

        console.log('\n2. Decoding projectInfo...');
        const data = decodeProjectInfo(project.ztProject);
        console.log('✅ Decoded. Pages:', data.page.length);
        const bindings = getTagBindings(data);
        const unique = [...new Set(bindings.map(b => b.tagName))];
        console.log('   Unique tags found:', unique.length);
        console.log('   Sample tags:', unique.slice(0, 10));
        const plcIds = [...new Set(bindings.map(b => b.plcId))];
        console.log('   Unique device PLCIDs:', plcIds);

        console.log('\n3. Fetching role...');
        const role = await getCurrentRole();
        console.log('✅ Role:', role.auth?.name, '| accountId:', role.accountId);

        console.log('\n✅ Done! Real-time sensor values require WebSocket (port 8081).');
        console.log('   → Use vnet-data-fetcher.js (Puppeteer) for live sensor readings.');
    })().catch(console.error);
}
