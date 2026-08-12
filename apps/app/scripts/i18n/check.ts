import { readFile } from "node:fs/promises";
import path from "node:path";
import { Glob } from "bun";
import allowlist from "./allowlist.json" with { type: "json" };
import ratchet from "./ratchet.json" with { type: "json" };
import { type Finding, scanSource } from "./rules";

const ROOT = path.resolve(import.meta.dir, "../../../..");

const SOURCE_GLOBS = ["apps/app/**/*.{ts,tsx}", "packages/ui/src/**/*.tsx"];

const EXCLUDED_SEGMENTS = new Set([
	"node_modules",
	".next",
	"dist",
	"build",
	".turbo",
	"generated",
	"test",
	"tests",
	"__tests__",
	"__mocks__",
]);

const EXCLUDED_PREFIXES = ["apps/app/scripts/"];

const TEST_FILE = /\.(?:test|spec)\.[cm]?tsx?$/;

const ALLOWLIST_SEPARATOR = "::";

type AllowlistEntry = { reason: string };

function isExcluded(relative: string): boolean {
	if (EXCLUDED_PREFIXES.some((prefix) => relative.startsWith(prefix))) {
		return true;
	}
	if (TEST_FILE.test(relative)) return true;
	return relative.split("/").some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

async function collectFiles(): Promise<string[]> {
	const files = new Set<string>();
	for (const pattern of SOURCE_GLOBS) {
		const glob = new Glob(pattern);
		for await (const match of glob.scan({ cwd: ROOT, onlyFiles: true })) {
			const relative = match.split(path.sep).join("/");
			if (isExcluded(relative)) continue;
			files.add(relative);
		}
	}
	return [...files].sort();
}

function loadAllowlist(): {
	anywhere: Set<string>;
	scoped: Set<string>;
	size: number;
} {
	const entries = allowlist as Record<string, AllowlistEntry>;
	const anywhere = new Set<string>();
	const scoped = new Set<string>();
	const missing: string[] = [];
	for (const [key, entry] of Object.entries(entries)) {
		if (!entry || typeof entry.reason !== "string" || !entry.reason.trim()) {
			missing.push(key);
			continue;
		}
		if (key.includes(ALLOWLIST_SEPARATOR)) scoped.add(key);
		else anywhere.add(key);
	}
	if (missing.length > 0) {
		console.error("allowlist entries without a reason:");
		for (const key of missing) console.error(`  ${key}`);
		process.exit(1);
	}
	return { anywhere, scoped, size: anywhere.size + scoped.size };
}

function isAllowlisted(
	finding: Finding,
	anywhere: Set<string>,
	scoped: Set<string>,
): boolean {
	if (anywhere.has(finding.text)) return true;
	return scoped.has(`${finding.file}${ALLOWLIST_SEPARATOR}${finding.text}`);
}

type Ratchet = { exact: Set<string>; globs: Glob[] };

function loadRatchet(): Ratchet {
	const patterns = ratchet as string[];
	return {
		exact: new Set(patterns),
		globs: patterns.map((pattern) => new Glob(pattern)),
	};
}

function isRatcheted(file: string, entries: Ratchet): boolean {
	if (entries.exact.has(file)) return true;
	return entries.globs.some((glob) => glob.match(file));
}

async function main(): Promise<void> {
	const started = Bun.nanoseconds();
	const { anywhere, scoped, size } = loadAllowlist();
	const entries = loadRatchet();
	const files = await collectFiles();

	const reported: Finding[] = [];
	const ratchetedFiles = new Set<string>();
	let allowlisted = 0;
	let suppressed = 0;

	await Promise.all(
		files.map(async (file) => {
			const contents = await readFile(path.join(ROOT, file), "utf8");
			const findings = scanSource(file, contents);
			for (const finding of findings) {
				if (isAllowlisted(finding, anywhere, scoped)) {
					allowlisted += 1;
					continue;
				}
				if (isRatcheted(file, entries)) {
					ratchetedFiles.add(file);
					suppressed += 1;
					continue;
				}
				reported.push(finding);
			}
		}),
	);

	reported.sort(
		(a, b) =>
			a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column,
	);

	for (const finding of reported) {
		console.log(
			`${finding.file}:${finding.line}:${finding.column}  ${JSON.stringify(
				finding.text,
			)}  [${finding.rule}]`,
		);
	}

	const elapsed = (Bun.nanoseconds() - started) / 1e9;
	console.log(
		`${reported.length} findings, ${ratchetedFiles.size} files ratcheted`,
	);
	console.log(
		`scanned ${files.length} files in ${elapsed.toFixed(2)}s — ${suppressed} ratcheted, ${allowlisted} allowlisted, ${size} allowlist entries`,
	);

	process.exit(reported.length > 0 ? 1 : 0);
}

await main();
