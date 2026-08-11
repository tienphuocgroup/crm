"use client";

import Renew from "@carbon/icons-react/es/Renew";
import TrashCan from "@carbon/icons-react/es/TrashCan";
import {
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@crm/ui/components/dropdown-menu";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import {
	BulkActionsMenu,
	BulkDeleteDialog,
	BulkOwnerMenu,
	reportBulk,
} from "@/components/crm/bulk-actions";
import { useCrmCache } from "@/lib/trpc/cache";
import { useTRPC } from "@/lib/trpc/client";

export function ContactsBulkActions({
	ids,
	onDone,
}: {
	ids: string[];
	onDone: () => void;
}) {
	const t = useTranslations("contacts");
	const common = useTranslations("common");
	const trpc = useTRPC();
	const cache = useCrmCache();
	const users = useQuery(trpc.users.list.queryOptions());
	const companies = useQuery(trpc.companies.options.queryOptions({ q: "" }));
	const [confirming, setConfirming] = useState(false);

	const onError = (error: { message: string }) => toast.error(error.message);

	const assignOwner = useMutation(
		trpc.contacts.bulkAssignOwner.mutationOptions({
			onSuccess: async (result) => {
				await cache.contact();
				reportBulk(common, result, (count) =>
					t("bulkReassignedToast", { count }),
				);
				onDone();
			},
			onError,
		}),
	);

	const setCompany = useMutation(
		trpc.contacts.bulkSetCompany.mutationOptions({
			onSuccess: async (result) => {
				await cache.contact();
				reportBulk(common, result, (count) => t("bulkMovedToast", { count }));
				onDone();
			},
			onError,
		}),
	);

	const enrich = useMutation(
		trpc.contacts.bulkEnrich.mutationOptions({
			onSuccess: async (result) => {
				await cache.contact();
				reportBulk(common, result, (count) => t("bulkEnrichToast", { count }));
				onDone();
			},
			onError,
		}),
	);

	const remove = useMutation(
		trpc.contacts.bulkDelete.mutationOptions({
			onSuccess: async (result, variables) => {
				await cache.removedMany({ kind: "contact", ids: variables.ids });
				reportBulk(common, result, (count) => t("bulkDeletedToast", { count }));
				setConfirming(false);
				onDone();
			},
			onError,
		}),
	);

	const pending =
		assignOwner.isPending ||
		setCompany.isPending ||
		enrich.isPending ||
		remove.isPending;

	return (
		<>
			<BulkActionsMenu pending={pending}>
				<BulkOwnerMenu
					users={users.data ?? []}
					unassignedLabel={common("bulkUnassignedOption")}
					onSelect={(ownerId) => assignOwner.mutate({ ids, ownerId })}
				/>
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>
						{t("bulkMoveToCompanyLabel")}
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent className="max-h-72 overflow-y-auto">
						<DropdownMenuGroup>
							<DropdownMenuItem
								onSelect={() => setCompany.mutate({ ids, companyId: null })}
							>
								{t("noCompanyOption")}
							</DropdownMenuItem>
							{companies.data?.length === 0 ? (
								<DropdownMenuLabel>{t("bulkNoCompaniesYet")}</DropdownMenuLabel>
							) : (
								companies.data?.map((company) => (
									<DropdownMenuItem
										key={company.id}
										onSelect={() =>
											setCompany.mutate({ ids, companyId: company.id })
										}
									>
										{company.name}
									</DropdownMenuItem>
								))
							)}
						</DropdownMenuGroup>
					</DropdownMenuSubContent>
				</DropdownMenuSub>
				<DropdownMenuGroup>
					<DropdownMenuItem onSelect={() => enrich.mutate({ ids })}>
						<Renew />
						{common("reenrich")}
					</DropdownMenuItem>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem
						variant="destructive"
						onSelect={() => setConfirming(true)}
					>
						<TrashCan />
						{common("delete")}
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</BulkActionsMenu>

			<BulkDeleteDialog
				open={confirming}
				onOpenChange={setConfirming}
				title={t("bulkDeleteConfirmTitle", { count: ids.length })}
				description={t("bulkDeleteConfirmDescription")}
				onConfirm={() => remove.mutate({ ids })}
			/>
		</>
	);
}
