// The content day is always anchored to NZ, regardless of which region is being
// emailed: it keys the prompt rotation and identifies the day's image and quote.
// en-CA formats as YYYY-MM-DD, so the parsed field order is not locale-dependent.
const CONTENT_LOCALE = 'en-CA';
const CONTENT_TZ = 'Pacific/Auckland';

// Every formatter is built once, at module scope. Constructing an Intl formatter
// pulls in ICU data and costs milliseconds; module initialisation runs under the
// 400ms startup budget rather than the 10ms per-invocation CPU limit, so building
// these lazily inside a handler would be the single easiest way to blow the limit.
const nzDateFormat = new Intl.DateTimeFormat(CONTENT_LOCALE, {
	timeZone: CONTENT_TZ,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
});

// hourCycle h23 rather than hour12:false — the latter renders midnight as "24"
// under some locales, which would silently break the hour comparisons.
const hourFormat = timeZone => new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' });
const subjectFormat = (locale, timeZone) => new Intl.DateTimeFormat(locale, { timeZone, weekday: 'long', month: 'long', day: 'numeric' });

export const REGIONS = [
	{
		key: 'nz',
		hour: hourFormat('Pacific/Auckland'),
		subject: subjectFormat('en-NZ', 'Pacific/Auckland'),
		audienceEnvVar: 'RESEND_AUDIENCE_ID_NZ',
		healthcheck: 'inspo-send-nz',
		generates: true,
	},
	{
		key: 'london',
		hour: hourFormat('Europe/London'),
		subject: subjectFormat('en-GB', 'Europe/London'),
		audienceEnvVar: 'RESEND_AUDIENCE_ID_LONDON',
		healthcheck: 'inspo-send-london',
		generates: false,
	},
];

export const NZ = REGIONS.find(region => region.generates);

export function nzDateKey(now) {
	return nzDateFormat.format(now);
}

export function nzDayOfYear(now) {
	const [year, month, day] = nzDateKey(now).split('-').map(Number);
	const startOfYear = new Date(Date.UTC(year, 0, 1));
	const todayUtcMidnight = new Date(Date.UTC(year, month - 1, day));
	return Math.floor((todayUtcMidnight - startOfYear) / 86_400_000) + 1;
}

export function localHour(region, now) {
	return Number(region.hour.format(now));
}

export function subjectFor(region, now) {
	return `Good Morning — ${region.subject.format(now)}`;
}
