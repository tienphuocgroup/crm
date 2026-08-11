export const REPO_URL = "https://github.com/trycompai/crm";
export const REPO_STARS = "4.4k";

export const REPO_LINKS = [
	{ key: "github", labelKey: "repoLinkGithub", href: REPO_URL },
	{ key: "issues", labelKey: "repoLinkIssues", href: `${REPO_URL}/issues` },
	{
		key: "pullRequests",
		labelKey: "repoLinkPullRequests",
		href: `${REPO_URL}/pulls`,
	},
	{
		key: "contributing",
		labelKey: "repoLinkContributing",
		href: `${REPO_URL}/blob/main/CONTRIBUTING.md`,
	},
	{
		key: "license",
		labelKey: "repoLinkLicense",
		href: `${REPO_URL}/blob/main/LICENSE`,
	},
] as const;
