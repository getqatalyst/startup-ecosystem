// Creates the labels the issue forms and the monthly health check use. GitHub silently drops
// a label an issue form names when the repo doesn't have it, so the issue arrives unlabelled
// and nobody notices. Run it once on a new repo or copy, and again after adding a province or
// state to data/regions/index.yml. Safe to rerun: `--force` updates labels that exist.
//
// Usage: bun scripts/labels.ts [owner/repo] [--dry-run]   (needs gh, logged in with write access)

import { join } from "node:path";
import { parse } from "yaml";

export type Label = { name: string; color: string; description: string };

const FIXED: Label[] = [
	{
		name: "suggest-org",
		color: "2da44e",
		description: "New organization, from the Suggest an organization form",
	},
	{
		name: "suggest-program",
		color: "54aeff",
		description: "New program, from the Suggest a program form",
	},
	{
		name: "correction",
		color: "cf222e",
		description: "A record is wrong, out of date or its link is broken",
	},
	{
		name: "health",
		color: "bf8700",
		description: "Monthly link and freshness report for one province or state",
	},
];

// one label per province or state, so a region's moderators can filter to their issues
export function labels(regions: any): Label[] {
	const regionLabels = Object.entries<any>(regions.subdivisions).map(
		([id, sub]) => ({
			name: regionLabel(id),
			color: "d4c5f9",
			description: `${sub.name}, ${regions.countries[id.slice(0, 2)]?.name ?? id.slice(0, 2)}`,
		}),
	);
	return [...FIXED, ...regionLabels];
}

export const regionLabel = (subdivision: string) => `region:${subdivision}`;

if (import.meta.main) {
	const args = process.argv.slice(2);
	const dryRun = args.includes("--dry-run");
	const repo = args.find((a) => !a.startsWith("--"));
	const regions = parse(
		await Bun.file(join(import.meta.dir, "../data/regions/index.yml")).text(),
	);
	for (const l of labels(regions)) {
		const cmd = [
			"gh",
			"label",
			"create",
			l.name,
			"--color",
			l.color,
			"--description",
			l.description,
			"--force",
			...(repo ? ["--repo", repo] : []),
		];
		if (dryRun) {
			console.log(cmd.join(" "));
			continue;
		}
		const run = Bun.spawnSync(cmd, { stderr: "pipe" });
		if (run.exitCode !== 0) {
			console.error(`✗ ${l.name}: ${run.stderr.toString().trim()}`);
			process.exit(1);
		}
		console.log(`✓ ${l.name}`);
	}
}
