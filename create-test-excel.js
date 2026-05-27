const path = require('path');

// Test data
const data = [
  ['Nombre de la Web', 'Dirección URL', 'Notas'],
  ['Google', 'https://google.com', 'Debería estar activo'],
  ['GitHub', 'https://github.com', 'Debería estar activo'],
  ['Mock 200 OK', 'https://httpbin.org/status/200', 'Simula respuesta exitosa'],
  ['Mock 404 Error', 'https://httpbin.org/status/404', 'Simula error 404 (Inactivo)'],
  ['Mock 500 Error', 'https://httpbin.org/status/500', 'Simula error 500 (Inactivo)'],
  ['Servidor Caído / DNS', 'https://this-domain-does-not-exist-at-all-12345.com', 'Simula error de red/DNS (Inactivo)'],
  ['Solo dominio sin protocolo', 'wikipedia.org', 'Debería auto-completarse con https:// y funcionar'],
  ['Email de contacto', 'soporte@sesea.com', 'Debería ser omitido por el filtro de URLs'],
  ['Texto aleatorio', 'Solo un comentario sin link', 'Debería ser omitido por el filtro de URLs']
];

// Create sheet
const worksheet = xlsx.utils.aoa_to_sheet(data);
const workbook = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(workbook, worksheet, 'Monitoreo');

// Write file
const outputPath = path.join(__dirname, 'sitios-prueba.xlsx');
xlsx.writeFile(workbook, outputPath);

console.log(`¡Archivo Excel de prueba creado con éxito en: ${outputPath}!`);
console.log('Contiene una mezcla de URLs activas, inactivas y textos no válidos para validar los filtros.');
