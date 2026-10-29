import { afterAll, describe, expect, test } from "bun:test";
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { validate } from "../scripts/validate";

const REPO = join(import.meta.dir, "..");
const VALID = join(import.meta.dir, "fixtures/valid");
const today = new Date("2026-10-28T12:00:00Z");
const dirs: string[] = [];

afterAll(() => {
	for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function tempDir() {
	const dir = mkdtempSync(join(tmpdir(), "ecosystem-"));
	dirs.push(dir);
	return dir;
}

function write(dir: string, files: Record<string, string>) {
	for (const [rel, text] of Object.entries(files)) {
		mkdirSync(dirname(join(dir, rel)), { recursive: true });
		writeFileSync(join(dir, rel), text);
	}
}

// The valid fixtures plus the given org files (path relative to the orgs dir → YAML text).
function tree(files: Record<string, string> = {}) {
	const dir = tempDir();
	cpSync(VALID, dir, { recursive: true });
	write(dir, files);
	return dir;
}

// A copy of the repo's shared files with some replaced (path relative to the root → text).
function root(files: Record<string, string>) {
	const dir = tempDir();
	cpSync(join(REPO, "data/shared"), join(dir, "data/shared"), {
		recursive: true,
	});
	cpSync(join(REPO, "data/regions"), join(dir, "data/regions"), {
		recursive: true,
	});
	write(dir, files);
	return dir;
}

const regionsText = readFileSync(join(REPO, "data/regions/index.yml"), "utf8");

// A small valid org; `extra` lines go before `programs`, `programs` replaces the default list.
function org(
	id: string,
	{
		city = "ca-on-toronto",
		extra = "",
		programs = `  - {id: ${id}-p, name: P, url: https://${id}.example/p, types: [community], stages: [spark], audiences: [founders]}\n`,
	} = {},
) {
	return `id: ${id}
name: Test org
url: https://${id}.example/
hosts: [${id}.example]
cats: [community]
hq: {city: ${city}}
desc: Test org.
last_verified: 2026-10
${extra}programs:
${programs}`;
}

// a program list with one main program and the given eligibility block
const withEligibility = (eligibility: string) => `  - id: a-p
    name: P
    url: https://a.example/p
    types: [accelerator]
    stages: [build]
    audiences: [founders]
    eligibility:
${eligibility}`;

function errorsFor(files: Record<string, string>) {
	return validate({ orgsDir: tree(files), today })
		.errors.map((e) => e.message)
		.join("\n");
}

describe("valid data", () => {
	test("the fixtures pass, with warnings for TBD quotes and wide reach", () => {
		const { errors, warnings, orgCount, programCount } = validate({
			orgsDir: VALID,
			today,
		});
		expect(errors).toEqual([]);
		expect(orgCount).toBe(5);
		expect(programCount).toBe(8);
		const messages = warnings.map((w) => w.message).join("\n");
		expect(messages).toContain("dmz-incubator has a quote marked TBD");
		expect(messages).toContain("dmz-incubator is open to global");
	});

	test("the repo's own data passes", () => {
		expect(validate({ today }).errors).toEqual([]);
	});

	test("an empty folder passes", () => {
		expect(validate({ orgsDir: tempDir(), today }).errors).toEqual([]);
	});

	test("months stay strings, not numbers (YAML 1.2)", () => {
		expect(errorsFor({ "ca/on/toronto/a.yml": org("a") })).toBe("");
	});

	test("coordinates inside the city's bounds", () => {
		const text = org("a").replace(
			"hq: {city: ca-on-toronto}",
			"hq: {city: ca-on-toronto, lat: 43.65, lng: -79.38, approx: true}",
		);
		expect(errorsFor({ "ca/on/toronto/a.yml": text })).toBe("");
	});
});

describe("shared files", () => {
	test("an empty region index is reported, not a crash", () => {
		const r = validate({ root: root({ "data/regions/index.yml": "" }), today });
		expect(r.errors[0].file).toBe("data/regions/index.yml");
	});

	test("a comma inside { } in stages.yml is caught", () => {
		const stages = readFileSync(
			join(REPO, "data/shared/stages.yml"),
			"utf8",
		).replace(
			"    - id: 1a\n      t: Curious\n      desc: Learning about startups or AI and meeting people.",
			"    - {id: 1a, t: Curious, desc: Learning, meeting people}",
		);
		const r = validate({
			root: root({ "data/shared/stages.yml": stages }),
			today,
		});
		expect(r.errors.map((e) => e.message).join()).toContain(
			'unknown field "meeting people"',
		);
	});

	test("an unknown list in vocab.yml", () => {
		const vocab = `${readFileSync(join(REPO, "data/shared/vocab.yml"), "utf8")}\ntypos:\n  x: X\n`;
		const r = validate({
			root: root({ "data/shared/vocab.yml": vocab }),
			today,
		});
		expect(r.errors.map((e) => e.message).join()).toContain(
			'unknown list "typos"',
		);
	});

	test("city bounds written north before south", () => {
		const regions = regionsText.replace(
			"[[43.49, -79.71], [43.87, -79.13]]",
			"[[43.87, -79.71], [43.49, -79.13]]",
		);
		const r = validate({
			root: root({ "data/regions/index.yml": regions }),
			today,
		});
		expect(r.errors.map((e) => e.message).join()).toContain(
			"bounds must be [[south, west], [north, east]]",
		);
	});
});

describe("schema", () => {
	test("unknown category", () => {
		const text = org("a").replace("cats: [community]", "cats: [startup]");
		expect(errorsFor({ "ca/on/toronto/a.yml": text })).toContain(
			"/cats/0 must be one of",
		);
	});

	test("unknown field", () => {
		const text = org("a", { extra: "website: https://a.example/\n" });
		expect(errorsFor({ "ca/on/toronto/a.yml": text })).toContain(
			'unknown field "website"',
		);
	});

	test("HTML in a text field", () => {
		const text = org("a").replace("desc: Test org.", "desc: <b>Test</b>");
		expect(errorsFor({ "ca/on/toronto/a.yml": text })).toContain(
			"/desc must match pattern",
		);
	});

	test("an identity label without a quote", () => {
		const programs = withEligibility(
			"      who: [{group: women, requirement: required, source: https://a.example/p}]\n",
		);
		expect(
			errorsFor({ "ca/on/toronto/a.yml": org("a", { programs }) }),
		).toContain("must have required property 'quote'");
	});

	test("the same identity group twice", () => {
		const label =
			"{group: women, requirement: required, quote: Women only, source: https://a.example/p}";
		const programs = withEligibility(`      who: [${label}, ${label}]\n`);
		expect(
			errorsFor({ "ca/on/toronto/a.yml": org("a", { programs }) }),
		).toContain("eligibility.who lists women more than once");
	});

	test("an age range upside down", () => {
		const programs = withEligibility(
			"      age: {min: 40, max: 18, quote: Ages 18 to 40}\n",
		);
		expect(
			errorsFor({ "ca/on/toronto/a.yml": org("a", { programs }) }),
		).toContain("eligibility.age min is above max");
	});

	test("an age limit without a quote", () => {
		const programs = withEligibility("      age: {max: 39}\n");
		expect(
			errorsFor({ "ca/on/toronto/a.yml": org("a", { programs }) }),
		).toContain("must have required property 'quote'");
	});

	test("a duplicate key does not parse", () => {
		expect(
			errorsFor({ "ca/on/toronto/a.yml": `${org("a")}name: Again\n` }),
		).toContain("YAML does not parse");
	});

	test("an empty file", () => {
		expect(errorsFor({ "ca/on/toronto/a.yml": "" })).toContain(
			"(top level) must be object",
		);
	});
});

describe("files and places", () => {
	test("filed under a different city than hq.city", () => {
		expect(errorsFor({ "us/ma/boston/a.yml": org("a") })).toContain(
			"hq.city is ca-on-toronto, so the file belongs under ca/on/toronto/",
		);
	});

	test("a city slug with a hyphen can't be split across folders", () => {
		const regions = `${regionsText}  us-ma-new-bedford:
    name: New Bedford
    center: [41.64, -70.93]
    zoom: 13
    bounds: [[41.55, -71.0], [41.75, -70.85]]
    status: draft
    moderators: []
`;
		const r = root({ "data/regions/index.yml": regions });
		const text = org("nb", { city: "us-ma-new-bedford" });
		const wrong = tempDir();
		write(wrong, { "us/ma-new/bedford/nb.yml": text });
		const right = tempDir();
		write(right, { "us/ma/new-bedford/nb.yml": text });
		expect(
			validate({ root: r, orgsDir: wrong, today })
				.errors.map((e) => e.message)
				.join(),
		).toContain("so the file belongs under us/ma/new-bedford/");
		expect(validate({ root: r, orgsDir: right, today }).errors).toEqual([]);
	});

	test("file name differs from id", () => {
		expect(errorsFor({ "ca/on/toronto/b.yml": org("a") })).toContain(
			"file name must be a.yml",
		);
	});

	test("files that aren't .yml are rejected, not skipped", () => {
		const errors = errorsFor({
			"ca/on/toronto/a.yaml": org("a"),
			"ca/on/toronto/notes.txt": "hello",
		});
		expect(errors.match(/only <id>\.yml files belong/g)?.length).toBe(2);
	});

	test("symlinks are rejected", () => {
		const dir = tree();
		symlinkSync(
			join(dir, "ca/on/toronto/dmz.yml"),
			join(dir, "ca/on/toronto/link.yml"),
		);
		const errors = validate({ orgsDir: dir, today }).errors.map(
			(e) => e.message,
		);
		expect(errors).toContain("symlinks aren't allowed in data/orgs");
	});

	test("city missing from the region index", () => {
		const text = org("a", { city: "ca-on-ottawa" });
		expect(errorsFor({ "ca/on/ottawa/a.yml": text })).toContain(
			"hq.city ca-on-ottawa is not in data/regions/index.yml",
		);
	});

	test("coordinates outside the city's bounds", () => {
		const text = org("a").replace(
			"hq: {city: ca-on-toronto}",
			"hq: {city: ca-on-toronto, lat: 42.36, lng: -71.06}",
		);
		expect(errorsFor({ "ca/on/toronto/a.yml": text })).toContain(
			"outside Toronto's bounds",
		);
	});
});

describe("ids and hosts", () => {
	test("an org id used twice", () => {
		const text = org("dmz", { city: "us-ma-boston" });
		expect(errorsFor({ "us/ma/boston/dmz.yml": text })).toContain(
			"id dmz is already used by",
		);
	});

	test("a program id used twice", () => {
		const programs =
			"  - {id: dmz-incubator, name: P, url: https://a.example/p, types: [incubator], stages: [build], audiences: [founders]}\n";
		expect(
			errorsFor({ "ca/on/toronto/a.yml": org("a", { programs }) }),
		).toContain("program id dmz-incubator is already used");
	});

	test("a host claimed by two orgs", () => {
		const text = org("a").replace(
			"hosts: [a.example]",
			"hosts: [dmz.torontomu.ca]",
		);
		expect(errorsFor({ "ca/on/toronto/a.yml": text })).toContain(
			"host dmz.torontomu.ca is already listed by",
		);
	});

	test("a schema error in one file doesn't hide its id from others", () => {
		const errors = errorsFor({
			"ca/on/toronto/a.yml": org("a").replace(
				"cats: [community]",
				"cats: [startup]",
			),
			"ca/on/toronto/b.yml": org("b", { extra: "parent: a\n" }),
		});
		expect(errors).toContain("/cats/0 must be one of");
		expect(errors).not.toContain("parent a is not in the dataset");
	});
});

describe("references", () => {
	test("parent not in the dataset", () => {
		const text = org("a", { extra: "parent: nowhere\n" });
		expect(errorsFor({ "ca/on/toronto/a.yml": text })).toContain(
			"parent nowhere is not in the dataset",
		);
	});

	test("parent chain that loops", () => {
		const errors = errorsFor({
			"ca/on/toronto/a.yml": org("a", { extra: "parent: b\n" }),
			"ca/on/toronto/b.yml": org("b", { extra: "parent: a\n" }),
		});
		expect(errors).toContain("parent chain loops back");
	});

	test("an org with no programs that nothing points to", () => {
		expect(
			errorsFor({ "ca/on/toronto/a.yml": org("a", { programs: "  []\n" }) }),
		).toContain("needs at least one program");
	});

	test("a partner id not in the dataset", () => {
		const programs =
			"  - {id: a-p, name: P, url: https://a.example/p, types: [grant], stages: [build], audiences: [founders], partners: [{org: amex, role: funds}]}\n";
		expect(
			errorsFor({ "ca/on/toronto/a.yml": org("a", { programs }) }),
		).toContain("partner amex is not in the dataset; use org_name instead");
	});

	test("an affiliation id not in the dataset", () => {
		const programs = withEligibility(
			"      affiliation: [{org: nowhere-u, role: student}]\n",
		);
		expect(
			errorsFor({ "ca/on/toronto/a.yml": org("a", { programs }) }),
		).toContain("affiliation org nowhere-u is not in the dataset");
	});

	test("merged without replaced_by", () => {
		const text = org("a", { extra: "status: merged\n" });
		expect(errorsFor({ "ca/on/toronto/a.yml": text })).toContain(
			"status merged needs replaced_by",
		);
	});

	test("replaced_by pointing at itself", () => {
		const text = org("a", { extra: "status: merged\nreplaced_by: a\n" });
		expect(errorsFor({ "ca/on/toronto/a.yml": text })).toContain(
			"replaced_by can't point at itself",
		);
	});

	test("last_verified in the future", () => {
		const text = org("a").replace(
			"last_verified: 2026-10",
			"last_verified: 2027-01",
		);
		expect(errorsFor({ "ca/on/toronto/a.yml": text })).toContain(
			"last_verified 2027-01 is in the future",
		);
	});
});

describe("programs and variants", () => {
	const main =
		"  - {id: a-p, name: P, url: https://a.example/p, types: [course], stages: [spark], audiences: [founders]}\n";

	test("a main program without url, types, stages and audiences", () => {
		const programs = "  - {id: a-p, name: P}\n";
		expect(
			errorsFor({ "ca/on/toronto/a.yml": org("a", { programs }) }),
		).toContain("a-p is missing url, types, stages, audiences");
	});

	test("a variant inherits what it doesn't set", () => {
		const programs = `${main}  - {id: a-p-women, name: P for women, variant_of: a-p}\n`;
		expect(errorsFor({ "ca/on/toronto/a.yml": org("a", { programs }) })).toBe(
			"",
		);
	});

	test("a variant of itself", () => {
		const programs = "  - {id: a-p, name: P, variant_of: a-p}\n";
		expect(
			errorsFor({ "ca/on/toronto/a.yml": org("a", { programs }) }),
		).toContain("a-p can't be a variant of itself");
	});

	test("variant_of naming a program in another file", () => {
		const programs =
			"  - {id: a-p-women, name: P for women, variant_of: dmz-launchpad}\n";
		expect(
			errorsFor({ "ca/on/toronto/a.yml": org("a", { programs }) }),
		).toContain("variant_of dmz-launchpad must name a program in this file");
	});

	test("a variant of a variant", () => {
		const programs = `${main}  - {id: a-v1, name: V1, variant_of: a-p}\n  - {id: a-v2, name: V2, variant_of: a-v1}\n`;
		expect(
			errorsFor({ "ca/on/toronto/a.yml": org("a", { programs }) }),
		).toContain("variants go one level deep");
	});
});
