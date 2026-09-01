import { PROMPTS, MINION_DESCRIPTOR } from './prompts.js';
import { NZ, nzDayOfYear, subjectFor } from './time.js';

const RESEND_API = 'https://api.resend.com';
const HEALTHCHECK_API = 'https://hc-ping.com';
const IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const SENT_TTL_SECONDS = 604_800;
// Objects are public and served straight off the bucket's custom domain, so the
// key IS the public path. A date key gives each day a distinct immutable URL,
// which is what defeats Gmail's per-URL image cache.
const imageKey = date => `${date}.jpg`;

export async function fetchWithRetry(url, maxRetries = 3, options = {}) {
	let lastError;
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		if (attempt > 0) {
			const delayMs = 1000 * 2 ** (attempt - 1);
			console.warn(`Retry attempt ${attempt} after ${delayMs}ms...`);
			await new Promise(resolve => setTimeout(resolve, delayMs));
		}
		try {
			const response = await fetch(url, options);
			if (response.ok) return response;
			const body = await response.text().catch(() => '');
			if (response.status === 429 || response.status >= 500) {
				lastError = new Error(`HTTP ${response.status} from ${url}: ${body.slice(0, 200)}`);
				continue;
			}
			// Flagged rather than detected by message prefix: retriable and fatal
			// errors otherwise read identically and get misclassified.
			throw Object.assign(new Error(`HTTP ${response.status} from ${url}: ${body.slice(0, 200)}`), { fatal: true });
		} catch (err) {
			if (err.fatal) throw err;
			lastError = err;
			console.warn(`Network error (attempt ${attempt + 1}): ${err.message}${err.cause ? ` — ${err.cause.message}` : ''}`);
		}
	}
	throw lastError;
}

export function getDailyPrompt(now) {
	return `${PROMPTS[nzDayOfYear(now) % PROMPTS.length]}. ${MINION_DESCRIPTOR}`;
}

export async function getQuote(env) {
	const result = await env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
		messages: [
			{
				role: 'user',
				content: `Generate a unique, uplifting inspirational quote. 
The quote should:
- Be concise (ideally 1-2 sentences, max 20 words)
- Inspire positivity and motivation
- Be original and thoughtful
- Stand alone without needing an author attribution

Output only the quote text, nothing else.`,
			},
		],
		max_tokens: 100,
	});
	const quote = (result.response || '').trim();
	if (!quote) {
		throw new Error('Cloudflare AI returned empty quote.');
	}
	return { quote };
}

function decodeBase64(encoded) {
	if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(encoded);
	const binary = atob(encoded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

// Replaces sharp().metadata(). Reads dimensions straight out of the container
// header so the email's height attribute and the served Content-Type agree even
// if the model starts returning a different format.
export function imageInfo(bytes) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (bytes.length > 24 && view.getUint32(0) === 0x89504e47) {
		return { contentType: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
	}
	if (bytes.length > 4 && view.getUint16(0) === 0xffd8) {
		let offset = 2;
		while (offset + 9 < bytes.length && view.getUint8(offset) === 0xff) {
			const marker = view.getUint8(offset + 1);
			// SOF0/1/2/3/5..7/9..11/13..15 carry the frame dimensions; c4, c8 and cc
			// are Huffman/arithmetic tables that happen to sit in the same range.
			if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
				return { contentType: 'image/jpeg', height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
			}
			offset += 2 + view.getUint16(offset + 2);
		}
		return { contentType: 'image/jpeg', width: 1024, height: 1024 };
	}
	return { contentType: 'image/jpeg', width: 1024, height: 1024 };
}

// sharp cannot run on Workers and a WASM encoder would blow the 10ms CPU limit,
// so resizing happens in the Images binding, outside the CPU budget. A failure
// here must never cost us the day's email — we just ship a larger image.
export async function shrink(bytes, env) {
	if (!env.IMAGES) {
		console.warn('No IMAGES binding — serving the generated image unresized.');
		return bytes;
	}
	try {
		// input() takes a ReadableStream. Handing it an ArrayBuffer instead fails
		// deep inside the binding with "Cannot read properties of undefined
		// (reading 'font')", which reads like a bug rather than a type error.
		const result = await env.IMAGES.input(new Response(bytes).body)
			.transform({ width: 600 })
			.output({ format: 'image/jpeg', quality: 70 });
		const shrunk = new Uint8Array(await result.response().arrayBuffer());
		console.log(`Images transform: ${bytes.length} -> ${shrunk.length} bytes`);
		return shrunk;
	} catch (err) {
		console.warn(`Images transform failed (${err.message}) — serving unresized.`);
		return bytes;
	}
}

export async function generateImage(prompt, env) {
	const result = await env.AI.run(IMAGE_MODEL, { prompt });
	const bytes = await shrink(decodeBase64(result.image), env);
	return { bytes, ...imageInfo(bytes) };
}

export async function ensureContent(date, now, env) {
	const existing = await readContent(date, env);
	if (existing) return existing;

	const key = imageKey(date);
	// head() transfers no body and is strongly consistent, so a retry after a
	// failed quote fetch reuses the image instead of paying to regenerate it.
	const existingImage = await env.BUCKET.head(key);
	let meta;
	if (existingImage) {
		console.log(`Reusing ${key} from an earlier attempt.`);
		meta = {
			contentType: existingImage.httpMetadata?.contentType ?? 'image/jpeg',
			width: Number(existingImage.customMetadata?.width) || null,
			height: Number(existingImage.customMetadata?.height) || null,
			bytes: existingImage.size,
		};
	} else {
		const prompt = getDailyPrompt(now);
		console.log(`Generating image for prompt: ${prompt}`);
		const { bytes, contentType, width, height } = await generateImage(prompt, env);
		// Cache headers are baked into the object, because nothing of ours runs at
		// serve time to add them — Cloudflare hands the object straight to the
		// mail client.
		await env.BUCKET.put(key, bytes, {
			httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
			customMetadata: { width: String(width), height: String(height) },
		});
		meta = { contentType, width, height, bytes: bytes.length };
		console.log(`Stored ${key} (${meta.bytes} bytes, ${width}x${height})`);
	}

	console.log('Fetching quote...');
	const { quote, author } = await getQuote(env);

	// content: is the readiness marker and is written last, so a failed quote
	// fetch never leaves a half-ready day that the send path would trust.
	const content = { date, quote, author, contentType: meta.contentType, width: meta.width, height: meta.height };
	await env.INSPO.put(`content:${date}`, JSON.stringify(content));
	console.log(`Stored content:${date}: "${quote}" — ${author}`);
	return content;
}

export function imageUrl(date, env) {
	return `${env.IMAGE_BASE_URL}/${imageKey(date)}`;
}

export function headImage(date, env) {
	return env.BUCKET.head(imageKey(date));
}

export function readContent(date, env) {
	return env.INSPO.get(`content:${date}`, 'json');
}

export function renderEmail(content, env) {
	const imageSrc = imageUrl(content.date, env);
	const heightAttr = content.height ? ` height="${content.height}"` : '';
	const authorLine = content.author ? `<p style="font-size: 14px; color: #888; margin: 0;">— ${content.author}</p>` : '';
	return `
    <div style="font-family: sans-serif; max-width: 700px; margin: 0 auto;">
      <img src="${imageSrc}" alt="Daily minion" width="600"${heightAttr} style="max-width: 100%; height: auto; border-radius: 8px; display: block; margin: 0 auto;" />
      <p style="font-size: 20px; color: #333; margin: 24px 0 8px;">"${content.quote}"</p>
      ${authorLine}
    </div>
  `;
}

// The one send path. runHour, the catch-up path and the admin route all come
// through here; nothing calls sendBroadcast directly.
export async function deliver(region, content, now, env) {
	if (env.SEND_MODE === 'off') {
		console.log(`SEND_MODE=off — not sending ${region.key}.`);
		return { skipped: true };
	}
	if (env.SEND_MODE === 'test') return sendTest(region, content, now, env);
	if (env.SEND_MODE === 'live') return sendBroadcast(region, content, now, env);
	throw new Error(`Unknown SEND_MODE "${env.SEND_MODE}" — expected off, test or live.`);
}

async function sendBroadcast(region, content, now, env) {
	// Asserted here as well as in deliver(), so that no future call path can
	// reach an audience while the worker is in test mode.
	if (env.SEND_MODE !== 'live') throw new Error(`Refusing to broadcast: SEND_MODE is "${env.SEND_MODE}".`);
	const audienceId = env[region.audienceEnvVar];
	if (!audienceId) throw new Error(`Missing ${region.audienceEnvVar}.`);

	const subject = subjectFor(region, now);
	console.log(`Broadcasting ${region.key}: ${subject}`);
	const response = await fetchWithRetry(`${RESEND_API}/broadcasts`, 3, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.RESEND_API_KEY}`,
			'Content-Type': 'application/json',
			// Create-and-send is a single call, so one key makes the whole
			// broadcast replay-safe — including when a response is lost and the
			// next hour retries a send that already went out.
			'Idempotency-Key': `inspo-${region.key}-${content.date}`,
		},
		// Audiences were renamed to Segments, but the two fields are mutually
		// exclusive: sending both is a fatal 422 ("Either `segment_id` or
		// `audience_id` may be provided, but not both"). RESEND_AUDIENCE_ID_* holds
		// ids from Resend → Audiences, so audience_id is the one that matches them.
		body: JSON.stringify({
			audience_id: audienceId,
			from: env.SENDER_EMAIL,
			subject,
			html: renderEmail(content, env),
			send: true,
		}),
	});
	const { id } = await response.json();
	console.log(`Broadcast ${region.key} created: ${id}`);
	return { broadcastId: id };
}

// The recipient is deliberately not a parameter: a test send can only ever reach
// TEST_EMAIL, so there is no address to mistype and no way to use the admin
// route to mail anyone else.
export async function sendTest(region, content, now, env) {
	if (!env.TEST_EMAIL) throw new Error('Missing TEST_EMAIL — refusing to send in test mode.');
	const subject = `[TEST] ${subjectFor(region, now)}`;
	console.log(`Test send (${region.key}) to ${env.TEST_EMAIL}: ${subject}`);
	const response = await fetchWithRetry(`${RESEND_API}/emails`, 3, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.RESEND_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			from: env.SENDER_EMAIL,
			to: [env.TEST_EMAIL],
			subject,
			html: renderEmail(content, env),
		}),
	});
	const { id } = await response.json();
	return { testEmailId: id, test: true };
}

export function wasSent(region, date, env) {
	return env.INSPO.get(`sent:${region.key}:${date}`, 'json');
}

export async function markSent(region, date, result, env) {
	// A test send must never suppress the real broadcast for the same day.
	if (result.test || result.skipped) return;
	const record = { broadcastId: result.broadcastId, at: new Date().toISOString() };
	await env.INSPO.put(`sent:${region.key}:${date}`, JSON.stringify(record), { expirationTtl: SENT_TTL_SECONDS });
}

export async function ping(env, slug, { fail = false, body = '' } = {}) {
	if (!env.HEALTHCHECK_PING_KEY) return;
	// create=1 auto-provisions the check on its first ping. Without it healthchecks
	// 404s an unknown slug, and since a 404 is a perfectly good HTTP response the
	// monitoring would silently never exist — so the status gets checked too.
	const url = `${HEALTHCHECK_API}/${env.HEALTHCHECK_PING_KEY}/${slug}${fail ? '/fail' : ''}?create=1`;
	try {
		const response = await fetch(url, { method: 'POST', body });
		if (!response.ok) console.warn(`Healthcheck ping ${slug} returned HTTP ${response.status}.`);
	} catch (err) {
		console.warn(`Healthcheck ping failed: ${err.message}`);
	}
}

export { NZ };
