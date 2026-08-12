"use client";

import Copy from "@carbon/icons-react/es/Copy";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@crm/ui/components/accordion";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@crm/ui/components/alert-dialog";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import { Icon } from "@crm/ui/components/icon";
import { Label } from "@crm/ui/components/label";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import { Switch } from "@crm/ui/components/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function TrackingScript() {
	const t = useTranslations("settings");
	const common = useTranslations("common");
	const trpc = useTRPC();
	const cache = useCrmCache();
	const tracking = useQuery(trpc.tracking.settings.queryOptions());
	const [section, setSection] = useState("html");

	const setFlag = useMutation(
		trpc.tracking.setFlag.mutationOptions({
			onSuccess: async (_result, input) => {
				await cache.tracking();
				toast.success(
					input.enabled
						? t("tracking.trackingPaused")
						: t("tracking.trackingResumed"),
				);
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const rotate = useMutation(
		trpc.tracking.rotateSiteId.mutationOptions({
			onSuccess: async () => {
				await cache.tracking();
				toast.success(t("tracking.siteIdRotated"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!tracking.data) return null;

	const {
		siteId,
		snippet,
		tagManagerSnippet,
		scriptUrl,
		receivingSince,
		paused,
		canManage,
	} = tracking.data;

	const copy = (value: string | null) => {
		const clipboard = navigator.clipboard;

		if (!value || !clipboard) {
			toast.error(t("tracking.scriptCopyUnavailable"));
			return;
		}

		clipboard
			.writeText(value)
			.then(() => toast.success(t("tracking.scriptCopied")))
			.catch(() => toast.error(t("tracking.scriptCopyFailed")));
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<div className="flex items-center gap-2">
						{t("tracking.scriptCardTitle")}
						<StatusIndicator
							size="sm"
							tone={paused ? "warning" : receivingSince ? "success" : "neutral"}
							label={
								paused
									? t("tracking.scriptStatusPaused")
									: receivingSince
										? t("tracking.scriptStatusReceiving")
										: t("tracking.scriptStatusNone")
							}
						/>
					</div>
				</CardTitle>
				<CardDescription>{t("tracking.scriptCardDescription")}</CardDescription>

				<CardAction>
					<Button
						size="sm"
						onClick={() =>
							copy(section === "gtm" ? tagManagerSnippet : snippet)
						}
						type="button"
					>
						<Icon icon={Copy} data-icon="inline-start" />
						{t("tracking.copy")}
					</Button>
				</CardAction>
			</CardHeader>

			<CardContent>
				<Accordion
					type="single"
					collapsible
					value={section}
					onValueChange={setSection}
				>
					<AccordionItem value="html">
						<AccordionTrigger>{t("tracking.pasteIntoHtml")}</AccordionTrigger>
						<AccordionContent className="flex flex-col gap-4">
							<pre className="overflow-x-auto rounded-md border bg-muted p-4 font-mono text-code-foreground text-xs/5">
								<span className="text-code-accent">{"<script"}</span>
								{"\n  src="}
								<span className="text-code-string">{`"${scriptUrl}"`}</span>
								{"\n  data-site="}
								<span className="text-code-string">{`"${siteId}"`}</span>
								{"\n  async\n  defer\n"}
								<span className="text-code-accent">{"></script>"}</span>
							</pre>
							<p className="text-muted-foreground text-xs/relaxed">
								{t("tracking.siteIdLabel")}{" "}
								<span className="font-mono text-foreground">{siteId}</span>{" "}
								{t("tracking.rotateStopsAllCopies")}
							</p>
						</AccordionContent>
					</AccordionItem>

					<AccordionItem value="gtm">
						<AccordionTrigger>{t("tracking.addViaGtm")}</AccordionTrigger>
						<AccordionContent className="flex flex-col gap-4">
							<pre className="overflow-x-auto rounded-md border bg-muted p-4 font-mono text-code-foreground text-xs/5">
								<span className="text-code-accent">{"<script"}</span>
								{"\n  src="}
								<span className="text-code-string">{`"${scriptUrl}?site=${siteId}"`}</span>
								{"\n  async\n  defer\n"}
								<span className="text-code-accent">{"></script>"}</span>
							</pre>
							<ol className="flex list-decimal flex-col gap-1 pl-4 text-muted-foreground text-xs/relaxed">
								<li>{t("tracking.gtmStep1")}</li>
								<li>{t("tracking.gtmStep2")}</li>
								<li>
									{t("tracking.gtmStep3Prefix")}{" "}
									<span className="font-mono text-foreground">{scriptUrl}</span>{" "}
									{t("tracking.gtmStep3Suffix")}
								</li>
							</ol>
							<p className="text-muted-foreground text-xs/relaxed">
								{t.rich("tracking.gtmDataSiteAttributeNotice", {
									code: (chunks) => (
										<span className="font-mono text-foreground">{chunks}</span>
									),
								})}
							</p>
						</AccordionContent>
					</AccordionItem>
				</Accordion>

				<div className="flex items-center justify-between gap-6">
					<Label
						htmlFor="tracking-paused"
						className="flex flex-col items-start gap-1"
					>
						<span className="text-sm">{t("tracking.pauseTrackingLabel")}</span>
						<span className="font-normal text-muted-foreground text-xs">
							{t("tracking.pauseTrackingHint")}
						</span>
					</Label>

					<Switch
						id="tracking-paused"
						checked={paused}
						disabled={!canManage || setFlag.isPending}
						onCheckedChange={(enabled) =>
							setFlag.mutate({ flag: "paused", enabled })
						}
					/>
				</div>

				<CardFooter>
					<div className="-ml-2 flex flex-wrap items-center gap-1 text-muted-foreground">
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button
									variant="ghost"
									size="xs"
									disabled={!canManage || rotate.isPending}
								>
									{t("tracking.rotateSiteId")}
								</Button>
							</AlertDialogTrigger>

							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>
										{t("tracking.rotateSiteIdConfirmTitle")}
									</AlertDialogTitle>
									<AlertDialogDescription>
										{t("tracking.rotateSiteIdDescription")}
									</AlertDialogDescription>
								</AlertDialogHeader>

								<AlertDialogFooter>
									<AlertDialogCancel>{common("cancel")}</AlertDialogCancel>
									<AlertDialogAction
										variant="destructive"
										onClick={() => rotate.mutate()}
									>
										{t("tracking.rotate")}
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</div>
				</CardFooter>
			</CardContent>
		</Card>
	);
}
