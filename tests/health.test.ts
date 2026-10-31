import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { freshness, queueSize } from "../scripts/freshness";
import { plan, reports } from "../scripts/health";
import type { Finding } from "../scripts/linkcheck";
import { validate } from "../scripts/validate";

const today = new Date("2026-10-28T12:00:00Z");
const { orgs, shared } = validate({
	orgsDir: join(import.meta.dir, "fixtures/valid"),
	today,
});
const org = (id: string, last_verified?: string, programs: any[] = []) => ({
	id,
	name: id.toUpperCase(),
	url: `https://${id}.example/`,
	hq: { city: "ca-on-toronto" },
	programs,
	...(last_verified ? { last_verified } : {}),
});

describe("freshness", () => {
	test("orgs never verified or verified more than 12 months ago are stale", () => {
		const { stale, checked, total } = freshness(
			[
				org("never"),
				org("old", "2025-09"),
				org("edge", "2025-10"), // exactly 12 months: still fresh
				org("new", "2026-10"),
			],
			today,
		);
		expect(stale.map((s) => [s.record, s.age])).toEqual([
			["never", undefined],
			["old", 13],
		]);
		expect([checked, total]).toEqual([2, 4]);
	});

	test("a program counts only when its own last_verified is old", () => {
		const { stale } = freshness(
			[
				org("a", "2026-10", [
					{ id: "a-old", name: "Old", last_verified: "2024-01" },
					{ id: "a-same", name: "Same" },
				]),
			],
			today,
		);
		expect(stale.map((s) => s.record)).toEqual(["a-old"]);
		expect(stale[0].url).toBe("https://a.example/");
	});

	test("the queue gets every org checked within 12 months", () => {
		expect(queueSize(94)).toBe(8);
		expect(queueSize(1)).toBe(1);
		expect(queueSize(0)).toBe(0);
	});
});

const finding = (over: Partial<Finding>): Finding => ({
	region: "ca-on",
	org: "dmz",
	records: ["dmz"],
	url: "https://dmz.torontomu.ca/",
	names: ["DMZ"],
	hosts: ["dmz.torontomu.ca"],
	kind: "ok",
	note: "",
	...over,
});

describe("reports", () => {
	const list = reports(
		[...orgs, org("newco")],
		[
			finding({ kind: "parked", note: 'page says "domain is for sale"' }),
			finding({ kind: "blocked", note: "HTTP 403", url: "https://x.example/" }),
			finding({ kind: "ok", url: "https://ok.example/" }),
		],
		shared.regions,
		{ today, runUrl: "https://github.com/run/1" },
	);
	const on = list.find((r) => r.region === "ca-on")!;

	test("one report per province or state that has orgs", () => {
		expect(list.map((r) => r.region)).toEqual(["ca-on", "us-ma"]);
		expect(on.title).toBe("Monthly health: Ontario (ca-on)");
	});

	test("lists links to fix and to check, linking each record's file", () => {
		expect(on.body).toStartWith("<!-- health:ca-on -->");
		expect(on.body).toContain("### Links to fix");
		expect(on.body).toContain(
			"[`dmz`](https://github.com/getqatalyst/startup-ecosystem/blob/main/data/orgs/ca/on/toronto/dmz.yml)",
		);
		expect(on.body).toContain('**parked**: page says "domain is for sale"');
		expect(on.body).toContain("### Links to check by hand");
		expect(on.body).not.toContain("ok.example");
		expect(on.body).toContain("[run log](https://github.com/run/1)");
	});

	test("the verification queue lists the records never verified", () => {
		// every fixture was verified 2026-10; newco never was
		expect(on.body).toContain("### This month's verification queue (1)");
		expect(on.body).toContain("`newco`");
		expect(on.body).toContain("set `last_verified: 2026-10`");
		expect(on.summary).toBe(
			"1 links to fix, 1 to check by hand, 2 of 3 orgs verified in the last 12 months.",
		);
		expect(on.clean).toBe(false);
	});

	test("a pipe in a note can't break the table", () => {
		const [r] = reports(
			orgs,
			[finding({ kind: "unnamed", note: 'title: "A | B"' })],
			shared.regions,
			{ today },
		);
		expect(r.body).toContain('title: "A \\| B"');
	});
});

describe("plan", () => {
	const report = (region: string, clean: boolean) => ({
		region,
		title: region,
		marker: `<!-- health:${region} -->`,
		body: "",
		summary: "",
		clean,
	});
	const open = [{ number: 7, body: "<!-- health:ca-on -->\n..." }];

	test("updates the region's open issue, or opens one", () => {
		const actions = plan(
			[report("ca-on", false), report("us-ma", false)],
			open,
		);
		expect(actions.map((a) => [a.do, "number" in a ? a.number : null])).toEqual(
			[
				["update", 7],
				["create", null],
			],
		);
	});

	test("closes a region's issue once it's clean, and opens none for a clean region", () => {
		const actions = plan([report("ca-on", true), report("us-ma", true)], open);
		expect(actions.map((a) => a.do)).toEqual(["close"]);
	});
});
