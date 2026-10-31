// Writes the downloads attached to each GitHub release: the built ecosystem.json, a flat
// CSV with one row per program (its org's fields repeated; an org with no programs gets
// one row), the data license, and the release notes. Built from scripts/build.ts, so
// variants come out resolved and `open_to` and `last_verified` filled in.
//
// CSV: lists are joined with "; ", `who` is "group (requirement)", true/false for flags.
// A text cell that starts with = + - @ gets a leading ' so spreadsheet apps don't run it
// as a formula; the data comes from the public.
//
// Usage: bun scripts/export.ts [out-dir]   (default dist/)

import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "./build";

type Data = ReturnType<typeof build>;

const list = (v: unknown) => (Array.isArray(v) ? v.join("; ") : v);
const ORG_COLUMNS: [string, (o: any) => unknown][] = [
	["org_id", (o) => o.id],
	["org_name", (o) => o.name],
	["org_aliases", (o) => list(o.aliases)],
	["org_url", (o) => o.url],
	["org_parent", (o) => o.parent],
	["org_cats", (o) => list(o.cats)],
	["hq_city", (o) => o.hq.city],
	["hq_area", (o) => o.hq.area],
	["hq_lat", (o) => o.hq.lat],
	["hq_lng", (o) => o.hq.lng],
	["hq_approx", (o) => o.hq.approx],
	["org_desc", (o) => o.desc],
	["org_status", (o) => o.status],
	["org_claimed", (o) => o.claimed],
	["org_last_verified", (o) => o.last_verified],
	["org_review", (o) => list(o.review)],
];
const PROGRAM_COLUMNS: [string, (p: any) => unknown][] = [
	["program_id", (p) => p.id],
	["program_name", (p) => p.name],
	["program_url", (p) => p.url],
	["variant_of", (p) => p.variant_of],
	["types", (p) => list(p.types)],
	["stages", (p) => list(p.stages)],
	["audiences", (p) => list(p.audiences)],
	["open_to", (p) => list(p.open_to)],
	[
		"who",
		(p) =>
			list(
				p.eligibility?.who?.map((w: any) => `${w.group} (${w.requirement})`),
			),
	],
	["delivery", (p) => p.delivery],
	["where", (p) => list(p.where)],
	["fee", (p) => p.fee],
	["equity", (p) => p.equity],
	["founder_receives", (p) => list(p.founder_receives)],
	["access", (p) => p.access],
	["cadence", (p) => list(p.cadence)],
	["duration", (p) => p.duration],
	["program_status", (p) => p.status],
	["program_last_verified", (p) => p.last_verified],
	["program_review", (p) => list(p.review)],
];
export const COLUMNS = [...ORG_COLUMNS, ...PROGRAM_COLUMNS].map(([c]) => c);

export function cell(value: unknown): string {
	if (value === undefined || value === null) return "";
	let s = String(value);
	if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
	return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(data: Data): string {
	const rows = [COLUMNS.map(cell).join(",")];
	for (const org of data.orgs) {
		const orgCells = ORG_COLUMNS.map(([, get]) => cell(get(org)));
		const programs = org.programs.length ? org.programs : [undefined];
		for (const p of programs) {
			const programCells = PROGRAM_COLUMNS.map(([, get]) =>
				p ? cell(get(p)) : "",
			);
			rows.push([...orgCells, ...programCells].join(","));
		}
	}
	return `${rows.join("\r\n")}\r\n`;
}

export function releaseNotes(data: Data, commit = ""): string {
	const programs = data.orgs.reduce((n, o) => n + o.programs.length, 0);
	return `${data.orgs.length} organizations and ${programs} programs${commit ? `, built from ${commit}` : ""}.

- \`ecosystem.json\`: everything, format ${data.format}. The format number changes only when a consumer would have to change.
- \`ecosystem.csv\`: one row per program, with its organization's fields repeated. Lists are joined with "; ".

Fields listed under \`review\` / \`*_review\` are unconfirmed first guesses. Dates, amounts and deadlines are not in the data; they stay on each program's own page.

**License:** ${data.license}. **Attribution:** ${data.attribution}. See \`LICENSE.md\`.
`;
}

if (import.meta.main) {
	const out = resolve(process.argv[2] ?? join(import.meta.dir, "../dist"));
	const data = build();
	mkdirSync(out, { recursive: true });
	writeFileSync(
		join(out, "ecosystem.json"),
		`${JSON.stringify(data, null, "\t")}\n`,
	);
	writeFileSync(join(out, "ecosystem.csv"), toCsv(data));
	copyFileSync(
		join(import.meta.dir, "../data/LICENSE.md"),
		join(out, "LICENSE.md"),
	);
	writeFileSync(
		join(out, "RELEASE.md"),
		releaseNotes(data, process.env.GITHUB_SHA?.slice(0, 7)),
	);
	console.log(
		`wrote ecosystem.json, ecosystem.csv, LICENSE.md, RELEASE.md to ${out}`,
	);
}
