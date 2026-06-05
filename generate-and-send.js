import { writeFileSync } from 'node:fs';
import { HfInference } from '@huggingface/inference';
import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;
const SENDER_EMAIL = process.env.SENDER_EMAIL;

const isFetchImageMode = process.argv[2] === '--fetch-image';

if (!isFetchImageMode && (!RESEND_API_KEY || !RESEND_AUDIENCE_ID || !SENDER_EMAIL)) {
	console.error(
		"Missing required environment variables: RESEND_API_KEY, RESEND_AUDIENCE_ID, SENDER_EMAIL",
	);
	process.exit(1);
}

const resend = isFetchImageMode ? null : new Resend(RESEND_API_KEY);

const PROMPTS = [
	"A single Minion sitting cross-legged on a lily pad, soft watercolour painting style, muted pastels, misty Japanese pond at dawn, reflections in still water, meditative mood",
	"A Minion as a hard-boiled detective in a rain-soaked noir city, bold black ink outlines, high contrast, 1940s comic panel composition, deep shadow, single yellow street lamp",
	"A Minion in a full NASA spacesuit on the lunar surface, aged film grain texture, desaturated palette, Earth hanging in black sky, iconic Apollo-era photograph aesthetic",
	"A Minion riding an enormous cresting ocean wave, ukiyo-e woodblock print style, Hokusai-inspired, flat graphic colour fields, foam spray as white negative space, Mount Fuji in the background",
	"A Minion punching the air in triumph, Roy Lichtenstein pop art style, halftone dot pattern, primary colours only, bold black outlines, empty speech bubble",
	"A Minion seated at a candlelit desk reading a massive dusty tome, Rembrandt oil painting style, dramatic chiaroscuro lighting, dark warm background, rich earthy tones",
	"A Minion hero standing on a pixel-art castle battlement at sunset, classic SNES RPG style, limited 16-colour palette, chunky pixels, tiny stars beginning to appear",
	"A Minion lounging on the deck of a 1930s ocean liner, Art Deco travel poster style, geometric sunburst border, gold and teal palette, streamline moderne aesthetic",
	"A Minion caught mid-sneeze, detailed graphite pencil sketch, cross-hatching and fine linework, white paper texture, artist study composition, annotations around the figure",
	"A Minion in a neon-lit cyberpunk alley, holographic advertisements reflected on wet pavement, magenta and cyan light, high contrast, cinematic wide shot, rain falling",
	"A Minion depicted as a medieval knight in an illuminated manuscript border, gold leaf decoration, jewel-toned pigments, intricate floral margin illustrations, vellum texture",
	"A Minion reduced to pure geometric shapes, minimalist flat design, three-colour palette (yellow, blue, white), centered on off-white background, no outlines, Bauhaus spirit",
	"A Minion picnicking in a sun-drenched Monet-style garden, impressionist brushwork, dabs of pure colour, flower garden blurring into soft light, warm afternoon haze",
	"A Minion in a cornfield at night, vintage 1980s horror movie poster style, lurid colour printing, film grain, long dramatic shadow, ominous full moon behind silhouetted corn stalks",
	"A Minion dissected as a naturalist scientific illustration, Victorian specimen diagram style, detailed anatomical annotations, sepia ink on cream paper",
	"A Minion portrait as a large-scale graffiti mural on a crumbling brick wall, spray-paint drips, urban textures, photographed straight-on in daylight",
	"A Minion depicted in a Gothic cathedral stained glass window, lead caming outlines, jewel-saturated reds and blues, light streaming through, geometric tracery border",
	"A Minion harvesting enormous vegetables in an allotment, bold linocut print style, high-contrast black and white, rough carved texture, diagonal hatching for shadow",
	"A Minion pointing directly at the viewer, WW2 Uncle Sam poster style, flat graphic colour, patriotic red and yellow palette, heroic upward angle",
	"A Minion studying at a cluttered desk late at night, lo-fi aesthetic, warm lamp light, coffee cup, open books, cassette player, rain on window, cozy and slightly melancholy mood",
	"A Minion rendered as an engineering blueprint, white linework on Prussian blue background, dimension lines and callouts, isometric projection",
	"A Minion dissolving into an Abstract Expressionist action painting, gestural brushstrokes, paint drips and splashes, de Kooning influence, raw emotional energy, large canvas scale",
	"A Minion as a music festival headliner, Andy Warhol silk screen print style, repeated four-panel grid, each panel a different duo of vivid flat colours, high contrast",
	"A Minion striding forward carrying a blank banner, Soviet constructivist poster style, diagonal geometric composition, red and black palette",
	"A Minion baking a wildly over-decorated cake, cheerful children's picture book illustration, gouache-style flat colour, simple rounded shapes, clean white background, joyful chaos",
	"A Minion wearing a bowler hat standing in a Salvador Dali surrealist landscape, melting clocks, floating rocks, hyper-real rendering of an impossible scene, golden afternoon light",
	"A Minion as seen through a thermal infrared camera, heat map colour gradient from cool blue to hot white, scientific imagery aesthetic, black background, temperature scale bar",
	"A Minion hunting a dragon, medieval tapestry style, flat woven texture, muted wool colours, decorative woven border, Bayeux Tapestry composition",
	"A Minion standing still while a city moves around it in long-exposure light trails, streaks of car lights, star trails overhead, photorealistic composite photography",
	"A Minion dancing at a house party, risograph print style, deliberate colour misregistration, limited two-colour overlay (orange and teal), grainy ink texture, joyful loose linework",
];

const NZ_LOCALE = 'en-NZ';
const NZ_TZ = 'Pacific/Auckland';

function nzDayOfYear() {
	const now = new Date();
	const nzFormatter = new Intl.DateTimeFormat(NZ_LOCALE, { timeZone: NZ_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
	const [day, month, year] = nzFormatter.format(now).split('/').map(Number);
	const startOfYear = new Date(Date.UTC(year, 0, 1));
	const todayUtcMidnight = new Date(Date.UTC(year, month - 1, day));
	return Math.floor((todayUtcMidnight - startOfYear) / 86_400_000) + 1;
}

function getDailyPrompt() {
	return PROMPTS[nzDayOfYear() % PROMPTS.length];
}

async function fetchWithRetry(url, maxRetries = 3, options = {}) {
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
			if (response.status === 429 || response.status >= 500) {
				lastError = new Error(`HTTP ${response.status}`);
				continue;
			}
			throw new Error(`HTTP ${response.status} from ${url}`);
		} catch (err) {
			if (err.message.startsWith('HTTP ')) throw err; // non-retriable HTTP error
			// network-level error — log cause and retry
			lastError = err;
			console.warn(`Network error (attempt ${attempt + 1}): ${err.message}${err.cause ? ` — ${err.cause.message}` : ''}`);
		}
	}
	throw lastError;
}

async function getQuote() {
	const response = await fetch('https://zenquotes.io/api/random');
	if (!response.ok) throw new Error(`ZenQuotes error ${response.status}`);
	const [{ q: quote, a: author }] = await response.json();
	return { quote, author };
}

async function sendBroadcast(imageSrc, quote, author) {
	const html = `
    <div style="font-family: sans-serif; max-width: 700px; margin: 0 auto;">
      <img src="${imageSrc}" alt="Daily minion" style="width: 80%; border-radius: 8px; display: block; margin: 0 auto;" />
      <p style="font-size: 20px; color: #333; margin: 24px 0 8px;">"${quote}"</p>
      <p style="font-size: 14px; color: #888; margin: 0;">— ${author}</p>
    </div>
  `;

	const subject = `Good Morning — ${new Date().toLocaleDateString(NZ_LOCALE, { timeZone: NZ_TZ, weekday: "long", month: "long", day: "numeric" })}`;
	const testEmail = process.env.TEST_EMAIL;

	if (testEmail) {
		const { error } = await resend.emails.send({
			from: SENDER_EMAIL,
			to: testEmail,
			subject: `[TEST] ${subject}`,
			html,
		});
		if (error) throw new Error(`Resend error: ${error.message}`);
		console.log(`Test email sent to ${testEmail}`);
		return;
	}

	const { data, error } = await resend.broadcasts.create({
		audienceId: RESEND_AUDIENCE_ID,
		from: SENDER_EMAIL,
		subject,
		html,
		send: true,
	});

	if (error) throw new Error(`Resend broadcast error: ${error.message}`);
	return data;
}

if (isFetchImageMode) {
	const HF_TOKEN = process.env.HF_TOKEN;
	if (!HF_TOKEN) {
		console.error("Missing required environment variable: HF_TOKEN");
		process.exit(1);
	}
	try {
		const prompt = getDailyPrompt();
		console.log(`Generating image for prompt: ${prompt}`);
		const hf = new HfInference(HF_TOKEN);
		const blob = await hf.textToImage({
			model: 'black-forest-labs/FLUX.1-schnell',
			inputs: prompt,
		});
		const buffer = Buffer.from(await blob.arrayBuffer());
		writeFileSync('daily.jpg', buffer);
		console.log('Saved daily.jpg');
	} catch (err) {
		console.error("Error generating image:", err.message, err.cause ? `(${err.cause.message})` : '');
		process.exit(1);
	}
} else {
	try {
		const imageSrc = process.env.DAILY_IMAGE_URL;
		if (!imageSrc) throw new Error("Missing required environment variable: DAILY_IMAGE_URL");

		console.log(`Image: ${imageSrc}`);

		console.log("Fetching quote...");
		const { quote, author } = await getQuote();
		console.log(`Quote: "${quote}" — ${author}`);

		console.log("Sending email...");
		await sendBroadcast(imageSrc, quote, author);
	} catch (err) {
		console.error("Error:", err.message);
		process.exit(1);
	}
}
