import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Glob } from "bun";

const ROOT = path.resolve(import.meta.dir, "../../../..");
const SOURCE_DIR = path.join(ROOT, "apps/app/messages/en");
const TARGET_DIR = path.join(ROOT, "apps/app/messages/pseudo");

const ACCENTS: Record<string, string> = {
	a: "à",
	b: "ƀ",
	c: "ç",
	d: "ð",
	e: "ê",
	f: "ƒ",
	g: "ĝ",
	h: "ĥ",
	i: "ì",
	j: "ĵ",
	k: "ķ",
	l: "ĺ",
	m: "ṁ",
	n: "ñ",
	o: "ô",
	p: "þ",
	q: "ʠ",
	r: "ŕ",
	s: "š",
	t: "ţ",
	u: "û",
	v: "ṽ",
	w: "ŵ",
	x: "ẋ",
	y: "ý",
	z: "ž",
	A: "Å",
	B: "Ɓ",
	C: "Ç",
	D: "Ð",
	E: "Ê",
	F: "Ƒ",
	G: "Ĝ",
	H: "Ĥ",
	I: "Ì",
	J: "Ĵ",
	K: "Ķ",
	L: "Ĺ",
	M: "Ṁ",
	N: "Ñ",
	O: "Ô",
	P: "Þ",
	Q: "Ǫ",
	R: "Ŕ",
	S: "Š",
	T: "Ţ",
	U: "Û",
	V: "Ṽ",
	W: "Ŵ",
	X: "Ẋ",
	Y: "Ý",
	Z: "Ž",
};

type Catalog = { [key: string]: string | number | boolean | null | Catalog };

export function matchingBrace(message: string, open: number): number {
	let depth = 0;
	for (let index = open; index < message.length; index += 1) {
		const char = message[index];
		if (char === "{") depth += 1;
		else if (char === "}") {
			depth -= 1;
			if (depth === 0) return index;
		}
	}
	return -1;
}

function pseudoArgumentBody(body: string): string {
	let out = "";
	let index = 0;
	while (index < body.length) {
		const char = body[index];
		if (char === undefined) break;
		if (char === "{") {
			const end = matchingBrace(body, index);
			if (end === -1) {
				out += body.slice(index);
				break;
			}
			out += `{${pseudoMessage(body.slice(index + 1, end))}}`;
			index = end + 1;
			continue;
		}
		out += char;
		index += 1;
	}
	return out;
}

function pseudoArgument(inner: string): string {
	const comma = inner.indexOf(",");
	if (comma === -1) return `{${inner}}`;
	return `{${inner.slice(0, comma)}${pseudoArgumentBody(inner.slice(comma))}}`;
}

export function pseudoMessage(message: string): string {
	let out = "";
	let index = 0;
	while (index < message.length) {
		const char = message[index];
		if (char === undefined) break;
		if (char === "'") {
			const next = message[index + 1];
			if (next === "'") {
				out += "''";
				index += 2;
				continue;
			}
			if (next === "{" || next === "}") {
				const close = message.indexOf("'", index + 2);
				if (close === -1) {
					out += message.slice(index);
					break;
				}
				out += message.slice(index, close + 1);
				index = close + 1;
				continue;
			}
			out += char;
			index += 1;
			continue;
		}
		if (char === "<") {
			const close = message.indexOf(">", index);
			if (close === -1) {
				out += char;
				index += 1;
				continue;
			}
			out += message.slice(index, close + 1);
			index = close + 1;
			continue;
		}
		if (char === "{") {
			const close = matchingBrace(message, index);
			if (close === -1) {
				out += message.slice(index);
				break;
			}
			out += pseudoArgument(message.slice(index + 1, close));
			index = close + 1;
			continue;
		}
		out += ACCENTS[char] ?? char;
		index += 1;
	}
	return out;
}

export function pseudoCatalog(catalog: Catalog): Catalog {
	const out: Catalog = {};
	for (const [key, value] of Object.entries(catalog)) {
		if (typeof value === "string") out[key] = pseudoMessage(value);
		else if (value !== null && typeof value === "object") {
			out[key] = pseudoCatalog(value);
		} else out[key] = value;
	}
	return out;
}

async function main(): Promise<void> {
	await mkdir(TARGET_DIR, { recursive: true });
	const glob = new Glob("*.json");
	const written: string[] = [];
	for await (const name of glob.scan({ cwd: SOURCE_DIR, onlyFiles: true })) {
		const source = await readFile(path.join(SOURCE_DIR, name), "utf8");
		const catalog = pseudoCatalog(JSON.parse(source) as Catalog);
		await writeFile(
			path.join(TARGET_DIR, name),
			`${JSON.stringify(catalog, null, "\t")}\n`,
			"utf8",
		);
		written.push(name);
	}
	written.sort();
	console.log(
		`wrote ${written.length} pseudo catalogs to apps/app/messages/pseudo`,
	);
}

if (import.meta.main) await main();
