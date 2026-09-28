/** Only ordinary web URLs belong in public friend cards. */
export function isWebUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
	} catch {
		return false;
	}
}

export function commentPath(path: string, preview: boolean): string {
	const pathname = new URL(path, "https://ltisatis.github.io").pathname;
	const normalized = `${pathname.replace(/\/+$/, "")}/`;
	return preview ? `/__preview__${normalized}` : normalized;
}
