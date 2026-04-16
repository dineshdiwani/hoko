import api from "./api";

let optionsCache = null;
let optionsCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000;

export async function fetchOptions(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && optionsCache && (now - optionsCacheTime) < CACHE_DURATION) {
    return optionsCache;
  }
  const res = await api.get("/meta/options");
  optionsCache = res.data;
  optionsCacheTime = now;
  return optionsCache;
}
