import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { signOut } from "../lib/auth-client";

const navItems = [
	{ label: "Dashboard", to: "/" as const },
	{ label: "Users", to: "/users" as const },
];

export function Sidebar() {
	const [mobileOpen, setMobileOpen] = useState(false);
	const navigate = useNavigate();
	const routerState = useRouterState();
	const currentPath = routerState.location.pathname;

	function isActive(to: string) {
		if (to === "/") {
			return currentPath === "/" || currentPath === "/users";
		}
		return currentPath.startsWith(to);
	}

	return (
		<>
			{/* Mobile hamburger button */}
			<button
				type="button"
				className="fixed top-4 left-4 z-50 rounded-md bg-gray-800 p-2 text-white md:hidden"
				onClick={() => setMobileOpen(true)}
				aria-label="Open menu"
			>
				<svg
					className="h-6 w-6"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M4 6h16M4 12h16M4 18h16"
					/>
				</svg>
			</button>

			{/* Mobile overlay backdrop */}
			{mobileOpen && (
				<div
					className="fixed inset-0 z-40 bg-black/50 md:hidden"
					onClick={() => setMobileOpen(false)}
					aria-hidden="true"
				/>
			)}

			{/* Sidebar */}
			<aside
				className={`fixed top-0 left-0 z-50 flex h-full w-64 flex-col bg-gray-900 text-white transition-transform duration-200 ease-in-out md:translate-x-0 ${
					mobileOpen ? "translate-x-0" : "-translate-x-full"
				}`}
			>
				{/* Header */}
				<div className="flex h-16 items-center justify-between px-6">
					<span className="text-xl font-bold tracking-tight">
						Harmoniq Admin
					</span>
					{/* Mobile close button */}
					<button
						type="button"
						className="rounded-md p-1 text-gray-400 hover:text-white md:hidden"
						onClick={() => setMobileOpen(false)}
						aria-label="Close menu"
					>
						<svg
							className="h-5 w-5"
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

				{/* Navigation */}
				<nav className="mt-4 flex-1 space-y-1 px-3">
					{navItems.map((item) => (
						<Link
							key={item.to}
							to={item.to}
							onClick={() => setMobileOpen(false)}
							className={`flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
								isActive(item.to)
									? "bg-gray-800 text-white"
									: "text-gray-300 hover:bg-gray-800 hover:text-white"
							}`}
						>
							{item.label}
						</Link>
					))}
				</nav>

				{/* Sign out */}
				<div className="border-t border-gray-700 px-3 py-4">
					<button
						type="button"
						onClick={async () => {
							await signOut();
							navigate({ to: "/login" });
						}}
						className="flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
					>
						Sign Out
					</button>
				</div>
			</aside>
		</>
	);
}
