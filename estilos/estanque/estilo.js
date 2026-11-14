// Estilo "estanque". Detrás del contenido hay un estanque pastel en 3D, en vivo: cielo durazno y
// lila, dunas lavanda, pasto rosa, agua espejo, burbujas de vidrio y un koi que nada. Al bajar, la
// cámara recorre el estanque con el desplazamiento: cada sección tiene su vista y quien vive ahí
// (nenúfares y libélulas, un cardumen en la poza somera, lotos, juncos, luciérnagas al anochecer).
// Subir el scroll la regresa por el mismo camino. El koi se zambulle al dejar la portada y vuelve
// en contacto.
//
// La escena es un módulo aparte (recursos/escena.min.js, con su modelo recursos/koi.glb) que se
// pide después de que la página terminó de cargar, y solo si hay una GPU que la sostenga. Sin ella,
// o con movimiento reducido, queda el fondo pastel de la hoja, fijo, y no se descarga nada más.
// El contenido no se toca: lo agregado lleva data-estanque y aria-hidden.

const RECURSOS = new URL('./recursos/', import.meta.url);
// La rana de investigación vive en recursos/rana.glb. Si se quita el archivo, esto va en false y la
// hoja se queda con los lotos (así no se pide un archivo que no existe).
const HAY_RANA = true;
// El orden de las vistas de la escena.
const ORDEN = ['presentacion', 'proyectos', 'experiencia', 'investigacion', 'habilidades', 'contacto'];

const acotar = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Una prueba barata antes de pedir megas: WebGL 2 sin el aviso de "rendimiento muy bajo" (el
// navegador lo da cuando dibujaría por software). El contexto de prueba se suelta enseguida.
function hayGpu(doc) {
  const c = doc.createElement('canvas');
  let gl = null;
  try {
    gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true });
  } catch (e) {
    // Algunos navegadores lanzan en lugar de devolver null: es la misma respuesta.
    return false;
  }
  if (!gl) return false;
  const perder = gl.getExtension('WEBGL_lose_context');
  if (perder) perder.loseContext();
  c.width = 0;
  c.height = 0;
  return true;
}

// La zona de la primera pantalla que no tapa la página: donde la escena encuadra al koi. Se mide
// con la página arriba (los paneles de la portada en su lugar) y en pixeles CSS de la ventana.
// Se prueban dos huecos, a la derecha del panel de presentación y encima de él, y gana el mayor.
const HOLGURA = 12;
export function zonaLibre(doc = document) {
  const v = doc.defaultView || window;
  const ancho = doc.documentElement.clientWidth;
  const alto = v.innerHeight;
  const caja = (el, fija) => {
    const r = el.getBoundingClientRect();
    const dy = fija ? 0 : v.scrollY;
    return { x0: r.left, y0: r.top + dy, x1: r.right, y1: r.bottom + dy };
  };
  const cabecera = doc.querySelector('.cabecera .envoltura');
  const panel = doc.querySelector('[data-seccion="presentacion"] .inicio-reja');
  if (!panel) return null;
  const p = caja(panel, false);
  const techo = cabecera ? caja(cabecera, true).y1 + HOLGURA : 0;
  // Las piezas de datos que quedan dentro de la primera pantalla y fuera del panel bajan el piso.
  let piso = alto;
  for (const d of doc.querySelectorAll('[data-seccion="presentacion"] .dato')) {
    const c = caja(d, false);
    const dentroDelPanel = c.x0 >= p.x0 && c.x1 <= p.x1 && c.y0 >= p.y0 && c.y1 <= p.y1;
    if (!dentroDelPanel && c.y0 < alto) piso = Math.min(piso, c.y0 - HOLGURA);
  }
  const derecha = { x0: Math.min(ancho, p.x1 + HOLGURA), y0: techo, x1: ancho, y1: Math.min(piso, alto) };
  const encima = { x0: 0, y0: techo, x1: ancho, y1: Math.min(piso, p.y0 - HOLGURA) };
  const area = (z) => Math.max(0, z.x1 - z.x0) * Math.max(0, z.y1 - z.y0);
  const mejor = area(derecha) >= area(encima) ? derecha : encima;
  if (mejor.x1 - mejor.x0 < 120 || mejor.y1 - mejor.y0 < 120) return null;
  return {
    x0: Math.round(mejor.x0), y0: Math.round(mejor.y0), x1: Math.round(mejor.x1), y1: Math.round(mejor.y1),
  };
}

// La zona libre del resto de las secciones: en escritorio, la franja a la derecha de la columna de
// contenido. En pantallas angostas el contenido va de orilla a orilla y la escena se asoma en los
// respiros entre paneles: lo que vive en cada sección se encuadra en la mitad de arriba, que es por
// donde pasan esos respiros al bajar.
export function zonaSecciones(doc = document) {
  const v = doc.defaultView || window;
  if (doc.documentElement.clientWidth < 1024) {
    const cabecera = doc.querySelector('.cabecera .envoltura');
    const y0 = cabecera ? Math.round(cabecera.getBoundingClientRect().bottom + HOLGURA) : 0;
    return { x0: 0, y0, x1: doc.documentElement.clientWidth, y1: Math.round(v.innerHeight * 0.52) };
  }
  const columna = doc.querySelector('[data-seccion="proyectos"] > .envoltura');
  const cabecera = doc.querySelector('.cabecera .envoltura');
  if (!columna) return null;
  const x0 = Math.round(columna.getBoundingClientRect().right + HOLGURA);
  const y0 = cabecera ? Math.round(cabecera.getBoundingClientRect().bottom + HOLGURA) : 0;
  if (doc.documentElement.clientWidth - x0 < 160) return null;
  return { x0, y0, x1: doc.documentElement.clientWidth, y1: v.innerHeight };
}

// Qué tanto de su zona ocupa el recorrido del koi en la portada. En teléfono puede rozar las orillas
// para verse grande; en escritorio se busca que mida un 30 % del ancho, con la misma cuenta de la
// cámara que trae el módulo de la escena.
export function margenPortada(doc, modulo, zona) {
  const v = doc.defaultView || window;
  if (doc.documentElement.clientWidth < 1024 || !zona) return doc.documentElement.clientWidth < 768 ? modulo.MARGEN_ANGOSTO : modulo.MARGEN_ESCRITORIO;
  const ancho = doc.documentElement.clientWidth;
  const alto = v.innerHeight;
  const largo = Math.max(...modulo.largosPez(ancho, alto, modulo.encuadrePara(ancho, alto, zona, 1), 36)) / ancho;
  return Math.min(1.5, Math.max(0.8, 0.3 / largo));
}

// Zonas propias de algunas secciones en pantallas angostas: en investigación la tesis va en una
// columna a la izquierda y la rana vive en la franja de la derecha, siempre a la vista; en contacto
// el koi nada a lo alto de toda la pantalla y las tarjetas dejan respiros amplios entre ellas.
export function zonasPorSeccion(doc = document) {
  const v = doc.defaultView || window;
  const ancho = doc.documentElement.clientWidth;
  if (ancho >= 768) return undefined;
  const cabecera = doc.querySelector('.cabecera .envoltura');
  const y0 = cabecera ? Math.round(cabecera.getBoundingClientRect().bottom + HOLGURA) : 0;
  const alto = v.innerHeight;
  return {
    3: { x0: Math.round(ancho * 0.64), y0: Math.round(alto * 0.45), x1: ancho, y1: Math.round(alto * 0.95) },
    5: { x0: 0, y0, x1: ancho, y1: Math.round(alto * 0.6) },
  };
}

// Todas las zonas libres que la escena necesita, una por sección.
export function zonasDe(doc = document, modulo = null) {
  const portada = zonaLibre(doc);
  return {
    portada,
    secciones: zonaSecciones(doc),
    porSeccion: zonasPorSeccion(doc),
    margenPortada: modulo ? margenPortada(doc, modulo, portada) : undefined,
  };
}

// Dónde empieza cada sección, en el orden de las vistas de la escena (en pixeles de la página).
export function cimasDe(doc = document) {
  const v = doc.defaultView || window;
  return ORDEN.map((id) => {
    const s = doc.querySelector('[data-seccion="' + id + '"]');
    return s ? s.getBoundingClientRect().top + v.scrollY : Infinity;
  });
}

// Avance por las secciones: 0 en la portada y 5 en contacto. Cada cambio de sección ocurre mientras
// el borde de arriba de la sección nueva cruza la pantalla, de abajo hacia arriba; dentro de una
// sección el valor se queda quieto. Es continuo y depende solo de la posición del scroll.
export function recorridoDe(cimas, scrollY, alto) {
  let r = 0;
  for (let i = 1; i < cimas.length; i++) r += acotar((scrollY - (cimas[i] - alto)) / alto);
  return r;
}

export default {
  id: 'estanque',
  nombre: 'Estanque',

  async montar(ctx = {}) {
    const doc = ctx.raiz && ctx.raiz.documentElement ? ctx.raiz : document;
    const ventana = doc.defaultView || window;
    const raiz = doc.documentElement;
    const reducido = typeof ctx.reducido === 'boolean'
      ? ctx.reducido
      : !!ventana.matchMedia && ventana.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const limpiezas = [];
    let vivo = true;

    function escuchar(objeto, tipo, f, opciones) {
      objeto.addEventListener(tipo, f, opciones);
      limpiezas.push(() => objeto.removeEventListener(tipo, f, opciones));
    }
    function crear(etiqueta, clase, padre) {
      const n = doc.createElement(etiqueta);
      n.className = clase;
      n.setAttribute('data-estanque', '');
      n.setAttribute('aria-hidden', 'true');
      padre.insertBefore(n, padre.firstChild);
      limpiezas.push(() => n.remove());
      return n;
    }

    // La entrada del panel de la portada dura menos de medio segundo; después se quita la marca
    // para que nada quede a medio camino.
    if (raiz.classList.contains('entrada-completa') || raiz.classList.contains('entrada-corta')) {
      const fin = ventana.setTimeout(() => raiz.classList.remove('entrada-completa', 'entrada-corta'), 700);
      limpiezas.push(() => ventana.clearTimeout(fin));
    }

    // Con movimiento reducido no hay escena ni oyentes: el fondo pastel de la hoja queda fijo.
    if (reducido || !hayGpu(doc)) {
      return function desmontar() {
        vivo = false;
        for (let i = limpiezas.length - 1; i >= 0; i--) limpiezas[i]();
        limpiezas.length = 0;
      };
    }

    // ---------- la capa de la escena ----------
    let fondo = null;
    let escena = null;
    let montando = null;
    let recorrido = 0;
    let cimas = [];
    let zonas = { portada: null, secciones: null };
    let modulo = null;
    // Posiciones de las secciones y zonas libres: cambian con el tamaño de la ventana y del contenido
    // (por ejemplo, al llegar la fuente), no con el scroll.
    function medir() {
      cimas = cimasDe(doc);
      zonas = zonasDe(doc, modulo);
      leerAvance();
    }
    function leerAvance() {
      recorrido = recorridoDe(cimas, ventana.scrollY, Math.max(1, ventana.innerHeight));
    }
    // Si algo de esta parte falla, se deshace lo que alcanzó a montarse antes de avisar del error.
    try {
      fondo = crear('div', 'estanque-fondo', doc.body);
      escuchar(ventana, 'scroll', leerAvance, { passive: true });
      escuchar(ventana, 'resize', medir, { passive: true });
      if ('ResizeObserver' in ventana) {
        const vigia = new ventana.ResizeObserver(medir);
        const principal = doc.querySelector('main');
        if (principal) vigia.observe(principal);
        limpiezas.push(() => vigia.disconnect());
      }
      medir();
      // Con la pestaña oculta no se dibuja nada (el navegador ya frena los cuadros; esto lo asegura).
      escuchar(doc, 'visibilitychange', () => { if (escena) escena.pausar(doc.hidden); });
    } catch (e) {
      vivo = false;
      for (let i = limpiezas.length - 1; i >= 0; i--) limpiezas[i]();
      limpiezas.length = 0;
      throw e;
    }

    const movil = !!ventana.matchMedia && ventana.matchMedia('(max-width: 767px), (pointer: coarse)').matches;

    function avisar(e) {
      // Si la escena no carga, la página se queda con el fondo pastel de la hoja.
      if (vivo) fondo.classList.add('sin-escena');
      console.warn('El estanque se queda sin escena 3D:', e && e.message ? e.message : e);
    }
    // Otros estilos traen su propia copia de three y la anotan en window.__THREE__; la escena trae la
    // suya, cerrada en su módulo. Al importarla se aparta esa marca para que three no avise de varias
    // copias (no se comparten objetos entre ellas) y después se deja como estaba. Si mientras bajaba
    // el módulo otro estilo escribió su propia marca, esa se respeta: solo se quita la de la escena.
    async function importarEscena() {
      const marca = Object.getOwnPropertyDescriptor(ventana, '__THREE__');
      if (marca) delete ventana.__THREE__;
      let propia = null;
      try {
        const m = await import(new URL('escena.min.js', RECURSOS).href);
        propia = m.REVISION;
        return m;
      } finally {
        const ahora = ventana.__THREE__;
        if (ahora === undefined || ahora === propia) {
          if (marca) Object.defineProperty(ventana, '__THREE__', marca);
          else delete ventana.__THREE__;
        }
      }
    }
    // El módulo primero solo se descarga (modulepreload, sin ejecutarse). Así, si se cambia de estilo
    // mientras baja, nunca llega a correr y no deja su copia de three anotada junto a la de otro.
    function precargar(url) {
      return new Promise((listo, fallo) => {
        const l = doc.createElement('link');
        l.rel = 'modulepreload';
        l.href = url;
        l.onload = () => { l.remove(); listo(); };
        l.onerror = () => { l.remove(); fallo(new Error('No se pudo descargar la escena')); };
        doc.head.appendChild(l);
        limpiezas.push(() => l.remove());
      });
    }
    async function cargarEscena() {
      await precargar(new URL('escena.min.js', RECURSOS).href);
      if (!vivo) return;
      modulo = await importarEscena();
      if (!vivo) return;
      // Con el módulo a mano ya se puede medir el tamaño del koi de la portada.
      medir();
      // Desde aquí hasta tener la escena pasan unas cuantas microtareas; si en medio se desmonta el
      // estilo, desmontar espera a que esto termine y la escena se quita en cuanto existe.
      montando = (async () => {
        const quitar = await modulo.montarEscena(fondo, {
          rutaKoi: new URL('koi.glb', RECURSOS).href,
          rutaRana: HAY_RANA ? new URL('rana.glb', RECURSOS).href : null,
          movil,
          recorrido: () => recorrido,
          zonas: () => zonas,
          // En una pantalla angosta el panel tapa casi toda el agua: el espejo no se nota y cuesta
          // dibujar la escena una vez más por cuadro.
          reflejo: ventana.innerWidth >= 768,
          alListo: () => { if (vivo) fondo.classList.add('viva'); },
        });
        if (!vivo) {
          await quitar();
          return;
        }
        escena = quitar;
        if (doc.hidden) escena.pausar(true);
      })().catch(avisar);
      await montando;
      montando = null;
    }
    function arrancar() {
      if (vivo) cargarEscena().catch(avisar);
    }
    // La escena se pide después de load, para no competir con el contenido. Dentro del propio
    // evento load todavía cuenta como carga inicial, así que se deja pasar una tarea.
    function trasLoad() {
      const turno = ventana.setTimeout(arrancar, 0);
      limpiezas.push(() => ventana.clearTimeout(turno));
    }
    if (doc.readyState === 'complete') arrancar();
    else escuchar(ventana, 'load', trasLoad, { once: true });

    return async function desmontar() {
      vivo = false;
      for (let i = limpiezas.length - 1; i >= 0; i--) limpiezas[i]();
      limpiezas.length = 0;
      if (montando) await montando;
      if (escena) {
        const quitar = escena;
        escena = null;
        await quitar();
      }
    };
  },
};
