"use client";

import Copy from "@carbon/icons-react/es/Copy";
import { Button } from "@crm/ui/components/button";
import { Icon } from "@crm/ui/components/icon";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

export function CopyValue({ value, label }: { value: string; label: string }) {
	const t = useTranslations("settings");

	const unavailable = () =>
		toast.error(t("sso.copyUnavailable", { label: label.toLowerCase() }));

	return (
		<Button
			variant="ghost"
			size="icon"
			type="button"
			onClick={() => {
				const clipboard = navigator.clipboard;

				if (!clipboard) {
					unavailable();
					return;
				}

				clipboard
					.writeText(value)
					.then(() => toast.success(t("sso.copied", { label })))
					.catch(unavailable);
			}}
		>
			<Icon icon={Copy} />
			<span className="sr-only">
				{t("sso.copyAriaLabel", { label: label.toLowerCase() })}
			</span>
		</Button>
	);
}
