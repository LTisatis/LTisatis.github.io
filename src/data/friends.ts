import { isWebUrl } from "../utils/community-utils";

export interface Friend {
	name: string;
	url: string;
	description: string;
	avatar?: string;
}

// Add approved friends here. Array order is the display order.
export const friends: Friend[] = [];

for (const friend of friends) {
	if (!friend.name.trim() || !friend.description.trim() || !isWebUrl(friend.url)) {
		throw new Error(`Invalid friend entry: ${friend.name}`);
	}
	if (friend.avatar && !isWebUrl(friend.avatar) && !/^\/(?!\/)/.test(friend.avatar)) {
		throw new Error(`Invalid friend avatar: ${friend.name}`);
	}
}
