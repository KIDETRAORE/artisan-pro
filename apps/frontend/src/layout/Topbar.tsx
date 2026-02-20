import { useUser } from "../context/user.context";

export function Topbar() {
  const { userData } = useUser();

  const plan = userData?.plan ?? "FREE";
  const quota = userData?.quota;

  const percentage =
    quota && quota.limit > 0
      ? Math.min((quota.used / quota.limit) * 100, 100)
      : 0;

  const getBarColor = () => {
    if (percentage < 60) return "bg-indigo-600";
    if (percentage < 85) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      {/* LEFT SIDE */}
      <div className="flex flex-col">
        <div className="text-sm text-gray-500">
          Plan{" "}
          <span className="font-semibold text-black">
            {plan}
          </span>
        </div>

        {/* QUOTA */}
        {quota ? (
          <div className="w-48 mt-1">
            <div className="text-xs text-gray-500 mb-1">
              {quota.used} / {quota.limit}
            </div>

            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`${getBarColor()} h-2 rounded-full transition-all duration-500`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="text-xs text-green-600 mt-1">
            Illimité
          </div>
        )}
      </div>

      {/* RIGHT SIDE */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-gray-300 rounded-full" />
      </div>
    </header>
  );
}