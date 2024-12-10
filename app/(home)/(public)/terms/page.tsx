import Link from "next/link";

export default function TermsAndConditions() {
	return (
		<>
			<h1 className="text-2xl font-bold text-indigo-800">
				Terms and Conditions
			</h1>
			<p className="mt-1 text-sm text-indigo-200">
				Last updated: September 29, 2024
			</p>
			<div className="px-4 py-5 sm:p-6">
				<div className="prose prose-indigo max-w-none">
					<h2>1. Acceptance of Terms</h2>
					<p>
						By accessing or using the Connected social network service, you
						agree to be bound by these Terms and Conditions. If you do not agree
						to all the terms and conditions, you may not access or use the
						service.
					</p>

					<h2>2. Changes to Terms</h2>
					<p>
						We reserve the right to modify or replace these Terms at any time.
						We will provide notice of any significant changes. Your continued
						use of the Service after such modifications will constitute your
						acknowledgment and acceptance of the modified Terms.
					</p>

					<h2>3. Privacy Policy</h2>
					<p>
						Your use of the Service is also governed by our Privacy Policy,
						which can be found{" "}
						<Link
							href="/privacy"
							className="text-indigo-600 hover:text-indigo-800"
						>
							here
						</Link>
						.
					</p>

					<h2>4. User Accounts</h2>
					<p>
						When you create an account with us, you must provide accurate,
						complete, and current information. Failure to do so constitutes a
						breach of the Terms, which may result in immediate termination of
						your account.
					</p>

					<h2>5. Content</h2>
					<p>
						You are responsible for the content you post on Connected. You
						retain all rights to your content, but grant Connected a
						non-exclusive license to use, modify, and display the content in
						connection with the Service.
					</p>

					<h2>6. Prohibited Activities</h2>
					<p>
						You agree not to engage in any of the following prohibited
						activities:
					</p>
					<ul>
						<li>Violating laws or rights of others</li>
						<li>Posting unauthorized commercial communications</li>
						<li>Uploading viruses or malicious code</li>
						<li>Harassment or bullying of other users</li>
						<li>Impersonating others</li>
					</ul>

					<h2>7. Termination</h2>
					<p>
						We may terminate or suspend your account immediately, without prior
						notice or liability, for any reason, including breach of Terms. Upon
						termination, your right to use the Service will immediately cease.
					</p>

					<h2>8. Limitation of Liability</h2>
					<p>
						In no event shall Connected, its directors, employees, partners,
						agents, suppliers, or affiliates, be liable for any indirect,
						incidental, special, consequential or punitive damages, including
						loss of profits, data, or other intangible losses.
					</p>

					<h2>9. Governing Law</h2>
					<p>
						These Terms shall be governed by and construed in accordance with
						the laws of [Your Jurisdiction], without regard to its conflict of
						law provisions.
					</p>

					<h2>10. Contact Us</h2>
					<p>
						If you have any questions about these Terms, please contact us at{" "}
						<a
							href="mailto:support@connected.com"
							className="text-indigo-600 hover:text-indigo-800"
						>
							support@connected.com
						</a>
						.
					</p>
				</div>
			</div>
			<div className="bg-gray-50 px-4 py-4 sm:px-6">
				<div className="text-sm">
					<Link
						href="/"
						className="font-medium text-indigo-600 hover:text-indigo-500"
					>
						Return to Home
					</Link>
				</div>
			</div>
		</>
	);
}
