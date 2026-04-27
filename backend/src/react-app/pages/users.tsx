import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { adminApi } from "../lib/auth-client";

interface User {
	id: string;
	name: string;
	email: string;
	role: string;
	banned: boolean;
	image?: string | null;
	createdAt: string;
	username?: string;
}

interface UsersResponse {
	users: User[];
	total: number;
}

interface AdminUserDetail {
	user: {
		id: string;
		name: string;
		email: string;
		role: string;
	};
	profile: {
		username: string;
	} | null;
}

export function UsersPage() {
	const [users, setUsers] = useState<User[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [actionLoadingMap, setActionLoadingMap] = useState<
		Record<string, { role?: boolean; ban?: boolean }>
	>({});
	const [actionErrorMap, setActionErrorMap] = useState<
		Record<string, string | null>
	>({});
	const navigate = useNavigate();

	useEffect(() => {
		async function fetchUsers() {
			try {
				setLoading(true);
				setError(null);
				const { data, error: apiError } = await adminApi.listUsers({
					query: {
						limit: 100,
					},
				});
				if (apiError) {
					setError(apiError.message ?? "Failed to fetch users");
					return;
				}
				const response = data as UsersResponse;
				const fetchedUsers = response.users ?? [];
				setTotal(response.total ?? 0);

				// Fetch profiles to get usernames for each user
				const usersWithUsernames = await Promise.all(
					fetchedUsers.map(async (u) => {
						try {
							const res = await fetch(`/api/admin/users/${u.id}`, {
								credentials: "include",
							});
							if (res.ok) {
								const detail: AdminUserDetail = await res.json();
								return {
									...u,
									username: detail.profile?.username ?? undefined,
								};
							}
						} catch {
							// Ignore individual profile fetch errors
						}
						return u;
					}),
				);
				setUsers(usersWithUsernames);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "An unexpected error occurred",
				);
			} finally {
				setLoading(false);
			}
		}
		fetchUsers();
	}, []);

	function setActionLoading(
		userId: string,
		action: "role" | "ban",
		isLoading: boolean,
	) {
		setActionLoadingMap((prev) => ({
			...prev,
			[userId]: { ...prev[userId], [action]: isLoading },
		}));
	}

	function setActionError(userId: string, errorMsg: string | null) {
		setActionErrorMap((prev) => ({
			...prev,
			[userId]: errorMsg,
		}));
	}

	function clearActionError(userId: string) {
		setActionErrorMap((prev) => ({
			...prev,
			[userId]: null,
		}));
	}

	async function handleRoleChange(user: User) {
		const newRole = user.role === "admin" ? "user" : "admin";
		clearActionError(user.id);
		setActionLoading(user.id, "role", true);
		try {
			const { error: apiError } = await adminApi.setRole({
				userId: user.id,
				role: newRole,
			});
			if (apiError) {
				setActionError(
					user.id,
					apiError.message ?? "Failed to change role",
				);
				return;
			}
			setUsers((prev) =>
				prev.map((u) =>
					u.id === user.id ? { ...u, role: newRole } : u,
				),
			);
		} catch (err) {
			setActionError(
				user.id,
				err instanceof Error ? err.message : "Failed to change role",
			);
		} finally {
			setActionLoading(user.id, "role", false);
		}
	}

	async function handleBanToggle(user: User) {
		clearActionError(user.id);
		setActionLoading(user.id, "ban", true);
		try {
			if (user.banned) {
				const { error: apiError } = await adminApi.unbanUser({
					userId: user.id,
				});
				if (apiError) {
					setActionError(
						user.id,
						apiError.message ?? "Failed to unban user",
					);
					return;
				}
				setUsers((prev) =>
					prev.map((u) =>
						u.id === user.id ? { ...u, banned: false } : u,
					),
				);
			} else {
				const { error: apiError } = await adminApi.banUser({
					userId: user.id,
				});
				if (apiError) {
					setActionError(
						user.id,
						apiError.message ?? "Failed to ban user",
					);
					return;
				}
				setUsers((prev) =>
					prev.map((u) =>
						u.id === user.id ? { ...u, banned: true } : u,
					),
				);
			}
		} catch (err) {
			setActionError(
				user.id,
				err instanceof Error
					? err.message
					: `Failed to ${user.banned ? "unban" : "ban"} user`,
			);
		} finally {
			setActionLoading(user.id, "ban", false);
		}
	}

	if (loading) {
		return (
			<div className="p-6">
				<h1 className="text-2xl font-bold text-gray-900">Users</h1>
				<div className="mt-6 flex items-center justify-center py-12">
					<div className="flex items-center gap-3 text-gray-500">
						<svg
							className="h-5 w-5 animate-spin"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
						>
							<circle
								className="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								strokeWidth="4"
							/>
							<path
								className="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
							/>
						</svg>
						<span>Loading users…</span>
					</div>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="p-6">
				<h1 className="text-2xl font-bold text-gray-900">Users</h1>
				<div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4">
					<div className="flex items-center gap-2">
						<svg
							className="h-5 w-5 text-red-500"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<p className="text-sm font-medium text-red-800">
							Failed to load users
						</p>
					</div>
					<p className="mt-1 text-sm text-red-600">{error}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="p-6">
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-gray-900">Users</h1>
					<p className="mt-1 text-sm text-gray-500">
						{total} {total === 1 ? "user" : "users"} registered
					</p>
				</div>
			</div>

			<div className="overflow-x-auto rounded-lg border border-gray-200">
				<table className="min-w-full divide-y divide-gray-200">
					<thead className="bg-gray-50">
						<tr>
							<th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
								Name
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
								Username
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
								Email
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
								Role
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
								Status
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
								Actions
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-200 bg-white">
						{users.length === 0 ? (
							<tr>
								<td
									colSpan={6}
									className="px-6 py-8 text-center text-sm text-gray-500"
								>
									No users found.
								</td>
							</tr>
						) : (
							users.map((user) => {
								const userActionLoading = actionLoadingMap[user.id];
								const isRoleLoading = userActionLoading?.role ?? false;
								const isBanLoading = userActionLoading?.ban ?? false;
								const actionError = actionErrorMap[user.id] ?? null;

								return (
									<tr
										key={user.id}
										className="transition-colors hover:bg-gray-50"
									>
										<td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
											<a
												href={`/users/${user.id}`}
												onClick={(e) => {
													e.preventDefault();
													navigate({ to: `/users/${user.id}` });
												}}
												className="text-blue-600 hover:text-blue-800 hover:underline"
											>
												{user.name}
											</a>
										</td>
										<td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
											{user.username ? (
												<span className="text-gray-700">@{user.username}</span>
											) : (
												<span className="text-gray-400 italic">—</span>
											)}
										</td>
										<td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
											{user.email}
										</td>
										<td className="whitespace-nowrap px-6 py-4 text-sm">
											<span
												className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold leading-5 ${
													user.role === "admin"
														? "bg-purple-100 text-purple-800"
														: "bg-blue-100 text-blue-800"
												}`}
											>
												{user.role}
											</span>
										</td>
										<td className="whitespace-nowrap px-6 py-4 text-sm">
											{user.banned ? (
												<span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-semibold leading-5 text-red-800">
													<span className="h-1.5 w-1.5 rounded-full bg-red-500" />
													Banned
												</span>
											) : (
												<span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-semibold leading-5 text-green-800">
													<span className="h-1.5 w-1.5 rounded-full bg-green-500" />
													Active
												</span>
											)}
										</td>
										<td className="whitespace-nowrap px-6 py-4 text-sm">
											<div className="flex flex-col gap-2">
												<div className="flex items-center gap-2">
													<button
														type="button"
														disabled={isRoleLoading}
														onClick={() => handleRoleChange(user)}
														className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${
															user.role === "admin"
																? "bg-blue-50 text-blue-700 hover:bg-blue-100 focus:ring-blue-500"
																: "bg-purple-50 text-purple-700 hover:bg-purple-100 focus:ring-purple-500"
														} ${isRoleLoading ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
													>
														{isRoleLoading ? (
															<svg
																className="h-3.5 w-3.5 animate-spin"
																xmlns="http://www.w3.org/2000/svg"
																fill="none"
																viewBox="0 0 24 24"
															>
																<circle
																	className="opacity-25"
																	cx="12"
																	cy="12"
																	r="10"
																	stroke="currentColor"
																	strokeWidth="4"
																/>
																<path
																	className="opacity-75"
																	fill="currentColor"
																	d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
																/>
															</svg>
														) : null}
														{user.role === "admin"
															? "Make User"
															: "Make Admin"}
													</button>
													<button
														type="button"
														disabled={isBanLoading}
														onClick={() => handleBanToggle(user)}
														className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${
															user.banned
																? "bg-green-50 text-green-700 hover:bg-green-100 focus:ring-green-500"
																: "bg-red-50 text-red-700 hover:bg-red-100 focus:ring-red-500"
														} ${isBanLoading ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
													>
														{isBanLoading ? (
															<svg
																className="h-3.5 w-3.5 animate-spin"
																xmlns="http://www.w3.org/2000/svg"
																fill="none"
																viewBox="0 0 24 24"
															>
																<circle
																	className="opacity-25"
																	cx="12"
																	cy="12"
																	r="10"
																	stroke="currentColor"
																	strokeWidth="4"
																/>
																<path
																	className="opacity-75"
																	fill="currentColor"
																	d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
																/>
															</svg>
														) : null}
														{user.banned ? "Unban" : "Ban"}
													</button>
												</div>
												{actionError ? (
													<div className="flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1">
														<svg
															className="h-3.5 w-3.5 shrink-0 text-red-500"
															fill="none"
															stroke="currentColor"
															viewBox="0 0 24 24"
														>
															<path
																strokeLinecap="round"
																strokeLinejoin="round"
																strokeWidth={2}
																d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
															/>
														</svg>
														<span className="text-xs text-red-700">
															{actionError}
														</span>
														<button
															type="button"
															onClick={() => clearActionError(user.id)}
															className="ml-auto shrink-0 text-red-400 hover:text-red-600"
															aria-label="Dismiss error"
														>
															<svg
																className="h-3.5 w-3.5"
																fill="none"
																stroke="currentColor"
																viewBox="0 0 24 24"
															>
																<path
																	strokeLinecap="round"
																	strokeLinejoin="round"
																	strokeWidth={2}
																	d="M6 18L18 6M6 6l12 12"
																/>
															</svg>
														</button>
													</div>
												) : null}
											</div>
										</td>
									</tr>
								);
							})
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}
