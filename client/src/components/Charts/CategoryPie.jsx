import {
  PieChart,
  Pie,
  Tooltip,
  ResponsiveContainer,
  Cell
} from "recharts";

const COLORS = [
  "#2563eb", // blue
  "#16a34a", // green
  "#f97316", // orange
  "#dc2626", // red
  "#7c3aed"  // purple
];

export default function CategoryPie({ data }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="_id"
          outerRadius={100}
          label
        >
          {data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={COLORS[index % COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
}
