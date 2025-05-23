const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('🔍 Iniciando script para buscar partidos (modo headless)...');
  let browser;
  
  try {
    console.log('🚀 Lanzando navegador Chrome en modo headless...');
    
    // Lista personalizada de argumentos
    const customArgs = [
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
      '--allow-pre-commit-input',
      '--password-store=basic',
      '--use-mock-keychain',
      '--force-webrtc-ip-handling-policy=default_public_interface_only'
    ];
    
    // En modo headless, configurar viewport para simular pantalla grande
    browser = await chromium.launch({
      headless: true,
      args: customArgs,
      ignoreAllDefaultArgs: true,
      channel: 'chrome'
    });
    
    console.log('✅ Navegador iniciado correctamente');
    console.log('📊 Argumentos del navegador:', browser.process().spawnargs.join(' '));
    
    const context = await browser.newContext({ 
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    
    // Registrar eventos de consola para depuración
    page.on('console', msg => {
      const type = msg.type();
      const prefix = {
        log: '📝',
        error: '❌',
        warning: '⚠️', 
        info: 'ℹ️'
      }[type] || '👉';
      
      console.log(`${prefix} Página (${type}):`, msg.text());
    });
    
    // Navegar a 1xbet
    console.log('🌍 Navegando a 1xbet...');
    await page.goto('https://1xbet.mobi/es/line/football?platform_type=mobile', {
      timeout: 90000
    });
    
    console.log('📄 Página cargada, esperando a que se estabilice...');
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
          console.log(`🔘 Cerrando diálogo: ${selector}`);
          await page.locator(selector).first().click().catch(() => {});
          await page.waitForTimeout(1000);
        }
      }
    } catch (e) {
      console.log('⚠️ Error al interactuar con diálogos:', e.message);
    }
    
    // Hacer captura de pantalla para verificar estado
    const screenshotPath = path.join(__dirname, 'screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Captura de pantalla guardada en: ${screenshotPath}`);
    
    // Ejecutar el script del usuario en el contexto del navegador
    console.log('⚙️ Ejecutando script para extraer partidos...');
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

               console.log('⚽️ Partido añadido:', partido.nombre, `(total: ${partidos.length})`);
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
    
    // Guardar resultados en archivos
    console.log(`\n🏆 Partidos encontrados: ${resultado.length}`);
    
    // Guardar JSON completo
    const jsonPath = path.join(__dirname, 'partidos.json');
    fs.writeFileSync(jsonPath, JSON.stringify(resultado, null, 2));
    console.log(`💾 Resultados guardados en: ${jsonPath}`);
    
    // Guardar también un CSV para fácil visualización
    const csvPath = path.join(__dirname, 'partidos.csv');
    const csvHeader = 'Nombre,Equipo 1,Equipo 2,Fecha,Link\n';
    const csvRows = resultado.map(p => 
      `"${p.nombre}","${p.equipo1}","${p.equipo2}","${p.fecha}","${p.link}"`
    );
    fs.writeFileSync(csvPath, csvHeader + csvRows.join('\n'));
    console.log(`💾 CSV guardado en: ${csvPath}`);
    
    // Mostrar algunos ejemplos de partidos encontrados
    console.log('\n📊 Ejemplos de partidos encontrados:');
    for (let i = 0; i < Math.min(5, resultado.length); i++) {
      const p = resultado[i];
      console.log(`   ${i+1}. ${p.equipo1} vs ${p.equipo2} (${new Date(p.fecha).toLocaleString()})`);
    }
    
  } catch (err) {
    console.error('❌ Error en la ejecución:', err);
  } finally {
    console.log('\n⏱️ Finalizando...');
    
    if (browser) {
      console.log('🔒 Cerrando navegador...');
      await browser.close();
    }
    
    console.log('✅ Proceso completado');
  }
})(); 