import { useNavigate } from "react-router-dom";

export default function MyPosts() {
  const navigate = useNavigate();

  const requirement = JSON.parse(
    localStorage.getItem("buyer_requirement")
  );

  if (!requirement) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold mb-2">My Posts</h1>
        <p>No requirements posted yet.</p>
      </div>
    );
  }

const [timeLeft, setTimeLeft] = useState(0);

useEffect(() => {
  if (!requirement?.reverseAuctionActive) return;

  const interval = setInterval(() => {
    setTimeLeft(
      Math.max(
        0,
        requirement.reverseAuctionEndsAt -
          Date.now()
      )
    );
  }, 1000);

  return () => clearInterval(interval);
}, [requirement]);



  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-2xl font-bold mb-6">
        My Posts
      </h1>

      <div className="bg-white p-6 rounded-lg shadow max-w-2xl">
        <h2 className="text-lg font-semibold mb-2">
          {requirement.product}
        </h2>

        <p className="text-gray-700">
          {requirement.quantity} {requirement.unit} •{" "}
          {requirement.category}
        </p>

        <div className="mt-4 flex gap-3">
          <button
            onClick={() => navigate("/buyer/requirement?edit=true")}
            className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
          >
            Edit
          </button>

          <button
            onClick={() => {
              localStorage.removeItem("buyer_requirement");
              window.location.reload();
            }}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
