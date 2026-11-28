// The adapter, against a real Express app on a real socket. The shared
// conformance corpus is asserted in conformance.test.mjs.
//
// A test server answers on the loopback, so `req.ip` is a bogon and is answered
// locally without a request. Anything that needs a served answer therefore has
// to arrive wearing a public address - through `trust proxy`, or a selector.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { after, test } from 'node:test';

import express from 'express';
import { InternetData } from '@internetdata/internetdata';

import {
    defaultIpSelector, headerIpSelector, internetdata, xffIpSelector,
} from '../dist/index.js';

const data = JSON.parse(readFileSync(new URL('../testdata/testdata.json', import.meta.url), 'utf8'));
// Served answers from the lookup corpus: Unlimited's, and a paid plan's.
const UNLIMITED = data.lookup.find((c) => c.name === 'unlimited-answer').body;
const PAID = data.lookup.find((c) => c.name === 'paid-full-shape').body;
const PUBLIC_IP = PAID.ip;
const servers = [];

after(() => {
    for (const s of servers) {
        s.close();
    }
});

// A client whose every answer is `body` for the address asked about, recording
// those addresses - which is what the client-address tests actually assert on.
function stubClient(body = PAID) {
    const asked = [];
    const client = new InternetData({
        cache: false,
        retries: 0,
        fetch: async (input) => {
            const url = new URL(typeof input === 'string' ? input : input.url);
            const ip = decodeURIComponent(url.pathname.slice(1));
            asked.push(ip);
            return new Response(JSON.stringify({ ...body, ip: ip }), {
                status: 200, headers: { 'content-type': 'application/json' },
            });
        },
    });
    return { client: client, asked: asked };
}

async function serve(configure) {
    const app = express();
    configure(app);
    app.get('/', (req, res) => {
        res.json({
            ip: req.internetdata?.ip ?? null,
            country: req.internetdata?.result?.location.country ?? null,
            isVpn: req.internetdata?.result?.isVpn ?? null,
            isBogon: req.internetdata?.result?.isBogon ?? null,
            error: req.internetdata?.error?.kind ?? null,
            attached: req.internetdata !== undefined,
        });
    });
    const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    servers.push(server);
    const base = `http://127.0.0.1:${server.address().port}`;
    return async (headers = {}) => {
        const res = await fetch(`${base}/`, { headers: headers });
        return { status: res.status, body: await res.json().catch(() => null) };
    };
}

// Most cases only care about the decision, not about where the address came
// from, so they pin the address and let the selectors be tested on their own.
const fixedIp = () => PUBLIC_IP;

test('enriches the request and leaves the decision to the app', async () => {
    const { client: client, asked: asked } = stubClient(UNLIMITED);
    const call = await serve((app) => app.use(internetdata({
        client: client, ipSelector: fixedIp,
    })));
    const res = await call();
    assert.equal(res.status, 200);
    assert.equal(res.body.attached, true);
    assert.equal(res.body.country, 'AT');
    assert.equal(res.body.isVpn, null, 'Unlimited leaves is_vpn out, and absent is not false');
    assert.equal(res.body.ip, PUBLIC_IP);
    assert.deepEqual(asked, [PUBLIC_IP]);
});

test('blocks with 403 on a country condition, and passes another country', async () => {
    const blocked = await serve((app) => app.use(internetdata({
        client: stubClient(UNLIMITED).client, ipSelector: fixedIp,
        blockCondition: { location: { country: ['DE', 'AT'] } },
    })));
    const denied = await blocked();
    assert.equal(denied.status, 403);
    assert.deepEqual(denied.body, { error: 'access denied' });

    const allowed = await serve((app) => app.use(internetdata({
        client: stubClient(UNLIMITED).client, ipSelector: fixedIp,
        blockCondition: { location: { country: 'DE' } },
    })));
    assert.equal((await allowed()).status, 200);
});

test('blocks on a network type, and on anonymity, and passes a clean answer', async () => {
    const hosting = await serve((app) => app.use(internetdata({
        client: stubClient(PAID).client, ipSelector: fixedIp,
        blockCondition: { asn: { type: 'hosting' } },
    })));
    assert.equal((await hosting()).status, 403);

    const anonymous = await serve((app) => app.use(internetdata({
        client: stubClient(PAID).client, ipSelector: fixedIp,
        blockCondition: [{ isTor: true }, { isVpn: true }],
    })));
    assert.equal((await anonymous()).status, 403);

    const clean = { ...PAID, is_vpn: false, vpn: {} };
    const passing = await serve((app) => app.use(internetdata({
        client: stubClient(clean).client, ipSelector: fixedIp,
        blockCondition: [{ isTor: true }, { isVpn: true }],
    })));
    assert.equal((await passing()).status, 200);
});

// Every answer carries `is_bot`, on every plan, so a condition on it blocks a
// crawler's public address and passes any other visitor's.
test('blocks a bot on isBot from its public address, and passes another visitor', async () => {
    const bot = data.lookup.find((c) => c.name === 'paid-bot').body;
    const { client: client, asked: asked } = stubClient(bot);
    const blocked = await serve((app) => app.use(internetdata({
        client: client, ipSelector: () => bot.ip, blockCondition: { isBot: true },
    })));
    assert.equal((await blocked()).status, 403);
    assert.deepEqual(asked, [bot.ip]);

    const passing = await serve((app) => app.use(internetdata({
        client: stubClient(UNLIMITED).client, ipSelector: fixedIp, blockCondition: { isBot: true },
    })));
    assert.equal((await passing()).status, 200);
});

test('a condition reaching the evidence fields is what a flag list cannot do', async () => {
    const mullvad = stubClient(PAID);
    const call = await serve((app) => app.use(internetdata({
        client: mullvad.client, ipSelector: fixedIp, blockCondition: { vpn: { provider: 'nordvpn' } },
    })));
    assert.equal((await call()).status, 200, 'a different provider must not match');

    const call2 = await serve((app) => app.use(internetdata({
        client: mullvad.client, ipSelector: fixedIp,
        blockCondition: { vpn: { provider: 'mullvad' } },
    })));
    assert.equal((await call2()).status, 403);
});

test('onBlocked replaces the refusal entirely', async () => {
    const { client: client } = stubClient(PAID);
    const call = await serve((app) => app.use(internetdata({
        client: client,
        ipSelector: fixedIp,
        blockCondition: { location: { country: 'AT' } },
        onBlocked: (req, res, lookup) => {
            res.status(451).json({ why: lookup.result.location.country });
        },
    })));
    const res = await call();
    assert.equal(res.status, 451);
    assert.deepEqual(res.body, { why: 'AT' });
});

test('skip leaves the request untouched', async () => {
    const { client: client, asked: asked } = stubClient();
    const call = await serve((app) => app.use(internetdata({
        client: client, ipSelector: fixedIp, blockCondition: { isVpn: true },
        skip: (req) => req.path === '/',
    })));
    const res = await call();
    assert.equal(res.status, 200);
    assert.equal(res.body.attached, false);
    assert.deepEqual(asked, []);
});

test('a failing lookup lets the visitor through', async () => {
    const failing = new InternetData({
        retries: 0,
        fetch: async () => new Response('{"error":"boom"}', { status: 500 }),
    });
    const call = await serve((app) => app.use(internetdata({
        client: failing, ipSelector: fixedIp, blockCondition: { isVpn: true },
    })));
    const res = await call();
    assert.equal(res.status, 200);
    assert.equal(res.body.error, 'server_error');
});

test('onMissingField: throw reaches the express error handler', async () => {
    const free = stubClient(UNLIMITED);
    const call = await serve((app) => {
        app.use(internetdata({
            client: free.client, ipSelector: fixedIp,
            blockCondition: { location: { city: 'Vienna' } }, onMissingField: 'throw',
        }));
        app.use((err, _req, res, _next) => {
            res.status(500).json({ message: err.message });
        });
    });
    const res = await call();
    assert.equal(res.status, 500);
    assert.match(res.body.message, /location\.city, which your plan does not include/);
});

// The test that matters. Every other assertion here would pass whether or not
// the selector is right, because a direct connection has nothing to confuse.
test('a forged X-Forwarded-For is ignored by default and honored only on request', async () => {
    const forgery = { 'x-forwarded-for': PUBLIC_IP };

    const plain = stubClient();
    const untrusting = await serve((app) => app.use(internetdata({ client: plain.client })));
    const direct = await untrusting(forgery);
    assert.equal(direct.body.ip, '127.0.0.1',
        'with trust proxy off, req.ip is the socket peer and the header is a forgery');
    assert.deepEqual(plain.asked, [], 'and a bogon is answered locally, so nothing was asked');

    const trusting = stubClient();
    const trusted = await serve((app) => {
        app.set('trust proxy', true);
        app.use(internetdata({ client: trusting.client }));
    });
    const viaTrust = await trusted(forgery);
    assert.equal(viaTrust.body.ip, PUBLIC_IP,
        'trust proxy is the application saying it believes the header');
    assert.deepEqual(trusting.asked, [PUBLIC_IP]);

    const explicit = stubClient();
    const viaSelector = await serve((app) => app.use(internetdata({
        client: explicit.client, ipSelector: xffIpSelector(),
    })));
    assert.equal((await viaSelector(forgery)).body.ip, PUBLIC_IP);
    assert.deepEqual(explicit.asked, [PUBLIC_IP]);
});

test('a header selector reads the edge that writes it', async () => {
    const { client: client, asked: asked } = stubClient();
    const call = await serve((app) => app.use(internetdata({
        client: client, ipSelector: headerIpSelector('CF-Connecting-IP'),
    })));
    assert.equal((await call({ 'cf-connecting-ip': '45.83.91.9' })).body.ip, '45.83.91.9');
    assert.equal((await call({})).body.ip, '127.0.0.1',
        'and falls back to req.ip when the edge did not write one');
    assert.deepEqual(asked, ['45.83.91.9']);
});

test('depth counts trusted hops from the right', async () => {
    const { client: client, asked: asked } = stubClient();
    const call = await serve((app) => app.use(internetdata({
        client: client, ipSelector: xffIpSelector({ depth: 1 }),
    })));
    await call({ 'x-forwarded-for': `${PUBLIC_IP}, 70.41.3.18, 150.172.238.178` });
    assert.deepEqual(asked, ['150.172.238.178']);
});

test('the default selector is req.ip', async () => {
    const { client: client } = stubClient();
    const call = await serve((app) => app.use(internetdata({
        client: client, ipSelector: defaultIpSelector,
    })));
    assert.equal((await call()).body.ip, '127.0.0.1');
});

test('a private client address is answered locally and never blocks', async () => {
    const { client: client, asked: asked } = stubClient();
    const warnings = [];
    const call = await serve((app) => app.use(internetdata({
        client: client, blockCondition: { isVpn: true }, onWarn: (m) => warnings.push(m),
    })));
    const res = await call();
    assert.equal(res.status, 200, 'local development must not lock you out of your own app');
    assert.equal(res.body.isBogon, true);
    assert.deepEqual(asked, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /not a public address/);
});

test('the deadline bounds the request rather than the visitor waiting on us', async () => {
    const hung = new InternetData({ retries: 0, fetch: () => new Promise(() => {}) });
    const call = await serve((app) => app.use(internetdata({
        client: hung, ipSelector: fixedIp, timeoutMs: 150, blockCondition: { isVpn: true },
    })));
    const started = Date.now();
    const res = await call();
    assert.equal(res.status, 200);
    assert.equal(res.body.error, 'network');
    assert.ok(Date.now() - started < 3000, 'the visitor was held past the budget');
});

test('a condition that constrains nothing is refused at construction', () => {
    assert.throws(() => internetdata({ blockCondition: { isVpn: false } }), /constrains nothing/);
    assert.throws(() => internetdata({ blockCondition: {} }), /constrains nothing/);
});

// Built exactly as the README builds it: the README's `trust proxy`, and an API key
// from the environment and nothing else. Every other test passes a client, so none
// could see the middleware fail to start, or send no key, the README's way.
test('builds as the README does, with the key set and unset', async () => {
    const realFetch = globalThis.fetch;
    const savedKey = process.env.INTERNETDATA_API_KEY;
    const sent = [];
    globalThis.fetch = async (input, init) => {
        const request = new Request(input, init);
        if (new URL(request.url).hostname !== 'api.internetdata.io') {
            return realFetch(input, init);
        }
        sent.push({ path: new URL(request.url).pathname, auth: request.headers.get('authorization') });
        return new Response(JSON.stringify(UNLIMITED), {
            status: 200, headers: { 'content-type': 'application/json' },
        });
    };
    try {
        for (const key of ['readme-key', undefined]) {
            if (key === undefined) {
                delete process.env.INTERNETDATA_API_KEY;
            } else {
                process.env.INTERNETDATA_API_KEY = key;
            }
            sent.length = 0;

            const app = express();
            app.set('trust proxy', 'loopback');
            app.use(internetdata({ apiKey: process.env.INTERNETDATA_API_KEY }));
            app.get('/', (req, res) => {
                const { result } = req.internetdata;
                res.send(`Hello, visitor from ${result?.location.country_name ?? 'somewhere'}`);
            });
            const server = await new Promise((resolve) => {
                const s = app.listen(0, '127.0.0.1', () => resolve(s));
            });
            servers.push(server);

            const res = await realFetch(`http://127.0.0.1:${server.address().port}/`, {
                headers: { 'x-forwarded-for': PUBLIC_IP },
            });
            assert.equal(res.status, 200, `key ${key}`);
            assert.equal(await res.text(), 'Hello, visitor from Austria', `key ${key}`);
            assert.deepEqual(sent, [{ path: `/${PUBLIC_IP}`, auth: key === undefined ? null : `Bearer ${key}` }]);
        }
    } finally {
        globalThis.fetch = realFetch;
        if (savedKey === undefined) {
            delete process.env.INTERNETDATA_API_KEY;
        } else {
            process.env.INTERNETDATA_API_KEY = savedKey;
        }
    }
});

// allowBots as the README builds it, behind `trust proxy` with a public visitor:
// the agent that reaches the API is the visitor's own, a verified crawler passes
// the condition it meets, a spoofed or not_bot one is refused, and off sends none.
test('allowBots sends the visitor\'s User-Agent and lets only a verified crawler through', async () => {
    const realFetch = globalThis.fetch;
    const googlebot = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
    const sent = [];
    let verdict = 'verified';
    globalThis.fetch = async (input, init) => {
        const request = new Request(input, init);
        const url = new URL(request.url);
        if (url.hostname !== 'api.internetdata.io') {
            return realFetch(input, init);
        }
        const agent = url.searchParams.get('user_agent');
        sent.push({ path: url.pathname, agent: agent });
        return new Response(JSON.stringify({
            ...PAID, ip: PUBLIC_IP, is_bot: true,
            ...(agent === null ? {} : { user_agent: { agent: 'Googlebot', kind: 'bot', verdict: verdict } }),
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const start = async (options) => {
        const app = express();
        app.set('trust proxy', 'loopback');
        app.use(internetdata({ apiKey: 'readme-key', cache: false, onWarn: () => {}, ...options }));
        app.get('/', (req, res) => res.json({ verdict: req.internetdata.result.userAgent?.verdict ?? null }));
        const server = await new Promise((resolve) => {
            const s = app.listen(0, '127.0.0.1', () => resolve(s));
        });
        servers.push(server);
        return server.address().port;
    };
    // Node's http sends no User-Agent of its own, where fetch sends `node`.
    const get = (port, headers) => new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: port, path: '/', headers: { 'x-forwarded-for': PUBLIC_IP, ...headers } },
            (res) => {
                res.resume();
                res.on('end', () => resolve(res.statusCode));
            }).on('error', reject);
    });
    try {
        const on = await start({ blockCondition: { isBot: true }, allowBots: true });
        for (const [v, status] of [['verified', 200], ['spoofed', 403], ['not_bot', 403], ['unverifiable', 403]]) {
            verdict = v;
            sent.length = 0;
            assert.equal(await get(on, { 'user-agent': googlebot }), status, v);
            assert.deepEqual(sent, [{ path: `/${PUBLIC_IP}`, agent: googlebot }], `${v}: the visitor's own agent arrived`);
        }
        verdict = 'verified';
        for (const headers of [{}, { 'user-agent': '' }]) {
            sent.length = 0;
            assert.equal(await get(on, headers), 403, JSON.stringify(headers));
            assert.deepEqual(sent, [{ path: `/${PUBLIC_IP}`, agent: null }], `${JSON.stringify(headers)} sends none`);
        }
        const off = await start({ blockCondition: { isBot: true } });
        sent.length = 0;
        assert.equal(await get(off, { 'user-agent': googlebot }), 403);
        assert.deepEqual(sent, [{ path: `/${PUBLIC_IP}`, agent: null }], 'off sends none');
        const forged = await start({ blockCondition: { userAgent: { verdict: 'spoofed' } }, allowBots: true });
        verdict = 'spoofed';
        assert.equal(await get(forged, { 'user-agent': googlebot }), 403);
        verdict = 'verified';
        assert.equal(await get(forged, { 'user-agent': googlebot }), 200);
    } finally {
        globalThis.fetch = realFetch;
    }
});

// The bound, through a real request cycle from public peers: with a stub answering `verified` to
// any agent, four crawler agents an address reach the API, the fifth arrives bare and is refused,
// a known one is sent again, a browser's is never sent, and another address has its own four.
test('allowBots sends only a crawler\'s User-Agent, at most four an address', async () => {
    const realFetch = globalThis.fetch;
    const crawler = (n) => `Mozilla/5.0 (compatible; Examplebot/${n}.0)`;
    const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
    const OTHER_IP = '66.249.66.2';
    const sent = [];
    globalThis.fetch = async (input, init) => {
        const url = new URL(new Request(input, init).url);
        if (url.hostname !== 'api.internetdata.io') {
            return realFetch(input, init);
        }
        const agent = url.searchParams.get('user_agent');
        const ip = decodeURIComponent(url.pathname.slice(1));
        sent.push({ ip: ip, agent: agent });
        return new Response(JSON.stringify({
            ...PAID, ip: ip, is_bot: true, bot: {},
            ...(agent === null ? {} : { user_agent: { agent: 'Examplebot', kind: 'bot', verdict: 'verified' } }),
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const start = async () => {
        const app = express();
        app.set('trust proxy', 'loopback');
        app.use(internetdata({ apiKey: 'readme-key', cache: false, onWarn: () => {}, blockCondition: { isBot: true }, allowBots: true }));
        app.get('/', (req, res) => res.json({ ok: true }));
        const server = await new Promise((resolve) => {
            const s = app.listen(0, '127.0.0.1', () => resolve(s));
        });
        servers.push(server);
        return server.address().port;
    };
    const port = await start();
    const get = (ip, agent) => new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: port, path: '/', headers: { 'x-forwarded-for': ip, 'user-agent': agent } },
            (res) => {
                res.resume();
                res.on('end', () => resolve(res.statusCode));
            }).on('error', reject);
    });
    try {
        for (const n of [1, 2, 3, 4]) {
            assert.equal(await get(PUBLIC_IP, crawler(n)), 200, `agent ${n}`);
        }
        assert.equal(await get(PUBLIC_IP, crawler(5)), 403, 'the fifth arrives bare and is refused');
        assert.equal(await get(PUBLIC_IP, crawler(1)), 200, 'a known agent is still sent');
        assert.equal(await get(PUBLIC_IP, chrome), 403, 'a browser\'s agent is never sent');
        assert.equal(await get(OTHER_IP, crawler(5)), 200, 'each address has its own four');
        assert.deepEqual(sent, [
            ...[1, 2, 3, 4].map((n) => ({ ip: PUBLIC_IP, agent: crawler(n) })),
            { ip: PUBLIC_IP, agent: null },
            { ip: PUBLIC_IP, agent: crawler(1) },
            { ip: PUBLIC_IP, agent: null },
            { ip: OTHER_IP, agent: crawler(5) },
        ]);
    } finally {
        globalThis.fetch = realFetch;
    }
});
