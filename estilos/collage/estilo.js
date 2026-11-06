// Estilo "collage": papel rasgado que llega doblado y se pega, una mesa de luz con tomas reales
// de los proyectos cuyo plano de foco mueve el scroll, y tarjetas con grosor en WebGL.
// El contenido no se toca: todo lo que se agrega es decorativo (aria-hidden, sin texto) y
// desmontar deja el documento como estaba.

const RECURSOS = new URL('./recursos/', import.meta.url).href;
const r = (nombre) => RECURSOS + nombre;
// Los carteles de los comerciales ya están en el contenido: se reutilizan del caché, sin bytes extra.
const PROYECTOS = new URL('../../img/proyectos/', import.meta.url).href;
const CARTELES = ['comercial-diorama-poster.webp', 'comercial-fluidos-poster.webp', 'comercial-plastilina-poster.webp'];
const SRCSET_MURO = ' srcset="' + RECURSOS + 'muro-640.webp 640w, ' + RECURSOS + 'muro-1196.webp 1196w" sizes="(min-width: 1024px) 110vw, 150vw"';

// Hoja de contactos: 4 tiras de 4 tomas de 240 px. Cada toma es una captura real.
const HOJA = { ancho: 1196, alto: 1020, lado: 240 };
const toma = (i) => ({ x: 34 + Math.floor(i / 4) * 296, y: 12 + (i % 4) * 252 });

// Tarjetas con grosor: capturas de proyectos sin cifras de demostración. La vacía lleva el
// degradado que cambia de color; la de Ultravioleta, el marco de neón.
const FICHAS = ['surco', 'medibot', '', 'halley', 'ultravioleta', 'madrigal'];
const NEON = 4;
// Apaisadas como las capturas: se ve la pantalla completa, con el nombre de cada sitio entero.
const PROPORCION = 16 / 10;

// Rejilla del tablero: dos columnas en vertical, tres en horizontal, con huecos que absorben
// el giro y el vaivén de cada tarjeta. Así nunca se enciman, a cualquier ancho.
function acomodo(W, H) {
  const columnas = W >= 700 ? 3 : 2;
  const filas = FICHAS.length / columnas;
  const minimo = Math.max(18, Math.min(W, H) * 0.05);
  const ancho = Math.max(40, Math.min((W - (columnas + 1) * minimo) / columnas, (H - (filas + 1) * minimo * 1.6) / filas * PROPORCION, 300));
  const alto = ancho / PROPORCION;
  const sx = (W - columnas * ancho) / (columnas + 1);
  const sy = (H - filas * alto) / (filas + 1);
  const lugares = FICHAS.map((_, i) => {
    const c = i % columnas, f = Math.floor(i / columnas);
    // Escalonado por columna: no cambia la distancia vertical dentro de la misma columna.
    const desfase = (c % 2 ? 1 : -1) * sy * 0.25;
    return { x: sx * (c + 1) + ancho * c + ancho / 2, y: sy * (f + 1) + alto * f + alto / 2 + desfase };
  });
  return { ancho, alto, lugares, hueco: Math.min(sx, sy), W, H };
}

const sujetar = (v, a, b) => (v < a ? a : v > b ? b : v);
const tramo = (v, a, b) => sujetar((v - a) / (b - a), 0, 1);
const suave = (t) => t * t * (3 - 2 * t);
const salidaExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const salidaCubica = (t) => 1 - Math.pow(1 - t, 3);
const mezcla = (a, b, t) => a + (b - a) * t;

// Arriba del documento sin contar transformaciones (offsetTop no las ve).
function arribaEnDocumento(el) {
  let y = 0;
  for (let n = el; n; n = n.offsetParent) y += n.offsetTop;
  return y;
}

function crear(doc, html) {
  const caja = doc.createElement('div');
  caja.innerHTML = html;
  return caja.firstElementChild;
}

function imagen(nombre, ancho, alto, extra) {
  const ruta = nombre.indexOf('comercial-') === 0 ? PROYECTOS + nombre : r(nombre);
  return '<img src="' + ruta + '" width="' + ancho + '" height="' + alto + '" alt="" decoding="async"' + (extra || '') + '>';
}

export default {
  id: 'collage',
  nombre: 'Collage',

  async montar(ctx) {
    const doc = (ctx && ctx.raiz && ctx.raiz.documentElement ? ctx.raiz : document);
    const ventana = doc.defaultView || window;
    const html = doc.documentElement;
    const reducido = !!(ctx && ctx.reducido);
    const limpiar = [];
    const estilosOriginales = new Map();
    let vivo = true;

    // Registro de todo lo que se agrega, para poder quitarlo sin dejar rastro.
    const escuchar = (blanco, tipo, fn, opciones) => {
      blanco.addEventListener(tipo, fn, opciones);
      limpiar.push(() => blanco.removeEventListener(tipo, fn, opciones));
    };
    const poner = (nodo, padre, antes) => {
      nodo.setAttribute('data-collage', '');
      nodo.setAttribute('aria-hidden', 'true');
      padre.insertBefore(nodo, antes || null);
      limpiar.push(() => nodo.remove());
      return nodo;
    };
    const tocarEstilo = (el) => {
      if (!estilosOriginales.has(el)) estilosOriginales.set(el, el.getAttribute('style'));
      return el.style;
    };
    const clases = reducido ? ['c-quieto'] : ['c-vivo'];
    html.classList.add(...clases);

    const seccion = (id) =>
      doc.querySelector('[data-seccion="' + id + '"]') ||
      doc.querySelector('[data-zona="' + (id === 'presentacion' ? 'inicio' : id) + '"]');
    const tituloDe = (sec) => (sec ? sec.querySelector('h2') : null);
    const cabezaDe = (sec) => {
      const h2 = tituloDe(sec);
      return h2 ? (h2.closest('header') && sec.contains(h2.closest('header')) ? h2.closest('header') : h2) : null;
    };

    const secArranque = seccion('presentacion');
    const secProyectos = seccion('proyectos');
    const secHabilidades = seccion('habilidades');
    const secContacto = seccion('contacto');

    // ---------- Arranque: collage sobre una foto fuera de foco ----------
    let camaraArranque = null;
    if (secArranque) {
      const escena = crear(doc,
        '<div class="c-escena"><div class="c-camara">' +
        '<div class="c-capa c-capa-fondo">' + imagen('fondo-arranque.webp', 480, 300) + '</div>' +
        '<div class="c-capa c-capa-luz"></div>' +
        '<div class="c-capa c-capa-recortes">' +
        '<figure class="c-recorte c-recorte-1">' + imagen('recorte-medibot.webp', 300, 365) + '</figure>' +
        '<figure class="c-recorte c-recorte-2">' + imagen(CARTELES[0], 360, 640) + '</figure>' +
        '<span class="c-cinta c-cinta-1"></span><span class="c-cinta c-cinta-2"></span>' +
        '</div></div></div>');
      poner(escena, secArranque, secArranque.firstChild);
      camaraArranque = escena.firstElementChild;
    }
    const retrato = secArranque ? secArranque.querySelector('figure, img') : null;

    // ---------- Mesa de luz con las tomas ----------
    let muro = null;
    if (secProyectos) {
      const hojas = (clase) => imagen(clase === 'b' ? 'muro-borroso.webp' : 'muro-1196.webp',
        clase === 'b' ? 299 : 1196, clase === 'b' ? 255 : 1020,
        clase === 'b' ? '' : SRCSET_MURO);
      const nodo = crear(doc,
        '<div class="c-muro"><div class="c-muro-fijo"><div class="c-muro-luz"></div><div class="c-muro-plano">' +
        '<div class="c-muro-borroso">' + hojas('b') + hojas('b') + '</div>' +
        '<div class="c-muro-foco"><div class="c-muro-nitido">' + hojas('n') + hojas('n') + '</div></div>' +
        '<svg class="c-lapiz" viewBox="0 0 120 120"><path pathLength="1" d="M60 8c30 1 52 22 51 52-1 31-25 52-55 50C27 108 7 86 9 57 11 29 33 9 63 11c20 2 34 12 40 24"/></svg>' +
        '</div></div></div>');
      poner(nodo, secProyectos, secProyectos.firstChild);
      const cabeza = cabezaDe(secProyectos);
      let espacio = null;
      if (cabeza && !reducido) espacio = poner(crear(doc, '<div class="c-espacio-muro"></div>'), cabeza.parentNode, cabeza);
      muro = {
        nodo,
        fijo: nodo.firstElementChild,
        plano: nodo.querySelector('.c-muro-plano'),
        foco: nodo.querySelector('.c-muro-foco'),
        nitido: nodo.querySelector('.c-muro-nitido'),
        lapiz: nodo.querySelector('.c-lapiz'),
        trazo: nodo.querySelector('.c-lapiz path'),
        titulo: tituloDe(secProyectos),
        cabeza,
        espacio,
        visible: true,
        fila: -1,
      };
      muro.trazo.style.strokeDasharray = '1';
      muro.trazo.style.strokeDashoffset = reducido ? '0' : '1';
    }

    // ---------- Tablero de tarjetas con grosor ----------
    let tablero = null;
    if (secHabilidades) {
      // Cada ficha lleva la captura del proyecto con srcset: el navegador elige 560 o 960 px
      // según el tamaño en pantalla por la densidad. WebGL usa esa misma imagen ya cargada.
      const fichas = FICHAS.map((nombre, i) => {
        const clase = 'c-ficha' + (nombre === '' ? ' c-ficha-degradado' : '') + (i === NEON ? ' c-ficha-neon' : '');
        if (nombre === '') return '<div class="' + clase + '"></div>';
        return '<div class="' + clase + '"><img src="' + PROYECTOS + nombre + '-960.webp" srcset="' + PROYECTOS + nombre + '-560.webp 560w, ' + PROYECTOS + nombre + '-960.webp 960w" sizes="300px" width="960" height="600" alt="" decoding="async" loading="lazy"></div>';
      }).join('');
      const nodo = crear(doc, '<div class="c-tablero"><div class="c-tablero-css">' + fichas + '</div></div>');
      const cabeza = cabezaDe(secHabilidades);
      poner(nodo, cabeza ? cabeza.parentNode : secHabilidades, cabeza ? cabeza.nextSibling : secHabilidades.firstChild);
      tablero = { nodo, fichas: [...nodo.querySelectorAll('.c-ficha')], escena: null, visible: false, pedido: false, acomodo: null };
    }
    // Coloca las fichas en su rejilla y ajusta sizes a lo que mide cada imagen en pantalla.
    const acomodarTablero = () => {
      if (!tablero) return;
      const a = acomodo(tablero.nodo.clientWidth || 1, tablero.nodo.clientHeight || 1);
      tablero.acomodo = a;
      tablero.fichas.forEach((f, i) => {
        const s = tocarEstilo(f);
        const c = a.lugares[i];
        s.left = (c.x - a.ancho / 2).toFixed(1) + 'px';
        s.top = (c.y - a.alto / 2).toFixed(1) + 'px';
        s.width = a.ancho.toFixed(1) + 'px';
        s.height = a.alto.toFixed(1) + 'px';
        s.transform = 'rotate(' + (i % 2 ? 1.5 : -1.5) + 'deg)';
        const im = f.querySelector('img');
        if (im) im.sizes = Math.ceil(a.alto * 960 / 600) + 'px';
      });
      if (tablero.escena) tablero.escena.tamano();
    };
    acomodarTablero();

    // ---------- Cierre: carteles verticales que llegan girados ----------
    let cierre = null;
    if (secContacto) {
      let reels = '';
      for (let i = 0; i < 9; i++) reels += '<div class="c-reel">' + imagen(CARTELES[i % 3], 360, 640, ' loading="lazy"') + '</div>';
      const nodo = crear(doc, '<div class="c-cierre"><div class="c-cierre-fila">' + reels + '</div></div>');
      poner(nodo, secContacto, secContacto.firstChild);
      cierre = { nodo, fila: nodo.firstElementChild, reels: [...nodo.querySelectorAll('.c-reel')], ancho: 0 };
    }

    // Los papeles rasgados cambian un poco en cada montaje, como recortes hechos a mano.
    const estiloRaiz = tocarEstilo(html);
    const semilla = (Date.now() & 0xffff) || 7;
    estiloRaiz.setProperty('--rasgado', rasgado(semilla, 10));
    estiloRaiz.setProperty('--rasgado-b', rasgado(semilla * 7 + 3, 8));

    // ---------- Movimiento reducido: estado final quieto ----------
    if (reducido) {
      if (tablero) escuchar(ventana, 'resize', acomodarTablero, { passive: true });
      if (muro) {
        // La toma marcada es la del producto principal, ya enfocada y con su círculo.
        const { x, y } = toma(0);
        estiloRaiz.setProperty('--c-lapiz-x', ((x - 12) / HOJA.ancho * 100 * 100 / 23) + '%');
        estiloRaiz.setProperty('--c-lapiz-y', ((y - 12) / (HOJA.alto * 2) * 100 * (HOJA.alto * 2 / HOJA.ancho) * 100 / 23) + '%');
      }
      return function desmontar() {
        vivo = false;
        terminar();
      };
    }

    // ---------- Con movimiento ----------
    html.classList.add('c-entra');
    let reloj = ventana.setTimeout(() => { html.classList.remove('c-entra'); reloj = 0; }, 800);
    limpiar.push(() => { if (reloj) ventana.clearTimeout(reloj); html.classList.remove('c-entra'); });

    const medidas = { alto: 1, ancho: 1, arranque: 0, proyectos: 0, espacio: 0, tituloMuro: 0, plano: 0, habilidades: 0, tablero: 0, tableroAlto: 1, contacto: 0, titulos: [], tarjetas: [] };
    const titulos = ['experiencia', 'investigacion', 'habilidades', 'formacion', 'contacto']
      .map(seccion).map(tituloDe).filter(Boolean);
    const tarjetas = secProyectos ? [...secProyectos.querySelectorAll('article[data-proyecto]')] : [];
    const estadoTitulos = titulos.map(() => ({ e: -1, texto: '' }));
    const estadoTarjetas = tarjetas.map(() => ({ texto: '' }));

    function medir() {
      medidas.alto = ventana.innerHeight || 1;
      medidas.ancho = ventana.innerWidth || 1;
      if (secProyectos) medidas.proyectos = arribaEnDocumento(secProyectos);
      if (muro) {
        medidas.espacio = muro.espacio ? muro.espacio.offsetHeight : 0;
        medidas.tituloMuro = muro.cabeza ? arribaEnDocumento(muro.cabeza) : 0;
        medidas.plano = muro.plano.offsetWidth;
      }
      if (tablero) { medidas.tablero = arribaEnDocumento(tablero.nodo); medidas.tableroAlto = tablero.nodo.offsetHeight || 1; acomodarTablero(); }
      if (secHabilidades) medidas.habilidades = arribaEnDocumento(secHabilidades);
      if (secContacto) medidas.contacto = arribaEnDocumento(secContacto);
      if (cierre) cierre.ancho = cierre.fila.scrollWidth / 2;
      medidas.titulos = titulos.map(arribaEnDocumento);
      medidas.tarjetas = tarjetas.map(arribaEnDocumento);
    }
    let pendienteMedir = true;
    escuchar(ventana, 'resize', () => { pendienteMedir = true; }, { passive: true });
    if (ventana.ResizeObserver) {
      const ro = new ventana.ResizeObserver(() => { pendienteMedir = true; });
      ro.observe(doc.body);
      limpiar.push(() => ro.disconnect());
    }
    // Las fuentes cambian la altura del texto al llegar.
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(() => { pendienteMedir = true; });

    // El tablero WebGL se pide solo cuando su sección se acerca.
    if (tablero && 'IntersectionObserver' in ventana) {
      const io = new ventana.IntersectionObserver((entradas) => {
        for (const e of entradas) {
          tablero.visible = e.isIntersecting;
          if (e.isIntersecting && !tablero.pedido) {
            tablero.pedido = true;
            // Las capturas se piden ya: los frentes de WebGL salen de ellas.
            tablero.fichas.forEach((f) => { const im = f.querySelector('img'); if (im) im.loading = 'eager'; });
            iniciarTablero(tablero, doc, ventana, () => vivo).then((escena) => {
              if (!escena) return;
              if (!vivo) { escena.liberar(); return; }
              tablero.escena = escena;
              tablero.nodo.appendChild(escena.lienzo);
              tablero.nodo.classList.add('c-listo');
              escena.tamano();
            }, () => {
              // Si Three.js no llegó (red caída), quedan las fichas en CSS y se reintenta al volver.
              tablero.pedido = false;
            });
          }
        }
      }, { rootMargin: '60% 0px 60% 0px' });
      io.observe(tablero.nodo);
      limpiar.push(() => io.disconnect());
      limpiar.push(() => { if (tablero.escena) { tablero.escena.liberar(); tablero.escena = null; } tablero.nodo.classList.remove('c-listo'); });
    }

    // El correo se enciende como letrero de neón una sola vez: sube y se queda, sin parpadeo.
    const correo = secContacto ? secContacto.querySelector('.canales a, a[href^="mailto:"]') : null;
    if (correo && 'IntersectionObserver' in ventana) {
      const io = new ventana.IntersectionObserver((entradas) => {
        if (entradas.some((e) => e.isIntersecting)) { correo.classList.add('c-encendido'); io.disconnect(); }
      }, { threshold: 0.6 });
      io.observe(correo);
      limpiar.push(() => { io.disconnect(); correo.classList.remove('c-encendido'); });
    }

    // ---------- El cuadro: una sola vuelta de animación para todo ----------
    let rafId = 0;
    let previoY = -1;
    let inicio = 0;
    let cuadrosCorte = 0;
    let golpeado = null;
    let ultimoCorte = -10000;
    const cortesHechos = new Set();
    // Cada escena grande entra con un golpe de cámara de dos cuadros, sin cambiar la luz de la
    // pantalla: es el mismo cuadro, sacudido. La marca es la altura de la pantalla donde ocurre.
    const golpes = [
      ['proyectos', () => medidas.proyectos, muro && muro.fijo, 0.5],
      ['habilidades', () => medidas.tablero, tablero && tablero.nodo, 0.85],
      ['contacto', () => medidas.contacto, cierre && cierre.nodo, 0.9],
    ].filter((g) => g[2]);
    limpiar.push(() => { if (golpeado) golpeado.classList.remove('c-golpe'); });
    const escribir = (el, prop, valor, memo, clave) => {
      if (memo[clave] === valor) return;
      memo[clave] = valor;
      tocarEstilo(el)[prop] = valor;
    };
    const memoria = {};

    function cuadro(ahora) {
      rafId = ventana.requestAnimationFrame(cuadro);
      if (!inicio) inicio = ahora;
      const t = (ahora - inicio) / 1000;
      if (pendienteMedir) { pendienteMedir = false; medir(); }
      const y = ventana.scrollY || ventana.pageYOffset || 0;
      const alto = medidas.alto;
      const bajando = previoY >= 0 && y > previoY;

      // Cámara del arranque: deriva lenta que nunca se detiene más el paneo del scroll.
      if (camaraArranque) {
        const p = sujetar(y / alto, 0, 1.2);
        const v = 'translate3d(' + (Math.sin(t * 0.21) * 14).toFixed(1) + 'px,' + (Math.cos(t * 0.17) * 10 - p * 90).toFixed(1) + 'px,' + (p * 120).toFixed(1) + 'px) rotateZ(' + (Math.sin(t * 0.13) * 1.2 - p * 3).toFixed(2) + 'deg) rotateX(' + (p * 8).toFixed(2) + 'deg)';
        escribir(camaraArranque, 'transform', v, memoria, 'cam');
        if (retrato && y < alto * 1.5) escribir(retrato, 'transform', 'translate3d(0,' + (y * 0.12).toFixed(1) + 'px,0) rotate(' + (-2 + Math.sin(t * 0.3) * 0.6).toFixed(2) + 'deg)', memoria, 'ret');
      }

      if (muro) cuadroMuro(y, t, alto);
      cuadroTitulos(y, alto);
      cuadroTarjetas(y, alto);
      if (cierre) cuadroCierre(y, t, alto);
      if (tablero && tablero.escena && tablero.visible) {
        const p = sujetar((y + alto - medidas.tablero) / (alto + medidas.tableroAlto), 0, 1);
        tablero.escena.dibujar(t, p);
      }

      // Un golpe por escena, nunca dos en el mismo segundo.
      if (cuadrosCorte > 0) {
        cuadrosCorte--;
        if (cuadrosCorte === 0 && golpeado) { golpeado.classList.remove('c-golpe'); golpeado = null; }
      } else if (bajando) {
        for (const [id, arribaDe, nodo, marca] of golpes) {
          const arriba = arribaDe();
          if (!arriba || cortesHechos.has(id)) continue;
          if (arriba - previoY > alto * marca && arriba - y <= alto * marca && ahora - ultimoCorte > 1200) {
            cortesHechos.add(id);
            ultimoCorte = ahora;
            cuadrosCorte = 2;
            golpeado = nodo;
            nodo.classList.add('c-golpe');
            break;
          }
        }
      }
      previoY = y;
    }

    // Mesa de luz. q avanza de 0 a 1 desde que la sección asoma hasta que termina el espacio.
    function cuadroMuro(y, t, alto) {
      const largo = alto + medidas.espacio;
      const q = (y + alto - medidas.proyectos) / largo;
      const visible = q > -0.05 && q < 1.08;
      if (visible !== muro.visible) {
        muro.visible = visible;
        tocarEstilo(muro.fijo).visibility = visible ? '' : 'hidden';
      }
      if (!visible) {
        // Fuera de la escena el título queda en su lugar, aunque se haya llegado de un salto.
        if (muro.titulo) {
          if (muro.cabeza !== muro.titulo) escribir(muro.cabeza, 'transform', '', memoria, 'ct');
          escribir(muro.titulo, 'transform', '', memoria, 'tt');
          escribir(muro.titulo, 'filter', '', memoria, 'tf');
          muro.tx = undefined;
        }
        return;
      }
      const enfoque = suave(tramo(q, 0.22, 0.4));
      const deriva = suave(tramo(q, 0.1, 0.78));
      const latigo = tramo(q, 0.72, 0.9);
      const l = latigo * latigo;
      const w = medidas.plano;
      const tx = (-0.06 - deriva * 0.18) * w + Math.sin(t * 0.23) * 8 + l * medidas.ancho * 0.9;
      const ty = (0.22 - deriva * 0.5) * w + Math.cos(t * 0.19) * 6 - l * alto * 1.1;
      const rx = 34 + l * 14 + Math.sin(t * 0.15) * 0.8;
      const rz = -14 + l * 15 + Math.sin(t * 0.11) * 0.7;
      const desenfoque = Math.sin(Math.PI * latigo) * 9;
      escribir(muro.plano, 'transform', 'translate3d(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0) rotateX(' + rx.toFixed(2) + 'deg) rotateZ(' + rz.toFixed(2) + 'deg)', memoria, 'mp');
      escribir(muro.plano, 'filter', desenfoque > 0.3 ? 'blur(' + desenfoque.toFixed(1) + 'px)' : 'none', memoria, 'mf');
      escribir(muro.plano, 'opacity', (1 - l * 0.85).toFixed(3), memoria, 'mo');
      escribir(muro.foco, 'opacity', enfoque.toFixed(3), memoria, 'fo');

      // El plano de foco recorre las filas de la hoja con el scroll; el lápiz marca una toma.
      const altoPlano = w * (HOJA.alto * 2 / HOJA.ancho);
      const altoFila = altoPlano * (252 / (HOJA.alto * 2));
      const filaF = mezcla(0.4, 6.6, suave(tramo(q, 0.2, 0.8)));
      const banda = altoPlano * 0.3;
      const yb = filaF * altoFila + altoFila * 0.55 - banda / 2;
      escribir(muro.foco, 'transform', 'translate3d(0,' + yb.toFixed(1) + 'px,0)', memoria, 'ft');
      escribir(muro.nitido, 'transform', 'translate3d(0,' + (-yb).toFixed(1) + 'px,0)', memoria, 'nt');
      const fila = Math.floor(filaF + 0.5);
      if (fila !== muro.fila) {
        muro.fila = fila;
        const i = (fila % 4) + ((fila * 3 + 1) % 4) * 4;
        const { x, y: yt } = toma(i);
        const lx = (x - 12) / HOJA.ancho * w;
        const ly = (yt + (fila >= 4 ? HOJA.alto : 0) - 12) / (HOJA.alto * 2) * altoPlano;
        escribir(muro.lapiz, 'transform', 'translate3d(' + lx.toFixed(1) + 'px,' + ly.toFixed(1) + 'px,0)', memoria, 'lt');
      }
      const trazo = enfoque * sujetar((filaF + 0.5 - fila + 0.5) * 1.6, 0, 1);
      escribir(muro.trazo, 'strokeDashoffset', (1 - trazo).toFixed(3), memoria, 'ld');

      // La cabecera queda fija sobre el muro; el título se pega al plano cuando gira y regresa volando.
      if (muro.titulo) {
        const separado = muro.cabeza !== muro.titulo;
        const arribaSec = medidas.proyectos - y;
        const deseado = Math.max(arribaSec, 0) + alto * 0.3;
        const natural = medidas.tituloMuro - y;
        const fijo = Math.min(0, deseado - natural);
        // k sube mientras se pega al plano y baja con freno al regresar: el camino es continuo.
        const pega = tramo(q, 0.72, 0.8);
        const vuelve = tramo(q, 0.8, 0.885);
        const k = pega * (1 - salidaExpo(vuelve));
        const gx = 0;
        const gy = -k * alto * 0.16;
        // El desenfoque de movimiento sale de cuánto se movió desde el cuadro anterior.
        const paso = muro.tx === undefined ? 0 : Math.hypot(gx - muro.tx, gy - muro.ty);
        muro.tx = gx;
        muro.ty = gy;
        const borr = Math.min(10, paso * 0.35);
        if (separado) escribir(muro.cabeza, 'transform', fijo === 0 ? '' : 'translate3d(0,' + fijo.toFixed(1) + 'px,0)', memoria, 'ct');
        const sube = separado ? 0 : fijo;
        const v = 'translate3d(' + gx.toFixed(1) + 'px,' + (sube + gy).toFixed(1) + 'px,0) perspective(900px) rotateX(' + (k * 30).toFixed(2) + 'deg) rotateZ(' + (k * -6).toFixed(2) + 'deg) scale(' + (1 - k * 0.4).toFixed(4) + ')';
        const enReposo = sube === 0 && k < 0.002 && borr < 0.3;
        escribir(muro.titulo, 'transform', enReposo ? '' : v, memoria, 'tt');
        escribir(muro.titulo, 'filter', borr > 0.3 ? 'blur(' + borr.toFixed(1) + 'px)' : '', memoria, 'tf');
      }
    }

    // Los títulos de sección llegan volando desde el fondo: crecen hasta su tamaño y se enderezan.
    // Nunca salen del borde: la escala no pasa de 1 y el giro es chico. El desenfoque sale de la
    // velocidad, no del tiempo.
    function cuadroTitulos(y, alto) {
      for (let i = 0; i < titulos.length; i++) {
        const el = titulos[i];
        const est = estadoTitulos[i];
        const arriba = medidas.titulos[i] - y;
        const p = tramo(alto * 0.98 - arriba, 0, alto * 0.42);
        const e = salidaExpo(p);
        const vel = est.e < 0 ? 0 : Math.abs(e - est.e);
        est.e = e;
        if (arriba > alto * 1.2 || arriba < -alto) continue;
        const resto = 1 - e;
        const borr = Math.min(10, vel * 90);
        const v = resto < 0.002 && borr < 0.3 ? '' :
          'rotateZ(' + (resto * -8).toFixed(2) + 'deg) scale(' + (0.55 + 0.45 * e).toFixed(4) + ')';
        if (v !== est.texto) { est.texto = v; tocarEstilo(el).transform = v; }
        const f = borr > 0.3 ? 'blur(' + borr.toFixed(1) + 'px)' : '';
        if (f !== est.filtro) { est.filtro = f; tocarEstilo(el).filter = f; }
      }
    }

    // Las tarjetas llegan desde atrás, fuera de foco, y se asientan al subir.
    function cuadroTarjetas(y, alto) {
      for (let i = 0; i < tarjetas.length; i++) {
        const arriba = medidas.tarjetas[i] - y;
        if (arriba > alto * 1.2 || arriba < -alto * 2) continue;
        const p = tramo(alto * 1.02 - arriba, 0, alto * 0.5);
        const e = salidaCubica(p);
        const resto = 1 - e;
        const est = estadoTarjetas[i];
        const v = resto < 0.002 ? '' : 'perspective(1000px) translate3d(0,' + (resto * 60).toFixed(1) + 'px,' + (-resto * 260).toFixed(1) + 'px) rotateX(' + (resto * 16).toFixed(2) + 'deg)';
        if (v !== est.texto) { est.texto = v; tocarEstilo(tarjetas[i]).transform = v; }
        const f = resto > 0.04 ? 'blur(' + (resto * 6).toFixed(1) + 'px)' : '';
        if (f !== est.filtro) { est.filtro = f; tocarEstilo(tarjetas[i]).filter = f; }
      }
    }

    // Carteles verticales: llegan de la derecha girados en Y, se enderezan y la fila deriva.
    function cuadroCierre(y, t, alto) {
      const arriba = medidas.contacto - y;
      if (arriba > alto * 1.3 || arriba < -alto * 1.5) return;
      const base = tramo(alto * 1.05 - arriba, 0, alto * 0.8);
      const deriva = cierre.ancho ? -((t * 18 + y * 0.15) % cierre.ancho) : 0;
      escribir(cierre.fila, 'transform', 'translate3d(' + deriva.toFixed(1) + 'px,0,0)', memoria, 'cf');
      for (let i = 0; i < cierre.reels.length; i++) {
        const p = tramo(base, Math.min(i, 5) * 0.08, Math.min(i, 5) * 0.08 + 0.5);
        const e = salidaExpo(p);
        const resto = 1 - e;
        const v = 'translate3d(' + (resto * medidas.ancho * 0.7).toFixed(1) + 'px,0,0) rotateY(' + (resto * -58).toFixed(2) + 'deg)';
        escribir(cierre.reels[i], 'transform', v, memoria, 'r' + i);
        escribir(cierre.reels[i], 'filter', resto > 0.04 ? 'brightness(0.62) blur(' + (resto * 7).toFixed(1) + 'px)' : 'brightness(0.62)', memoria, 'rf' + i);
      }
    }

    rafId = ventana.requestAnimationFrame(cuadro);
    limpiar.push(() => { if (rafId) ventana.cancelAnimationFrame(rafId); rafId = 0; });

    if (ctx && typeof ctx.al === 'function') {
      const quitar = ctx.al('cambia-seccion', () => { pendienteMedir = true; });
      if (typeof quitar === 'function') limpiar.push(quitar);
    }

    return function desmontar() {
      vivo = false;
      terminar();
    };

    function terminar() {
      while (limpiar.length) limpiar.pop()();
      for (const [el, original] of estilosOriginales) {
        if (original === null) el.removeAttribute('style');
        else el.setAttribute('style', original);
      }
      estilosOriginales.clear();
      html.classList.remove('c-vivo', 'c-quieto', 'c-entra');
      if (html.getAttribute('class') === '') html.removeAttribute('class');
    }
  },
};

// Borde rasgado: puntos con desplazamientos de 0 a 5 px alrededor del recorte.
function rasgado(semilla, pasos) {
  let s = semilla >>> 0;
  const azar = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const px = () => (1 + azar() * 4.5).toFixed(1) + 'px';
  const puntos = [];
  for (let i = 0; i <= pasos; i++) puntos.push((i / pasos * 100).toFixed(1) + '% ' + px());
  puntos.push('calc(100% - ' + px() + ') 35%', 'calc(100% - ' + px() + ') 68%');
  for (let i = pasos; i >= 0; i--) puntos.push((i / pasos * 100).toFixed(1) + '% calc(100% - ' + px() + ')');
  puntos.push(px() + ' 66%', px() + ' 33%');
  return 'polygon(' + puntos.join(', ') + ')';
}

// Escena WebGL: seis tarjetas extruidas con la captura real al frente, una con degradado que
// cambia de color y otra con marco de neón. Three.js se descarga aquí, no antes. Las tarjetas
// ocupan los mismos lugares que las fichas en CSS, así que tampoco se enciman.
async function iniciarTablero(tablero, doc, ventana, sigueVivo) {
  // Sin WebGL en el navegador se quedan las fichas en CSS.
  if (!ventana.WebGLRenderingContext) return null;
  const T = await import(r('three-min.js'));
  if (!sigueVivo()) return null;
  // La misma captura que eligió srcset para este tamaño y esta densidad, pero cargada sin
  // srcset: así la textura sube con todos sus píxeles (sale del caché, sin bytes extra).
  const fichasImg = tablero.fichas.map((f) => f.querySelector('img'));
  await Promise.all(fichasImg.map((im) => (im ? im.decode().then(() => true, () => false) : true)));
  const fotos = fichasImg.map((im) => {
    if (!im) return null;
    const foto = new ventana.Image();
    foto.decoding = 'async';
    foto.src = im.currentSrc || im.src;
    return foto;
  });
  const listas = await Promise.all(fotos.map((f) => (f ? f.decode().then(() => true, () => false) : true)));
  if (listas.includes(false) || !sigueVivo()) return null;

  const lienzo = doc.createElement('canvas');
  lienzo.setAttribute('aria-hidden', 'true');
  lienzo.setAttribute('data-collage', '');
  let render;
  try {
    render = new T.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (error) {
    // Sin WebGL se quedan las fichas en CSS, que ya están puestas.
    lienzo.remove();
    return null;
  }
  render.outputColorSpace = T.SRGBColorSpace;
  render.setClearColor(0x000000, 0);
  const anisotropia = render.capabilities.getMaxAnisotropy();

  const escena = new T.Scene();
  const CAMPO = 34, DISTANCIA = 7;
  const camara = new T.PerspectiveCamera(CAMPO, 1, 0.1, 60);
  escena.add(new T.AmbientLight(0x9aa6e0, 1.1));
  const llave = new T.DirectionalLight(0xfff1dc, 2.2);
  llave.position.set(3, 4, 6);
  escena.add(llave);
  const borde = new T.PointLight(0x5b78ff, 40, 14, 2);
  escena.add(borde);

  const liberables = [];
  const guardar = (x) => { liberables.push(x); return x; };

  const ANCHO = 1.1, ALTO = ANCHO / PROPORCION, RADIO = 0.1, GROSOR = 0.12, BISEL = 0.03, MARCO = 0.05;
  const forma = (w, h, rr) => {
    const s = new T.Shape();
    const x = -w / 2, y = -h / 2;
    s.moveTo(x + rr, y);
    s.lineTo(x + w - rr, y); s.quadraticCurveTo(x + w, y, x + w, y + rr);
    s.lineTo(x + w, y + h - rr); s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    s.lineTo(x + rr, y + h); s.quadraticCurveTo(x, y + h, x, y + h - rr);
    s.lineTo(x, y + rr); s.quadraticCurveTo(x, y, x + rr, y);
    return s;
  };
  const cuerpo = guardar(new T.ExtrudeGeometry(forma(ANCHO, ALTO, RADIO), { depth: GROSOR, bevelEnabled: true, bevelThickness: BISEL, bevelSize: BISEL, bevelSegments: 3, curveSegments: 6 }));
  cuerpo.translate(0, 0, -GROSOR);
  const tapa = guardar(new T.MeshPhongMaterial({ color: 0x151827, specular: 0x333a66, shininess: 40 }));
  const canto = guardar(new T.MeshPhongMaterial({ color: 0x1b2038, specular: 0x9aabff, shininess: 90 }));

  // Frente recortado al centro de la imagen, igual que object-fit: cover en las fichas CSS.
  const frente = (u0, u1, v0, v1) => {
    const g = guardar(new T.ShapeGeometry(forma(ANCHO, ALTO, RADIO), 8));
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    for (let k = 0; k < pos.count; k++) {
      const u = (pos.getX(k) + ANCHO / 2) / ANCHO;
      const v = (pos.getY(k) + ALTO / 2) / ALTO;
      uv.setXY(k, u0 + u * (u1 - u0), v0 + v * (v1 - v0));
    }
    uv.needsUpdate = true;
    g.translate(0, 0, BISEL + 0.002);
    return g;
  };
  const degradado = guardar(new T.ShaderMaterial({
    uniforms: { t: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: [
      'uniform float t; varying vec2 vUv;',
      'vec3 lima = vec3(0.776,0.957,0.196); vec3 coral = vec3(1.0,0.478,0.361); vec3 cobalto = vec3(0.357,0.471,1.0);',
      'vec3 ciclo(float h){ h = fract(h) * 3.0; if (h < 1.0) return mix(lima, coral, smoothstep(0.0,1.0,h)); if (h < 2.0) return mix(coral, cobalto, smoothstep(1.0,2.0,h)); return mix(cobalto, lima, smoothstep(2.0,3.0,h)); }',
      'void main(){ float o = sin(vUv.x * 3.0 + t * 0.7) * 0.08 + sin(vUv.y * 4.0 - t * 0.5) * 0.06;',
      ' vec3 c = ciclo(vUv.y * 0.55 + vUv.x * 0.3 + o + t * 0.06);',
      ' float brillo = smoothstep(0.35, 0.0, abs(vUv.x - fract(t * 0.12) * 1.6 + 0.3)) * 0.18;',
      ' gl_FragColor = vec4(c + brillo, 1.0); }',
    ].join('\n'),
  }));
  const neon = guardar(new T.MeshBasicMaterial({ color: 0x9aabff }));
  const marcoForma = forma(ANCHO + MARCO * 2, ALTO + MARCO * 2, RADIO + 0.05);
  marcoForma.holes.push(forma(ANCHO + 0.02, ALTO + 0.02, RADIO + 0.01));
  const marco = guardar(new T.ShapeGeometry(marcoForma, 6));
  marco.translate(0, 0, BISEL + 0.004);
  // Halo del neón: un degradado radial dibujado una vez en un lienzo, sumado a la escena.
  const halo = doc.createElement('canvas');
  halo.width = halo.height = 128;
  const h2d = halo.getContext('2d');
  const grad = h2d.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, 'rgba(91,120,255,0.85)');
  grad.addColorStop(0.45, 'rgba(91,120,255,0.28)');
  grad.addColorStop(1, 'rgba(91,120,255,0)');
  h2d.fillStyle = grad;
  h2d.fillRect(0, 0, 128, 128);
  const haloTex = guardar(new T.CanvasTexture(halo));
  const haloMat = guardar(new T.MeshBasicMaterial({ map: haloTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
  const haloGeo = guardar(new T.PlaneGeometry(ANCHO * 1.9, ALTO * 1.7));

  // Giros chicos y profundidades casi iguales: dan volumen sin que una tape a otra.
  const giros = [[0.05, 0.22, -0.03], [-0.06, -0.18, 0.03], [0.04, 0.16, 0.02], [-0.05, -0.2, -0.02], [0.06, 0.18, 0.03], [-0.04, -0.16, -0.03]];
  const fondos = [0.1, -0.12, 0.05, -0.08, 0.12, -0.06];
  const tarjetas = FICHAS.map((nombre, i) => {
    const pieza = new T.Group();
    pieza.add(new T.Mesh(cuerpo, [tapa, canto]));
    let fuente = 0;
    if (nombre === '') {
      pieza.add(new T.Mesh(frente(0, 1, 0, 1), degradado));
    } else {
      const im = fotos[i];
      const tex = guardar(new T.Texture(im));
      tex.colorSpace = T.SRGBColorSpace;
      tex.anisotropy = anisotropia;
      tex.needsUpdate = true;
      const a = im.naturalWidth / im.naturalHeight;
      const corte = a > PROPORCION ? PROPORCION / a : 1;
      const alto = a > PROPORCION ? 1 : a / PROPORCION;
      fuente = im.naturalWidth * corte;
      pieza.add(new T.Mesh(frente((1 - corte) / 2, (1 + corte) / 2, (1 - alto) / 2, (1 + alto) / 2), guardar(new T.MeshBasicMaterial({ map: tex }))));
    }
    if (i === NEON) {
      pieza.add(new T.Mesh(marco, neon));
      const h = new T.Mesh(haloGeo, haloMat);
      h.position.z = -0.2;
      pieza.add(h);
    }
    escena.add(pieza);
    return { pieza, giro: giros[i], fondo: fondos[i], fase: i * 1.7, fuente, neon: i === NEON, x: 0, y: 0, escala: 1 };
  });

  let ancho = 1, alto = 1, porPx = 0.01;
  let filtro = '';
  const esquina = new T.Vector3();
  const cajas = () => {
    const rc = lienzo.getBoundingClientRect();
    return tarjetas.map((c) => {
      const m = c.neon ? MARCO : 0;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        esquina.set(sx * (ANCHO / 2 + m), sy * (ALTO / 2 + m), BISEL).applyMatrix4(c.pieza.matrixWorld).project(camara);
        const px = rc.left + (esquina.x + 1) / 2 * rc.width;
        const py = rc.top + (1 - esquina.y) / 2 * rc.height;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
      // Ancho en pantalla a lo largo del eje de la tarjeta: de su borde izquierdo al derecho.
      const izq = esquina.set(-ANCHO / 2, 0, BISEL).applyMatrix4(c.pieza.matrixWorld).project(camara).clone();
      const der = esquina.set(ANCHO / 2, 0, BISEL).applyMatrix4(c.pieza.matrixWorld).project(camara);
      const ancho = Math.hypot((der.x - izq.x) / 2 * rc.width, (der.y - izq.y) / 2 * rc.height);
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, fuente: c.fuente, ancho };
    });
  };
  // Cajas en pantalla de cada tarjeta y resolución de su imagen, para medir el acomodo.
  lienzo.collageCajas = () => ({ cajas: cajas(), escala: lienzo.width / (lienzo.clientWidth || 1), filtro: lienzo.style.filter });
  return {
    lienzo,
    tamano() {
      const a = tablero.acomodo;
      if (!a) return;
      ancho = a.W;
      alto = a.H;
      // Resolución del lienzo: la densidad real de la pantalla, con un tope de píxeles.
      const densidad = Math.min(ventana.devicePixelRatio || 1, 3, Math.sqrt(3.2e6 / (ancho * alto)));
      render.setPixelRatio(densidad);
      render.setSize(ancho, alto, false);
      camara.aspect = ancho / alto;
      camara.updateProjectionMatrix();
      // Unidades del mundo por píxel en el plano de las tarjetas, a la distancia de reposo.
      porPx = 2 * DISTANCIA * Math.tan((CAMPO / 2) * Math.PI / 180) / alto;
      tarjetas.forEach((c, i) => {
        const l = a.lugares[i];
        c.x = (l.x - ancho / 2) * porPx;
        c.y = -(l.y - alto / 2) * porPx;
        c.escala = a.ancho * porPx / ANCHO;
        c.vaiven = a.hueco * 0.18 * porPx;
      });
    },
    dibujar(t, p) {
      // p va de 0 (la sección asoma) a 1 (ya pasó). La cámara llega desde lejos y luego se
      // queda a su distancia de reposo, con un vaivén leve que mueve a todas por igual.
      const llegada = salidaCubica(tramo(p, 0.05, 0.42));
      const cy = (0.5 - p) * alto * 0.03 * porPx;
      camara.position.set(Math.sin(t * 0.17) * 6 * porPx, cy, DISTANCIA + (1 - llegada) * 7);
      camara.lookAt(Math.sin(t * 0.17) * 6 * porPx, cy, 0);
      borde.position.set(Math.cos(t * 0.5) * 3, Math.sin(t * 0.4) * 2, 2.5);
      degradado.uniforms.t.value = t;
      for (const c of tarjetas) {
        const g = c.giro;
        c.pieza.position.set(c.x, c.y + Math.sin(t * 0.6 + c.fase) * c.vaiven, c.fondo * c.escala);
        c.pieza.rotation.set(g[0] + Math.sin(t * 0.4 + c.fase) * 0.04, g[1] + Math.sin(t * 0.3 + c.fase) * 0.08, g[2]);
        c.pieza.scale.setScalar(c.escala);
      }
      // Profundidad de campo solo en la llegada: en reposo el lienzo no lleva desenfoque.
      const d = (1 - llegada) * 9;
      const f = d > 0.3 ? 'blur(' + d.toFixed(1) + 'px)' : '';
      if (f !== filtro) { filtro = f; lienzo.style.filter = f; }
      render.render(escena, camara);
    },
    liberar() {
      for (const x of liberables) x.dispose();
      render.dispose();
      render.forceContextLoss();
      delete lienzo.collageCajas;
      lienzo.remove();
    },
  };
}
