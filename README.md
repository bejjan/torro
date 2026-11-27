# torro

<p align="center">
  <img src="public/logo.svg" width="72" height="72" alt="torro" />
</p>

A modern web UI for [Deluge](https://www.deluge-torrent.org/), [Transmission](https://transmissionbt.com/), and [qBittorrent](https://www.qbittorrent.org/). It talks to `deluge-web` over JSON-RPC, Transmission RPC (`POST /transmission/rpc`), or the qBittorrent Web API (`/api/v2`), or runs a built-in demo backend so you can explore the client without a daemon.

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="torro torrent dashboard with filters, progress, and live speeds" />
</p>

Licensed under [GPL-3.0](./LICENSE).

## Features

- One layout for both clients: sidebar filters, searchable table, details pane, and **Add torrent**
- Finder-style list selection (click, Shift-click, keyboard) and a double-click inspector dialog
- Live session chip with transfer sparkline; tab favicon shows download progress
- Browser notification when a torrent finishes
- Row actions for pause / resume / remove / queue / move / recheck
- Menu for Preferences, Connection Manager, theme, and sign out
- Connection screen: choose **Deluge**, **Transmission**, or **qBittorrent**, then URL and credentials
- Connection Manager for Deluge `deluge-web` hosts (hidden in Transmission mode)
- Deluge preferences and plugin surfaces (Label, Scheduler, Extractor, Execute, Notifications, Blocklist, AutoAdd, ltConfig)
- Transmission preferences subset via `session-get` / `session-set` (directories, speed, queue, peers, network)
- qBittorrent preferences subset via Web API `app/preferences` (directories, speed, queue, peers, network)
- Desktop and mobile (sidebar and details as sheets)

## Screenshots

Light-mode desktop views of the current UI.

### Inspector

Double-click a row for the centered inspector. The docked details pane stays a pane.

<p align="center">
  <img src="docs/screenshots/inspector.png" alt="torro torrent inspector dialog" />
</p>

### Preferences

Deluge and Transmission settings in one dialog, opened from the menu.

<p align="center">
  <img src="docs/screenshots/preferences.png" alt="torro preferences dialog" />
</p>

## Demo mode

On the connection screen, click **Demo mode**, pick the client type, keep **Sample library** selected, and click **Start demo**. No URL or password is needed.

- **Deluge** demo mocks `deluge-web` JSON-RPC.
- **Transmission** demo mocks Transmission RPC 16+ (including labels).
- **qBittorrent** demo mocks Web API v2 (including categories as labels).

Demo mode keeps an in-memory session (survives Next.js hot reload) and simulates live download progress.

## Load test

On the connection screen, click **Demo mode**, pick Deluge, Transmission, or qBittorrent, and choose **Load test** instead of **Sample library**. Set **Torrent count** (default 2000, max 10 000), and optionally the **RNG seed** and the share of torrents that are seeding, downloading, or paused; the remainder become checking, queued, and error. Click **Start demo**. No daemon is contacted.

This builds a separate in-memory catalog (stable if you keep the RNG seed) so the real table, sidebar filters, details pane, and polling run against thousands of torrents. 10 000 rows will be slow. Settings persist in `localStorage` under `nova:admin-demo`.

## Connecting

### Deluge

1. Choose **Deluge**.
2. Enter the **full Web URL**, including protocol and port — for example `http://192.168.1.10:8112`. A hostname without `http://` is treated as HTTP; a missing port defaults to `8112`.
3. Sign in with the **Deluge Web password** (same as the official web UI). There is no username on this screen.
4. After login, use **Connection Manager** if the daemon needs a username/password (daemon port is typically `58846`).
5. For HTTPS with a self-signed certificate, tick **Allow self-signed TLS** or set `DELUGE_TLS_INSECURE=1`.

You can also set `DELUGE_WEB_URL` in `.env.local` instead of the login field.

### Transmission

1. Choose **Transmission**.
2. Enter the **RPC URL** — for example `http://127.0.0.1:9091` or `http://host:9091/transmission/rpc`. A missing port defaults to `9091`; a missing path becomes `/transmission/rpc`.
3. Enter **username** (optional) and **password**. Transmission RPC commonly uses HTTP basic auth.
4. For HTTPS with a self-signed certificate, tick **Allow self-signed TLS** or set `TRANSMISSION_TLS_INSECURE=1`.

You can also set `TRANSMISSION_RPC_URL` in `.env.local`.

### qBittorrent

1. Choose **qBittorrent**.
2. Enter the **Web UI URL** — for example `http://127.0.0.1:8080`. A missing port defaults to `8080`. A trailing `/api/v2` is stripped.
3. Enter **username** (often `admin`) and **password**.
4. For HTTPS with a self-signed certificate, tick **Allow self-signed TLS** or set `QBITTORRENT_TLS_INSECURE=1`.

You can also set `QBITTORRENT_WEB_URL` in `.env.local`.

torro never talks to the daemon from the browser. Next.js proxies Deluge at `/api/json` and `/api/upload`, Transmission at `/api/json` (Deluge-shaped facade), `/api/transmission`, and `/api/transmission/upload`, and qBittorrent at `/api/json` (Deluge-shaped facade over Web API v2).

## Environment

Copy `.env.example` to `.env.local`:

| Variable | Purpose |
| --- | --- |
| `DELUGE_WEB_URL` | Base URL of `deluge-web` (protocol + host + port, no trailing slash) |
| `DELUGE_DEMO` | Set to `1` to force the in-memory Deluge demo backend |
| `DELUGE_TLS_INSECURE` | Set to `1` to skip TLS verification when proxying to Deluge |
| `TRANSMISSION_RPC_URL` | Transmission RPC URL (e.g. `http://127.0.0.1:9091/transmission/rpc`) |
| `TRANSMISSION_DEMO` | Set to `1` to force the in-memory Transmission demo backend |
| `TRANSMISSION_TLS_INSECURE` | Set to `1` to skip TLS verification when proxying to Transmission |
| `QBITTORRENT_WEB_URL` | qBittorrent Web UI URL (e.g. `http://127.0.0.1:8080`) |
| `QBITTORRENT_DEMO` | Set to `1` to force the in-memory qBittorrent demo backend |
| `QBITTORRENT_TLS_INSECURE` | Set to `1` to skip TLS verification when proxying to qBittorrent |

You can also override the URL per browser via the login form (`X-Deluge-URL`, `X-Transmission-URL`, or `X-QBittorrent-URL`). Private/LAN addresses are allowed — that is how this app reaches a NAS.

## Develop

```bash
npm install
npm run dev
```

The app listens on [http://127.0.0.1:43123](http://127.0.0.1:43123).

```bash
npm run build
npm start
npm run lint
```

API routes:

- `POST /api/json` — Deluge JSON-RPC proxy to `deluge-web` `/json`, or a Deluge-shaped facade over Transmission RPC / qBittorrent Web API / demo
- `POST /api/upload` — torrent file upload proxy (`deluge-web` `/upload`, Transmission or qBittorrent metainfo)
- `POST /api/transmission` — classic Transmission RPC proxy (`X-Transmission-Session-Id` handshake on 409)
- `POST /api/transmission/upload` — store `.torrent` metainfo for `torrent-add`

## Stack

Next.js 16, React 19, TypeScript, Tailwind CSS v4, shadcn/ui (Base UI).
