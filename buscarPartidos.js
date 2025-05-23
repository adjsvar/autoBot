const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('Iniciando script para buscar partidos...');
  let browser;
  
  try {
    // Usar exclusivamente Chrome (el instalado en el sistema)
    console.log('Lanzando navegador Chrome...');
    
    // Lista personalizada de argumentos
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
      '--user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"'  // User agent personalizado
    ];
    
    browser = await chromium.launch({
      headless: false,  // Mantener el modo normal para este script
      args: customArgs,
      ignoreAllDefaultArgs: true,  // Ignorar TODOS los argumentos por defecto y usar solo los nuestros
      channel: 'chrome',  // Usar Chrome instalado en el sistema
    });
    
    // Crear directorios para persistencia
    const userDataDir = path.join(__dirname, 'ChromeProfile');
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }
    
    // Crear/actualizar Preferences para Chrome
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
      
      // Modificar preferencias para ocultar mensaje de automatización
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
          ]
        },
        credentials_enable_service: false,
        credentials_enable_autosignin: false
      };
      
      // Guardar preferencias
      fs.writeFileSync(prefsPath, JSON.stringify(prefs));
      console.log('Preferencias de Chrome actualizadas para ocultar mensaje de automatización');
    } catch (e) {
      console.error('Error al configurar preferencias de Chrome:', e);
    }
    
    // Ocultar signos de automatización en cada página nueva
    await browser.newContext().then(async browserContext => {
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
      await browserContext.close();
    });
    
    // Verificar qué argumentos se están usando
    console.log('Argumentos del navegador:', browser.process().spawnargs.join(' '));
    
    const context = await browser.newContext({ 
      viewport: null 
    });
    const page = await context.newPage();
    
    // Navegar a 1xbet
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
      console.log('Error al interactuar con diálogos:', e.message);
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
        'visitantes',
        '7x7',
        '4x4',
        '3x3'
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
    });
    
    // Guardar resultados en un archivo
    console.log(`\nPartidos encontrados: ${resultado.length}`);
    console.dir(resultado, { depth: null });
    
    fs.writeFileSync('partidos.json', JSON.stringify(resultado, null, 2));
    console.log('Resultados guardados en partidos.json');
    
  } catch (err) {
    console.error('Error en la ejecución:', err);
  } finally {
    console.log('\nEsperando 10 segundos antes de cerrar...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    if (browser) {
      console.log('Cerrando navegador...');
      await browser.close();
    }
  }
})(); 