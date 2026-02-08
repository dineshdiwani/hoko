import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";

export default function AdminDashboard() {
  const [users, setUsers] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/admin/users").then(res => setUsers(res.data));
  }, []);

  const toggleSellerApproval = async (sellerId, approved) => {
    await api.post("/admin/seller/approve", {
      sellerId,
      approved
    });
    alert("Seller status updated");
    window.location.reload();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>

        <button
          onClick={() => navigate("/admin/analytics")}
          className="btn-secondary w-auto px-4"
        >
          View Analytics
        </button>
      </div>

      <div className="space-y-4">
        {users.map(user => (
          <div
            key={user._id}
            className="border rounded p-4 flex justify-between items-center"
          >
            <div>
              <p className="font-bold">{user.mobile}</p>
              <p className="text-sm text-gray-500">
                {user.roles?.admin
                  ? "Admin"
                  : user.roles?.seller
                  ? "Seller"
                  : "Buyer"}{" "}
                | {user.city || "N/A"}
              </p>

              {user.roles?.seller && (
                <p className="text-xs text-gray-600">
                  Firm: {user.sellerProfile?.firmName || "—"}
                </p>
              )}
            </div>

            {user.roles?.seller && !user.roles?.admin && (
              <button
                onClick={() =>
                  toggleSellerApproval(
                    user._id,
                    !user.sellerProfile?.approved
                  )
                }
                className={`px-4 py-1 rounded text-white ${
                  user.sellerProfile?.approved
                    ? "bg-red-600"
                    : "bg-green-600"
                }`}
              >
                {user.sellerProfile?.approved ? "Block" : "Approve"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
