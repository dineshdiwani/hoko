import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function RequirementForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEdit = searchParams.get("edit");

  const existing = JSON.parse(localStorage.getItem("buyer_requirement"));

  const [form, setForm] = useState(
    existing || {
      city: "",
      category: "",
      product: "",
      brand: "",
      type: "",
      quantity: "",
      unit: "",
      details: "",
      image: null,
    }
  );

  const handleChange = (e) => {
    const { name, value, files } = e.target;

    if (files && files[0]) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setForm({ ...form, image: reader.result });
      };
      reader.readAsDataURL(files[0]);
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!form.city || !form.category || !form.product || !form.quantity || !form.unit) {
      alert("Please fill all required fields");
      return;
    }

    localStorage.setItem("buyer_requirement", JSON.stringify(form));
    alert("Requirement posted successfully!");
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-600 flex items-center justify-center px-4 animate-fade-in">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl p-6"
      >
        <h1 className="text-2xl font-bold mb-6 text-gray-800">
          Requirement Details
        </h1>

        {/* City */}
        <div className="mb-4">
          <label className="block font-medium mb-1">City *</label>
          <select
            name="city"
            value={form.city}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Select city</option>
            <option>Mumbai</option>
            <option>Delhi</option>
            <option>Bangalore</option>
            <option>Chennai</option>
            <option>Hyderabad</option>
          </select>
        </div>

        {/* Category */}
        <div className="mb-4">
          <label className="block font-medium mb-1">Category *</label>
          <select
            name="category"
            value={form.category}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Select category</option>
            <option value="electronics">Electronics</option>
            <option value="grocery">Grocery</option>
            <option value="services">Services</option>
            <option value="construction">Construction</option>
          </select>
        </div>

        {/* Product */}
        <div className="mb-4">
          <label className="block font-medium mb-1">Product / Service *</label>
          <input
            name="product"
            value={form.product}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g. Laptop"
          />
        </div>

        {/* Quantity + Unit */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block font-medium mb-1">Quantity *</label>
            <input
              name="quantity"
              value={form.quantity}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block font-medium mb-1">Unit *</label>
            <select
              name="unit"
              value={form.unit}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select unit</option>
              <option value="pcs">Pieces</option>
              <option value="kg">Kilogram</option>
              <option value="litre">Litre</option>
              <option value="service">Service</option>
            </select>
          </div>
        </div>

        {/* Details */}
        <div className="mb-4">
          <label className="block font-medium mb-1">Details</label>
          <textarea
            name="details"
            value={form.details}
            onChange={handleChange}
            rows={4}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Image */}
        <div className="mb-6">
          <label className="block font-medium mb-1">Attachment / Image</label>
          <input type="file" accept="image/*" onChange={handleChange} />
          {form.image && (
            <p className="text-sm text-gray-500 mt-1">Image selected</p>
          )}
        </div>

        <button
          type="submit"
          className="w-full px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 transition-all text-white font-semibold shadow-md"
        >
          Post Requirement
        </button>
      </form>
    </div>
  );
}
