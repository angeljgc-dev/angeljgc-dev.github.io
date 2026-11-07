// Estilo "vuelo". La portada es el costado de la cabina de un avión con su ventanilla; al bajar,
// la cortinilla sube y la cámara se
// acerca, atraviesa el vidrio y vuela entre las nubes. Es una secuencia de cuadros renderizados
// que se dibuja en un lienzo fijo según el avance del desplazamiento.
//
// Carga: solo se piden los cuadros que anuncia recursos/cuadros.json, que escribe el empaquetado
// cuando una versión está completa; sin él, o sin la versión que toca, queda el fondo propio de
// la hoja y no se pide nada. El primer cuadro se pone como fondo en cuanto se sabe que existe.
// Después de la carga de la página se piden los demás, primero uno de cada ocho y luego se
// rellenan los huecos. Si
// el visitante llega a un cuadro que todavía no está, se dibuja el más cercano que ya llegó.
// Los cuadros se guardan comprimidos y se decodifican fuera del hilo principal, unos cuantos
// alrededor del que se ve; los que quedan lejos se sueltan.

const VERSIONES = {
  escritorio: { decodificados: 12 },
  movil: { decodificados: 12 },
};
const PEDIDOS_A_LA_VEZ = 4;
// Del avance del desplazamiento al tiempo de la animación. Pegada al vidrio la cámara casi no
// cambia lo que ve (solo cruza unos centímetros): ese tramo se recorre rápido.
const TRAMOS = [[0, 0], [0.4, 0.405], [0.42, 0.513], [1, 1]];
function tiempoDe(p) {
  for (let i = 1; i < TRAMOS.length; i++) {
    const [p0, t0] = TRAMOS[i - 1];
    const [p1, t1] = TRAMOS[i];
    if (p <= p1) return t0 + ((p - p0) / (p1 - p0)) * (t1 - t0);
  }
  return 1;
}
// Teléfonos y tabletas en vertical usan la versión vertical de la secuencia.
const CONSULTA_MOVIL = '(orientation: portrait) and (max-width: 1023px)';

function suave(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Uno de cada ocho, luego de cada cuatro, de cada dos y el resto. El último va con los primeros.
function ordenDeCarga(n) {
  const orden = [];
  const vistos = new Set();
  const poner = (i) => { if (i >= 0 && i < n && !vistos.has(i)) { vistos.add(i); orden.push(i); } };
  for (let i = 0; i < n; i += 8) poner(i);
  poner(n - 1);
  for (const paso of [4, 2, 1]) for (let i = 0; i < n; i += paso) poner(i);
  return orden;
}

export default {
  id: 'vuelo',
  nombre: 'Vuelo',

  async montar(ctx = {}) {
    const doc = ctx.raiz && ctx.raiz.documentElement ? ctx.raiz : document;
    const ventana = doc.defaultView || window;
    const raiz = doc.documentElement;
    const reducido = typeof ctx.reducido === 'boolean'
      ? ctx.reducido
      : !!ventana.matchMedia && ventana.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const limpiezas = [];
    let vivo = true;
    let idCuadro = 0;

    function escuchar(objeto, tipo, f, opciones) {
      objeto.addEventListener(tipo, f, opciones);
      limpiezas.push(() => objeto.removeEventListener(tipo, f, opciones));
    }
    const atributosRaiz = new Map();
    function marcarRaiz(nombre, valor) {
      if (!atributosRaiz.has(nombre)) atributosRaiz.set(nombre, raiz.getAttribute(nombre));
      if (valor === null) raiz.removeAttribute(nombre);
      else if (raiz.getAttribute(nombre) !== valor) raiz.setAttribute(nombre, valor);
    }
    const variables = new Set();
    function variable(nombre, valor) {
      variables.add(nombre);
      raiz.style.setProperty(nombre, valor);
    }
    const clases = new Set();
    function clase(nombre, poner) {
      if (poner) { clases.add(nombre); raiz.classList.add(nombre); } else raiz.classList.remove(nombre);
    }
    function crear(etiqueta, nombre, padre, antes) {
      const n = doc.createElement(etiqueta);
      n.className = nombre;
      n.setAttribute('data-vuelo', '');
      n.setAttribute('aria-hidden', 'true');
      if (antes) padre.insertBefore(n, antes);
      else padre.appendChild(n);
      limpiezas.push(() => n.remove());
      return n;
    }
    function quitarTodo() {
      vivo = false;
      if (idCuadro) ventana.cancelAnimationFrame(idCuadro);
      idCuadro = 0;
      // Cada limpieza es independiente: si una falla se siguen las demás y el error se avisa al final.
      let primerError = null;
      while (limpiezas.length) {
        try { limpiezas.pop()(); } catch (e) { if (!primerError) primerError = e; }
      }
      variables.forEach((n) => raiz.style.removeProperty(n));
      if (!raiz.getAttribute('style')) raiz.removeAttribute('style');
      clases.forEach((n) => raiz.classList.remove(n));
      atributosRaiz.forEach((valor, nombre) => {
        if (valor === null) raiz.removeAttribute(nombre);
        else raiz.setAttribute(nombre, valor);
      });
      if (primerError) throw primerError;
    }

    try {
      // Qué versiones de la secuencia están publicadas y con cuántos cuadros.
      // Si tarda más de 2.5 s, el estilo sigue con su fondo propio y no detiene al selector.
      let manifiesto = {};
      const corte = new AbortController();
      const reloj = ventana.setTimeout(() => corte.abort(), 2500);
      try {
        const r = await ventana.fetch(new URL('./recursos/cuadros.json', import.meta.url).href, { cache: 'no-cache', signal: corte.signal });
        if (r.ok) manifiesto = await r.json();
      } catch (e) {
        manifiesto = {};
      } finally {
        ventana.clearTimeout(reloj);
      }
      if (!vivo) return quitarTodo;
      const publicada = (id) => !!(manifiesto && manifiesto[id] && manifiesto[id].cuadros > 1);
      const consulta = ventana.matchMedia ? ventana.matchMedia(CONSULTA_MOVIL) : null;
      const idActual = () => (consulta && consulta.matches ? 'movil' : 'escritorio');
      const inicio = doc.querySelector('[data-seccion="presentacion"]');
      crear('div', 'vuelo-altura', doc.body, doc.body.firstChild);

      // Qué tan alto va la página después de la presentación: el velo de la noche sube.
      const medidas = { finRecorrido: 1, finPagina: 1 };
      function medir() {
        const alto = ventana.innerHeight;
        const fin = inicio ? inicio.getBoundingClientRect().bottom + ventana.scrollY : alto * 3;
        medidas.finRecorrido = Math.max(1, fin - alto);
        medidas.finPagina = Math.max(medidas.finRecorrido + 1, raiz.scrollHeight - alto);
      }
      function actualizarAltura(y) {
        const a = suave(medidas.finRecorrido, medidas.finPagina, y);
        variable('--vuelo-altura', (0.88 * a).toFixed(3));
      }
      medir();

      if (reducido) {
        // Sin recorrido: el último cuadro fijo detrás de todo y cero llamadas de cuadro.
        marcarRaiz('data-vuelo-modo', 'fijo');
        const ponerFijo = () => marcarRaiz('data-vuelo-portada', publicada(idActual()) ? idActual() + '-final' : null);
        ponerFijo();
        if (consulta && consulta.addEventListener) escuchar(consulta, 'change', ponerFijo);
        escuchar(ventana, 'scroll', () => actualizarAltura(ventana.scrollY), { passive: true });
        escuchar(ventana, 'resize', () => { medir(); actualizarAltura(ventana.scrollY); }, { passive: true });
        actualizarAltura(ventana.scrollY);
        return quitarTodo;
      }

      marcarRaiz('data-vuelo-modo', 'viaje');
      const lienzo = crear('canvas', 'vuelo-cielo', doc.body, doc.body.firstChild);
      const pincel = lienzo.getContext('2d', { alpha: false });
      crear('div', 'vuelo-cortina', doc.body);

      // ---------- la entrada: se encienden las luces de la cabina ----------
      clase('vuelo-entra', true);
      if (!ctx.primeraVez || raiz.classList.contains('entrada-corta')) clase('vuelo-entra-corta', true);
      const terminarEntrada = () => {
        clase('vuelo-entra', false);
        clase('vuelo-entra-corta', false);
      };
      const finEntrada = ventana.setTimeout(terminarEntrada, raiz.classList.contains('vuelo-entra-corta') ? 900 : 1800);
      limpiezas.push(() => ventana.clearTimeout(finEntrada));
      // Un clic, una tecla o el desplazamiento la terminan al instante.
      const saltar = () => terminarEntrada();
      escuchar(ventana, 'pointerdown', saltar, { passive: true });
      escuchar(ventana, 'keydown', saltar);
      escuchar(ventana, 'wheel', saltar, { passive: true });
      escuchar(ventana, 'touchstart', saltar, { passive: true });

      // ---------- los cuadros ----------
      let version = null;
      let total = 0;
      let datos = [];
      const imagenes = new Map();
      const decodificando = new Set();
      let cola = [];
      let enVuelo = 0;
      let controlador = null;
      let ultimoDibujado = -1;
      let mezclaDibujada = -1;
      let cargados = 0;

      function rutaCuadro(i) {
        return new URL('./recursos/' + version.id + '/' + String(i + 1).padStart(3, '0') + '.webp', import.meta.url).href;
      }
      function soltarImagenes() {
        imagenes.forEach((img) => { if (img && img.close) img.close(); });
        imagenes.clear();
        decodificando.clear();
      }
      function elegirVersion() {
        const id = idActual();
        if (version && version.id === id) return;
        if (controlador) controlador.abort();
        soltarImagenes();
        const hay = publicada(id);
        version = { ...VERSIONES[id], id, cuadros: hay ? Math.floor(manifiesto[id].cuadros) : 0 };
        marcarRaiz('data-vuelo-version', id);
        // La portada como fondo, solo si esa versión existe.
        marcarRaiz('data-vuelo-portada', hay ? id : null);
        lienzo.classList.remove('encendido');
        total = version.cuadros;
        datos = new Array(total).fill(null);
        cola = total ? ordenDeCarga(total) : [];
        enVuelo = 0;
        ultimoDibujado = -1;
        mezclaDibujada = -1;
        cargados = 0;
        lienzo.dataset.total = String(total);
        lienzo.dataset.cargados = '0';
        controlador = new AbortController();
        if (cargando) for (let k = 0; k < PEDIDOS_A_LA_VEZ; k++) pedirSiguiente();
      }
      let cargando = false;
      function pedirSiguiente() {
        if (!vivo || !cola.length) return;
        const i = cola.shift();
        const senal = controlador.signal;
        const v = version;
        enVuelo++;
        ventana.fetch(rutaCuadro(i), { signal: senal })
          .then((r) => (r.ok ? r.blob() : null))
          .then((blob) => {
            if (!vivo || v !== version || !blob) return;
            datos[i] = blob;
            cargados++;
            lienzo.dataset.cargados = String(cargados);
            pedirDibujo();
          })
          .catch(() => null)
          .finally(() => {
            if (v !== version) return;
            enVuelo--;
            pedirSiguiente();
          });
      }
      function empezarCarga() {
        if (!vivo || cargando) return;
        cargando = true;
        for (let k = 0; k < PEDIDOS_A_LA_VEZ; k++) pedirSiguiente();
      }
      limpiezas.push(() => { if (controlador) controlador.abort(); soltarImagenes(); });

      function decodificar(i) {
        if (!datos[i] || imagenes.has(i) || decodificando.has(i)) return;
        decodificando.add(i);
        const v = version;
        ventana.createImageBitmap(datos[i]).then((bmp) => {
          if (!vivo || v !== version) { bmp.close(); return; }
          decodificando.delete(i);
          imagenes.set(i, bmp);
          // Solo se guardan unos cuantos decodificados: los más lejanos al cuadro visto se sueltan.
          if (imagenes.size > version.decodificados) {
            const lejos = [...imagenes.keys()].sort((a, b) => Math.abs(b - objetivo) - Math.abs(a - objetivo));
            for (const k of lejos.slice(0, imagenes.size - version.decodificados)) {
              if (k === ultimoDibujado || k === mezclaDibujada) continue;
              imagenes.get(k).close();
              imagenes.delete(k);
            }
          }
          pedirDibujo();
        }, () => decodificando.delete(i));
      }
      // El cuadro descargado más cercano al que toca.
      function cercano(i) {
        for (let d = 0; d < total; d++) {
          if (i - d >= 0 && datos[i - d]) return i - d;
          if (i + d < total && datos[i + d]) return i + d;
        }
        return -1;
      }

      // ---------- el lienzo ----------
      const tam = { w: 1, h: 1, ancho: 1, alto: 1 };
      function ajustarLienzo() {
        const dpr = Math.min(2, ventana.devicePixelRatio || 1);
        tam.ancho = ventana.innerWidth;
        tam.alto = ventana.innerHeight;
        // Nunca más píxeles que los del cuadro: el lienzo no gana nada con escalar hacia arriba.
        const tope = version && version.id === 'movil' ? 1500 / tam.alto : 1080 / tam.alto;
        const escala = Math.min(dpr, Math.max(0.5, tope));
        const w = Math.max(1, Math.round(tam.ancho * escala));
        const h = Math.max(1, Math.round(tam.alto * escala));
        if (lienzo.width !== w || lienzo.height !== h) {
          lienzo.width = w;
          lienzo.height = h;
          ultimoDibujado = -1;
        }
        tam.w = w;
        tam.h = h;
      }
      function pintar(img, alfa) {
        // Como background-size: cover, centrado.
        const iw = img.width;
        const ih = img.height;
        const k = Math.max(tam.w / iw, tam.h / ih);
        const sw = tam.w / k;
        const sh = tam.h / k;
        pincel.globalAlpha = alfa;
        pincel.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, tam.w, tam.h);
      }

      let objetivo = 0;
      function avance() {
        return Math.min(1, Math.max(0, ventana.scrollY / medidas.finRecorrido));
      }
      function actualizarPortada(p) {
        // El texto de la portada crece con el acercamiento y se va antes del cruce.
        const acerca = suave(0.0, 0.4, p);
        const salida = suave(0.05, 0.28, p);
        variable('--vuelo-acerca', (acerca * acerca).toFixed(4));
        variable('--vuelo-salida', salida.toFixed(4));
        clase('vuelo-cruzado', salida > 0.995);
      }
      function cuadro() {
        idCuadro = 0;
        if (!vivo) return;
        if (!total) {
          actualizarPortada(avance());
          actualizarAltura(ventana.scrollY);
          return;
        }
        const y = ventana.scrollY;
        const p = avance();
        actualizarPortada(p);
        actualizarAltura(y);
        const f = tiempoDe(p) * (total - 1);
        const i0 = Math.floor(f);
        const i1 = Math.min(total - 1, i0 + 1);
        const t = f - i0;
        objetivo = Math.round(f);
        // Los vecinos se adelantan: el que sigue en la dirección del desplazamiento.
        for (const k of [i0, i1, i1 + 1, i0 - 1]) if (k >= 0 && k < total) decodificar(k);
        let a = imagenes.has(i0) ? i0 : -1;
        let b = imagenes.has(i1) ? i1 : -1;
        if (a < 0 && b < 0) {
          const c = cercano(objetivo);
          if (c >= 0) {
            decodificar(c);
            if (imagenes.has(c)) a = c;
          }
        }
        if (a < 0 && b >= 0) { a = b; b = -1; }
        if (a < 0) return;
        const mezcla = b >= 0 && b !== a && t > 0.02 ? b : -1;
        const clave = a + ':' + mezcla + ':' + (mezcla >= 0 ? t.toFixed(2) : '');
        if (clave === pintar.ultimaClave && lienzo.width === tam.w) return;
        pintar.ultimaClave = clave;
        pintar(imagenes.get(a), 1);
        if (mezcla >= 0) pintar(imagenes.get(mezcla), t);
        pincel.globalAlpha = 1;
        ultimoDibujado = a;
        lienzo.dataset.cuadro = String(mezcla >= 0 && t >= 0.5 ? mezcla : a);
        mezclaDibujada = mezcla;
        if (!lienzo.classList.contains('encendido')) lienzo.classList.add('encendido');
      }
      function pedirDibujo() {
        if (!idCuadro && vivo && !doc.hidden) idCuadro = ventana.requestAnimationFrame(cuadro);
      }

      elegirVersion();
      ajustarLienzo();
      escuchar(ventana, 'scroll', pedirDibujo, { passive: true });
      escuchar(ventana, 'resize', () => {
        elegirVersion();
        ajustarLienzo();
        medir();
        pintar.ultimaClave = '';
        pedirDibujo();
      }, { passive: true });
      escuchar(doc, 'visibilitychange', () => { if (!doc.hidden) pedirDibujo(); });
      if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(() => { if (vivo) { medir(); pedirDibujo(); } }, () => null);

      // El primer cuadro va primero en la cola (es el mismo de la portada, viene de la caché); el
      // resto, cuando la página terminó de cargar, para no competir con lo que se ve primero.
      const arrancar = () => {
        if (!vivo) return;
        if (ventana.requestIdleCallback) {
          const id = ventana.requestIdleCallback(empezarCarga, { timeout: 800 });
          limpiezas.push(() => ventana.cancelIdleCallback(id));
        } else {
          const id = ventana.setTimeout(empezarCarga, 200);
          limpiezas.push(() => ventana.clearTimeout(id));
        }
      };
      if (doc.readyState === 'complete') arrancar();
      else escuchar(ventana, 'load', arrancar, { once: true });
      pedirDibujo();

      limpiezas.push(() => {
        // El lienzo se suelta: sin píxeles retenidos.
        lienzo.width = 0;
        lienzo.height = 0;
      });
      return quitarTodo;
    } catch (error) {
      quitarTodo();
      throw error;
    }
  },
};
