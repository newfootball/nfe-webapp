import { Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "../../../../../components/ui/button";
import { setPreferredLocale } from "../../lib/locale";
import type { Locale } from "../../lib/messages";
import { initProfile, saveOnboarding, saveProfile } from "../../lib/profile";
import type { OwnProfile } from "../../lib/profile.server";
import { POSITIONS, USER_TYPES } from "../../lib/profile-contract";
import type { Onboarding, ProfileEdit } from "../../lib/profile-input";
import { positionMessages, profileMessages } from "../../lib/profile-messages";
import { AvatarEditor } from "../media/avatar-editor";

const inputClass =
	"block w-full rounded-md border bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-ring";
export function ProfileForm({
	own,
	locale,
	editing = false,
}: {
	own: OwnProfile;
	locale: Locale;
	editing?: boolean;
}) {
	const router = useRouter();
	const t = profileMessages[locale];
	const [step, setStep] = useState(1);
	const [type, setType] = useState<Onboarding["userType"]>("USER");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const p = own.profile;
	const d = own.details;
	async function refresh() {
		await router.invalidate();
	}
	if (!own.initialized)
		return (
			<section className="space-y-4">
				<h1 className="text-3xl font-bold">{t.onboarding}</h1>
				<Button
					disabled={busy}
					onClick={async () => {
						setBusy(true);
						try {
							const r = await initProfile({ data: {} });
							if (r.ok) await refresh();
							else setError(t.errors[r.error]);
						} catch {
							setError(t.errors.unavailable);
						} finally {
							setBusy(false);
						}
					}}
				>
					{t.start}
				</Button>
				{error && <p role="alert">{error}</p>}
			</section>
		);
	const field = (
		name: string,
		label: string,
		value: string | number = "",
		kind = "text",
		required = false,
		maxLength = 255,
	) => (
		<label className="block space-y-2">
			{label}
			<input
				className={inputClass}
				name={name}
				type={kind}
				defaultValue={value}
				required={required}
				maxLength={maxLength}
				min={kind === "number" ? 1 : undefined}
				max={
					kind === "date"
						? new Date().toISOString().slice(0, 10)
						: kind === "number"
							? 2147483647
							: undefined
				}
			/>
		</label>
	);
	const positions = (
		<fieldset className="space-y-2">
			<legend>{t.position}</legend>
			<div className="grid gap-2 sm:grid-cols-2">
				{POSITIONS.map((v) => (
					<label key={v} className="flex gap-2">
						<input
							type="checkbox"
							name="position"
							value={v}
							defaultChecked={editing && p?.position.includes(v)}
						/>
						{positionMessages[locale][v]}
					</label>
				))}
			</div>
		</fieldset>
	);
	return (
		<section className="mx-auto max-w-xl space-y-6">
			<h1 className="text-3xl font-bold">{editing ? t.edit : t.onboarding}</h1>
			<p>{t.privateNotice}</p>
			{editing && (
				<AvatarEditor
					key={own.id}
					viewerId={own.id}
					locale={locale}
					image={p?.image ?? null}
				/>
			)}
			<form
				className="space-y-5"
				onSubmit={async (event) => {
					event.preventDefault();
					if (!editing && step === 1) {
						setStep(2);
						return;
					}
					setBusy(true);
					setError("");
					const f = new FormData(event.currentTarget);
					const str = (key: string) => String(f.get(key) ?? "");
					const nullable = (key: string) => str(key) || null;
					try {
						let result: Awaited<ReturnType<typeof saveProfile>>;
						if (editing) {
							const data: ProfileEdit = {
								name: str("name"),
								biography: nullable("biography"),
								localisation: nullable("city"),
								fullName: nullable("fullName"),
								birthday: nullable("birthDate"),
								position: f.getAll("position") as ProfileEdit["position"],
								foot: f.getAll("foot") as ProfileEdit["foot"],
								license: nullable("license"),
								clubSize:
									p?.userType === "CLUB"
										? Number(str("clubSize")) || null
										: null,
								clubPosition:
									p?.userType === "CLUB" ? nullable("clubPosition") : null,
							};
							result = await saveProfile({ data });
						} else {
							const common = {
								name: str("name"),
								city: str("city"),
								biography: str("biography"),
							};
							const data =
								type === "USER"
									? { ...common, userType: type }
									: type === "PLAYER"
										? {
												...common,
												userType: type,
												birthDate: str("birthDate"),
												position: f.getAll("position"),
												foot: str("foot"),
												license: str("license"),
											}
										: type === "CLUB"
											? {
													...common,
													userType: type,
													clubName: str("clubName"),
													clubSize: Number(str("clubSize")),
													clubPosition: str("clubPosition"),
												}
											: {
													...common,
													userType: type,
													birthDate: str("birthDate"),
													clubName: str("clubName"),
												};
							result = await saveOnboarding({ data });
						}
						if (!result.ok) {
							setError(t.errors[result.error]);
							return;
						}
						const preferred = str("locale");
						if (preferred === "fr" || preferred === "en") {
							const saved = await setPreferredLocale({
								data: { locale: preferred },
							});
							if (!saved.ok) {
								setError(
									t.errors[
										saved.error === "credentials" ? "unauthorized" : saved.error
									],
								);
								await refresh();
								return;
							}
						}
						await refresh();
						await router.navigate({
							to: "/$locale/profile",
							params: { locale },
						});
					} catch {
						setError(t.errors.unavailable);
					} finally {
						setBusy(false);
					}
				}}
			>
				{!editing && (
					<label className="block">
						{locale === "fr" ? "Type de compte" : "Account type"}
						<select
							className={inputClass}
							value={type}
							onChange={(e) =>
								setType(e.target.value as Onboarding["userType"])
							}
							disabled={step === 2}
						>
							{USER_TYPES.map((v) => (
								<option key={v} value={v}>
									{t.types[v]}
								</option>
							))}
						</select>
					</label>
				)}
				{(editing || step === 2) && (
					<>
						{field("name", t.name, p?.name ?? "", "text", true, 128)}
						{field("city", t.city, p?.localisation ?? "", "text", !editing)}
						<label className="block">
							{t.biography}
							<textarea
								className={inputClass}
								name="biography"
								maxLength={65535}
								defaultValue={p?.biography ?? ""}
							/>
						</label>
						{(editing ||
							type === "PLAYER" ||
							type === "COACH" ||
							type === "RECRUITER") &&
							field(
								"birthDate",
								t.birthDate,
								d?.birthday?.slice(0, 10) ?? "",
								"date",
								!editing,
							)}
						{(editing || type === "PLAYER") && (
							<>
								{positions}
								{editing ? (
									<fieldset>
										<legend>{t.foot}</legend>
										{(["LEFT", "RIGHT"] as const).map((v) => (
											<label className="mr-4" key={v}>
												<input
													type="checkbox"
													name="foot"
													value={v}
													defaultChecked={p?.foot.includes(v)}
												/>
												{t.feet[v]}
											</label>
										))}
									</fieldset>
								) : (
									<label>
										{t.foot}
										<select className={inputClass} name="foot">
											{(["LEFT", "RIGHT", "BOTH"] as const).map((v) => (
												<option key={v} value={v}>
													{t.feet[v]}
												</option>
											))}
										</select>
									</label>
								)}
								{field("license", t.license, d?.license ?? "")}
							</>
						)}
						{editing
							? field("fullName", t.fullName, d?.fullName ?? "")
							: (type === "COACH" || type === "RECRUITER" || type === "CLUB") &&
								field("clubName", t.clubName, "", "text", true)}
						{(editing ? p?.userType === "CLUB" : type === "CLUB") && (
							<>
								{field(
									"clubSize",
									t.clubSize,
									d?.clubSize ?? "",
									"number",
									true,
								)}
								{field(
									"clubPosition",
									t.clubPosition,
									d?.clubPosition ?? "",
									"text",
									true,
								)}
							</>
						)}
						<label className="block">
							{t.email}
							<input
								className={inputClass}
								type="email"
								value={own.email}
								readOnly
							/>
						</label>
						<p>
							{t.emailReadonly}{" "}
							<Link
								className="underline"
								to="/$locale/profile/account-security"
								params={{ locale }}
							>
								{t.security}
							</Link>
						</p>
						<label>
							{t.locale}
							<select
								className={inputClass}
								name="locale"
								defaultValue={locale}
							>
								<option value="fr">Français</option>
								<option value="en">English</option>
							</select>
						</label>
					</>
				)}
				{error && <p role="alert">{error}</p>}
				<div className="flex gap-4">
					{!editing && step === 2 && (
						<Button type="button" variant="outline" onClick={() => setStep(1)}>
							{t.back}
						</Button>
					)}
					<Button disabled={busy} type="submit">
						{editing ? t.save : step === 1 ? t.next : t.finish}
					</Button>
				</div>
			</form>
		</section>
	);
}
