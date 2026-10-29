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
