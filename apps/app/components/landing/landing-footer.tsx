import { Link } from "@crm/ui/components/link";
import Logo from "@crm/ui/components/logo";
import { getTranslations } from "next-intl/server";
import { REPO_LINKS } from "./links";
import { Wordmark } from "./wordmark";

export async function LandingFooter() {
	const t = await getTranslations("landing");

	return (
		<footer className="relative flex w-full shrink-0 flex-col items-center border-border border-t">
			<div className="flex w-full max-w-6xl flex-col items-start justify-between gap-12 px-6 py-16 sm:flex-row sm:gap-16">
				<div className="flex w-[280px] max-w-full shrink-0 flex-col gap-[14px]">
					<Wordmark />
					<p className="text-[13px]/[21px] text-muted-foreground">
						{t("footerTagline")}
					</p>
				</div>

				<nav className="flex w-[180px] shrink-0 flex-col items-start gap-[14px]">
					<p className="font-mono text-[11px]/4 text-muted-foreground tracking-widest">
						{t("footerProjectHeading")}
					</p>
					{REPO_LINKS.map((link) => (
						<Link
							key={link.key}
							variant="quiet"
							href={link.href}
							target="_blank"
							rel="noreferrer"
							className="text-[13px]/6"
						>
							{t(link.labelKey)}
						</Link>
					))}
				</nav>
			</div>

			<div className="flex w-full justify-center border-border border-t">
				<div className="flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4 md:h-[60px] md:py-0">
					<p className="flex flex-1 items-center gap-[5px] pt-[2px] text-[13px]/[21px] text-muted-foreground">
						{t("footerBuiltWithLove")}
						<Logo className="size-[13px] shrink-0 text-foreground" />
						<Link
							href="https://trycomp.ai?utm_source=crm_landing_footer&utm_medium=referral"
							target="_blank"
							className="font-medium text-foreground"
						>
							Comp AI
						</Link>
					</p>

					<p className="flex items-center gap-2 text-[13px]/5 text-muted-foreground">
						<span className="size-1.5 shrink-0 rounded-full bg-ring" />
						{t("footerAllSystemsNormal")}
					</p>
				</div>
			</div>
		</footer>
	);
}
