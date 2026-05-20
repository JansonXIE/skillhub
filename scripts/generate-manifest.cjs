const fs = require('fs');
const path = require('path');

const TAG = process.env.GITHUB_REF_NAME;           // e.g. "v1.2.0"
const REPO = process.env.GITHUB_REPOSITORY;        // e.g. "JansonXIE/skillhub"

if (!TAG || !REPO) {
  console.error('Missing GITHUB_REF_NAME or GITHUB_REPOSITORY env vars.');
  process.exit(1);
}

const version = TAG.replace(/^v/, '');             // "1.2.0"
const baseUrl = `https://github.com/${REPO}/releases/download/${TAG}`;

// Tauri v2 updater on Windows uses NSIS format
// The updater artifacts are in target/release/bundle/nsis/
const nsisDir = path.join(__dirname, '..', 'src-tauri', 'target', 'release', 'bundle', 'nsis');

console.log('Looking for NSIS updater artifacts in:', nsisDir);

if (!fs.existsSync(nsisDir)) {
  console.error('NSIS bundle directory not found:', nsisDir);
  process.exit(1);
}

const files = fs.readdirSync(nsisDir);
console.log('Files in NSIS directory:', files);

const zipFile = files.find(f => f.endsWith('.nsis.zip'));
const sigFile = files.find(f => f.endsWith('.nsis.zip.sig'));

if (!zipFile) {
  console.error('NSIS updater zip file (.nsis.zip) not found in', nsisDir);
  console.error('Available files:', files.join(', '));
  process.exit(1);
}

if (!sigFile) {
  console.error('Signature file (.nsis.zip.sig) not found in', nsisDir);
  console.error('Available files:', files.join(', '));
  process.exit(1);
}

const signature = fs.readFileSync(path.join(nsisDir, sigFile), 'utf-8').trim();

if (!signature) {
  console.error('Signature file is empty!');
  process.exit(1);
}

const manifest = {
  version,
  notes: `Release ${TAG}`,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature,
      url: `${baseUrl}/${zipFile}`
    }
  }
};

const outputPath = path.join(__dirname, '..', 'latest.json');
fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`Generated ${outputPath} for version ${version}`);
console.log(JSON.stringify(manifest, null, 2));