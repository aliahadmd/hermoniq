import { useEffect, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";

interface UserAuth {
	id: string;
	name: string;
	email: string;
	role: string;
	banned: boolean;
	banReason: string | null;
	image: string | null;
	createdAt: string;
	updatedAt: string;
}

interface UserProfile {
	id: string;
	name: string;
	photoUrl: string | null;
	username: string;
	about: string | null;
	location: string | null;
	gender: string | null;
	website: string | null;
	workCompany: string | null;
	workPosition: string | null;
	workDescription: string | null;
	educationSchool: string | null;
	educationDegree: string | null;
	educationGraduated: boolean | null;
}

interface AdminUserDetail {
	user: UserAuth;
	profile: UserProfile | null;
}

interface ProfileFormData {
	name: string;
	username: string;
	photoUrl: string;
	about: string;
	location: string;
	gender: string;
	website: string;
	workCompany: string;
	workPosition: string;
	workDescription: string;
	educationSchool: string;
	educationDegree: string;
	educationGraduated: boolean;
}

function profileToFormData(profile: UserProfile | null): ProfileFormData {
	return {
		name: profile?.name ?? "",
		username: profile?.username ?? "",
		photoUrl: profile?.photoUrl ?? "",
		about: profile?.about ?? "",
		location: profile?.location ?? "",
		gender: profile?.gender ?? "",
		website: profile?.website ?? "",
		workCompany: profile?.workCompany ?? "",
		workPosition: profile?.workPosition ?? "",
		workDescription: profile?.workDescription ?? "",
		educationSchool: profile?.educationSchool ?? "",
		educationDegree: profile?.educationDegree ?? "",
		educationGraduated: profile?.educationGraduated ?? false,
	};
}

function formDataToPayload(form: ProfileFormData) {
	return {
		name: form.name,
		username: form.username || undefined,
		photoUrl: form.photoUrl || null,
		about: form.about || null,
		location: form.location || null,
		gender: form.gender || null,
		website: form.website || null,
		workCompany: form.workCompany || null,
		workPosition: form.workPosition || null,
		workDescription: form.workDescription || null,
		educationSchool: form.educationSchool || null,
		educationDegree: form.educationDegree || null,
		educationGraduated: form.educationGraduated || null,
	};
}

function formatDate(dateStr: string): string {
	try {
		return new Date(dateStr).toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return dateStr;
	}
}

function LoadingSpinner() {
	return (
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
	);
}

export function UserDetailPage() {
	const { userId } = useParams({ strict: false }) as { userId: string };
	const [data, setData] = useState<AdminUserDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [notFound, setNotFound] = useState(false);

	const [form, setForm] = useState<ProfileFormData>(profileToFormData(null));
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [saveSuccess, setSaveSuccess] = useState(false);

	useEffect(() => {
		async function fetchUser() {
			try {
				setLoading(true);
				setError(null);
				setNotFound(false);

				const res = await fetch(`/api/admin/users/${userId}`, {
					credentials: "include",
				});

				if (res.status === 404) {
					setNotFound(true);
					return;
				}

				if (!res.ok) {
					const body = await res.json().catch(() => null);
					setError(
						(body as { error?: string })?.error ??
							`Failed to fetch user (${res.status})`,
					);
					return;
				}

				const result: AdminUserDetail = await res.json();
				setData(result);
				setForm(profileToFormData(result.profile));
			} catch (err) {
				setError(
					err instanceof Error
						? err.message
						: "An unexpected error occurred",
				);
			} finally {
				setLoading(false);
			}
		}
		fetchUser();
	}, [userId]);

	function handleChange(
		field: keyof ProfileFormData,
		value: string | boolean,
	) {
		setSaveSuccess(false);
		setSaveError(null);
		setForm((prev) => ({ ...prev, [field]: value }));
	}

	async function handleSave(e: React.FormEvent) {
		e.preventDefault();
		setSaving(true);
		setSaveError(null);
		setSaveSuccess(false);

		try {
			const payload = formDataToPayload(form);
			const res = await fetch(`/api/admin/users/${userId}/profile`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				const body = await res.json().catch(() => null);
				setSaveError(
					(body as { error?: string })?.error ??
						`Failed to save profile (${res.status})`,
				);
				return;
			}

			const updatedProfile: UserProfile = await res.json();
			setData((prev) =>
				prev ? { ...prev, profile: updatedProfile } : prev,
			);
			setForm(profileToFormData(updatedProfile));
			setSaveSuccess(true);
		} catch (err) {
			setSaveError(
				err instanceof Error
					? err.message
					: "An unexpected error occurred",
			);
		} finally {
			setSaving(false);
		}
	}

	if (loading) {
		return (
			<div className="p-6">
				<div className="mb-6">
					<Link
						to="/users"
						className="text-sm text-gray-500 hover:text-gray-700"
					>
						← Back to Users
					</Link>
				</div>
				<h1 className="text-2xl font-bold text-gray-900">
					User Details
				</h1>
				<div className="mt-6 flex items-center justify-center py-12">
					<div className="flex items-center gap-3 text-gray-500">
						<LoadingSpinner />
						<span>Loading user details…</span>
					</div>
				</div>
			</div>
		);
	}

	if (notFound) {
		return (
			<div className="p-6">
				<div className="mb-6">
					<Link
						to="/users"
						className="text-sm text-gray-500 hover:text-gray-700"
					>
						← Back to Users
					</Link>
				</div>
				<h1 className="text-2xl font-bold text-gray-900">
					User Not Found
				</h1>
				<div className="mt-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
					<div className="flex items-center gap-2">
						<svg
							className="h-5 w-5 text-yellow-500"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
						<p className="text-sm font-medium text-yellow-800">
							The requested user could not be found.
						</p>
					</div>
					<p className="mt-1 text-sm text-yellow-600">
						The user may have been deleted or the ID is invalid.
					</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="p-6">
				<div className="mb-6">
					<Link
						to="/users"
						className="text-sm text-gray-500 hover:text-gray-700"
					>
						← Back to Users
					</Link>
				</div>
				<h1 className="text-2xl font-bold text-gray-900">
					User Details
				</h1>
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
							Failed to load user details
						</p>
					</div>
					<p className="mt-1 text-sm text-red-600">{error}</p>
				</div>
			</div>
		);
	}

	if (!data) return null;

	const { user: userAuth, profile } = data;

	return (
		<div className="p-6">
			{/* Back link */}
			<div className="mb-6">
				<Link
					to="/users"
					className="text-sm text-gray-500 hover:text-gray-700"
				>
					← Back to Users
				</Link>
			</div>

			<h1 className="text-2xl font-bold text-gray-900">User Details</h1>
			<p className="mt-1 text-sm text-gray-500">
				Manage user account and profile information
			</p>

			{/* Auth Info Card */}
			<div className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
				<h2 className="mb-4 text-lg font-semibold text-gray-900">
					Account Information
				</h2>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div>
						<span className="text-xs font-medium uppercase tracking-wider text-gray-500">
							Name
						</span>
						<p className="mt-1 text-sm text-gray-900">
							{userAuth.name}
						</p>
					</div>
					<div>
						<span className="text-xs font-medium uppercase tracking-wider text-gray-500">
							Email
						</span>
						<p className="mt-1 text-sm text-gray-900">
							{userAuth.email}
						</p>
					</div>
					<div>
						<span className="text-xs font-medium uppercase tracking-wider text-gray-500">
							Role
						</span>
						<p className="mt-1">
							<span
								className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold leading-5 ${
									userAuth.role === "admin"
										? "bg-purple-100 text-purple-800"
										: "bg-blue-100 text-blue-800"
								}`}
							>
								{userAuth.role}
							</span>
						</p>
					</div>
					<div>
						<span className="text-xs font-medium uppercase tracking-wider text-gray-500">
							Status
						</span>
						<p className="mt-1">
							{userAuth.banned ? (
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
						</p>
					</div>
					{userAuth.banned && userAuth.banReason && (
						<div className="sm:col-span-2">
							<span className="text-xs font-medium uppercase tracking-wider text-gray-500">
								Ban Reason
							</span>
							<p className="mt-1 text-sm text-red-600">
								{userAuth.banReason}
							</p>
						</div>
					)}
					<div>
						<span className="text-xs font-medium uppercase tracking-wider text-gray-500">
							Created
						</span>
						<p className="mt-1 text-sm text-gray-900">
							{formatDate(userAuth.createdAt)}
						</p>
					</div>
					<div>
						<span className="text-xs font-medium uppercase tracking-wider text-gray-500">
							Updated
						</span>
						<p className="mt-1 text-sm text-gray-900">
							{formatDate(userAuth.updatedAt)}
						</p>
					</div>
				</div>
			</div>

			{/* Profile Edit Form */}
			<div className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
				<h2 className="mb-4 text-lg font-semibold text-gray-900">
					Profile Information
				</h2>

				{!profile && (
					<div className="mb-4 rounded-md bg-yellow-50 p-3 text-sm text-yellow-700">
						This user does not have a profile yet. Saving will
						create one.
					</div>
				)}

				{saveSuccess && (
					<div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
						Profile saved successfully.
					</div>
				)}

				{saveError && (
					<div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
						{saveError}
					</div>
				)}

				<form onSubmit={handleSave} className="space-y-6">
					{/* Basic Info */}
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div>
							<label
								htmlFor="profile-name"
								className="mb-1 block text-sm font-medium text-gray-700"
							>
								Name
							</label>
							<input
								id="profile-name"
								type="text"
								value={form.name}
								onChange={(e) =>
									handleChange("name", e.target.value)
								}
								required
								className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
							/>
						</div>
						<div>
							<label
								htmlFor="profile-username"
								className="mb-1 block text-sm font-medium text-gray-700"
							>
								Username
							</label>
							<input
								id="profile-username"
								type="text"
								value={form.username}
								onChange={(e) =>
									handleChange("username", e.target.value)
								}
								placeholder="e.g. user-abc123"
								className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
							/>
						</div>
					</div>

					<div>
						<label
							htmlFor="profile-photoUrl"
							className="mb-1 block text-sm font-medium text-gray-700"
						>
							Photo URL
						</label>
						<input
							id="profile-photoUrl"
							type="text"
							value={form.photoUrl}
							onChange={(e) =>
								handleChange("photoUrl", e.target.value)
							}
							placeholder="https://example.com/photo.jpg"
							className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
						/>
					</div>

					<div>
						<label
							htmlFor="profile-about"
							className="mb-1 block text-sm font-medium text-gray-700"
						>
							About
							<span className="ml-2 text-xs font-normal text-gray-400">
								{form.about.length}/100
							</span>
						</label>
						<textarea
							id="profile-about"
							value={form.about}
							onChange={(e) =>
								handleChange("about", e.target.value)
							}
							maxLength={100}
							rows={2}
							placeholder="A short bio…"
							className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
						/>
					</div>

					{/* Personal Info */}
					<div>
						<h3 className="mb-3 text-sm font-semibold text-gray-800">
							Personal
						</h3>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label
									htmlFor="profile-location"
									className="mb-1 block text-sm font-medium text-gray-700"
								>
									Location
								</label>
								<input
									id="profile-location"
									type="text"
									value={form.location}
									onChange={(e) =>
										handleChange(
											"location",
											e.target.value,
										)
									}
									placeholder="City, Country"
									className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
								/>
							</div>
							<div>
								<label
									htmlFor="profile-gender"
									className="mb-1 block text-sm font-medium text-gray-700"
								>
									Gender
								</label>
								<input
									id="profile-gender"
									type="text"
									value={form.gender}
									onChange={(e) =>
										handleChange("gender", e.target.value)
									}
									placeholder="Gender"
									className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
								/>
							</div>
						</div>
					</div>

					<div>
						<label
							htmlFor="profile-website"
							className="mb-1 block text-sm font-medium text-gray-700"
						>
							Website
						</label>
						<input
							id="profile-website"
							type="text"
							value={form.website}
							onChange={(e) =>
								handleChange("website", e.target.value)
							}
							placeholder="https://example.com"
							className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
						/>
					</div>

					{/* Work Info */}
					<div>
						<h3 className="mb-3 text-sm font-semibold text-gray-800">
							Work
						</h3>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label
									htmlFor="profile-workCompany"
									className="mb-1 block text-sm font-medium text-gray-700"
								>
									Company
								</label>
								<input
									id="profile-workCompany"
									type="text"
									value={form.workCompany}
									onChange={(e) =>
										handleChange(
											"workCompany",
											e.target.value,
										)
									}
									placeholder="Company name"
									className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
								/>
							</div>
							<div>
								<label
									htmlFor="profile-workPosition"
									className="mb-1 block text-sm font-medium text-gray-700"
								>
									Position
								</label>
								<input
									id="profile-workPosition"
									type="text"
									value={form.workPosition}
									onChange={(e) =>
										handleChange(
											"workPosition",
											e.target.value,
										)
									}
									placeholder="Job title"
									className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
								/>
							</div>
						</div>
						<div className="mt-4">
							<label
								htmlFor="profile-workDescription"
								className="mb-1 block text-sm font-medium text-gray-700"
							>
								Work Description
							</label>
							<textarea
								id="profile-workDescription"
								value={form.workDescription}
								onChange={(e) =>
									handleChange(
										"workDescription",
										e.target.value,
									)
								}
								rows={2}
								placeholder="What do you do?"
								className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
							/>
						</div>
					</div>

					{/* Education Info */}
					<div>
						<h3 className="mb-3 text-sm font-semibold text-gray-800">
							Education
						</h3>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div>
								<label
									htmlFor="profile-educationSchool"
									className="mb-1 block text-sm font-medium text-gray-700"
								>
									School
								</label>
								<input
									id="profile-educationSchool"
									type="text"
									value={form.educationSchool}
									onChange={(e) =>
										handleChange(
											"educationSchool",
											e.target.value,
										)
									}
									placeholder="School name"
									className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
								/>
							</div>
							<div>
								<label
									htmlFor="profile-educationDegree"
									className="mb-1 block text-sm font-medium text-gray-700"
								>
									Degree
								</label>
								<input
									id="profile-educationDegree"
									type="text"
									value={form.educationDegree}
									onChange={(e) =>
										handleChange(
											"educationDegree",
											e.target.value,
										)
									}
									placeholder="Degree or certification"
									className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
								/>
							</div>
						</div>
						<div className="mt-4 flex items-center gap-2">
							<input
								id="profile-educationGraduated"
								type="checkbox"
								checked={form.educationGraduated}
								onChange={(e) =>
									handleChange(
										"educationGraduated",
										e.target.checked,
									)
								}
								className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
							/>
							<label
								htmlFor="profile-educationGraduated"
								className="text-sm font-medium text-gray-700"
							>
								Graduated
							</label>
						</div>
					</div>

					{/* Save Button */}
					<div className="flex items-center gap-3 border-t border-gray-200 pt-4">
						<button
							type="submit"
							disabled={saving}
							className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50"
						>
							{saving && <LoadingSpinner />}
							{saving ? "Saving…" : "Save Profile"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
