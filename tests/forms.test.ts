import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { labels } from "../scripts/labels";

const REPO = join(import.meta.dir, "..");
const read = (rel: string) => parse(readFileSync(join(REPO, rel), "utf8"));
const vocab = read("data/shared/vocab.yml");
const stages = read("data/shared/stages.yml");
const regions = read("data/regions/index.yml");

const FORMS_DIR = ".github/ISSUE_TEMPLATE";
const forms = readdirSync(join(REPO, FORMS_DIR))
	.filter((f) => f.endsWith(".yml") && f !== "config.yml")
	.map((f) => ({ file: f, form: read(`${FORMS_DIR}/${f}`) }));

// dropdown id → the shared list its options must match, label for label
const vocabLabels = (key: string) =>
	Object.values<any>(vocab[key]).map((v) =>
		typeof v === "string" ? v : v.label,
	);
const LISTS: Record<string, string[]> = {
	cats: vocabLabels("cats"),
	types: vocabLabels("types"),
	audiences: vocabLabels("audiences"),
	delivery: vocabLabels("delivery"),
	fee: vocabLabels("fee"),
	founder_receives: vocabLabels("founder_receives"),
	access: vocabLabels("access"),
	cadence: vocabLabels("cadence"),
	who: vocabLabels("identity_groups"),
	stages: stages.map((s: any) => `${s.t} — ${s.s}`),
};
// dropdowns whose options aren't a shared list
const OWN_OPTIONS = new Set(["equity", "problem"]);

describe("issue forms", () => {
	test("there is a form to suggest an org, suggest a program and flag a correction", () => {
		expect(forms.map((f) => f.form.labels[0]).sort()).toEqual([
			"correction",
			"suggest-org",
			"suggest-program",
		]);
	});

	test("every label a form applies is one scripts/labels.ts creates", () => {
		const known = new Set(labels(regions).map((l) => l.name));
		for (const { form } of forms) {
			for (const label of form.labels) expect(known).toContain(label);
		}
	});

	for (const { file, form } of forms) {
		const dropdowns = form.body.filter((f: any) => f.type === "dropdown");
		for (const field of dropdowns.filter((f: any) => !OWN_OPTIONS.has(f.id))) {
			test(`${file}: ${field.id} options match the shared list`, () => {
				expect(LISTS[field.id]).toBeDefined();
				expect(field.attributes.options).toEqual(LISTS[field.id]);
			});
		}

		test(`${file}: ids are unique and none uses GitHub's reserved "None" option`, () => {
			const ids = form.body.filter((f: any) => f.id).map((f: any) => f.id);
			expect(new Set(ids).size).toBe(ids.length);
			for (const field of dropdowns) {
				expect(field.attributes.options).not.toContain("None");
			}
		});
	}
});

describe("labels", () => {
	test("one region label per province or state", () => {
		const names = labels(regions).map((l) => l.name);
		for (const sub of Object.keys(regions.subdivisions)) {
			expect(names).toContain(`region:${sub}`);
		}
		expect(new Set(names).size).toBe(names.length);
	});

	test("colours are 6-digit hex without #", () => {
		for (const l of labels(regions)) expect(l.color).toMatch(/^[0-9a-f]{6}$/);
	});
});
