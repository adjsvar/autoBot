const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Directorios a limpiar
const directories = [
  path.join(__dirname, 'ChromeProfile'),
  path.join(process.env.HOME || process.env.USERPROFILE, '.cache', 'playwright'),
  path.join(process.env.HOME || process.env.USERPROFILE, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default')
].filter(dir => fs.existsSync(dir));

// Borrar cada directorio
console.log('Borrando los directorios de caché de Playwright/Chrome...');
for (const dir of directories) {
  try {
    console.log(`Eliminando: ${dir}`);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`✓ Directorio eliminado: ${dir}`);
  } catch (err) {
    console.error(`Error al eliminar ${dir}:`, err.message);
  }
}

// Eliminar procesos de Chrome que puedan estar ejecutándose
console.log('\nVerificando procesos de Chrome en ejecución...');
try {
  if (process.platform === 'win32') {
    execSync('taskkill /F /IM chrome.exe /T', { stdio: 'ignore' });
  } else if (process.platform === 'darwin') {
    execSync('pkill -9 "Google Chrome"', { stdio: 'ignore' });
  } else {
    execSync('pkill -9 chrome', { stdio: 'ignore' });
  }
  console.log('✓ Procesos de Chrome terminados');
} catch (err) {
  console.log('No había procesos de Chrome ejecutándose');
}

console.log('\n✅ Limpieza completada. Por favor reinicia la aplicación.'); 