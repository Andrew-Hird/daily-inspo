// Short, always-included description of the character. The old per-prompt
// descriptor only appeared in the prompts that drifted away from a Minion;
// with styles, scenes and compositions mixed freely, every prompt gets this.
export const MINION_LOOK = 'small yellow pill-shaped creature with one or two round goggles and blue denim overalls';

// Image prompts are built from independent parts, each picked on its own cycle.
// The list lengths (17, 13, 7) are distinct primes, so a given scene, style and
// composition combination repeats only every 17 x 13 x 7 = 1547 days.
// Keep the lengths coprime if you add or remove entries.

export const IMAGE_SCENES = [
	'sitting cross-legged on a lily pad in a still misty pond',
	'baking an over-decorated cake in a cluttered kitchen',
	'reading an enormous dusty book at a desk by candlelight',
	'riding a big cresting ocean wave on a surfboard',
	'waiting at a rainy bus stop holding a tiny umbrella',
	'picnicking in a flower garden with a wicker basket',
	'fixing a bicycle in a cluttered workshop',
	'standing on a castle battlement at sunset holding a small flag',
	'dancing at a lively house party',
	'harvesting enormous vegetables in an allotment',
	'stargazing through a telescope on a hilltop at night',
	'serving coffee behind the counter of a small cafe',
	'sailing a paper boat down a rain-filled gutter',
	'conducting a small orchestra of tiny instruments',
	'walking a very large friendly dog along a beach',
	'painting a landscape at an easel in a meadow',
	'sitting alone at the counter of an empty diner late at night',
];

export const IMAGE_STYLES = [
	'soft watercolour painting, muted pastels, visible paper texture',
	'bold linocut print, high contrast, rough carved texture',
	'claymation style, visible thumbprints in the clay, handmade miniature set',
	'ukiyo-e woodblock print, flat colour fields, fine ink outlines',
	'impressionist oil painting, dabs of bright colour, soft hazy light',
	'risograph print, two-colour overlay of orange and teal, grainy ink texture, slight colour misregistration',
	'engineering blueprint drawing, white linework on a Prussian blue background, dimension lines and callouts',
	'pixel art, classic SNES RPG style, limited 16-colour palette, chunky pixels',
	'layered paper-cut shadowbox, stacked cut-paper layers, soft shadows between layers',
	'medieval tapestry style, flat woven texture, muted wool colours, decorative woven border',
	'1950s picture book illustration, gouache, flat colour, simple rounded shapes',
	'detailed graphite pencil sketch, cross-hatching, fine linework, white paper texture',
	'stained glass window, lead outlines, jewel-saturated colour, geometric border',
];

export const IMAGE_COMPOSITIONS = [
	'centred figure, medium shot at eye level',
	'extreme close-up of the face and goggles',
	'wide shot with a small but clearly visible figure in a large scene',
	'three-quarter view from slightly above',
	'top-down aerial view',
	'low angle looking up, heroic framing',
	'off-centre figure with generous empty space on one side',
];

// Rotated daily so the quote model does not collapse onto the same garden/dawn
// metaphors when asked for a generic "inspirational quote".
export const QUOTE_LENSES = [
	'finishing a small, unglamorous task you have been avoiding',
	'asking for help without treating it as failure',
	'being a decent friend on an ordinary Tuesday',
	'starting again after a messy first attempt',
	'rest as something you earned, not something you must justify',
	'curiosity about a skill you are still bad at',
	'keeping a promise nobody else is watching',
	'laughing at yourself without putting yourself down',
	'doing the next honest thing, not the perfect thing',
	'noticing someone who usually goes unseen',
	'leaving work on time and meaning it',
	'trying again after you were sure you were done',
	'saying the kind thing while it still feels awkward',
	'making something with your hands, however clumsy',
	'choosing patience with a person who is slower than you',
	'walking into a room where you do not yet belong',
	'protecting an hour of attention from your phone',
	'admitting you were wrong and moving on',
	'showing up for a habit on a day with no mood for it',
	'giving credit away instead of keeping it',
	'being brave in a conversation, not a battlefield',
	'cooking a proper meal when takeaway would be easier',
	'keeping going when the audience is only you',
	'making space for someone else to shine',
	'learning the name of a neighbour',
	'choosing the kinder interpretation of a terse message',
	'putting the tool down when the work is good enough',
	'staying with a hard page of a book',
	'taking the first step of a trip you keep postponing',
	'being quietly useful without announcing it',
	'tidying something no one will ever notice',
	'listening without preparing your reply',
	'letting go of a small slight',
	'saying no to a request you would only resent',
	'returning something you borrowed, on time',
	'doing a job properly when a shortcut would never be noticed',
	'thanking someone specifically, not generically',
	'accepting a compliment without deflecting it',
	'sitting in a silence instead of rushing to fill it',
	'reaching out to a friend after a long gap',
	'maintaining something old instead of chasing something new',
	'waiting for a result you cannot hurry',
	'keeping a small tradition alive in a busy week',
];

export const QUOTE_VOICES = [
	// Confucian: measured, relational, practice over theory
	'in the manner of Confucius: calm, measured, about conduct and character. Favour a balanced contrast or a conditional ("The one who... finds...")',
	// Proverb: short, folk-wise, hard-won
	'as an old proverb: very short, plain words, a hard-won truth stated as fact',
	// Zen/Taoist: paradox, gentle reversal
	'in a Taoist or Zen spirit: a gentle paradox where the obvious thing turns out to be backwards',
	// Stoic: direct, steady, a little stern
	'in a Stoic tone: steady, direct, focused on what is within your control',
	'in the manner of Confucius: a teacher speaking to a student, brief and unhurried',
	// Yoda: rare, light touch
	'in the voice of Yoda: inverted sentence order ("Patience, a skill it is"), but still wise and readable, not a parody',
];
