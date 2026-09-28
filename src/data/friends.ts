import { isWebUrl } from "../utils/community-utils";

export interface Friend {
	name: string;
	url: string;
	description: string;
	avatar?: string;
}

// Add approved friends here. Array order is the display order.
export const friends: Friend[] = [
	{
		name: "EchoSpark",
		url: "https://supralune.com/",
		description: "关于学习、技术与日常折腾的博客",
	},
	{
		name: "奶糖写字的地方（大白兔奶糖）",
		url: "https://iwhite-rabbit.github.io/",
		description: "美人如玉剑如虹",
		avatar: "https://iwhite-rabbit.github.io/images/avatar.jpeg",
	},
];

for (const friend of friends) {
	if (!friend.name.trim() || !friend.description.trim() || !isWebUrl(friend.url)) {
		throw new Error(`Invalid friend entry: ${friend.name}`);
	}
	if (friend.avatar && !isWebUrl(friend.avatar) && !/^\/(?!\/)/.test(friend.avatar)) {
		throw new Error(`Invalid friend avatar: ${friend.name}`);
	}
}
