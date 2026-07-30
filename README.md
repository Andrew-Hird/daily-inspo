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
