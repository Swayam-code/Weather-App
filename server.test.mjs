import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWeatherServer } from './server.mjs';
import { request } from 'node:http';

test('server refuses to run without a configured key', () => {
  assert.throws(() => createWeatherServer(), /OPENWEATHER_API_KEY/);
});

test('malformed absolute request URLs are rejected without terminating the server', async () => {
  const server = createWeatherServer({ apiKey: 'dummy-test-credential' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const status = await new Promise((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port: server.address().port, path: 'http://[' }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(status, 400);
    assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/`)).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('fixed weather proxy keeps the credential server-side, caches and limits requests', async () => {
  const credential = 'dummy-test-credential';
  let calls = 0;
  const server = createWeatherServer({ apiKey: credential, fetchImpl: async (url) => {
    calls++;
    assert.equal(url.origin, 'https://api.openweathermap.org');
    assert.equal(url.searchParams.get('appid'), credential);
    assert.equal(url.searchParams.get('q'), 'New York,US');
    return Response.json({ name: 'New York', weather: [{ icon: '01d', description: 'Clear' }], main: { temp: 20, humidity: 40 }, wind: { speed: 2 }, internal: credential });
  } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/api/weather?city=https://attacker.invalid')).status, 400);
    for (let i = 0; i < 2; i++) {
      const response = await fetch(base + '/api/weather?city=New%20York,US');
      assert.equal(response.status, 200);
      assert.ok(!(await response.text()).includes(credential));
    }
    assert.equal(calls, 1);
    for (let i = 0; i < 29; i++) await fetch(base + '/api/weather?city=New%20York,US');
    assert.equal((await fetch(base + '/api/weather?city=New%20York,US')).status, 429);
    assert.equal((await fetch(base + '/server.mjs')).status, 404);
    assert.equal((await fetch(base + '/.env')).status, 404);
    const browserCode = await (await fetch(base + '/script.js')).text();
    assert.ok(!browserCode.includes('appid='));
    assert.ok(!browserCode.includes(credential));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('upstream errors never return upstream URLs or credentials', async () => {
  const server = createWeatherServer({ apiKey: 'dummy-test-credential', fetchImpl: async () => { throw new Error('sensitive upstream URL'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/weather?city=Nairobi`);
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes('sensitive'));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
