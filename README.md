# AutoBot - Buscador de Partidos de Fútbol

Aplicación para automatizar la búsqueda y seguimiento de partidos de fútbol de 1xbet.

## Características

- **Interfaz gráfica** con Electron
- **Persistencia del navegador** para mantener sesiones
- **Búsqueda automatizada** de partidos de fútbol
- **Extracción de datos** de partidos (equipos, fechas, enlaces)
- **Filtrado inteligente** para evitar duplicados y contenido no deseado

## Requisitos

- Node.js (v16 o superior)
- Google Chrome instalado en el sistema

## Instalación

1. Clona el repositorio o descarga los archivos
2. Instala las dependencias:

```bash
npm install
```

## Uso

Para iniciar la aplicación:

```bash
npm start
```

La aplicación ofrece las siguientes funcionalidades:

- **Iniciar Sesión**: Permite iniciar sesión en 1xbet
- **Buscar Partidos**: Busca automáticamente partidos y guarda la información
- **Seleccionar Partidos**: Permite elegir partidos específicos (pendiente)
- **Modo Auto**: Modo automatizado para seguimiento (pendiente)
- **Configuración**: Ajustes de la aplicación (pendiente)

## Estructura del proyecto

- `main.js`: Archivo principal de Electron
- `index.html`: Interfaz de usuario
- `renderer.js`: Lógica del lado del cliente
- `buscarPartidos.js`: Script original para buscar partidos (ahora integrado en la app)

## Notas técnicas

- La aplicación usa Chrome con persistencia, lo que permite mantener sesiones entre ejecuciones
- Se integra la funcionalidad original de búsqueda de partidos en la aplicación Electron
- La estructura del código sigue un patrón de módulos para facilitar su mantenimiento

## Estructura del código

El script realiza las siguientes acciones:

1. Lanza un navegador maximizado en modo visible
2. Navega a la URL especificada
3. Extrae información de partidos filtrando elementos no deseados
4. Muestra los resultados en la consola

## Resultados

Los resultados se muestran en la consola con el siguiente formato:

```javascript
[
  {
    nombre: "Equipo1 vs Equipo2",
    link: "URL_al_partido",
    fecha: "2023-08-15T18:00:00.000Z",
    equipo1: "Equipo1",
    equipo2: "Equipo2"
  },
  // más partidos...
]
```

# AutoBot - Modo Automático

## Descripción
El modo automático permite automatizar la selección de apuestas en partidos de fútbol previamente seleccionados. La funcionalidad realiza las siguientes acciones:

1. Mezcla aleatoriamente los partidos seleccionados
2. Navega a cada partido según la configuración establecida
3. Realiza automáticamente la apuesta seleccionada

## Características principales

### Configuración
- **Repeticiones**: Número de veces que se repetirá cada operación
- **Monto de Apuesta**: Cantidad a apostar en cada partido
- **Cantidad de Partidos**: Número máximo de partidos a procesar
- **Tipo de Apuesta**: Selección del tipo de apuesta a realizar:
  - Más de 1/1.5/2/2.5 goles
  - Menos de 1/1.5/2/2.5 goles
  - Ambos equipos marcarán
  - Victoria Local/Visitante
  - Empate

### Proceso automático
1. Verifica que el usuario haya iniciado sesión
2. Carga los partidos seleccionados previamente
3. Mezcla aleatoriamente los partidos
4. Para cada partido:
   - Navega a la página del partido
   - Selecciona "1.ª mitad"
   - Busca la opción configurada (ej. "Más de 1")
   - Realiza la apuesta
5. Muestra estadísticas de partidos procesados exitosamente

## Requisitos
- Tener partidos seleccionados previamente
- Haber iniciado sesión en la plataforma
- Configurar los parámetros en la sección de configuración

## Uso
1. Buscar partidos (botón "Buscar Partidos")
2. Seleccionar partidos (botón "Seleccionar Partidos")
3. Configurar parámetros (botón "Configuración")
4. Iniciar sesión si es necesario (botón "Iniciar Sesión")
5. Iniciar el modo automático (botón "Modo Auto")

El proceso se ejecutará en una ventana de navegador visible, para permitir supervisar las acciones realizadas. 