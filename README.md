# NimFind

Lost and found tags for Nimiq Pay. Put a QR code on your keys, your bag, or your phone's lock screen. Whoever finds the item scans it, messages you without either of you sharing a phone number, and you pay them a reward in NIM when you get it back.

Built for the [Nimiq Mini Apps Competition](https://miniappscompetition.com) on the [Nimiq Pay Mini Apps Framework](https://nimiq.dev/mini-apps).

## How it works

- **Owners** sign in inside Nimiq Pay by signing a one-time message with their wallet. No passwords, no funds moved.
- **Tags** are short unguessable codes, such as `k7p2m9xq`, that link to the finder page. They are printed as a sticker, a keychain tag or a card, or placed on a lock screen wallpaper.
- **Finders** need no app and no account. Scanning opens a page showing the item and the reward. To receive the reward they create or connect a Nimiq wallet right in the browser through the [Nimiq Hub](https://hub.nimiq.com), or paste an address. Their conversation is protected by a private token that only they hold.
- **Scans** are recorded when a finder opens the tag page, so the owner sees "Scanned just now" in the app, from their own phone or one they borrow.
- **Trust:** the finder page shows whether the owner's wallet currently holds the promised reward, without revealing the address.
- **Rewards** are paid by the owner directly to the finder from Nimiq Pay. Each payment carries a single-use tag in its data field, and the server confirms it on the Nimiq blockchain. NimFind never holds anyone's money.
- **Designer Pass** unlocks designer wallpapers and the calendar layer for a month, paid in NIM and confirmed on chain the same way.

## Privacy

- A finder never sees the owner's address in the app. A reward payment is an on-chain transaction, so once a reward is paid the two addresses are linked on the public ledger.
- Finder IP addresses are stored only as salted hashes, and only to rate limit reports.

## API backend

Written in TypeScript with [Hono](https://hono.dev). It runs as a Vercel Edge Function with a [Turso](https://turso.tech) (libSQL) database, and as a plain Node server locally.

| Area | Routes |
|---|---|
| Sign in | `POST /api/auth/challenge`, `POST /api/auth/verify` |
| Owner tags | `GET/POST /api/tags`, `GET/PATCH /api/tags/:code` |
| Owner inbox | `GET /api/reports`, `GET /api/reports/:id`, `POST /api/reports/:id/messages`, `POST /api/reports/:id/status`, `POST /api/reports/:id/reward/prepare`, `POST /api/reports/:id/reward/confirm` |
| Finders (public) | `GET /api/public/tags/:code`, `POST /api/public/tags/:code/scan`, `POST /api/public/tags/:code/reports`, `GET /api/public/reports/:id`, `POST /api/public/reports/:id/messages`, `PUT /api/public/reports/:id/finder-address` |
| Designer Pass | `GET /api/pass`, `POST /api/pass/prepare`, `POST /api/pass/confirm` |
| Wallpaper links | `POST /api/wallpaper-links`, `GET /api/public/wallpapers/:token` |
| Stats | `GET /api/public/stats` |

Signature verification and address derivation are implemented with `@noble/curves` and `@noble/hashes`, and tested against the official `@nimiq/core` library.

## Front end

A Vue 3 app in `web/`. It uses Nimiq's palette, the Mulish typeface, and icons from the MIT licensed [nimiq-icons](https://www.npmjs.com/package/nimiq-icons) set, plus a few drawn in the same style. Wallpapers and printable sheets are drawn on a canvas in the browser, so personal photos never leave the phone.

## Development

Create a `.dev.vars` file in the project root:

```
SESSION_SECRET=<a long random string, for example the output of: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
NIMIQ_NETWORK=testnet
TREASURY_ADDRESS=<the Nimiq address that receives Designer Pass payments>
```

Then:

```bash
npm install
npm run build        # builds the Vue app into dist/
npm run dev          # app and API on http://127.0.0.1:8787, with a local database in .data/
npm test             # unit and API tests
npm run typecheck
```

### Testing inside Nimiq Pay on a phone

1. In Nimiq Pay, switch to testnet: open the app menu and long press the settings button for 10 seconds. Tap "Get free NIM".
2. On the computer, run `npm run build` and then `npm run dev -- --host`.
3. With the phone on the same Wi-Fi, open Mini Apps in Nimiq Pay and enter `http://<computer's local IP>:8787` as the Custom URL.

## Deploy to Vercel

1. Import the GitHub repository in Vercel. The included `vercel.json` sets the build command.
2. Add the Turso integration from the Vercel Marketplace to the project. It sets `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
3. In Project Settings, Environment Variables, add `SESSION_SECRET` (a long random string) and `TREASURY_ADDRESS`. Leave `NIMIQ_NETWORK` unset for mainnet.
4. Deploy. The build applies database migrations, then packages the app with the Vercel Build Output API.

## License

MIT
