import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminPage() {
	return (
		<div className="container mx-auto py-6">
			<h1 className="mb-6 text-2xl font-bold">Administration</h1>
			<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
				<Card>
					<CardHeader>
						<CardTitle>Utilisateurs</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground">
							Gérer les utilisateurs et leurs rôles
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Publications</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground">
							Gérer les publications et les commentaires
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Paramètres</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="text-muted-foreground">
							Configurer les paramètres de l&apos;application
						</p>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
