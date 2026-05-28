#!/usr/bin/env node
/**
 * Script de release: crea un tag de versión y lo sube a GitHub.
 * 
 * Uso: node scripts/release.js [patch|minor|major]
 * Ejemplo: node scripts/release.js patch
 * 
 * Esto dispara el workflow de GitHub Actions que generará los instalables.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─── Helpers ───────────────────────────────────────────────
function run(cmd, opts = {}) {
  console.log(`▶ ${cmd}`);
  return execSync(cmd, { stdio: 'inherit', ...opts });
}

function runSilent(cmd) {
  return execSync(cmd, { stdio: 'pipe' }).toString().trim();
}

// ─── Leer versión actual ────────────────────────────────────
const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const currentVersion = pkg.version;

// ─── Calcular nueva versión ─────────────────────────────────
const bumpType = process.argv[2] || 'patch';
const validBumps = ['patch', 'minor', 'major'];

if (!validBumps.includes(bumpType)) {
  console.error(`❌ Tipo de bump inválido: "${bumpType}". Usa: patch, minor, major`);
  process.exit(1);
}

const [major, minor, patch] = currentVersion.split('.').map(Number);
let newVersion;

switch (bumpType) {
  case 'major': newVersion = `${major + 1}.0.0`; break;
  case 'minor': newVersion = `${major}.${minor + 1}.0`; break;
  case 'patch': newVersion = `${major}.${minor}.${patch + 1}`; break;
}

const newTag = `v${newVersion}`;

// ─── Verificar estado del repo ──────────────────────────────
console.log('\n🔍 Verificando estado del repositorio...');

try {
  const status = runSilent('git status --porcelain');
  if (status) {
    console.error('❌ Hay cambios sin commitear. Haz commit primero.');
    console.error(status);
    process.exit(1);
  }
} catch (e) {
  console.error('❌ Error verificando git status:', e.message);
  process.exit(1);
}

// ─── Verificar remote ──────────────────────────────────────
try {
  const remotes = runSilent('git remote -v');
  if (!remotes.includes('origin')) {
    console.error('❌ No hay un remote "origin" configurado.');
    console.error('   Ejecuta: git remote add origin https://github.com/EmirSESEA/Monitor_Webs.git');
    process.exit(1);
  }
} catch (e) {
  console.error('❌ Error verificando remotes:', e.message);
  process.exit(1);
}

// ─── Confirmar con el usuario ───────────────────────────────
console.log(`\n📦 Release: v${currentVersion} → ${newTag} (${bumpType})`);
console.log('   Esto creará un tag y lo subirá a GitHub.');
console.log('   GitHub Actions generará automáticamente los instalables.\n');

// ─── Actualizar package.json ────────────────────────────────
console.log(`📝 Actualizando versión en package.json: ${currentVersion} → ${newVersion}`);
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

// ─── Git commit + tag ───────────────────────────────────────
run(`git add package.json`);
run(`git commit -m "chore: bump version to ${newVersion}"`);
run(`git tag -a ${newTag} -m "Release ${newTag}"`);

// ─── Push a GitHub ─────────────────────────────────────────
console.log('\n🚀 Subiendo cambios a GitHub...');
run(`git push origin main`);
run(`git push origin ${newTag}`);

console.log(`\n✅ Release ${newTag} creado exitosamente!`);
console.log(`   Ve a: https://github.com/EmirSESEA/Monitor_Webs/actions`);
console.log(`   El workflow de GitHub Actions generará los instalables automáticamente.\n`);
