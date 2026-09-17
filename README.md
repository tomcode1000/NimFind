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

A Cloudflare Worker with a D1 database, written in TypeScript with [Hono](https://hono.dev).

| Area | Routes |
|---|---|
| Sign in | `POST /api/auth/challenge`, `POST /api/auth/verify` |
| Owner tags | `GET/POST /api/tags`, `GET/PATCH /api/tags/:code` |
| Owner inbox | `GET /api/reports`, `GET /api/reports/:id`, `POST /api/reports/:id/messages`, `POST /api/reports/:id/status`, `POST /api/reports/:id/reward/prepare`, `POST /api/reports/:id/reward/confirm` |
| Finders (public) | `GET /api/public/tags/:code`, `POST /api/public/tags/:code/scan`, `POST /api/public/tags/:code/reports`, `GET /api/public/reports/:id`, `POST /api/public/reports/:id/messages`, `PUT /api/public/reports/:id/finder-address` |
| Designer Pass | `GET /api/pass`, `POST /api/pass/prepare`, `POST /api/pass/confirm` |
| Stats | `GET /api/public/stats` |

Signature verification and address derivation are implemented with `@noble/curves` and `@noble/hashes`, and tested against the official `@nimiq/core` library.

## Front end

A Vue 3 app in `web/`, served by the same Worker. It uses Nimiq's palette, the Mulish typeface, and icons from the MIT licensed [nimiq-icons](https://www.npmjs.com/package/nimiq-icons) set, plus a few drawn in the same style. Wallpapers and printable sheets are drawn on a canvas in the browser, so personal photos never leave the phone.

## Development

```bash
npm install
echo "SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" > .dev.vars
echo "NIMIQ_NETWORK=testnet" >> .dev.vars
npm run db:migrate:local
npm run build                                 # builds the Vue app into dist/
npm run dev                                   # app and API on http://127.0.0.1:8787
npm test                                      # unit and API tests
npm run typecheck
node scripts/smoke.mjs http://127.0.0.1:8787  # end to end API check against a running Worker
```

### Testing inside Nimiq Pay on a phone

1. In Nimiq Pay, switch to testnet: open the app menu and long press the settings button for 10 seconds. Tap "Get free NIM".
2. On the computer, run `npm run build` and then `npm run dev -- --ip 0.0.0.0`.
3. With the phone on the same Wi-Fi, open Mini Apps in Nimiq Pay and enter `http://<computer's local IP>:8787` as the Custom URL.

## Deploy

```bash
npx wrangler d1 create nimfind        # copy the database_id into wrangler.jsonc
npx wrangler d1 migrations apply nimfind --remote
npx wrangler secret put SESSION_SECRET
# set TREASURY_ADDRESS in wrangler.jsonc to the address that receives Designer Pass payments
npm run deploy
```

## License

MIT
