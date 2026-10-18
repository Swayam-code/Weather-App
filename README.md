# Weather app

HTML, CSS and JavaScript weather app using OpenWeather. A Node server serves the
page and requests weather data without sending the API key to the browser.

## Run locally

1. Install Node.js 20.12 or later.
2. Copy `.env.example` to `.env` and set `OPENWEATHER_API_KEY` to a new key.
3. Run `npm start`, then open `http://127.0.0.1:3000`.

Revoke or rotate the old committed OpenWeather key in the provider console.
Removing it from source does not revoke copies in Git history. Keep `.env` private.
No dependencies need to be installed.

## Deployment

Deploy the Node server with `OPENWEATHER_API_KEY` in the hosting provider's secret
settings. When the host supplies environment variables, run `node server.mjs`.
Set `HOST=0.0.0.0` if the host needs an external listener and configure `PORT`.
Static-only hosting, including GitHub Pages, cannot run the proxy; use a Node host.

The proxy requests only the fixed OpenWeather weather endpoint, accepts bounded
city names, caches for five minutes, and allows 30 requests per minute per socket
IP. It does not trust forwarded IP headers. Behind a reverse proxy the limit may
be shared. Configure authentication/rate limits and quotas at the hosting/provider
layer for a public deployment. In-memory limits and cache are per server instance
and reset on restart.

Run `npm test` for local mocked proxy checks. These do not call OpenWeather.


