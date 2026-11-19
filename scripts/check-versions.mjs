import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);
const cargoToml = readFileSync(resolve(root, "src-tauri/Cargo.toml"), "utf8");
const tauriConfig = JSON.parse(
  readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"),
);
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const versions = {
  "package.json": packageJson.version,
  "Cargo.toml": cargoVersion,
  "tauri.conf.json": tauriConfig.version,
};

const unique = new Set(Object.values(versions));
if (unique.size !== 1 || unique.has(undefined)) {
  console.error("版本号不一致：", versions);
  process.exit(1);
}

const version = packageJson.version;
if (tauriConfig.app?.windows?.[0]?.title !== `MiSideTag ${version}`) {
  console.error(
    `窗口标题应为 "MiSideTag ${version}"，当前为 "${tauriConfig.app?.windows?.[0]?.title}"`,
  );
  process.exit(1);
}

console.log(`MiSideTag ${version} 版本配置一致`);
