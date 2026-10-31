import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	classify,
	type Fetched,
	fetchPage,
	linkcheck,
	mentions,
	readPage,
	type Target,
	targets,
} from "../scripts/linkcheck";
import { validate } from "../scripts/validate";

const target: Target = {
	region: "ca-on",
	org: "dmz",
	records: ["dmz"],
	url: "https://dmz.torontomu.ca/",
	names: ["DMZ", "Ryerson DMZ"],
	hosts: ["dmz.torontomu.ca", "dmzlaunchpad.ca"],
};
const page = (body: string, title = "DMZ | Toronto's tech incubator") =>
	`<html><head><title>${title}</title></head><body>${body}</body></html>`;
const ok = (html: string, more: Partial<Fetched> = {}): Fetched => ({
	status: 200,
	finalUrl: target.url,
	contentType: "text/html; charset=utf-8",
	html,
	...more,
});
const kind = (f: Fetched, t: Target = target) => classify(t, f).kind;
const prose =
	"We help founders build and scale technology companies with programs, mentors and space. ".repeat(
		3,
	);

describe("classify", () => {
	test("a page that loads and names the org is ok", () => {
		expect(kind(ok(page(prose)))).toBe("ok");
	});

	test("network errors and 4xx/5xx are dead", () => {
		expect(classify(target, { error: "ENOTFOUND" })).toEqual({
			kind: "dead",
			note: "ENOTFOUND",
		});
		expect(kind(ok("", { status: 404 }))).toBe("dead");
		expect(kind(ok("", { status: 500 }))).toBe("dead");
	});

	test("401, 403, 429, 503 and challenge pages are blocked, not dead", () => {
		for (const status of [401, 403, 429, 503]) {
			expect(kind(ok("", { status }))).toBe("blocked");
		}
		expect(kind(ok(page("", "Just a moment...")))).toBe("blocked");
	});

	test("a page with no title and almost no text needs a browser", () => {
		expect(kind(ok('<html><body><div id="root"></div></body></html>'))).toBe(
			"blocked",
		);
	});

	// the 2026-10-31 cases: a domain for sale, a GoDaddy lander, a redirect to a marketplace
	test("for-sale and parking pages are parked, even with a 200", () => {
		expect(
			kind(ok(page("This domain is for sale! Make an offer.", "dmz.ca"))),
		).toBe("parked");
		expect(
			kind(
				ok(
					'<html><head><script>window.location.href="/lander"</script></head></html>',
				),
			),
		).toBe("parked");
		expect(
			kind(ok(page(prose), { finalUrl: "https://www.hugedomains.com/x" })),
		).toBe("parked");
		expect(kind(ok(page(prose), { finalUrl: "https://dan.com/buy/x" }))).toBe(
			"parked",
		);
	});

	test("spam on the org's domain is hijacked, even with a 200", () => {
		const spam = page(
			"Situs slot gacor maxwin hari ini, daftar sekarang dan menang.",
			"SLOT GACOR - Situs Judi Online Terpercaya",
		);
		const r = classify(target, ok(spam));
		expect(r.kind).toBe("hijacked");
		expect(r.note).toContain("doesn't name the org");
	});

	test("spam that keeps the org's old title is still hijacked", () => {
		const cloaked = page("casino bonus, sportsbook odds, slot online, togel");
		expect(kind(ok(cloaked))).toBe("hijacked");
	});

	test("one spam word on a page that names the org is ok", () => {
		expect(kind(ok(page(`${prose} Our casino night raised funds.`)))).toBe(
			"ok",
		);
	});

	test("a redirect to a host the org doesn't list is moved", () => {
		const r = classify(
			target,
			ok(page(prose), { finalUrl: "https://newname.example/" }),
		);
		expect(r).toEqual({
			kind: "moved",
			note: "redirects to https://newname.example/",
		});
	});

	test("redirects within the org's hosts, their subdomains or www are fine", () => {
		for (const finalUrl of [
			"https://www.dmz.torontomu.ca/en",
			"https://dmzlaunchpad.ca/start",
			"https://apply.dmzlaunchpad.ca/",
		]) {
			expect(kind(ok(page(prose), { finalUrl }))).toBe("ok");
		}
	});

	test("hosts with a path compare by host", () => {
		const hbs = {
			...target,
			url: "https://www.hbs.edu/entrepreneurship/",
			names: ["Rock Center"],
			hosts: ["www.hbs.edu/entrepreneurship"],
		};
		const html = page(prose, "Rock Center for Entrepreneurship");
		expect(
			kind(
				ok(html, { finalUrl: "https://www.hbs.edu/entrepreneurship/x" }),
				hbs,
			),
		).toBe("ok");
	});

	test("a program page may sit on another domain than the org", () => {
		const program = {
			...target,
			url: "https://apply.example-partner.com/dmz",
			records: ["dmz-x"],
		};
		expect(
			kind(
				ok(page(prose), { finalUrl: "https://apply.example-partner.com/" }),
				program,
			),
		).toBe("ok");
	});

	test("a meta refresh to another host is moved", () => {
		const html = `<html><head><title>DMZ</title><meta http-equiv="refresh" content="0; url=https://elsewhere.example/"></head><body>${prose}</body></html>`;
		expect(classify(target, ok(html)).note).toBe(
			"meta refresh to https://elsewhere.example/",
		);
	});

	test("a meta refresh that isn't a URL doesn't stop the run", () => {
		const html = `<html><head><title>DMZ</title><meta http-equiv="refresh" content="0; url=http://[bad"></head><body>${prose}</body></html>`;
		expect(kind(ok(html))).toBe("ok");
	});

	test("a page that never names the org or program is unnamed", () => {
		const other = page(prose, "Acme Plumbing Supplies");
		expect(kind(ok(other))).toBe("unnamed");
	});

	test("a PDF is ok without reading it", () => {
		expect(kind(ok("", { contentType: "application/pdf; qs=0.001" }))).toBe(
			"ok",
		);
	});
});

describe("mentions", () => {
	test("whole names match as words, ignoring case, accents and &", () => {
		expect(mentions("Welcome to the DMZ.", "DMZ")).toBe(true);
		expect(mentions("Admz products", "DMZ")).toBe(false);
		expect(mentions("Réseau Capital", "Reseau Capital")).toBe(true);
		expect(mentions("Science and Technology", "Science & Technology")).toBe(
			true,
		);
	});

	test("names with the spaces moved or a word missing still match", () => {
		expect(mentions("Scale Up Ventures", "ScaleUp Ventures")).toBe(true);
		expect(mentions("Founder Institute", "Founder Institute Toronto")).toBe(
			true,
		);
		expect(mentions("Women in AI (#WAI)", "Women in AI Toronto")).toBe(true);
	});

	test("a page that shares one word of a long name doesn't match", () => {
		expect(mentions("Toronto casino", "Founder Institute Toronto")).toBe(false);
	});
});

describe("readPage", () => {
	test("reads the title, og:site_name and text, skipping scripts and styles", () => {
		const p = readPage(
			'<head><title>A &amp; B</title><meta property="og:site_name" content="AB Lab"><style>x{}</style></head><body><script>var slot="gacor"</script><p>Hello</p></body>',
		);
		expect(p.title).toBe("A & B");
		expect(p.siteName).toBe("AB Lab");
		expect(p.body).toBe("A & B Hello");
	});
});

describe("targets", () => {
	const { orgs } = validate({
		orgsDir: join(import.meta.dir, "fixtures/valid"),
		today: new Date("2026-10-28T12:00:00Z"),
	});

	test("one target per distinct URL in an org, naming every record that uses it", () => {
		const dmz = targets(orgs).filter((t) => t.org === "dmz");
		const urls = dmz.map((t) => t.url);
		expect(new Set(urls).size).toBe(urls.length);
		const launchpad = dmz.find((t) => t.url === "https://dmzlaunchpad.ca/")!;
		expect(launchpad.records).toEqual(["dmz-launchpad"]);
		expect(launchpad.names).toContain("DMZ");
		expect(launchpad.names).toContain("Launchpad");
		expect(launchpad.region).toBe("ca-on");
	});

	test("a variant without its own url isn't checked twice", () => {
		const all = targets(orgs);
		expect(
			all.some((t) => t.records.includes("hbs-nvc-social-enterprise")),
		).toBe(false);
	});
});

describe("linkcheck", () => {
	test("retries a network error once, then reports", async () => {
		let calls = 0;
		const fetcher = (async () => {
			calls++;
			if (calls === 1)
				throw Object.assign(new Error("x"), { code: "ECONNRESET" });
			return new Response(page(prose), {
				headers: { "content-type": "text/html" },
			});
		}) as unknown as typeof fetch;
		const [r] = await linkcheck([target], { fetcher, retryDelayMs: 0 });
		expect(calls).toBe(2);
		expect(r.kind).toBe("ok");
	});

	test("keeps the targets' order", async () => {
		const list = ["a", "b", "c"].map((id) => ({
			...target,
			org: id,
			url: `https://${id}.example/`,
		}));
		const fetcher = (async (url: string) => {
			await Bun.sleep(url.includes("a.") ? 20 : 0);
			return new Response("", { status: 404 });
		}) as unknown as typeof fetch;
		const r = await linkcheck(list, { fetcher, retryDelayMs: 0 });
		expect(r.map((f) => f.org)).toEqual(["a", "b", "c"]);
	});

	test("fetchPage reports a timeout as timeout", async () => {
		const fetcher = (async (_: string, init: RequestInit) =>
			new Promise((_, reject) =>
				init.signal!.addEventListener("abort", () =>
					reject(new DOMException("t", "TimeoutError")),
				),
			)) as unknown as typeof fetch;
		expect(await fetchPage("https://x.example/", fetcher, 10)).toEqual({
			error: "timeout",
		});
	});
});
