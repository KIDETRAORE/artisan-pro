import {
  Outlet,
  NavLink,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { useAuth } from "../store/auth.store";
import { useUser } from "../context/user.context";

export default function Layout() {
  const { logout } = useAuth();
  const { userData } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const percentage =
    userData?.quota && userData.quota.limit > 0
      ? Math.min(
          100,
          (userData.quota.used / userData.quota.limit) * 100
        )
      : 0;

  const getBarColor = () => {
    if (percentage < 60) return "bg-indigo-600";
    if (percentage < 85) return "bg-yellow-500";
    return "bg-red-500";
  };

  const pageTitle =
    location.pathname === "/dashboard"
      ? "Dashboard"
      : "ArtisanPro";

  return (
    <div className="min-h-screen flex bg-gray-100">
      {/* ================= SIDEBAR ================= */}
      <aside className="w-64 bg-white border-r shadow-sm flex flex-col">
        <div className="px-6 py-5 border-b">
          <h2 className="text-xl font-bold text-indigo-600">
            ArtisanPro
          </h2>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `block px-4 py-2 rounded-lg transition ${
                isActive
                  ? "bg-indigo-100 text-indigo-700 font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              }`
            }
          >
            📊 Dashboard
          </NavLink>

          <NavLink
            to="/vision"
            className={({ isActive }) =>
              `block px-4 py-2 rounded-lg transition ${
                isActive
                  ? "bg-indigo-100 text-indigo-700 font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              }`
            }
          >
            👁️ Vision
          </NavLink>

          <NavLink
            to="/devis"
            className={({ isActive }) =>
              `block px-4 py-2 rounded-lg transition ${
                isActive
                  ? "bg-indigo-100 text-indigo-700 font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              }`
            }
          >
            📄 Devis
          </NavLink>

          <NavLink
            to="/compta"
            className={({ isActive }) =>
              `block px-4 py-2 rounded-lg transition ${
                isActive
                  ? "bg-indigo-100 text-indigo-700 font-medium"
                  : "text-gray-600 hover:bg-gray-100"
              }`
            }
          >
            💰 Comptabilité
          </NavLink>
        </nav>

        <div className="p-4 border-t">
          <button
            onClick={handleLogout}
            className="w-full text-sm text-gray-500 hover:text-red-500 transition"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* ================= MAIN AREA ================= */}
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b px-6 py-4 flex justify-between items-center shadow-sm">
          <h1 className="text-xl font-semibold">
            {pageTitle}
          </h1>

          {userData && (
            <div className="text-right">
              {/* PLAN BADGE */}
              <div className="flex items-center justify-end gap-2">
                <span className="text-sm font-medium">
                  Plan
                </span>

                <span
                  className={`px-2 py-1 text-xs rounded-full font-semibold ${
                    userData.plan === "PRO"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-200 text-gray-700"
                  }`}
                >
                  {userData.plan}
                </span>
              </div>

              {/* QUOTA */}
              {userData.plan !== "PRO" && userData.quota && (
                <div className="mt-2 w-48">
                  <div className="text-xs text-gray-500">
                    {userData.quota.used} /{" "}
                    {userData.quota.limit}
                  </div>

                  <div className="h-2 bg-gray-200 rounded-full mt-1">
                    <div
                      className={`h-2 rounded-full transition-all duration-500 ${getBarColor()}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              )}

              {userData.plan === "PRO" && (
                <p className="text-green-600 text-xs mt-1">
                  Illimité
                </p>
              )}
            </div>
          )}
        </header>

        <main className="flex-1 p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}