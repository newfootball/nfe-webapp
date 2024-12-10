import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";

export default function AboutPage() {
	return (
		<Shell>
			<div className="container mx-auto px-4 py-12">
				<div className="grid gap-12 lg:grid-cols-2">
					<div className="flex flex-col justify-center space-y-6">
						<h1 className="text-4xl font-bold tracking-tight">
							Discover Amateur Football Talent
						</h1>
						<p className="text-lg text-muted-foreground">
							Football Talent Network is a platform dedicated to connecting
							amateur football players, coaches, and clubs. We believe in making
							football opportunities accessible to everyone, regardless of their
							background.
						</p>
						<div className="space-y-4">
							<h2 className="text-2xl font-semibold">Our Mission</h2>
							<p className="text-muted-foreground">
								To create a vibrant community where football talent can be
								discovered, nurtured, and given opportunities to shine. We
								connect passionate players with coaches and clubs, fostering the
								growth of amateur football.
							</p>
						</div>
						<div className="flex gap-4">
							<Button asChild>
								<Link href="/auth/register">Join Our Community</Link>
							</Button>
							<Button variant="outline" asChild>
								<Link href="/contact">Contact Us</Link>
							</Button>
						</div>
					</div>
					<div className="relative aspect-square overflow-hidden rounded-xl lg:aspect-auto">
						<Image
							src="https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=2000"
							alt="Football players celebrating"
							fill
							className="object-cover"
							priority
						/>
					</div>
				</div>

				<div className="mt-24 grid gap-12 sm:grid-cols-2 lg:grid-cols-3">
					<div className="space-y-4">
						<h3 className="text-xl font-semibold">For Players</h3>
						<p className="text-muted-foreground">
							Create your profile, showcase your skills, and get discovered by
							clubs and coaches. Share your journey and connect with other
							players.
						</p>
					</div>
					<div className="space-y-4">
						<h3 className="text-xl font-semibold">For Coaches</h3>
						<p className="text-muted-foreground">
							Find promising talent, share your expertise, and build your
							reputation in the amateur football community.
						</p>
					</div>
					<div className="space-y-4">
						<h3 className="text-xl font-semibold">For Clubs</h3>
						<p className="text-muted-foreground">
							Discover talented players, connect with qualified coaches, and
							grow your club&apos;s presence in the amateur football scene.
						</p>
					</div>
				</div>

				<div className="mt-24">
					<h2 className="mb-8 text-center text-3xl font-bold">Our Values</h2>
					<div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
						<div className="rounded-lg bg-muted p-6">
							<h3 className="mb-2 font-semibold">Community</h3>
							<p className="text-sm text-muted-foreground">
								Building strong connections within the football community
							</p>
						</div>
						<div className="rounded-lg bg-muted p-6">
							<h3 className="mb-2 font-semibold">Opportunity</h3>
							<p className="text-sm text-muted-foreground">
								Creating chances for talent to shine and grow
							</p>
						</div>
						<div className="rounded-lg bg-muted p-6">
							<h3 className="mb-2 font-semibold">Development</h3>
							<p className="text-sm text-muted-foreground">
								Supporting the growth of players, coaches, and clubs
							</p>
						</div>
						<div className="rounded-lg bg-muted p-6">
							<h3 className="mb-2 font-semibold">Inclusivity</h3>
							<p className="text-sm text-muted-foreground">
								Welcoming all who share our passion for football
							</p>
						</div>
					</div>
				</div>
			</div>
		</Shell>
	);
}
