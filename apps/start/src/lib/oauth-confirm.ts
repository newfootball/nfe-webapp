type Issued = { $id: string; userId: string; secret: string; expire: string };
export async function confirmBrokerSession<T extends Issued>(
	expectedId: string,
	issued: T,
	checks: {
		account: () => Promise<{ $id: string; status: boolean; mfa: boolean }>;
		target: () => Promise<{ $id: string; status: boolean; mfa: boolean }>;
		session: () => Promise<{ $id: string; userId: string; expire: string }>;
		revoke: () => Promise<unknown>;
	},
) {
	try {
		if (
			!issued.secret ||
			issued.userId !== expectedId ||
			Date.parse(issued.expire) <= Date.now() ||
			!Number.isFinite(Date.parse(issued.expire))
		)
			throw new Error("Session unavailable");
		const [account, target, session] = await Promise.all([
			checks.account(),
			checks.target(),
			checks.session(),
		]);
		if (
			account.$id !== expectedId ||
			target.$id !== expectedId ||
			session.$id !== issued.$id ||
			session.userId !== expectedId ||
			!account.status ||
			!target.status ||
			account.mfa ||
			target.mfa ||
			!Number.isFinite(Date.parse(session.expire)) ||
			Date.parse(session.expire) <= Date.now()
		)
			throw new Error("Session unavailable");
		return issued;
	} catch {
		await checks.revoke();
		throw new Error("Session unavailable");
	}
}
