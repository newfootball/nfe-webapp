import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";

type Theme = "light" | "dark" | "system";
const ThemeContext = createContext({ toggle: () => {} });
// Static code only: no request values are interpolated into the document.
export const themeBootstrap = `try{var t=localStorage.getItem('theme');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch{}`;

export function PlatformTheme({ children }: { children: ReactNode }) {
	const [theme, setTheme] = useState<Theme>("system");
	useEffect(() => {
		try {
			const stored = localStorage.getItem("theme");
			if (stored === "light" || stored === "dark") setTheme(stored);
		} catch {}
	}, []);
	useEffect(() => {
		const media = matchMedia("(prefers-color-scheme: dark)");
		const apply = () => {
			const dark = theme === "dark" || (theme === "system" && media.matches);
			document.documentElement.classList.toggle("dark", dark);
			document.documentElement.style.colorScheme = dark ? "dark" : "light";
		};
		apply();
		media.addEventListener("change", apply);
		return () => media.removeEventListener("change", apply);
	}, [theme]);
	const toggle = () => {
		const next = document.documentElement.classList.contains("dark")
			? "light"
			: "dark";
		try {
			localStorage.setItem("theme", next);
		} catch {}
		setTheme(next);
	};
	return (
		<ThemeContext.Provider value={{ toggle }}>{children}</ThemeContext.Provider>
	);
}
export function usePlatformTheme() {
	return useContext(ThemeContext);
}
