# Key naming convention

Rules (see `SKILL.md` for the full list; this is the quick version):

- `<namespace>.<area><Thing>` in camelCase.
- Namespace is one of the fixed ten: `common`, `nav`, `settings`, `deals`,
  `companies`, `contacts`, `dashboard`, `landing`, `agent-panel`, `ui`.
- The key names **meaning**, not location or DOM position.
- Promote to `common` only when the English value and the meaning are both
  identical at every call site. When unsure, duplicate the key in its own
  namespace — a wrong merge is harder to undo than a duplicate.
- ICU named placeholders (`{count}`, `{name}`), never positional (`{0}`).
- Embedded markup uses `t.rich` with named tags, never concatenation.

Five worked examples follow: a client component, a server component, a
`t.rich` case, an ICU plural, and a pure function that returns a key.

## 1. Client component — `useTranslations`

`"use client"` at the top of the file → the hook, called during render.

Before:

```tsx
"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Switch } from "@crm/ui/components/switch";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function NotificationsForm() {
	const trpc = useTRPC();
	const [enabled, setEnabled] = useState(true);

	const save = useMutation(
		trpc.settings.setNotifications.mutationOptions({
			onSuccess: () => toast.success("Notification settings saved."),
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Notifications</CardTitle>
				<CardDescription>
					Email alerts when a deal changes stage.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex items-center justify-between">
				<Switch
					checked={enabled}
					onCheckedChange={(next) => {
						setEnabled(next);
						save.mutate({ enabled: next });
					}}
				/>
				<Button variant="ghost" onClick={() => save.mutate({ enabled })}>
					Save
				</Button>
			</CardContent>
		</Card>
	);
}
```

After:

```tsx
"use client";

import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Switch } from "@crm/ui/components/switch";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";

export function NotificationsForm() {
	const t = useTranslations("settings");
	const common = useTranslations("common");
	const trpc = useTRPC();
	const [enabled, setEnabled] = useState(true);

	const save = useMutation(
		trpc.settings.setNotifications.mutationOptions({
			onSuccess: () => toast.success(t("notificationsSaved")),
			onError: (error) => toast.error(error.message),
		}),
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("notificationsTitle")}</CardTitle>
				<CardDescription>{t("notificationsDescription")}</CardDescription>
			</CardHeader>
			<CardContent className="flex items-center justify-between">
				<Switch
					checked={enabled}
					onCheckedChange={(next) => {
						setEnabled(next);
						save.mutate({ enabled: next });
					}}
				/>
				<Button variant="ghost" onClick={() => save.mutate({ enabled })}>
					{common("save")}
				</Button>
			</CardContent>
		</Card>
	);
}
```

`apps/app/messages/en/settings.json`:

```json
{
	"notificationsDescription": "Email alerts when a deal changes stage.",
	"notificationsSaved": "Notification settings saved.",
	"notificationsTitle": "Notifications"
}
```

`apps/app/messages/en/common.json`:

```json
{
	"save": "Save"
}
```

Naming: `settings` because the file lives under the settings route.
`notifications` is the area — the section this card owns, not the DOM node
(`notificationsTitle`, not `cardHeaderText`). `Save` moves to `common`
because it's the plain, unqualified verb — the same English word, meaning
the same thing, everywhere it appears in this app.

## 2. Server component — `getTranslations`, plus `generateMetadata`

No `"use client"`, rendered as JSX, `async`. `getTranslations` must be
awaited — this also forces the page component itself to become `async` if it
wasn't already.

Before:

```tsx
import type { Metadata } from "next";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@/components/page-shell";
import { NotificationsForm } from "./notifications-form";

export const metadata: Metadata = {
	title: "Notifications",
};

export default function NotificationsPage() {
	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Notifications</PageShellTitle>
					<PageShellDescription>
						Choose which changes send you an email.
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<NotificationsForm />
			</PageShellContent>
		</PageShell>
	);
}
```

After:

```tsx
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
	PageShell,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellTitle,
} from "@/components/page-shell";
import { NotificationsForm } from "./notifications-form";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("settings");
	return { title: t("notificationsTitle") };
}

export default async function NotificationsPage() {
	const t = await getTranslations("settings");

	return (
		<PageShell>
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>{t("notificationsTitle")}</PageShellTitle>
					<PageShellDescription>
						{t("notificationsPageDescription")}
					</PageShellDescription>
				</PageShellHeading>
			</PageShellHeader>
			<PageShellContent>
				<NotificationsForm />
			</PageShellContent>
		</PageShell>
	);
}
```

`apps/app/messages/en/settings.json` (added to the object from example 1):

```json
{
	"notificationsPageDescription": "Choose which changes send you an email.",
	"notificationsTitle": "Notifications"
}
```

Naming: `generateMetadata` and the page body both say "Notifications" with
the same meaning — the section's name — so they share
`settings.notificationsTitle` rather than each minting their own key. The
page's longer description is a **different** string from the card's
description in example 1 even though both are about notifications, so it
gets its own key, `notificationsPageDescription`, not a merge.

## 3. `t.rich` — embedded markup

A string with a real link or emphasis inside it. Never build this by
concatenating JSX around a translated fragment — the word order breaks the
moment the translation isn't English word order.

Before:

```tsx
"use client";

import { CONTEXT_DEV_SIGNUP_URL } from "@crm/db/settings";
import {
	Field,
	FieldDescription,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";

export function ResearchKeyField({
	keyId,
	draft,
	onChange,
}: {
	keyId: string;
	draft: string;
	onChange: (value: string) => void;
}) {
	return (
		<Field>
			<FieldLabel htmlFor={keyId}>Context API key</FieldLabel>
			<Input
				id={keyId}
				value={draft}
				onChange={(event) => onChange(event.target.value)}
			/>
			<FieldDescription>
				Don't have a Context API key?{" "}
				<a
					href={CONTEXT_DEV_SIGNUP_URL}
					target="_blank"
					rel="noreferrer"
					className="underline underline-offset-4 hover:text-foreground"
				>
					Sign up here
				</a>
			</FieldDescription>
		</Field>
	);
}
```

After:

```tsx
"use client";

import { CONTEXT_DEV_SIGNUP_URL } from "@crm/db/settings";
import {
	Field,
	FieldDescription,
	FieldLabel,
} from "@crm/ui/components/field";
import { Input } from "@crm/ui/components/input";
import { useTranslations } from "next-intl";

export function ResearchKeyField({
	keyId,
	draft,
	onChange,
}: {
	keyId: string;
	draft: string;
	onChange: (value: string) => void;
}) {
	const t = useTranslations("settings");

	return (
		<Field>
			<FieldLabel htmlFor={keyId}>{t("researchKeyLabel")}</FieldLabel>
			<Input
				id={keyId}
				value={draft}
				onChange={(event) => onChange(event.target.value)}
			/>
			<FieldDescription>
				{t.rich("researchKeySignUpPrompt", {
					link: (chunks) => (
						<a
							href={CONTEXT_DEV_SIGNUP_URL}
							target="_blank"
							rel="noreferrer"
							className="underline underline-offset-4 hover:text-foreground"
						>
							{chunks}
						</a>
					),
				})}
			</FieldDescription>
		</Field>
	);
}
```

`apps/app/messages/en/settings.json`:

```json
{
	"researchKeyLabel": "Context API key",
	"researchKeySignUpPrompt": "Don't have a Context API key? <link>Sign up here</link>"
}
```

Naming: the tag name (`link`) describes what the markup **does**, not what
element it happens to be today — if this ever became a `<button>` that opens
a modal instead of an `<a>`, the catalog message and the key would not need
to change, only the render function passed to `t.rich`.

## 4. ICU plural

Counts change form depending on the number in most languages — never build
this with `formatCount`-style concatenation (`count + " " + noun`) or a
ternary on `count === 1`. Use an ICU `plural` message and let next-intl
select the branch.

Before:

```tsx
"use client";

import { Button } from "@crm/ui/components/button";
import { formatCount } from "@crm/ui/lib/format";

export function DealsBulkActions({ count }: { count: number }) {
	return (
		<div className="flex items-center gap-3">
			<span className="text-muted-foreground text-sm">
				{formatCount(count, "deal", "deals")} selected
			</span>
			<Button variant="destructive">Delete</Button>
		</div>
	);
}
```

After:

```tsx
"use client";

import { Button } from "@crm/ui/components/button";
import { useTranslations } from "next-intl";

export function DealsBulkActions({ count }: { count: number }) {
	const t = useTranslations("deals");
	const common = useTranslations("common");

	return (
		<div className="flex items-center gap-3">
			<span className="text-muted-foreground text-sm">
				{t("selectedCount", { count })}
			</span>
			<Button variant="destructive">{common("delete")}</Button>
		</div>
	);
}
```

`apps/app/messages/en/deals.json`:

```json
{
	"selectedCount": "{count, plural, one {# deal selected} other {# deals selected}}"
}
```

`apps/app/messages/en/common.json` (added to example 1's object):

```json
{
	"delete": "Delete"
}
```

The `#` inside each `plural` branch is ICU shorthand for the `count` value
itself, formatted as a number — you pass `{ count }` once, the message
decides both which branch to use and where the number is printed. Never
write a second placeholder for the number; `#` already is one.

## 5. Pure function — return a key, translate at the render site

`apps/app/lib/chat-date-group.ts` is a real instance of this shape: a
non-component helper, called from both a component and a test, whose return
type is a hardcoded English union.

Before:

```ts
const DAY_MS = 86_400_000;

export type ChatDateGroup = "Today" | "Yesterday" | "Last 7 days";

export function chatDateGroup(
	lastMessageAt: string,
	now: number,
): ChatDateGroup | null {
	if (!now) return null;

	const daysAgo =
		Math.floor(now / DAY_MS) -
		Math.floor(new Date(lastMessageAt).getTime() / DAY_MS);
	if (daysAgo <= 0) return "Today";
	if (daysAgo === 1) return "Yesterday";
	if (daysAgo <= 7) return "Last 7 days";
	return null;
}
```

After:

```ts
const DAY_MS = 86_400_000;

export type ChatDateGroupKey = "today" | "yesterday" | "last7Days";

export function chatDateGroup(
	lastMessageAt: string,
	now: number,
): ChatDateGroupKey | null {
	if (!now) return null;

	const daysAgo =
		Math.floor(now / DAY_MS) -
		Math.floor(new Date(lastMessageAt).getTime() / DAY_MS);
	if (daysAgo <= 0) return "today";
	if (daysAgo === 1) return "yesterday";
	if (daysAgo <= 7) return "last7Days";
	return null;
}
```

Render site — the function still knows nothing about `next-intl`; the
component that calls it does the translating:

```tsx
"use client";

import { useTranslations } from "next-intl";
import { chatDateGroup, type ChatDateGroupKey } from "@/lib/chat-date-group";

const CHAT_DATE_GROUP_KEY: Record<ChatDateGroupKey, string> = {
	today: "chatDateGroupToday",
	yesterday: "chatDateGroupYesterday",
	last7Days: "chatDateGroupLast7Days",
};

export function ChatDateGroupLabel({
	lastMessageAt,
	now,
}: {
	lastMessageAt: string;
	now: number;
}) {
	const t = useTranslations("common");
	const group = chatDateGroup(lastMessageAt, now);
	if (!group) return null;
	return <span>{t(CHAT_DATE_GROUP_KEY[group])}</span>;
}
```

`apps/app/messages/en/common.json` (added to the object from examples 1 and
4):

```json
{
	"chatDateGroupLast7Days": "Last 7 days",
	"chatDateGroupToday": "Today",
	"chatDateGroupYesterday": "Yesterday"
}
```

Test — assert the **key**, never re-import the catalog to assert English:

```ts
import { describe, expect, test } from "bun:test";
import { chatDateGroup } from "../lib/chat-date-group";

describe("chat date groups", () => {
	const now = Date.parse("2026-08-05T20:00:00.000Z");

	test("uses deterministic UTC calendar buckets", () => {
		expect(chatDateGroup("2026-08-05T00:00:00.000Z", now)).toBe("today");
		expect(chatDateGroup("2026-08-04T23:59:59.999Z", now)).toBe("yesterday");
		expect(chatDateGroup("2026-07-30T12:00:00.000Z", now)).toBe("last7Days");
		expect(chatDateGroup("2026-07-28T23:59:59.999Z", now)).toBeNull();
	});
});
```

If a test like this one starts failing after the return type changes, the
fix is always to update its expectations to the new keys. It is never to
`import en from "../messages/en/common.json"` and look the English back up —
that re-creates the exact coupling between a pure helper and the catalog that
this pattern exists to avoid.
