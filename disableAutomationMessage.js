/**
 * disableAutomationMessage.js - Funciones para ocultar el mensaje de automatización en Chrome
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Crea un archivo de preferencias de Chrome que deshabilita el mensaje de automatización
 * @param {string} userDir - Directorio del perfil de usuario
 */
function setupChromePreferences(userDir) {
  try {
    // Asegurarse de que el directorio existe
    const prefsDir = path.join(userDir, 'Default');
    if (!fs.existsSync(prefsDir)) {
      fs.mkdirSync(prefsDir, { recursive: true });
    }
    
    // Ruta del archivo de preferencias
    const prefsPath = path.join(prefsDir, 'Preferences');
    
    // Preferencias para evitar el mensaje de automatización
    const preferences = {
      profile: {
        exit_type: "Normal",
        exited_cleanly: true
      },
      browser: {
        enabled_labs_experiments: ["disable-automation"]
      },
      credentials_enable_service: false,
      credentials_enable_autosignin: false,
      browser_shutdown: {
        num_processes: 0,
        num_processes_slow: 0,
        last_window_type: 1
      },
      session: {
        restore_on_startup: 1
      },
      distribution: {
        auto_launch_at_startup: false
      }
    };
    
    // Escribir el archivo de preferencias
    fs.writeFileSync(prefsPath, JSON.stringify(preferences, null, 2));
    console.log(`Preferencias de Chrome actualizadas en: ${prefsPath}`);
    return true;
  } catch (error) {
    console.error('Error al configurar preferencias de Chrome:', error);
    return false;
  }
}

/**
 * Obtiene los argumentos recomendados para iniciar Chrome
 * @return {string[]} Lista de argumentos
 */
function getChromeArguments() {
  return [
    '--start-maximized',
    '--disable-extensions',
    '--disable-default-apps',
    '--no-default-browser-check',
    '--no-first-run',
    '--disable-infobars',                           // Ocultar barra de información
    '--exclude-switches=enable-automation',         // Quitar el switch de automatización
    '--disable-blink-features=AutomationControlled', // Evitar detección de automatización
    '--disable-features=RendererCodeIntegrity',     // Mejora contra detección
    '--enable-features=NetworkServiceInProcess2'    // Relacionado con mensajes de automatización
  ];
}

/**
 * Obtiene un script para inyectar en el navegador que oculta signos de automatización
 * @return {Function} Función para ocultar signos de automatización
 */
function getInjectionScript() {
  return () => {
    // Ocultar que estamos usando WebDriver
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    
    // Modificar o eliminar propiedades de chrome que delatan automatización
    if (window.chrome) {
      window.chrome = new Proxy(window.chrome, {
        get: (target, name) => {
          if (name === 'app') {
            return { isInstalled: false };
          }
          if (name === 'runtime') {
            return undefined;
          }
          return target[name];
        }
      });
    }
    
    // Inyectar CSS para ocultar el mensaje de automatización
    const style = document.createElement('style');
    style.textContent = `
      div[id^="infobar"],
      div[role="infobar"],
      div[role="alert"],
      div.infobar,
      div.infobars,
      div.infobars-container,
      div.infobar-container,
      div.infobar-wrapper,
      div.infobars-wrapper,
      div[style*="z-index: 2147483647"][style*="position: fixed"][style*="top: 0px"][style*="left: 0px"][style*="width: 100%"],
      div[style*="z-index: 2147483647"][style*="position: fixed"][style*="top: 0px"][style*="left: 0px"][style*="width: 100%"] *,
      div.top-container[style*="position: fixed"][style*="width: 100%"],
      div.top-container[style*="position: fixed"][style*="z-index: 2147483647"] {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
        height: 0 !important;
        max-height: 0 !important;
        min-height: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        overflow: hidden !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Limpia todas las cachés y perfiles de Chrome
 */
function cleanChromeProfiles() {
  // Directorios a limpiar
  const directories = [
    path.join(process.cwd(), 'ChromeProfile'),
    path.join(process.env.HOME || process.env.USERPROFILE || '', '.cache', 'playwright')
  ].filter(dir => fs.existsSync(dir));

  // Borrar cada directorio
  for (const dir of directories) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`✓ Directorio eliminado: ${dir}`);
    } catch (err) {
      console.error(`Error al eliminar ${dir}:`, err.message);
    }
  }
}

module.exports = {
  setupChromePreferences,
  getChromeArguments,
  getInjectionScript,
  cleanChromeProfiles
}; 