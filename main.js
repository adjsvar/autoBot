const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { execSync } = require('child_process');

// Ruta para almacenar los datos de persistencia
const userDataDir = path.join(app.getPath('userData'), 'ChromeProfile');
const cookiesPath = path.join(userDataDir, 'Default', 'Cookies');

let mainWindow;
let browserContext = null;
let tray = null;
let isQuitting = false;
let isLaunchingBrowser = false;
let lastStatusMessage = 'Navegador no iniciado'; // Variable para almacenar el último mensaje de estado
let sesionIniciada = false; // Variable para controlar si la sesión está iniciada
let sesionVerificadaFlag = false; // Flag para controlar si ya se ha verificado la sesión

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false, // Sin marco para personalizar la barra de título
    transparent: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'assets/bot.png')
  });

  mainWindow.loadFile('index.html');
  
  // Abrir DevTools en desarrollo
  // mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // Interceptar intento de cierre
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });
}

// Crear el Tray icon
function createTray() {
  // Asegurarse de que la carpeta assets exista
  if (!fs.existsSync(path.join(__dirname, 'assets'))) {
    fs.mkdirSync(path.join(__dirname, 'assets'));
  }
  
  // Usar el icono bot.png
  const iconPath = path.join(__dirname, 'assets/bot.png');
  
  try {
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.resize({ width: 16, height: 16 }));
  } catch (error) {
    console.error('Error creando tray icon:', error);
    // Fallback a un icono vacío
    tray = new Tray(nativeImage.createEmpty());
  }
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Mostrar aplicación', 
      click: () => {
        if (mainWindow === null) {
          createWindow();
        } else {
          mainWindow.show();
        }
      }
    },
    { type: 'separator' },
    { label: 'Buscar Partidos', click: () => triggerAction('buscar-partidos') },
    { label: 'Iniciar Sesión', click: () => triggerAction('iniciar-sesion') },
    { type: 'separator' },
    { 
      label: 'Salir', 
      click: () => {
        isQuitting = true;
        closeAndQuit();
      }
    }
  ]);
  
  tray.setToolTip('AutoBot - Buscador de Partidos');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    if (mainWindow === null) {
      createWindow();
    } else {
      mainWindow.show();
    }
  });
}

// Función para activar acciones desde el tray
function triggerAction(action) {
  if (!mainWindow) {
    createWindow();
  }
  
  mainWindow.show();
  mainWindow.webContents.send('trigger-action', action);
}

// Función para cerrar el navegador y la aplicación adecuadamente
async function closeAndQuit() {
  try {
    if (browserContext) {
      console.log('Cerrando navegador...');
      await browserContext.close().catch(err => {
        console.error('Error al cerrar navegador:', err);
      });
      browserContext = null;
    }
  } catch (error) {
    console.error('Error en cierre de navegador:', error);
  } finally {
    app.quit();
  }
}

// Iniciar el navegador con persistencia
async function initBrowser() {
  // Evitar inicializaciones simultáneas
  if (isLaunchingBrowser) {
    console.log('Navegador ya está siendo iniciado...');
    return false;
  }
  
  // Si ya hay un contexto existente y está activo, retornar éxito
  if (browserContext) {
    try {
      // Verificar si el contexto sigue siendo válido
      await browserContext.pages();
      
      console.log('Navegador ya está iniciado y activo');
      notifyBrowserStatusChanged(true);
      return true;
    } catch (error) {
      console.log('Navegador encontrado pero inválido, reiniciando...');
      browserContext = null;
      notifyBrowserStatusChanged(false);
    }
  }
  
  isLaunchingBrowser = true;
  
  try {
    console.log('Lanzando navegador Chrome...');
    // Asegurarnos de que el directorio existe
    if (!fs.existsSync(userDataDir)){
      fs.mkdirSync(userDataDir, { recursive: true });
    }
    
    // Crear/actualizar archivo de preferencias para eliminar el mensaje de automatización
    const prefsPath = path.join(userDataDir, 'Default', 'Preferences');
    try {
      // Asegurarse de que el directorio Default existe
      if (!fs.existsSync(path.join(userDataDir, 'Default'))) {
        fs.mkdirSync(path.join(userDataDir, 'Default'), { recursive: true });
      }
      
      // Crear o cargar las preferencias existentes
      let prefs = {};
      if (fs.existsSync(prefsPath)) {
        const data = fs.readFileSync(prefsPath, 'utf8');
        try {
          prefs = JSON.parse(data);
        } catch (e) {
          console.log('Error al parsear preferencias existentes:', e);
        }
      }
      
      // Modificar preferencias para ocultar mensaje de automatización y mejorar persistencia
      prefs = {
        ...prefs,
        profile: {
          ...(prefs.profile || {}),
          exit_type: "Normal",
          exited_cleanly: true
        },
        browser: {
          ...(prefs.browser || {}),
          enabled_labs_experiments: [
            "disable-automation"
          ],
          has_seen_welcome_page: true,
          last_known_google_url: "https://www.google.com/",
          last_prompted_google_url: "https://www.google.com/"
        },
        credentials_enable_service: true, // Activar servicio de credenciales
        credentials_enable_autosignin: true, // Permitir auto-signin
        privacy_sandbox: {
          ...(prefs.privacy_sandbox || {}),
          apis_enabled_v2: true
        },
        signin: {
          ...(prefs.signin || {}),
          allowed: true,
          allowed_on_next_startup: true
        },
        autofill: {
          ...(prefs.autofill || {}),
          enabled: true,
          profile_enabled: true
        },
        session: {
          ...(prefs.session || {}),
          restore_on_startup: 1
        },
        // Configuraciones adicionales para mejorar persistencia
        default_content_setting_values: {
          ...(prefs.default_content_setting_values || {}),
          cookies: 1 // 1 = permitir cookies
        },
        // Asegurar que el almacenamiento local y cookies estén activados
        local_storage: true,
        domain_reliability: {
          ...(prefs.domain_reliability || {}),
          enabled: false // Desactivar reportes de fiabilidad
        }
      };
      
      // Guardar preferencias
      fs.writeFileSync(prefsPath, JSON.stringify(prefs));
      console.log('Preferencias de Chrome actualizadas para mejorar persistencia y ocultar automatización');
    } catch (e) {
      console.error('Error al configurar preferencias de Chrome:', e);
    }
    
    // Verificar si existe archivo de cookies
    if (fs.existsSync(cookiesPath)) {
      console.log('Archivo de cookies encontrado:', cookiesPath);
    } else {
      console.log('No se encontró archivo de cookies existente');
    }
    
    // Usar las mismas opciones del script original, pero con mejoras
    // Crear una lista personalizada de argumentos que excluya explícitamente --no-sandbox
    const customArgs = [
      '--start-maximized',
      '--disable-extensions',
      '--disable-component-extensions-with-background-pages',
      '--disable-default-apps',
      '--no-default-browser-check',
      '--no-first-run',
      '--disable-infobars',                              // Ocultar barra "Chrome está siendo controlado por software automatizado"
      '--exclude-switches=enable-automation',            // Solución directa para quitar mensaje de automatización
      '--disable-blink-features=AutomationControlled',   // Evitar detección de automatización
      '--disable-features=RendererCodeIntegrity',        // Mejora para evitar detección
      '--enable-features=NetworkServiceInProcess2',      // Solución específica para el mensaje de automatización
      '--allow-pre-commit-input',                        // Mejora adicional para evitar detección
      '--password-store=basic',                          // Evita problemas con almacenamiento de contraseñas
      '--use-mock-keychain',                             // Evita interacción con keychain del sistema
      '--force-webrtc-ip-handling-policy=default_public_interface_only', // Mejora privacidad
      '--user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"',  // User agent personalizado
      '--enable-cookies',                                // Asegurar que las cookies estén habilitadas
      '--enable-local-storage',                          // Habilitar almacenamiento local
      '--disable-cookie-encryption',                     // Desactivar encriptación de cookies para mejorar persistencia
      '--enable-dom-storage',                            // Habilitar DOM storage
      '--disable-site-isolation-trials'                  // Desactivar aislamiento de sitios
    ];
    
    // Lanzar navegador con persistencia mejorada
    browserContext = await chromium.launchPersistentContext(userDataDir, {
      headless: false,  // Mantener interfaz visible para el navegador principal
      args: customArgs,
      ignoreAllDefaultArgs: false,  // Usar argumentos por defecto + los nuestros
      ignoreDefaultArgs: ['--enable-automation'], // Ignorar solo argumentos específicos
      channel: 'chrome',
      viewport: null,
      acceptDownloads: true,
      bypassCSP: true, // Bypass Content Security Policy
      locale: 'es-ES', // Configurar idioma español
      timezoneId: 'Europe/Madrid', // Configurar zona horaria
      storageState: fs.existsSync(path.join(userDataDir, 'storage.json')) ? 
                    path.join(userDataDir, 'storage.json') : undefined // Cargar estado de almacenamiento si existe
    });
    
    // Verificar cookies existentes en el contexto
    try {
      const cookies = await browserContext.cookies();
      console.log(`Total de cookies cargadas: ${cookies.length}`);
      
      // Guardar estado de almacenamiento periódicamente
      setInterval(async () => {
        try {
          if (browserContext) {
            const state = await browserContext.storageState();
            fs.writeFileSync(path.join(userDataDir, 'storage.json'), JSON.stringify(state, null, 2));
            console.log(`Estado de almacenamiento guardado (${state.cookies.length} cookies)`);
          }
        } catch (e) {
          console.error('Error al guardar estado de almacenamiento:', e);
        }
      }, 60000); // Guardar cada minuto
    } catch (e) {
      console.error('Error al verificar cookies:', e);
    }
    
    // IMPORTANTE: Inyectar script para ocultar mensajes en todas las páginas
    await browserContext.addInitScript(() => {
      // Ocultar que estamos usando WebDriver/Automation
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      
      // Eliminar todas las señales de automatización
      if (window.chrome) {
        // Eliminar o modificar propiedades que delatan automatización
        window.chrome = new Proxy(window.chrome, {
          get: function(target, name) {
            if (name === 'app') {
              return {
                isInstalled: false,
                InstallState: {
                  DISABLED: 'disabled',
                  INSTALLED: 'installed',
                  NOT_INSTALLED: 'not_installed'
                },
                RunningState: {
                  CANNOT_RUN: 'cannot_run',
                  READY_TO_RUN: 'ready_to_run',
                  RUNNING: 'running'
                }
              };
            }
            if (name === 'runtime') {
              return undefined;
            }
            return target[name];
          }
        });
      }
      
      // Sobreescribir la propiedad navigator.cookieEnabled para asegurar que las cookies estén habilitadas
      Object.defineProperty(navigator, 'cookieEnabled', { get: () => true });
      
      // Mejorar soporte de persistencia de cookies
      const origCookie = document.__lookupGetter__('cookie');
      const origSetCookie = document.__lookupSetter__('cookie');
      
      // Interceptar todas las operaciones de cookies para debugging
      Object.defineProperty(document, 'cookie', {
        get: function() {
          const cookies = origCookie.call(document);
          console.log('Leyendo cookies:', cookies);
          return cookies;
        },
        set: function(val) {
          console.log('Estableciendo cookie:', val);
          return origSetCookie.call(document, val);
        }
      });
      
      // Ocultar scripts de automatización en los plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          // Devolver algunos plugins falsos para parecer un navegador normal
          return [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: 'Portable Document Format' },
            { name: 'Native Client', filename: 'internal-nacl-plugin', description: 'Native Client Executable' }
          ];
        }
      });
      
      // Modificar userAgent para eliminar indicadores de automatización
      const userAgent = window.navigator.userAgent.replace(/HeadlessChrome/gi, 'Chrome');
      Object.defineProperty(navigator, 'userAgent', { get: () => userAgent });
      
      // Inyectar CSS más específico para ocultar visualmente el mensaje de automatización
      const style = document.createElement('style');
      style.textContent = `
        /* Selectores específicos para la barra de información de Chrome */
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
        
        /* Selector general para cualquier mensaje de error o notificación */
        [aria-live="assertive"],
        [role="alert"],
        [role="status"],
        [aria-relevant="additions"] {
          display: none !important;
          visibility: hidden !important;
        }
      `;
      document.head.appendChild(style);
    });
    
    // Verificar qué argumentos se están usando realmente
    const browser = browserContext.browser();
    if (browser) {
      console.log('Argumentos del navegador:', browser.process().spawnargs.join(' '));
    }
    
    // Intentar matar cualquier barra de infobars en Chrome
    try {
      // Intentar matar los procesos de Chrome InfoBar usando xdotool si está disponible
      const hasXdotool = execSync('which xdotool 2>/dev/null || echo ""').toString().trim() !== "";
      if (hasXdotool) {
        console.log('Detectado xdotool, intentando eliminar infobars...');
        // Ejecutar en segundo plano un script que busca y cierra automáticamente los infobars
        const killInfobarsCmd = `
          (sleep 1 && xdotool search --name "Chrome" windowactivate --sync && 
           xdotool key --delay 100 Escape && sleep 0.5 && 
           xdotool key --delay 100 Escape) > /dev/null 2>&1 &
        `;
        execSync(killInfobarsCmd, { shell: '/bin/bash' });
        console.log('Comando para eliminar infobars ejecutado');
      }
    } catch (error) {
      console.log('Error al intentar eliminar infobars:', error.message);
    }
    
    // Programar verificaciones periódicas para detectar cierre manual de Chrome
    const checkInterval = setInterval(async () => {
      if (browserContext) {
        try {
          await browserContext.pages();
        } catch (error) {
          console.log('Navegador cerrado manualmente (detectado en monitoreo)');
          browserContext = null;
          notifyBrowserStatusChanged(false);
          clearInterval(checkInterval);
        }
      } else {
        clearInterval(checkInterval);
      }
    }, 2000);
    
    console.log('Navegador iniciado con éxito');
    notifyBrowserStatusChanged(true);
    return true;
  } catch (error) {
    console.error('Error al iniciar el navegador:', error);
    notifyBrowserStatusChanged(false);
    return false;
  } finally {
    isLaunchingBrowser = false;
  }
}

// Notificar al renderer sobre cambios en el estado del navegador
function notifyBrowserStatusChanged(isConnected, statusMessage) {
  // Si recibimos un mensaje específico, lo guardamos
  if (statusMessage) {
    lastStatusMessage = statusMessage;
  } else {
    // Sino, usamos el último mensaje almacenado o uno por defecto basado en estado
    statusMessage = lastStatusMessage || (isConnected ? 'Navegador conectado' : 'Navegador desconectado');
  }
  
  console.log(`Notificando cambio de estado: ${statusMessage}`);
  
  // Asegurarse de que mainWindow existe y está listo para recibir mensajes
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send('browser-status-changed', isConnected, statusMessage);
    } catch (error) {
      console.error('Error al notificar el estado:', error);
    }
  } else {
    console.log('No se puede notificar el estado - ventana no disponible');
  }
}

// Inicialización de la app
app.on('ready', () => {
  createWindow();
  createTray();
  
  // Reiniciar estado de sesión al inicio de la aplicación
  sesionIniciada = false;
  sesionVerificadaFlag = false;
  
  // Verificar estado del navegador cuando la app está lista
  setTimeout(async () => {
    const status = browserContext !== null;
    // Verificar sesión al iniciar
    notifyBrowserStatusChanged(status);
    verificarSesion();
  }, 1000);
});

// Controlamos el cierre y salida
app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    // No cerramos la app, solo la minimizamos al tray
    // Solo se cierra cuando se activa isQuitting
    if (isQuitting) {
      await closeAndQuit();
    }
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Manejadores de IPC para ventana personalizada
ipcMain.on('minimize-app', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('maximize-app', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('close-app', () => {
  if (mainWindow) {
    mainWindow.hide(); // Solo ocultamos, no cerramos
  }
});

// Manejadores de IPC para comunicación con el renderer
ipcMain.handle('init-browser', async () => {
  notifyBrowserStatusChanged(true, "Iniciando navegador...");
  const result = await initBrowser();
  if (result) {
    notifyBrowserStatusChanged(true, "Navegador listo");
  } else {
    notifyBrowserStatusChanged(false, "Error al iniciar navegador");
  }
  return result;
});

// Verificar estado actual del navegador
ipcMain.handle('check-browser-status', async () => {
  // Verificar si el browserContext existe y sigue siendo válido
  if (browserContext) {
    try {
      // Intentar obtener las páginas como prueba de que sigue activo
      await browserContext.pages();
      return { connected: true, message: lastStatusMessage || 'Navegador conectado' };
    } catch (error) {
      // Si hay error, el navegador ya no está activo
      browserContext = null;
      lastStatusMessage = 'Navegador desconectado';
      return { connected: false, message: lastStatusMessage };
    }
  }
  
  // Si no hay browserContext, el navegador no está activo
  lastStatusMessage = 'Navegador no iniciado';
  return { connected: false, message: lastStatusMessage };
});

ipcMain.handle('buscar-partidos', async () => {
  let page = null;
  let headlessBrowser = null;
  
  try {
    console.log('Iniciando búsqueda de partidos en modo headless...');
    // Notificar al usuario que estamos buscando partidos
    notifyBrowserStatusChanged(true, "Buscando partidos...");
    
    // Lista personalizada de argumentos
    const headlessArgs = [
      '--disable-extensions',
      '--disable-component-extensions-with-background-pages',
      '--disable-default-apps',
      '--no-default-browser-check',
      '--no-first-run',
      '--disable-infobars',
      '--exclude-switches=enable-automation',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=RendererCodeIntegrity',
      '--enable-features=NetworkServiceInProcess2',
      '--password-store=basic'
    ];
    
    // Iniciar navegador headless independiente
    headlessBrowser = await chromium.launch({
      headless: true,
      args: headlessArgs,
      ignoreAllDefaultArgs: true,
      channel: 'chrome'
    });
    
    // Crear contexto y página para el navegador headless
    const headlessContext = await headlessBrowser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    
    // Inyectar script para ocultar signos de automatización
    await headlessContext.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      if (window.chrome) {
        window.chrome = new Proxy(window.chrome, {
          get: (target, name) => {
            if (name === 'app') return { isInstalled: false };
            if (name === 'runtime') return undefined;
            return target[name];
          }
        });
      }
    });
    
    page = await headlessContext.newPage();
    console.log('Navegador headless iniciado para buscar partidos');
    
    // Navegar a 1xbet (usando la URL original del script)
    console.log('Navegando a 1xbet...');
    await page.goto('https://1xbet.mobi/es/line/football?platform_type=mobile', {
      timeout: 90000
    });
      
    console.log('Página cargada, esperando a que se estabilice...');
    await page.waitForTimeout(5000);
      
    // Intentar cerrar diálogos si existen
    try {
      const dialogSelectors = [
        'button:has-text("Aceptar")', 
        'button:has-text("Accept")',
        '.cookie-agreement__button',
        '[aria-label="Close"]',
        '.modal__close'
      ];
      
      for (const selector of dialogSelectors) {
        if (await page.locator(selector).count() > 0) {
          console.log(`Cerrando diálogo: ${selector}`);
          await page.locator(selector).first().click().catch(() => {});
          await page.waitForTimeout(1000);
        }
      }
    } catch (e) {
      // Ignorar errores de diálogos, podría ser cierre manual
      if (e.message.includes('closed') || e.message.includes('detached')) {
        return { success: false, silent: true };
      }
    }
      
    // Ejecutar el script del usuario en el contexto del navegador
    console.log('Ejecutando script para extraer partidos...');
    const resultado = await page.evaluate(() => {
      /* ───────────────────────────── 0. Configuración ───────────────────────────── */
      const forbidden = [
        'short',
        'student',
        'estadisticas',     // sin tilde
        'estadísticas',     // con tilde
        'jugador',
        'apuestas',
        'especiales',
        'locales',
        'visitantes'
      ];

      const partidos     = [];          // objetos {nombre, link, fecha, equipo1, equipo2}
      const seenPartidos = new Set();   // control de duplicados

      /* Helpers */
      const norm         = str => str.toLowerCase().trim();
      const hasForbidden = txt => forbidden.some(w => txt.includes(w));
      const wait         = ms  => new Promise(r => setTimeout(r, ms));

      /* Convierte "31/5 16:00" (o "31/05/24 16:00") a ISO */
      function parseDate(str) {
        const m = str.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+(\d{1,2}):(\d{2})/);
        if (!m) return str;
        const [, d, M, y, hh, mm] = m;
        const year = y ? (y.length === 2 ? ('20' + y) : y) : new Date().getFullYear();
        const date = new Date(year, Number(M) - 1, Number(d), Number(hh), Number(mm));
        return date.toISOString();
      }

      /* ───────── Añadir un partido sólo si pasa filtros y no es duplicado ───────── */
      function collectGames(scope) {
        scope.querySelectorAll('.dashboard-champ-item-template-games-list__item')
             .forEach(game => {
               const fullTxt = norm(game.textContent);
               if (hasForbidden(fullTxt)) {
                 console.log(`🚫 Filtrado PARTIDO: "${fullTxt.slice(0, 60)}…"`);
                 return;
               }

               const linkEl   = game.querySelector('a');
               const link     = linkEl ? linkEl.href : '';
               const teams    = game.querySelectorAll('.ui-game-card-scoreboard-teams-name__caption');
               const equipo1  = teams[0]?.textContent.trim() ?? '';
               const equipo2  = teams[1]?.textContent.trim() ?? '';
               const nombre   = `${equipo1} vs ${equipo2}`.trim();
               const dateEl   = game.querySelector('.ui-caption--size-xs.ui-caption--no-wrap.ui-caption.ui-game-card__data');
               const fechaRaw = dateEl ? dateEl.textContent.trim() : '';
               const fecha    = parseDate(fechaRaw);

               const key = link || `${nombre}|${fecha}`;
               if (seenPartidos.has(key)) {
                 console.log(`♻️  Duplicado ignorado: "${nombre}" (${fecha})`);
                 return;
               }

               const partido = { nombre, link, fecha, equipo1, equipo2 };
               partidos.push(partido);
               seenPartidos.add(key);

               /*  ← LOG ahora muestra el objeto completo  */
               console.log('⚽️ Partido añadido:', partido, `(total: ${partidos.length})`);
             });
      }

      /* ─────────────────── 1. Selección + filtrado de elementos LI ─────────────────── */
      const allLis = Array.from(
        document.querySelectorAll('li.dashboard-champs-by-countries-list__item')
      );

      const filteredLis = allLis.filter(li => {
        const captionEl = li.querySelector('.ui-caption--size-xs.ui-caption');
        if (!captionEl) return true;

        const captionText = norm(captionEl.textContent);
        if (hasForbidden(captionText)) {
          console.log(`🚫 Filtrado LI: "${captionText}"`);
          return false;
        }
        return true;
      });

      console.log(`✅ LIs analizados: ${allLis.length} → ${filteredLis.length} tras filtrar`);

      /* ────────────────────── 2. Utilidades de scroll y acordeón ───────────────────── */

      async function scrollToElement(el, offset = 80) {
        const rect = el.getBoundingClientRect();
        if (rect.top < offset || rect.top > window.innerHeight - offset) {
          window.scrollBy({ top: rect.top - offset, behavior: 'smooth' });
          await wait(400);
        }
      }

      async function toggleStable(el) {
        const btn = el.querySelector(
                     '.ui-accordion button, .ui-accordion__header, button, [role="button"]'
                   ) || el;
        const container = document.scrollingElement || document.documentElement;
        const y0 = container.scrollTop;

        btn.click();
        await wait(50);
        container.scrollTop = y0;
        await wait(200);
      }

      const isLiOpened  = li  => li.querySelector('.ui-accordion')?.classList.contains('ui-accordion--is-opened');
      const isDivOpened = div => div.classList.contains('ui-accordion--is-opened');

      /* ──────────────────── 3. Procesamiento de divs secundarios ──────────────────── */
      async function processSecondaryDivs(li) {
        const champsContainer = li.querySelector('.dashboard-champ-group-item__champs');
        if (!champsContainer) {
          collectGames(li);
          return;
        }

        const secondaryDivs = Array.from(
          champsContainer.querySelectorAll('.dashboard-champ-item-template.dashboard-champ-item')
        );

        const divsToProcess = secondaryDivs.filter(div => {
          const captionEl  = div.querySelector('.ui-caption--size-xs.ui-caption');
          const captionTxt = captionEl ? norm(captionEl.textContent) : '';
          return !hasForbidden(captionTxt);
        });

        for (const div of divsToProcess) {
          await scrollToElement(div);
          if (isDivOpened(div)) await toggleStable(div);
          await toggleStable(div);           // abrir
          await wait(400);

          collectGames(div);

          await wait(800);
          await toggleStable(div);           // cerrar
        }
      }

      /* ───────────────────────── 4. Bucle principal ───────────────────────── */
      async function openCloseLoop() {
        for (const li of filteredLis) {
          const captionEl = li.querySelector('.ui-caption--size-xs.ui-caption');
          const name = captionEl ? captionEl.textContent.trim()
                                 : norm(li.textContent).slice(0, 80);

          console.log(`\n🔍 LI: [${name}]`);
          await scrollToElement(li);

          if (isLiOpened(li)) await toggleStable(li);
          await toggleStable(li);            // abrir
          await wait(400);

          await processSecondaryDivs(li);

          await toggleStable(li);            // cerrar
          await wait(400);
        }

        console.log(`\n✅ Proceso completado. Partidos únicos: ${partidos.length}`);
        return partidos;
      }

      /* ───────────────────────── 5. Ejecutar ───────────────────────── */
      return openCloseLoop();
    }).catch(e => {
      // Si el navegador se cerró, terminamos silenciosamente
      if (e.message.includes('closed') || e.message.includes('detached')) {
        return null;
      }
      throw e; // Re-lanzar otros errores
    });
      
    // Si el navegador se cerró durante la evaluación, resultado será null
    if (resultado === null) {
      return { success: false, silent: true };
    }
      
    // Guardar resultados en un archivo
    console.log(`\nPartidos encontrados: ${resultado.length}`);
    fs.writeFileSync('partidos.json', JSON.stringify(resultado, null, 2));
    console.log('Resultados guardados en partidos.json');
    
    // Asegurarse de que el archivo seleccionarPartidos.html existe
    const rutaSeleccionHTML = path.join(__dirname, 'seleccionarPartidos.html');
    if (!fs.existsSync(rutaSeleccionHTML)) {
      // Si el archivo no existe, lo copiaremos del template
      console.log('Creando archivo seleccionarPartidos.html...');
      // No necesitamos crear el archivo porque ya lo hemos creado anteriormente
    }
    
    // Actualizar mensaje de estado
    notifyBrowserStatusChanged(true, `✅ ${resultado.length} partidos encontrados`);
      
    return { success: true, count: resultado.length };
  } catch (err) {
    // Detectar si el error es por cierre manual del navegador
    if (err.message.includes('closed') || err.message.includes('detached') || 
        err.message.includes('Target') || err.message.includes('browser')) {
      return { success: false, silent: true };
    }
      
    console.error('Error en la ejecución:', err);
    return { success: false, error: err.message };
  } finally {
    // Cerrar el navegador headless al terminar
    if (headlessBrowser) {
      try {
        await headlessBrowser.close();
        console.log('Navegador headless cerrado');
      } catch (e) {
        console.error('Error al cerrar navegador headless:', e.message);
      }
    }
    
    // Si hubo algún error, actualizamos el estado
    if (!mainWindow.isDestroyed()) {
      const existeArchivo = fs.existsSync(path.join(__dirname, 'partidos.json'));
      if (!existeArchivo) {
        notifyBrowserStatusChanged(false, "Error al buscar partidos");
      }
    }
  }
});

// Iniciar sesión
ipcMain.handle('iniciar-sesion', async (event, data = {}) => {
  let page = null;
  const loginUrl = 'https://1xbet.mobi/es/user/login?platform_type=mobile';
  let intervaloVerificacion = null;

  try {
    // Notificar que estamos iniciando sesión
    notifyBrowserStatusChanged(true, "Iniciando sesión...");
    
    // Verificar si el navegador está iniciado
    if (!browserContext) {
      const success = await initBrowser();
      if (!success) {
        notifyBrowserStatusChanged(false, "Error al iniciar navegador");
        return { success: false, silent: true };
      }
    } else {
      // Verificar si el browserContext sigue siendo válido
      try {
        await browserContext.pages().catch(() => {
          // Si el navegador se cerró manualmente, actualizar estado
          browserContext = null;
          return { success: false, silent: true };
        });
      } catch (error) {
        // Si el contexto ya no es válido, iniciar uno nuevo
        browserContext = null;
        const success = await initBrowser();
        if (!success) {
          return { success: false, silent: true };
        }
      }
    }

    // Si el navegador ya no existe después de la verificación, terminamos
    if (!browserContext) {
      return { success: false, silent: true };
    }

    try {
      // Usar la primera página existente o crear una nueva
      try {
        let pages = await browserContext.pages();
        
        if (pages && pages.length > 0) {
          page = pages[0];
        } else {
          page = await browserContext.newPage();
        }
      } catch (error) {
        console.log('Error al obtener páginas, creando una nueva');
        page = await browserContext.newPage();
      }
      
      // Navegar directamente a la página de login
      await page.goto(loginUrl, { timeout: 90000 });
      
      // Esperar a que la página se cargue completamente
      await page.waitForTimeout(3000);
      
      // Cerrar diálogos si existen
      try {
        const dialogSelectors = [
          'button:has-text("Aceptar")', 
          'button:has-text("Accept")',
          '.cookie-agreement__button',
          '[aria-label="Close"]',
          '.modal__close'
        ];
        
        for (const selector of dialogSelectors) {
          if (await page.locator(selector).count() > 0) {
            console.log(`Cerrando diálogo: ${selector}`);
            await page.locator(selector).first().click().catch(() => {});
            await page.waitForTimeout(1000);
          }
        }
      } catch (e) {
        console.log('Error al cerrar diálogos:', e.message);
      }
      
      // Configurar un intervalo para verificar si aparece el ícono de usuario (sesión iniciada)
      notifyBrowserStatusChanged(true, "Esperando inicio de sesión manual...");
      
      // Limpiar cualquier intervalo previo
      if (intervaloVerificacion) {
        clearInterval(intervaloVerificacion);
      }
      
      // Crear un nuevo intervalo de verificación
      intervaloVerificacion = setInterval(async () => {
        try {
          if (!page || page.isClosed()) {
            clearInterval(intervaloVerificacion);
            return;
          }
          
          // Verificar si existe el ícono de usuario que indica sesión iniciada
          const iconoUsuarioCount = await page.locator('.ico--user, .ico.user-control-panel-button__ico').count();
          
          if (iconoUsuarioCount > 0) {
            console.log('¡Sesión iniciada detectada! Se encontró el ícono de usuario.');
            
            // Marcar la sesión como iniciada
            sesionIniciada = true;
            sesionVerificadaFlag = true;
            
            // Notificar al renderer sobre el cambio de estado
            if (mainWindow && !mainWindow.isDestroyed()) {
              notifyBrowserStatusChanged(true, "✅ Sesión iniciada");
              mainWindow.webContents.send('sesion-status', true);
            }
            
            // Detener el intervalo de verificación
            clearInterval(intervaloVerificacion);
          }
        } catch (error) {
          console.log('Error al verificar ícono de usuario:', error.message);
          if (error.message.includes('closed') || error.message.includes('detached')) {
            clearInterval(intervaloVerificacion);
          }
        }
      }, 2000); // Verificar cada 2 segundos
      
      // Mantenemos la página abierta para que el usuario pueda iniciar sesión manualmente
      return { success: true };
    } catch (error) {
      // Detectar si el error es por cierre manual del navegador
      if (error.message.includes('closed') || error.message.includes('detached') || 
          error.message.includes('Target') || error.message.includes('browser')) {
        // Si es por cierre manual, actualizar estado
        notifyBrowserStatusChanged(false, "Navegador cerrado");
        return { success: false, silent: true };
      }
      
      // Si hay otro tipo de error, notificarlo
      notifyBrowserStatusChanged(false, `Error: ${error.message.substring(0, 50)}...`);
      console.error('Error en operaciones de página:', error);
      return { success: false, error: error.message };
    }
  } catch (error) {
    // Detectar si el error es por cierre manual del navegador
    if (error.message.includes('closed') || error.message.includes('detached') || 
        error.message.includes('Target') || error.message.includes('browser')) {
      // Si es por cierre manual, no reportar error
      return { success: false, silent: true };
    }
    
    console.error('Error al iniciar el navegador:', error);
    return { success: false, error: error.message };
  }
});

// Función para verificar sesión directamente en la página abierta
async function verificarSesionEnPagina(page) {
  if (!page || page.isClosed()) return false;
  
  try {
    // Verificar si existe algún botón o elemento de login
    const loginSelectors = [
      '.login-btn', 
      '.authorization-btn', 
      'button:has-text("Iniciar sesión")',
      'a:has-text("Iniciar sesión")',
      '.ui-caption--size-xs.ui-caption:has-text("Iniciar sesión")'
    ];
    
    // Verificar si hay elementos de inicio de sesión (PRESENTES = NO HAY SESIÓN)
    let loginElementFound = false;
    
    for (const selector of loginSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        console.log(`Elemento de login encontrado: "${selector}"`);
        loginElementFound = true;
        break;
      }
    }
    
    // Verificar si existe el ícono de usuario (icono de usuario PRESENTE = SESIÓN INICIADA)
    const userIconSelectors = [
      '.ico--user', 
      '.ico.user-control-panel-button__ico',
      '.user-control-panel-button'
    ];
    
    let userIconFound = false;
    for (const selector of userIconSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        console.log(`Ícono de usuario encontrado: "${selector}"`);
        userIconFound = true;
        break;
      }
    }
    
    // La sesión está iniciada si:
    // 1. NO se encuentra el botón de inicio de sesión, O
    // 2. SÍ se encuentra el ícono de usuario
    const estaIniciada = !loginElementFound || userIconFound;
    
    console.log(`Verificación en página: Sesión ${estaIniciada ? 'iniciada' : 'no iniciada'} (loginElement: ${loginElementFound}, userIcon: ${userIconFound})`);
    
    // Actualizar estado global de sesión
    if (estaIniciada !== sesionIniciada) {
      sesionIniciada = estaIniciada;
      
      // Notificar al renderer sobre el cambio de estado
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (estaIniciada) {
          notifyBrowserStatusChanged(true, "✅ Sesión iniciada");
        } else {
          notifyBrowserStatusChanged(true, "❌ Sesión no iniciada");
        }
        
        mainWindow.webContents.send('sesion-status', estaIniciada);
      }
    }
    
    return estaIniciada;
  } catch (error) {
    console.error('Error al verificar sesión en página:', error);
    return false;
  }
}

// Seleccionar partidos (placeholder)
ipcMain.handle('seleccionar-partidos', async () => {
  notifyBrowserStatusChanged(true, "Seleccionando partidos...");
  // Simulación: Suponemos que tomará unos segundos
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  notifyBrowserStatusChanged(true, "Partidos seleccionados");
  return { success: true, message: 'Funcionalidad de selección de partidos pendiente de implementar' };
});

// Modo auto
ipcMain.handle('modo-auto', async () => {
  try {
    notifyBrowserStatusChanged(true, "Iniciando modo automático...");
    
    // Verificar si el navegador está iniciado
    if (!browserContext) {
      const success = await initBrowser();
      if (!success) {
        notifyBrowserStatusChanged(false, "Error al iniciar navegador");
        return { success: false, error: "No se pudo iniciar el navegador" };
      }
      
      // Esperar un tiempo adicional para asegurar que las cookies se carguen correctamente
      console.log("Esperando que se inicialice completamente el navegador y se carguen las cookies...");
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Cargar configuración
    const configResult = await cargarConfiguracion();
    if (!configResult.success) {
      notifyBrowserStatusChanged(false, "Error al cargar configuración");
      return { success: false, error: "Error al cargar configuración" };
    }
    
    const config = configResult.config || {
      repeticiones: 1,
      montoApuesta: 50,
      cantidadPartidos: 5,
      tipoApuesta: "Más de 1"
    };
    
    console.log("Configuración cargada:", config);
    
    // Cargar partidos seleccionados
    const partidosResult = await cargarPartidosSeleccionados();
    if (!partidosResult.success || !partidosResult.data) {
      notifyBrowserStatusChanged(false, "No hay partidos seleccionados");
      return { success: false, error: "No hay partidos seleccionados" };
    }
    
    const { partidos } = partidosResult.data;
    if (!partidos || partidos.length === 0) {
      notifyBrowserStatusChanged(false, "No hay partidos seleccionados");
      return { success: false, error: "No hay partidos seleccionados" };
    }
    
    console.log(`Partidos seleccionados: ${partidos.length}`);
    
    // Mezclar aleatoriamente los partidos
    const partidosMezclados = [...partidos].sort(() => Math.random() - 0.5);
    
    // Determinar cuántos partidos procesar (mínimo entre cantidad configurada y disponibles)
    const cantidadProcesar = Math.min(config.cantidadPartidos, partidosMezclados.length);
    const partidosAProcesar = partidosMezclados.slice(0, cantidadProcesar);
    
    console.log(`Se procesarán ${cantidadProcesar} partidos de ${partidos.length} seleccionados`);
    
    // Crear una nueva página si no existe
    let page;
    try {
      const pages = await browserContext.pages();
      page = pages.length > 0 ? pages[0] : await browserContext.newPage();
      
      // Cerrar todas las páginas excepto la principal
      if (pages.length > 1) {
        for (let i = 1; i < pages.length; i++) {
          await pages[i].close();
        }
        page = pages[0];
      }
    } catch (error) {
      console.error("Error al obtener/crear página:", error);
      page = await browserContext.newPage();
    }
    
    // Configurar timeout más largo para operaciones de navegación
    page.setDefaultNavigationTimeout(90000);
    
    // Verificar y guardar el estado actual de las cookies
    try {
      const cookies = await browserContext.cookies();
      console.log(`Estado actual de cookies: ${cookies.length} cookies cargadas`);
      
      if (cookies.length === 0) {
        console.log("⚠️ ADVERTENCIA: No se han cargado cookies. La sesión puede no estar activa.");
        
        // Navegar a la página principal primero para inicializar la sesión
        notifyBrowserStatusChanged(true, "Inicializando sesión...");
        console.log("Navegando a la página principal para inicializar cookies...");
        
        await page.goto("https://1xbet.mobi/es", { 
          waitUntil: 'networkidle' 
        });
        
        console.log("Esperando inicialización de cookies...");
        await page.waitForTimeout(5000);
        
        // Verificar nuevamente las cookies
        const cookiesActualizadas = await browserContext.cookies();
        console.log(`Cookies después de inicialización: ${cookiesActualizadas.length} cookies cargadas`);
      }
    } catch (error) {
      console.error("Error al verificar cookies:", error.message);
    }
    
    // NAVEGAR AL CUPÓN: asegurarse de que la página se cargue completamente
    notifyBrowserStatusChanged(true, "Abriendo cupón de apuestas...");
    console.log("Navegando al cupón de apuestas...");
    
    // Usar espera de tipo 'networkidle' para asegurar carga completa
    try {
      // Primer intento con networkidle (espera a que la red esté inactiva)
      await page.goto("https://1xbet.mobi/es/user/coupon?platform_type=mobile", { 
        waitUntil: 'networkidle',
        timeout: 30000
      });
    } catch (error) {
      console.log("Error en primera carga del cupón, reintentando:", error.message);
      
      // Segundo intento con domcontentloaded (más rápido)
      await page.goto("https://1xbet.mobi/es/user/coupon?platform_type=mobile", { 
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
    }
    
    // Esperar tiempo adicional para asegurar que la página se cargue completamente
    console.log("Esperando que se cargue completamente la página del cupón...");
    await page.waitForTimeout(5000);
    
    // Verificar que estamos en la página correcta
    const urlActual = page.url();
    console.log(`URL actual después de navegación: ${urlActual}`);
    
    if (!urlActual.includes('/user/coupon')) {
      console.log("⚠️ No se pudo cargar la página del cupón correctamente. URL actual:", urlActual);
      notifyBrowserStatusChanged(false, "Error al cargar cupón");
      
      // Intentar nuevamente con una URL diferente
      console.log("Reintentando con URL alternativa...");
      await page.goto("https://1xbet.mobi/es/user/coupon", { 
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      
      await page.waitForTimeout(3000);
    }
    
    // Capturar una screenshot para debugging
    try {
      await page.screenshot({ path: path.join(__dirname, 'coupon-page.png') });
      console.log("Screenshot guardado para verificación");
    } catch (error) {
      console.log("Error al guardar screenshot:", error.message);
    }
    
    // Intentar eliminar todas las apuestas existentes
    notifyBrowserStatusChanged(true, "Limpiando cupón de apuestas existentes...");
    try {
      // Buscar el botón de eliminar todo
      console.log("Buscando botón para eliminar todas las apuestas...");
      const eliminarTodoCount = await page.locator('button[aria-label="Eliminar"][title="Eliminar"] .ico--trash-alt').count();
      if (eliminarTodoCount > 0) {
        console.log("Encontrado botón para eliminar todas las apuestas, haciendo clic...");
        await page.locator('button[aria-label="Eliminar"][title="Eliminar"] .ico--trash-alt').first().click();
        await page.waitForTimeout(3000);
      } else {
        console.log("No se encontró el botón para eliminar todas las apuestas");
      }
      
      // Eliminar apuestas bloqueadas (coupon-bet-lock) si existen
      let intentos = 0;
      const maxIntentos = 10;
      
      // Loop para intentar eliminar todos los coupon-bet-lock
      while (intentos < maxIntentos) {
        const locksCount = await page.locator('.coupon-bet__lock.coupon-bet-lock').count();
        if (locksCount === 0) {
          console.log("No hay más apuestas bloqueadas");
          break;
        }
        
        console.log(`Encontradas ${locksCount} apuestas bloqueadas, eliminando...`);
        
        // Intentar hacer clic en todos los botones de eliminar
        for (let i = 0; i < locksCount; i++) {
          try {
            // Buscar el botón de eliminar dentro del elemento bloqueado
            const removeButton = page.locator('.coupon-bet__lock.coupon-bet-lock').nth(i).locator('.coupon-bet-lock__remove');
            await removeButton.click();
            await page.waitForTimeout(1000);
          } catch (e) {
            console.log(`Error al eliminar apuesta bloqueada ${i}:`, e.message);
          }
        }
        
        // Esperar un momento antes de verificar de nuevo
        await page.waitForTimeout(1500);
        intentos++;
      }
    } catch (error) {
      console.log("Error al limpiar el cupón:", error.message);
    }
    
    // Proceder directamente a procesar los partidos sin ir a la página de fútbol
    notifyBrowserStatusChanged(true, `Procesando ${cantidadProcesar} partidos...`);
    console.log(`Comenzando procesamiento directo de ${cantidadProcesar} partidos...`);
    
    // Contador de partidos procesados con éxito
    let procesadosExito = 0;
    let procesadosTotal = 0;
    
    // Función auxiliar para verificar el número actual de apuestas en el cupón
    const verificarContadorApuestas = async () => {
      try {
        // Verificar el contador de apuestas en el cupón
        const contadorCount = await page.locator('.ui-badge.ui-badge--theme-accent.bottom-navigation-link-coupon-content__count').count();
        
        if (contadorCount > 0) {
          // Obtener el texto del contador
          const texto = await page.locator('.ui-badge.ui-badge--theme-accent.bottom-navigation-link-coupon-content__count').first().innerText();
          
          // Convertir el texto a número
          const numeroApuestas = parseInt(texto.trim(), 10) || 0;
          console.log(`Contador de apuestas actual: ${numeroApuestas}`);
          return numeroApuestas;
        } else {
          // Intentar un selector alternativo
          const contadorAltCount = await page.locator('.bottom-navigation-link-coupon-content__count').count();
          if (contadorAltCount > 0) {
            const textoAlt = await page.locator('.bottom-navigation-link-coupon-content__count').first().innerText();
            const numeroApuestasAlt = parseInt(textoAlt.trim(), 10) || 0;
            console.log(`Contador alternativo de apuestas: ${numeroApuestasAlt}`);
            return numeroApuestasAlt;
          }
        }
        console.log("No se encontró el contador de apuestas en la página");
        return 0;
      } catch (error) {
        console.log("Error al verificar contador de apuestas:", error.message);
        return 0;
      }
    };
    
    // Verificar contador inicial
    let contadorApuestas = await verificarContadorApuestas();
    console.log(`Contador inicial de apuestas: ${contadorApuestas}`);
    
    // Procesar cada partido hasta alcanzar la cantidad deseada
    let partidoIndex = 0;
    while (procesadosExito < cantidadProcesar && partidoIndex < partidosAProcesar.length) {
      try {
        procesadosTotal++;
        const partido = partidosAProcesar[partidoIndex];
        partidoIndex++;
        
        notifyBrowserStatusChanged(true, `Procesando partido ${procesadosTotal}/${cantidadProcesar}...`);
        
        // Si no tiene link, continuar con el siguiente
        if (!partido.link) {
          console.log("Partido sin link, saltando...");
          continue;
        }
        
        console.log(`Procesando partido: ${partido.nombre}`);
        console.log(`URL: ${partido.link}`);
        
        // Navegar a la página del partido
        await page.goto(partido.link, { waitUntil: 'domcontentloaded' });
        
        // Esperar a que la página cargue completamente
        await page.waitForTimeout(3000);
        
        // Ejecutar la secuencia de apuesta
        const resultado = await realizarApuesta(page, config);
        
        if (resultado.success) {
          // Verificar si la apuesta realmente se agregó al cupón
          const contadorNuevo = await verificarContadorApuestas();
          if (contadorNuevo > contadorApuestas) {
            procesadosExito++;
            contadorApuestas = contadorNuevo;
            console.log(`✅ Apuesta realizada con éxito en: ${partido.nombre}`);
            console.log(`Contador de apuestas actualizado: ${contadorApuestas}/${cantidadProcesar}`);
          } else {
            console.log(`⚠️ La apuesta aparentemente no se agregó al cupón: ${partido.nombre}`);
          }
        } else {
          console.log(`❌ Error al realizar apuesta en: ${partido.nombre}`);
          console.log(`Error: ${resultado.error}`);
        }
        
        // Esperar entre partidos
        await page.waitForTimeout(2000);
        
        // Si ya hemos alcanzado el número deseado de apuestas, terminar
        if (contadorApuestas >= cantidadProcesar) {
          console.log(`Se ha alcanzado el número deseado de apuestas (${contadorApuestas}/${cantidadProcesar}), finalizando...`);
          break;
        }
      } catch (error) {
        console.error(`Error procesando partido: ${error.message}`);
      }
    }
    
    // Al finalizar, navegar a la página del cupón de apuestas para colocar el monto
    try {
      notifyBrowserStatusChanged(true, "Navegando a la página del cupón de apuestas...");
      console.log("Navegando a la página del cupón de apuestas...");
      
      await page.goto("https://1xbet.mobi/es/user/coupon?platform_type=mobile", { 
        waitUntil: 'domcontentloaded' 
      });
      
      // Esperar a que la página del cupón cargue completamente
      await page.waitForTimeout(3000);
      
      console.log("Página del cupón de apuestas cargada correctamente");
      
      // Verificar número final de apuestas
      const contadorFinal = await verificarContadorApuestas();
      console.log(`Contador final de apuestas: ${contadorFinal}/${cantidadProcesar}`);
      
      // Intentar establecer el monto de apuesta
      try {
        // Buscar el input de monto y escribir el valor
        const inputMontoCount = await page.locator('input.coupon-action-form__sum').count();
        if (inputMontoCount > 0) {
          console.log(`Estableciendo monto de apuesta: ${config.montoApuesta}`);
          
          // Limpiar el campo primero
          await page.locator('input.coupon-action-form__sum').first().click({ clickCount: 3 });
          await page.locator('input.coupon-action-form__sum').first().fill('');
          await page.waitForTimeout(500);
          
          // Escribir el nuevo valor
          await page.locator('input.coupon-action-form__sum').first().fill(config.montoApuesta.toString());
          await page.waitForTimeout(1000);
          
          console.log(`Monto de apuesta establecido: ${config.montoApuesta}`);
        } else {
          console.log("No se encontró el campo para el monto de apuesta");
        }
      } catch (error) {
        console.error("Error al establecer monto de apuesta:", error.message);
      }
      
      // Finalizar el proceso de la repetición actual
      notifyBrowserStatusChanged(true, `✅ Completado: ${procesadosExito}/${cantidadProcesar} partidos`);
      console.log(`Proceso de repetición completado. Procesados ${procesadosExito} de ${cantidadProcesar} partidos con éxito.`);
      
      // Ejecutar la siguiente repetición (si es necesario)
      // Esto se manejaría en el front-end o con un contador de repeticiones
      
      // Cerrar el navegador para iniciar la siguiente repetición con un navegador fresco
      if (config.repeticiones > 1) {
        console.log("Cerrando navegador para iniciar nueva repetición...");
        
        // Esperar un tiempo para que el usuario pueda ver el resultado
        await page.waitForTimeout(5000);
        
        // Cerrar el navegador
        if (browserContext) {
          await browserContext.close().catch(error => {
            console.error("Error al cerrar el navegador:", error.message);
          });
          browserContext = null;
        }
      }
    } catch (error) {
      console.error("Error al navegar a la página del cupón:", error);
    }
    
    return { 
      success: true, 
      message: `Proceso completado. ${procesadosExito} de ${cantidadProcesar} partidos procesados con éxito.` 
    };
  } catch (error) {
    console.error("Error en modo automático:", error);
    notifyBrowserStatusChanged(false, "Error en modo automático");
    return { success: false, error: error.message };
  }
});

// Función para realizar la apuesta en un partido
async function realizarApuesta(page, config) {
  try {
    // Funciones auxiliares
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    
    // 1. Buscar y hacer clic en "1.ª mitad"
    console.log("Buscando opción '1.ª mitad'...");
    
    // Esperamos a que los elementos estén disponibles
    await page.waitForLoadState('networkidle');
    await sleep(2000);
    
    // Buscar el elemento "1.ª mitad" exactamente como en el código original
    const primeraMitadFound = await page.evaluate(() => {
      const liPrimeraMitad = Array.from(
        document.querySelectorAll('li.game-sub-games__item')
      ).find(li => {
        const span = li.querySelector('span.ui-caption--size-xs.ui-caption');
        return span && span.textContent.trim() === '1.ª mitad';
      });
      
      if (!liPrimeraMitad) {
        console.warn('No se encontró el elemento «1.ª mitad».');
        return false;
      }
      
      // Disparar el clic en el elemento encontrado
      liPrimeraMitad.click();
      return true;
    });
    
    if (!primeraMitadFound) {
      console.log("No se encontró el elemento '1.ª mitad'");
      return { success: false, error: "No se encontró '1.ª mitad'" };
    }
    
    console.log("Clic en '1.ª mitad' realizado");
    await sleep(800); // Mismo delay que en el código original
    
    // 2. Esperar encabezado "Total. 1.ª mitad" u otros según el tipo de apuesta
    console.log(`Esperando encabezado correspondiente a ${config.tipoApuesta}...`);
    
    // Primero verificamos inmediatamente si el encabezado ya está visible
    const headerVisible = await page.evaluate((tipoApuesta) => {
      let patronBusqueda;
      if (tipoApuesta.includes("Más de") || tipoApuesta.includes("Menos de")) {
        patronBusqueda = /total\.?\s*1\.?ª?\s*mitad/i;
      } else if (tipoApuesta === "Ambos equipos marcarán") {
        patronBusqueda = /ambos\s+equipos\s+marcarán/i;
      } else if (tipoApuesta === "Victoria Local" || tipoApuesta === "Victoria Visitante" || tipoApuesta === "Empate") {
        patronBusqueda = /resultado\s+del\s+partido/i;
      } else {
        patronBusqueda = /total\.?\s*1\.?ª?\s*mitad/i; // Predeterminado
      }
      
      const header = Array.from(
        document.querySelectorAll('.game-markets-group-header__name')
      ).find(h => patronBusqueda.test(h.textContent));
      
      return !!header;
    }, config.tipoApuesta);
    
    // Si el encabezado ya está visible, no esperamos más
    if (headerVisible) {
      console.log("Encabezado correspondiente encontrado inmediatamente");
    } else {
      // Si no está visible, esperamos un máximo de 2 segundos
      console.log("Encabezado no encontrado inmediatamente, esperando...");
      await page.waitForTimeout(2000);
      
      // Verificar si el encabezado apareció después de la espera
      const headerFoundAfterWait = await page.evaluate((tipoApuesta) => {
        let patronBusqueda;
        if (tipoApuesta.includes("Más de") || tipoApuesta.includes("Menos de")) {
          patronBusqueda = /total\.?\s*1\.?ª?\s*mitad/i;
        } else if (tipoApuesta === "Ambos equipos marcarán") {
          patronBusqueda = /ambos\s+equipos\s+marcarán/i;
        } else if (tipoApuesta === "Victoria Local" || tipoApuesta === "Victoria Visitante" || tipoApuesta === "Empate") {
          patronBusqueda = /resultado\s+del\s+partido/i;
        } else {
          patronBusqueda = /total\.?\s*1\.?ª?\s*mitad/i; // Predeterminado
        }
        
        const header = Array.from(
          document.querySelectorAll('.game-markets-group-header__name')
        ).find(h => patronBusqueda.test(h.textContent));
        
        return !!header;
      }, config.tipoApuesta);
      
      if (headerFoundAfterWait) {
        console.log("Encabezado correspondiente encontrado después de esperar");
      } else {
        console.log("No se encontró el encabezado correspondiente al tipo de apuesta");
        return { success: false, error: "No se encontró el encabezado correspondiente" };
      }
    }
    
    // 3. Buscar la opción específica dentro del grupo según el tipo de apuesta configurado
    console.log(`Buscando opción '${config.tipoApuesta}'...`);
    
    // Crear la expresión regular para buscar la opción según el tipo de apuesta
    let patronApuesta;
    if (config.tipoApuesta === "Más de 1") {
      patronApuesta = "más\\s+de\\s+1\\b";
    } else if (config.tipoApuesta === "Más de 1.5") {
      patronApuesta = "más\\s+de\\s+1\\.5\\b";
    } else if (config.tipoApuesta === "Más de 2") {
      patronApuesta = "más\\s+de\\s+2\\b";
    } else if (config.tipoApuesta === "Más de 2.5") {
      patronApuesta = "más\\s+de\\s+2\\.5\\b";
    } else if (config.tipoApuesta === "Menos de 1") {
      patronApuesta = "menos\\s+de\\s+1\\b";
    } else if (config.tipoApuesta === "Menos de 1.5") {
      patronApuesta = "menos\\s+de\\s+1\\.5\\b";
    } else if (config.tipoApuesta === "Menos de 2") {
      patronApuesta = "menos\\s+de\\s+2\\b";
    } else if (config.tipoApuesta === "Menos de 2.5") {
      patronApuesta = "menos\\s+de\\s+2\\.5\\b";
    } else if (config.tipoApuesta === "Ambos equipos marcarán") {
      patronApuesta = "sí";
    } else if (config.tipoApuesta === "Victoria Local") {
      patronApuesta = "1";
    } else if (config.tipoApuesta === "Empate") {
      patronApuesta = "X";
    } else if (config.tipoApuesta === "Victoria Visitante") {
      patronApuesta = "2";
    } else {
      patronApuesta = "más\\s+de\\s+1\\b"; // Predeterminado
    }
    
    // Ejecutar la búsqueda y clic de la opción siguiendo la lógica exacta del código original
    const opcionEncontrada = await page.evaluate(async (patronApuesta) => {
      // Implementación de la función waitFor del código original
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      
      const waitFor = async (fn, timeout = 500, step = 50) => {
        const t0 = performance.now();
        while (performance.now() - t0 < timeout) {
          const val = fn();
          if (val) return val;
          await sleep(step);
        }
        return null;
      };
      
      // Buscar el encabezado para obtener su grupo
      let patronBusquedaHeader;
      if (patronApuesta.includes("más") || patronApuesta.includes("menos")) {
        patronBusquedaHeader = /total\.?\s*1\.?ª?\s*mitad/i;
      } else if (patronApuesta === "sí") {
        patronBusquedaHeader = /ambos\s+equipos\s+marcarán/i;
      } else if (patronApuesta === "1" || patronApuesta === "X" || patronApuesta === "2") {
        patronBusquedaHeader = /resultado\s+del\s+partido/i;
      } else {
        patronBusquedaHeader = /total\.?\s*1\.?ª?\s*mitad/i; // Predeterminado
      }
      
      // Buscar el encabezado
      const headerTotalPrimera = Array.from(
        document.querySelectorAll('.game-markets-group-header__name')
      ).find(h => patronBusquedaHeader.test(h.textContent));
      
      if (!headerTotalPrimera) {
        console.warn('No se encontró el encabezado correspondiente.');
        return false;
      }
      
      // Obtener el grupo contenedor exactamente como en el código original
      const grupo = headerTotalPrimera.closest(
        '.game-markets-content__item, .game-markets-group, .ui-accordion'
      );
      
      if (!grupo) {
        console.warn('No se encontró el grupo contenedor.');
        return false;
      }
      
      // Primero verificar si ya existe el botón sin esperar
      const regexp = new RegExp(patronApuesta, 'i');
      let marketOption = Array.from(grupo.querySelectorAll('.ui-market__name'))
        .find(el => regexp.test(el.textContent));
        
      // Si se encontró inmediatamente, hacer clic
      if (marketOption) {
        console.log(`✔ Encontrado inmediatamente "${marketOption.textContent.trim()}"`);
        marketOption.click();
        console.log(`✔ Seleccionado "${marketOption.textContent.trim()}"`);
        return true;
      }
      
      // Si no se encontró inmediatamente, esperar un tiempo corto
      marketOption = await waitFor(() =>
        Array.from(grupo.querySelectorAll('.ui-market__name'))
          .find(el => regexp.test(el.textContent))
      , 500);
      
      if (!marketOption) {
        console.warn(`No se encontró la opción que coincida con el patrón: ${patronApuesta}`);
        return false;
      }
      
      // Hacer clic en la opción
      marketOption.click();
      console.log(`✔ Seleccionado "${marketOption.textContent.trim()}"`);
      
      return true;
    }, patronApuesta);
    
    if (!opcionEncontrada) {
      console.log(`No se encontró la opción '${config.tipoApuesta}'`);
      return { success: false, error: `No se encontró la opción '${config.tipoApuesta}'` };
    }
    
    console.log(`✅ Seleccionado '${config.tipoApuesta}'`);
    
    // Esperar un tiempo adicional para asegurar que la apuesta se registre
    await sleep(2000);
    
    return { success: true };
  } catch (error) {
    console.error("Error realizando apuesta:", error);
    return { success: false, error: error.message };
  }
}

// Función para cargar configuración
async function cargarConfiguracion() {
  try {
    const rutaArchivo = path.join(__dirname, 'config.json');
    
    if (!fs.existsSync(rutaArchivo)) {
      console.log('El archivo de configuración no existe todavía');
      return { success: true, config: null };
    }
    
    const contenido = fs.readFileSync(rutaArchivo, 'utf8');
    const config = JSON.parse(contenido);
    console.log('Configuración cargada');
    return { success: true, config };
  } catch (error) {
    console.error('Error al cargar configuración:', error);
    return { success: false, error: error.message };
  }
}

// Función para cargar partidos seleccionados
async function cargarPartidosSeleccionados() {
  try {
    const rutaArchivo = path.join(__dirname, 'partidos_seleccionados.json');
    
    if (!fs.existsSync(rutaArchivo)) {
      console.log('El archivo de partidos seleccionados no existe todavía');
      return { success: true, data: null };
    }
    
    const contenido = fs.readFileSync(rutaArchivo, 'utf8');
    const datos = JSON.parse(contenido);
    console.log(`Cargados ${datos.partidos.length} partidos seleccionados de ${rutaArchivo}`);
    return { success: true, data: datos };
  } catch (error) {
    console.error('Error al cargar partidos seleccionados:', error);
    return { success: false, error: error.message };
  }
}

// Verificar sesión
async function verificarSesion() {
  // Reiniciar el estado de sesión cada vez que se inicia la aplicación
  // Esto soluciona el problema de que la sesión se marque como iniciada cuando no lo está
  if (!sesionIniciada) {
    sesionVerificadaFlag = false;
  }
  
  // Si ya se verificó la sesión en esta ejecución, no volver a verificar innecesariamente
  if (sesionVerificadaFlag && sesionIniciada) {
    console.log('Sesión ya verificada previamente, omitiendo verificación');
    
    // Notificar al renderer sobre el estado de la sesión
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sesion-status', sesionIniciada);
    }
    
    return sesionIniciada;
  }
  
  let headlessBrowser = null;
  
  try {
    console.log('Verificando estado de sesión...');
    // Notificar al usuario que estamos verificando la sesión
    notifyBrowserStatusChanged(true, "Verificando sesión...");
    
    // Notificar que se está verificando la sesión para mostrar el loader
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('verificando-sesion', true);
    }
    
    // Lista personalizada de argumentos
    const headlessArgs = [
      '--disable-extensions',
      '--disable-component-extensions-with-background-pages',
      '--disable-default-apps',
      '--no-default-browser-check',
      '--no-first-run',
      '--disable-infobars',
      '--exclude-switches=enable-automation',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=RendererCodeIntegrity',
      '--enable-features=NetworkServiceInProcess2',
      '--password-store=basic'
    ];
    
    // Iniciar navegador headless independiente
    headlessBrowser = await chromium.launch({
      headless: true,
      args: headlessArgs,
      ignoreAllDefaultArgs: true,
      channel: 'chrome'
    });
    
    // Crear contexto y página para el navegador headless
    const headlessContext = await headlessBrowser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    
    // Inyectar script para ocultar signos de automatización
    await headlessContext.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      if (window.chrome) {
        window.chrome = new Proxy(window.chrome, {
          get: (target, name) => {
            if (name === 'app') return { isInstalled: false };
            if (name === 'runtime') return undefined;
            return target[name];
          }
        });
      }
    });
    
    const page = await headlessContext.newPage();
    console.log('Navegador headless iniciado para verificar sesión');
    
    // Usar la URL de partidos en lugar de la página de login
    const url = 'https://1xbet.mobi/es/line/football?platform_type=mobile';
    console.log('Navegando a página de partidos para verificar sesión...');
    await page.goto(url, {
      timeout: 90000
    });
      
    console.log('Página cargada, verificando estado de sesión...');
    await page.waitForTimeout(3000);
      
    // Intentar cerrar diálogos si existen
    try {
      const dialogSelectors = [
        'button:has-text("Aceptar")', 
        'button:has-text("Accept")',
        '.cookie-agreement__button',
        '[aria-label="Close"]',
        '.modal__close'
      ];
      
      for (const selector of dialogSelectors) {
        if (await page.locator(selector).count() > 0) {
          console.log(`Cerrando diálogo: ${selector}`);
          await page.locator(selector).first().click().catch(() => {});
          await page.waitForTimeout(1000);
        }
      }
    } catch (e) {
      // Ignorar errores de diálogos
      console.log('Error al cerrar diálogos:', e.message);
    }
    
    // Verificar si existe el botón de inicio de sesión
    const loginSelectors = [
      '.login-btn', 
      '.authorization-btn', 
      'button:has-text("Iniciar sesión")',
      'a:has-text("Iniciar sesión")',
      '.ui-caption--size-xs.ui-caption:has-text("Iniciar sesión")'
    ];
    
    // Verificar si hay elementos de inicio de sesión (PRESENTES = NO HAY SESIÓN)
    let loginElementFound = false;
    for (const selector of loginSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        console.log(`Elemento de login encontrado: "${selector}"`);
        loginElementFound = true;
        break;
      }
    }
    
    // Verificar si existe el ícono de usuario (icono de usuario PRESENTE = SESIÓN INICIADA)
    const userIconSelectors = [
      '.ico--user', 
      '.ico.user-control-panel-button__ico',
      '.user-control-panel-button'
    ];
    
    let userIconFound = false;
    for (const selector of userIconSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        console.log(`Ícono de usuario encontrado: "${selector}"`);
        userIconFound = true;
        break;
      }
    }
    
    // La sesión está iniciada si:
    // 1. NO se encuentra el botón de inicio de sesión, O
    // 2. SÍ se encuentra el ícono de usuario
    sesionIniciada = !loginElementFound || userIconFound;
    
    console.log(`Estado de sesión: ${sesionIniciada ? 'Iniciada' : 'No iniciada'} (loginElement: ${loginElementFound}, userIcon: ${userIconFound})`);
    
    // Notificar el estado de la sesión
    if (sesionIniciada) {
      notifyBrowserStatusChanged(true, "✅ Sesión iniciada");
    } else {
      notifyBrowserStatusChanged(true, "❌ Sesión no iniciada");
    }
    
    // Notificar al renderer sobre el estado de la sesión
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('sesion-status', sesionIniciada);
      mainWindow.webContents.send('verificando-sesion', false); // Desactivar loader
    }
    
    // Marcar que la sesión ha sido verificada
    sesionVerificadaFlag = true;
    
    return sesionIniciada;
  } catch (err) {
    console.error('Error al verificar sesión:', err);
    
    // Notificar error
    notifyBrowserStatusChanged(false, "Error al verificar sesión");
    
    // Desactivar loader
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('verificando-sesion', false);
      mainWindow.webContents.send('sesion-status', false);
    }
    
    return false;
  } finally {
    // Cerrar el navegador headless al terminar
    if (headlessBrowser) {
      try {
        await headlessBrowser.close();
        console.log('Navegador headless para verificación cerrado');
      } catch (e) {
        console.error('Error al cerrar navegador headless:', e.message);
      }
    }
  }
}

// IPC para controlar la verificación de sesión
ipcMain.handle('set-sesion-verificada', (event, value) => {
  sesionVerificadaFlag = value;
  return { success: true };
});

ipcMain.handle('get-sesion-verificada', () => {
  return { sesionVerificada: sesionVerificadaFlag };
});

// Verificar sesión por IPC
ipcMain.handle('verificar-sesion', async () => {
  return await verificarSesion();
});

// Configuración
ipcMain.handle('configuracion', async () => {
  try {
    notifyBrowserStatusChanged(true, "Abriendo configuración...");
    
    // Guardar el estado actual antes de cargar la nueva página
    const estadoActual = {
      sesionIniciada,
      lastStatusMessage,
      sesionVerificadaFlag
    };
    
    // Cargar el archivo HTML de configuración en la ventana principal
    await mainWindow.loadFile('configuracion.html');
    
    // Escuchar cuando la página de configuración se cierre para volver a la página principal
    ipcMain.once('configuracion-cerrada', () => {
      // Volver a cargar la página principal
      mainWindow.loadFile('index.html');
      
      // Restaurar el estado y notificar al renderer
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          sesionIniciada = estadoActual.sesionIniciada;
          lastStatusMessage = estadoActual.lastStatusMessage;
          sesionVerificadaFlag = estadoActual.sesionVerificadaFlag;
          
          // Notificar al renderer el estado restaurado
          mainWindow.webContents.send('restore-state', {
            sesionIniciada,
            lastStatusMessage,
            sesionVerificadaFlag
          });
          
          // Actualizar estado del navegador
          notifyBrowserStatusChanged(browserContext !== null, lastStatusMessage);
        }
      }, 500); // Pequeño retraso para asegurar que la página ha cargado
    });
    
    return { success: true, message: 'Página de configuración abierta' };
  } catch (error) {
    console.error('Error al abrir la configuración:', error);
    notifyBrowserStatusChanged(false, "Error al abrir la configuración");
    return { success: false, error: error.message };
  }
});

// Función para verificar si un archivo existe
ipcMain.handle('verificar-archivo', async (event, nombreArchivo) => {
  try {
    const rutaArchivo = path.join(__dirname, nombreArchivo);
    const existe = fs.existsSync(rutaArchivo);
    return { exists: existe };
  } catch (error) {
    console.error(`Error al verificar archivo ${nombreArchivo}:`, error);
    return { exists: false, error: error.message };
  }
});

// Función para abrir la página de selección de partidos
ipcMain.handle('abrir-seleccion-partidos', async () => {
  try {
    // Guardar el estado actual antes de cargar la nueva página
    const estadoActual = {
      sesionIniciada,
      lastStatusMessage,
      sesionVerificadaFlag
    };
    
    // Cargar el archivo HTML en la ventana principal
    await mainWindow.loadFile('seleccionarPartidos.html');
    
    // Escuchar cuando la página de selección se cierre para volver a la página principal
    ipcMain.once('seleccion-partidos-cerrada', () => {
      // Volver a cargar la página principal
      mainWindow.loadFile('index.html');
      
      // Restaurar el estado y notificar al renderer
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          sesionIniciada = estadoActual.sesionIniciada;
          lastStatusMessage = estadoActual.lastStatusMessage;
          sesionVerificadaFlag = estadoActual.sesionVerificadaFlag;
          
          // Notificar al renderer el estado restaurado
          mainWindow.webContents.send('restore-state', {
            sesionIniciada,
            lastStatusMessage,
            sesionVerificadaFlag
          });
          
          // Actualizar estado del navegador
          notifyBrowserStatusChanged(browserContext !== null, lastStatusMessage);
        }
      }, 500); // Pequeño retraso para asegurar que la página ha cargado
    });
    
    return { success: true, message: 'Página de selección de partidos abierta' };
  } catch (error) {
    console.error('Error al abrir la página de selección de partidos:', error);
    return { success: false, error: error.message };
  }
});

// Función para guardar partidos seleccionados en un archivo
ipcMain.handle('guardar-partidos-seleccionados', async (event, datos) => {
  try {
    const rutaArchivo = path.join(__dirname, 'partidos_seleccionados.json');
    fs.writeFileSync(rutaArchivo, JSON.stringify(datos, null, 2));
    console.log(`Guardados ${datos.partidos.length} partidos seleccionados en ${rutaArchivo}`);
    return { success: true };
  } catch (error) {
    console.error('Error al guardar partidos seleccionados:', error);
    return { success: false, error: error.message };
  }
});

// Función para guardar configuración
ipcMain.handle('guardar-configuracion', async (event, config) => {
  try {
    const rutaArchivo = path.join(__dirname, 'config.json');
    fs.writeFileSync(rutaArchivo, JSON.stringify(config, null, 2));
    console.log('Configuración guardada en', rutaArchivo);
    return { success: true };
  } catch (error) {
    console.error('Error al guardar configuración:', error);
    return { success: false, error: error.message };
  }
});

// IPC para cargar configuración
ipcMain.handle('cargar-configuracion', async () => {
  return await cargarConfiguracion();
});

// IPC para cargar partidos seleccionados
ipcMain.handle('cargar-partidos-seleccionados', async () => {
  return await cargarPartidosSeleccionados();
}); 