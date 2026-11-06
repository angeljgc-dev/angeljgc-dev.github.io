// Núcleo del sitio: registro de estilos, cargador, selector y lo que es común a todos.
//
// El contenido vive una sola vez en index.html. Cada estilo es otra forma de presentarlo y vive
// en estilos/<id>/: estilo.css (todo bajo html[data-estilo="<id>"]) y estilo.js (un módulo con
// export default { id, nombre, montar(ctx) } que devuelve la función para desmontarlo).
// El selector ofrece los estilos marcados como disponibles en nucleo/registro.js, más el que
// esté activo (por ejemplo, uno forzado con ?estilo=<id> para probarlo).

// La lista vive en nucleo/registro.js, que la página carga antes que este módulo.
const REGISTRO = (window.RegistroEstilos && window.RegistroEstilos.length)
  ? window.RegistroEstilos
  : [{ id: 'cursores', nombre: 'Cursores', porDefecto: true, disponible: true }];
const POR_DEFECTO = REGISTRO.find((e) => e.porDefecto).id;
const raiz = document.documentElement;
const reducido = !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const buscar = (id) => REGISTRO.find((e) => e.id === id) || null;
const rutaHoja = (id) => new URL('../estilos/' + id + '/estilo.css', import.meta.url).href;
const rutaModulo = (id) => new URL('../estilos/' + id + '/estilo.js', import.meta.url).href;

function leer(almacen, clave) {
  try {
    return window[almacen].getItem(clave);
  } catch (e) {
    // Almacenamiento bloqueado (modo privado estricto): se sigue sin recordar nada.
    return null;
  }
}
function guardar(almacen, clave, valor) {
  try {
    window[almacen].setItem(clave, valor);
    return true;
  } catch (e) {
    // Sin almacenamiento la elección no se recuerda, pero el cambio de estilo funciona igual.
    return false;
  }
}

// ---------- eventos del núcleo para los estilos ----------
const oyentes = new Map();
function al(evento, f) {
  if (!oyentes.has(evento)) oyentes.set(evento, new Set());
  oyentes.get(evento).add(f);
  return () => oyentes.get(evento).delete(f);
}
function emitir(evento, dato) {
  (oyentes.get(evento) || []).forEach((f) => {
    try {
      f(dato);
    } catch (e) {
      // Un estilo con un error en su oyente no debe tumbar a los demás; queda en la consola.
      console.error(e);
    }
  });
}
// Avisos para los estilos: "cambia-seccion" con el id de la sección que está a la vista.
const secciones = [...document.querySelectorAll('[data-seccion]')];
let seccionActual = null;
if ('IntersectionObserver' in window) {
  const vigia = new IntersectionObserver((entradas) => {
    entradas.forEach((e) => {
      if (!e.isIntersecting) return;
      const id = e.target.dataset.seccion;
      if (id !== seccionActual) {
        seccionActual = id;
        emitir('cambia-seccion', id);
      }
    });
  }, { rootMargin: '-45% 0px -45% 0px' });
  secciones.forEach((s) => vigia.observe(s));
}

// ---------- hojas y módulos ----------
function hojaDe(id) { return document.querySelector('link[data-hoja="' + id + '"]'); }
function encenderHoja(id) {
  const existente = hojaDe(id);
  if (existente) {
    existente.disabled = false;
    // Si la hoja ya estaba cargada, sheet existe; si no, se espera su carga.
    if (existente.sheet) return Promise.resolve();
  }
  return new Promise((listo, fallo) => {
    const l = existente || document.createElement('link');
    // Los dos oyentes se quitan juntos al resolverse, sea carga o error: no se acumulan con
    // cada cambio de estilo.
    const soltar = () => {
      l.removeEventListener('load', alCargar);
      l.removeEventListener('error', alFallar);
    };
    const alCargar = () => { soltar(); listo(); };
    const alFallar = () => { soltar(); fallo(new Error('No cargó la hoja de ' + id)); };
    l.addEventListener('load', alCargar);
    l.addEventListener('error', alFallar);
    if (!existente) {
      l.rel = 'stylesheet';
      l.href = rutaHoja(id);
      l.dataset.hoja = id;
      document.head.appendChild(l);
    }
  });
}
function apagarHoja(id) {
  const h = hojaDe(id);
  if (h) h.disabled = true;
}
const modulos = new Map();
async function cargarModulo(id) {
  if (!modulos.has(id)) modulos.set(id, import(rutaModulo(id)).then((m) => m.default));
  try {
    return await modulos.get(id);
  } catch (e) {
    modulos.delete(id);
    throw e;
  }
}

// ---------- montar y desmontar ----------
let activo = buscar(raiz.dataset.estilo) ? raiz.dataset.estilo : POR_DEFECTO;
let desmontarActivo = null;

function marcarEntrada(entrada) {
  raiz.classList.remove('anima', 'entrada-completa', 'entrada-corta', 'entrada-cambio');
  if (!reducido) raiz.classList.add('anima', 'entrada-' + entrada);
}

// Red de seguridad: mientras un estilo se monta se anotan los nodos que agrega y los cambios de
// atributos de <html> y <body>. Si montar lanza antes de devolver su desmontar, esos nodos se
// quitan y los atributos vuelven a su valor. No es una foto del documento: es barata y no toca
// el contenido que ya estaba.
function vigilarMontaje() {
  const agregados = new Set();
  const atributos = new Map();
  const anotar = (registros) => {
    for (const r of registros) {
      if (r.type === 'childList') r.addedNodes.forEach((n) => agregados.add(n));
      else if (r.type === 'attributes') {
        if (!atributos.has(r.target)) atributos.set(r.target, new Map());
        const previos = atributos.get(r.target);
        if (!previos.has(r.attributeName)) previos.set(r.attributeName, r.oldValue);
      }
    }
  };
  const nodos = new MutationObserver(anotar);
  nodos.observe(document.documentElement, { childList: true, subtree: true });
  const marcas = new MutationObserver(anotar);
  marcas.observe(document.documentElement, { attributes: true, attributeOldValue: true });
  if (document.body) marcas.observe(document.body, { attributes: true, attributeOldValue: true });
  return {
    deshacer() {
      anotar(nodos.takeRecords());
      anotar(marcas.takeRecords());
      agregados.forEach((n) => { if (n.isConnected && n.parentNode) n.parentNode.removeChild(n); });
      atributos.forEach((previos, el) => previos.forEach((valor, nombre) => {
        if (valor === null) el.removeAttribute(nombre);
        else el.setAttribute(nombre, valor);
      }));
    },
    parar() {
      nodos.disconnect();
      marcas.disconnect();
    },
  };
}

// Con "completa", el estilo se monta como en su primera visita: el cambio en vivo deja ver la
// entrada entera de cada estilo, desde arriba de la página.
async function montar(id, completa) {
  const modulo = await cargarModulo(id);
  const primeraVez = completa || leer('sessionStorage', 'visto:' + id) !== '1';
  const ctx = {
    raiz: document,
    reducido,
    primeraVez,
    cambio: false,
    secciones,
    al,
  };
  const vigia = vigilarMontaje();
  let quitar;
  try {
    quitar = await modulo.montar(ctx);
  } catch (e) {
    vigia.deshacer();
    throw e;
  } finally {
    vigia.parar();
  }
  desmontarActivo = typeof quitar === 'function' ? quitar : null;
  guardar('sessionStorage', 'visto:' + id, '1');
  raiz.dataset.montado = 'si';
}

async function desmontar() {
  if (!desmontarActivo) return;
  const f = desmontarActivo;
  desmontarActivo = null;
  try {
    await f();
  } catch (e) {
    console.error(e);
  }
  raiz.classList.remove('anima', 'entrada-completa', 'entrada-corta', 'entrada-cambio');
}

// Al cambiar de estilo el visitante vuelve al principio de la página: cada estilo se ve desde su
// portada. Se sube antes de montar el nuevo, porque un scroll después saltaría su entrada. El
// #sección de la URL se quita para que ningún estilo abra otra sección por el enlace.
function irAlInicio() {
  if (window.location.hash) {
    const url = new URL(window.location.href);
    url.hash = '';
    window.history.replaceState(null, '', url);
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// Los cambios van en fila: cada uno espera a que termine el anterior y, si llegan varios
// mientras tanto (por ejemplo, flechas en el selector, que en Windows disparan "change" con cada
// tecla), solo se aplica el último. Así nunca hay dos estilos montados a la vez.
let fila = Promise.resolve();
let turnoVigente = 0;
function cambiar(pedido) {
  const id = String(pedido || '').toLowerCase();
  if (!buscar(id)) return Promise.reject(new Error('Estilo desconocido: ' + pedido));
  const turno = ++turnoVigente;
  const resultado = fila.then(() => (turno === turnoVigente ? aplicarCambio(id) : activo));
  fila = resultado.catch(() => null);
  return resultado;
}

async function aplicarCambio(id) {
  const anterior = activo;
  await desmontar();
  irAlInicio();
  try {
    await encenderHoja(id);
    if (id !== anterior) apagarHoja(anterior);
    raiz.dataset.estilo = id;
    activo = id;
    marcarEntrada('completa');
    await montar(id, true);
  } catch (e) {
    // Si el estilo nuevo falla, se vuelve al anterior sin dejar la página rota, y el que
    // falló deja de ofrecerse en el selector.
    console.error(e);
    await desmontar();
    if (id !== anterior) {
      apagarHoja(id);
      if (!(buscar(id) || {}).disponible) disponibles.delete(id);
    }
    await encenderHoja(anterior);
    raiz.dataset.estilo = anterior;
    activo = anterior;
    irAlInicio();
    marcarEntrada('completa');
    await montar(anterior, true);
    actualizarSelector();
    throw e;
  }
  guardar('localStorage', 'estilo', id);
  const url = new URL(window.location.href);
  url.searchParams.set('estilo', id);
  window.history.replaceState(null, '', url);
  actualizarSelector();
  emitir('cambia-estilo', id);
  return id;
}

// ---------- selector ----------
const disponibles = new Set(REGISTRO.filter((e) => e.disponible).map((e) => e.id).concat(activo));
let selector = null;
function actualizarSelector() {
  if (!selector) return;
  const lista = REGISTRO.filter((e) => disponibles.has(e.id));
  selector.replaceChildren(...lista.map((e) => {
    const o = document.createElement('option');
    o.value = e.id;
    o.textContent = e.nombre;
    o.selected = e.id === activo;
    return o;
  }));
}
function crearSelector() {
  const ranura = document.querySelector('[data-ranura="selector"]');
  if (!ranura) return;
  const caja = document.createElement('div');
  caja.className = 'selector-estilo';
  const etiqueta = document.createElement('label');
  etiqueta.className = 'solo-lector';
  etiqueta.htmlFor = 'selector-estilo';
  etiqueta.textContent = 'Estilo de la página';
  selector = document.createElement('select');
  selector.id = 'selector-estilo';
  selector.addEventListener('change', () => {
    const elegido = selector.value;
    cambiar(elegido).catch(() => actualizarSelector());
  });
  caja.append(etiqueta, selector);
  ranura.appendChild(caja);
  actualizarSelector();
  // Si la cabecera sale de la vista (en los estilos donde no es fija), el mismo selector se pasa
  // a una caja flotante chica en la esquina de abajo, y regresa a la cabecera cuando esta vuelve
  // a verse. Es un solo control: con teclado y lector de pantalla se usa igual.
  const flotante = document.createElement('div');
  flotante.className = 'selector-flotante';
  flotante.hidden = true;
  document.body.appendChild(flotante);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entradas) => {
      const visible = entradas[entradas.length - 1].isIntersecting;
      const destino = visible ? ranura : flotante;
      if (caja.parentNode !== destino) destino.appendChild(caja);
      flotante.hidden = visible;
    }).observe(ranura);
  }
}
// ---------- común a todos los estilos: video bajo demanda ----------
// Los proyectos con video muestran un póster; el archivo se pide solo al tocar "Ver video".
// Sin JavaScript el enlace abre el video directamente.
document.addEventListener('click', (e) => {
  const enlace = e.target.closest ? e.target.closest('a[data-video]') : null;
  if (!enlace) return;
  e.preventDefault();
  const marco = enlace.closest('.video-marco') || enlace.parentNode;
  const poster = marco.querySelector('img');
  const video = document.createElement('video');
  video.controls = true;
  video.playsInline = true;
  video.preload = 'auto';
  if (poster) video.poster = poster.currentSrc || poster.src;
  video.setAttribute('aria-label', enlace.textContent.trim());
  video.src = enlace.href;
  marco.replaceChildren(video);
  video.focus();
  // En un teléfono la tarjeta es chica: se abre a pantalla completa, dentro del mismo toque.
  if (window.matchMedia && window.matchMedia('(max-width: 767px)').matches) {
    if (video.requestFullscreen) video.requestFullscreen().catch(() => video.setAttribute('data-sin-pantalla-completa', 'si'));
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
  }
  const intento = video.play();
  if (intento && intento.catch) {
    intento.catch(() => {
      // Algunos navegadores solo dejan arrancar solo un video sin sonido; se intenta así y,
      // si tampoco, quedan los controles para que la persona le dé play.
      video.muted = true;
      return video.play().catch(() => video.setAttribute('data-espera-play', 'si'));
    });
  }
});

// ---------- arranque ----------
window.Estilos = {
  activo: () => activo,
  lista: () => REGISTRO.map((e) => ({ id: e.id, nombre: e.nombre, disponible: disponibles.has(e.id), activo: e.id === activo })),
  disponibles: () => [...disponibles],
  cambiar,
};

async function iniciar() {
  try {
    await montar(activo, false);
  } catch (e) {
    console.error(e);
    if (activo !== POR_DEFECTO) {
      // El estilo pedido no cargó: se vuelve al de base, que ya está enlazado en la página,
      // y el que falló no se ofrece en el selector si no estaba publicado.
      const fallido = activo;
      await desmontar();
      apagarHoja(fallido);
      if (!(buscar(fallido) || {}).disponible) disponibles.delete(fallido);
      await encenderHoja(POR_DEFECTO);
      activo = POR_DEFECTO;
      raiz.dataset.estilo = activo;
      disponibles.add(activo);
      marcarEntrada('corta');
      await montar(activo, false);
    } else {
      raiz.classList.remove('anima', 'entrada-completa', 'entrada-corta');
    }
  }
  crearSelector();
}
// El montaje inicial también va en la fila: un cambio pedido antes de que termine lo espera.
fila = iniciar().catch((e) => console.error(e));
