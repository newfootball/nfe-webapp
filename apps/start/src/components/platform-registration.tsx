import { useEffect } from "react";

export function PlatformRegistration() {
	useEffect(() => {
		if (!("serviceWorker" in navigator)) return;
		// Same script URL and scope as next-pwa: update the existing registration.
		// An old controlled tab must discard its Next JS after activation.
		const hadController = Boolean(navigator.serviceWorker.controller);
		let reloading = false;
		const changed = () => {
			if (hadController && !reloading) {
				reloading = true;
				location.reload();
			}
		};
		navigator.serviceWorker.addEventListener("controllerchange", changed);
		void navigator.serviceWorker
			.register("/sw.js", { scope: "/", updateViaCache: "none" })
			.then((registration) => registration.update())
			.catch(() => {
				// Offline/unsupported install: the online app remains usable.
			});
		return () =>
			navigator.serviceWorker.removeEventListener("controllerchange", changed);
	}, []);
	return null;
}
