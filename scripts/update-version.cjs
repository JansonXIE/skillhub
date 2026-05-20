const fs = require('fs');
const path = require('path');

const tag = process.env.GITHUB_REF_NAME;
if (!tag) {
  console.error('Missing GITHUB_REF_NAME env var.');
  process.exit(1);
}

const version = tag.replace(/^v/, '');
if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`Invalid version format: ${version}`);
  process.exit(1);
}

// 1. Update src-tauri/tauri.conf.json
const tauriConfPath = path.join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
tauriConf.version = version;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
console.log(`Updated tauri.conf.json version to ${version}`);

// 2. Update package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
packageJson.version = version;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
console.log(`Updated package.json version to ${version}`);

// 3. Update src-tauri/Cargo.toml
const cargoTomlPath = path.join(__dirname, '..', 'src-tauri', 'Cargo.toml');
let cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
cargoToml = cargoToml.replace(/^version\s*=\s*"[^"]*"/m, `version = "${version}"`);
fs.writeFileSync(cargoTomlPath, cargoToml);
console.log(`Updated Cargo.toml version to ${version}`);
