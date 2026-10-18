import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/script.js', ['script.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

export function createWeatherServer({ apiKey, fetchImpl = fetch, now = Date.now } = {}) {
  if (!apiKey?.trim()) throw new Error('OPENWEATHER_API_KEY must be configured on the server.');
  const cache = new Map();
  const clients = new Map();
  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  return http.createServer(async (req, res) => {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/weather') {
      const city = url.searchParams.get('city')?.trim();
      if (!city || city.length > 80 || !/^[\p{L}\p{M}\p{N} .,'’()-]+$/u.test(city)) {
        return json(res, 400, { error: 'Enter a valid city name (up to 80 characters).' });
      }
      const time = now();
      for (const [ip, client] of clients) if (client.reset <= time) clients.delete(ip);
      const ip = req.socket.remoteAddress;
      let client = clients.get(ip);
      if (!client) {
        if (clients.size >= 1000) return json(res, 429, { error: 'Please try again later.' });
        client = { count: 0, reset: time + 60_000 };
        clients.set(ip, client);
      }
      if (++client.count > 30) return json(res, 429, { error: 'Too many requests. Try again in a minute.' });
      const cacheKey = city.toLowerCase();
      const cached = cache.get(cacheKey);
      if (cached?.expires > time) return json(res, 200, cached.body);
      const upstream = new URL('https://api.openweathermap.org/data/2.5/weather');
      upstream.search = new URLSearchParams({ q: city, units: 'metric', appid: apiKey }).toString();
      try {
        const response = await fetchImpl(upstream, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) return json(res, response.status === 404 ? 404 : 502, { error: 'Weather is unavailable for that city.' });
        const data = await response.json();
        const body = { name: data.name, weather: data.weather?.map(({ icon, description }) => ({ icon, description })), main: { temp: data.main?.temp, humidity: data.main?.humidity }, wind: { speed: data.wind?.speed } };
        if (!body.weather?.length || typeof body.main.temp !== 'number') throw new Error('Invalid weather response.');
        if (cache.size >= 200) cache.delete(cache.keys().next().value);
        cache.set(cacheKey, { body, expires: time + 300_000 });
        return json(res, 200, body);
      } catch {
        return json(res, 502, { error: 'Weather service unavailable. Please try again later.' });
      }
    }
    const file = staticFiles.get(url.pathname);
    if (!file) return json(res, 404, { error: 'Not found.' });
    try {
      const body = await readFile(new URL(file[0], import.meta.url));
      res.writeHead(200, { 'Content-Type': file[1], 'X-Content-Type-Options': 'nosniff' });
      res.end(body);
    } catch {
      json(res, 500, { error: 'Unable to load the page.' });
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  createWeatherServer({ apiKey: process.env.OPENWEATHER_API_KEY }).listen(
    Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1',
    () => console.log('Weather app server is ready.'),
  );
}
