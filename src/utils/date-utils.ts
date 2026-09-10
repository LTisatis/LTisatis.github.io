import { shanghaiDay } from "./publication";
export function formatDateToYYYYMMDD(date: Date): string {
	return shanghaiDay(date);
}
export function formatDateChinese(date: Date): string {
	return new Intl.DateTimeFormat("zh-CN", {
		timeZone: "Asia/Shanghai",
		year: "numeric",
		month: "long",
		day: "numeric",
	}).format(date);
}
