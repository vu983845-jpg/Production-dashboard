const puppeteer = require('puppeteer');
const crypto = require('crypto');

const SECRET_KEY = '5cee621329f24e5cbdc43daa959ce9a1';
const DOMAIN = 'web.asean.v-iec.com';
const API_BASE = 'https://api.asean.v-iec.com';
const USERNAME = 'Intersnack_Phuong';
const PASSWORD = 'Longan8';

function buildWcommon(params, sid, cuid) {
    const wc = { cuid: cuid || '123456789', pid: '1', sv: '1.0', ts: Date.now(), mt: 255, lan: 'zh', dap: '', sid: sid || '', sign: '', domain: DOMAIN };
    const keys = [...new Set([...Object.keys(params), ...Object.keys(wc)])].sort();
    let qs = '';
    for (const k of keys) {
        const pv = params[k]; if (pv != null && pv !== '' && pv !== undefined) qs += k + '=' + pv + '&';
        const wv = wc[k]; if (wv != null && wv !== '' && wv !== undefined) qs += k + '=' + wv + '&';
    }
    qs += 'key=' + SECRET_KEY;
    wc.sign = crypto.createHash('md5').update(qs).digest('hex');
    return wc;
}

async function apiPost(path, body, sid, cuid, loginKey) {
    const wc = buildWcommon(body, sid, cuid);
    const fb = Object.entries(body).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded', wcommon: JSON.stringify(wc) };
    if (loginKey) headers.loginkey = loginKey;
    const res = await fetch(API_BASE + '/' + path, { method: 'POST', headers, body: fb, signal: AbortSignal.timeout(8000) });
    return res.json();
}

async function main() {
    console.log('Launching Puppeteer...');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    await page.goto('https://web.asean.v-iec.com/login', { waitUntil: 'networkidle2', timeout: 30000 });
    console.log('Login page loaded:', page.url());

    // Fill credentials
    await page.waitForSelector('input', { timeout: 10000 });
    await page.evaluate((u, p) => {
        const inputs = Array.from(document.querySelectorAll('input'));
        for (const inp of inputs) {
            if (inp.type === 'text' || inp.placeholder.toLowerCase().includes('user') || inp.name === 'username') {
                inp.value = u;
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                break;
            }
        }
        for (const inp of inputs) {
            if (inp.type === 'password') {
                inp.value = p;
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                break;
            }
        }
    }, USERNAME, PASSWORD);

    // Submit
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 5000));
    console.log('After login URL:', page.url());

    // Read localStorage
    const ls = await page.evaluate(() => {
        const r = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            r[k] = localStorage.getItem(k);
        }
        return r;
    });

    console.log('\n=== localStorage ===');
    for (const [k, v] of Object.entries(ls)) {
        console.log(k + ': ' + String(v).substring(0, 80));
    }

    const loginKey = ls['LOGINKEY'] || ls['loginKey'] || ls['loginkey'];
    const sid = ls['ACCESS_SID'] || ls['accessSid'] || ls['sid'];
    const cuid = ls['ACCOUNTID'] || '123456789';

    console.log('\n🔑 LOGINKEY:', loginKey);
    console.log('🔑 SID:', sid);
    console.log('🔑 CUID:', cuid);

    await browser.close();

    if (!loginKey || !sid) {
        console.log('\n❌ Could not get LOGINKEY or SID from localStorage');
        return;
    }

    // Now probe history endpoints with LOGINKEY
    const now = Date.now();
    const ago5m = now - 5 * 60 * 1000;
    const cfgId = 10713915; // BM1_T1

    console.log('\n=== Testing history endpoints with LOGINKEY ===');
    const tests = [
        ['m9/ztProjectVariable/getHistoryData', { cfgId, startTime: ago5m, endTime: now, limit: 5 }],
        ['m9/ztTagData/getLastValue', { cfgId }],
        ['m9/ztTagData/getBatchLastValue', { cfgIds: '10713915,10713917,10713925' }],
        ['m3/device/getRealTimeData', { plcId: 10023625 }],
        ['m4/device/getRealTimeData', { plcId: 10023625 }],
        ['m5/device/getRealTimeData', { plcId: 10023625 }],
        ['m1/device/getRealTimeData', { plcId: 10023625 }],
    ];
    for (const [path, body] of tests) {
        const r = await apiPost(path, body, sid, cuid, loginKey).catch(e => ({ error: e.message }));
        if (r.code === 200) {
            console.log('✅', path, '->', JSON.stringify(r.result).substring(0, 300));
        } else if (r.code !== 405) {
            console.log('⚠️ ', path, '-> code:', r.code, r.msg, r.error || '');
        }
    }
    console.log('\nDone.');
}

main().catch(console.error);
