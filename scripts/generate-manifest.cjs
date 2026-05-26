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
const bundleDir = path.join(__dirname, '..', 'src-tauri', 'target', 'release', 'bundle');

const manifest = {
  version,
  notes: `Release ${TAG}`,
  pub_date: new Date().toISOString(),
  platforms: {}
};

// ── Windows (NSIS) ──────────────────────────────────────────────
const nsisDir = path.join(bundleDir, 'nsis');
console.log('Looking for NSIS updater artifacts in:', nsisDir);

if (fs.existsSync(nsisDir)) {
  const files = fs.readdirSync(nsisDir);
  console.log('Files in NSIS directory:', files);

  const zipFile = files.find(f => f.endsWith('.nsis.zip'));
  const sigFile = files.find(f => f.endsWith('.nsis.zip.sig'));

  if (zipFile && sigFile) {
    const signature = fs.readFileSync(path.join(nsisDir, sigFile), 'utf-8').trim();
    manifest.platforms['windows-x86_64'] = {
      signature,
      url: `${baseUrl}/${zipFile}`
    };
    console.log('Added windows-x86_64 platform');
  } else {
    console.error('NSIS updater artifacts incomplete, skipping Windows platform');
  }
}

// ── Linux (AppImage) ────────────────────────────────────────────
const appImageDir = path.join(bundleDir, 'appimage');
if (fs.existsSync(appImageDir)) {
  const files = fs.readdirSync(appImageDir);
  console.log('Files in AppImage directory:', files);

  const appImageFile = files.find(f => f.endsWith('.AppImage'));
  if (appImageFile) {
    manifest.platforms['linux-x86_64'] = {
      signature: '',
      url: `${baseUrl}/${appImageFile}`
    };
    console.log('Added linux-x86_64 platform:', appImageFile);
  }
}

// ── Linux (DEB) ─────────────────────────────────────────────────
const debDir = path.join(bundleDir, 'deb');
if (fs.existsSync(debDir)) {
  const files = fs.readdirSync(debDir);
  console.log('Files in DEB directory:', files);

  const debFile = files.find(f => f.endsWith('.deb'));
  if (debFile) {
    manifest.platforms['linux-x86_64-deb'] = {
      signature: '',
      url: `${baseUrl}/${debFile}`
    };
    console.log('Added linux-x86_64-deb platform:', debFile);
  }
}

if (Object.keys(manifest.platforms).length === 0) {
  console.error('No platforms found in any bundle directory');
  process.exit(1);
}

const outputPath = path.join(__dirname, '..', 'latest.json');
fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`Generated ${outputPath} for version ${version}`);
console.log(JSON.stringify(manifest, null, 2));