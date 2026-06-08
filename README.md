# daily-inspo

A GitHub Actions workflow that generates a daily AI minion image using HuggingFace (FLUX.1-schnell) and emails it with an inspirational quote via Resend.

## How it works

1. A cron workflow runs every day at 8am NZT (20:00 UTC)
2. It generates a unique daily image via [HuggingFace Inference API](https://huggingface.co/black-forest-labs/FLUX.1-schnell) (FLUX.1-schnell) — same image all day, new one each morning — and commits it to the repo
3. It fetches a random inspirational quote from [ZenQuotes](https://zenquotes.io)
4. The image and quote are sent as an HTML email via the Resend API

## Setup

### Prerequisites

- A GitHub repository with Actions enabled
- A [HuggingFace](https://huggingface.co/) account with an access token
- A [Resend](https://resend.com/) account
- A verified sender domain in Resend with SPF, DKIM, and DMARC configured

### GitHub Actions secrets

Add the following secrets under **Settings → Secrets and variables → Actions**:

| Secret | Description |
|---|---|
| `HF_TOKEN` | Your HuggingFace access token (for image generation) |
| `RESEND_API_KEY` | Your Resend API key |
| `RESEND_AUDIENCE_ID` | The ID of your Resend Audience (found in Resend → Audiences) |
| `SENDER_EMAIL` | The verified sender address (e.g. `hello@yourdomain.com`) |

### Trigger manually

Go to **Actions → Daily AI Image → Run workflow** to send a test email immediately.

### Change the schedule

Edit the `cron` value in [`.github/workflows/daily-image.yml`](.github/workflows/daily-image.yml). The current value `0 20 * * *` runs at 8:00 AM NZST (9:00 AM NZDT). Use [crontab.guru](https://crontab.guru) to adjust it.

## Local testing

Generate today's image (saved as `daily.jpg`):

```bash
npm install

export HF_TOKEN=...

node generate-and-send.js --fetch-image
```

Send a test email (to a single address instead of the full broadcast):

```bash
export RESEND_API_KEY=...
export SENDER_EMAIL=you@example.com
export DAILY_IMAGE_URL=https://...  # URL to an image
export TEST_EMAIL=you@example.com

node generate-and-send.js
```

Requires Node 24 or later (uses native `fetch`).
