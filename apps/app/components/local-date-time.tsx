"use client";

import { dateTimeFormat } from "@crm/ui/lib/format";
import { fillUiString } from "@crm/ui/lib/ui-strings";
import { useLocale, useTranslations } from "next-intl";
import { intlLocale } from "@/i18n/locale";
import {
	DAY_MS,
	HOUR_MS,
	type LocalDateTimeLabels,
	localDateTimeLabels,
	MINUTE_MS,
} from "@/lib/local-date-time-script";

const relativeDateFormatters = new Map<string, Intl.RelativeTimeFormat>();
const LOCAL_DAY_OPTIONS = {
	month: "short",
	day: "numeric",
	year: "numeric",
} as const;
const SHORT_DAY_OPTIONS = {
	month: "short",
	day: "numeric",
} as const;

function useIntlLocale(): string {
	return intlLocale(useLocale());
}

function useLocalDateTimeLabels(): LocalDateTimeLabels {
	const t = useTranslations("common");
	return localDateTimeLabels((key) => t.raw(key) as string);
}

export function LocalDateTime({
	date,
	options,
}: {
	date: string;
	options: Intl.DateTimeFormatOptions;
}) {
	const locale = useIntlLocale();
	return (
		<LocalTime
			kind="date-time"
			date={date}
			options={options}
			fallback={dateTimeFormat(locale, options).format(new Date(date))}
		/>
	);
}

export function LocalDateTimeRange({
	start,
	end,
	options,
}: {
	start: string;
	end: string;
	options: Intl.DateTimeFormatOptions;
}) {
	const locale = useIntlLocale();
	return (
		<LocalTime
			kind="date-range"
			date={start}
			end={end}
			options={options}
			fallback={dateTimeFormat(locale, options).formatRange(
				new Date(start),
				new Date(end),
			)}
		/>
	);
}

export function LocalRelativeDate({ date }: { date: string }) {
	const locale = useIntlLocale();
	return (
		<LocalTime
			kind="relative-date"
			date={date}
			fallback={formatRelativeDate(date, locale)}
		/>
	);
}

export function LocalRelativeTime({ date }: { date: string }) {
	const locale = useIntlLocale();
	const labels = useLocalDateTimeLabels();
	return (
		<LocalTime
			kind="relative-time"
			date={date}
			fallback={formatRelativeTime(date, labels, locale)}
		/>
	);
}

export function LocalDay({ date }: { date: string }) {
	const locale = useIntlLocale();
	const day = date.slice(0, 10);
	return (
		<LocalTime
			kind="day"
			date={day}
			options={LOCAL_DAY_OPTIONS}
			fallback={dateTimeFormat(locale, LOCAL_DAY_OPTIONS).format(dayDate(day))}
		/>
	);
}

function LocalTime({
	kind,
	date,
	end,
	options,
	fallback,
}: {
	kind: "date-time" | "date-range" | "day" | "relative-date" | "relative-time";
	date: string;
	end?: string;
	options?: Intl.DateTimeFormatOptions;
	fallback: string;
}) {
	return (
		<time
			dateTime={date}
			data-local-date-kind={kind}
			data-local-date-value={date}
			data-local-date-end={end}
			data-local-date-options={options ? JSON.stringify(options) : undefined}
			suppressHydrationWarning
		>
			{fallback}
		</time>
	);
}

function formatRelativeDate(date: string, locale: string): string {
	const now = new Date();
	const then = new Date(date);
	const days = (calendarDay(now) - calendarDay(then)) / DAY_MS;
	return relativeDateFormatter(locale).format(-days, "day");
}

function formatRelativeTime(
	date: string,
	labels: LocalDateTimeLabels,
	locale: string,
): string {
	const then = new Date(date).getTime();
	if (!Number.isFinite(then)) return labels.empty;
	const difference = Date.now() - then;
	const absolute = Math.abs(difference);
	if (absolute < MINUTE_MS) return labels.justNow;
	if (absolute >= 30 * DAY_MS) {
		return dateTimeFormat(locale, SHORT_DAY_OPTIONS).format(new Date(then));
	}

	const distance =
		absolute < HOUR_MS
			? fillUiString(labels.minutes, {
					count: Math.floor(absolute / MINUTE_MS),
				})
			: absolute < DAY_MS
				? fillUiString(labels.hours, { count: Math.floor(absolute / HOUR_MS) })
				: fillUiString(labels.days, { count: Math.floor(absolute / DAY_MS) });
	return fillUiString(difference < 0 ? labels.future : labels.past, {
		distance,
	});
}

function calendarDay(date: Date): number {
	return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayDate(day: string): Date {
	return new Date(`${day}T00:00:00`);
}

function relativeDateFormatter(locale: string): Intl.RelativeTimeFormat {
	const cached = relativeDateFormatters.get(locale);
	if (cached) return cached;

	const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
	relativeDateFormatters.set(locale, formatter);
	return formatter;
}
