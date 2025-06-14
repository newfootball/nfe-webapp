export function formatTimeAgo(date: Date): string {
	const now = new Date();
	const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

	if (diffInSeconds < 60) return "Just now";
	if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min`;
	if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} h`;
	return `${Math.floor(diffInSeconds / 86400)} d`;
}
