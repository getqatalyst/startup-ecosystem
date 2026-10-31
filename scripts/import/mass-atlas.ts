// Import of the Mass AI Atlas (github.com/holzerjm/mass-ai-atlas, data CC BY 4.0 by The Open
// Accelerator) into one org file per entry, filed under the org's HQ city. Kept so the
// conversion can be read; once moderators start editing the files, the files are the source of
// truth. Re-running overwrites the files it writes but doesn't delete ones it no longer writes.
//
// Every value this script has to guess (program name, types, stages, audiences, access, fee and
// reach; the category where the Atlas's is a mixed bag; inferred parents; HQs the Atlas doesn't
// pin to a city or the org's own site doesn't name; descriptions with digits, people's names or
// identity wording, or shortened here) is listed under `review:` in that record. The Atlas's `offers` and `stages` are only
// hints for the program guesses. `last_verified` is left out: nobody here has checked these
// records against the orgs' sites. The Atlas's `why`, `facts`, `badge` and deadlines are left
// out too: opinions, amounts and dates stay on the orgs' own pages.
//
// Usage: bun scripts/import/mass-atlas.ts [entities.yml path or URL]   (default: SOURCE)
// It stops before writing anything when an id is already taken or a city is missing from
// data/regions/index.yml (it prints the missing cities' entries), and after writing it checks
// that every kept entry landed with its name, URL and coordinates.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse, stringify } from "yaml";

// the Atlas at the commit this import was checked against; the link check below is for this one
const SOURCE =
	"https://raw.githubusercontent.com/holzerjm/mass-ai-atlas/7f8f377e67e4ef724c0e7173f8a40b4513afa9e1/data/entities.yml";
const ORGS = join(import.meta.dir, "../../data/orgs");
const REGIONS = join(import.meta.dir, "../../data/regions/index.yml");
const HEADER =
	"# Imported from the Mass AI Atlas by The Open Accelerator (CC BY 4.0), Oct 2026. Fields\n" +
	"# under `review:` are first guesses; confirm them against the org's own site, then remove them.\n";

type Entry = {
	id: string;
	name: string;
	cat: string;
	loc: string;
	lat: number;
	lng: number;
	approx?: boolean;
	url: string;
	desc: string;
	stages?: number[];
	offers: string[];
};

// ids are permanent, so drop parentheticals: "Kempner Institute (Harvard)" → kempner-institute
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

// Atlas categories left out whole: this dataset lists organizations that support founders
const SKIPPED_CATS: Record<string, string> = {
	startup:
		"AI companies, not organizations that support founders; vocab v0.3 has no category for them",
	// the link check also found aimlconference.com (MIT Sloan AI & ML Conference) parked for sale
	event:
		"conferences, festivals and hackathons; this import covers permanent orgs and their programs",
};

// Atlas category → org category
const CATEGORY: Record<string, string> = {
	university: "university",
	corporate: "corporate",
	vc: "vc",
	angel: "angel-network",
	accel: "accelerator",
	space: "coworking",
	community: "community",
	student: "community",
	gov: "government",
};
// Atlas categories that mix kinds our vocab tells apart (accelerators with incubators and
// university centres, labs with coworking, clubs), so the category is a guess
const MIXED_CATS = new Set(["accel", "space", "student"]);
// entries whose Atlas category doesn't describe them; flagged too
const CAT_OVERRIDE: Record<string, string> = {
	mghpcc: "research-institute", // a computing centre shared by universities, not an agency
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
	"angel-network": {
		types: ["investment"],
		stages: ["validate", "build"],
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
	"research-institute": {
		types: ["service"],
		stages: ["build"],
		audiences: ["founders"],
	},
	corporate: { types: ["service"], stages: ["build"], audiences: ["founders"] },
};

// Atlas `offers` → program types, added after the category's guess (talent has no program type)
const OFFER_TYPE: Record<string, string | undefined> = {
	funding: "investment",
	grants: "grant",
	space: "coworking",
	mentorship: "mentorship",
	community: "community",
	compute: "service",
	customers: "service",
	talent: undefined,
};

// Atlas stages: 1 Spark, 2 Validate, 3 Build (team, space, compute), 4 Fund (pre-seed and
// seed), 5 Scale. Ours: spark, validate, build (validated demand), operate (seed to A), scale.
const STAGE: Record<number, string[]> = {
	1: ["spark"],
	2: ["validate"],
	3: ["validate", "build"],
	4: ["build", "operate"],
	5: ["operate", "scale"],
};
const STAGE_ORDER = ["spark", "validate", "build", "operate", "scale"];

// the Atlas has no access or cost fields; first guesses by its category
const ACCESS: Record<string, string> = {
	university: "open",
	corporate: "invite",
	vc: "application",
	angel: "application",
	accel: "application",
	space: "membership",
	community: "open",
	student: "institutional",
	gov: "application",
};
const PAID = new Set(["space"]);

// ids are permanent; these read better than their slugs, or keep the chapter's city like
// founder-institute-toronto does
const ID: Record<string, string> = {
	"idea-neu": "idea-northeastern",
	foundry: "the-foundry-cambridge",
	mghpcc: "mghpcc",
	nerd: "microsoft-new-england",
	"mitre-bedford": "mitre",
	"founder-institute": "founder-institute-boston",
	"genai-collective": "ai-collective-boston",
	furnace: "ai-furnace-boston",
};

// Neighbourhoods and campuses the Atlas uses in `loc` → [city, area shown on the map]
const NEIGHBOURHOODS: Record<string, [string, string]> = {
	"Kendall Sq": ["cambridge", "Kendall Square"],
	"Harvard Sq": ["cambridge", "Harvard Square"],
	"Central Square": ["cambridge", "Central Square"],
	Seaport: ["boston", "Seaport"],
	"Fort Point": ["boston", "Fort Point"],
	"Back Bay": ["boston", "Back Bay"],
	Allston: ["boston", "Allston"],
	Dorchester: ["boston", "Dorchester"],
	"Downtown Crossing": ["boston", "Downtown Crossing"],
	"Downtown Boston": ["boston", "Downtown"],
	downtown: ["boston", "Downtown"],
	"Comm Ave": ["boston", "Boston University"],
	"Newton Centre": ["newton", "Newton Centre"],
	"Chestnut Hill": ["newton", "Chestnut Hill"],
	"Wellesley Hills": ["wellesley", "Wellesley Hills"],
};
const TOWNS = new Set([
	"Boston",
	"Cambridge",
	"Amherst",
	"Worcester",
	"Medford",
	"Waltham",
	"Somerville",
	"Newton",
	"Wellesley",
	"Burlington",
	"Bedford",
	"Wilmington",
	"Westborough",
	"Holyoke",
	"Fall River",
]);

// HQs checked on the orgs' own sites, 2026-10-31, that differ from the Atlas's pin. The pin
// is a local office or an old address, which the data has no place for yet, so these go in
// without one. Orgs based outside Massachusetts go under their HQ city, like real-ventures.
const MOVED: Record<string, { city: string; why: string }> = {
	"bosch-v": {
		city: "de-bw-stuttgart",
		why: "Robert Bosch Venture Capital GmbH is in Stuttgart; the Atlas pins its Boston office",
	},
	diu: {
		city: "us-ca-mountain-view",
		why: "diu.mil/about gives its HQ as Mountain View; the Atlas pins its Boston-area office",
	},
	matrix: {
		city: "us-ma-cambridge",
		why: "matrix.vc lists 101 Main St, Cambridge (and San Francisco); the Atlas pins Waltham",
	},
	bessemer: {
		city: "us-ma-wellesley",
		why: "bvp.com lists its Boston office in Wellesley; the Atlas pins Back Bay",
	},
	accomplice: {
		city: "us-ma-boston",
		why: "accomplice.co gives 56 Wareham St, Boston; the Atlas pins Cambridge",
	},
	pharmstars: {
		city: "us-ma-newton",
		why: "its website terms give Newton; the Atlas pins central Boston",
	},
};
// several offices and none called HQ on the org's own site (or none stated), so the Atlas's
// Massachusetts office stands in for the HQ until someone confirms it
const HQ_UNCLEAR = new Set([
	"gv", // "San Francisco Bay Area", offices in New York, Cambridge and London
	"gc",
	"nextview",
	"unusual",
	"matrix",
	"bessemer", // legal address in Larchmont, NY
	"ibm-ventures",
]);

// parents the Atlas implies in names, URLs and descriptions; inferred, so flagged for review.
// Entries on a sub-path of another entry's host get that entry as parent automatically.
const PARENT: Record<string, string> = {
	aihub: "masstech",
	"mehi-sandbox": "masstech",
	masscybercenter: "masstech",
	"rough-draft": "gc",
};

// Link check of every kept URL, 2026-10-31: followed redirects and compared page titles with
// the names. Renamed orgs keep the old name as an alias and their descriptions are flagged.
// `host` is set where the org is a section of a bigger site it doesn't own.
const CORRECTIONS: Record<
	string,
	{ name?: string; url: string; host?: string }
> = {
	hcsai: { name: "AI Safety Team", url: "https://aisafetyteam.org/" }, // aisst.ai redirects here
	maia: { url: "https://mitaialignment.org/" }, // mitalignment.org serves gambling spam
	ssc: { url: "https://sscventurepartners.com/" }, // sscvp.com is an unrelated IT firm
	walnut: { name: "Walnut Ventures", url: "https://www.walnutventures.com/" }, // was LinkedIn
	techstars: {
		url: "https://www.techstars.com/accelerators/boston", // was techstars.com
		host: "www.techstars.com/accelerators/boston",
	},
	diu: { name: "Defense Innovation Unit", url: "https://www.diu.mil" }, // the org, not its office
};

// Left out, with the reason. Entries of SKIPPED_CATS are left out too.
const DROPPED: Record<string, string> = {
	google:
		"an employer's office: the URL is Google's office list, and it runs no program founders apply to",
	"meta-cam":
		"an employer's office: the URL is a Meta jobs search that returns an error page",
	"amazon-sea": "an employer's office: the URL is Amazon's global news site",
	"anthropic-bos": "an employer's office: the URL is Anthropic's global site",
	"nvidia-bos": "an employer's office: the URL is NVIDIA's global site",
	"oracle-bos": "an employer's office: the URL is Oracle's global site",
	"salesforce-bos": "an employer's office: the URL is Salesforce's global site",
	"apple-bos": "an employer's office: the URL is Apple's global site",
	"redhat-bos": "an employer's office: the URL is Red Hat's global site",
	"amazon-robotics":
		"an Amazon subsidiary: the URL is an Amazon jobs page, and it runs no program founders apply to",
	"nuance-microsoft":
		"a Microsoft business: the URL is a Dragon product page, and it runs no program founders apply to",
};

// Descriptions over the schema's 300 characters, shortened here from the Atlas's words without
// dates, amounts or names. The originals stay in the Atlas.
const DESC: Record<string, string> = {
	eai: "Northeastern's applied AI institute, organized around human-in-the-loop AI and research on responsible and generative AI. Its AI Solutions Hub takes paid, scoped engagements.",
	cdsai:
		"Research center inside UMass Amherst's Manning CICS, working across machine learning, NLP, computer vision and robotics. Runs a membership-based Industry Affiliates Program, sponsored student projects and an applied-AI engineering team, dataCore.",
	ciir: "UMass Amherst's information-retrieval research center in the Manning College of Information and Computer Sciences. A paid affiliates program gives companies early research reports, student recruiting and, at higher tiers, software licensing.",
	"umass-boston-ai-institute":
		"UMass Boston's cross-campus applied-AI institute. Runs a speaker series, student-run AI workshops, a hackathon-and-symposium and a paid summer AI camp through the colleges on the Dorchester campus.",
	ndif: "NSF-funded research computing project at Northeastern's Khoury College that gives free remote access to large open-weight models, plus the open-source NNsight library for inspecting and editing model internals.",
	"tufts-ai-institute":
		"Tufts' university-wide AI hub, run by the School of Engineering, with centers for data foundations in AI and for human-AI interaction.",
	iaifi:
		"NSF AI institute for AI and physics, anchored in MIT's Laboratory for Nuclear Science with Harvard, Northeastern, Tufts and Boston University. Runs a public colloquium series, an application-only PhD summer school and a workshop with open registration.",
	"brandeis-cs":
		"Brandeis's computer science department in Waltham, with an MS in Computational Linguistics that hosts NLP industry receptions. Its labs work on multilingual NLP, meaning representation and data-centric machine learning.",
	"msr-ne":
		"Microsoft's basic-research lab in the NERD building in Cambridge, working on biomedical ML, economics and computation, and ML and statistics.",
	"rtx-bbn":
		"RTX's Cambridge research subsidiary, formerly Bolt Beranek and Newman. Runs government-funded R&D in AI and machine learning, speech and language processing, cyber and networking.",
	"mitre-bedford":
		"Not-for-profit operator of federally funded R&D centers, headquartered in Bedford and in McLean, Virginia. Maintains the ATT&CK and ATLAS threat knowledge bases and does AI work for defense, cyber, health and aviation sponsors.",
	"draper-laboratory":
		"Independent nonprofit R&D lab spun out of MIT, with autonomy, perception and machine learning as core capabilities for defense and space. Runs DraperSPARX, which pairs defense startups with its engineers, secure labs and government customers.",
	"analog-devices":
		"Wilmington-headquartered semiconductor company making sensing, signal-processing and edge-AI chips. Runs ADVentures, a corporate venture fund for seed and Series A startups, and Analog Garage, its corporate incubator.",
	engine:
		"Tough-tech hub created by MIT and now an independent nonprofit, with managed wet lab, engineering and office space. Runs Blueprint, a free, mostly virtual program for researchers turning lab work into a company.",
	"ai-biohub":
		"Accelerator for pre-seed and seed startups applying AI to therapeutics, diagnostics, devices and life-science platforms. Co-led by LabCentral and AI venture studio C10 Labs, and housed in LabCentral's Kendall Square wet lab.",
	"startup-worcester":
		"Free pre-accelerator run by the Worcester Regional Chamber of Commerce with the WorcLab incubator. Each cohort of early-stage companies gets Chamber and WorcLab memberships, downtown coworking, mentoring, and networking and fundraising opportunities.",
	auxilium:
		"Worcester innovation studio and accelerator that invests in the companies it accepts; a studio residency adds further funding. Applications are by invitation.",
	venturewell:
		"Nonprofit in Amherst that funds and trains science and engineering founders: E-Team grants for US student invention teams, and Aspire and Ascend investor-readiness programs for pre-seed and seed startups nationwide.",
	"umassd-cie":
		"UMass Dartmouth's technology innovation center in Fall River. Its Technology Venture Center incubator offers offices, a biomanufacturing lab, prototyping, interns and faculty access, on site or virtually.",
	worclab:
		"Nonprofit incubator and coworking space in downtown Worcester, with shared and dedicated desks, private offices and a prototyping lab. Co-runs the free StartUp Worcester program with the Worcester Regional Chamber of Commerce.",
	build617:
		"Founder-led community for early-stage tech founders in Boston and Cambridge, with founder dinners, tactical sessions, a podcast and a free workspace in Downtown Crossing.",
	"mass-ai-coalition":
		"Private-sector coalition of Massachusetts AI founders, operators, investors and students. Runs a free founder coworking space, a resource pack of compute credits and warm intros, a customer-pilot program and a year-round event calendar.",
	masstech:
		"Quasi-public state agency for the Commonwealth's technology and innovation economy, formally the Massachusetts Technology Collaborative. Runs the Massachusetts AI Hub, the Innovation Institute, MeHI and other divisions.",
	aihub:
		"State AI office inside the MassTech Collaborative. Runs the Applied AI Models Innovation Challenge, the Data Commons Collaborative and the AI Compute Resources cluster at MGHPCC, and co-sponsors The Open Accelerator.",
	mghpcc:
		"Nonprofit high-performance computing center in Holyoke shared by research universities. Home to the state-funded AI Compute Resource, used by universities, startups and research organizations across Massachusetts.",
	masscybercenter:
		"Cybersecurity division of the MassTech Collaborative. Convenes the state's cyber ecosystem and runs grants, including Cyber Resilient Massachusetts for small businesses, nonprofits and municipalities.",
};

// people named in descriptions (the digit check below catches dates, amounts and addresses)
const PEOPLE =
	/Paul English|David Bau|Patra|Scheutz|Xue|Pustejovsky|Hongfu Liu|Raibert|Raiz|Jess Lynch|Sinan Aral|Harthorne|Spielberg|Nick Leonard|Zuckerberg|Moderna/;

// identity wording in a description is a claim about who a program is for; it needs a quote
const IDENTITY_WORDS =
	/\b(black|women|woman|female|indigenous|non-binary|two-spirit|under-?represented|lgbtq|bipoc|newcomers?|immigrants?|veterans?|disabilit|minorit|latin[aox]|hispanic|youth|aged? \d)/i;

// the Atlas says the program may have ended; its status is a guess
const MAYBE_ENDED: Record<string, string> = {
	"ai-biohub":
		"its grant covered two cohorts and the Atlas says the second finished in June 2026",
	auxilium: "the Atlas says applications are closed and by invitation",
	"rough-draft":
		"its only page is the 2024 launch post; GC's site doesn't say the program still runs",
};

// --- read --------------------------------------------------------------------------------

const src = process.argv[2] ?? SOURCE;
const text = src.startsWith("https://")
	? await (await fetch(src)).text()
	: readFileSync(src, "utf8");
const all = parse(text) as Entry[];
const byId = new Map(all.map((e) => [e.id, e]));
for (const [list, keys] of Object.entries({
	DROPPED,
	CORRECTIONS,
	MOVED,
	PARENT,
	DESC,
	ID,
	CAT_OVERRIDE,
	MAYBE_ENDED,
	HQ_UNCLEAR: Object.fromEntries([...HQ_UNCLEAR].map((k) => [k, 1])),
})) {
	for (const k of Object.keys(keys))
		if (!byId.has(k)) throw new Error(`${list} names a missing entry: ${k}`);
}

const skipped = all.filter((e) => SKIPPED_CATS[e.cat]);
const kept = all.filter((e) => !SKIPPED_CATS[e.cat] && !DROPPED[e.id]);
for (const [cat, why] of Object.entries(SKIPPED_CATS))
	console.log(
		`left out ${skipped.filter((e) => e.cat === cat).length} "${cat}" entries: ${why}`,
	);
for (const [id, why] of Object.entries(DROPPED))
	console.log(`left out ${id}: ${why}`);

const nameOf = (e: Entry) => CORRECTIONS[e.id]?.name ?? e.name;
const urlOf = (e: Entry) => CORRECTIONS[e.id]?.url ?? e.url;
const idOf = (e: Entry) => ID[e.id] ?? slug(nameOf(e));

// --- ids: unique here, and not taken by any record this import didn't write ------------------

const ids = kept.map(idOf);
const repeated = ids.filter((id, i) => ids.indexOf(id) !== i);
if (repeated.length)
	throw new Error(`two entries would share an id: ${repeated.join(", ")}`);

function* ymlFiles(dir: string): Generator<string> {
	for (const d of readdirSync(dir, { withFileTypes: true })) {
		if (d.isDirectory()) yield* ymlFiles(join(dir, d.name));
		else if (d.name.endsWith(".yml")) yield join(dir, d.name);
	}
}
const taken = new Map<string, string>(); // org or program id → file
for (const file of ymlFiles(ORGS)) {
	const body = readFileSync(file, "utf8");
	if (body.startsWith(HEADER.split("\n")[0])) continue; // written by this import
	const org = parse(body);
	for (const id of [org.id, ...(org.programs ?? []).map((p: any) => p.id)])
		taken.set(id, file);
}
const collisions = ids
	.flatMap((id) => [id, `${id}-program`])
	.filter((id) => taken.has(id));
if (collisions.length)
	throw new Error(
		`ids already used elsewhere: ${collisions.map((id) => `${id} (${taken.get(id)})`).join(", ")}`,
	);

// --- where each org is ---------------------------------------------------------------------

// "Stata Center, 32 Vassar St, Cambridge" → Cambridge; "Boston (Back Bay)" → Boston, Back Bay.
// Labels like "Venues vary" or "Citywide" name no place: the nearest city page is a guess.
function place(e: Entry): { city: string; area?: string; guessed: boolean } {
	const parts = e.loc
		.split(/[,·]/)
		.flatMap((p) => [p.replace(/\(.*\)/, ""), p.match(/\((.*)\)/)?.[1] ?? ""])
		.map((p) => p.trim())
		.filter(Boolean);
	let city: string | undefined;
	let area: string | undefined;
	for (const p of parts) {
		const hood = NEIGHBOURHOODS[p];
		if (hood) {
			city ??= hood[0];
			area ??= hood[1];
		} else if (TOWNS.has(p)) city = slug(p);
	}
	if (city) return { city: `us-ma-${city}`, area, guessed: false };
	const toCambridge = Math.hypot(e.lat - 42.3654, e.lng - -71.0936);
	const toBoston = Math.hypot(e.lat - 42.3555, e.lng - -71.0565);
	return {
		city: toCambridge < toBoston ? "us-ma-cambridge" : "us-ma-boston",
		guessed: true,
	};
}

const places = kept.map((e) =>
	MOVED[e.id]
		? { city: MOVED[e.id].city, guessed: false, area: undefined }
		: place(e),
);

// every HQ city needs an entry in data/regions/index.yml; print the missing ones and stop
const regions = parse(readFileSync(REGIONS, "utf8"));
const missing = new Map<string, Entry[]>();
kept.forEach((e, i) => {
	const { city } = places[i];
	if (!regions.cities[city])
		missing.set(city, [...(missing.get(city) ?? []), e]);
});
if (missing.size) {
	const r = (n: number) => Math.round(n * 1e4) / 1e4;
	const out: Record<string, unknown> = {};
	for (const [city, es] of missing) {
		if (!city.startsWith("us-ma-")) {
			out[city] = "outside Massachusetts: add it with the city's own centre";
			continue;
		}
		const pinned = es.filter((e) => !MOVED[e.id]);
		const lats = pinned.map((e) => e.lat);
		const lngs = pinned.map((e) => e.lng);
		const pad = (n: number, d: number) => Math.round((n + d) * 100) / 100;
		out[city] = {
			center: [
				r(lats.reduce((a, b) => a + b) / lats.length),
				r(lngs.reduce((a, b) => a + b) / lngs.length),
			],
			bounds: [
				[pad(Math.min(...lats), -0.05), pad(Math.min(...lngs), -0.05)],
				[pad(Math.max(...lats), 0.05), pad(Math.max(...lngs), 0.05)],
			],
			orgs: es.length,
		};
	}
	console.error(
		`cities missing from data/regions/index.yml:\n${stringify(out)}`,
	);
	process.exit(1);
}

// --- write ---------------------------------------------------------------------------------

const urls = kept.map((e) => new URL(urlOf(e)));
const isRoot = (u: URL) => u.pathname === "/" || u.pathname === "";
const idByAtlas = new Map(kept.map((e, i) => [e.id, ids[i]]));
// the org whose homepage is the bare host, for entries that sit under it
const rootOrg = new Map<string, string>();
urls.forEach((u, i) => {
	if (isRoot(u) && !rootOrg.has(u.hostname)) rootOrg.set(u.hostname, ids[i]);
});
const files = places.map((p, i) => {
	const [country, sub, ...rest] = p.city.split("-");
	return join(ORGS, country, sub, rest.join("-"), `${ids[i]}.yml`);
});
// every program's fields are first guesses
const PROGRAM_REVIEW = [
	"name",
	"types",
	"stages",
	"audiences",
	"access",
	"fee",
	"open_to",
];
const flagCounts = new Map<string, number>();

kept.forEach((e, i) => {
	const id = ids[i];
	const url = urls[i];
	const fix = CORRECTIONS[e.id];
	const name = nameOf(e);
	const review: string[] = [];

	// a URL with a path is a section of a bigger site: the host keeps the path, since one host
	// belongs to one org ("www.wpi.edu/about/ai", not all of www.wpi.edu)
	const host =
		fix?.host ??
		(isRoot(url)
			? url.hostname
			: `${url.hostname}${url.pathname.replace(/\/(home)?\/?$/, "")}`);
	if (PARENT[e.id] && !idByAtlas.has(PARENT[e.id]))
		throw new Error(`${e.id}: parent ${PARENT[e.id]} is not imported`);
	const parent = PARENT[e.id]
		? idByAtlas.get(PARENT[e.id])
		: isRoot(url)
			? undefined
			: rootOrg.get(url.hostname);
	if (parent) review.push("parent");

	const cat = CAT_OVERRIDE[e.id] ?? CATEGORY[e.cat];
	if (!cat) throw new Error(`${e.id}: no category mapping for "${e.cat}"`);
	if (CAT_OVERRIDE[e.id] || MIXED_CATS.has(e.cat)) review.push("cats");

	const desc = DESC[e.id] ?? e.desc;
	if (desc.length > 300) throw new Error(`${e.id}: desc over 300; add to DESC`);
	if (
		DESC[e.id] ||
		fix?.name ||
		/\d|\$/.test(desc) ||
		PEOPLE.test(desc) ||
		IDENTITY_WORDS.test(desc)
	)
		review.push("desc");
	if (MAYBE_ENDED[e.id]) review.push("status");

	// where the org is (hq) is a different fact from whom it serves (open_to)
	const { city, area, guessed } = places[i];
	const hq: Record<string, unknown> = { city };
	if (!MOVED[e.id]) {
		if (area) hq.area = area;
		hq.lat = e.lat;
		hq.lng = e.lng;
		if (e.approx) hq.approx = true;
	}
	if (guessed || HQ_UNCLEAR.has(e.id)) review.push("hq");

	const guess = PROGRAM[cat];
	const types = [
		...new Set([
			...guess.types,
			...e.offers.map((o) => OFFER_TYPE[o]).filter((t) => t !== undefined),
		]),
	];
	const hinted = new Set((e.stages ?? []).flatMap((n) => STAGE[n] ?? []));
	const stages = hinted.size
		? STAGE_ORDER.filter((s) => hinted.has(s))
		: guess.stages;

	const org = {
		id,
		name,
		...(fix?.name ? { aliases: [e.name] } : {}),
		url: urlOf(e),
		hosts: [host],
		...(parent ? { parent } : {}),
		cats: [cat],
		hq,
		desc,
		...(review.length ? { review } : {}),
		programs: [
			{
				id: `${id}-program`,
				name,
				url: urlOf(e),
				types,
				stages,
				audiences: guess.audiences,
				// the Atlas lists these for founders anywhere in Massachusetts
				open_to: ["us-ma"],
				access: ACCESS[e.cat],
				fee: PAID.has(e.cat) ? "fee" : "free",
				review: PROGRAM_REVIEW,
			},
		],
	};
	for (const k of review) flagCounts.set(k, (flagCounts.get(k) ?? 0) + 1);

	mkdirSync(dirname(files[i]), { recursive: true });
	writeFileSync(files[i], HEADER + stringify(org, { lineWidth: 0 }));
});
console.log(`wrote ${kept.length} orgs under ${ORGS}`);

// --- round trip: every kept entry landed with its name, URL and coordinates ----------------

const problems: string[] = [];
kept.forEach((e, i) => {
	const org = parse(readFileSync(files[i], "utf8"));
	if (org.name !== nameOf(e)) problems.push(`${e.id}: name ${org.name}`);
	if (CORRECTIONS[e.id]?.name && !org.aliases?.includes(e.name))
		problems.push(`${e.id}: old name missing from aliases`);
	if (org.url !== urlOf(e)) problems.push(`${e.id}: url ${org.url}`);
	if (MOVED[e.id]) {
		if (org.hq.lat !== undefined) problems.push(`${e.id}: kept the Atlas pin`);
	} else if (org.hq.lat !== e.lat || org.hq.lng !== e.lng)
		problems.push(`${e.id}: coordinates ${org.hq.lat}, ${org.hq.lng}`);
});
if (problems.length)
	throw new Error(`round trip failed:\n${problems.join("\n")}`);
console.log(
	`round trip: ${kept.length} of ${all.length} entries landed with name, URL and coordinates ` +
		`(${Object.keys(CORRECTIONS).length} corrected, ${Object.keys(MOVED).length} moved to the HQ on their own ` +
		`site, without the Atlas pin); ${skipped.length + Object.keys(DROPPED).length} left out`,
);

console.log(
	`org fields under review: ${[...flagCounts].map(([k, n]) => `${k} ${n}`).join(", ")}; ` +
		`every program: ${PROGRAM_REVIEW.join(", ")}`,
);
