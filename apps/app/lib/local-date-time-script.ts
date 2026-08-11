export const DAY_MS = 86_400_000;
export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;

export const LOCAL_DATE_TIME_LABEL_KEYS = {
	empty: "relativeTimeEmpty",
	justNow: "relativeTimeJustNow",
	minutes: "relativeTimeMinutes",
	hours: "relativeTimeHours",
	days: "relativeTimeDays",
	future: "relativeTimeFuture",
	past: "relativeTimePast",
} as const;

export type LocalDateTimeLabels = Record<
	keyof typeof LOCAL_DATE_TIME_LABEL_KEYS,
	string
>;

export function localDateTimeLabels(
	read: (key: string) => string,
): LocalDateTimeLabels {
	return {
		empty: read(LOCAL_DATE_TIME_LABEL_KEYS.empty),
		justNow: read(LOCAL_DATE_TIME_LABEL_KEYS.justNow),
		minutes: read(LOCAL_DATE_TIME_LABEL_KEYS.minutes),
		hours: read(LOCAL_DATE_TIME_LABEL_KEYS.hours),
		days: read(LOCAL_DATE_TIME_LABEL_KEYS.days),
		future: read(LOCAL_DATE_TIME_LABEL_KEYS.future),
		past: read(LOCAL_DATE_TIME_LABEL_KEYS.past),
	};
}

export function scriptJson(value: unknown): string {
	return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function buildLocalDateTimeScript(
	locale: string,
	labels: LocalDateTimeLabels,
): string {
	return `{var s="time[data-local-date-kind]",L=${scriptJson(locale)},B=${scriptJson(labels)},p=function(m,k,v){return m.split("{"+k+"}").join(v)},f=function(n){try{var k=n.dataset.localDateKind,v=n.dataset.localDateValue,e=n.dataset.localDateEnd,o=JSON.parse(n.dataset.localDateOptions||"{}"),d=new Date(v),t=d.getTime(),x=Date.now()-t,a=Math.abs(x),r;if(k==="date-time")r=new Intl.DateTimeFormat(L,o).format(d);else if(k==="date-range")r=new Intl.DateTimeFormat(L,o).formatRange(d,new Date(e));else if(k==="day")r=new Intl.DateTimeFormat(L,o).format(new Date(v+"T00:00:00"));else if(k==="relative-date"){var z=new Date(),q=(Date.UTC(z.getFullYear(),z.getMonth(),z.getDate())-Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()))/${DAY_MS};r=new Intl.RelativeTimeFormat(L,{numeric:"auto"}).format(-q,"day")}else if(!Number.isFinite(t))r=B.empty;else if(a<${MINUTE_MS})r=B.justNow;else if(a>=${30 * DAY_MS})r=new Intl.DateTimeFormat(L,{month:"short",day:"numeric"}).format(d);else{var u=a<${HOUR_MS}?p(B.minutes,"count",Math.floor(a/${MINUTE_MS})):a<${DAY_MS}?p(B.hours,"count",Math.floor(a/${HOUR_MS})):p(B.days,"count",Math.floor(a/${DAY_MS}));r=p(x<0?B.future:B.past,"distance",u)}n.textContent=r}catch{}};var c=function(r){if(r.nodeType===1&&r.matches&&r.matches(s))f(r);if(r.querySelectorAll)r.querySelectorAll(s).forEach(f)};c(document);new MutationObserver(function(m){m.forEach(function(r){r.addedNodes.forEach(c)})}).observe(document.documentElement,{childList:true,subtree:true})}`;
}
