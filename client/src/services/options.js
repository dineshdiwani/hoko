import api from "./api";

export async function fetchOptions() {
  const res = await api.get("/meta/options");
  return res.data;
}
