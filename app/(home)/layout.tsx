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
			<main className="min-h-screen pb-24">{children}</main>
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
