// The monthly health check: runs the link check and the freshness report, then keeps one
// open issue per province or state with what its moderators should fix or re-check. Each
// run rewrites the issue body and comments with the month's counts, so moderators get one
// notification a month. When a region has nothing left, its issue is closed.
//
// Usage: bun scripts/health.ts           print each region's issue (nothing is posted)
//        bun scripts/health.ts --post    open, update or close the issues (needs gh and GH_TOKEN)

import { tmpdir } from "node:os";
import { join } from "node:path";
import { freshness, queueSize, type Stale } from "./freshness";
import {
	type Finding,
	linkcheck,
	TO_CHECK,
	TO_FIX,
	targets,
} from "./linkcheck";
import { validate } from "./validate";

export type Report = {
	region: string;
	title: string;
	marker: string; // hidden in the body; how a run finds last month's issue
	body: string;
	summary: string;
	clean: boolean;
};
export type Action =
	| { do: "create"; report: Report }
	| { do: "update"; number: number; report: Report }
	| { do: "close"; number: number; report: Report };

export const HEALTH_LABEL = "health";
const MAX_BODY = 60_000; // GitHub's limit is 65,536 characters

const marker = (region: string) => `<!-- health:${region} -->`;
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function reports(
	orgs: any[],
	findings: Finding[],
	regions: any,
	{
		today = new Date(),
		repo = "getqatalyst/startup-ecosystem",
		runUrl,
	}: { today?: Date; repo?: string; runUrl?: string } = {},
): Report[] {
	const month = today.toISOString().slice(0, 7);
	const fileUrl = (org: any) => {
		const [country, sub, ...city] = org.hq.city.split("-");
		return `https://github.com/${repo}/blob/main/data/orgs/${country}/${sub}/${city.join("-")}/${org.id}.yml`;
	};
	const orgById = new Map(orgs.map((o) => [o.id, o]));
	const codes = [
		...new Set(orgs.map((o) => o.hq.city.split("-").slice(0, 2).join("-"))),
	].sort();

	return codes.map((region) => {
		const name = regions.subdivisions[region]?.name ?? region;
		const regionOrgs = orgs.filter((o) => o.hq.city.startsWith(`${region}-`));
		const links = findings.filter((f) => f.region === region);
		const fix = links.filter((f) => TO_FIX.includes(f.kind));
		const check = links.filter((f) => TO_CHECK.includes(f.kind));
		const { stale, checked, total } = freshness(regionOrgs, today);
		const queue = stale.slice(0, queueSize(total));
		const moderators = Object.entries<any>(regions.cities)
			.filter(([id]) => id.startsWith(`${region}-`))
			.flatMap(([, c]) => c.moderators ?? []);

		const record = (id: string, orgId: string) =>
			`[\`${id}\`](${fileUrl(orgById.get(orgId))})`;
		// the programs that share the link, after the org that owns the file
		const programsOf = (f: Finding) => {
			const ids = f.records.filter((id) => id !== f.org);
			return ids.length ? ` (${ids.map((id) => `\`${id}\``).join(", ")})` : "";
		};
		const linkTable = (rows: Finding[]) => [
			"| Record | Link | What the check saw |",
			"| --- | --- | --- |",
			...rows.map(
				(f) =>
					`| ${record(f.org, f.org)}${programsOf(f)} | ${f.url} | **${f.kind}**: ${cell(f.note)} |`,
			),
		];
		const staleLine = (s: Stale) =>
			`${record(s.record, s.org)} ${cell(s.name)}, ${s.url}, ${s.last_verified ? `last verified ${s.last_verified}` : "never verified"}`;

		const summary = `${fix.length} links to fix, ${check.length} to check by hand, ${checked} of ${total} orgs verified in the last 12 months.`;
		const sections = [
			marker(region),
			`Link and freshness check for **${name}**, ${month}. Each month's run rewrites this issue${runUrl ? ` ([run log](${runUrl}))` : ""}.`,
			`**${summary}**`,
			moderators.length ? `cc ${moderators.map((m) => `@${m}`).join(" ")}` : "",
			fix.length
				? [
						"### Links to fix",
						"The link no longer leads to the org: dead, parked or for sale, spam, or a redirect to a host the record doesn't list. Find the org's current site, or set `status` if it ended.",
						"",
						...linkTable(fix),
					].join("\n")
				: "",
			check.length
				? [
						"### Links to check by hand",
						"The site refused the check, or the page never names the org or program. Open it in a browser; fix the record or the link if it's someone else's page.",
						"",
						...linkTable(check),
					].join("\n")
				: "",
			queue.length
				? [
						`### This month's verification queue (${queue.length})`,
						`Check each against the org's own site, fix what's wrong, and set \`last_verified: ${month}\`. ${queue.length} a month gets every org checked within 12 months.`,
						"",
						...queue.map((s) => `- [ ] ${staleLine(s)}`),
					].join("\n")
				: "",
		];
		const rest = stale.slice(queue.length);
		let body = sections.filter(Boolean).join("\n\n");
		if (rest.length) {
			const details = `\n\n<details><summary>${rest.length} more records to re-check</summary>\n\n${rest.map((s) => `- ${staleLine(s)}`).join("\n")}\n\n</details>`;
			body +=
				body.length + details.length <= MAX_BODY
					? details
					: `\n\n${rest.length} more records to re-check: run \`bun scripts/freshness.ts --region ${region}\`.`;
		}
		return {
			region,
			title: `Monthly health: ${name} (${region})`,
			marker: marker(region),
			body,
			summary,
			clean: !fix.length && !check.length && !stale.length,
		};
	});
}

// what to do with each region's issue, given the open health issues
export function plan(
	list: Report[],
	open: { number: number; body: string }[],
): Action[] {
	return list.flatMap((report): Action[] => {
		const existing = open.find((i) => i.body.includes(report.marker));
		if (existing) {
			return [
				{
					do: report.clean ? "close" : "update",
					number: existing.number,
					report,
				},
			];
		}
		return report.clean ? [] : [{ do: "create", report }];
	});
}

function gh(args: string[], { allowFail = false } = {}) {
	const run = Bun.spawnSync(["gh", ...args], { stderr: "pipe" });
	if (run.exitCode !== 0 && !allowFail) {
		throw new Error(
			`gh ${args[0]} ${args[1]}: ${run.stderr.toString().trim()}`,
		);
	}
	return run.stdout.toString();
}

async function post(actions: Action[]) {
	// the forms' label script creates these too; creating them here keeps this job working
	// on a repo where it hasn't run. An existing label is left as it is.
	gh(["label", "create", HEALTH_LABEL, "--color", "bf8700"], {
		allowFail: true,
	});
	for (const region of new Set(actions.map((a) => a.report.region))) {
		gh(["label", "create", `region:${region}`, "--color", "d4c5f9"], {
			allowFail: true,
		});
	}
	for (const a of actions) {
		const file = join(tmpdir(), `health-${a.report.region}.md`);
		await Bun.write(file, a.report.body);
		if (a.do === "create") {
			const url = gh([
				"issue",
				"create",
				"--title",
				a.report.title,
				"--body-file",
				file,
				"--label",
				`${HEALTH_LABEL},region:${a.report.region}`,
			]).trim();
			console.log(`opened ${url}`);
		} else if (a.do === "update") {
			gh(["issue", "edit", String(a.number), "--body-file", file]);
			gh(["issue", "comment", String(a.number), "--body", a.report.summary]);
			console.log(`updated #${a.number}`);
		} else {
			gh(["issue", "edit", String(a.number), "--body-file", file]);
			gh([
				"issue",
				"close",
				String(a.number),
				"--comment",
				"Every link works and every record was verified in the last 12 months.",
			]);
			console.log(`closed #${a.number}`);
		}
	}
}

if (import.meta.main) {
	const result = validate();
	if (result.errors.length) {
		console.error("data has errors; run bun run validate");
		process.exit(1);
	}
	const findings = await linkcheck(targets(result.orgs));
	const env = process.env;
	const list = reports(result.orgs, findings, result.shared.regions, {
		repo: env.GITHUB_REPOSITORY,
		runUrl:
			env.GITHUB_RUN_ID &&
			`${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
	});
	if (env.GITHUB_STEP_SUMMARY) {
		await Bun.write(
			env.GITHUB_STEP_SUMMARY,
			list.map((r) => `## ${r.title}\n\n${r.summary}`).join("\n\n"),
		);
	}
	if (process.argv.includes("--post")) {
		const open = JSON.parse(
			gh([
				"issue",
				"list",
				"--label",
				HEALTH_LABEL,
				"--state",
				"open",
				"--limit",
				"200",
				"--json",
				"number,body",
			]),
		);
		await post(plan(list, open));
	} else {
		for (const r of list) console.log(`# ${r.title}\n\n${r.body}\n`);
	}
	process.exit(0);
}
