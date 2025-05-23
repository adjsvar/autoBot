// Acceso a Electron y Node.js
const { ipcRenderer } = require('electron');

// Referencias a elementos del DOM
const btnLogin = document.getElementById('btnLogin');
const btnSearch = document.getElementById('btnSearch');
const btnSelect = document.getElementById('btnSelect');
const btnAuto = document.getElementById('btnAuto');
const btnConfig = document.getElementById('btnConfig');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const loader = document.getElementById('loader');

// Controles de ventana personalizada
const minimizeBtn = document.getElementById('minimize-btn');
const maximizeBtn = document.getElementById('maximize-btn');
const closeBtn = document.getElementById('close-btn');

// Variables de estado
let browserInitialized = false;
let lastStatusMessage = ''; // Variable para almacenar el último mensaje de estado
let sesionIniciada = false; // Variable para controlar si la sesión está iniciada
let sesionVerificada = false; // Flag para controlar si ya se ha verificado la sesión

// Funciones de utilidad
function setLoading(isLoading) {
  const buttons = [btnLogin, btnSearch, btnSelect, btnAuto, btnConfig];
  
  if (isLoading) {
    buttons.forEach(btn => {
      btn.disabled = true;
      btn.style.opacity = '0.7';
    });
    loader.style.display = 'inline-block';
  } else {
    buttons.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '1';
    });
    loader.style.display = 'none';
  }
}

// Mostrar u ocultar un overlay de carga
function toggleFullScreenLoader(show) {
  let overlay = document.getElementById('full-screen-loader');
  
  if (!overlay && show) {
    // Crear el overlay si no existe y hay que mostrarlo
    overlay = document.createElement('div');
    overlay.id = 'full-screen-loader';
    overlay.innerHTML = `
      <div class="loader-content">
        <div class="loader-spinner"></div>
        <div class="loader-text">Verificando sesión...</div>
      </div>
    `;
    
    // Aplicar estilos
    const style = document.createElement('style');
    style.textContent = `
      #full-screen-loader {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: #1e293b;
        z-index: 1000;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      
      .loader-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        padding: 2rem;
        background-color: #0f172a;
        border-radius: 8px;
        border: 1px solid #334155;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
      }
      
      .loader-spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #334155;
        border-top: 4px solid #60a5fa;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
      
      .loader-text {
        color: #e2e8f0;
        font-size: 1.2rem;
        font-weight: bold;
      }
      
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(overlay);
  } else if (overlay && !show) {
    // Eliminar el overlay si existe y hay que ocultarlo
    overlay.remove();
  }
}

function updateBrowserStatus(isConnected, statusMessage) {
  browserInitialized = isConnected;
  
  // Actualizar el estado en la barra de estado
  if (isConnected) {
    statusDot.classList.add('connected');
    
    // Si hay un mensaje explícito, actualizarlo y guardarlo
    if (statusMessage) {
      lastStatusMessage = statusMessage;
      statusText.textContent = statusMessage;
    } 
    // Si no hay mensaje, usar el último mensaje personalizado o el por defecto
    else if (lastStatusMessage) {
      statusText.textContent = lastStatusMessage;
    } else {
      statusText.textContent = 'Navegador conectado';
    }
    
    btnSearch.classList.add('active');
  } else {
    statusDot.classList.remove('connected');
    
    if (statusMessage) {
      lastStatusMessage = statusMessage;
      statusText.textContent = statusMessage;
    } else if (lastStatusMessage && !lastStatusMessage.includes('Navegador')) {
      statusText.textContent = lastStatusMessage;
    } else {
      statusText.textContent = 'Navegador no iniciado';
    }
    
    btnSearch.classList.remove('active');
  }
  
  // Actualizar visibilidad del botón de inicio de sesión según el estado
  updateLoginButtonVisibility();
}

// Actualizar visibilidad del botón de inicio de sesión
function updateLoginButtonVisibility() {
  if (sesionIniciada) {
    btnLogin.style.display = 'none';
  } else {
    btnLogin.style.display = 'flex';
  }
}

// Verificar el estado actual del navegador
async function checkBrowserStatus() {
  try {
    const response = await ipcRenderer.invoke('check-browser-status');
    updateBrowserStatus(response.connected, response.message);
    return response.connected;
  } catch (error) {
    updateBrowserStatus(false, 'Error al conectar');
    return false;
  }
}

// Iniciar el navegador 
async function initBrowser() {
  try {
    setLoading(true);
    console.log('Iniciando navegador Chrome con persistencia...');
    const result = await ipcRenderer.invoke('init-browser');
    updateBrowserStatus(result);
    
    if (result) {
      console.log('Navegador iniciado correctamente');
    } else {
      // No mostrar mensaje de error, solo actualizar el estado
      updateBrowserStatus(false);
    }
    return result;
  } catch (error) {
    // No mostrar mensaje de error en consola
    updateBrowserStatus(false);
    return false;
  } finally {
    setLoading(false);
  }
}

// Manejadores de eventos para los botones de acción principal
btnLogin.addEventListener('click', async () => {
  try {
    setLoading(true);
    console.log('Iniciando proceso de login...');
    
    // El navegador se iniciará automáticamente en el proceso principal si es necesario
    const result = await ipcRenderer.invoke('iniciar-sesion');
    
    if (result.success) {
      if (result.alreadyLoggedIn) {
        console.log('La sesión ya estaba iniciada');
        updateBrowserStatus(true, "✅ Sesión ya iniciada");
        sesionIniciada = true;
        updateLoginButtonVisibility();
      } else {
        console.log('Página de login abierta correctamente');
        updateBrowserStatus(true, "Esperando inicio de sesión manual"); 
      }
    } else if (!result.silent) {
      // Solo mostrar error si no es un cierre silencioso (navegador cerrado manualmente)
      console.error(`Error al abrir página de login: ${result.error}`);
    } else {
      // Si el navegador se cerró manualmente, actualizamos el estado sin mostrar error
      updateBrowserStatus(false);
    }
  } catch (error) {
    // Verificar si el error es por cierre del navegador
    if (!esBrowserCerrado(error.message)) {
      console.error(`Error inesperado: ${error.message}`);
    }
    updateBrowserStatus(false);
  } finally {
    setLoading(false);
  }
});

btnSearch.addEventListener('click', async () => {
  try {
    setLoading(true);
    console.log('Iniciando búsqueda de partidos...');
    
    // El navegador se iniciará automáticamente en el proceso principal si es necesario
    const result = await ipcRenderer.invoke('buscar-partidos');
    
    if (result.success) {
      console.log(`Búsqueda finalizada. Se encontraron ${result.count} partidos.`);
      updateBrowserStatus(true); // Actualizar el estado del navegador ya que sabemos que está activo
    } else if (!result.silent) {
      // Solo mostrar error si no es un cierre silencioso (navegador cerrado manualmente)
      console.error(`Error al buscar partidos: ${result.error}`);
    } else {
      // Si el navegador se cerró manualmente, actualizamos el estado sin mostrar error
      updateBrowserStatus(false);
    }
  } catch (error) {
    // Verificar si el error es por cierre del navegador
    if (!esBrowserCerrado(error.message)) {
      console.error(`Error inesperado: ${error.message}`);
    }
    updateBrowserStatus(false);
  } finally {
    setLoading(false);
  }
});

btnSelect.addEventListener('click', async () => {
  try {
    setLoading(true);
    console.log('Iniciando selección de partidos...');
    
    // Verificar si existe el archivo partidos.json
    const result = await ipcRenderer.invoke('verificar-archivo', 'partidos.json');
    
    if (result.exists) {
      // Abrir el archivo HTML de selección de partidos
      const resultOpen = await ipcRenderer.invoke('abrir-seleccion-partidos');
      
      if (resultOpen.success) {
        console.log(resultOpen.message);
      } else {
        console.error(`Error: ${resultOpen.error}`);
      }
    } else {
      console.error('El archivo partidos.json no existe. Primero debes buscar partidos.');
      // Mostrar alerta al usuario
      alert('Primero debes buscar partidos para poder seleccionarlos.');
    }
  } catch (error) {
    console.error(`Error inesperado: ${error.message}`);
  } finally {
    setLoading(false);
  }
});

btnAuto.addEventListener('click', async () => {
  try {
    setLoading(true);
    console.log('Iniciando modo automático...');
    
    // El navegador se iniciará automáticamente en el proceso principal si es necesario
    const result = await ipcRenderer.invoke('modo-auto');
    
    if (result.success) {
      console.log(result.message);
      updateBrowserStatus(true); // Actualizar el estado del navegador ya que sabemos que está activo
    } else if (!result.silent) {
      console.error(`Error: ${result.error}`);
    } else {
      updateBrowserStatus(false);
    }
  } catch (error) {
    // Verificar si el error es por cierre del navegador
    if (!esBrowserCerrado(error.message)) {
      console.error(`Error inesperado: ${error.message}`);
    }
    updateBrowserStatus(false);
  } finally {
    setLoading(false);
  }
});

btnConfig.addEventListener('click', async () => {
  try {
    setLoading(true);
    console.log('Abriendo configuración...');
    
    const result = await ipcRenderer.invoke('configuracion');
    
    if (result.success) {
      console.log(result.message);
    } else if (!result.silent) {
      console.error(`Error: ${result.error}`);
    }
  } catch (error) {
    // Verificar si el error es por cierre del navegador
    if (!esBrowserCerrado(error.message)) {
      console.error(`Error inesperado: ${error.message}`);
    }
  } finally {
    setLoading(false);
  }
});

// Función auxiliar para detectar errores relacionados con el cierre del navegador
function esBrowserCerrado(errorMsg) {
  if (!errorMsg) return false;
  const errorText = errorMsg.toLowerCase();
  return (
    errorText.includes('closed') || 
    errorText.includes('detached') || 
    errorText.includes('target') || 
    errorText.includes('browser') ||
    errorText.includes('navegador')
  );
}

// Verificar sesión
async function verificarSesion() {
  // Si ya se verificó la sesión, no volver a verificar innecesariamente
  if (sesionVerificada && sesionIniciada) {
    console.log('Sesión ya verificada localmente, omitiendo verificación');
    updateLoginButtonVisibility();
    return sesionIniciada;
  }
  
  try {
    console.log('Verificando estado de sesión...');
    toggleFullScreenLoader(true);
    
    const resultado = await ipcRenderer.invoke('verificar-sesion');
    sesionIniciada = resultado;
    sesionVerificada = true; // Marcar que la sesión ha sido verificada
    
    // Actualizar flag en el proceso principal
    await ipcRenderer.invoke('set-sesion-verificada', true);
    
    console.log(`Sesión ${sesionIniciada ? 'iniciada' : 'no iniciada'}`);
    updateLoginButtonVisibility();
    
    // Actualizar el mensaje de estado según el resultado de la verificación
    if (sesionIniciada) {
      updateBrowserStatus(true, "✅ Sesión iniciada");
    } else {
      updateBrowserStatus(true, "❌ Sesión no iniciada");
    }
    
    return resultado;
  } catch (error) {
    console.error('Error al verificar sesión:', error);
    sesionIniciada = false;
    updateLoginButtonVisibility();
    updateBrowserStatus(true, "❌ Error al verificar sesión");
    return false;
  } finally {
    toggleFullScreenLoader(false);
  }
}

// Escuchar eventos de actualización de estado del navegador desde el proceso principal
ipcRenderer.on('browser-status-changed', (event, isConnected, statusMessage) => {
  console.log(`Estado del navegador actualizado: ${statusMessage || (isConnected ? 'Conectado' : 'Desconectado')}`);
  updateBrowserStatus(isConnected, statusMessage);
});

// Escuchar eventos de actualización de estado de sesión
ipcRenderer.on('sesion-status', (event, status) => {
  console.log(`Estado de sesión actualizado: ${status ? 'Iniciada' : 'No iniciada'}`);
  sesionIniciada = status;
  updateLoginButtonVisibility();
});

// Escuchar eventos de verificación de sesión
ipcRenderer.on('verificando-sesion', (event, isVerificando) => {
  toggleFullScreenLoader(isVerificando);
});

// Event listeners para los controles de ventana
minimizeBtn.addEventListener('click', () => {
  ipcRenderer.send('minimize-app');
});

maximizeBtn.addEventListener('click', () => {
  ipcRenderer.send('maximize-app');
});

closeBtn.addEventListener('click', () => {
  ipcRenderer.send('close-app');
});

// Escuchar eventos desde el main process (tray icon)
ipcRenderer.on('trigger-action', (event, action) => {
  console.log(`Acción iniciada desde tray: ${action}`);
  
  switch (action) {
    case 'buscar-partidos':
      btnSearch.click();
      break;
    case 'iniciar-sesion':
      btnLogin.click();
      break;
  }
});

// Escuchar eventos de restauración de estado
ipcRenderer.on('restore-state', (event, state) => {
  console.log('Restaurando estado:', state);
  
  // Restaurar variables de estado
  sesionIniciada = state.sesionIniciada;
  lastStatusMessage = state.lastStatusMessage;
  sesionVerificada = state.sesionVerificadaFlag;
  
  // Actualizar UI según el estado restaurado
  updateLoginButtonVisibility();
  statusText.textContent = lastStatusMessage;
  
  // Actualizar el punto de estado
  if (browserInitialized) {
    statusDot.classList.add('connected');
  } else {
    statusDot.classList.remove('connected');
  }
});

// Inicializar la aplicación
window.addEventListener('DOMContentLoaded', async () => {
  console.log('Aplicación iniciada');
  
  // Verificar si la sesión ya ha sido verificada anteriormente
  try {
    const result = await ipcRenderer.invoke('get-sesion-verificada');
    sesionVerificada = result.sesionVerificada;
    console.log(`Estado de verificación de sesión: ${sesionVerificada ? 'Verificada' : 'No verificada'}`);
  } catch (error) {
    console.error('Error al obtener estado de verificación:', error);
  }
  
  // Verificar estado inicial del navegador
  await checkBrowserStatus();
  
  // Verificar sesión solo si no ha sido verificada antes
  if (!sesionVerificada) {
    await verificarSesion();
  } else {
    console.log('Omitiendo verificación inicial de sesión (ya verificada)');
    // Solo actualizar la visibilidad del botón de login
    await ipcRenderer.invoke('verificar-sesion');
  }
  
  // Programar verificación periódica del estado del navegador (cada 5 segundos)
  // pero solo si no hay mensajes personalizados activos
  setInterval(async () => {
    // Solo verificar si el mensaje actual no es personalizado o es sobre el navegador
    if (!lastStatusMessage || lastStatusMessage.includes('Navegador')) {
      await checkBrowserStatus();
    }
  }, 5000);
}); 