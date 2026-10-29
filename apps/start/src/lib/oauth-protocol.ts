import * as oidc from "openid-client";
// Fixed Google metadata: never accept issuer/JWKS/redirect metadata from the browser.
export function googleConfiguration(clientId: string, secret: string) {
	const config = new oidc.Configuration(
		{
			issuer: "https://accounts.google.com",
			authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
			token_endpoint: "https://oauth2.googleapis.com/token",
			jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
			response_types_supported: ["code"],
			subject_types_supported: ["public"],
			id_token_signing_alg_values_supported: ["RS256"],
		},
		clientId,
		{ client_secret: secret, id_token_signed_response_alg: "RS256" },
		oidc.ClientSecretPost(secret),
	);
	oidc.enableNonRepudiationChecks(config); // Signature verification is explicit for code-flow ID tokens.
	return config;
}
export async function acceptedSubject(
	config: oidc.Configuration,
	url: URL,
	state: { state: string; nonce: string; verifier: string },
	redirectUri: string,
) {
	const tokens = await oidc.authorizationCodeGrant(
		config,
		url,
		{
			expectedState: state.state,
			expectedNonce: state.nonce,
			pkceCodeVerifier: state.verifier,
			idTokenExpected: true,
		},
		{ redirect_uri: redirectUri },
	);
	const claims = tokens.claims();
	const clientId = config.clientMetadata().client_id;
	if (
		!claims ||
		claims.iss !== config.serverMetadata().issuer ||
		claims.aud !== clientId ||
		(claims.azp !== undefined && claims.azp !== clientId) ||
		typeof claims.sub !== "string" ||
		!claims.sub ||
		typeof claims.exp !== "number" ||
		claims.exp <= Date.now() / 1000 ||
		typeof claims.iat !== "number" ||
		claims.iat > Date.now() / 1000 + 30
	)
		throw new Error("Identity unavailable");
	return claims.sub;
}
