import type {
	ExpressiveCodeConfig,
	LicenseConfig,
	NavBarConfig,
	ProfileConfig,
	SiteConfig,
} from "./types/config";
import { LinkPreset } from "./types/config";
import blog from "../blog.config.json";
export const siteConfig: SiteConfig = {
	title: blog.title,
	subtitle: blog.subtitle,
	lang: "zh_CN",
	themeColor: { hue: 265, fixed: true },
	banner: {
		enable: true,
		src: "",
		position: "center",
		credit: { enable: false, text: "", url: "" },
	},
	toc: { enable: true, depth: 2 },
	favicon: [{ src: "/favicon.svg", sizes: "any" }],
};
export const navBarConfig: NavBarConfig = {
	links: [
		LinkPreset.Home,
		LinkPreset.Archive,
		LinkPreset.About,
		{ name: "RSS", url: "/rss.xml", external: false },
	],
};
export const profileConfig: ProfileConfig = {
	avatar: "",
	name: blog.author,
	bio: blog.bio,
	links: blog.githubUsername
		? [
				{
					name: "GitHub",
					icon: "fa6-brands:github",
					url: "https://github.com/" + blog.githubUsername,
				},
			]
		: [],
};
export const licenseConfig: LicenseConfig = {
	enable: false,
	name: "版权所有",
	url: "",
};
export const expressiveCodeConfig: ExpressiveCodeConfig = {
	theme: "github-dark",
};
