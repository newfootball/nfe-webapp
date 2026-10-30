import type { Locale } from "../../lib/messages";
import type { PublicProfile } from "../../lib/profile-contract";
import { positionMessages, profileMessages } from "../../lib/profile-messages";
import { FollowControls } from "../follow/follow-controls";
export function ProfileView({
	profile,
	locale,
}: {
	profile: PublicProfile;
	locale: Locale;
}) {
	const t = profileMessages[locale];
	return (
		<article className="space-y-5 rounded-xl border bg-card p-6 text-card-foreground">
			<img src="/logo.svg" width="72" height="72" alt={t.avatar} />
			<h1 className="text-3xl font-bold" data-testid="profile-name">
				{profile.name}
			</h1>
			<FollowControls id={profile.id} locale={locale} />
			<p>{t.types[profile.userType as keyof typeof t.types]}</p>
			<p>{profile.localisation}</p>
			<p className="whitespace-pre-wrap">{profile.biography}</p>
			<ul>
				{profile.position.map((v) => (
					<li key={v}>
						{positionMessages[locale][v as keyof typeof positionMessages.fr]}
					</li>
				))}
			</ul>
			<p>
				{profile.foot.map((v) => t.feet[v as "LEFT" | "RIGHT"]).join(" / ")}
			</p>
		</article>
	);
}
