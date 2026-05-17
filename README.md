# daily-inspo

A GitHub Actions workflow that generates a daily AI minion image using Pollinations and emails it with an inspirational quote via Resend.

## How it works

1. A cron workflow runs every day at 8am NZT (20:00 UTC)
2. It generates a unique daily image via [Pollinations](https://pollinations.ai) — same image all day, new one each morning
3. It fetches a random inspirational quote from [ZenQuotes](https://zenquotes.io)
4. The image and quote are sent as an HTML email via the Resend API

## Setup

### Prerequisites

- A GitHub repository with Actions enabled
- A [Resend](https://resend.com/) account
- A verified sender domain in Resend with SPF, DKIM, and DMARC configured

### GitHub Actions secrets

Add the following secrets under **Settings → Secrets and variables → Actions**:

| Secret | Description |
|---|---|
| `RESEND_API_KEY` | Your Resend API key |
| `RESEND_AUDIENCE_ID` | The ID of your Resend Audience (found in Resend → Audiences) |
| `SENDER_EMAIL` | The verified sender address (e.g. `hello@yourdomain.com`) |

### Trigger manually

Go to **Actions → Daily AI Image → Run workflow** to send a test email immediately.

### Change the schedule

Edit the `cron` value in [`.github/workflows/daily-image.yml`](.github/workflows/daily-image.yml). The current value `0 20 * * *` runs at 8:00 AM NZST (9:00 AM NZDT). Use [crontab.guru](https://crontab.guru) to adjust it.

## Local testing

```bash
npm install

export RESEND_API_KEY=...
export RESEND_AUDIENCE_ID=...
export SENDER_EMAIL=you@example.com

node generate-and-send.js
```

Requires Node 18 or later (uses native `fetch`).
