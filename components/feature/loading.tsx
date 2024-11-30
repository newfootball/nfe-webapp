import { Loader } from "lucide-react";

export const Loading = () => {
	return (
		<div className="flex justify-center items-center h-screen">
			<Loader className="animate-spin" />
		</div>
	);
};
