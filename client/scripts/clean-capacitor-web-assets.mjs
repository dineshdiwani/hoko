import { rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const publicAssetsDir = resolve("android", "app", "src", "main", "assets", "public");

if (existsSync(publicAssetsDir)) {
  rmSync(publicAssetsDir, { recursive: true, force: true });
  console.log(`Removed stale Capacitor web assets at ${publicAssetsDir}`);
} else {
  console.log(`No Capacitor web assets found at ${publicAssetsDir}`);
}
