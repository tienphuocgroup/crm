"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Field, FieldDescription, FieldLabel } from "@crm/ui/components/field";
import { Label } from "@crm/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { Switch } from "@crm/ui/components/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

function toggles(t: ReturnType<typeof useTranslations>) {
	return [
		{
			flag: "cookieSubdomains",
			label: t("tracking.cookieSubdomainsLabel"),
			hint: t("tracking.cookieSubdomainsHint"),
		},
		{
			flag: "secureCookies",
			label: t("tracking.secureCookiesLabel"),
			hint: t("tracking.secureCookiesHint"),
		},
		{
			flag: "honourDnt",
			label: t("tracking.honourDntLabel"),
			hint: t("tracking.honourDntHint"),
		},
	] as const;
}

export function TrackingCookies() {
	const t = useTranslations("settings");
	const trpc = useTRPC();
	const cache = useCrmCache();
	const lifetimeId = useId();

	const tracking = useQuery(trpc.tracking.settings.queryOptions());

	const setFlag = useMutation(
		trpc.tracking.setFlag.mutationOptions({
			onSuccess: () => cache.tracking({ settle: "record" }),
			onError: (error) => toast.error(error.message),
		}),
	);

	const setLifetime = useMutation(
		trpc.tracking.setCookieLifetime.mutationOptions({
			onSuccess: async () => {
				await cache.tracking();
				toast.success(t("tracking.cookieLifetimeSaved"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!tracking.data) return null;

	const { canManage, cookieDays, cookieLifetimes } = tracking.data;
	const busy = !canManage || setFlag.isPending || setLifetime.isPending;

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("tracking.cookiesTitle")}</CardTitle>
				<CardDescription>{t("tracking.cookiesDescription")}</CardDescription>
			</CardHeader>

			<CardContent>
				{toggles(t).map((toggle) => (
					<div
						key={toggle.flag}
						className="flex items-center justify-between gap-6"
					>
						<Label
							htmlFor={`tracking-${toggle.flag}`}
							className="flex flex-col items-start gap-1"
						>
							<span className="text-sm">{toggle.label}</span>
							<span className="font-normal text-muted-foreground text-xs">
								{toggle.hint}
							</span>
						</Label>

						<Switch
							id={`tracking-${toggle.flag}`}
							checked={tracking.data[toggle.flag]}
							disabled={busy}
							onCheckedChange={(enabled) =>
								setFlag.mutate({ flag: toggle.flag, enabled })
							}
						/>
					</div>
				))}

				<Field>
					<FieldLabel htmlFor={lifetimeId}>
						{t("tracking.cookieLifetimeLabel")}
					</FieldLabel>
					<Select
						value={String(cookieDays)}
						disabled={busy}
						onValueChange={(value) =>
							setLifetime.mutate({ days: Number(value) })
						}
					>
						<SelectTrigger id={lifetimeId} className="w-full max-w-sm">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{cookieLifetimes.map((lifetime) => (
								<SelectItem key={lifetime.days} value={String(lifetime.days)}>
									{lifetime.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<FieldDescription>
						{t("tracking.cookieLifetimeDescription")}
					</FieldDescription>
				</Field>
			</CardContent>
		</Card>
	);
}
