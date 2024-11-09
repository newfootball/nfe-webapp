export const randomizer = <T>(arr: Array<T>): T | undefined => {
	if (!Array.isArray(arr) || arr.length === 0) {
		return undefined; // Return undefined if the input is not an array or the array is empty
	}
	const randomIndex = Math.floor(Math.random() * arr.length);
	return arr[randomIndex];
};

export const selectRandomItems = <T>(
	arr: Array<T>,
	n: null | number = null,
): Array<T> => {
	if (!Array.isArray(arr) || arr.length === 0) {
		return []; // Return an empty array if the input is not an array or the array is empty
	}

	const num: number = n ?? Math.floor(Math.random() * arr.length) + 1; // Set n to 1 if it is undefined, null, or less than 1

	const randomItems: Array<T> = [];

	while (randomItems.length < num) {
		const item = randomizer(arr);
		if (!item) continue;

		if (randomItems.includes(item)) {
			continue;
		}
		randomItems.push(item);
	}

	return randomItems;
};
