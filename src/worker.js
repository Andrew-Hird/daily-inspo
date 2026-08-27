import { REGIONS, NZ, nzDateKey, localHour, subjectFor } from './time.js';
import { deliver, ensureContent, headImage, imageUrl, ping, readContent, sendTest, shrink, wasSent, markSent } from './jobs.js';

const GENERATE_HOUR = 7;

// The catch-up window must not run past local hour 10. Content is keyed by the NZ
// date, which rolls over at 11:00 UTC (NZDT) / 12:00 UTC (NZST), so a London send
// at local hour 11 would look up tomorrow's key, find nothing, and silently skip.
const SEND_HOURS = [8, 9, 10];
const LAST_SEND_HOUR = SEND_HOURS[SEND_HOURS.length - 1];

// Pure: no env, no I/O. Generating an hour before the first send buys a free
// retry: if 07:00 fails, the 08:00 send regenerates before anyone notices. That
// gap originally also covered KV's eventual consistency, back when the image
// lived in KV — R2 is strongly consistent, so the retry hour is the whole
// justification now.
export function plan(now) {
	const actions = [];
	for (const region of REGIONS) {
		const hour = localHour(region, now);
		if (region.generates && hour === GENERATE_HOUR) actions.push({ region, action: 'generate', hour });
		if (SEND_HOURS.includes(hour)) actions.push({ region, action: 'send', hour, last: hour === LAST_SEND_HOUR });
	}
	return actions;
}

// The healthcheck means "today's content is ready", not "the 07:00 slot ran", so
// it is pinged wherever content is successfully produced — including the send
// path's self-heal. Otherwise a day that recovered at 08:00 would still trip the
// missed-ping alert.
async function produceContent(date, now, env) {
	const content = await ensureContent(date, now, env);
	await ping(env, 'inspo-generate');
	return content;
}

async function runSend(region, date, now, env, { last = false } = {}) {
	if (await wasSent(region, date, env)) {
		console.log(`Already sent ${region.key} for ${date}.`);
		return { alreadySent: true };
	}

	let content = await readContent(date, env);
	if (!content) {
		if (region.generates) {
			// The 07:00 generate failed or never ran; self-heal rather than skip.
			console.warn(`No content for ${date} — generating now.`);
			content = await produceContent(date, now, env);
		} else if (env.ALLOW_LONDON_GENERATE === 'true' && !(await wasSent(NZ, date, env))) {
			// Only safe because NZ never sent: nobody can see two different images.
			console.warn(`No content for ${date} and NZ never sent — generating for London.`);
			content = await produceContent(date, now, env);
		} else {
			throw new Error(`No content for ${date} — nothing to send.`);
		}
	}

	const result = await deliver(region, content, now, env);
	await markSent(region, date, result, env);
	if (!result.skipped) await ping(env, region.healthcheck);
	return { ...result, last };
}

async function runHour(now, env) {
	const actions = plan(now);
	if (actions.length === 0) return;

	const date = nzDateKey(now);
	for (const { region, action, last } of actions) {
		try {
			if (action === 'generate') {
				await produceContent(date, now, env);
			} else {
				await runSend(region, date, now, env, { last });
			}
		} catch (err) {
			console.error(`${action} (${region.key}) failed for ${date}: ${err.stack || err.message}`);
			// Earlier hours in the window still have a retry ahead of them, so only
			// the final attempt is worth alerting on. A generate failure stays quiet
			// because the send path retries it; if it never succeeds, the missing
			// inspo-generate ping is what raises the alarm.
			if (action === 'send' && last) {
				await ping(env, region.healthcheck, { fail: true, body: err.stack || err.message });
			}
		}
	}
}

// Admin actions are acknowledged before they finish, so a rejection here would
// otherwise surface only as an unhandled rejection.
function background(label, promise) {
	return promise.catch(err => console.error(`admin ${label} failed: ${err.stack || err.message}`));
}

function describe(actions) {
	return actions.map(({ region, action, hour, last }) => ({ region: region.key, action, hour, last: Boolean(last) }));
}

async function status(now, env) {
	const date = nzDateKey(now);
	const [content, nz, london] = await Promise.all([
		readContent(date, env),
		wasSent(REGIONS[0], date, env),
		wasSent(REGIONS[1], date, env),
	]);
	const object = await headImage(date, env);
	return {
		now: now.toISOString(),
		date,
		sendMode: env.SEND_MODE,
		image: object ? { url: imageUrl(date, env), bytes: object.size, contentType: object.httpMetadata?.contentType } : null,
		content: content ? { quote: content.quote, author: content.author } : null,
		sent: { nz, london },
		plan: describe(plan(now)),
	};
}

function tokenMatches(provided, expected) {
	if (!expected) return false;
	const a = new TextEncoder().encode(provided);
	const b = new TextEncoder().encode(expected);
	if (a.byteLength !== b.byteLength) return false;
	return crypto.subtle.timingSafeEqual(a, b);
}

async function admin(url, env, ctx) {
	if (!tokenMatches(url.searchParams.get('token') ?? '', env.ADMIN_TOKEN)) {
		return new Response('Forbidden', { status: 403 });
	}

	const action = url.pathname === '/health' ? 'status' : url.searchParams.get('action');
	const at = url.searchParams.get('at');
	const now = at ? new Date(at) : new Date();
	if (Number.isNaN(now.getTime())) return Response.json({ error: `Invalid "at": ${at}` }, { status: 400 });

	const regionKey = url.searchParams.get('region');
	const region = REGIONS.find(candidate => candidate.key === regionKey);
	const date = nzDateKey(now);

	switch (action) {
		case 'plan':
			return Response.json({ at: now.toISOString(), date, plan: describe(plan(now)) });

		case 'status':
			return Response.json(await status(now, env));

		// Generation takes tens of seconds and proxies give up around 100s, so
		// mutating actions are acknowledged and continue in the background.
		case 'generate':
			ctx.waitUntil(background('generate', produceContent(date, now, env)));
			return Response.json({ accepted: 'generate', date }, { status: 202 });

		case 'send':
			if (!region) return Response.json({ error: 'Pass region=nz or region=london' }, { status: 400 });
			ctx.waitUntil(background('send', runSend(region, date, now, env, { last: false })));
			return Response.json({ accepted: 'send', region: region.key, date, sendMode: env.SEND_MODE }, { status: 202 });

		// Always a single email to TEST_EMAIL, whatever SEND_MODE says.
		case 'test': {
			if (!region) return Response.json({ error: 'Pass region=nz or region=london' }, { status: 400 });
			const content = await readContent(date, env);
			if (!content) return Response.json({ error: `No content for ${date} — run action=generate first.` }, { status: 409 });
			ctx.waitUntil(background('test', sendTest(region, content, now, env)));
			return Response.json({ accepted: 'test', region: region.key, date, subject: `[TEST] ${subjectFor(region, now)}` }, { status: 202 });
		}

		// Reports what the Images binding actually did to a stored object. Kept
		// because shrink() falls back to the unresized image on failure, by
		// design — so a broken transform is silent, and this is how you check.
		case 'probe': {
			if (!env.IMAGES) return Response.json({ images: false, reason: 'No IMAGES binding.' });
			const object = await env.BUCKET.get(`${date}.jpg`);
			if (!object) return Response.json({ error: `No ${date}.jpg in the bucket — run action=generate first.` }, { status: 409 });
			const source = new Uint8Array(await object.arrayBuffer());
			const shrunk = await shrink(source, env);
			return Response.json({
				images: shrunk.length !== source.length,
				original: source.length,
				transformed: shrunk.length,
			});
		}

		default:
			return Response.json({ error: 'Pass action=plan|status|generate|send|test|probe' }, { status: 400 });
	}
}

export default {
	// Awaited rather than handed to waitUntil: a swallowed failure would not show
	// up in the dashboard's cron invocation status, which is the visibility this
	// whole migration is for. scheduledTime rather than Date.now() so a cron
	// delivered at 08:47 still reads as hour 8.
	async scheduled(event, env) {
		await runHour(new Date(event.scheduledTime), env);
	},

	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		// /health is token-gated too: it returns exactly what ?action=status does,
		// including the day's quote before the email has gone out.
		if (url.pathname === '/health' || url.pathname === '/admin') return admin(url, env, ctx);
		return new Response('Not found', { status: 404 });
	},
};
