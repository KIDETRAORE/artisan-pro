import { NavLink } from "react-router-dom";

export function Sidebar() {
  const baseClasses =
    "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors";

  const getClasses = ({ isActive }: { isActive: boolean }) =>
    isActive
      ? `${baseClasses} bg-indigo-100 text-indigo-700`
      : `${baseClasses} text-gray-600 hover:bg-gray-100 hover:text-black`;

  return (
    <aside className="w-64 bg-white border-r border-gray-200 p-6 flex flex-col">
      {/* LOGO */}
      <h2 className="text-2xl font-bold mb-8 text-indigo-600">
        ArtisanPro
      </h2>

      {/* NAVIGATION */}
      <nav className="space-y-2 flex-1">
        <NavLink to="/dashboard" className={getClasses}>
          📊 Dashboard
        </NavLink>

        <NavLink to="/vision" className={getClasses}>
          👁️ Vision
        </NavLink>

        <NavLink to="/devis" className={getClasses}>
          📄 Devis
        </NavLink>

        <NavLink to="/comptabilite" className={getClasses}>
          💰 Comptabilité
        </NavLink>
      </nav>

      {/* FOOTER */}
      <div className="pt-6 border-t border-gray-200 text-xs text-gray-400">
        © {new Date().getFullYear()} ArtisanPro
      </div>
    </aside>
  );
}