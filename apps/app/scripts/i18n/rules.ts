import ts from "typescript";

export type Finding = {
	file: string;
	line: number;
	column: number;
	text: string;
	rule: string;
};

export const RULE_JSX_TEXT = "jsx-text";
export const RULE_JSX_EXPRESSION = "jsx-expression";
export const RULE_JSX_ATTRIBUTE = "jsx-attribute";
export const RULE_TOAST_LITERAL = "toast-literal";

const LETTER = /\p{L}/u;
const ENTITY = /&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g;
const WHITESPACE = /\s+/g;

const TRANSLATABLE_ATTRIBUTES = new Set([
	"placeholder",
	"title",
	"aria-label",
	"alt",
]);

const TOAST_ROOTS = new Set(["toast"]);

function normalise(value: string): string {
	return value.replace(WHITESPACE, " ").trim();
}

function hasLetter(value: string): boolean {
	return LETTER.test(value.replace(ENTITY, " "));
}

function positionOf(
	source: ts.SourceFile,
	offset: number,
): { line: number; column: number } {
	const { line, character } = source.getLineAndCharacterOfPosition(offset);
	return { line: line + 1, column: character + 1 };
}

function templateLiteralText(node: ts.TemplateExpression): string {
	let text = node.head.text;
	for (const span of node.templateSpans) {
		text += " ";
		text += span.literal.text;
	}
	return text;
}

function isStringLike(
	node: ts.Node,
): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
	return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function toastRootName(expression: ts.Expression): string | undefined {
	if (ts.isIdentifier(expression)) return expression.text;
	if (ts.isPropertyAccessExpression(expression)) {
		return toastRootName(expression.expression);
	}
	if (ts.isCallExpression(expression)) {
		return toastRootName(expression.expression);
	}
	return undefined;
}

function isToastCall(node: ts.CallExpression): boolean {
	const root = toastRootName(node.expression);
	return root !== undefined && TOAST_ROOTS.has(root);
}

function jsxTextFinding(
	node: ts.JsxText,
	source: ts.SourceFile,
	file: string,
): Finding | undefined {
	const raw = node.getText(source);
	const trimmed = normalise(raw);
	if (trimmed.length === 0) return undefined;
	if (!hasLetter(trimmed)) return undefined;
	const offset = node.getStart(source) + (raw.length - raw.trimStart().length);
	const { line, column } = positionOf(source, offset);
	return { file, line, column, text: trimmed, rule: RULE_JSX_TEXT };
}

function literalFinding(
	node: ts.Node,
	source: ts.SourceFile,
	file: string,
	rule: string,
): Finding | undefined {
	let text: string | undefined;
	if (isStringLike(node)) text = node.text;
	else if (ts.isTemplateExpression(node)) text = templateLiteralText(node);
	if (text === undefined) return undefined;
	const trimmed = normalise(text);
	if (trimmed.length === 0) return undefined;
	if (!hasLetter(trimmed)) return undefined;
	const { line, column } = positionOf(source, node.getStart(source));
	return { file, line, column, text: trimmed, rule };
}

function collectRenderedLiterals(
	expression: ts.Expression,
	out: ts.Node[],
): void {
	if (ts.isParenthesizedExpression(expression)) {
		collectRenderedLiterals(expression.expression, out);
		return;
	}
	if (ts.isConditionalExpression(expression)) {
		collectRenderedLiterals(expression.whenTrue, out);
		collectRenderedLiterals(expression.whenFalse, out);
		return;
	}
	if (
		ts.isBinaryExpression(expression) &&
		(expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
			expression.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
			expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
	) {
		collectRenderedLiterals(expression.left, out);
		collectRenderedLiterals(expression.right, out);
		return;
	}
	if (isStringLike(expression) || ts.isTemplateExpression(expression)) {
		out.push(expression);
	}
}

function jsxExpressionFindings(
	node: ts.JsxExpression,
	source: ts.SourceFile,
	file: string,
): Finding[] {
	const parent = node.parent;
	if (!parent) return [];
	if (!ts.isJsxElement(parent) && !ts.isJsxFragment(parent)) return [];
	if (!node.expression) return [];
	const literals: ts.Node[] = [];
	collectRenderedLiterals(node.expression, literals);
	const findings: Finding[] = [];
	for (const literal of literals) {
		const finding = literalFinding(literal, source, file, RULE_JSX_EXPRESSION);
		if (finding) findings.push(finding);
	}
	return findings;
}

function jsxAttributeFinding(
	node: ts.JsxAttribute,
	source: ts.SourceFile,
	file: string,
): Finding | undefined {
	const name = ts.isIdentifier(node.name)
		? node.name.text
		: node.name.getText(source);
	if (!TRANSLATABLE_ATTRIBUTES.has(name)) return undefined;
	const initializer = node.initializer;
	if (!initializer || !ts.isStringLiteral(initializer)) return undefined;
	return literalFinding(initializer, source, file, RULE_JSX_ATTRIBUTE);
}

function toastFinding(
	node: ts.CallExpression,
	source: ts.SourceFile,
	file: string,
): Finding | undefined {
	if (!isToastCall(node)) return undefined;
	const first = node.arguments[0];
	if (!first) return undefined;
	if (!isStringLike(first) && !ts.isTemplateExpression(first)) return undefined;
	return literalFinding(first, source, file, RULE_TOAST_LITERAL);
}

export function scanSource(file: string, contents: string): Finding[] {
	const source = ts.createSourceFile(
		file,
		contents,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TSX,
	);
	const findings: Finding[] = [];

	const visit = (node: ts.Node): void => {
		if (ts.isJsxText(node)) {
			const finding = jsxTextFinding(node, source, file);
			if (finding) findings.push(finding);
		} else if (ts.isJsxExpression(node)) {
			findings.push(...jsxExpressionFindings(node, source, file));
		} else if (ts.isJsxAttribute(node)) {
			const finding = jsxAttributeFinding(node, source, file);
			if (finding) findings.push(finding);
		} else if (ts.isCallExpression(node)) {
			const finding = toastFinding(node, source, file);
			if (finding) findings.push(finding);
		}
		ts.forEachChild(node, visit);
	};

	ts.forEachChild(source, visit);

	findings.sort((a, b) => a.line - b.line || a.column - b.column);
	return findings;
}
