// One-off import of the Toronto map's CSV (getqatalyst.com/toronto-startup-ecosystem) into
// one org file per row under data/orgs/ca/on/toronto/. Kept so the conversion can be read
// and re-run; once moderators start editing the files, the files are the source of truth.
//
// Every value this script has to guess (program types, stages, audiences; the category of
// "lab" rows; parents inferred from shared hosts; descriptions with dates or amounts) is
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
const OUT = join(import.meta.dir, "../../data/orgs/ca/on/toronto");

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
// the org whose homepage is the bare host, for rows that sit under it
const rootOrg = new Map<string, string>();
rows.forEach((r, i) => {
	if (isRoot(urls[i])) rootOrg.set(urls[i].hostname, slug(r.name));
});

const display: Record<string, { scale: string }> = {};
mkdirSync(OUT, { recursive: true });

rows.forEach((r, i) => {
	const url = urls[i];
	const id = slug(r.name);
	const review: string[] = [];

	// one host belongs to one org: a shared host gets the row's path appended
	const shared = (hostCount.get(url.hostname) ?? 0) > 1;
	const host =
		shared && !isRoot(url)
			? `${url.hostname}${url.pathname.replace(/\/$/, "")}`
			: url.hostname;
	const parent = shared && !isRoot(url) ? rootOrg.get(url.hostname) : undefined;
	if (parent) review.push("parent");

	const cat = r.category === "lab" ? LAB[r.name] : CATEGORY[r.category];
	if (!cat)
		throw new Error(`${r.name}: no category mapping for "${r.category}"`);
	if (r.category === "lab") review.push("cats");
	if (/\b(19|20)\d{2}\b|\$/.test(r.desc)) review.push("desc"); // dates and amounts go stale

	const hq: Record<string, unknown> = { city: CITY };
	if (r.hood) hq.area = r.hood;
	if (r.lat && r.lng && r.citywide !== "TRUE") {
		hq.lat = Number(r.lat);
		hq.lng = Number(r.lng);
		if (r.confidence === "approx") hq.approx = true;
	}

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
				access: ACCESS[r.access],
				fee: r.cost === "free" ? "free" : "fee",
				review: ["name", "types", "stages", "audiences"],
			},
		],
	};

	const header =
		"# Imported from the getqatalyst.com Toronto map (Oct 2026). Fields under `review:` are\n" +
		"# first guesses; confirm them against the org's own site, then remove them from the list.\n";
	writeFileSync(
		join(OUT, `${id}.yml`),
		header + stringify(org, { lineWidth: 0 }),
	);
	display[id] = { scale: r.scale };
});

if (displayPath) writeFileSync(displayPath, stringify(display));
console.log(`wrote ${rows.length} orgs to ${OUT}`);
