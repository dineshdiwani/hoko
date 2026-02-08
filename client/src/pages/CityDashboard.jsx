import { useNavigate } from "react-router-dom";

export default function CityDashboard() {
  const navigate = useNavigate();

  const requirement = JSON.parse(
    localStorage.getItem("buyer_requirement")
  );

  const user = JSON.parse(localStorage.getItem("user"));

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-600 px-6 py-10">
      {/* Header */}
      <div className="max-w-5xl mx-auto mb-8">
        <h1 className="text-3xl font-bold text-white">
          City Dashboard
        </h1>
        <p className="text-white/80 mt-1">
          {user?.city || "Your city"} marketplace
        </p>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto">
        {!requirement ? (
          <div className="bg-white/90 rounded-2xl p-8 text-center shadow-xl">
            <p className="text-gray-600 mb-4">
              No requirements posted yet
            </p>
            <button
              onClick={() => navigate("/buyer/requirement")}
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition"
            >
              ➕ Post Requirement
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl p-6">
              {/* Card Header */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold">
                    {requirement.product}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {requirement.category} • {requirement.city}
                  </p>
                </div>
                <span className="px-3 py-1 text-sm rounded-full bg-green-100 text-green-700">
                  Active
                </span>
              </div>

              {/* Details */}
              <div className="space-y-2 text-gray-700 text-sm">
                <p>
                  <strong>Brand:</strong>{" "}
                  {requirement.brand || "Any"}
                </p>
                <p>
                  <strong>Quantity:</strong>{" "}
                  {requirement.quantity} {requirement.unit}
                </p>
                {requirement.details && (
                  <p>
                    <strong>Details:</strong>{" "}
                    {requirement.details}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() =>
                    navigate("/buyer/requirement?edit=true")
                  }
                  className="flex-1 px-4 py-2 rounded-xl border border-indigo-600 text-indigo-600 hover:bg-indigo-50 transition"
                >
                  ✏️ Edit
                </button>

                <button
                  onClick={() => navigate("/buyer/offers")}
                  className="flex-1 px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition"
                >
                  👀 View Offers
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
