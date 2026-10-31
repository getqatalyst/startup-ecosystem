// Which records a person should re-check: orgs whose `last_verified` is missing or more than
// 12 months old, and programs whose own `last_verified` is (a program without one counts as
// checked with its org). Also sizes a monthly queue per region so every org comes round
// within 12 months. A report, not a gate: it always exits 0.
//
// Usage: bun scripts/freshness.ts [--months 12] [--region ca-on]

import { validate } from "./validate";

export type Stale = {
	region: string;
	org: string;
	record: string; // org or program id
	name: string;
	url: string;
	last_verified?: string; // missing: never verified
	age?: number; // whole months
};

const monthIndex = (ym: string) => {
	const [y, m] = ym.split("-").map(Number);
	return y * 12 + m - 1;
};

export function freshness(orgs: any[], today = new Date(), months = 12) {
	const now = monthIndex(today.toISOString().slice(0, 7));
	const stale: Stale[] = [];
	let checked = 0;
	for (const org of orgs) {
		const region = org.hq.city.split("-").slice(0, 2).join("-");
		const row = (r: any): Stale => ({
			region,
			org: org.id,
			record: r.id,
			name: r.name,
			url: r.url ?? org.url,
			last_verified: r.last_verified,
			age: r.last_verified ? now - monthIndex(r.last_verified) : undefined,
		});
		const o = row(org);
		if (o.age === undefined || o.age > months) stale.push(o);
		else checked++;
		for (const p of org.programs) {
			const r = p.last_verified ? row(p) : undefined;
			if (r && r.age! > months) stale.push(r);
		}
	}
	// never verified first, then oldest first; ties by id so the order is stable
	stale.sort(
		(a, b) =>
			(a.last_verified ?? "").localeCompare(b.last_verified ?? "") ||
			a.record.localeCompare(b.record),
	);
	return { stale, checked, total: orgs.length };
}

// how many of a region's orgs to check each month so all of them come round within `months`
export const queueSize = (orgCount: number, months = 12) =>
	Math.ceil(orgCount / months);

if (import.meta.main) {
	const args = process.argv.slice(2);
	const opt = (name: string) => {
		const i = args.indexOf(name);
		return i === -1 ? undefined : args[i + 1];
	};
	const months = Number(opt("--months") ?? 12);
	const region = opt("--region");
	const result = validate();
	if (result.errors.length) {
		console.error("data has errors; run bun run validate");
		process.exit(1);
	}
	const orgs = result.orgs.filter(
		(o) => !region || o.hq.city.startsWith(`${region}-`),
	);
	const { stale, checked, total } = freshness(orgs, new Date(), months);
	console.log(
		`${checked} of ${total} orgs verified in the last ${months} months; ${stale.length} records to re-check`,
	);
	for (const s of stale) {
		const when = s.last_verified
			? `${s.last_verified} (${s.age} months ago)`
			: "never";
		console.log(`${when.padEnd(22)} ${s.record}  ${s.url}`);
	}
	process.exit(0);
}
