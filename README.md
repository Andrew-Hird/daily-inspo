# daily-inspo

A GitHub Actions workflow that generates a daily AI minion image using HuggingFace (FLUX.1-schnell) and emails it with an inspirational quote via Resend.

## How it works

The same email goes to two regions at 8am local time each. One run produces the day's content and
commits it; both sends are consumers of that committed content, so New Zealand and London receive
an identical image and quote.

**[`daily-generate-and-send-nz.yml`](.github/workflows/daily-generate-and-send-nz.yml)** — 20:00 UTC, 8am NZT:

1. Generates a unique daily image via [HuggingFace Inference API](https://huggingface.co/black-forest-labs/FLUX.1-schnell) (FLUX.1-schnell) and fetches a random quote from [ZenQuotes](https://zenquotes.io)
2. Writes `daily.jpg` and `daily.json` (the day's quote, author, and NZ date) and commits both to the repo
3. Broadcasts to the NZ Resend audience, pinning the image URL to the commit it just pushed

**[`daily-send-london.yml`](.github/workflows/daily-send-london.yml)** — 8am London, ~11 hours later:

1. Checks out the repo and reads the already-committed `daily.jpg` and `daily.json` — no image generation, no `HF_TOKEN`, no new quote
2. Broadcasts the same content to the London Resend audience

Because the quote is random per request and the image generation is unseeded, this shared-content
file is what makes the two emails match — two independent runs would otherwise produce two
different emails.

If the NZ run fails, `daily.json` still holds the previous day's date and the London run exits
non-zero without sending, rather than silently repeating yesterday's email.

### Timezones

The content day is always keyed to the NZ date, which also drives the 30-day image prompt
rotation. Only the subject line is localised per region, via the `EMAIL_LOCALE` and `EMAIL_TZ`
environment variables set in each workflow.

## Setup

### Prerequisites

- A GitHub repository with Actions enabled
- A [HuggingFace](https://huggingface.co/) account with an access token
- A [Resend](https://resend.com/) account
- A verified sender domain in Resend with SPF, DKIM, and DMARC configured
- **Two Resend audiences** — one per region. Resend broadcasts fan out to an entire audience with
  no segmentation filter, so each region needs its own audience and contact list.

### GitHub Actions secrets

Add the following secrets under **Settings → Secrets and variables → Actions**:

| Secret | Description |
|---|---|
| `HF_TOKEN` | Your HuggingFace access token (for image generation) |
| `RESEND_API_KEY` | Your Resend API key |
| `RESEND_AUDIENCE_ID` | The ID of your **NZ** Resend Audience (found in Resend → Audiences) |
| `RESEND_AUDIENCE_ID_LONDON` | The ID of your **London** Resend Audience |
| `SENDER_EMAIL` | The verified sender address (e.g. `hello@yourdomain.com`) |

The two audiences are independent, so anyone present in both will receive two emails.

### Trigger manually

Go to **Actions**, pick either workflow, and **Run workflow** to send a test email immediately.

Note the London workflow cannot send until the NZ workflow has committed a `daily.json` at least
once — before that it will correctly fail with a missing-content error.

Test sends warn on stale content rather than failing, so a manual London dispatch works at any
hour. Scheduled broadcasts keep the hard failure. This matters because the committed content is
keyed to the NZ date, which rolls over around 11:00–12:00 UTC while the next generate run is not
until 20:00 UTC — so for most of the London working day the newest available content is a day old
by that key, even though nothing has gone wrong.

### Change the schedule

Both crons are fixed UTC, so the local delivery hour drifts with DST:

| Workflow | Cron | Local time |
|---|---|---|
| [`daily-generate-and-send-nz.yml`](.github/workflows/daily-generate-and-send-nz.yml) | `0 20 * * *` | 8:00 AM NZST (9:00 AM NZDT) |
| [`daily-send-london.yml`](.github/workflows/daily-send-london.yml) | `0 7 * * *` | 8:00 AM BST (7:00 AM GMT) |

Use [crontab.guru](https://crontab.guru) to adjust either one. The London send must stay later in
UTC than the NZ generate run, since it consumes the content that run commits.

## Local testing

Generate today's content (saved as `daily.jpg` and `daily.json`):

```bash
npm install

export HF_TOKEN=...

node generate-and-send.js --fetch-image
```

Send a test email (to a single address instead of the full broadcast). This reads the quote from
`daily.json`, so generate it first:

```bash
export RESEND_API_KEY=...
export RESEND_AUDIENCE_ID=...   # required by validation, unused on the test path
export SENDER_EMAIL=you@example.com
export DAILY_IMAGE_URL=https://...  # URL to an image
export TEST_EMAIL=you@example.com

# NZ subject
EMAIL_LOCALE=en-NZ EMAIL_TZ=Pacific/Auckland node generate-and-send.js

# London subject — same daily.json, so the image and quote are identical
EMAIL_LOCALE=en-GB EMAIL_TZ=Europe/London node generate-and-send.js
```

Requires Node 24 or later (uses native `fetch`).

---

# Cloudflare Worker migration (in progress)

GitHub Actions' scheduled runs are best-effort — they fire late or get skipped.
The Worker in `src/` replaces both workflows with a single hourly cron that
decides what to do from each region's *local* hour. **Until cutover (step 4
below) the GitHub workflows are still authoritative and the Worker is dark.**

Three things change:

- **DST drift is fixed.** London currently gets 8am in summer and 7am in winter,
  because `daily-send-london.yml` uses a fixed UTC cron. The Worker computes the
  local hour at runtime, so London gets 8am year-round.
- **Missed hours self-heal.** Sends are retried at local hours 8, 9 and 10; the
  image is generated at local hour 7, an hour before the first send.
- **No more daily commits.** The image lives in an R2 bucket and is served
  directly off that bucket's public custom domain as `<nz-date>.jpg`, instead of
  a SHA-pinned `raw.githubusercontent.com` URL. The Worker is not in that path,
  so image opens cost no Worker request, no CPU and no egress.

## Layout

| File | Role |
|---|---|
| `src/worker.js` | Decides *when*: `plan()`, the cron handler, admin routes |
| `src/jobs.js` | Does *what*: generate, quote, render, send, healthcheck pings |
| `src/time.js` | Hoisted `Intl` formatters, region table, NZ date helpers |
| `src/prompts.js` | The 30 prompts, unchanged |

## SEND_MODE — a test run can only ever reach you

`SEND_MODE` gates **every** send path, cron-triggered or manual:

| Mode | Behaviour |
|---|---|
| `off` | Generates, sends nothing |
| `test` | Every send goes to `TEST_EMAIL` only. Audience ids are never read and `/broadcasts` is never called |
| `live` | Normal broadcasts |

It ships as `test`. `sendTest()` takes no recipient argument — the address comes
from the `TEST_EMAIL` secret — and `sendBroadcast()` is unexported and asserts
`SEND_MODE === 'live'` on entry, so no call path can reach an audience by
accident. Test sends never write a `sent:` flag, so they can't suppress the real
broadcast.

## Setup

```bash
npm install
npx wrangler kv namespace create INSPO      # paste the id into wrangler.jsonc
npx wrangler r2 bucket create daily-inspo   # needs an R2 subscription on the account
```

Then make the bucket public on a custom domain: Cloudflare dashboard → R2 →
`daily-inspo` → Settings → Public access → **Connect custom domain**, e.g.
`img.yourdomain.com`. Put that origin in `IMAGE_BASE_URL` in `wrangler.jsonc` —
it is what every emailed `<img src>` points at, so it must be right before going
live. Do not use the `r2.dev` URL: Cloudflare rate-limits it and states it is
not for production.

Objects are world-readable by key and the keys are dates, so past images are
enumerable — the same exposure as the public `raw.githubusercontent.com` URLs
this replaces.

Then set the secrets:

```bash
for s in RESEND_API_KEY SENDER_EMAIL RESEND_AUDIENCE_ID_NZ RESEND_AUDIENCE_ID_LONDON TEST_EMAIL HEALTHCHECK_PING_KEY ADMIN_TOKEN; do npx wrangler secret put $s; done
```

`RESEND_AUDIENCE_ID_NZ` is the existing `RESEND_AUDIENCE_ID`. `ADMIN_TOKEN`:
`openssl rand -hex 32`. `HF_TOKEN` is no longer needed — image generation uses
the Workers AI binding.

healthchecks.io: the worker pings with `?create=1`, so three checks create
themselves on first ping — `inspo-generate`, `inspo-send-nz`, `inspo-send-london`. Set each to period 1 day,
grace 4 hours (the 3-hour catch-up window plus slack). A dead cron pings nothing
at all, so the missed-ping alert is what surfaces it.

## Admin routes

All require `token=$ADMIN_TOKEN`.

| Route | Does |
|---|---|
| `?action=plan&at=<iso>` | Pure — what the worker *would* do at any instant. No I/O |
| `?action=status` | Today's image/content/sent state (same as `/health`) |
| `?action=generate` | Generate today's image and quote now (202, runs in background) |
| `?action=send&region=nz\|london` | Full send path, honouring `SEND_MODE` |
| `?action=test&region=nz\|london` | One email to `TEST_EMAIL`, whatever `SEND_MODE` says |
| `?action=probe` | Whether the Images binding actually transforms (reports before/after bytes) |

## Storage

| What | Where | Why |
|---|---|---|
| `<date>.jpg` | R2 `daily-inspo` | Strongly consistent, served direct off the custom domain, free egress |
| `content:<date>` | KV | The day's quote/author/dimensions. Readiness marker, written last |
| `sent:<region>:<date>` | KV | Needs a per-key TTL, which R2 has no equivalent for |

Cache headers are baked onto the R2 object at write time (`public, max-age=31536000,
immutable`), because nothing of ours runs at serve time to add them.

**If you ever regenerate a day's image after it has been fetched, purge that URL.**
`immutable` means Cloudflare's edge keeps serving the old bytes for a year even
after R2 is overwritten. Normal operation never hits this — each day writes a new
key, and `ensureContent` reuses an existing object rather than overwriting it —
but a manual re-run does. Purge via the zone's Caching → Purge Cache → by URL.
To check what R2 actually holds, bypass the edge with a throwaway query string
(`?cb=1`), which R2 ignores but Cloudflare treats as a distinct cache key.

## Cutover

The invariant is that exactly one system sends per content-date. The safe seam is
**11:00–17:00 UTC**, after London's last catch-up and before the evening generate.

1. Deploy dark (`"crons": []`, `SEND_MODE: "test"`) and verify.
2. Confirm both of today's GitHub runs completed.
3. Comment out the `schedule:` blocks in both workflows and push — keep the files
   and their `workflow_dispatch` triggers as a rollback lever.
4. Set `SEND_MODE: "live"` and `"crons": ["0 * * * *"]`, then `npm run deploy`.
   Cron config takes up to 15 min to propagate.
5. Watch the evening generate and NZ send with `npm run tail`, then London next morning.

Rollback: redeploy with `"crons": []` and re-enable the GitHub schedules.

Once you have a few clean days, set `"workers_dev": false` and redeploy. Images
come off the bucket's domain, so that removes the Worker's public surface
entirely while cron keeps firing. Keep the `ADMIN_TOKEN` check in the code
regardless — it guards a route that can broadcast to both audiences, and the
flag could always be flipped back. Before relying on this, check whether
`wrangler dev --remote` can reach the deployed secrets; if it cannot, you would
need them in a local `.dev.vars` to run an ad-hoc admin action, which is a worse
trade than leaving the token-gated route up.

Do **not** rewrite git history to reclaim the ~13 MB of committed images — every
already-delivered email hotlinks a SHA-pinned blob. Deleting the files at `HEAD`
is fine; the point is that the repo stops growing.
