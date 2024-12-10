import { Toaster } from "@/components/ui/sonner";
import { Footer } from "./footer";
import { Header } from "./header";

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<main>
			<Header />
			<main className="pb-28 md:max-w-2xl max-w-md mx-auto mt-4 px-2">
				{children}
			</main>
			<Footer />
			<Toaster
				expand={false}
				position="top-right"
				closeButton
				richColors
				duration={2000}
			/>
		</main>
	);
}
