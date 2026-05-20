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

const msiDir = path.join(__dirname, '..', 'src-tauri', 'target', 'release', 'bundle', 'msi');
const files = fs.readdirSync(msiDir);

const zipFile = files.find(f => f.endsWith('.msi.zip'));
const sigFile = files.find(f => f.endsWith('.msi.zip.sig'));

if (!zipFile) {
  console.error('MSI zip file not found in', msiDir);
  process.exit(1);
}

if (!sigFile) {
  console.error('Signature file (.msi.zip.sig) not found in', msiDir);
  process.exit(1);
}

const signature = fs.readFileSync(path.join(msiDir, sigFile), 'utf-8').trim();

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