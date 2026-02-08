import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";

export default function CityChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical">
        <XAxis type="number" />
        <YAxis type="category" dataKey="_id" />
        <Tooltip />
        <Bar dataKey="requirements" fill="#16a34a" />
      </BarChart>
    </ResponsiveContainer>
  );
}
