export type Publication = {
	published: Date;
	draft?: boolean;
	demo?: boolean;
};

export function shanghaiDay(date: Date): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Shanghai",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
}

export function isPublished(
	data: Publication,
	now = new Date(),
	preview = false,
): boolean {
	return (
		Number.isFinite(data.published.getTime()) &&
		!data.draft &&
		(!data.demo || preview) &&
		shanghaiDay(data.published) <= shanghaiDay(now)
	);
}

export function comparePosts(
	a: { slug: string; data: Publication },
	b: { slug: string; data: Publication },
): number {
	const dayOrder = shanghaiDay(b.data.published).localeCompare(
		shanghaiDay(a.data.published),
	);
	return dayOrder || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
}
