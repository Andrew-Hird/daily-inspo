# daily-inspo

A GitHub Actions workflow that generates a daily AI landscape image using the Google Gemini API and emails it via Resend.

## How it works

1. A cron workflow runs every day at 8am UTC
2. It calls the Gemini `gemini-2.0-flash-preview-image-generation` model to generate a photorealistic golden-hour landscape
3. The image is sent as an inline HTML email via the Resend API

## Setup

### Prerequisites

- A GitHub repository with Actions enabled
- A [Google AI Studio](https://aistudio.google.com/) account (for the Gemini API key)
- A [Resend](https://resend.com/) account (for sending email)
- A verified sender domain/address in Resend

### GitHub Actions secrets

Add the following secrets under **Settings → Secrets and variables → Actions**:

| Secret | Description |
|---|---|
| `GEMINI_API_KEY` | Your Google AI Studio API key |
| `RESEND_API_KEY` | Your Resend API key |
| `SENDER_EMAIL` | The verified sender address (e.g. `inspo@yourdomain.com`) |
| `RECIPIENT_EMAIL` | The address to receive the daily image |

### Trigger manually

Go to **Actions → Daily AI Image → Run workflow** to send a test email immediately without waiting for the daily schedule.

### Change the schedule

Edit the `cron` value in [`.github/workflows/daily-image.yml`](.github/workflows/daily-image.yml). The current value `0 8 * * *` runs at 8:00 AM UTC every day. Use [crontab.guru](https://crontab.guru) to adjust it.

## Local testing

```bash
export GEMINI_API_KEY=...
export RESEND_API_KEY=...
export SENDER_EMAIL=you@example.com
export RECIPIENT_EMAIL=you@example.com

node generate-and-send.js
```

Requires Node 18 or later (uses native `fetch`).
