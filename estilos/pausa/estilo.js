// Estilo "pausa": el portafolio como el menú de pausa de un juego de consola.
// La página completa sigue en el HTML; este módulo convierte cada sección en una pantalla y
// agrega un menú inclinado, cortes en diagonal, barridos con la silueta de Ángel y un ambiente
// que se mueve. Con movimiento reducido no agrega nada: la hoja deja la página lineal.

// La última opción elegida sobrevive a los cambios de estilo dentro de la misma visita.
const memoria = { destino: null };

const RECURSOS = new URL('./recursos/', import.meta.url).href;

// Los retratos de Ángel: cada uno en dos anchos, su proporción y, si está recortado del fondo,
// su silueta (para el contorno, la sombra dura, los ecos y la trama).
const ARCHIVOS = {
  'retrato-frente': { anchos: [420, 760], proporcion: '760 / 716', silueta: 'retrato-frente-silueta.webp' },
  'retrato-perfil': { anchos: [420, 760], proporcion: '760 / 926', silueta: 'retrato-perfil-silueta.webp' },
  'retrato-de-pie': { anchos: [420, 760], proporcion: '760 / 743', silueta: 'retrato-de-pie-silueta.webp' },
  'retrato-recargado': { anchos: [420, 760], proporcion: '760 / 1221', silueta: 'retrato-recargado-silueta.webp' },
  'angel-duo': { anchos: [440, 820], proporcion: '820 / 890', silueta: 'angel-silueta-fundida.webp' },
  'mirada-lentes': { anchos: [420, 720], proporcion: '720 / 447' },
  'mirada-camara': { anchos: [420, 720], proporcion: '720 / 447' },
};
// Qué retrato tiene cada pantalla, como el personaje que cambia de pose en cada menú de un juego:
// foto (recortada, al frente), fantasma (su silueta en trama, detrás) y marco (una mirada de
// cerca en una tarjeta inclinada).
const RETRATOS = {
  menu: { foto: 'retrato-frente', fantasma: 'retrato-de-pie' },
  proyectos: { foto: 'retrato-perfil' },
  experiencia: { foto: 'retrato-de-pie' },
  investigacion: { fantasma: 'retrato-recargado', marco: 'mirada-lentes' },
  habilidades: { foto: 'retrato-recargado', fantasma: 'retrato-perfil' },
  contacto: { foto: 'angel-duo', marco: 'mirada-camara' },
};
const ORDEN_RETRATOS = ['retrato-perfil', 'retrato-de-pie', 'retrato-recargado', 'angel-duo'];

export default {
  id: 'pausa',
  nombre: 'Pausa',
  async montar(ctx) {
    return montarPausa(ctx || {});
  },
};

function montarPausa(ctx) {
  const doc = ctx.raiz && ctx.raiz.nodeType === 9 ? ctx.raiz : (ctx.raiz && ctx.raiz.ownerDocument) || document;
  const vent = doc.defaultView || window;
  const html = doc.documentElement;
  const reducido = typeof ctx.reducido === 'boolean' ? ctx.reducido : vent.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Con movimiento reducido la hoja ya presenta la página lineal y quieta: no hay nada que montar.
  const nada = function desmontar() {};
  nada.desmontar = nada;
  if (reducido) return nada;

  let secciones = ctx.secciones ? Array.from(ctx.secciones) : [];
  if (!secciones.length) secciones = Array.from(doc.querySelectorAll('[data-seccion]'));
  if (!secciones.length) secciones = Array.from(doc.querySelectorAll('[data-zona]'));
  if (secciones.length < 2) return nada;

  // ---------- pantallas ----------
  const nombreDe = (s) => s.dataset.seccion || s.dataset.zona || s.id;
  const raizSeccion = secciones.find((s) => /^(presentacion|inicio)$/.test(nombreDe(s))) || secciones[0];
  const pantallas = secciones.filter((s) => s !== raizSeccion).map((s, i) => {
    const rotulo = s.querySelector('.rotulo, header span');
    const titulo = s.querySelector('h2, h1');
    const texto = (rotulo ? rotulo.textContent : '').trim();
    const partes = texto.split('·').map((t) => t.trim()).filter(Boolean);
    const num = partes.length > 1 && /^\d+$/.test(partes[0]) ? partes[0] : String(i + 1).padStart(2, '0');
    const nombre = partes.length > 1 ? partes.slice(1).join(' ') : (titulo ? titulo.textContent.trim() : nombreDe(s));
    return { id: s.id || nombreDe(s), el: s, num, nombre, titulo, silueta: i % 2 === 1 };
  });
  // La última pantalla (contacto) también llega con la silueta, como en un menú de juego.
  if (pantallas.length) pantallas[pantallas.length - 1].silueta = true;
  const porId = new Map(pantallas.map((p) => [p.id, p]));

  // ---------- registro de todo lo que se agrega, para desmontar limpio ----------
  const limpiezas = [];
  const vivas = new Set();
  const relojes = new Set();
  const nodos = [];
  let raf = 0;
  let desmontado = false;

  function escuchar(obj, tipo, fn, op) {
    obj.addEventListener(tipo, fn, op);
    limpiezas.push(() => obj.removeEventListener(tipo, fn, op));
  }
  function animar(el, cuadros, op) {
    const a = el.animate(cuadros, op);
    vivas.add(a);
    const fuera = () => vivas.delete(a);
    a.finished.then(fuera, fuera);
    return a;
  }
  function luego(ms, fn) {
    const t = vent.setTimeout(() => { relojes.delete(t); fn(); }, ms);
    relojes.add(t);
  }
  function crear(etiqueta, clase, padre) {
    const n = doc.createElement(etiqueta);
    if (clase) n.className = clase;
    if (padre) padre.appendChild(n);
    return n;
  }

  // Clases y atributos que se tocan en elementos del contenido: se guarda cómo estaban.
  const originales = [];
  function recordar(el, atributo) {
    originales.push({ el, atributo, valor: el.getAttribute(atributo) });
  }
  recordar(html, 'class');
  secciones.forEach((s) => recordar(s, 'class'));
  pantallas.forEach((p) => { if (p.titulo) { recordar(p.titulo, 'tabindex'); p.titulo.setAttribute('tabindex', '-1'); } });

  // ---------- capa decorativa: retícula, campos, ambiente y la figura de Ángel ----------
  const capa = crear('div', 'pausa-capa');
  capa.setAttribute('aria-hidden', 'true');
  crear('div', 'pausa-reticula', capa);
  crear('div', 'pausa-campos', capa);
  const lienzo = crear('canvas', 'pausa-ambiente', capa);
  const fantasma = crear('div', 'pausa-fantasma', capa);
  const figura = crear('div', 'pausa-figura', capa);
  crear('i', 'pausa-eco pausa-eco-1', figura);
  crear('i', 'pausa-eco pausa-eco-2', figura);
  crear('i', 'pausa-figura-sombra', figura);
  crear('i', 'pausa-figura-borde', figura);
  const foto = crear('img', '', figura);
  foto.alt = '';
  foto.decoding = 'async';
  crear('i', 'pausa-pulso', figura);
  const marco = crear('div', 'pausa-marco', capa);
  const fotoMarco = crear('img', '', marco);
  fotoMarco.alt = '';
  fotoMarco.decoding = 'async';

  // ---------- retratos: se piden cuando se van a necesitar, uno adelantado ----------
  const grande = vent.innerWidth >= 600 || (vent.devicePixelRatio || 1) >= 2;
  const fuenteDe = (n) => RECURSOS + n + '-' + ARCHIVOS[n].anchos[grande ? 1 : 0] + '.webp';
  const siluetaDe = (n) => (ARCHIVOS[n].silueta ? RECURSOS + ARCHIVOS[n].silueta : '');
  const pedidas = new Set();
  function pedir(n) {
    if (!n || pedidas.has(n)) return;
    pedidas.add(n);
    for (const u of [fuenteDe(n), siluetaDe(n)]) {
      if (!u) continue;
      const im = new Image();
      im.decoding = 'async';
      im.src = u;
    }
  }
  function retratoDe(destino) {
    if (RETRATOS[destino]) return RETRATOS[destino];
    // Una sección sin retrato asignado toma uno de la lista, siempre el mismo para ella.
    const i = Math.max(0, pantallas.findIndex((p) => p.id === destino));
    return { foto: ORDEN_RETRATOS[i % ORDEN_RETRATOS.length] };
  }
  function pedirPantalla(destino) {
    const r = retratoDe(destino);
    pedir(r.foto); pedir(r.fantasma); pedir(r.marco);
  }
  function capaRetrato(el, img, n) {
    el.dataset.foto = n || '';
    if (!n) return;
    pedir(n);
    el.style.setProperty('--p-proporcion', ARCHIVOS[n].proporcion);
    if (ARCHIVOS[n].silueta) el.style.setProperty('--p-sil', 'url("' + siluetaDe(n) + '")');
    if (img && img.getAttribute('src') !== fuenteDe(n)) img.src = fuenteDe(n);
  }
  // La foto que se va se rompe en dos por la diagonal; la nueva entra por un corte y se asienta.
  function romperRetrato() {
    if (!figura.dataset.foto) return;
    const cs = getComputedStyle(figura);
    const base = 'left:' + figura.offsetLeft + 'px;top:' + figura.offsetTop + 'px;width:' + figura.offsetWidth + 'px;height:' + figura.offsetHeight + 'px;transform:' + cs.transform + ';rotate:' + cs.rotate + ';';
    [['polygon(0 0, 100% 0, 100% 36%, 0 64%)', '-7% -5%'], ['polygon(0 64%, 100% 36%, 100% 100%, 0 100%)', '7% 6%']].forEach(([corte, rumbo]) => {
      const pedazo = figura.cloneNode(true);
      pedazo.className = 'pausa-figura pausa-roto';
      pedazo.setAttribute('style', (figura.getAttribute('style') || '') + base + 'clip-path:' + corte);
      capa.appendChild(pedazo);
      const a = animar(pedazo, [{ translate: '0 0', opacity: 1 }, { translate: rumbo, opacity: 0 }], { duration: 210, easing: 'cubic-bezier(.5,0,.9,.5)', fill: 'forwards' });
      const fuera = () => pedazo.remove();
      a.finished.then(fuera, fuera);
    });
  }
  function entradaRetrato(r) {
    if (r.foto) {
      animar(figura, [{ clipPath: 'polygon(30% 0, 30% 0, 0 100%, 0 100%)', translate: '9% 0' }, { clipPath: 'polygon(0 0, 140% 0, 110% 100%, -30% 100%)', translate: '-1.5% 0', offset: 0.8 }, { clipPath: 'polygon(0 0, 140% 0, 110% 100%, -30% 100%)', translate: '0 0' }],
        { duration: 280, delay: 20, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'backwards' });
    }
    if (r.fantasma) animar(fantasma, [{ opacity: 0, scale: '1.08' }, { opacity: 1, scale: '1' }], { duration: 320, delay: 60, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    if (r.marco) {
      animar(marco, [{ opacity: 0, scale: '0.6', translate: '-40px 30px' }, { opacity: 1, scale: '1.05', translate: '4px 0', offset: 0.7 }, { opacity: 1, scale: '1', translate: '0 0' }],
        { duration: 300, delay: 110, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'backwards' });
    }
  }
  function ponerRetrato(destino, conMovimiento) {
    const r = retratoDe(destino);
    const cambia = (figura.dataset.foto || '') !== (r.foto || '');
    if (conMovimiento && cambia) romperRetrato();
    capaRetrato(figura, foto, r.foto);
    capaRetrato(fantasma, null, r.fantasma);
    capaRetrato(marco, fotoMarco, r.marco);
    if (conMovimiento) entradaRetrato(r);
    // una adelantada: la pantalla siguiente
    if (destino === 'menu') pedirPantalla(pantallas[elegido].id);
    else pedirPantalla(pantallas[(pantallas.findIndex((p) => p.id === destino) + 1) % pantallas.length].id);
  }

  // ---------- menú raíz ----------
  const menu = crear('nav', 'pausa-menu');
  menu.setAttribute('aria-label', 'Menú');
  const listaMenu = crear('ol', '', menu);
  const enlaces = pantallas.map((p, i) => {
    const li = crear('li', '', listaMenu);
    li.style.setProperty('--i', i);
    const a = crear('a', '', li);
    a.href = '#' + p.id;
    a.dataset.destino = p.id;
    crear('span', 'pausa-num', a).textContent = p.num;
    crear('span', 'pausa-txt', a).textContent = p.nombre;
    return a;
  });
  const pistas = crear('p', 'pausa-pistas', menu);
  pistas.setAttribute('aria-hidden', 'true');
  pistas.innerHTML = '<kbd>&uarr;</kbd><kbd>&darr;</kbd> Elegir <kbd>Enter</kbd> Abrir';

  // ---------- barra de las pantallas: regresar y páginas numeradas ----------
  const barra = crear('div', 'pausa-barra');
  const regresar = crear('button', 'pausa-regresar', barra);
  regresar.type = 'button';
  regresar.innerHTML = '<kbd aria-hidden="true">Esc</kbd> Regresar';
  const paginas = crear('nav', 'pausa-paginas', barra);
  paginas.setAttribute('aria-label', 'Pantallas');
  const chips = pantallas.map((p) => {
    const a = crear('a', '', paginas);
    a.href = '#' + p.id;
    a.dataset.destino = p.id;
    a.textContent = p.num;
    a.setAttribute('aria-label', p.nombre);
    return a;
  });
  const pistaLados = crear('span', 'pausa-pista-lados', barra);
  pistaLados.setAttribute('aria-hidden', 'true');
  pistaLados.innerHTML = '<kbd>&larr;</kbd><kbd>&rarr;</kbd>';

  // ---------- ver todo: la página completa sin menú, para quien tiene un minuto ----------
  const todo = crear('button', 'pausa-todo');
  todo.type = 'button';
  todo.setAttribute('aria-pressed', 'false');
  todo.textContent = 'Ver todo';

  // El botón va en la cabecera, junto al selector de estilo; el menú y la barra, justo después,
  // para que el orden de Tab sea cabecera, menú y luego el contenido.
  const cabecera = doc.querySelector('body > header');
  const ranura = doc.querySelector('[data-ranura="selector"]');
  if (ranura) ranura.before(todo);
  else (cabecera || doc.body).appendChild(todo);
  if (cabecera) cabecera.after(menu, barra);
  else doc.body.prepend(menu, barra);
  doc.body.appendChild(capa);
  nodos.push(menu, barra, todo, capa);

  // ---------- estado ----------
  let modo = 'pantallas';
  let actual = null;
  let elegido = Math.max(0, pantallas.findIndex((p) => p.id === memoria.destino));
  let transicion = null;

  function pantallaDe(el) {
    const s = el && el.closest ? secciones.find((x) => x.contains(el)) : null;
    if (!s) return undefined;
    return s === raizSeccion ? 'menu' : pantallas.find((p) => p.el === s).id;
  }
  function decodificar(t) {
    try {
      return decodeURIComponent(t);
    } catch (e) {
      // Un hash mal codificado (por ejemplo "#100%") se toma tal cual: no apunta a ninguna pantalla.
      return t;
    }
  }
  function destinoDeHash(h) {
    const id = decodificar((h || '').replace(/^#/, ''));
    if (!id || id === 'contenido' || id === raizSeccion.id) return 'menu';
    if (porId.has(id)) return id;
    const el = doc.getElementById(id);
    return el ? pantallaDe(el) : undefined;
  }
  function seccionDe(destino) {
    return destino === 'menu' ? raizSeccion : porId.get(destino).el;
  }

  function elegir(i, foco) {
    elegido = (i + enlaces.length) % enlaces.length;
    enlaces.forEach((a, k) => a.toggleAttribute('data-elegido', k === elegido));
    memoria.destino = pantallas[elegido].id;
    pedirPantalla(memoria.destino);
    if (foco && doc.activeElement !== enlaces[elegido]) {
      enlaces[elegido].focus({ preventScroll: true });
      enlaces[elegido].scrollIntoView({ block: 'nearest' });
    }
  }

  // Pone una pantalla en su lugar en el mismo cuadro: sin desvanecido, sin deslizamiento.
  function aplicar(destino, conMovimiento = false) {
    if (desmontado) return;
    ponerRetrato(destino, conMovimiento && actual !== null);
    actual = destino;
    desplazado = 0;
    const activa = seccionDe(destino);
    secciones.forEach((s) => {
      s.classList.toggle('pausa-activa', s === activa);
      s.classList.toggle('pausa-fuera', s !== activa);
      s.classList.toggle('pausa-raiz', s === raizSeccion);
    });
    html.dataset.pausaPantalla = destino === 'menu' ? 'menu' : destino;
    activa.scrollTop = 0;
    chips.forEach((c) => {
      if (c.dataset.destino === destino) c.setAttribute('aria-current', 'page');
      else c.removeAttribute('aria-current');
    });
    if (destino !== 'menu') elegir(pantallas.findIndex((p) => p.id === destino), false);
  }

  function enfocar(destino) {
    if (destino === 'menu') {
      enlaces[elegido].focus({ preventScroll: true });
      enlaces[elegido].scrollIntoView({ block: 'nearest' });
    }
    else {
      const p = porId.get(destino);
      if (p.titulo) p.titulo.focus({ preventScroll: true });
    }
  }

  // Los renglones de una pantalla, en el orden en que entran escalonados.
  function renglones(seccion) {
    const caja = seccion.querySelector('.envoltura') || seccion.firstElementChild || seccion;
    const titulos = [];
    const filas = [];
    for (const hijo of caja.children) {
      if (getComputedStyle(hijo).display === 'none' || hijo.classList.contains('retrato')) continue;
      if (hijo.tagName === 'HEADER') { titulos.push(...hijo.children); continue; }
      if (hijo.tagName === 'UL' || hijo.tagName === 'OL' || hijo.children.length > 4) { filas.push(...hijo.children); continue; }
      const listas = Array.from(hijo.children).filter((n) => n.tagName === 'UL' || n.tagName === 'OL');
      if (listas.length && hijo.children.length <= 4) {
        for (const n of hijo.children) {
          if (n.tagName === 'UL' || n.tagName === 'OL') filas.push(...n.children);
          else filas.push(n);
        }
        continue;
      }
      filas.push(hijo);
    }
    return { titulos, filas };
  }

  // Después del corte, los renglones entran escalonados desde la izquierda.
  function entrada(destino, retraso, pasoMenu = 50) {
    const paso = 40;
    if (desmontado) return;
    if (destino === 'menu') {
      enlaces.forEach((a, i) => {
        animar(a.parentNode, [{ translate: '-48px 0', opacity: 0 }, { translate: '0 0', opacity: 1 }],
          { duration: 160, delay: retraso + i * pasoMenu, easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'backwards' });
      });
    }
    const { titulos, filas } = renglones(seccionDe(destino));
    titulos.forEach((t, i) => {
      animar(t, [{ translate: '-64px 0', opacity: 0 }, { translate: '6px 0', opacity: 1, offset: 0.75 }, { translate: '0 0', opacity: 1 }],
        { duration: 200, delay: retraso + i * 50, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'backwards' });
    });
    const base = retraso + titulos.length * 50;
    filas.forEach((f, i) => {
      const tarde = base + Math.min(i, 7) * paso;
      // Las listas de contacto llegan como paneles que se asientan con un pequeño sobregiro.
      const panel = f.matches('.canales > li, [data-panel]');
      const cuadros = panel
        ? [{ translate: '-56px 12px', rotate: '-5deg', opacity: 0 }, { translate: '4px 0', rotate: '1deg', opacity: 1, offset: 0.7 }, { translate: '0 0', rotate: '0deg', opacity: 1 }]
        : [{ translate: '-28px 0', opacity: 0 }, { translate: '0 0', opacity: 1 }];
      animar(f, cuadros, { duration: panel ? 260 : 170, delay: tarde, easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'backwards' });
    });
  }

  // Corte en diagonal: el cambio ocurre en un cuadro y un tajo de dos campos dura unos tres cuadros.
  function corteDiagonal(destino, foco) {
    aplicar(destino, true);
    if (foco) enfocar(destino);
    const tajo = crear('div', 'pausa-tajo', doc.body);
    tajo.setAttribute('aria-hidden', 'true');
    const a = animar(tajo, [{ opacity: 1 }, { opacity: 0 }], { duration: 50, easing: 'steps(1, end)' });
    const quitar = () => tajo.remove();
    a.finished.then(quitar, quitar);
    entrada(destino, 30);
    return { terminar: quitar };
  }

  // Barrido con la silueta de Ángel: cruza la pantalla, tapa todo y en ese instante cambia.
  function barridoSilueta(destino, foco, alReves) {
    const barrido = crear('div', 'pausa-barrido' + (alReves ? ' al-reves' : ''), doc.body);
    barrido.setAttribute('aria-hidden', 'true');
    const pista = crear('div', 'pausa-barrido-pista', barrido);
    crear('i', 'pausa-barrido-luz', pista);
    crear('i', 'pausa-barrido-sombra', pista);
    const quien = retratoDe(destino).foto || 'retrato-frente';
    const viajero = crear('img', 'pausa-barrido-foto', pista);
    viajero.alt = '';
    viajero.src = fuenteDe(quien);
    const vw = vent.innerWidth;
    const vh = vent.innerHeight;
    const ancho = pista.getBoundingClientRect().width;
    const solido = ancho - 0.62 * vh * 1.08;
    const inicio = -ancho - 0.1 * vw;
    const tapa = (vw - solido) / 2;
    const fin = vw + 0.1 * vw;
    let aplicado = false;
    const poner = () => {
      if (aplicado || desmontado) return;
      aplicado = true;
      aplicar(destino, true);
      if (foco) enfocar(destino);
    };
    const quitar = () => barrido.remove();
    const ida = animar(pista, [{ transform: `translateX(${inicio}px)` }, { transform: `translateX(${tapa}px)` }],
      { duration: 170, easing: 'cubic-bezier(.55,0,.9,.6)', fill: 'forwards' });
    ida.finished.then(() => {
      poner();
      const vuelta = animar(pista, [{ transform: `translateX(${tapa}px)` }, { transform: `translateX(${fin}px)` }],
        { duration: 190, easing: 'cubic-bezier(.1,.4,.45,1)', fill: 'forwards' });
      vuelta.finished.then(quitar, quitar);
      entrada(destino, 40);
    }, quitar);
    return {
      terminar() {
        ida.cancel();
        quitar();
        poner();
      },
    };
  }

  function irA(destino, op = {}) {
    if (destino === undefined || desmontado) return;
    const { como = 'auto', foco = true, historia = 'push' } = op;
    if (modo === 'lineal') {
      seccionDe(destino).scrollIntoView();
      return;
    }
    if (transicion) { transicion.terminar(); transicion = null; }
    if (destino === actual) { if (foco) enfocar(destino); return; }
    if (historia !== 'no') {
      const url = vent.location.pathname + vent.location.search + (destino === 'menu' ? '' : '#' + destino);
      const propia = !!(vent.history.state && vent.history.state.pausaPropia);
      if (historia === 'push' && destino !== 'menu') vent.history.pushState({ pausa: destino, pausaPropia: true }, '', url);
      else vent.history.replaceState(destino === 'menu' && !propia ? null : { pausa: destino, pausaPropia: propia }, '', url);
    }
    let tipo = como;
    if (tipo === 'auto') tipo = destino === 'menu' ? 'atras' : (porId.get(destino).silueta ? 'silueta' : 'diagonal');
    if (tipo === 'instantaneo') { aplicar(destino); if (foco) enfocar(destino); return; }
    transicion = tipo === 'diagonal' ? corteDiagonal(destino, foco) : barridoSilueta(destino, foco, tipo === 'atras');
    const esta = transicion;
    luego(420, () => { if (transicion === esta) transicion = null; });
  }

  // Regresar solo usa el botón atrás del navegador si la entrada la agregó el menú; si el
  // visitante llegó directo a una pantalla, se reemplaza la entrada para no sacarlo del sitio.
  let retrocediendo = false;
  function volver() {
    if (actual === 'menu' || retrocediendo) return;
    if (vent.history.state && vent.history.state.pausaPropia) {
      retrocediendo = true;
      vent.history.back();
    } else irA('menu', { historia: 'reemplazar' });
  }
  function vecina(paso) {
    const i = pantallas.findIndex((p) => p.id === actual);
    return pantallas[(i + paso + pantallas.length) % pantallas.length].id;
  }

  // ---------- entradas del visitante ----------
  function editable(t) {
    return t && t.closest && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], video, audio');
  }
  function desplazar(e, dy) {
    const activa = seccionDe(actual);
    if (activa.contains(e.target) || activa.scrollHeight <= activa.clientHeight + 1) return;
    e.preventDefault();
    activa.scrollBy({ top: dy * activa.clientHeight * 0.8 });
  }
  function alTeclado(e) {
    if (modo !== 'pantallas' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || editable(e.target)) return;
    const k = e.key;
    const boton = e.target.closest && e.target.closest('button, a[href]');
    if (k === 'PageDown' || (k === ' ' && !boton && !e.shiftKey)) { desplazar(e, 1); return; }
    if (k === 'PageUp' || (k === ' ' && !boton && e.shiftKey)) { desplazar(e, -1); return; }
    if (k === 'Tab' && !e.shiftKey && actual !== 'menu' && barra.contains(e.target)) {
      const enfocables = barra.querySelectorAll('button, a[href]');
      const titulo = porId.get(actual).titulo;
      if (e.target === enfocables[enfocables.length - 1] && titulo) { e.preventDefault(); titulo.focus({ preventScroll: true }); }
      return;
    }
    if (actual === 'menu') {
      if (k === 'ArrowDown' || k === 'ArrowRight') { e.preventDefault(); elegir(elegido + 1, true); }
      else if (k === 'ArrowUp' || k === 'ArrowLeft') { e.preventDefault(); elegir(elegido - 1, true); }
      else if (k === 'Home') { e.preventDefault(); elegir(0, true); }
      else if (k === 'End') { e.preventDefault(); elegir(enlaces.length - 1, true); }
      else if (k === 'Enter' && (menu.contains(e.target) || e.target === doc.body || e.target === html)) {
        e.preventDefault();
        irA(pantallas[elegido].id);
      }
      return;
    }
    if (k === 'Escape' || k === 'Backspace') { e.preventDefault(); volver(); }
    else if ((k === 'ArrowDown' || k === 'ArrowUp') && !seccionDe(actual).contains(e.target)) {
      e.preventDefault();
      seccionDe(actual).scrollBy({ top: (k === 'ArrowDown' ? 1 : -1) * 60 });
    }
    else if (k === 'ArrowRight') { e.preventDefault(); irA(vecina(1), { como: 'diagonal', historia: 'reemplazar' }); }
    else if (k === 'ArrowLeft') { e.preventDefault(); irA(vecina(-1), { como: 'diagonal', historia: 'reemplazar' }); }
  }
  escuchar(doc, 'keydown', alTeclado);

  // Todo enlace interno (el menú, la cabecera, las páginas, saltar al contenido) abre su pantalla.
  function abrirEnlace(a) {
    const destino = destinoDeHash(a.getAttribute('href'));
    if (destino === undefined) return false;
    const entreHermanas = paginas.contains(a) && actual !== 'menu';
    irA(destino, { como: entreHermanas ? 'diagonal' : 'auto', historia: entreHermanas ? 'reemplazar' : 'push' });
    return true;
  }
  // Un toque en los controles propios responde al levantar el dedo: el navegador a veces se
  // traga el clic de un toque que llega justo después de deslizar. El clic que llegue después
  // de ese toque se ignora, aunque caiga en otro control (la pantalla ya cambió debajo del dedo).
  const CONTROLES = '.pausa-regresar, .pausa-paginas a, .pausa-menu a';
  let yaTocado = { hasta: 0 };
  const repetido = (e) => !!(e.target.closest && e.target.closest(CONTROLES)) && e.timeStamp < yaTocado.hasta;
  escuchar(doc, 'click', (e) => {
    if (modo !== 'pantallas' || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    if (repetido(e)) { e.preventDefault(); return; }
    if (abrirEnlace(a)) e.preventDefault();
  });
  escuchar(regresar, 'click', (e) => { if (!repetido(e)) volver(); });
  escuchar(vent, 'popstate', () => {
    retrocediendo = false;
    const d = destinoDeHash(vent.location.hash);
    irA(d === undefined ? 'menu' : d, { historia: 'no' });
  });

  // El ratón elige al pasar; el foco también elige, para que Tab y flechas digan lo mismo.
  enlaces.forEach((a, i) => {
    escuchar(a, 'pointerenter', (e) => { if (e.pointerType === 'mouse') elegir(i, false); });
    escuchar(a, 'focus', () => elegir(i, false));
  });

  // Si el foco llega a una sección que no está en pantalla (Tab, lector de pantalla), se abre.
  escuchar(doc, 'focusin', (e) => {
    if (modo !== 'pantallas' || transicion) return;
    const d = pantallaDe(e.target);
    if (d === undefined || d === actual) return;
    irA(d, { como: 'instantaneo', foco: false, historia: 'reemplazar' });
    // El navegador no pudo acercar el elemento mientras su pantalla estaba recortada.
    e.target.scrollIntoView({ block: 'nearest' });
  });

  // En el teléfono: deslizar a los lados cambia de pantalla.
  let toque = null;
  escuchar(doc, 'pointerdown', (e) => {
    const control = e.target.closest && e.target.closest(CONTROLES);
    toque = e.pointerType === 'touch' && modo === 'pantallas' ? { x: e.clientX, y: e.clientY, t: e.timeStamp, control } : null;
  }, { passive: true });
  escuchar(doc, 'pointerup', (e) => {
    if (!toque) return;
    const dx = e.clientX - toque.x;
    const dy = e.clientY - toque.y;
    const rapido = e.timeStamp - toque.t < 800;
    const { control } = toque;
    toque = null;
    if (control && Math.hypot(dx, dy) < 12 && rapido) {
      yaTocado = { hasta: e.timeStamp + 700 };
      if (control === regresar) volver();
      else abrirEnlace(control);
      return;
    }
    if (actual !== 'menu' && rapido && Math.abs(dx) > 64 && Math.abs(dx) > 1.8 * Math.abs(dy)) {
      irA(vecina(dx < 0 ? 1 : -1), { como: 'diagonal', historia: 'reemplazar', foco: false });
    }
  }, { passive: true });
  escuchar(doc, 'pointercancel', () => { toque = null; }, { passive: true });

  escuchar(todo, 'click', () => {
    if (modo === 'pantallas') {
      const activa = seccionDe(actual);
      ponerLineal();
      activa.scrollIntoView();
    } else {
      ponerPantallas(destinoVisible(false), true);
      vent.scrollTo(0, 0);
    }
  });

  // No se escucha "cambia-seccion" del núcleo: en este estilo la sección a la vista la decide el
  // menú, y el aviso del núcleo nacería de las propias pantallas (un eco que robaría el foco).

  // ---------- ambiente: figuras que derivan y rayas de velocidad, en canvas 2D ----------
  const pincel = lienzo.getContext('2d');
  let figuras = [];
  let rayas = [];
  function medirLienzo() {
    const dpr = Math.min(vent.devicePixelRatio || 1, 1.5);
    lienzo.width = Math.round(vent.innerWidth * dpr);
    lienzo.height = Math.round(vent.innerHeight * dpr);
    pincel.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function sembrar() {
    const w = vent.innerWidth;
    const h = vent.innerHeight;
    const n = w < 700 ? 7 : 11;
    figuras = Array.from({ length: n }, (_, i) => ({
      x: Math.random() * w,
      y: Math.random() * h,
      tam: 6 + Math.random() * 18,
      giro: Math.random() * Math.PI,
      vg: (Math.random() - 0.5) * 0.0016,
      vx: -0.006 - Math.random() * 0.01,
      vy: -0.004 - Math.random() * 0.008,
      forma: i % 3,
      color: i === 2 ? '#c4f252' : (i === 5 ? '#fe7d6f' : (i % 2 ? '#4a3a7c' : '#3d2d66')),
    }));
  }
  let antes = 0;
  let proximaRaya = 0;
  // Paralaje: cada capa sigue al ratón y al desplazamiento a su propio ritmo.
  let desplazado = 0;
  const meta = { x: 0, y: 0 };
  const va = { x: 0, y: 0, s: 0 };
  escuchar(doc, 'pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    meta.x = e.clientX / vent.innerWidth * 2 - 1;
    meta.y = e.clientY / vent.innerHeight * 2 - 1;
  }, { passive: true });
  escuchar(doc, 'scroll', (e) => {
    const t = e.target;
    desplazado = t === doc || t === doc.documentElement ? vent.scrollY : (t.classList && t.classList.contains('pausa-activa') ? t.scrollTop : desplazado);
  }, { passive: true, capture: true });
  function paralaje() {
    va.x += (meta.x - va.x) * 0.08;
    va.y += (meta.y - va.y) * 0.08;
    va.s += (desplazado - va.s) * 0.2;
    capa.style.setProperty('--p-px', va.x.toFixed(3));
    capa.style.setProperty('--p-py', va.y.toFixed(3));
    capa.style.setProperty('--p-sy', va.s.toFixed(1));
  }
  function cuadro(t) {
    raf = vent.requestAnimationFrame(cuadro);
    paralaje();
    const dt = Math.min(64, antes ? t - antes : 16);
    antes = t;
    const w = vent.innerWidth;
    const h = vent.innerHeight;
    pincel.clearRect(0, 0, w, h);
    pincel.lineWidth = 2;
    for (const f of figuras) {
      f.x += f.vx * dt; f.y += f.vy * dt; f.giro += f.vg * dt;
      if (f.x < -40) f.x = w + 40;
      if (f.y < -40) f.y = h + 40;
      pincel.save();
      pincel.translate(f.x, f.y);
      pincel.rotate(f.giro);
      pincel.strokeStyle = f.color;
      pincel.fillStyle = f.color;
      if (f.forma === 0) pincel.strokeRect(-f.tam / 2, -f.tam / 2, f.tam, f.tam);
      else if (f.forma === 1) { pincel.beginPath(); pincel.moveTo(-f.tam / 2, 0); pincel.lineTo(f.tam / 2, 0); pincel.moveTo(0, -f.tam / 2); pincel.lineTo(0, f.tam / 2); pincel.stroke(); }
      else pincel.fillRect(-2, -2, 4, 4);
      pincel.restore();
    }
    // Rayas de velocidad: cruzan en diagonal cada tanto, como el fondo de un menú en espera.
    if (t > proximaRaya) {
      rayas.push({ y: Math.random() * h, x: -w * 0.4, largo: w * (0.2 + Math.random() * 0.3), v: 1.6 + Math.random() * 1.4 });
      proximaRaya = t + 900 + Math.random() * 1800;
    }
    pincel.strokeStyle = '#4a3a7c';
    pincel.lineWidth = 1.5;
    const tg = Math.tan(8 * Math.PI / 180);
    rayas = rayas.filter((r) => {
      r.x += r.v * dt;
      pincel.beginPath();
      pincel.moveTo(r.x, r.y);
      pincel.lineTo(r.x + r.largo, r.y - r.largo * tg);
      pincel.stroke();
      return r.x < w * 1.2;
    });
  }
  function arrancarAmbiente() {
    if (raf || desmontado || modo !== 'pantallas' || doc.hidden) return;
    antes = 0;
    raf = vent.requestAnimationFrame(cuadro);
  }
  function pararAmbiente() {
    if (raf) vent.cancelAnimationFrame(raf);
    raf = 0;
  }
  escuchar(doc, 'visibilitychange', () => { if (doc.hidden) pararAmbiente(); else arrancarAmbiente(); });
  escuchar(vent, 'resize', () => { medirLienzo(); sembrar(); });

  // ---------- modos ----------
  function destinoVisible(usarHash) {
    const h = usarHash && vent.location.hash && destinoDeHash(vent.location.hash);
    if (h) return h;
    // Si el núcleo dice en qué sección estaba el visitante, esa manda.
    const dicha = ctx.cambio && (ctx.seccion || ctx.seccionActual);
    if (dicha) {
      const s = secciones.find((x) => nombreDe(x) === dicha || x.id === dicha);
      if (s) return s === raizSeccion ? 'menu' : pantallas.find((p) => p.el === s).id;
    }
    // Si no, la sección que cruza la mitad de la pantalla, como el aviso "cambia-seccion".
    const y = vent.innerHeight * 0.5;
    for (const s of secciones) {
      const r = s.getBoundingClientRect();
      if (r.top <= y && r.bottom > y) return s === raizSeccion ? 'menu' : pantallas.find((p) => p.el === s).id;
    }
    return 'menu';
  }
  function ponerPantallas(destino, conEntrada) {
    modo = 'pantallas';
    html.classList.add('pausa-pantallas');
    todo.setAttribute('aria-pressed', 'false');
    todo.textContent = 'Ver todo';
    actual = null;
    aplicar(destino);
    if (conEntrada) entradaRetrato(retratoDe(destino));
    if (conEntrada) {
      const lento = ctx.primeraVez !== false && !ctx.cambio;
      const tajo = crear('div', 'pausa-tajo', doc.body);
      tajo.setAttribute('aria-hidden', 'true');
      const a = animar(tajo, [{ opacity: 1 }, { opacity: 0 }], { duration: 50, easing: 'steps(1, end)' });
      const quitar = () => tajo.remove();
      a.finished.then(quitar, quitar);
      entrada(destino, 40, lento ? 83 : 50);
      // La primera visita escalona el menú a 83 ms por renglón, como un menú de consola; la
      // entrada completa queda por debajo de 0.8 s.
    }
    medirLienzo();
    sembrar();
    arrancarAmbiente();
  }
  function ponerLineal() {
    if (transicion) { transicion.terminar(); transicion = null; }
    modo = 'lineal';
    pararAmbiente();
    html.classList.remove('pausa-pantallas');
    delete html.dataset.pausaPantalla;
    secciones.forEach((s) => s.classList.remove('pausa-activa', 'pausa-fuera', 'pausa-raiz'));
    todo.setAttribute('aria-pressed', 'true');
    todo.textContent = 'Volver al menú';
  }

  const inicial = destinoVisible(!ctx.cambio);
  if (inicial === 'menu') elegir(elegido, false);
  ponerPantallas(inicial, true);
  vent.scrollTo(0, 0);

  function desmontar() {
    if (desmontado) return;
    desmontado = true;
    const activa = modo === 'pantallas' && actual ? seccionDe(actual) : null;
    if (transicion) transicion = null;
    vivas.forEach((a) => a.cancel());
    vivas.clear();
    relojes.forEach((t) => vent.clearTimeout(t));
    relojes.clear();
    pararAmbiente();
    limpiezas.forEach((f) => f());
    doc.querySelectorAll('.pausa-tajo, .pausa-barrido, .pausa-roto').forEach((n) => n.remove());
    nodos.forEach((n) => n.remove());
    delete html.dataset.pausaPantalla;
    originales.forEach(({ el, atributo, valor }) => {
      if (atributo === 'class') {
        el.classList.remove('pausa-pantallas', 'pausa-activa', 'pausa-fuera', 'pausa-raiz');
        if (valor === null && !el.classList.length) el.removeAttribute('class');
      } else if (valor === null) el.removeAttribute(atributo);
      else el.setAttribute(atributo, valor);
    });
    // El hash de una pantalla ya no hace falta: el siguiente estilo usa la posición.
    if (destinoDeHash(vent.location.hash) !== undefined && vent.location.hash) {
      vent.history.replaceState(null, '', vent.location.pathname + vent.location.search);
    }
    // El siguiente estilo encuentra al visitante en la sección donde estaba.
    if (activa && activa !== raizSeccion) vent.scrollTo(0, activa.getBoundingClientRect().top + vent.scrollY);
    else if (activa) vent.scrollTo(0, Math.min(vent.scrollY, Math.max(0, raizSeccion.offsetHeight - vent.innerHeight)));
  }
  desmontar.desmontar = desmontar;
  return desmontar;
}
