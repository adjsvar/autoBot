const fs = require('fs');
const { createCanvas } = require('canvas');

// Crear un canvas de 32x32 para el icono
const canvas = createCanvas(32, 32);
const ctx = canvas.getContext('2d');

// Fondo
ctx.fillStyle = '#0f172a'; // Color de fondo oscuro
ctx.fillRect(0, 0, 32, 32);

// Dibujar una pelota de fútbol (círculo con pentágonos)
ctx.fillStyle = '#ffffff'; // Color blanco para la pelota
ctx.beginPath();
ctx.arc(16, 16, 12, 0, Math.PI * 2);
ctx.fill();

// Detalles de la pelota (hexágonos)
ctx.fillStyle = '#000000';
// Dibujar un patrón simplificado de pentágonos de una pelota de fútbol
ctx.beginPath();
ctx.moveTo(16, 8);
ctx.lineTo(21, 12);
ctx.lineTo(19, 18);
ctx.lineTo(13, 18);
ctx.lineTo(11, 12);
ctx.closePath();
ctx.fill();

// Borde
ctx.strokeStyle = '#3b82f6'; // Borde azul
ctx.lineWidth = 2;
ctx.beginPath();
ctx.arc(16, 16, 14, 0, Math.PI * 2);
ctx.stroke();

// Guardar como PNG
const buffer = canvas.toBuffer('image/png');
fs.writeFileSync('assets/icon.png', buffer);

console.log('Icono deportivo generado en assets/icon.png'); 