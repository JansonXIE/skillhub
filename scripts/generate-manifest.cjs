const fs = require('fs');
const path = require('path');

const TAG = process.env.GITHUB_REF_NAME;           // e.g. "v1.2.0"
const REPO = process.env.GITHUB_REPOSITORY;        // e.g. "JansonXIE/skillhub"

if (!TAG || !REPO) {
  console.error('Missing GITHUB_REF_NAME or GITHUB_REPOSITORY env vars.');
  process.exit(1);
}

const version = TAG.replace(/^v/, '');
const baseUrl = `https://github.com/${REPO}/releases/download/${TAG}`;

// ── Product name from tauri.conf.json ───────────────────────────
const tauriConf = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'src-tauri', 'tauri.conf.json'), 'utf-8')
);
const productName = tauriConf.productName || 'skillhub';

// ── Build platform entries ──────────────────────────────────────
const platforms = {};

// Windows (NSIS) — needs signature from .sig file
const nsisDir = path.join(__dirname, '..', 'src-tauri', 'target', 'release', 'bundle', 'nsis');
if (fs.existsSync(nsisDir)) {
  const files = fs.readdirSync(nsisDir);
  console.log('NSIS files:', files);

  const sigFile = files.find(f => f.endsWith('.nsis.zip.sig'));
  const zipFile = files.find(f => f.endsWith('.nsis.zip'));

  if (sigFile && zipFile) {
    const signature = fs.readFileSync(path.join(nsisDir, sigFile), 'utf-8').trim();
    platforms['windows-x86_64'] = {
      signature,
      url: `${baseUrl}/${zipFile}`
    };
    console.log('Added windows-x86_64');
  } else {
    console.log('NSIS updater artifacts not found, skipping windows-x86_64');
  }
}

// Linux AppImage
platforms['linux-x86_64'] = {
  signature: '',
  url: `${baseUrl}/${productName}_${version}_amd64.AppImage`
};
console.log('Added linux-x86_64');

// Linux DEB
platforms['linux-x86_64-deb'] = {
  signature: '',
  url: `${baseUrl}/${productName}_${version}_amd64.deb`
};
console.log('Added linux-x86_64-deb');

// ── Output ──────────────────────────────────────────────────────
const manifest = {
  version,
  notes: `Release ${TAG}`,
  pub_date: new Date().toISOString(),
  platforms
};

const outputPath = path.join(__dirname, '..', 'latest.json');
fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`Generated ${outputPath} for version ${version}`);
console.log(JSON.stringify(manifest, null, 2));