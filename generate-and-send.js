const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL;
const SENDER_EMAIL = process.env.SENDER_EMAIL;

if (!RESEND_API_KEY || !RECIPIENT_EMAIL || !SENDER_EMAIL) {
	console.error(
		"Missing required environment variables: RESEND_API_KEY, RECIPIENT_EMAIL, SENDER_EMAIL",
	);
	process.exit(1);
}

const PROMPT = "A Minion in a random funny or dramatic pose, vibrant cartoon style, different colorful setting each day — could be an office, beach, space, jungle, kitchen, or anywhere unexpected, bright cheerful lighting, inspirational poster aesthetic, wide aspect ratio";

const NZ_LOCALE = 'en-NZ';
const NZ_TZ = 'Pacific/Auckland';

function nzDateSeed() {
	return new Date().toLocaleDateString(NZ_LOCALE, { timeZone: NZ_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).split('/').reverse().join('');
}

function getImageUrl() {
	return `https://image.pollinations.ai/prompt/${encodeURIComponent(PROMPT)}?seed=${nzDateSeed()}&nologo=true`;
}

async function getQuote() {
	const response = await fetch('https://zenquotes.io/api/random');
	if (!response.ok) throw new Error(`ZenQuotes error ${response.status}`);
	const [{ q: quote, a: author }] = await response.json();
	return { quote, author };
}

async function sendEmail(imageUrl, quote, author) {
	const html = `
    <div style="font-family: sans-serif; max-width: 700px; margin: 0 auto;">
      <img src="${imageUrl}" alt="Daily minion" style="width: 60%; border-radius: 8px; display: block; margin: 0 auto;" />
      <p style="font-size: 20px; color: #333; margin: 24px 0 8px;">"${quote}"</p>
      <p style="font-size: 14px; color: #888; margin: 0;">— ${author}</p>
    </div>
  `;

	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${RESEND_API_KEY}`,
		},
		body: JSON.stringify({
			from: SENDER_EMAIL,
			to: RECIPIENT_EMAIL.split(',').map((e) => e.trim()),
			subject: `Good Morning — ${new Date().toLocaleDateString(NZ_LOCALE, { timeZone: NZ_TZ, weekday: "long", month: "long", day: "numeric" })}`,
			html,
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Resend API error ${response.status}: ${body}`);
	}

	return await response.json();
}

try {
	const imageUrl = getImageUrl();
	console.log(`Image URL: ${imageUrl}`);

	console.log("Fetching quote...");
	const { quote, author } = await getQuote();
	console.log(`Quote: "${quote}" — ${author}`);

	console.log("Sending email via Resend...");
	const result = await sendEmail(imageUrl, quote, author);
	console.log(`Email sent successfully (id: ${result.id})`);
} catch (err) {
	console.error("Error:", err.message);
	process.exit(1);
}
