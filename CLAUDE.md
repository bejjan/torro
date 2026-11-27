# torro

Web UI for Deluge, Transmission and qBittorrent. Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4, shadcn/ui on Base UI. See `README.md` for features and connection details.

## Commands

```bash
npm run dev     # dev server on http://127.0.0.1:43123
npm run build   # production build (standalone output); safe while dev is running
npm run lint    # eslint; must finish with 0 errors
npm test        # all src/**/*.test.ts via node --test + tsx
npx tsc --noEmit
```

Run one test file with `node --import tsx src/path/to/file.test.ts`.

Before starting the dev server, check whether one is already listening on 43123.

## Layout

- `src/app/api/*` — server routes. The browser never talks to a daemon directly; everything is proxied here.
- `src/lib/deluge` — the core. The UI speaks Deluge-shaped JSON-RPC; `client.ts` is the browser-side RPC client, `demo.ts` the in-memory demo backend.
- `src/lib/transmission`, `src/lib/qbittorrent` — adapters that present those clients behind the Deluge-shaped facade (`compat.ts`, `map.ts`, `proxy.ts`, `demo.ts`).
- `src/components/app` — application components; `torrent-shell.tsx` is the main screen.
- `src/components/ui` — shadcn/ui primitives. Add new ones with the shadcn CLI rather than by hand.

## Testing

- Tests are plain scripts using `node:assert/strict`, with no `describe`/`it`. Each file ends by logging `"... tests passed"`; a thrown assertion fails the file.
- Many component tests read the component's source as text and assert on it with regexes. When you change a component, run its test: renaming or reformatting a pinned line breaks the test even if behaviour is unchanged. Update the assertion when the change is intended.
- Demo mode needs no daemon: on the sign-in screen choose **Demo mode**, or sign in with a blank URL and password `deluge`.

## Conventions

- Never read or write `ref.current` during render (`react-hooks/refs` is an error). Sync latest-value refs in an effect, or use state.
- Legacy names are intentional, do not rename them in passing: the package is `nova`, and `nova:` localStorage keys and the `x-nova-admin-demo` header are still in use.
- `.worktrees/` holds nested checkouts and `scripts/nas-rebuild.sh` is a local helper; both are gitignored. Leave them alone.
- Branches are named `pr/<topic>` and merged to `main` through GitHub pull requests on `bejjan/torro`.
