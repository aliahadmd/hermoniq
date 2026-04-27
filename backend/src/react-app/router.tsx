import {
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	redirect,
} from "@tanstack/react-router";
import { Sidebar } from "./components/sidebar";
import { UsersPage } from "./pages/users";
import { UserDetailPage } from "./pages/user-detail";
import { LoginPage } from "./pages/login";
import { authClient } from "./lib/auth-client";

// Root layout component — renders child routes via Outlet with sidebar navigation
function AuthenticatedLayout() {
	return (
		<div className="flex min-h-screen">
			<Sidebar />
			<main className="flex-1 md:ml-64">
				<Outlet />
			</main>
		</div>
	);
}

// Minimal layout for login (no sidebar)
function PublicLayout() {
	return <Outlet />;
}

async function requireAuth() {
	const { data } = await authClient.getSession();
	if (!data?.session) {
		throw redirect({ to: "/login" });
	}
	// Check admin role
	const user = data.user as { role?: string };
	if (user.role !== "admin") {
		throw redirect({ to: "/login" });
	}
}

async function redirectIfAuthed() {
	const { data } = await authClient.getSession();
	if (data?.session) {
		const user = data.user as { role?: string };
		if (user.role === "admin") {
			throw redirect({ to: "/users" });
		}
	}
}

// Route tree
const rootRoute = createRootRoute({
	component: PublicLayout,
});

const loginRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/login",
	beforeLoad: redirectIfAuthed,
	component: LoginPage,
});

// Authenticated layout route — all protected pages are children of this
const authenticatedRoute = createRoute({
	getParentRoute: () => rootRoute,
	id: "authenticated",
	beforeLoad: requireAuth,
	component: AuthenticatedLayout,
});

const indexRoute = createRoute({
	getParentRoute: () => authenticatedRoute,
	path: "/",
	beforeLoad: () => {
		throw redirect({ to: "/users" });
	},
});

const usersRoute = createRoute({
	getParentRoute: () => authenticatedRoute,
	path: "/users",
	component: UsersPage,
});

const userDetailRoute = createRoute({
	getParentRoute: () => authenticatedRoute,
	path: "/users/$userId",
	component: UserDetailPage,
});

const routeTree = rootRoute.addChildren([
	loginRoute,
	authenticatedRoute.addChildren([indexRoute, usersRoute, userDetailRoute]),
]);

export const router = createRouter({ routeTree });

// Type registration for TanStack Router
declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
