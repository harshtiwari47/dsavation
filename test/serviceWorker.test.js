import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const serviceWorkerSource = await readFile(new URL('../client/public/sw.js', import.meta.url), 'utf8');

function createFetchHandler({ match = async () => null, fetch = async () => new Response('network') } = {}) {
    let fetchHandler;
    const self = {
        location: { origin: 'https://dsavation.test' },
        addEventListener(type, handler) {
            if (type === 'fetch') fetchHandler = handler;
        },
        skipWaiting: async () => { },
        clients: { claim: async () => { } },
    };
    const caches = {
        match: (...args) => match(...args),
        open: async () => ({ addAll: async () => { } }),
        keys: async () => [],
    };
    const context = { self, caches, fetch, URL, Response, Promise };
    vm.runInNewContext(serviceWorkerSource, context);

    return (request) => {
        let responsePromise;
        fetchHandler({ request, respondWith: (response) => { responsePromise = Promise.resolve(response); } });
        return responsePromise || null;
    };
}

test('service worker leaves cross-origin requests to the browser', async () => {
    let fetchCount = 0;
    let cacheCount = 0;
    const dispatch = createFetchHandler({
        match: async () => { cacheCount += 1; return null; },
        fetch: async () => { fetchCount += 1; return new Response('external'); },
    });

    const response = await dispatch({ url: 'https://external-content.duckduckgo.com/image.png', mode: 'no-cors' });

    assert.equal(response, null);
    assert.equal(cacheCount, 0);
    assert.equal(fetchCount, 0);
});

test('service worker falls through to network if the cache lookup fails', async () => {
    const dispatch = createFetchHandler({
        match: async () => { throw new Error('cache unavailable'); },
        fetch: async () => new Response('network asset'),
    });

    const response = await dispatch({ url: 'https://dsavation.test/image.png', mode: 'no-cors' });

    assert.equal(await response.text(), 'network asset');
});

test('service worker resolves failed asset fetches and retains offline navigation fallback', async () => {
    const dispatch = createFetchHandler({
        match: async (request) => request === '/index.html' ? new Response('offline shell') : null,
        fetch: async () => { throw new Error('network unavailable'); },
    });

    const failedAsset = await dispatch({ url: 'https://dsavation.test/image.png', mode: 'no-cors' });
    assert.equal(failedAsset.type, 'error');

    const offlinePage = await dispatch({ url: 'https://dsavation.test/', mode: 'navigate' });
    assert.equal(await offlinePage.text(), 'offline shell');
});