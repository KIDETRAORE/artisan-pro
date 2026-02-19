import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../store/auth.store";
import { useUser } from "../context/user.context";

export default function Layout() {
  const { logout } = useAuth();
  const { userData } = useUser();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const percentage =
    userData?.quota && userData.quota.limit > 0
      ? (userData.quota.used / userData.quota.limit) * 100
      : 0;

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r shadow-sm flex flex-col">
        <div className="px-6 py-5 border-b">
          <h2 className="text-lg font-semibold text-gray-800">
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

      {/* Main area */}
      <div className="flex-1 flex flex-col bg-gray-50">
        <header className="bg-white border-b px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-semibold">
            Dashboard
          </h1>

          {userData && (
            <div className="text-right">
              <p className="text-sm font-medium">
                Plan {userData.plan}
              </p>

              {userData.plan !== "PRO" && userData.quota && (
                <div className="mt-1 w-40">
                  <div className="text-xs text-gray-500">
                    {userData.quota.used} / {userData.quota.limit}
                  </div>

                  <div className="h-2 bg-gray-200 rounded-full mt-1">
                    <div
                      className="h-2 bg-indigo-600 rounded-full"
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

        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
