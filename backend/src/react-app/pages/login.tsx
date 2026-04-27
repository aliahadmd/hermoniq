import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { authClient } from "../lib/auth-client";

export function LoginPage() {
	const navigate = useNavigate();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setLoading(true);

		try {
			const result = await authClient.signIn.email({
				email: email.trim(),
				password,
			});

			if (result.error) {
				setError(result.error.message ?? "Login failed");
				return;
			}

			navigate({ to: "/users" });
		} catch {
			setError("Unable to connect to server");
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-gray-100">
			<div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-md">
				<h1 className="mb-2 text-2xl font-bold text-gray-900">
					Admin Login
				</h1>
				<p className="mb-6 text-sm text-gray-500">
					Sign in to access the admin dashboard
				</p>

				{error && (
					<div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
						{error}
					</div>
				)}

				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label
							htmlFor="email"
							className="mb-1 block text-sm font-medium text-gray-700"
						>
							Email
						</label>
						<input
							id="email"
							type="email"
							required
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							disabled={loading}
							className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 disabled:opacity-50"
							placeholder="admin@example.com"
						/>
					</div>

					<div>
						<label
							htmlFor="password"
							className="mb-1 block text-sm font-medium text-gray-700"
						>
							Password
						</label>
						<input
							id="password"
							type="password"
							required
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							disabled={loading}
							className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500 disabled:opacity-50"
							placeholder="Enter your password"
						/>
					</div>

					<button
						type="submit"
						disabled={loading}
						className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50"
					>
						{loading ? "Signing in…" : "Sign In"}
					</button>
				</form>
			</div>
		</div>
	);
}
