"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@crm/ui/components/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@crm/ui/components/select";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import {
	isSupportedLocale,
	SUPPORTED_LOCALES,
	type SupportedLocale,
} from "@/i18n/locale";
import { writeLocaleCookie } from "@/lib/locale";
import { useTRPC } from "@/lib/trpc/client";

const LOCALE_LABEL: Record<SupportedLocale, string> = {
	en: "English",
};

export function LanguageForm() {
	const trpc = useTRPC();
	const router = useRouter();
	const locale = useLocale();

	const save = useMutation(
		trpc.users.setLocale.mutationOptions({
			onError: (error) => toast.error(error.message),
		}),
	);

	const choose = (next: string) => {
		if (!isSupportedLocale(next) || next === locale) return;
		writeLocaleCookie(next);
		document.documentElement.lang = next;
		save.mutate({ locale: next });
		router.refresh();
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Language</CardTitle>
				<CardDescription>The language the CRM shows you.</CardDescription>
			</CardHeader>

			<CardContent>
				<Select value={locale} onValueChange={choose}>
					<SelectTrigger aria-label="Language" disabled={save.isPending}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{SUPPORTED_LOCALES.map((option) => (
							<SelectItem key={option} value={option}>
								{LOCALE_LABEL[option]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</CardContent>
		</Card>
	);
}
