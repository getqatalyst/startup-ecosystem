import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "../scripts/build";
import { COLUMNS, cell, releaseNotes, toCsv } from "../scripts/export";
import { validate } from "../scripts/validate";

const fixtures = validate({
	orgsDir: join(import.meta.dir, "fixtures/valid"),
	today: new Date("2026-10-28T12:00:00Z"),
});
const data = build(fixtures);
const csv = toCsv(data);

// a CSV reader good enough for what toCsv writes
function readCsv(text: string): string[][] {
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
		} else if (c === "\r" && text[i + 1] === "\n") {
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
			i++;
		} else field += c;
	}
	return rows;
}
const [header, ...rows] = readCsv(csv);
const rowOf = (programId: string) =>
	Object.fromEntries(
		rows
			.find((r) => r[header.indexOf("program_id")] === programId)!
			.map((v, i) => [header[i], v]),
	);

describe("csv", () => {
	test("one row per program, plus one per org without programs", () => {
		expect(header).toEqual(COLUMNS);
		const programs = data.orgs.reduce((n, o) => n + o.programs.length, 0);
		const empty = data.orgs.filter((o) => !o.programs.length).length;
		expect(rows.length).toBe(programs + empty);
		expect(empty).toBeGreaterThan(0); // harvard-university: its programs sit in its schools
		for (const r of rows) expect(r.length).toBe(COLUMNS.length);
		expect(new Set(rows.map((r) => r[0]))).toEqual(
			new Set(fixtures.orgs.map((o) => o.id)),
		);
	});

	test("rows carry the built values: resolved variants, defaults, lists, flags", () => {
		const women = rowOf("dmz-launchpad-women");
		expect(women.org_id).toBe("dmz");
		expect(women.variant_of).toBe("dmz-launchpad");
		expect(women.types).toBe("course"); // inherited
		expect(women.who).toBe("women (required)");
		expect(women.program_review).toBe("eligibility.who");
		const incubator = rowOf("dmz-incubator");
		expect(incubator.cadence).toBe("rolling; cohort");
		expect(incubator.equity).toBe("true");
		expect(rowOf("dmz-launchpad").open_to).toBe("ca-on-toronto");
		expect(incubator.org_cats).toBe("incubator; vc; coworking");
	});

	test("quotes cells with commas, quotes and newlines", () => {
		expect(cell('a, "b"')).toBe('"a, ""b"""');
		expect(cell("a\nb")).toBe('"a\nb"');
		expect(cell(undefined)).toBe("");
		expect(cell(false)).toBe("false");
	});

	test("text that a spreadsheet would run as a formula is defused; numbers aren't", () => {
		expect(cell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
		expect(cell("@SUM(1)")).toBe("'@SUM(1)");
		expect(cell("-1+1")).toBe("'-1+1");
		expect(cell(-79.39)).toBe("-79.39");
	});
});

describe("release notes", () => {
	test("state the counts, format, license and attribution", () => {
		const notes = releaseNotes(data, "abc1234");
		expect(notes).toContain(`${data.orgs.length} organizations`);
		expect(notes).toContain(`format ${data.format}`);
		expect(notes).toContain("CC BY 4.0");
		expect(notes).toContain(data.attribution);
		expect(notes).toContain("built from abc1234");
	});
});

describe("export.ts", () => {
	const dir = mkdtempSync(join(tmpdir(), "export-"));
	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	test("writes the four release files from the repo's data", () => {
		const run = Bun.spawnSync([
			"bun",
			join(import.meta.dir, "../scripts/export.ts"),
			dir,
		]);
		expect(run.exitCode).toBe(0);
		const json = JSON.parse(readFileSync(join(dir, "ecosystem.json"), "utf8"));
		expect(json.license).toContain("CC BY 4.0");
		expect(readFileSync(join(dir, "ecosystem.csv"), "utf8")).toStartWith(
			"org_id,org_name,",
		);
		expect(readFileSync(join(dir, "LICENSE.md"), "utf8")).toContain(
			"CC BY 4.0",
		);
		expect(readFileSync(join(dir, "RELEASE.md"), "utf8")).toContain(
			"Attribution",
		);
	});
});
