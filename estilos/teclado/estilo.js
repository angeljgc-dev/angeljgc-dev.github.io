// Estilo "teclado": un teclado 3D de habilidades fijo detrás de la página. Cambia de pose en cada
// sección, gira al entrar a habilidades, se desarma si se pasa rápido y, al presionar una tecla,
// dice dónde usé esa habilidad. Las habilidades siguen en el HTML: esto es una capa encima.
//
// La escena 3D solo se descarga si hay movimiento; con movimiento reducido se queda una
// foto quieta del mismo teclado y ningún cuadro corre.

// Las teclas salen de la sección de habilidades: un renglón por grupo, una tecla por habilidad.
// La leyenda es data-corto si la etiqueta lo trae, o su texto sin lo que va entre paréntesis.
// El tono lo decide la familia del grupo (data-familia), así que reordenar los grupos no cambia
// los colores. Datos e IA comparten el agua; operación va en grafito, como las modificadoras.
const TONO_DE_FAMILIA = {
  lenguajes: 'hueso',
  frontend: 'coral',
  backend: 'albaricoque',
  datos: 'agua',
  ia: 'agua',
  operacion: 'grafito',
};
const TONOS = ['hueso', 'coral', 'albaricoque', 'agua', 'grafito'];
function tonoDeGrupo(grupo, i) {
  const familia = grupo.dataset && grupo.dataset.familia;
  if (familia && TONO_DE_FAMILIA[familia]) return TONO_DE_FAMILIA[familia];
  // Un grupo sin familia conocida no se queda sin tono: toma uno por su lugar.
  return TONOS[i % TONOS.length];
}

// Una pose por sección. x e y van de -1 a 1 sobre la pantalla, z acerca o aleja de la cámara,
// los giros en grados y s es el tamaño respecto al lado corto de la pantalla.
const POSES = {
  ancho: {
    presentacion: { x: 0.5, y: 0.1, z: -3, rx: 72, ry: 0, rz: -10, s: 0.62 },
    proyectos: { x: 0.64, y: -0.04, z: 0, rx: 40, ry: -34, s: 0.62, giro: -1, dur: 0.56 },
    experiencia: { x: 0.68, y: 0.02, z: -1, rx: 14, ry: -62, rz: 4, s: 0.66 },
    investigacion: { x: 0.62, y: 0.04, z: -4, rx: 64, ry: 22, rz: -14, s: 0.64 },
    habilidades: { x: 0.42, y: -0.02, z: 2, rx: 50, ry: -32, s: 0.72, giro: 1, dur: 0.78 },
    contacto: { x: 0.8, y: -0.08, z: 1, rx: 48, ry: 32, rz: 10, s: 0.86, giro: -1, dur: 0.46 },
  },
  mediano: {
    presentacion: { x: 0.5, y: 0.6, z: -3, rx: 72, rz: -8, s: 0.5 },
    proyectos: { x: 0, y: 0, rx: 42, ry: -28, s: 0.82, giro: -1, dur: 0.56 },
    experiencia: { x: 0.7, y: -0.56, rx: 16, ry: -60, s: 0.7 },
    investigacion: { x: -0.6, y: -0.56, z: -2, rx: 62, ry: 24, rz: -10, s: 0.66 },
    habilidades: { x: 0, arriba: 70, z: 1, rx: 46, ry: -30, s: 1.0, giro: 1, dur: 0.78 },
    contacto: { x: 0.2, y: -0.5, rx: 50, ry: 24, rz: 8, s: 0.8, giro: -1, dur: 0.46 },
  },
  telefono: {
    presentacion: { x: 0.5, y: 0.64, z: -2, rx: 72, rz: -8, s: 0.44 },
    proyectos: { x: 0, y: 0.02, rx: 44, ry: -26, s: 0.88, giro: -1, dur: 0.56 },
    experiencia: { x: 0.68, y: -0.6, rx: 18, ry: -60, s: 0.8 },
    investigacion: { x: -0.6, y: -0.58, z: -1, rx: 62, ry: 26, rz: -10, s: 0.72 },
    habilidades: { x: 0, arriba: 60, z: 1, rx: 66, ry: 90, leyenda: -90, s: 1.3, giro: 1, dur: 0.78 },
    contacto: { x: 0.08, y: -0.48, rx: 50, ry: 24, rz: 8, s: 0.84, giro: -1, dur: 0.46 },
  },
};
// De 1024 a 1279 px el contenido deja menos lugar a la derecha: el teclado de habilidades se
// achica y se pone más de frente para que las leyendas sigan legibles.
POSES.compacto = { ...POSES.ancho, habilidades: { x: 0.4, y: -0.02, z: 2, rx: 64, ry: -26, s: 0.62, giro: 1, dur: 0.78 } };
// En pantallas de menos de 360 px el teclado de habilidades se pone más de frente y más grande
// para que cada tecla siga midiendo 44 px.
POSES.estrecho = { ...POSES.telefono, habilidades: { x: 0, arriba: 60, z: 1, rx: 74, ry: 90, leyenda: -90, s: 1.41, giro: 1, dur: 0.78 } };
const ORDEN = ['presentacion', 'proyectos', 'experiencia', 'investigacion', 'habilidades', 'contacto'];
const CON_ENTRADAS = ['proyectos', 'experiencia', 'investigacion'];
// Leyendas en letra condensada, como las de una tecla de verdad: caben más grandes.
const FUENTE = 'Anton, Impact, "Arial Narrow", sans-serif';

function tamano() {
  const w = window.innerWidth;
  if (w >= 1280) return 'ancho';
  if (w >= 1024) return 'compacto';
  if (w >= 720) return 'mediano';
  if (w < 360) return 'estrecho';
  return 'telefono';
}
const texto = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
// Igual, pero con un espacio entre elementos: "<strong>Dato</strong>valor" da "Dato valor".
const textoSeparado = (el) => [...el.childNodes].map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();

// ---------- las teclas, leídas del HTML ----------
// Qué buscar en los proyectos a partir de la etiqueta. Una tecla solo enciende lo que de verdad
// la respalda, así que:
//  - la frase completa (sin lo que va entre paréntesis ni la versión) siempre vale;
//  - las alternativas con diagonal (A/B) valen cada una;
//  - un pedazo de "A, B y C" o "A con B" vale solo si es una frase de varias palabras o un
//    nombre técnico, es decir, una palabra que aparece en el stack de algún proyecto del HTML;
//  - la primera palabra de una etiqueta compuesta vale solo si también es un nombre técnico.
// Así una habilidad de varias palabras no se enciende por una palabra común suelta.
const sinVersion = (t) => t.replace(/\s+\d+(\.\d+)*$/, '').trim();
function patrones(etiqueta, corto, tecnicos) {
  const base = etiqueta.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const valen = new Set([base, sinVersion(base)]);
  const esTecnico = (t) => tecnicos.has(t.toLowerCase());
  const esFrase = (t) => t.split(' ').length >= 2 && t.length >= 10;
  base.split('/').forEach((t) => { if (t.trim().length >= 2) valen.add(sinVersion(t.trim())); });
  base.split(/,|\s+y\s+|\s+con\s+/).forEach((t) => {
    const limpio = sinVersion(t.trim());
    if (limpio.length >= 2 && (esFrase(limpio) || esTecnico(limpio))) valen.add(limpio);
  });
  const primera = base.split(' ')[0];
  if (base.includes(' ') && esTecnico(primera)) valen.add(primera);
  if (corto && (esTecnico(corto) || esFrase(corto))) valen.add(corto);
  [...valen].forEach((t) => { if (/\.js$/i.test(t)) valen.add(t.replace(/\.js$/i, '')); });
  return [...valen].filter((t) => t.length >= 2).map((p) => {
    const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Lo corto (siglas) se busca respetando mayúsculas; lo largo, sin importar.
    return new RegExp('(^|[^\\p{L}\\p{N}])' + esc + '($|[^\\p{L}\\p{N}])', p.length <= 3 ? 'u' : 'iu');
  });
}
// Las palabras que el HTML declara como tecnologías en los stacks de los proyectos.
function nombresTecnicos(doc) {
  const salida = new Set();
  doc.querySelectorAll('.proyecto-stack li').forEach((li) => {
    texto(li).split(/[\s,()/]+/).forEach((t) => { if (t.length >= 3) salida.add(t.toLowerCase()); });
  });
  return salida;
}
const coincide = (lista, t) => lista.some((r) => r.test(t));

// También la usa la foto quieta del teclado, que se saca de esta misma escena.
export function leerTeclas(doc) {
  const seccion = doc.querySelector('[data-seccion="habilidades"]');
  if (!seccion) return null;
  let grupos = [...seccion.querySelectorAll('.grupo')];
  if (!grupos.length) grupos = [...seccion.querySelectorAll('li')].filter((li) => li.querySelector(':scope > :is(h3, h4)') && li.querySelector(':scope > ul'));
  const filas = grupos.map((g, i) => ({
    familia: texto(g.querySelector('h3, h4')),
    tono: tonoDeGrupo(g, i),
    etiquetas: [...g.querySelectorAll(':scope ul li')],
  })).filter((f) => f.etiquetas.length);
  if (!filas.length) return null;
  const columnas = Math.max(...filas.map((f) => f.etiquetas.length));
  const tecnicos = nombresTecnicos(doc);
  const teclas = [];
  filas.forEach((f, fila) => {
    f.etiquetas.forEach((li, columna) => {
      const nombre = texto(li);
      teclas.push({
        nombre,
        leyenda: (li.dataset.corto || nombre.replace(/\s*\([^)]*\)/g, '')).trim(),
        familia: f.tono,
        grupo: f.familia,
        etiqueta: li,
        busca: patrones(nombre, li.dataset.corto, tecnicos),
        fila,
        columna,
        cuantos: f.etiquetas.length,
      });
    });
  });
  return { teclas, columnas, filas: filas.length };
}

// ---------- evidencia: sale del mismo HTML, nada inventado ----------
function juntarEntradas(doc) {
  const lista = [];
  doc.querySelectorAll('article[data-proyecto]').forEach((a) => {
    lista.push({
      el: a,
      titulo: texto(a.querySelector('.proyecto-titulo')),
      fuentes: [...a.querySelectorAll('.proyecto-descripcion, .proyecto-rol, .proyecto-cifras li, .proyecto-stack li')],
    });
  });
  doc.querySelectorAll('[data-seccion="experiencia"] .trayecto > .puesto').forEach((p) => {
    lista.push({ el: p, titulo: texto(p.querySelector('h3')), fuentes: [...p.querySelectorAll('ul li')] });
  });
  const inv = doc.querySelector('[data-seccion="investigacion"]');
  if (inv) {
    lista.push({
      el: inv.querySelector('.tesis') || inv,
      titulo: texto(inv.querySelector('h2')),
      fuentes: [...inv.querySelectorAll('.tesis-texto, .tesis-datos li')],
    });
  }
  return lista;
}

function frase(el, busca) {
  const t = textoSeparado(el);
  if (el.closest('.proyecto-stack')) return 'En el stack: ' + t;
  const partes = t.split(/(?<=[.;])\s+/);
  let f = partes.find((p) => coincide(busca, p)) || t;
  if (f.length > 190) {
    const corte = f.lastIndexOf(',', 190);
    f = f.slice(0, corte > 80 ? corte : 190).trim() + '...';
  }
  return f;
}

function indexar(doc, teclas) {
  const entradas = juntarEntradas(doc);
  const porTecla = teclas.map(() => []);
  const porEntrada = new Map();
  entradas.forEach((en) => {
    const encendidas = new Set();
    teclas.forEach((t, i) => {
      const fuente = en.fuentes.find((f) => coincide(t.busca, textoSeparado(f)));
      if (!fuente) return;
      encendidas.add(i);
      porTecla[i].push({ entrada: en, frase: frase(fuente, t.busca) });
    });
    porEntrada.set(en.el, encendidas);
  });
  return { entradas, porTecla, porEntrada };
}

function crear(doc, etiqueta, clase, atributos = {}) {
  const el = doc.createElement(etiqueta);
  if (clase) el.className = clase;
  Object.entries(atributos).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

export default {
  id: 'teclado',
  nombre: 'Teclado',

  async montar(ctx) {
    const doc = ctx.raiz || document;
    const raiz = doc.documentElement;
    const base = new URL('./recursos/', import.meta.url);
    const quitar = [];
    const escuchar = (blanco, evento, f, opciones) => {
      blanco.addEventListener(evento, f, opciones);
      quitar.push(() => blanco.removeEventListener(evento, f, opciones));
    };
    const nodos = [];
    const poner = (el, padre = doc.body, antes = null) => {
      padre.insertBefore(el, antes);
      nodos.push(el);
      return el;
    };

    // Foto quieta: con movimiento reducido, o si el navegador no puede con la escena.
    function fotoQuieta() {
      if (doc.querySelector('.tk-quieto')) return;
      const img = crear(doc, 'img', 'tk-quieto', { src: new URL('teclado-quieto.webp', base).href, alt: '', 'aria-hidden': 'true', width: '900', height: '560', decoding: 'async' });
      poner(img, doc.body, doc.body.firstChild);
    }

    const leido = leerTeclas(doc);
    if (ctx.reducido || !leido) {
      fotoQuieta();
      return function desmontar() {
        nodos.forEach((el) => el.remove());
      };
    }

    const { teclas, columnas, filas } = leido;
    const indice = indexar(doc, teclas);
    const secciones = [...(ctx.secciones && ctx.secciones.length ? ctx.secciones : doc.querySelectorAll('[data-seccion]'))];
    const abortar = new AbortController();
    const temporizadores = new Set();
    const despues = (f, ms) => {
      const id = setTimeout(() => {
        temporizadores.delete(id);
        f();
      }, ms);
      temporizadores.add(id);
      return id;
    };
    const cancelar = (id) => {
      clearTimeout(id);
      temporizadores.delete(id);
    };

    // ---------- capas ----------
    const lienzo = poner(crear(doc, 'canvas', 'tk-lienzo', { 'aria-hidden': 'true' }), doc.body, doc.body.firstChild);
    const habilidades = doc.querySelector('[data-seccion="habilidades"]');
    const capa = crear(doc, 'div', 'tk-capa', { role: 'group', 'aria-label': 'Teclado de habilidades: cada tecla dice dónde usé esa habilidad' });
    if (habilidades && habilidades.parentNode) poner(capa, habilidades.parentNode, habilidades.nextSibling);
    else poner(capa);
    const botones = new Map();
    teclas.forEach((t, i) => {
      const b = crear(doc, 'button', 'tk-tecla', { type: 'button', 'aria-label': t.nombre + ', ' + t.grupo, 'data-tono': t.familia });
      capa.appendChild(b);
      botones.set(i, b);
    });
    const porEtiqueta = new Map();
    teclas.forEach((t, i) => { if (t.etiqueta) porEtiqueta.set(t.etiqueta, i); });

    const panel = poner(crear(doc, 'aside', 'tk-panel', { 'aria-label': 'Dónde usé la habilidad elegida', tabindex: '-1' }));
    panel.hidden = true;
    const panelFamilia = crear(doc, 'p', 'tk-panel-familia');
    const panelNombre = crear(doc, 'p', 'tk-panel-nombre');
    const panelLista = crear(doc, 'ul', 'tk-panel-lista');
    const cerrar = crear(doc, 'button', 'tk-panel-cerrar', { type: 'button' });
    cerrar.textContent = 'Cerrar';
    panel.append(panelFamilia, panelNombre, panelLista, cerrar);
    // Aviso para lector de pantalla: existe desde el inicio para que los cambios sí se anuncien.
    const aviso = poner(crear(doc, 'p', 'solo-lector tk-aviso', { 'aria-live': 'polite' }));

    // ---------- estado ----------
    let escena = null;
    let seccion = null;
    let encendidas = new Set();
    let elegida = -1;
    let scrollAlAbrir = 0;
    const telefono = () => window.innerWidth < 720;

    function poseDe(id) {
      const tabla = POSES[tamano()];
      return tabla[id] || tabla.presentacion;
    }
    function seccionAlCentro() {
      const medio = window.innerHeight / 2;
      const s = secciones.find((el) => {
        const r = el.getBoundingClientRect();
        return r.top <= medio && r.bottom >= medio;
      });
      return s ? s.dataset.seccion : 'presentacion';
    }
    // Cuando la pose pide el teclado anclado arriba (teléfono), la de habilidades no entra
    // mientras el título de la sección siga más abajo que el borde de arriba de las teclas: se
    // encimarían. Hasta que el título pasa, se queda la pose de la sección anterior.
    function seccionEfectiva(id) {
      if (id !== 'habilidades' || !habilidades) return id;
      const datos = poseDe('habilidades');
      if (datos.arriba === undefined) return id;
      const cabeza = habilidades.querySelector('.zona-cabeza');
      if (cabeza && cabeza.getBoundingClientRect().bottom > datos.arriba - 6) return ORDEN[ORDEN.indexOf('habilidades') - 1];
      return id;
    }

    function ubicarBotones() {
      if (!escena) return;
      const { deFrente, teclas: cajas } = escena.cajas();
      capa.dataset.pose = escena.pose() || '';
      // Las teclas solo se pueden tocar donde todas miden 44 px o más; en las demás poses el
      // teclado es decorado y el puntero sigue de largo.
      let menor = Infinity;
      botones.forEach((b, i) => { menor = Math.min(menor, cajas[i].w, cajas[i].h); });
      capa.classList.toggle('tk-activa', deFrente && menor >= 44);
      botones.forEach((b, i) => {
        const c = cajas[i];
        b.style.transform = 'translate(' + c.x.toFixed(1) + 'px,' + c.y.toFixed(1) + 'px)';
        b.style.width = c.w.toFixed(1) + 'px';
        b.style.height = c.h.toFixed(1) + 'px';
        b.dataset.letra = c.letra.toFixed(1);
      });
    }

    function cambiarSeccion(pedida) {
      const id = seccionEfectiva(pedida);
      if (!id || id === seccion) return;
      const antes = seccion;
      seccion = id;
      if (!escena) return;
      const datos = poseDe(id);
      const ia = ORDEN.indexOf(antes);
      const ib = ORDEN.indexOf(id);
      // Al bajar se gira como pide la sección nueva; al subir se deshace el giro de la que se deja.
      let giro = 0;
      if (antes && ib > ia) giro = datos.giro || 0;
      else if (antes && ib < ia) giro = -(poseDe(antes).giro || 0);
      capa.classList.remove('tk-activa');
      escena.irA(id, datos, { giro, dur: giro ? datos.dur || 0.62 : 0.62 });
      if (!CON_ENTRADAS.includes(id)) {
        entradaVista = null;
        iluminar(new Set());
      } else elegirEntrada();
    }

    function iluminar(conjunto) {
      encendidas = conjunto;
      botones.forEach((b, i) => b.toggleAttribute('data-encendida', conjunto.has(i)));
      if (escena) escena.iluminar(conjunto);
    }

    // ---------- el panel de la tecla ----------
    function abrirPanel(i) {
      elegida = i;
      const t = teclas[i];
      panel.dataset.tono = t.familia;
      panelFamilia.textContent = t.grupo;
      panelNombre.textContent = t.nombre;
      panelLista.replaceChildren();
      const pruebas = indice.porTecla[i];
      if (!pruebas.length) {
        const li = crear(doc, 'li', 'tk-panel-vacio');
        li.textContent = 'Está en mis habilidades; en esta página no hay un proyecto que la mencione.';
        panelLista.appendChild(li);
      }
      pruebas.forEach((p) => {
        const li = crear(doc, 'li');
        const ir = crear(doc, 'button', 'tk-panel-ir', { type: 'button' });
        const titulo = crear(doc, 'span', 'tk-panel-titulo');
        titulo.textContent = p.entrada.titulo;
        const detalle = crear(doc, 'span', 'tk-panel-frase');
        detalle.textContent = p.frase;
        ir.append(titulo, detalle);
        ir.addEventListener('click', () => irAEntrada(p.entrada.el));
        li.appendChild(ir);
        panelLista.appendChild(li);
      });
      panel.hidden = false;
      scrollAlAbrir = window.scrollY;
      botones.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
      aviso.textContent = t.nombre + ', ' + t.grupo + ': ' + (pruebas.length ? 'aparece en ' + pruebas.length + (pruebas.length === 1 ? ' entrada' : ' entradas') + ' de esta página.' : 'no aparece en un proyecto de esta página.');
      if (conTeclado) (panelLista.querySelector('button') || cerrar).focus();
    }
    function cerrarPanel() {
      if (panel.hidden) return;
      const volver = panel.contains(doc.activeElement) ? botones.get(elegida) : null;
      panel.hidden = true;
      elegida = -1;
      botones.forEach((b) => b.removeAttribute('aria-pressed'));
      if (volver) volver.focus({ preventScroll: true });
    }
    // Al ir a un proyecto se le da el foco para que el lector de pantalla lo anuncie; el tabindex
    // que hace falta para eso se quita al salir de él o al desmontar.
    const conTabindex = new Set();
    function irAEntrada(el) {
      cerrarPanel();
      el.scrollIntoView({ block: 'center' });
      if (!el.hasAttribute('tabindex')) {
        el.setAttribute('tabindex', '-1');
        conTabindex.add(el);
        el.addEventListener('blur', () => {
          el.removeAttribute('tabindex');
          conTabindex.delete(el);
        }, { once: true });
      }
      el.focus({ preventScroll: true });
    }
    let conTeclado = false;
    function activar(i, tacto, desdeTeclado = false) {
      if (i < 0 || !teclas[i]) return;
      conTeclado = desdeTeclado;
      if (escena) escena.presionar(i);
      if (tacto && navigator.vibrate) navigator.vibrate(8);
      if (elegida === i && !panel.hidden) cerrarPanel();
      else abrirPanel(i);
    }

    escuchar(cerrar, 'click', cerrarPanel);
    escuchar(doc, 'keydown', (e) => {
      if (e.key === 'Escape') cerrarPanel();
    });
    botones.forEach((b, i) => {
      escuchar(b, 'click', () => {
        // Los botones no reciben el puntero (lo recibe la capa); un clic aquí viene del teclado
        // físico o del lector de pantalla.
        activar(i, false, true);
      });
      escuchar(b, 'focus', () => {
        // Si la tecla no se ve, la vista se lleva a habilidades, donde el teclado está libre.
        if (seccion !== 'habilidades' && habilidades) {
          const cabeza = habilidades.querySelector('.zona-cabeza') || habilidades;
          window.scrollTo({ top: window.scrollY + cabeza.getBoundingClientRect().bottom + 2, behavior: 'instant' });
        }
        if (escena) escena.resaltar(i);
      });
      escuchar(b, 'blur', () => {
        if (escena) escena.resaltar(-1);
      });
    });

    // ---------- puntero sobre la capa ----------
    escuchar(capa, 'pointermove', (e) => {
      if (!escena || e.pointerType !== 'mouse' || !capa.classList.contains('tk-activa')) return;
      const i = escena.tecla(e.clientX, e.clientY, false);
      escena.resaltar(i);
      capa.classList.toggle('tk-sobre', i >= 0);
    });
    escuchar(capa, 'pointerleave', () => {
      if (escena) escena.resaltar(-1);
      capa.classList.remove('tk-sobre');
    });
    // El clic llega después del toque y el navegador no lo manda si el dedo estaba desplazando
    // la página; así el toque no abre el panel y luego pisa lo que apareció debajo.
    escuchar(capa, 'click', (e) => {
      if (!escena || !capa.classList.contains('tk-activa') || e.target !== capa) return;
      const tacto = e.pointerType ? e.pointerType !== 'mouse' : false;
      activar(escena.tecla(e.clientX, e.clientY, tacto), e.pointerType === 'touch');
    });

    // Pasar el cursor por una etiqueta de habilidades enciende su tecla.
    const etiquetaDe = (e) => (e.target.closest ? e.target.closest('[data-seccion="habilidades"] li') : null);
    escuchar(doc, 'pointerover', (e) => {
      const li = etiquetaDe(e);
      if (!li || !escena || !porEtiqueta.has(li)) return;
      escena.iluminar(new Set([porEtiqueta.get(li)]));
    });
    escuchar(doc, 'pointerout', (e) => {
      const li = etiquetaDe(e);
      if (li && escena && porEtiqueta.has(li)) escena.iluminar(encendidas);
    });

    // ---------- desplazamiento: sección, proyecto a la vista y velocidad ----------
    let ultimoY = window.scrollY;
    let ultimoT = performance.now();
    let suave = 0;
    let reposo = 0;
    let reposoTam = 0;
    let ultimaRevision = 0;
    // Sección y proyecto a la vista se revisan también aquí, cada 90 ms como mucho: los avisos de
    // intersección pueden llegar tarde cuando la página se desplaza muy rápido.
    function revisar() {
      ultimaRevision = performance.now();
      cambiarSeccion(seccionAlCentro());
      if (CON_ENTRADAS.includes(seccion)) elegirEntrada();
    }
    escuchar(window, 'scroll', () => {
      const ahora = performance.now();
      if (ahora - ultimaRevision > 90) revisar();
      const dt = Math.max(8, ahora - ultimoT);
      const v = Math.abs(window.scrollY - ultimoY) / dt * 1000 / window.innerHeight;
      suave = suave * 0.6 + v * 0.4;
      ultimoY = window.scrollY;
      ultimoT = ahora;
      if (escena) escena.velocidad(suave);
      cancelar(reposo);
      reposo = despues(() => {
        suave = 0;
        if (escena) escena.velocidad(0);
        revisar();
      }, 140);
      if (!panel.hidden && Math.abs(window.scrollY - scrollAlAbrir) > window.innerHeight * 0.6) cerrarPanel();
    }, { passive: true });

    if (ctx.al) quitar.push(ctx.al('cambia-seccion', (id) => cambiarSeccion(id)));
    // Respaldo propio por si el aviso del núcleo no llega.
    const vigiaSecciones = new IntersectionObserver((lista) => {
      lista.forEach((e) => {
        if (e.isIntersecting) cambiarSeccion(e.target.dataset.seccion);
      });
    }, { rootMargin: '-49% 0px -49% 0px' });
    secciones.forEach((s) => vigiaSecciones.observe(s));
    quitar.push(() => vigiaSecciones.disconnect());

    // El proyecto que se está viendo: el que cruza la franja de en medio de la pantalla y tiene
    // su centro más cerca del centro. Si ninguno la cruza, no se enciende nada.
    let entradaVista = null;
    function elegirEntrada() {
      if (!CON_ENTRADAS.includes(seccion)) return;
      const medio = window.innerHeight / 2;
      const banda = window.innerHeight * 0.12;
      let mejor = null;
      let distancia = Infinity;
      indice.entradas.forEach((en) => {
        const r = en.el.getBoundingClientRect();
        if (r.bottom < medio - banda || r.top > medio + banda) return;
        const d = Math.abs((r.top + r.bottom) / 2 - medio);
        if (d < distancia) {
          distancia = d;
          mejor = en.el;
        }
      });
      if (mejor === entradaVista && mejor) return;
      entradaVista = mejor;
      iluminar(mejor ? indice.porEntrada.get(mejor) || new Set() : new Set());
    }

    escuchar(window, 'resize', () => {
      if (!escena) return;
      cancelar(reposoTam);
      reposoTam = despues(() => {
        escena.redimensionar();
        if (seccion) escena.irA(seccion, poseDe(seccion), { instantaneo: true });
        ubicarBotones();
      }, 120);
    });
    escuchar(doc, 'visibilitychange', () => {
      if (!escena) return;
      if (doc.hidden) escena.pausar();
      else escena.reanudar();
    });

    // ---------- escena ----------
    // La leyenda se dibuja con la misma letra del sitio; si tarda, se usa la de respaldo.
    const letra = Promise.race([
      doc.fonts ? doc.fonts.load('400 40px Anton').catch(() => null) : Promise.resolve(),
      new Promise((listo) => despues(listo, 1200)),
    ]);
    letra
      .then(() => import('./escena.js'))
      .then((m) => m.crearEscena({ lienzo, teclas, columnas, filas, base, senal: abortar.signal, telefono, fuente: FUENTE }))
      .then((e) => {
        if (abortar.signal.aborted) {
          e.destruir();
          return;
        }
        escena = e;
        quitar.push(escena.alQuedarQuieto(ubicarBotones));
        raiz.classList.add('tk-listo');
        seccion = seccionEfectiva(seccionAlCentro());
        // Llega girando desde abajo; al cambiar de estilo la entrada es más corta.
        escena.irA(seccion, poseDe(seccion), { entrada: true, dur: ctx.cambio ? 0.6 : 0.72 });
        elegirEntrada();
      })
      .catch((err) => {
        if (abortar.signal.aborted) return;
        console.warn('El teclado 3D no cargó; queda la foto.', err);
        lienzo.remove();
        capa.hidden = true;
        fotoQuieta();
      });

    return function desmontar() {
      abortar.abort();
      temporizadores.forEach((id) => clearTimeout(id));
      temporizadores.clear();
      quitar.forEach((f) => f());
      if (escena) escena.destruir();
      escena = null;
      nodos.forEach((el) => el.remove());
      conTabindex.forEach((el) => el.removeAttribute('tabindex'));
      raiz.classList.remove('tk-listo');
    };
  },
};
