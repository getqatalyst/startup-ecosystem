// Validates every org file under data/orgs/ against schema/org.schema.yml, then checks the
// rules the schema can't express: file paths, unique ids and hosts, references between
// records, variants, coordinates inside the city's bounds, and dates not in the future.
// The shared files (stages, vocab, regions) are checked first; if any is broken, the run
// stops there, since every org check depends on them.
//
// Usage: bun scripts/validate.ts [orgs-dir]   (exits 1 on any error)

import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import Ajv2020, { type ErrorObject } from "ajv/dist/2020";
import { parse } from "yaml";

const REPO = join(import.meta.dir, "..");

type Issue = { file: string; message: string };
export type Result = {
	errors: Issue[];
	warnings: Issue[];
	orgCount: number;
	programCount: number;
	// what was read, for scripts/build.ts: schema-valid orgs and the parsed shared files
	orgs: any[];
	shared: { stages?: any; vocab?: any; regions?: any };
};
export type Options = {
	orgsDir?: string; // default: <root>/data/orgs
	root?: string; // repo root holding data/shared, data/regions and schema/
	today?: Date;
};

// schema $defs whose allowed values come from data/shared/vocab.yml
const VOCAB_DEFS: Record<string, string> = {
	cat: "cats",
	type: "types",
	audience: "audiences",
	identity_group: "identity_groups",
	requirement: "requirement",
	affiliation_role: "affiliation_roles",
	venture_gate: "venture_gates",
	venture_type: "venture_types",
	partner_role: "partner_roles",
	access: "access",
	delivery: "delivery",
	fee: "fee",
	founder_receives: "founder_receives",
	cadence: "cadence",
	status: "status",
};

// fields a main program must set; a variant inherits them
const MAIN_PROGRAM_REQUIRED = ["url", "types", "stages", "audiences"];

const readYaml = (path: string) => parse(readFileSync(path, "utf8"));

// Every file under dir, except .gitkeep. Symlinks are returned as-is so they can be rejected.
function listFiles(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.flatMap((name) => {
			const path = join(dir, name);
			const stat = lstatSync(path);
			if (stat.isDirectory()) return listFiles(path);
			return name === ".gitkeep" ? [] : [path];
		})
		.sort();
}

function formatAjvError(e: ErrorObject): string {
	const at = e.instancePath || "(top level)";
	if (e.keyword === "enum") {
		return `${at} must be one of: ${(e.params.allowedValues as string[]).join(", ")}`;
	}
	if (e.keyword === "additionalProperties") {
		return `${at} has unknown field "${e.params.additionalProperty}"`;
	}
	return `${at} ${e.message}`;
}

// every `quote` anywhere under a program's eligibility
function quotes(value: unknown): string[] {
	if (Array.isArray(value)) return value.flatMap(quotes);
	if (value && typeof value === "object") {
		return Object.entries(value).flatMap(([k, v]) =>
			k === "quote" && typeof v === "string" ? [v] : quotes(v),
		);
	}
	return [];
}

const duplicates = (values: unknown[]) =>
	[...new Set(values.filter((v, i) => values.indexOf(v) !== i))].join(", ");

export function validate({
	root = REPO,
	orgsDir = join(root, "data", "orgs"),
	today = new Date(),
}: Options = {}): Result {
	const errors: Issue[] = [];
	const warnings: Issue[] = [];
	const err = (file: string, message: string) => errors.push({ file, message });
	const warn = (file: string, message: string) =>
		warnings.push({ file, message });
	const stop = () => ({
		errors,
		warnings,
		orgCount: 0,
		programCount: 0,
		orgs: [],
		shared: {},
	});
	const thisMonth = today.toISOString().slice(0, 7);

	// strictRequired off: "org or org_name" uses anyOf + required on properties declared one level up
	const ajv = new Ajv2020({
		allErrors: true,
		strict: true,
		strictRequired: false,
	});
	ajv.addSchema(readYaml(join(REPO, "schema/shared.schema.yml")));
	ajv.addSchema(readYaml(join(REPO, "schema/regions.schema.yml")));

	// --- shared files -------------------------------------------------------------------
	const shared: Record<string, any> = {};
	for (const [key, file, schemaRef] of [
		["stages", "data/shared/stages.yml", "shared.schema.yml#/$defs/stages"],
		["vocab", "data/shared/vocab.yml", "shared.schema.yml#/$defs/vocab"],
		["regions", "data/regions/index.yml", "regions.schema.yml"],
	]) {
		try {
			shared[key] = readYaml(join(root, file));
		} catch (e) {
			err(file, `YAML does not parse: ${(e as Error).message.split("\n")[0]}`);
			continue;
		}
		if (!ajv.validate(schemaRef, shared[key])) {
			for (const e of ajv.errors ?? []) err(file, formatAjvError(e));
		}
	}
	if (errors.length) return stop();
	const { stages, vocab, regions } = shared;

	const stageIds = stages.map((s: any) => s.id);
	const stageNs = stages.map((s: any) => s.n);
	if (duplicates(stageIds) || duplicates(stageNs)) {
		err(
			"data/shared/stages.yml",
			`stage ids and n must be unique (repeated: ${duplicates([...stageIds, ...stageNs])})`,
		);
	}
	const lists = new Set(Object.values(VOCAB_DEFS));
	for (const key of lists) {
		if (!vocab[key]) err("data/shared/vocab.yml", `missing list "${key}"`);
	}
	for (const key of Object.keys(vocab)) {
		if (!lists.has(key)) err("data/shared/vocab.yml", `unknown list "${key}"`);
	}
	for (const sub of Object.keys(regions.subdivisions)) {
		if (!regions.countries[sub.slice(0, 2)]) {
			err(
				"data/regions/index.yml",
				`subdivision ${sub}: country ${sub.slice(0, 2)} is not listed`,
			);
		}
	}
	for (const [id, city] of Object.entries<any>(regions.cities)) {
		const sub = id.split("-").slice(0, 2).join("-");
		if (!regions.subdivisions[sub]) {
			err(
				"data/regions/index.yml",
				`city ${id}: subdivision ${sub} is not listed`,
			);
		}
		const [[south, west], [north, east]] = city.bounds;
		const [lat, lng] = city.center;
		if (south >= north || west >= east) {
			err(
				"data/regions/index.yml",
				`city ${id}: bounds must be [[south, west], [north, east]]`,
			);
		} else if (lat < south || lat > north || lng < west || lng > east) {
			err("data/regions/index.yml", `city ${id}: center is outside its bounds`);
		}
	}
	if (errors.length) return stop();

	const orgSchema = readYaml(join(REPO, "schema/org.schema.yml"));
	for (const [def, key] of Object.entries(VOCAB_DEFS)) {
		orgSchema.$defs[def].enum = Object.keys(vocab[key]);
	}
	orgSchema.$defs.stage.enum = stageIds;
	const validateOrg = ajv.compile(orgSchema);

	// --- org files ----------------------------------------------------------------------
	const orgFile = new Map<string, string>(); // org id → file
	const programFile = new Map<string, string>(); // program id → file
	const hostOrg = new Map<string, string>(); // host → org id
	const orgs: { file: string; org: any }[] = [];
	let programCount = 0;

	for (const path of listFiles(orgsDir)) {
		const file = relative(root, path);
		if (lstatSync(path).isSymbolicLink()) {
			err(file, "symlinks aren't allowed in data/orgs");
			continue;
		}
		if (!path.endsWith(".yml")) {
			err(file, "only <id>.yml files belong in data/orgs");
			continue;
		}
		let org: any;
		try {
			org = readYaml(path);
		} catch (e) {
			err(file, `YAML does not parse: ${(e as Error).message.split("\n")[0]}`);
			continue;
		}

		// register the id and hosts before the schema check, so a typo elsewhere in this file
		// doesn't turn into "parent ... is not in the dataset" errors in other files
		if (typeof org?.id === "string") {
			if (orgFile.has(org.id)) {
				err(file, `id ${org.id} is already used by ${orgFile.get(org.id)}`);
			}
			orgFile.set(org.id, file);
		}
		for (const host of Array.isArray(org?.hosts) ? org.hosts : []) {
			if (typeof host !== "string") continue;
			const other = hostOrg.get(host);
			if (other && other !== org.id) {
				err(
					file,
					`host ${host} is already listed by ${other}; one host belongs to one org`,
				);
			}
			hostOrg.set(host, org.id);
		}

		if (!validateOrg(org)) {
			for (const e of validateOrg.errors ?? []) err(file, formatAjvError(e));
			continue; // the checks below rely on the shape the schema guarantees
		}
		orgs.push({ file, org });
		programCount += org.programs.length;

		// path: <country>/<subdivision>/<city>/<id>.yml, built from hq.city (city slugs can hold "-")
		const [country, subdivision, ...citySlug] = org.hq.city.split("-");
		const expected = [country, subdivision, citySlug.join("-")];
		const parts = relative(orgsDir, path).split(sep);
		if (parts.length !== 4) {
			err(file, "must be at data/orgs/<country>/<subdivision>/<city>/<id>.yml");
		} else if (parts.slice(0, 3).join("/") !== expected.join("/")) {
			err(
				file,
				`hq.city is ${org.hq.city}, so the file belongs under ${expected.join("/")}/, not ${parts.slice(0, 3).join("/")}/`,
			);
		}
		if (basename(path) !== `${org.id}.yml`) {
			err(file, `file name must be ${org.id}.yml`);
		}

		const city = regions.cities[org.hq.city];
		if (!city) {
			err(file, `hq.city ${org.hq.city} is not in data/regions/index.yml`);
		} else if (org.hq.lat !== undefined) {
			const [[south, west], [north, east]] = city.bounds;
			const { lat, lng } = org.hq;
			if (lat < south || lat > north || lng < west || lng > east) {
				err(
					file,
					`hq lat/lng (${lat}, ${lng}) is outside ${city.name}'s bounds; check for a typo`,
				);
			}
		}

		checkRecord(file, org.id, org);

		const local = new Map<string, any>(org.programs.map((p: any) => [p.id, p]));
		for (const p of org.programs) {
			if (programFile.has(p.id)) {
				err(
					file,
					`program id ${p.id} is already used in ${programFile.get(p.id)}`,
				);
			}
			programFile.set(p.id, file);
			checkRecord(file, p.id, p);

			if (p.variant_of) {
				const base = local.get(p.variant_of);
				if (p.variant_of === p.id) {
					err(file, `${p.id} can't be a variant of itself`);
				} else if (!base) {
					err(
						file,
						`${p.id}: variant_of ${p.variant_of} must name a program in this file`,
					);
				} else if (base.variant_of) {
					err(
						file,
						`${p.id}: ${p.variant_of} is itself a variant; variants go one level deep`,
					);
				}
			} else {
				const missing = MAIN_PROGRAM_REQUIRED.filter((k) => p[k] === undefined);
				if (missing.length) {
					err(
						file,
						`${p.id} is missing ${missing.join(", ")} (only variants inherit these)`,
					);
				}
			}

			const groups = (p.eligibility?.who ?? []).map((w: any) => w.group);
			if (duplicates(groups)) {
				err(
					file,
					`${p.id}: eligibility.who lists ${duplicates(groups)} more than once`,
				);
			}
			const age = p.eligibility?.age;
			if (
				age?.min !== undefined &&
				age?.max !== undefined &&
				age.min > age.max
			) {
				err(file, `${p.id}: eligibility.age min is above max`);
			}
			if (quotes(p.eligibility).some((q) => q.trim().toUpperCase() === "TBD")) {
				warn(
					file,
					`${p.id} has a quote marked TBD; copy the words from the program's page`,
				);
			}
			const wide = (p.open_to ?? []).filter(
				(place: string) => place === "global" || /^[a-z]{2}$/.test(place),
			);
			if (wide.length) {
				warn(
					file,
					`${p.id} is open to ${wide.join(", ")}; a core maintainer reviews wide reach`,
				);
			}
		}
	}

	// --- references across files --------------------------------------------------------
	const parents = new Set(orgs.map((o) => o.org.parent).filter(Boolean));
	const orgById = new Map(orgs.map((o) => [o.org.id, o.org]));
	for (const { file, org } of orgs) {
		if (org.programs.length === 0 && !parents.has(org.id)) {
			err(
				file,
				"needs at least one program, unless other orgs list it as their parent",
			);
		}
		if (org.parent) {
			if (!orgFile.has(org.parent)) {
				err(file, `parent ${org.parent} is not in the dataset`);
			} else {
				const seen = new Set([org.id]);
				let at = org.parent;
				while (at) {
					if (seen.has(at)) {
						err(file, `parent chain loops back to ${at}`);
						break;
					}
					seen.add(at);
					at = orgById.get(at)?.parent;
				}
			}
		}
		// a host under another org's host (dmz.torontomu.ca/black-innovation-programs under
		// dmz.torontomu.ca) is fine for a sub-org; otherwise one of them is probably wrong
		const ancestors = new Set<string>();
		for (
			let at = org.parent;
			at && !ancestors.has(at);
			at = orgById.get(at)?.parent
		) {
			ancestors.add(at);
		}
		for (const host of org.hosts) {
			const parts = host.split("/");
			for (let n = parts.length - 1; n >= 1; n--) {
				const owner = hostOrg.get(parts.slice(0, n).join("/"));
				if (owner && owner !== org.id && !ancestors.has(owner)) {
					warn(
						file,
						`host ${host} sits under ${owner}'s host; if it's part of ${owner}, set parent`,
					);
				}
			}
		}
		if (org.replaced_by && !orgFile.has(org.replaced_by)) {
			err(file, `replaced_by ${org.replaced_by} is not in the dataset`);
		}
		for (const p of org.programs) {
			for (const partner of p.partners ?? []) {
				if (partner.org && !orgFile.has(partner.org)) {
					err(
						file,
						`${p.id}: partner ${partner.org} is not in the dataset; use org_name instead`,
					);
				}
			}
			for (const a of p.eligibility?.affiliation ?? []) {
				if (a.org && !orgFile.has(a.org)) {
					err(
						file,
						`${p.id}: affiliation org ${a.org} is not in the dataset; use org_name instead`,
					);
				}
			}
			if (p.replaced_by && !programFile.has(p.replaced_by)) {
				err(
					file,
					`${p.id}: replaced_by ${p.replaced_by} is not a program in the dataset`,
				);
			}
		}
	}

	return {
		errors,
		warnings,
		orgCount: orgs.length,
		programCount,
		orgs: orgs.map((o) => o.org),
		shared: { stages, vocab, regions },
	};

	function checkRecord(file: string, id: string, record: any) {
		for (const field of ["last_verified", "status_since"]) {
			if (record[field] && record[field] > thisMonth) {
				err(file, `${id}: ${field} ${record[field]} is in the future`);
			}
		}
		if (record.status === "merged" && !record.replaced_by) {
			err(file, `${id}: status merged needs replaced_by`);
		}
		if (record.replaced_by === id) {
			err(file, `${id}: replaced_by can't point at itself`);
		}
	}
}

if (import.meta.main) {
	const orgsDir = process.argv[2] ? resolve(process.argv[2]) : undefined;
	const { errors, warnings, orgCount, programCount } = validate({ orgsDir });
	for (const w of warnings) console.warn(`warning  ${w.file}: ${w.message}`);
	for (const e of errors) console.error(`error    ${e.file}: ${e.message}`);
	console.log(
		`${orgCount} orgs, ${programCount} programs: ${errors.length} errors, ${warnings.length} warnings`,
	);
	process.exit(errors.length ? 1 : 0);
}
