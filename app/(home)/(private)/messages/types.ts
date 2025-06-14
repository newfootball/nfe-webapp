export type MessageUser = {
	id: string;
	username: string;
	image: string;
};

export type Message = {
	id: string;
	user: string;
	image: string;
	message: string;
	time: string;
};
