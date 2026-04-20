const crypto = require('crypto');
const WebSocket = require('ws');

const SECRET_KEY = '5cee621329f24e5cbdc43daa959ce9a1';
const ACCOUNT_ID = '123456789';
const SID = '8c4d288ebcb342ad9f5abba1d16d45fa';
const DOMAIN = 'web.asean.v-iec.com';
const REMOTE_HOST = 'remote.asean.v-iec.com';

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

async function testWs(url) {
    return new Promise((resolve) => {
        const wcommon = JSON.stringify(buildWcommon({}));
        console.log(`\nTesting: ${url}`);
        const ws = new WebSocket(url, {
            headers: { wcommon, 'Origin': 'https://web.asean.v-iec.com' },
            handshakeTimeout: 6000,
            rejectUnauthorized: false,
        });
        const timer = setTimeout(() => { ws.terminate(); console.log('  ⏱️ Timeout'); resolve('timeout'); }, 8000);

        ws.on('open', () => {
            clearTimeout(timer);
            console.log(`  ✅ CONNECTED!`);
            setTimeout(() => { ws.close(); resolve('connected'); }, 4000);
        });
        ws.on('message', (d) => { console.log(`  📨 MSG (${d.length}b): ${d.toString().substring(0, 400)}`); });
        ws.on('error', (e) => { clearTimeout(timer); console.log(`  ❌ ${e.message}`); resolve('error'); });
        ws.on('close', (code, reason) => { clearTimeout(timer); console.log(`  🔴 Closed: ${code} ${reason}`); resolve('closed:' + code); });
    });
}

async function main() {
    console.log('=== V-NET WebSocket Deep Test ===');

    const urls = [
        `wss://${REMOTE_HOST}:8081/focusmonitorweb-websocket/websocket`,
        `ws://${REMOTE_HOST}:8081/focusmonitorweb-websocket/websocket`,
        `wss://${REMOTE_HOST}:8081/focusmonitorweb-websocket/websocket?sid=${SID}`,
        `wss://${REMOTE_HOST}/focusmonitorweb-websocket/websocket`,
        `wss://iiot.asean.v-iec.com/focusmonitorweb-websocket/websocket`,
        `wss://iiot.asean.v-iec.com:8081/focusmonitorweb-websocket/websocket`,
    ];

    for (const url of urls) {
        await testWs(url);
        await new Promise(r => setTimeout(r, 300));
    }
}

main().catch(console.error);
