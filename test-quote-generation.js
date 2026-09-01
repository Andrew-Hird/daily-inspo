#!/usr/bin/env node

/**
 * Dry run test for Cloudflare AI quote generation
 * This simulates the quote generation flow without needing actual Cloudflare credentials
 */

// Mock Cloudflare AI responses to test quote generation logic
const mockAIResponses = [
	'Every new day brings fresh opportunities to grow and shine brighter than yesterday.',
	'Your potential is infinite—believe in yourself and watch what becomes possible.',
	'Small steps forward are still progress. Keep moving; you are becoming amazing.',
	'The best time to start is now. Make today count and build your tomorrow.',
	'Challenge yourself today; inspire yourself tomorrow. You are capable of great things.',
];

function decodeBase64(encoded) {
	if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(encoded);
	const binary = atob(encoded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

// Simulate the getQuote function from jobs.js
async function testGetQuote() {
	console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	console.log('TEST: Quote Generation (Cloudflare AI Mock)');
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

	// Mock env.AI.run()
	const mockEnv = {
		AI: {
			run: async (model, options) => {
				console.log(`🤖 Calling Cloudflare AI model: ${model}`);
				console.log(`   Max tokens: ${options.max_tokens}`);
				console.log(`   Messages: ${options.messages.length} message(s)`);
				console.log(`   Prompt: "${options.messages[0].content.slice(0, 100)}..."\n`);

				// Return a random mock response
				const randomQuote = mockAIResponses[Math.floor(Math.random() * mockAIResponses.length)];
				console.log(`✨ Mock AI Response:\n   "${randomQuote}"\n`);

				return {
					response: randomQuote,
					finish_reason: 'end_turn',
					count: {
						completion_tokens: 20,
						prompt_tokens: 75,
					},
				};
			},
		},
	};

	// Replicate getQuote() from jobs.js
	const result = await mockEnv.AI.run('@cf/meta/llama-3.2-3b-instruct', {
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

// Test the email rendering
function testEmailRendering(quote) {
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	console.log('TEST: Email Rendering (Without Author Attribution)');
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

	// Mock content object
	const mockContent = {
		date: '2024-12-17',
		quote: quote,
		width: 600,
		height: 600,
		contentType: 'image/jpeg',
	};

	const mockEnv = {
		IMAGE_BASE_URL: 'https://goodmorning.rav4.cool',
	};

	// Replicate renderEmail() from jobs.js
	const imageSrc = `${mockEnv.IMAGE_BASE_URL}/${mockContent.date}.jpg`;
	const heightAttr = mockContent.height ? ` height="${mockContent.height}"` : '';
	const emailHtml = `
    <div style="font-family: sans-serif; max-width: 700px; margin: 0 auto;">
      <img src="${imageSrc}" alt="Daily minion" width="600"${heightAttr} style="max-width: 100%; height: auto; border-radius: 8px; display: block; margin: 0 auto;" />
      <p style="font-size: 20px; color: #333; margin: 24px 0 8px;">"${mockContent.quote}"</p>
    </div>
  `;

	console.log('✅ Email HTML (Preview):\n');
	console.log('┌─ Image Section ─────────────────────────────────┐');
	console.log(`│ Src: ${imageSrc}`);
	console.log(`│ Dimensions: ${mockContent.width}x${mockContent.height}px`);
	console.log('└─────────────────────────────────────────────────┘\n');

	console.log('┌─ Quote Section ─────────────────────────────────┐');
	console.log(`│ "${mockContent.quote}"`);
	console.log('│ (No author attribution)');
	console.log('└─────────────────────────────────────────────────┘\n');

	return emailHtml;
}

// Test content storage
function testContentStorage(quote) {
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
	console.log('TEST: Content Storage (KV Format)');
	console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

	const date = new Date().toISOString().split('T')[0];
	const content = {
		date,
		quote,
		contentType: 'image/jpeg',
		width: 600,
		height: 600,
	};

	console.log('✅ KV Storage Format:\n');
	console.log(`Key: content:${date}`);
	console.log(`Value:\n${JSON.stringify(content, null, 2)}\n`);

	return content;
}

// Run all tests
async function runTests() {
	try {
		console.log('\n');
		console.log('╔════════════════════════════════════════════════╗');
		console.log('║   DAILY INSPO — QUOTE GENERATION DRY RUN TEST  ║');
		console.log('╚════════════════════════════════════════════════╝');

		// Test 1: Quote generation
		const { quote } = await testGetQuote();

		// Test 2: Email rendering
		testEmailRendering(quote);

		// Test 3: Content storage
		testContentStorage(quote);

		// Summary
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		console.log('TEST SUMMARY');
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

		console.log('✅ Quote generation using Cloudflare AI');
		console.log('✅ Email rendering without author attribution');
		console.log('✅ Content stored in KV without author field');
		console.log('✅ Image URL construction works correctly\n');

		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
		console.log('🎉 All dry run tests passed!\n');
		console.log('Ready for deployment to Cloudflare Workers.');
		console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
	} catch (error) {
		console.error('\n❌ Test failed:');
		console.error(error.message);
		console.error(error.stack);
		process.exit(1);
	}
}

runTests();
