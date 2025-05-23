// Importar los módulos necesarios
const { ipcRenderer } = require('electron');

// Referencias a elementos del DOM - Menú lateral
const btnHome = document.getElementById('btnHome');
const btnLogin = document.getElementById('btnLogin');
const btnSearch = document.getElementById('btnSearch');
const btnSelect = document.getElementById('btnSelect');
const btnAuto = document.getElementById('btnAuto');
const btnConfig = document.getElementById('btnConfig');

// Referencias a elementos del DOM - Barra de estado
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const loader = document.getElementById('loader');

// Referencias a elementos del DOM - Vistas
const homeView = document.getElementById('homeView');
const selectView = document.getElementById('selectView');

// Referencias a elementos del DOM - Vista de selección de partidos
const searchPartidos = document.getElementById('searchPartidos');
const partidosContainer = document.getElementById('partidosContainer');
const totalPartidos = document.getElementById('totalPartidos');
const seleccionados = document.getElementById('seleccionados');
const statusMessage = document.getElementById('statusMessage');
const btnGuardar = document.getElementById('btnGuardar');

// Botones del menú lateral
const menuButtons = [btnHome, btnLogin, btnSearch, btnSelect, btnAuto, btnConfig];

// Vistas disponibles
const views = {
  home: homeView,
  select: selectView
};

// Variables de estado
let browserInitialized = false;
let lastStatusMessage = '';
let partidos = [];
let partidosSeleccionados = new Set();
let partidosCacheado = [];
let guardadoAutomatico = true;
let busquedaTimeout = null;

// Función para cambiar de vista
function cambiarVista(nombreVista) {
  // Ocultar todas las vistas
  Object.values(views).forEach(view => {
    view.classList.remove('active');
  });
  
  // Mostrar la vista seleccionada
  if (views[nombreVista]) {
    views[nombreVista].classList.add('active');
  }
  
  // Actualizar botón activo
  menuButtons.forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Activar la funcionalidad específica de cada vista
  if (nombreVista === 'select') {
    btnSelect.classList.add('active');
    cargarPartidos();
  } else if (nombreVista === 'home') {
    btnHome.classList.add('active');
  }
}

// Exponer globalmente la función para que renderer.js pueda acceder a ella
window.cambiarVista = cambiarVista;

// Función para mostrar el estado de carga
function setLoading(isLoading) {
  if (isLoading) {
    menuButtons.forEach(btn => {
      btn.disabled = true;
      btn.style.opacity = '0.7';
    });
    loader.style.display = 'inline-block';
  } else {
    menuButtons.forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '1';
    });
    loader.style.display = 'none';
  }
}

// Función para actualizar el estado del navegador
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
}

// Mostrar mensaje de estado temporal
function mostrarMensajeEstado(mensaje) {
  statusMessage.textContent = mensaje;
  statusMessage.classList.add('visible');
  
  setTimeout(() => {
    statusMessage.classList.remove('visible');
  }, 2000);
}

// Formateador de fechas
function formatearFecha(fechaISO) {
  const fecha = new Date(fechaISO);
  return fecha.toLocaleString('es-ES', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit', 
    minute: '2-digit'
  });
}

// Guardar partidos seleccionados en archivo
async function guardarPartidosSeleccionados() {
  // Crear lista de partidos seleccionados
  const partidosGuardar = partidos.filter(partido => 
    partidosSeleccionados.has(partido.link)
  );
  
  // Crear un objeto con la selección y la fecha
  const seleccion = {
    fecha: new Date().toISOString(),
    partidos: partidosGuardar
  };
  
  try {
    // Enviar al proceso principal para guardar en archivo
    const resultado = await ipcRenderer.invoke('guardar-partidos-seleccionados', seleccion);
    if (resultado.success) {
      mostrarMensajeEstado(`Guardados ${partidosGuardar.length} partidos`);
      return true;
    } else {
      console.error('Error al guardar partidos:', resultado.error);
      return false;
    }
  } catch (error) {
    console.error('Error al guardar partidos seleccionados:', error);
    return false;
  }
}

// Alternar selección de un partido
async function toggleSeleccion(id, elemento) {
  if (partidosSeleccionados.has(id)) {
    partidosSeleccionados.delete(id);
    elemento.classList.remove('selected');
  } else {
    partidosSeleccionados.add(id);
    elemento.classList.add('selected');
  }
  
  // Actualizar contador de seleccionados
  seleccionados.textContent = partidosSeleccionados.size;
  btnGuardar.disabled = partidosSeleccionados.size === 0;
  
  // Guardar automáticamente
  if (guardadoAutomatico) {
    await guardarPartidosSeleccionados();
  }
}

// Filtrar partidos según el texto de búsqueda (optimizado)
function filtrarPartidos(texto) {
  const textoBusqueda = texto.toLowerCase().trim();
  
  if (!textoBusqueda) {
    return partidos;
  }
  
  // Si la consulta comienza con la anterior, filtrar sobre el resultado cacheado
  if (partidosCacheado.length > 0 && textoBusqueda.startsWith(searchPartidos.dataset.lastQuery || '')) {
    return partidosCacheado.filter(partido => {
      const nombre = partido.nombre.toLowerCase();
      const equipo1 = partido.equipo1.toLowerCase();
      const equipo2 = partido.equipo2.toLowerCase();
      
      return nombre.includes(textoBusqueda) || 
             equipo1.includes(textoBusqueda) || 
             equipo2.includes(textoBusqueda);
    });
  } else {
    // Si no, filtrar sobre todos los partidos
    return partidos.filter(partido => {
      const nombre = partido.nombre.toLowerCase();
      const equipo1 = partido.equipo1.toLowerCase();
      const equipo2 = partido.equipo2.toLowerCase();
      const fecha = formatearFecha(partido.fecha).toLowerCase();
      
      return nombre.includes(textoBusqueda) || 
             equipo1.includes(textoBusqueda) || 
             equipo2.includes(textoBusqueda) || 
             fecha.includes(textoBusqueda);
    });
  }
}

// Renderizar todos los partidos
function renderizarPartidos(partidosFiltrados) {
  partidosContainer.innerHTML = '';
  
  if (partidosFiltrados.length === 0) {
    partidosContainer.innerHTML = '<div class="no-results">No se encontraron partidos</div>';
    return;
  }
  
  // Usar fragment para mejorar rendimiento
  const fragment = document.createDocumentFragment();
  
  partidosFiltrados.forEach(partido => {
    const partidoEl = document.createElement('div');
    partidoEl.className = `partido-card ${partidosSeleccionados.has(partido.link) ? 'selected' : ''}`;
    partidoEl.dataset.id = partido.link;
    
    partidoEl.innerHTML = `
      <div class="partido-titulo">${partido.nombre}</div>
      <div class="partido-fecha">${formatearFecha(partido.fecha)}</div>
      <div class="equipos">
        <div class="equipo">${partido.equipo1}</div>
        <div class="equipo">${partido.equipo2}</div>
      </div>
    `;
    
    partidoEl.addEventListener('click', () => {
      toggleSeleccion(partido.link, partidoEl);
    });
    
    fragment.appendChild(partidoEl);
  });
  
  partidosContainer.appendChild(fragment);
  
  // Actualizar contadores
  totalPartidos.textContent = partidosFiltrados.length;
}

// Cargar datos desde el archivo JSON
async function cargarPartidos() {
  try {
    // Primero verificar si existe el archivo partidos.json
    const resultado = await ipcRenderer.invoke('verificar-archivo', 'partidos.json');
    
    if (!resultado.exists) {
      partidosContainer.innerHTML = `
        <div class="no-results">
          No se encontró el archivo de partidos. 
          Primero debes buscar partidos usando el botón "Buscar Partidos".
        </div>
      `;
      return;
    }
    
    // Si el archivo existe, cargarlo
    partidosContainer.innerHTML = '<div class="no-results">Cargando partidos...</div>';
    
    // Usar ruta absoluta para acceder al archivo de partidos
    const datosPartidos = await ipcRenderer.invoke('obtener-partidos');
    
    if (!datosPartidos.success) {
      throw new Error(datosPartidos.error || 'No se pudo cargar el archivo de partidos');
    }
    
    partidos = datosPartidos.data;
    
    // Ordenar partidos por fecha (más cercanos primero)
    partidos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    
    totalPartidos.textContent = partidos.length;
    
    // Cargar partidos seleccionados desde el archivo
    try {
      const partidosSeleccionadosData = await ipcRenderer.invoke('cargar-partidos-seleccionados');
      if (partidosSeleccionadosData.success && partidosSeleccionadosData.data) {
        const { partidos: partidosPrevios } = partidosSeleccionadosData.data;
        
        // Limpiar selección previa
        partidosSeleccionados.clear();
        
        // Añadir partidos a la selección
        partidosPrevios.forEach(partido => {
          partidosSeleccionados.add(partido.link);
        });
        
        seleccionados.textContent = partidosSeleccionados.size;
        btnGuardar.disabled = partidosSeleccionados.size === 0;
        
        mostrarMensajeEstado(`Cargados ${partidosSeleccionados.size} partidos seleccionados`);
      }
    } catch (e) {
      console.error('Error al cargar partidos seleccionados:', e);
    }
    
    renderizarPartidos(partidos);
  } catch (error) {
    console.error('Error al cargar los datos:', error);
    partidosContainer.innerHTML = `
      <div class="no-results">
        Error al cargar los partidos: ${error.message}
      </div>
    `;
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

// Manejadores de eventos
btnHome.addEventListener('click', () => cambiarVista('home'));
btnSelect.addEventListener('click', () => cambiarVista('select'));

btnLogin.addEventListener('click', async () => {
  try {
    setLoading(true);
    console.log('Iniciando proceso de login...');
    
    // El navegador se iniciará automáticamente en el proceso principal si es necesario
    const result = await ipcRenderer.invoke('iniciar-sesion', {
      url: 'https://1xbet.mobi/es/',
      username: '',  // Estos valores se configurarían en la sección de configuración
      password: ''
    });
    
    if (result.success) {
      console.log('Sesión iniciada correctamente');
      updateBrowserStatus(true); // Actualizar el estado del navegador ya que sabemos que está activo
    } else if (!result.silent) {
      // Solo mostrar error si no es un cierre silencioso (navegador cerrado manualmente)
      console.error(`Error al iniciar sesión: ${result.error}`);
    } else {
      // Si el navegador se cerró manualmente, actualizamos el estado sin mostrar error
      updateBrowserStatus(false);
    }
  } catch (error) {
    console.error(`Error inesperado: ${error.message}`);
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
      
      // Si la búsqueda fue exitosa, cambiar a la vista de selección de partidos
      cambiarVista('select');
    } else if (!result.silent) {
      // Solo mostrar error si no es un cierre silencioso (navegador cerrado manualmente)
      console.error(`Error al buscar partidos: ${result.error}`);
    } else {
      // Si el navegador se cerró manualmente, actualizamos el estado sin mostrar error
      updateBrowserStatus(false);
    }
  } catch (error) {
    console.error(`Error inesperado: ${error.message}`);
    updateBrowserStatus(false);
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
    console.error(`Error inesperado: ${error.message}`);
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
    console.error(`Error inesperado: ${error.message}`);
  } finally {
    setLoading(false);
  }
});

// Optimizar búsqueda con debounce para mejorar rendimiento
searchPartidos.addEventListener('input', () => {
  const texto = searchPartidos.value;
  
  // Guardar la consulta actual para optimización
  searchPartidos.dataset.lastQuery = texto.toLowerCase().trim();
  
  // Cancelar cualquier búsqueda pendiente
  if (busquedaTimeout) {
    clearTimeout(busquedaTimeout);
  }
  
  // Programar nueva búsqueda con retraso
  busquedaTimeout = setTimeout(() => {
    const partidosFiltrados = filtrarPartidos(texto);
    // Guardar los resultados en caché para búsquedas posteriores
    partidosCacheado = partidosFiltrados;
    renderizarPartidos(partidosFiltrados);
  }, 300); // 300ms de retraso para mejorar rendimiento
});

// Guardar selección (botón)
btnGuardar.addEventListener('click', async () => {
  if (await guardarPartidosSeleccionados()) {
    alert(`Se han guardado ${partidosSeleccionados.size} partidos seleccionados.`);
  } else {
    alert('Error al guardar la selección. Consulta la consola para más detalles.');
  }
});

// Controles de ventana personalizada
document.getElementById('minimize-btn').addEventListener('click', () => {
  ipcRenderer.send('minimize-app');
});

document.getElementById('maximize-btn').addEventListener('click', () => {
  ipcRenderer.send('maximize-app');
});

document.getElementById('close-btn').addEventListener('click', () => {
  ipcRenderer.send('close-app');
});

// Inicializar la aplicación
window.addEventListener('DOMContentLoaded', async () => {
  console.log('Aplicación iniciada - screens/main.js');
  
  // Reconectar eventos de botones para asegurar funcionalidad
  btnHome.addEventListener('click', () => cambiarVista('home'));
  btnSelect.addEventListener('click', () => cambiarVista('select'));
  
  // Verificar estado inicial del navegador
  await checkBrowserStatus();
  
  // Programar verificación periódica del estado del navegador (cada 5 segundos)
  setInterval(async () => {
    // Solo verificar si el mensaje actual no es personalizado o es sobre el navegador
    if (!lastStatusMessage || lastStatusMessage.includes('Navegador')) {
      await checkBrowserStatus();
    }
  }, 5000);
}); 