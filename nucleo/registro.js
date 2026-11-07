// Registro de estilos del sitio. Es la única lista: la leen el arranque de la página (antes del
// primer pintado) y el núcleo (nucleo/nucleo.js).
//
// Cada estilo vive en estilos/<id>/ con estilo.css y estilo.js. Para publicarlo en el selector
// se cambia su "disponible" a true. Con ?estilo=<id> en la URL se carga cualquiera de esta
// lista aunque todavía no esté disponible: sirve para probarlo antes de publicarlo.
window.RegistroEstilos = [
  { id: 'cursores', nombre: 'Cursores', porDefecto: true, disponible: true },
  { id: 'gafete', nombre: 'Gafete', disponible: true },
  { id: 'escenario', nombre: 'Escenario', disponible: true },
  { id: 'teclado', nombre: 'Teclado', disponible: true },
  { id: 'pausa', nombre: 'Pausa', disponible: true },
  { id: 'collage', nombre: 'Collage', disponible: true },
  { id: 'descenso', nombre: 'Descenso', disponible: true },
];
