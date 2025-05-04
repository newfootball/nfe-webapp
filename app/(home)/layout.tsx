import { Toaster } from "@/components/ui/sonner";
import { auth } from "@/src/lib/auth";
import { Footer } from "./footer";
import { Header } from "./header";

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const session = await auth();
	return (
		<>
			<Header userId={session?.user.id} />
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
		</>
	);
}
