import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "../../i18n/locale";
import { matchingBrace } from "./pseudo";

const ROOT = path.resolve(import.meta.dir, "../../../..");
const MESSAGES_DIR = path.join(ROOT, "apps/app/messages");

type Catalog = { [key: string]: string | Catalog };

function flatten(
	catalog: Catalog,
	prefix = "",
	out = new Map<string, string>(),
): Map<string, string> {
	for (const [key, value] of Object.entries(catalog)) {
		const flatKey = prefix ? `${prefix}.${key}` : key;
		if (typeof value === "string") out.set(flatKey, value);
		else flatten(value, flatKey, out);
	}
	return out;
}

type MessageShape = { args: Set<string>; tags: Set<string>; balanced: boolean };

const TAG_NAME = /^\/?[a-zA-Z][a-zA-Z0-9]*$/;

function collectShape(segment: string, shape: MessageShape): void {
	let index = 0;
	while (index < segment.length) {
		const char = segment[index];
		if (char === undefined) break;
		if (char === "'") {
			const next = segment[index + 1];
			if (next === "'") {
				index += 2;
				continue;
			}
			if (next === "{" || next === "}" || next === "<") {
				const close = segment.indexOf("'", index + 2);
				if (close === -1) return;
				index = close + 1;
				continue;
			}
			index += 1;
			continue;
		}
		if (char === "<") {
			const close = segment.indexOf(">", index);
			if (close === -1) {
				index += 1;
				continue;
			}
			const name = segment.slice(index + 1, close);
			if (TAG_NAME.test(name)) shape.tags.add(name.replace("/", ""));
			index = close + 1;
			continue;
		}
		if (char === "{") {
			const close = matchingBrace(segment, index);
			if (close === -1) {
				shape.balanced = false;
				return;
			}
			const inner = segment.slice(index + 1, close);
			const comma = inner.indexOf(",");
			const name = (comma === -1 ? inner : inner.slice(0, comma)).trim();
			if (name) shape.args.add(name);
			if (comma !== -1) {
				const body = inner.slice(comma);
				let cursor = 0;
				while (cursor < body.length) {
					if (body[cursor] === "{") {
						const end = matchingBrace(body, cursor);
						if (end === -1) {
							shape.balanced = false;
							return;
						}
						collectShape(body.slice(cursor + 1, end), shape);
						cursor = end + 1;
						continue;
					}
					cursor += 1;
				}
			}
			index = close + 1;
			continue;
		}
		index += 1;
	}
}

function shapeOf(message: string): MessageShape {
	const shape: MessageShape = {
		args: new Set(),
		tags: new Set(),
		balanced: true,
	};
	collectShape(message, shape);
	return shape;
}

async function loadCatalogs(locale: string): Promise<Map<string, string>> {
	const dir = path.join(MESSAGES_DIR, locale);
	const names = (await readdir(dir)).filter((name) => name.endsWith(".json"));
	const out = new Map<string, string>();
	for (const name of names.sort()) {
		const namespace = name.replace(/\.json$/, "");
		const source = await readFile(path.join(dir, name), "utf8");
		flatten(JSON.parse(source) as Catalog, namespace, out);
	}
	return out;
}

function difference(a: Set<string>, b: Set<string>): string[] {
	return [...a].filter((value) => !b.has(value)).sort();
}

async function main(): Promise<void> {
	const base = await loadCatalogs(DEFAULT_LOCALE);
	const errors: string[] = [];
	const warnings: string[] = [];

	for (const locale of SUPPORTED_LOCALES) {
		if (locale === DEFAULT_LOCALE) continue;
		const catalog = await loadCatalogs(locale);

		for (const key of base.keys()) {
			if (!catalog.has(key)) errors.push(`${locale}: missing ${key}`);
		}
		for (const key of catalog.keys()) {
			if (!base.has(key)) errors.push(`${locale}: extra ${key}`);
		}

		for (const [key, message] of catalog) {
			const baseMessage = base.get(key);
			if (baseMessage === undefined) continue;
			const shape = shapeOf(message);
			const baseShape = shapeOf(baseMessage);
			if (!shape.balanced) {
				errors.push(`${locale}: unbalanced braces in ${key}`);
				continue;
			}
			for (const arg of difference(shape.args, baseShape.args)) {
				errors.push(
					`${locale}: ${key} uses {${arg}} absent from ${DEFAULT_LOCALE}`,
				);
			}
			for (const tag of difference(shape.tags, baseShape.tags)) {
				errors.push(
					`${locale}: ${key} uses <${tag}> absent from ${DEFAULT_LOCALE}`,
				);
			}
			for (const tag of difference(baseShape.tags, shape.tags)) {
				errors.push(`${locale}: ${key} dropped <${tag}>`);
			}
			for (const arg of difference(baseShape.args, shape.args)) {
				warnings.push(`${locale}: ${key} does not use {${arg}}`);
			}
		}
	}

	for (const warning of warnings) console.warn(`warn ${warning}`);
	if (errors.length > 0) {
		for (const error of errors) console.error(`error ${error}`);
		console.error(`${errors.length} catalog error(s)`);
		process.exit(1);
	}
	console.log(
		`catalogs in sync for ${SUPPORTED_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE).join(", ")} (${warnings.length} warning(s))`,
	);
}

if (import.meta.main) await main();
