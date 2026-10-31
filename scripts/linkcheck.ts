// Fetches every org and program URL and reports links that no longer lead to the org. An
// HTTP check alone misses most of them: on 2026-10-31 a manual check found an org's domain
// serving gambling spam with a 200, a domain for sale, and redirects to renamed orgs. So a
// page that loads is also checked for:
// - parking or for-sale pages, by their wording, scripts and the hosts they redirect to
// - spam (gambling, pharma, adult), which is what a lapsed domain usually turns into
// - the org's or program's name, in the title or text; a page that never names it is
//   someone else's until a person checks
// - redirects, HTTP or meta refresh, to a host the org doesn't list in `hosts`
// A report, not a gate: it always exits 0, since sites go down for a day and bots get blocked.
//
// Usage: bun scripts/linkcheck.ts [--region ca-on] [--json out.json]

import { validate } from "./validate";

export type Kind =
	| "dead" // DNS, TLS, connection, timeout, 404, 410, 5xx: fix the record
	| "parked" // for sale or parked: the org lost the domain
	| "hijacked" // spam on the org's domain
	| "moved" // redirects to a host the org doesn't list
	| "unnamed" // loads, but never names the org or program: a person checks
	| "blocked" // refuses bots (401, 403, 429, 503, challenge page): a person checks
	| "ok";
export const TO_FIX: Kind[] = ["dead", "parked", "hijacked", "moved"];
export const TO_CHECK: Kind[] = ["unnamed", "blocked"];

// one URL to check, with every record that uses it
export type Target = {
	region: string; // subdivision of the org's HQ (ca-on)
	org: string;
	records: string[]; // org and program ids that link here
	url: string;
	names: string[]; // any of these on the page counts as naming the org
	hosts: string[]; // where the URL may end up
};
export type Fetched = {
	status?: number;
	finalUrl?: string;
	contentType?: string;
	html?: string;
	error?: string;
};
export type Finding = Target & { kind: Kind; note: string };

const SPAM = [
	"casino",
	"slot gacor",
	"slot online",
	"slot88",
	"gacor",
	"maxwin",
	"togel",
	"judi",
	"sportsbook",
	"poker online",
	"online betting",
	"sports betting",
	"bandar",
	"viagra",
	"cialis",
	"escort",
	"porn",
	"xxx",
	"replica watches",
	"payday loan",
];
const PARKED_TEXT = [
	"domain is for sale",
	"domain may be for sale",
	"domain for sale",
	"buy this domain",
	"make an offer on this domain",
	"this domain has expired",
	"domain has expired",
	"parked free",
	"parked domain",
	"this page is parked",
	"domain is parked",
];
// in the raw HTML, scripts included: parking pages are mostly scripts
const PARKED_HTML = [
	"sedoparking",
	"parkingcrew",
	"bodis.com",
	"parklogic",
	"afternic",
	"hugedomains",
	"undeveloped.com",
	'window.location.href="/lander"',
	"window.location.href = '/lander'",
	"/lander?",
];
const PARKING_HOSTS = [
	"dan.com",
	"afternic.com",
	"hugedomains.com",
	"sedo.com",
	"atom.com",
	"undeveloped.com",
	"domainmarket.com",
	"buydomains.com",
	"godaddy.com",
	"namecheap.com",
	"porkbun.com",
];
const STOPWORDS = new Set(["the", "and", "of", "for", "inc", "ltd", "llc"]);

const hostOf = (url: string) => {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
	} catch {
		return "";
	}
};
const bare = (host: string) => host.split("/")[0].replace(/^www\./, "");
const under = (host: string, base: string) =>
	host === base || host.endsWith(`.${base}`);

// lowercase words only, accents dropped, & read as "and", so names and pages compare as text
export function normalize(text: string): string {
	return text
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

// The page names `name` if it has the whole name, the name without spaces ("Scale Up
// Ventures" for ScaleUp Ventures), or two thirds of its words ("Founder Institute" for
// Founder Institute Toronto). Loose on purpose: a lapsed domain's new page shares no words
// with the org, and the spam and parking checks don't depend on this.
export function mentions(text: string, name: string): boolean {
	const page = ` ${normalize(text)} `;
	const n = normalize(name);
	if (!n) return false;
	if (page.includes(` ${n} `)) return true;
	if (n.length >= 6 && page.replace(/ /g, "").includes(n.replace(/ /g, ""))) {
		return true;
	}
	const words = n.split(" ").filter((w) => w.length > 1 && !STOPWORDS.has(w));
	const found = words.filter((w) => page.includes(` ${w} `)).length;
	return words.length > 1 && found >= Math.ceil((words.length * 2) / 3);
}

const decode = (s: string) =>
	s
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));

// title, site name, description and visible text; enough to tell whose page it is
export function readPage(html: string) {
	const title = decode(
		html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "",
	)
		.replace(/\s+/g, " ")
		.trim();
	const meta = [...html.matchAll(/<meta\s[^>]*>/gi)].map((m) => m[0]);
	const content = (pattern: RegExp) =>
		decode(
			meta
				.find((m) => pattern.test(m))
				?.match(/content\s*=\s*["']([^"']*)["']/i)?.[1] ?? "",
		);
	const siteName = content(/property\s*=\s*["']og:(site_name|title)["']/i);
	const description = content(/name\s*=\s*["']description["']/i);
	const refresh = content(/http-equiv\s*=\s*["']?refresh/i).match(
		/url\s*=\s*['"]?([^'";]+)/i,
	)?.[1];
	const body = decode(
		html
			.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
			.replace(/<!--[\s\S]*?-->/g, " ")
			.replace(/<[^>]+>/g, " "),
	)
		.replace(/\s+/g, " ")
		.trim();
	return { title, siteName, description, refresh, body };
}

export function classify(
	target: Target,
	page: Fetched,
): Omit<Finding, keyof Target> {
	if (page.error) return { kind: "dead", note: page.error };
	const status = page.status ?? 0;
	const html = page.html ?? "";
	const lower = html.toLowerCase();
	const challenge =
		/<title>\s*just a moment/i.test(html) || lower.includes("cf-chl");
	if ([401, 403, 429, 503].includes(status) || challenge) {
		return {
			kind: "blocked",
			note: challenge ? "bot challenge page" : `HTTP ${status}`,
		};
	}
	if (status >= 400) return { kind: "dead", note: `HTTP ${status}` };

	const allowed = [
		...target.hosts.map(bare),
		hostOf(target.url), // a program page may sit on another domain than the org
	];
	const final = page.finalUrl ?? target.url;
	const finalHost = hostOf(final);
	if (PARKING_HOSTS.some((h) => under(finalHost, h))) {
		return { kind: "parked", note: `redirects to ${finalHost}` };
	}

	const { title, siteName, description, refresh, body } = readPage(html);
	const text = normalize(`${title} ${siteName} ${description} ${body}`);
	const saysParked = PARKED_TEXT.find((p) => text.includes(normalize(p)));
	if (saysParked) return { kind: "parked", note: `page says "${saysParked}"` };
	const parkingScript = PARKED_HTML.find((p) => lower.includes(p));
	if (parkingScript) {
		return { kind: "parked", note: `parking page code (${parkingScript})` };
	}

	const named = target.names.some((n) =>
		mentions(`${title} ${siteName} ${description} ${body}`, n),
	);
	const spam = SPAM.filter((w) => ` ${text} `.includes(` ${w} `));
	if (spam.length >= 3 || (spam.length && !named)) {
		return {
			kind: "hijacked",
			note: `spam words (${spam.slice(0, 4).join(", ")})${named ? "" : "; doesn't name the org"}`,
		};
	}

	const away = (url: string) => {
		const h = hostOf(url);
		return h && !allowed.some((a) => under(h, a));
	};
	if (away(final)) return { kind: "moved", note: `redirects to ${final}` };
	if (refresh && URL.canParse(refresh.trim(), final)) {
		const to = new URL(refresh.trim(), final).href;
		if (away(to)) return { kind: "moved", note: `meta refresh to ${to}` };
	}

	if (page.contentType && !/html|text/i.test(page.contentType)) {
		return { kind: "ok", note: page.contentType.split(";")[0] };
	}
	if (!title && body.length < 100) {
		return {
			kind: "blocked",
			note: "no readable text (built with JavaScript?); open it in a browser",
		};
	}
	if (!named) {
		return {
			kind: "unnamed",
			note: `page never says ${target.names.slice(0, 2).join(" or ")}; title: "${title.slice(0, 80)}"`,
		};
	}
	return { kind: "ok", note: "" };
}

const UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 startup-ecosystem-linkcheck";
const MAX_HTML = 500_000;

export async function fetchPage(
	url: string,
	fetcher: typeof fetch = fetch,
	timeoutMs = 15_000,
): Promise<Fetched> {
	try {
		const res = await fetcher(url, {
			redirect: "follow",
			signal: AbortSignal.timeout(timeoutMs),
			headers: { "User-Agent": UA, Accept: "text/html,*/*" },
		});
		const contentType = res.headers.get("content-type") ?? "";
		const html = /html|text/i.test(contentType)
			? (await res.text()).slice(0, MAX_HTML)
			: "";
		return {
			status: res.status,
			finalUrl: res.url || url,
			contentType,
			html,
		};
	} catch (e: any) {
		const timedOut = e?.name === "TimeoutError" || e?.name === "AbortError";
		return {
			error: timedOut ? "timeout" : (e?.code ?? e?.message ?? String(e)),
		};
	}
}

// One target per distinct URL in an org, so a program that links to the org's homepage
// (most of the Toronto import) is fetched once and may name either.
export function targets(orgs: any[]): Target[] {
	const out: Target[] = [];
	for (const org of orgs) {
		const byUrl = new Map<string, Target>();
		const add = (url: string | undefined, id: string, names: string[]) => {
			if (!url) return;
			const t = byUrl.get(url) ?? {
				region: org.hq.city.split("-").slice(0, 2).join("-"),
				org: org.id,
				records: [],
				url,
				names: [org.name, ...(org.aliases ?? [])],
				hosts: org.hosts,
			};
			t.records.push(id);
			for (const n of names) if (!t.names.includes(n)) t.names.push(n);
			byUrl.set(url, t);
		};
		add(org.url, org.id, []);
		for (const p of org.programs) {
			add(p.url, p.id, [p.name, ...(p.aliases ?? [])]);
		}
		out.push(...byUrl.values());
	}
	return out;
}

export async function linkcheck(
	list: Target[],
	{
		fetcher = fetch,
		concurrency = 8,
		retryDelayMs = 2000,
	}: {
		fetcher?: typeof fetch;
		concurrency?: number;
		retryDelayMs?: number;
	} = {},
): Promise<Finding[]> {
	// filled by index, so the report keeps the targets' order whatever finishes first
	const results: Finding[] = new Array(list.length);
	let next = 0;
	const worker = async () => {
		while (next < list.length) {
			const i = next++;
			const t = list[i];
			let page = await fetchPage(t.url, fetcher);
			if (page.error || (page.status ?? 0) >= 500) {
				// one retry: a site down for a minute isn't a dead link
				await Bun.sleep(retryDelayMs);
				page = await fetchPage(t.url, fetcher);
			}
			results[i] = { ...t, ...classify(t, page) };
		}
	};
	await Promise.all(Array.from({ length: concurrency }, worker));
	return results;
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	const opt = (name: string) => {
		const i = args.indexOf(name);
		return i === -1 ? undefined : args[i + 1];
	};
	const region = opt("--region");
	const result = validate();
	if (result.errors.length) {
		console.error("data has errors; run bun run validate");
		process.exit(1);
	}
	const list = targets(result.orgs).filter(
		(t) => !region || t.region === region,
	);
	const findings = await linkcheck(list);
	const by = (kinds: Kind[]) => findings.filter((f) => kinds.includes(f.kind));
	console.log(
		`${list.length} links: ${by(["ok"]).length} ok, ${by(TO_FIX).length} to fix, ${by(TO_CHECK).length} to check by hand`,
	);
	for (const f of [...by(TO_FIX), ...by(TO_CHECK)]) {
		console.log(
			`${f.kind.padEnd(9)} ${f.records.join(", ")}  ${f.url}  (${f.note})`,
		);
	}
	const out = opt("--json");
	if (out) await Bun.write(out, `${JSON.stringify(findings, null, "\t")}\n`);
	process.exit(0); // pooled sockets can otherwise hold the process open
}
