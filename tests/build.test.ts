import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { build, FORMAT } from "../scripts/build";
import { validate } from "../scripts/validate";

const today = new Date("2026-10-28T12:00:00Z");
const fixtures = validate({
	orgsDir: join(import.meta.dir, "fixtures/valid"),
	today,
});
const data = build(fixtures);
const program = (id: string) =>
	data.orgs.flatMap((o: any) => o.programs).find((p: any) => p.id === id);

describe("build", () => {
	test("carries the format version, license and shared lists", () => {
		expect(data.format).toBe(FORMAT);
		expect(data.license).toContain("CC BY 4.0");
		expect(Object.keys(data.regions.cities)).toContain("ca-on-toronto");
		expect(data.stages.map((s: any) => s.id)).toContain("validate");
		expect(Object.keys(data.vocab.cats)).toContain("accelerator");
	});

	test("a variant inherits its main program's fields but keeps its own", () => {
		const women = program("dmz-launchpad-women");
		expect(women.name).toBe("Launchpad for Women");
		expect(women.url).toBe("https://launchpadforwomen.ca/");
		expect(women.types).toEqual(["course"]);
		expect(women.delivery).toBe("remote");
		expect(women.eligibility.who[0].group).toBe("women");
		expect(women.variant_of).toBe("dmz-launchpad");
	});

	test("a variant doesn't inherit its main program's id, aliases or review list", () => {
		const track = program("hbs-nvc-social-enterprise");
		expect(track.url).toBe("https://www.hbs.edu/newventurecompetition/");
		expect(track.review).toBeUndefined();
		expect(program("dmz-launchpad-women").review).toEqual(["eligibility.who"]);
	});

	test("open_to defaults to the org's HQ city", () => {
		expect(program("dmz-launchpad").open_to).toEqual(["ca-on-toronto"]);
		expect(program("dmz-incubator").open_to).toEqual(["global"]);
	});

	test("programs take the org's last_verified unless they set their own", () => {
		expect(program("dmz-launchpad").last_verified).toBe("2026-10");
	});

	test("orgs come out sorted by id", () => {
		const ids = data.orgs.map((o: any) => o.id);
		expect(ids).toEqual([...ids].sort());
	});

	test("refuses to build data with errors", () => {
		const broken = { ...fixtures, errors: [{ file: "x.yml", message: "bad" }] };
		expect(() => build(broken)).toThrow("data has 1 errors");
	});
});

// one org built in isolation, with the fixtures' shared lists
function buildOne(programs: any[], org: Record<string, unknown> = {}) {
	const record = {
		id: "a",
		name: "A",
		url: "https://a.example/",
		hosts: ["a.example"],
		cats: ["community"],
		hq: { city: "ca-on-toronto" },
		desc: "A.",
		programs,
		...org,
	};
	return build({ ...fixtures, orgs: [record] }).orgs[0].programs;
}
const main = {
	id: "a-p",
	name: "P",
	url: "https://a.example/p",
	types: ["course"],
	stages: ["spark"],
	audiences: ["founders"],
};

describe("variants", () => {
	test("don't inherit verification or status from the main program", () => {
		const [, v] = buildOne(
			[
				{
					...main,
					last_verified: "2026-09",
					status: "ended",
					status_since: "2026-09",
					replaced_by: "x",
				},
				{ id: "a-v", name: "V", variant_of: "a-p" },
			],
			{ last_verified: "2026-10" },
		);
		expect(v.last_verified).toBeUndefined();
		expect(v.status).toBeUndefined();
		expect(v.status_since).toBeUndefined();
		expect(v.replaced_by).toBeUndefined();
	});

	test("carry the main program's review flags for fields they inherit", () => {
		const [, v, w] = buildOne([
			{ ...main, review: ["name", "types", "stages"] },
			{ id: "a-v", name: "V", variant_of: "a-p" },
			{ id: "a-w", name: "W", variant_of: "a-p", types: ["mentorship"] },
		]);
		expect(v.review).toEqual(["types", "stages"]); // "name" is the variant's own
		expect(w.review).toEqual(["stages"]); // it set its own types
	});

	test("merge eligibility key by key", () => {
		const place = { incorporation: ["ca"] };
		const who = [
			{
				group: "women",
				requirement: "required",
				quote: "Women only",
				source: "https://a.example/w",
			},
		];
		const [, v] = buildOne([
			{ ...main, eligibility: { place } },
			{ id: "a-v", name: "V", variant_of: "a-p", eligibility: { who } },
		]);
		expect(v.eligibility).toEqual({ place, who });
	});
});

describe("defaults", () => {
	test("last_verified stays out when nobody has checked the org", () => {
		const [p] = buildOne([main]);
		expect("last_verified" in p).toBe(false);
	});

	test("a program's own open_to and last_verified win over the defaults", () => {
		const [p] = buildOne(
			[{ ...main, open_to: ["ca"], last_verified: "2026-09" }],
			{
				last_verified: "2026-10",
			},
		);
		expect(p.open_to).toEqual(["ca"]);
		expect(p.last_verified).toBe("2026-09");
	});
});

test("the repo's own data builds", () => {
	const real = build(validate({ today }));
	expect(real.orgs.length).toBeGreaterThan(0);
});

// A change here changes what sites read. If it's intended, update the snapshot
// (bun test --update-snapshots) and bump FORMAT when a consumer would have to change.
test("output shape (snapshot of the fixtures)", () => {
	expect(data).toMatchSnapshot();
});

test("offices pass through to the build", () => {
	const office = { city: "ca-on-toronto", area: "King West" };
	const built = build({
		...fixtures,
		orgs: [
			{
				id: "a",
				name: "A",
				url: "https://a.example/",
				hosts: ["a.example"],
				cats: ["community"],
				hq: { city: "us-ma-boston" },
				locations: [office],
				desc: "A.",
				programs: [main],
			},
		],
	});
	expect(built.orgs[0].locations).toEqual([office]);
});
