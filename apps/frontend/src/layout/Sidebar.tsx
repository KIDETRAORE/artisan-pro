export function Sidebar() {
  return (
    <aside className="w-64 bg-white border-r border-gray-200 p-4">
      <h2 className="text-xl font-semibold mb-6">ArtisanPro</h2>

      <nav className="space-y-2">
        <button className="w-full text-left px-3 py-2 rounded hover:bg-gray-100">
          Dashboard
        </button>
        <button className="w-full text-left px-3 py-2 rounded hover:bg-gray-100">
          Vision
        </button>
        <button className="w-full text-left px-3 py-2 rounded hover:bg-gray-100">
          Devis
        </button>
        <button className="w-full text-left px-3 py-2 rounded hover:bg-gray-100">
          Comptabilité
        </button>
      </nav>
    </aside>
  );
}
