// One-off import of the Toronto map's CSV (getqatalyst.com/toronto-startup-ecosystem) into
// one org file per row, filed under the org's HQ city (two rows are based outside Toronto).
// Kept so the conversion can be read; once moderators start editing the files, the files are
// the source of truth. Re-running overwrites files but doesn't delete ones it no longer writes.
//
// Every value this script has to guess (program types, stages, audiences, reach; the category
// of "lab" rows; inferred parents; HQs of pinless rows; descriptions with digits or names) is
// listed under `review:` in that record, for the phase 3 research pass to confirm.
// `last_verified` is left out: nobody has checked these rows against the orgs' sites yet.
//
// Usage: bun scripts/import/toronto-csv.ts <toronto.csv> [--display <out.yml>]
//   --display writes each org's pin size (the CSV's `scale`) for the website, which keeps
//   that editorial ranking out of the open data.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "yaml";

const CITY = "ca-on-toronto";
const ORGS = join(import.meta.dir, "../../data/orgs");

type Row = Record<string, string>;

function parseCsv(text: string): Row[] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (c === '"') quoted = false;
			else field += c;
		} else if (c === '"') quoted = true;
		else if (c === ",") {
			row.push(field);
			field = "";
		} else if (c === "\n") {
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else if (c !== "\r") field += c;
	}
	if (field || row.length) rows.push([...row, field]);
	const [header, ...body] = rows.filter((r) => r.some(Boolean));
	return body.map((r) =>
		Object.fromEntries(header.map((k, i) => [k, r[i] ?? ""])),
	);
}

// ids are permanent, so drop parentheticals: "Creative Destruction Lab (CDL)" → creative-destruction-lab
const slug = (name: string) =>
	name
		.replace(/\([^)]*\)/g, "")
		.replace(/['’]/g, "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

// CSV category → org category; "lab" rows are mapped one by one below
const CATEGORY: Record<string, string> = {
	accelerator: "accelerator",
	vc: "vc",
	university: "university",
	government: "government",
	coworking: "coworking",
	community: "community",
	funder: "funder",
};

// the CSV's 13 "lab" rows mix three kinds of org
const LAB: Record<string, string> = {
	"Vector Institute": "research-institute",
	"Schwartz Reisman Institute": "research-institute",
	"Acceleration Consortium": "research-institute",
	"SickKids Research Institute": "research-institute",
	"UHN / Techna Institute": "research-institute",
	"Ontario Institute for Cancer Research": "research-institute",
	"Sunnybrook Research Institute": "research-institute",
	"Borealis AI": "corporate",
	"Layer 6 AI": "corporate",
	"NVIDIA Toronto AI Lab": "corporate",
	SpinUp: "university",
	"The BRIDGE": "university",
	"Biolabs Toronto": "coworking",
};

// first-guess program per org category, all flagged for review
const PROGRAM: Record<
	string,
	{ types: string[]; stages: string[]; audiences: string[] }
> = {
	accelerator: {
		types: ["accelerator"],
		stages: ["validate", "build"],
		audiences: ["founders"],
	},
	vc: {
		types: ["investment"],
		stages: ["build", "operate"],
		audiences: ["founders"],
	},
	university: {
		types: ["community"],
		stages: ["spark", "validate"],
		audiences: ["aspiring", "founders"],
	},
	government: {
		types: ["grant"],
		stages: ["build", "operate"],
		audiences: ["founders"],
	},
	coworking: {
		types: ["coworking"],
		stages: ["build"],
		audiences: ["founders"],
	},
	community: {
		types: ["community"],
		stages: ["spark", "validate"],
		audiences: ["aspiring", "founders"],
	},
	funder: {
		types: ["grant"],
		stages: ["validate", "build"],
		audiences: ["founders"],
	},
	"research-institute": {
		types: ["service"],
		stages: ["build"],
		audiences: ["founders"],
	},
	corporate: { types: ["service"], stages: ["build"], audiences: ["founders"] },
};

// ids are permanent; these read better than their slugs
const ID: Record<string, string> = { "Canada's Clean50": "clean50" };

// rows the CSV lists for Toronto although the org is based elsewhere (from their `hood` and desc)
const ELSEWHERE: Record<string, { city: string; open_to: string[] }> = {
	"Real Ventures": { city: "ca-qc-montreal", open_to: ["ca"] },
	"Ten Coves Capital": { city: "us-ct-darien", open_to: ["ca-on-toronto"] },
};
// pinless rows whose `hood` describes reach, not a neighbourhood
const NATIONWIDE = new Set(["National", "Pan-Canadian", "Online"]);

// parents the CSV implies in names and descriptions; inferred, so flagged for review
const PARENT: Record<string, string> = {
	"U of T Mississauga": "university-of-toronto",
	"U of T Scarborough": "university-of-toronto",
	SpinUp: "u-of-t-mississauga",
	"ICUBE UTM": "u-of-t-mississauga",
};

// descriptions that name people (the digit check below catches dates, amounts and addresses)
const NAMES_PEOPLE = new Set(["NVIDIA Toronto AI Lab"]);

// CSV access → vocab access ("selective" was folded into "application" in v0.3)
const ACCESS: Record<string, string> = {
	open: "open",
	selective: "application",
	invite: "invite",
	institution: "institutional",
	membership: "membership",
};

const args = process.argv.slice(2);
const csvPath = args[0];
const displayPath = args.includes("--display")
	? args[args.indexOf("--display") + 1]
	: undefined;
if (!csvPath) {
	console.error(
		"usage: bun scripts/import/toronto-csv.ts <toronto.csv> [--display <out.yml>]",
	);
	process.exit(1);
}

const rows = parseCsv(readFileSync(csvPath, "utf8"));
const urls = rows.map((r) => new URL(r.url));
const isRoot = (u: URL) => u.pathname === "/" || u.pathname === "";
const hostCount = new Map<string, number>();
for (const u of urls)
	hostCount.set(u.hostname, (hostCount.get(u.hostname) ?? 0) + 1);
const idOf = (name: string) => ID[name] ?? slug(name);
const ids = rows.map((r) => idOf(r.name));
const repeated = ids.filter((id, i) => ids.indexOf(id) !== i);
if (repeated.length)
	throw new Error(`two rows would share an id: ${repeated.join(", ")}`);

// the org whose homepage is the bare host, for rows that sit under it
const rootOrg = new Map<string, string>();
rows.forEach((r, i) => {
	if (isRoot(urls[i])) rootOrg.set(urls[i].hostname, idOf(r.name));
});

const display: Record<string, { scale: string }> = {};

rows.forEach((r, i) => {
	const url = urls[i];
	const id = ids[i];
	const review: string[] = [];
	const programReview = ["name", "types", "stages", "audiences"];

	// one host belongs to one org: a shared host gets the row's path appended
	const shared = (hostCount.get(url.hostname) ?? 0) > 1;
	const host =
		shared && !isRoot(url)
			? `${url.hostname}${url.pathname.replace(/\/$/, "")}`
			: url.hostname;
	const parent =
		PARENT[r.name] ??
		(shared && !isRoot(url) ? rootOrg.get(url.hostname) : undefined);
	if (parent) review.push("parent");

	const cat = r.category === "lab" ? LAB[r.name] : CATEGORY[r.category];
	if (!cat)
		throw new Error(`${r.name}: no category mapping for "${r.category}"`);
	if (r.category === "lab") review.push("cats");
	// digits catch dates, amounts, sizes and street addresses, all of which go stale
	if (/\d|\$/.test(r.desc) || NAMES_PEOPLE.has(r.name)) review.push("desc");

	// where the org is (hq) is a different fact from whom it serves (open_to)
	const elsewhere = ELSEWHERE[r.name];
	const pinned = Boolean(r.lat && r.lng && r.citywide !== "TRUE");
	const hq: Record<string, unknown> = { city: elsewhere?.city ?? CITY };
	if (pinned) {
		if (r.hood) hq.area = r.hood;
		hq.lat = Number(r.lat);
		hq.lng = Number(r.lng);
		if (r.confidence === "approx") hq.approx = true;
	} else {
		// no pin: the CSV's `hood` here says "National", "City-wide" and the like, not a place
		review.push("hq");
		programReview.push("open_to");
	}
	const openTo =
		elsewhere?.open_to ?? (NATIONWIDE.has(r.hood) ? ["ca"] : undefined);

	const guess = PROGRAM[cat];
	const org = {
		id,
		name: r.name,
		...(r.short && r.short !== r.name ? { aliases: [r.short] } : {}),
		url: r.url,
		hosts: [host],
		...(parent ? { parent } : {}),
		cats: [cat],
		hq,
		desc: r.desc,
		...(review.length ? { review } : {}),
		programs: [
			{
				id: `${id}-program`,
				name: r.name,
				url: r.url,
				types: guess.types,
				stages: guess.stages,
				audiences: guess.audiences,
				...(openTo ? { open_to: openTo } : {}),
				access: ACCESS[r.access],
				fee: r.cost === "free" ? "free" : "fee",
				review: programReview,
			},
		],
	};

	const header =
		"# Imported from the getqatalyst.com Toronto map (Oct 2026). Fields under `review:` are\n" +
		"# first guesses; confirm them against the org's own site, then remove them from the list.\n";
	const [country, sub, ...city] = String(hq.city).split("-");
	const dir = join(ORGS, country, sub, city.join("-"));
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, `${id}.yml`),
		header + stringify(org, { lineWidth: 0 }),
	);
	display[id] = { scale: r.scale };
});

if (displayPath) writeFileSync(displayPath, stringify(display));
console.log(`wrote ${rows.length} orgs under ${ORGS}`);
