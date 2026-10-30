# Local Start platform foundation (Refs #62)

This is a partial independent local slice. It does not accept #55 media, #61
public/SEO parity or all of #62. Root Next commands, dependencies and ports
3500/3501 remain unchanged. No production activation or external service is added.

## Locale, rendering, theme and assets

Start uses its existing request-scoped `/fr` and `/en` routing. Explicit URL locale
controls rendering; unprefixed aliases resolve `NEXT_LOCALE`, existing account
preference when available, weighted `Accept-Language`, then French. The cookie is
an essential preference, never an authorization signal. Locale responses are
private/no-store and vary on Cookie and Accept-Language. Invalid locales stay404.
`platform-i18n.ts` preserves the root FR/EN dictionaries and formats ICU with
`intl-messageformat`, without Next/next-intl imports. Numbers and plurals have an
explicit locale and dates default to UTC so SSR and hydration agree. The API is
available for subsequent journey integration; existing feature dictionaries remain
independent, and this slice does not claim every legacy component has been ported.

`platform-theme.tsx` replaces next-themes in Start only. The static head bootstrap
reads the existing `theme` localStorage preference before paint, follows system
color scheme otherwise, and keeps the toggle label stable during hydration.
Storage failure leaves a working system theme. There are no remote font requests:
Start keeps the local/system font fallback and root semantic Tailwind tokens.
Existing public logo/icons are reused. Start uses native images with dimensions
and alt text rather than Next image optimization. B2 responsive media, CORS/CSP
and signed-link renewal await accepted #55; no B2 URL or real object was used here.

## PWA cache contract

Start serves `/manifest.webmanifest`, `/offline.html` and `/sw.js` through its own
server routes. Nothing is added to root `public/sw.js`: reference Next is unchanged.
The manifest keeps the application identity, root scope/start URL and existing
192/512 icons. Unsupported legacy shortcuts are deliberately omitted. Existing
icons are advertised as `any`; no unverified maskable safe area is claimed.

Only four fixed, same-origin, query-free URLs enter CacheStorage:
`/offline.html`, `/logo.svg`, `/icons/192.png`, `/icons/512.png`. Installation fetches
these without credentials and refuses redirects. The offline document is static,
bilingual and contains no account data or JS. It is delivered with503 for failed
navigation; retry links return to the network. There is **no runtime cache write**.
Every other GET uses network-only with HTTP cache bypass. Non-navigation failures
return a network error. POSTs are not intercepted. In particular HTML, RPC/auth,
notifications, conversations, signed URLs (including same-origin URLs ending in an
image extension), cross-origin B2 and private media are never cached by this worker.
Logout remains the existing server revocation plus Query cache cancellation/clear;
the worker holds no account state. Offline logout cannot revoke a server session:
reconnection is required to complete that operation.

## Explicit legacy upgrade procedure

This application must have a dedicated origin whose CacheStorage it owns. Before
any future cutover, serve the new `/sw.js` at the old next-pwa script URL, with root
scope, JavaScript MIME type, `Service-Worker-Allowed: /`, and `Cache-Control: no-store`.
Do not redirect it or serve cached Next HTML at that URL. Keep it available while
old installations can return. Publish the four offline assets at the same time.

On an online Start visit the client registers the same URL/scope with
`updateViaCache: none` and requests an update. Install completes the public offline
cache before `skipWaiting`. Activate deletes **all other origin caches**, including
Workbox/Next HTML/images and any old signed URLs, before claiming tabs. An existing
controlled Start tab reloads once on controller replacement to discard its old JS.
A browser still executing a cached legacy page can explicitly call
`navigator.serviceWorker.getRegistration('/').then(r => r?.update())` online;
normal browser update checks also use the stable script URL. Do not promise an
upgrade while fully offline. Verify activation and cache deletion, reconnect, and
reload existing tabs before accepting the switch. This local synthetic upgrade
proof does not certify an actual production installed PWA or final hosting headers.

## Integration and consent decisions

| Integration | Reference Next behavior | Local Start decision |
| --- | --- | --- |
| Resend | `src/lib/email.ts` sends transactional mail; key required by root validation | Replace for migrated recovery with existing Appwrite/SMTP flow from #52; preserve reference module; no Resend client/key in Start |
| Google Analytics | Root layout mounts the component using optional GA ID; no consent gate found in that layout | Remove from Start; no measurement ID, tracker or analytics cookie; any later enablement needs a separately accepted consent flow |
| Vercel Analytics / Speed Insights | Both mounted by root layout | Remove from Start; no Vercel integration or telemetry request |
| Google OAuth | Existing #52 broker, disabled by default | Keep existing explicit opt-in; no actual Google or consent-provider test in this slice |
| Cloudinary / Next image | Reference image and upload pipeline | Keep reference until accepted B2 migration; do not enable new remote cache |
| Theme / language | localStorage / cookie preferences | Keep essential preferences; no tracking-consent banner is introduced when no optional tracker is active |
| PWA | Legacy Next/Workbox runtime caches | Replace in Start with the bounded public-only cache above |

These are source-level observations, not claims about private deployed settings.
No external mail, Google, analytics or B2 call is needed for the fixture-free proof.
A future tracker must stay blocked until consent, support withdrawal, and clear its
own identifiers; this patch does not implement a fictitious analytics-consent UI.

## Reproduce local evidence

Use Node24 and Bun1.3.14; install root and Start frozen lockfiles. From the root:

```sh
bun run --cwd apps/start test
bun run build:start
bun run typecheck:start
bun run --cwd apps/start lint
PLAYWRIGHT_CHANNEL=chrome bun run --cwd apps/start smoke --config playwright.platform.config.ts
```

The platform browser suite owns only3572, fails if occupied and stops its server.
It temporarily writes a legacy worker into **build output only** and removes it in
`finally`; no fixture worker endpoint ships. It seeds legacy Next/private sentinels,
checks same-URL replacement and cache purge, then checks FR/EN offline503 pages,
RPC and signed-media network failures, cookie removal, recovery online, mobile
layout, theme persistence, locale redirects and hydration. Cookie removal alone is
not a real server logout proof; the isolated Appwrite login/logout test is a
separate gate. Final B2/SEO integration, real old installation, final origin headers,
and independent exact-head review remain open before full #62 acceptance.

Implementation reference: [FormatJS Intl MessageFormat API](https://formatjs.github.io/docs/intl-messageformat/)
(constructor, explicit locales, ICU plural/select and formatter options), checked
against installed12.1.4. Context7 was unavailable in this session.

Recorded fixture-free result:47 unit tests passed; build/client scan(28 JS files),
typecheck and lint passed(lint retains55 pre-existing warnings and5 infos).
Chrome platform browser suite:2 passed,0 failed,0 skipped on the third execution;
first two executions corrected test-only locator/reload/assertion problems.
See `apps/start/evidence/platform-local.json` for source fingerprints. The initial
real-auth scenario lives in `platform-auth.pw.ts`. The coordinator allocated the
isolated runtime slot and this command was executed once:
`NFE_AUTH_SYNTHETIC=1 PLAYWRIGHT_CHANNEL=chrome bun run --cwd apps/start scripts/platform-auth-proof.ts`.
Do not run another stack concurrently or treat cookie removal as revocation proof.

**Real auth gate FAILED / UNPROVEN:** the initial scenario produced0 passed,
1 failed,0 skipped. Real Appwrite login through the UI and private identity checks
succeeded. It stopped at `platform-auth.pw.ts`'s authenticated SSR header assertion:
the independent Playwright `request` fixture made `/fr/private` without the browser
session cookie, and the response had no `cache-control` header. The intended real
logout/revocation/offline assertions were not reached. This is an initial fixture
defect, not a passed privacy check or proof of a production cache leak. No repair
or rerun was performed after the3/3 budget; explicit extension is required.

Cleanup completed for the owned `nfe-auth-51` project only:0 containers,0 volumes,
0 networks, and ports3572/19561 available; its private fixture directory was removed.
Next3500/Start3501 and other workers' services were untouched. Independent source
review at2f7ce1f approved with a nonblocking cross-tab theme comment; do not merge
this PWA on that review and the synthetic worker proof alone. Full #62 remains open.
