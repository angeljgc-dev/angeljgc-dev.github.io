// Estilo "gafete": un cuarto oscuro y una credencial colgada de su cinta. La credencial cae al
// entrar, se mece, se agarra con el dedo o el ratón y se puede aventar. La cinta es una cuerda
// de Verlet: puntos unidos por distancias fijas, con gravedad e inercia, resuelta a paso fijo
// para que se mueva igual a 60 que a 120 cuadros por segundo.
//
// El contenido no se toca: la credencial es una capa decorativa encima, y los bloques de la
// página solo cambian cómo entran a cuadro (de desenfocados a nítidos, en cascada).

const PASO = 1 / 120;
const ITERACIONES = 12;
const GRAVEDAD = 5600;
const RETENCION = 0.982;
// Ya lenta, la credencial frena más, como un listón real con roce en el broche: así la cola
// de la oscilación no se arrastra varios segundos.
const RETENCION_LENTA = 0.966;
const PUNTOS_CINTA = 9;
const VEL_MAX = 70;
// Lo más que se estira la cinta respecto a su largo. Es un tope duro: por más que se jale, la
// credencial se queda colgada del cordón y el lienzo siempre alcanza a dibujarlo completo.
const ESTIRAMIENTO = 1.5;
const ORILLA_LIENZO = 28;
const ANCHO_CINTA = 15;
const ENFOQUE = [
  { opacity: 0, filter: 'blur(12px)', transform: 'translateY(16px)' },
  { opacity: 1, filter: 'blur(0px)', transform: 'none' },
];
const CURVA = 'cubic-bezier(0.2, 0.7, 0.2, 1)';

function limitar(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export default {
  id: 'gafete',
  nombre: 'Gafete',

  async montar(ctx = {}) {
    const doc = ctx.raiz && ctx.raiz.nodeType === 9 ? ctx.raiz : document;
    const win = doc.defaultView || window;
    const html = doc.documentElement;
    const reducido = typeof ctx.reducido === 'boolean'
      ? ctx.reducido
      : !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
    // Al llegar desde otro estilo la entrada es corta: la credencial ya está colgada y solo
    // aparece. Al cargar la página cae; si ya se vio en la sesión, desde menos alto.
    const llegaDeOtro = !!ctx.cambio;
    const entradaLarga = ctx.primeraVez !== false && !llegaDeOtro;

    // Todo lo que se agrega queda anotado aquí para poder quitarlo al desmontar.
    const corte = new AbortController();
    const conCorte = { signal: corte.signal };
    const pasivo = { signal: corte.signal, passive: true };
    const animaciones = new Set();
    const estilosOriginales = new Map();
    const observadores = [];
    let cuadro = 0;
    let cuadroDesplazo = 0;
    let vivo = true;

    function guardarEstilo(el) {
      if (!estilosOriginales.has(el)) estilosOriginales.set(el, el.getAttribute('style'));
    }
    function restaurarEstilo(el) {
      if (!estilosOriginales.has(el)) return;
      const antes = estilosOriginales.get(el);
      if (antes === null) {
        // Chrome copia los cambios de el.style al atributo hasta que alguien lo lee; si se
        // quita sin leerlo antes, después reaparece vacío. Leerlo fuerza esa copia.
        el.getAttribute('style');
        el.removeAttribute('style');
      } else {
        el.setAttribute('style', antes);
      }
      estilosOriginales.delete(el);
    }
    function animar(el, cuadros, opciones) {
      const a = el.animate(cuadros, opciones);
      animaciones.add(a);
      const soltar = () => animaciones.delete(a);
      a.finished.then(soltar, soltar);
      return a;
    }

    const secciones = ctx.secciones && ctx.secciones.length
      ? Array.from(ctx.secciones)
      : Array.from(doc.querySelectorAll('[data-seccion], [data-zona]'));
    const nombreDe = (s) => s.getAttribute('data-seccion') || s.getAttribute('data-zona') || '';
    const inicio = secciones.find((s) => /^(presentacion|inicio)$/.test(nombreDe(s)))
      || doc.querySelector('.inicio') || secciones[0];
    if (!inicio) return function desmontar() {};

    if (!reducido) html.setAttribute('data-gf-mov', '');
    else html.setAttribute('data-gf-quieto', '');

    // ---------- La credencial, armada con lo que ya dice la página ----------
    const retrato = inicio.querySelector('.retrato img, figure img, img');
    const titular = inicio.querySelector('h1');
    const cargo = inicio.querySelector('.cargo');
    const github = doc.querySelector('a[href*="github.com/"]');

    const capa = doc.createElement('div');
    capa.className = 'gf-capa';
    capa.setAttribute('data-gafete', '');
    capa.setAttribute('aria-hidden', 'true');
    const lienzo = doc.createElement('canvas');
    lienzo.className = 'gf-cinta';
    const gafete = doc.createElement('div');
    gafete.className = 'gf-gafete';
    const cara = doc.createElement('div');
    cara.className = 'gf-cara';
    const broche = doc.createElement('span');
    broche.className = 'gf-broche';
    const foto = doc.createElement('div');
    foto.className = 'gf-foto';
    const img = doc.createElement('img');
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.src = retrato ? (retrato.currentSrc || retrato.src) : 'img/angel-620.webp';
    foto.appendChild(img);
    const pie = doc.createElement('div');
    pie.className = 'gf-pie';
    if (titular) {
      const renglones = titular.querySelectorAll('span');
      const partes = renglones.length ? Array.from(renglones, (s) => s.textContent.trim()) : [titular.textContent.trim()];
      for (const texto of partes) {
        const linea = doc.createElement('span');
        linea.className = 'gf-nombre';
        linea.textContent = texto;
        pie.appendChild(linea);
      }
    }
    if (cargo) {
      const rol = doc.createElement('span');
      rol.className = 'gf-rol';
      rol.textContent = cargo.textContent.trim();
      pie.appendChild(rol);
    }
    const brillo = doc.createElement('span');
    brillo.className = 'gf-brillo';
    cara.append(foto, pie, brillo);
    gafete.append(cara, broche);
    capa.append(lienzo, gafete);
    doc.body.appendChild(capa);

    // Lo que va impreso en la cinta: el usuario de GitHub que aparece en la página.
    let letrero = '';
    if (github) {
      const m = /github\.com\/([^/?#]+)/i.exec(github.getAttribute('href'));
      if (m) letrero = (m[1] + '   ').toUpperCase();
    }

    // ---------- Estado de la cuerda ----------
    // Puntos 0..N-1: la cinta (el 0 está fijo y el último es el broche).
    // Punto N: el pie de la credencial. Broche y pie forman la credencial rígida.
    const N = PUNTOS_CINTA;
    const M = N + 1;
    const x = new Float64Array(M);
    const y = new Float64Array(M);
    const px = new Float64Array(M);
    const py = new Float64Array(M);
    const inv = new Float64Array(M);
    for (let i = 1; i < N; i++) inv[i] = 1;
    inv[N - 1] = 0.35;
    inv[N] = 0.35;

    let ax = 0;
    let ay = -14;
    let largo = 110;
    let tramo = largo / (N - 1);
    let alto = 280;
    let mitad = 80;
    let giroY = 0;
    let agarre = null;
    let quietos = 0;
    let lenta = false;
    let ultimo = 0;
    let acumulado = 0;
    let lienzoX = 0;
    let lienzoY = 0;
    let lienzoW = 0;
    let lienzoH = 0;
    let dpr = 1;
    let fondoCapa = 0;
    const pincel = lienzo.getContext('2d');

    function medir() {
      const css = win.getComputedStyle(html);
      largo = parseFloat(css.getPropertyValue('--gf-largo')) || 110;
      const fraccion = parseFloat(css.getPropertyValue('--gf-ancla')) || 0.6;
      tramo = largo / (N - 1);
      alto = gafete.offsetHeight || 280;
      mitad = (gafete.offsetWidth || 160) / 2;
      const reja = inicio.querySelector('.inicio-reja') || inicio;
      const r = reja.getBoundingClientRect();
      const cr = win.getComputedStyle(reja);
      const izq = parseFloat(cr.paddingLeft) || 0;
      const der = parseFloat(cr.paddingRight) || 0;
      const nuevoX = r.left + win.scrollX + izq + (r.width - izq - der) * fraccion;
      const ri = inicio.getBoundingClientRect();
      fondoCapa = Math.ceil(ri.bottom + win.scrollY + 160);
      capa.style.height = fondoCapa + 'px';
      // La cinta nace 40 px arriba del borde inferior de la cabecera: asoma por debajo de ella
      // aunque la cabecera cambie de alto en el teléfono.
      const cabecera = doc.querySelector('.cabecera');
      const nuevoY = cabecera ? cabecera.offsetHeight - 40 : -14;
      // El lienzo cubre todo el alcance de la cinta estirada al máximo, en cualquier dirección
      // alrededor del ancla (también hacia arriba, si se jala la credencial por encima): con el
      // tope de estiramiento ningún tramo puede salirse de él.
      const radio = Math.ceil(largo * ESTIRAMIENTO + ORILLA_LIENZO);
      dpr = Math.min(win.devicePixelRatio || 1, 2);
      lienzoX = Math.round(nuevoX - radio);
      lienzoY = Math.round(nuevoY - radio);
      lienzoW = radio * 2;
      lienzoH = radio * 2;
      lienzo.style.transform = `translate(${lienzoX}px, ${lienzoY}px)`;
      lienzo.style.width = lienzoW + 'px';
      lienzo.style.height = lienzoH + 'px';
      lienzo.width = Math.round(lienzoW * dpr);
      lienzo.height = Math.round(lienzoH * dpr);
      return { x: nuevoX, y: nuevoY };
    }

    function colocar(angulo) {
      // Cinta recta desde el ancla en la dirección dada (0 = colgando hacia abajo).
      const sx = Math.sin(angulo);
      const sy = Math.cos(angulo);
      for (let i = 0; i < N; i++) {
        x[i] = px[i] = ax + sx * tramo * i;
        y[i] = py[i] = ay + sy * tramo * i;
      }
      x[N] = px[N] = x[N - 1] + sx * alto;
      y[N] = py[N] = y[N - 1] + sy * alto;
    }

    function restriccion(a, b, distancia, soloMinimo) {
      const dx = x[b] - x[a];
      const dy = y[b] - y[a];
      const d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
      if (soloMinimo && d >= distancia) return;
      const w = inv[a] + inv[b];
      if (!w) return;
      const k = (d - distancia) / (d * w);
      x[a] += dx * k * inv[a];
      y[a] += dy * k * inv[a];
      x[b] -= dx * k * inv[b];
      y[b] -= dy * k * inv[b];
    }

    function paso() {
      const g = GRAVEDAD * PASO * PASO;
      for (let i = 1; i < M; i++) {
        const retencion = lenta && !agarre ? RETENCION_LENTA : RETENCION;
        let vx = (x[i] - px[i]) * retencion;
        let vy = (y[i] - py[i]) * retencion;
        vx = limitar(vx, -VEL_MAX, VEL_MAX);
        vy = limitar(vy, -VEL_MAX, VEL_MAX);
        px[i] = x[i];
        py[i] = y[i];
        x[i] += vx;
        y[i] += vy + g;
      }
      for (let k = 0; k < ITERACIONES; k++) {
        x[0] = ax;
        y[0] = ay;
        for (let i = 0; i < N - 1; i++) restriccion(i, i + 1, tramo, false);
        restriccion(N - 1, N, alto, false);
        // Que la credencial no se doble por encima de la cinta.
        restriccion(N - 2, N, alto * 0.82, true);
      }
      if (agarre) {
        // El punto agarrado persigue al dedo con un poco de retraso: así se siente el peso.
        const t = agarre.t;
        const gx = x[N - 1] + (x[N] - x[N - 1]) * t;
        const gy = y[N - 1] + (y[N] - y[N - 1]) * t;
        let tx = agarre.x;
        let ty = agarre.y;
        const alcance = largo * ESTIRAMIENTO + alto;
        const ddx = tx - ax;
        const ddy = ty - ay;
        const dd = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dd > alcance) {
          tx = ax + (ddx / dd) * alcance;
          ty = ay + (ddy / dd) * alcance;
        }
        const w = (1 - t) * (1 - t) + t * t;
        const fx = (tx - gx) * 0.32 / w;
        const fy = (ty - gy) * 0.32 / w;
        x[N - 1] += fx * (1 - t);
        y[N - 1] += fy * (1 - t);
        x[N] += fx * t;
        y[N] += fy * t;
        // El estirón se reparte a lo largo de la cinta y no en un solo tramo.
        for (let k = 0; k < 3; k++) {
          for (let i = 0; i < N - 1; i++) restriccion(i, i + 1, tramo, false);
        }
      }
      atar();
    }

    // Tope duro: ningún punto de la cinta se aleja del ancla más de lo que permite el
    // estiramiento. Si el broche se pasa, la credencial entera se recorre con él y su velocidad
    // hacia afuera se pierde, como cuando un cordón llega a su límite.
    function atar() {
      for (let i = 1; i < N; i++) {
        const dx = x[i] - ax;
        const dy = y[i] - ay;
        const d = Math.sqrt(dx * dx + dy * dy);
        const limite = tramo * i * ESTIRAMIENTO;
        if (d <= limite || !d) continue;
        const ox = dx - (dx / d) * limite;
        const oy = dy - (dy / d) * limite;
        x[i] -= ox;
        y[i] -= oy;
        if (i === N - 1) {
          x[N] -= ox;
          y[N] -= oy;
        }
      }
    }

    function energia() {
      let e = 0;
      for (let i = 1; i < M; i++) {
        const vx = x[i] - px[i];
        const vy = y[i] - py[i];
        const v = vx * vx + vy * vy;
        if (v > e) e = v;
      }
      return e;
    }

    function pintarCinta() {
      const c = pincel;
      if (!c) return;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, lienzoW, lienzoH);
      const izq = [];
      const der = [];
      const giro = (giroY * Math.PI) / 180 * 2.4;
      const factores = [];
      for (let i = 0; i < N; i++) {
        const a = Math.max(0, i - 1);
        const b = Math.min(N - 1, i + 1);
        let tx = x[b] - x[a];
        let ty = y[b] - y[a];
        const l = Math.sqrt(tx * tx + ty * ty) || 1;
        tx /= l;
        ty /= l;
        // La cinta se tuerce más cerca de la credencial; de canto se ve delgada.
        const f = Math.abs(Math.cos(giro * (i / (N - 1))));
        factores.push(f);
        const media = (ANCHO_CINTA / 2) * (0.18 + 0.82 * f);
        const cx = x[i] - lienzoX;
        const cy = y[i] - lienzoY;
        izq.push([cx - ty * media, cy + tx * media]);
        der.push([cx + ty * media, cy - tx * media]);
      }
      const trazo = (pts) => {
        c.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i][0] + pts[i + 1][0]) / 2;
          const my = (pts[i][1] + pts[i + 1][1]) / 2;
          c.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
        }
        const fin = pts[pts.length - 1];
        c.lineTo(fin[0], fin[1]);
      };
      c.beginPath();
      trazo(izq);
      const vuelta = der.slice().reverse();
      c.lineTo(vuelta[0][0], vuelta[0][1]);
      for (let i = 1; i < vuelta.length - 1; i++) {
        const mx = (vuelta[i][0] + vuelta[i + 1][0]) / 2;
        const my = (vuelta[i][1] + vuelta[i + 1][1]) / 2;
        c.quadraticCurveTo(vuelta[i][0], vuelta[i][1], mx, my);
      }
      c.lineTo(vuelta[vuelta.length - 1][0], vuelta[vuelta.length - 1][1]);
      c.closePath();
      const sombra = factores[N - 1];
      const tono = Math.round(20 + 14 * sombra);
      c.fillStyle = `rgb(${tono}, ${tono}, ${tono})`;
      c.shadowColor = 'rgba(0, 0, 0, 0.6)';
      c.shadowBlur = 8;
      c.shadowOffsetX = 4;
      c.shadowOffsetY = 6;
      c.fill();
      c.shadowColor = 'transparent';
      c.lineWidth = 1;
      c.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      c.beginPath();
      trazo(izq);
      c.stroke();
      c.beginPath();
      trazo(der);
      c.stroke();
      if (letrero) pintarLetrero(c, factores);
    }

    function pintarLetrero(c, factores) {
      // Letras a lo largo de la cinta, recorriendo la polilínea a paso constante.
      c.font = '700 9px ui-monospace, Consolas, monospace';
      c.fillStyle = '#9A9A9A';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const separacion = 8.5;
      let recorrido = 30;
      let indice = 0;
      for (let i = 0; i < N - 1; i++) {
        const dx = x[i + 1] - x[i];
        const dy = y[i + 1] - y[i];
        const l = Math.sqrt(dx * dx + dy * dy);
        if (!l) continue;
        const angulo = Math.atan2(dy, dx);
        while (recorrido < l) {
          const t = recorrido / l;
          const f = factores[i] + (factores[i + 1] - factores[i]) * t;
          const letra = letrero[indice % letrero.length];
          indice++;
          if (f > 0.45 && letra !== ' ') {
            c.save();
            c.translate(x[i] + dx * t - lienzoX, y[i] + dy * t - lienzoY);
            c.rotate(angulo);
            c.scale(1, f);
            c.fillText(letra, 0, 0);
            c.restore();
          }
          recorrido += separacion;
        }
        recorrido -= l;
      }
    }

    function pintar() {
      const cx = x[N - 1];
      const cy = y[N - 1];
      const angulo = Math.atan2(-(x[N] - cx), y[N] - cy);
      const vx = ((x[N] - px[N]) + (x[N - 1] - px[N - 1])) / 2;
      giroY += (limitar(vx * 1.6, -38, 38) - giroY) * 0.18;
      if (Math.abs(giroY) < 0.01) giroY = 0;
      gafete.style.transform =
        `translate3d(${(cx - mitad).toFixed(2)}px, ${cy.toFixed(2)}px, 0) rotate(${angulo.toFixed(4)}rad) perspective(900px) rotateY(${giroY.toFixed(2)}deg)`;
      gafete.style.setProperty('--gf-luz', (50 + angulo * 60 + giroY * 1.2).toFixed(1) + '%');
      pintarCinta();
    }

    // ---------- Tarjetas de proyecto colgadas del riel ----------
    const zonaProyectos = secciones.find((s) => nombreDe(s) === 'proyectos');
    const tarjetas = zonaProyectos
      ? Array.from(zonaProyectos.querySelectorAll('[data-proyecto], .tarjeta')).filter((el, i, l) => !l.some((o) => o !== el && o.contains(el)))
      : [];
    const vaiven = tarjetas.map(() => ({ a: 0, v: 0, activa: false }));

    function moverTarjetas(dt) {
      let alguna = false;
      for (let i = 0; i < tarjetas.length; i++) {
        const s = vaiven[i];
        if (!s.activa) continue;
        s.v += (-110 * s.a - 9 * s.v) * dt;
        s.a = limitar(s.a + s.v * dt, -1.6, 1.6);
        if (Math.abs(s.a) < 0.004 && Math.abs(s.v) < 0.01) {
          s.a = 0;
          s.v = 0;
          s.activa = false;
          restaurarEstilo(tarjetas[i]);
          continue;
        }
        alguna = true;
        guardarEstilo(tarjetas[i]);
        tarjetas[i].style.transform = `rotate(${s.a.toFixed(3)}deg)`;
      }
      return alguna;
    }

    // ---------- Ciclo de cuadros: corre solo mientras algo se mueve ----------
    function despertar() {
      quietos = 0;
      if (!cuadro && vivo && !reducido) {
        ultimo = 0;
        cuadro = win.requestAnimationFrame(alCuadro);
      }
    }
    function alCuadro(t) {
      cuadro = 0;
      if (!vivo) return;
      const dt = ultimo ? Math.min((t - ultimo) / 1000, 1 / 20) : 0;
      ultimo = t;
      acumulado += dt;
      let pasos = 0;
      while (acumulado >= PASO && pasos < 10) {
        paso();
        acumulado -= PASO;
        pasos++;
      }
      pintar();
      const e = energia();
      lenta = e < 0.36;
      const tarjetasMoviendo = moverTarjetas(dt);
      // Quieta es lenta y además a plomo bajo el ancla: en la vuelta de una oscilación la
      // velocidad también baja a casi cero, y ahí no debe dormirse.
      const aPlomo = Math.abs(x[N] - ax) < 0.6 && Math.abs(x[N - 1] - ax) < 0.6;
      if (!agarre && !tarjetasMoviendo && e < 0.0004 && Math.abs(giroY) < 0.05 && aPlomo) quietos++;
      else quietos = 0;
      if (quietos > 12) {
        giroY = 0;
        pintar();
        return;
      }
      cuadro = win.requestAnimationFrame(alCuadro);
    }

    // ---------- Arrastre con el dedo o el ratón ----------
    function aCapa(e) {
      return { x: e.clientX + win.scrollX, y: e.clientY + win.scrollY };
    }
    // Con el ratón se agarra al instante. Con el dedo hay que mostrar intención: moverlo de lado
    // o mantenerlo presionado; un deslizamiento vertical se deja al navegador y baja la página.
    const UMBRAL = 8;
    const PRESION = 350;
    let pendiente = null;
    let presion = 0;
    function soltarPresion() {
      if (presion) win.clearTimeout(presion);
      presion = 0;
    }
    function agarrar(id, p, conDedo) {
      const bx = x[N] - x[N - 1];
      const by = y[N] - y[N - 1];
      const l2 = bx * bx + by * by || 1;
      const t = limitar(((p.x - x[N - 1]) * bx + (p.y - y[N - 1]) * by) / l2, 0.12, 1);
      agarre = { id, t, x: p.x, y: p.y };
      gafete.setAttribute('data-gf-agarrado', '');
      // Un toque ya viene capturado por la credencial; pedirlo otra vez lo suelta en Chrome.
      if (!conDedo && gafete.setPointerCapture) {
        try {
          gafete.setPointerCapture(id);
        } catch (err) {
          // El puntero ya se soltó; el arrastre termina con el siguiente pointerup.
          agarre = null;
          gafete.removeAttribute('data-gf-agarrado');
        }
      }
      despertar();
    }
    function alBajar(e) {
      if (e.button !== undefined && e.button !== 0) return;
      const p = aCapa(e);
      if (e.pointerType === 'touch') {
        pendiente = { id: e.pointerId, x: p.x, y: p.y, cx: e.clientX, cy: e.clientY };
        soltarPresion();
        presion = win.setTimeout(() => {
          presion = 0;
          if (!pendiente || !vivo) return;
          const q = pendiente;
          pendiente = null;
          agarrar(q.id, q, true);
        }, PRESION);
        return;
      }
      e.preventDefault();
      agarrar(e.pointerId, p);
    }
    function alMover(e) {
      if (pendiente && e.pointerId === pendiente.id) {
        const dx = e.clientX - pendiente.cx;
        const dy = e.clientY - pendiente.cy;
        if (Math.abs(dx) > UMBRAL && Math.abs(dx) > Math.abs(dy) * 1.2) {
          pendiente = null;
          soltarPresion();
          agarrar(e.pointerId, aCapa(e), true);
        } else if (Math.abs(dy) > UMBRAL) {
          pendiente = null;
          soltarPresion();
        }
        return;
      }
      if (!agarre || e.pointerId !== agarre.id) return;
      const p = aCapa(e);
      agarre.x = p.x;
      agarre.y = p.y;
      despertar();
    }
    function alSoltar(e) {
      // Con el dedo el arrastre termina al levantarlo o si el navegador lo cancela.
      if (e.type === 'lostpointercapture' && e.pointerType === 'touch') return;
      if (pendiente && (e.pointerId === undefined || e.pointerId === pendiente.id)) {
        pendiente = null;
        soltarPresion();
      }
      if (!agarre || (e.pointerId !== undefined && e.pointerId !== agarre.id)) return;
      agarre = null;
      gafete.removeAttribute('data-gf-agarrado');
      despertar();
    }

    // ---------- El scroll también empuja la credencial y las tarjetas ----------
    let scrollPrevio = win.scrollY;
    const montajeEn = win.performance.now();
    function alDesplazar() {
      const yActual = win.scrollY;
      const dy = limitar(yActual - scrollPrevio, -90, 90);
      scrollPrevio = yActual;
      // Al entrar, el núcleo y la carga de fuentes mueven el scroll solos: eso no empuja nada.
      if (!dy || win.performance.now() - montajeEn < 700) return;
      let empujo = false;
      if (yActual < fondoCapa && !agarre) {
        const lado = x[N] >= ax ? 1 : -1;
        for (let i = 1; i < M; i++) {
          const peso = i / N;
          py[i] += dy * 0.09 * peso;
          px[i] -= Math.abs(dy) * 0.035 * peso * lado;
        }
        empujo = true;
      }
      if (zonaProyectos) {
        const r = zonaProyectos.getBoundingClientRect();
        if (r.bottom > 0 && r.top < win.innerHeight) {
          for (let i = 0; i < vaiven.length; i++) {
            vaiven[i].v -= dy * 0.05 * (1 + 0.2 * (i % 3));
            vaiven[i].activa = true;
          }
          empujo = true;
        }
      }
      if (empujo) despertar();
    }

    // ---------- Al cambiar el tamaño de la ventana ----------
    function reacomodar() {
      if (!vivo) return;
      recolocarPildora();
      const tramoAntes = tramo;
      const altoAntes = alto;
      const nuevo = medir();
      const dx = nuevo.x - ax;
      const dy = nuevo.y - ay;
      ax = nuevo.x;
      ay = nuevo.y;
      if (reducido) {
        colocar(0);
        pintar();
        return;
      }
      for (let i = 0; i < M; i++) {
        x[i] += dx;
        px[i] += dx;
        y[i] += dy;
        py[i] += dy;
      }
      // Moverla de lado no le da velocidad: si las medidas siguen iguales basta con volver a
      // pintarla. Si cambió el largo, las restricciones la llevan a su nueva medida.
      if (Math.abs(tramo - tramoAntes) > 0.01 || Math.abs(alto - altoAntes) > 0.5) despertar();
      else if (!cuadro) pintar();
    }

    ({ x: ax, y: ay } = medir());
    if (reducido) {
      colocar(0);
      pintar();
    } else {
      colocar(llegaDeOtro ? 0 : entradaLarga ? 2.45 : 1.6);
      pintar();
      gafete.addEventListener('pointerdown', alBajar, conCorte);
      gafete.addEventListener('pointermove', alMover, conCorte);
      gafete.addEventListener('pointerup', alSoltar, conCorte);
      gafete.addEventListener('pointercancel', alSoltar, conCorte);
      gafete.addEventListener('lostpointercapture', alSoltar, conCorte);
      // Mientras se arrastra con el dedo, la página no se mueve; ni menú de mantener presionado.
      gafete.addEventListener('touchmove', (e) => { if (agarre && e.cancelable) e.preventDefault(); }, { signal: corte.signal, passive: false });
      gafete.addEventListener('contextmenu', (e) => e.preventDefault(), conCorte);
      win.addEventListener('scroll', alDesplazar, pasivo);
      if (llegaDeOtro) animar(capa, [{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: CURVA });
      else despertar();
    }
    win.addEventListener('resize', reacomodar, pasivo);
    if (win.ResizeObserver) {
      const ro = new win.ResizeObserver(() => reacomodar());
      ro.observe(inicio);
      observadores.push(ro);
    }
    if (!img.complete) img.addEventListener('load', reacomodar, conCorte);

    // ---------- Entrada del inicio: de desenfocado a nítido, en cascada ----------
    if (!reducido) {
      const orden = [];
      const sumar = (sel, todos) => {
        const lista = todos ? inicio.querySelectorAll(sel) : [inicio.querySelector(sel)];
        for (const el of lista) if (el && !orden.includes(el)) orden.push(el);
      };
      sumar('.lugar');
      sumar('.saludo');
      sumar('h1 > span', true);
      if (!inicio.querySelector('h1 > span')) sumar('h1');
      sumar('.cargo');
      sumar('.resumen');
      sumar('.acciones > li', true);
      sumar('.datos > *', true);
      if (orden.length < 3) {
        for (const el of inicio.querySelectorAll('[data-pieza]')) if (!el.contains(retrato) && !orden.includes(el)) orden.push(el);
      }
      // Toda la cascada cabe en 0.65 s.
      const salto = orden.length > 1 ? Math.min(36, 230 / (orden.length - 1)) : 0;
      orden.forEach((el, i) => {
        const espera = 40 + i * salto;
        if (el === cargo) {
          // El cargo se escribe letra por letra, revelado con un recorte a saltos.
          const letras = Math.max(1, el.textContent.trim().length);
          animar(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 1, delay: espera, fill: 'backwards' });
          animar(el, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }], {
            duration: Math.min(letras * 22, 640 - espera),
            delay: espera,
            easing: `steps(${letras}, end)`,
            fill: 'backwards',
          });
          return;
        }
        animar(el, ENFOQUE, { duration: 360, delay: espera, easing: CURVA, fill: 'backwards' });
      });
    }

    // ---------- El resto de las secciones se enfoca al entrar a cuadro ----------
    const pendientes = new Set();
    if (!reducido && win.IntersectionObserver) {
      for (const s of secciones) {
        if (s === inicio) continue;
        let bloques = Array.from(s.querySelectorAll('[data-proyecto], [data-pieza]'));
        if (!bloques.length) bloques = Array.from(s.querySelectorAll('h2, .zona-cabeza > *, li'));
        bloques = bloques.filter((el, i, l) => !l.some((o) => o !== el && o.contains(el)));
        for (const el of bloques) {
          el.setAttribute('data-gf-espera', '');
          pendientes.add(el);
        }
      }
      const montadoEn = win.performance.now();
      const io = new win.IntersectionObserver((entradas) => {
        // Lo que ya está a la vista al montar entra con la versión corta, en poco más de medio segundo.
        const deEntrada = win.performance.now() - montadoEn < 400;
        const llegan = entradas.filter((e) => e.isIntersecting).map((e) => e.target);
        llegan.sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1));
        llegan.forEach((el, i) => {
          io.unobserve(el);
          pendientes.delete(el);
          el.removeAttribute('data-gf-espera');
          const espera = deEntrada ? Math.min(i * 30, 120) : Math.min(i * 80, 320);
          animar(el, ENFOQUE, { duration: deEntrada ? 340 : 480, delay: espera, easing: CURVA, fill: 'backwards' });
          // Las etiquetas de cada bloque entran en ola, una tras otra.
          const chips = el.querySelectorAll('.etiquetas > li, .proyecto-stack > li, .proyecto-cifras > li');
          chips.forEach((chip, j) => {
            animar(chip, [
              { opacity: 0, transform: 'translateY(8px) scale(0.92)' },
              { opacity: 1, transform: 'none' },
            ], deEntrada
              ? { duration: 220, delay: espera + 60 + Math.min(j * 16, 120), easing: CURVA, fill: 'backwards' }
              : { duration: 320, delay: espera + 160 + Math.min(j * 40, 400), easing: CURVA, fill: 'backwards' });
          });
        });
      }, { rootMargin: '0px', threshold: 0 });
      for (const el of pendientes) io.observe(el);
      observadores.push(io);
    }

    // ---------- La píldora del menú sigue a la sección en pantalla ----------
    const menu = doc.querySelector('.menu, nav');
    const vinculos = menu ? Array.from(menu.querySelectorAll('a[href^="#"]')) : [];
    const porSeccion = new Map();
    for (const a of vinculos) {
      const destino = doc.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
      if (destino) porSeccion.set(destino, a);
    }
    let activo = null;
    function marcarActivo(a) {
      if (a === activo || !menu) return;
      if (activo) activo.removeAttribute('data-gf-activo');
      activo = a;
      if (a) a.setAttribute('data-gf-activo', '');
      recolocarPildora();
    }
    // La medida se toma de nuevo cuando llegan las fuentes o cambia el ancho, porque los
    // vínculos cambian de tamaño y la píldora quedaría corrida.
    function recolocarPildora() {
      if (!menu || !vivo) return;
      guardarEstilo(menu);
      if (activo) {
        // Si el menú llegara a desplazarse de lado, el vínculo activo se trae a la vista.
        if (menu.scrollWidth > menu.clientWidth + 1) {
          menu.scrollTo({ left: activo.offsetLeft - 4, behavior: reducido ? 'auto' : 'smooth' });
        }
        menu.style.setProperty('--gf-x', activo.offsetLeft + 'px');
        menu.style.setProperty('--gf-y', activo.offsetTop + 'px');
        menu.style.setProperty('--gf-w', activo.offsetWidth + 'px');
        menu.style.setProperty('--gf-h', activo.offsetHeight + 'px');
        menu.style.setProperty('--gf-o', '1');
      } else {
        menu.style.setProperty('--gf-o', '0');
      }
    }
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(recolocarPildora);
    if (porSeccion.size && win.IntersectionObserver) {
      const enBanda = new Set();
      const ioMenu = new win.IntersectionObserver((entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) enBanda.add(e.target);
          else enBanda.delete(e.target);
        }
        let ultimoVisto = null;
        for (const s of porSeccion.keys()) if (enBanda.has(s)) ultimoVisto = s;
        marcarActivo(ultimoVisto ? porSeccion.get(ultimoVisto) : null);
      }, { rootMargin: '-38% 0px -58% 0px', threshold: 0 });
      for (const s of porSeccion.keys()) ioMenu.observe(s);
      observadores.push(ioMenu);
    }

    // ---------- Desplazamiento suave al tocar un vínculo interno ----------
    let tabuladoTemporal = null;
    function soltarTabulado() {
      if (tabuladoTemporal) {
        tabuladoTemporal.removeAttribute('tabindex');
        tabuladoTemporal = null;
      }
    }
    function detenerDesplazo() {
      if (cuadroDesplazo) win.cancelAnimationFrame(cuadroDesplazo);
      cuadroDesplazo = 0;
    }
    function desplazarA(destino) {
      detenerDesplazo();
      const margen = parseFloat(win.getComputedStyle(destino).scrollMarginTop) || 0;
      const desde = win.scrollY;
      const maximo = doc.documentElement.scrollHeight - win.innerHeight;
      const hasta = limitar(destino.getBoundingClientRect().top + desde - margen, 0, Math.max(0, maximo));
      const distancia = hasta - desde;
      const duracion = limitar(560 + Math.abs(distancia) * 0.08, 600, 950);
      let comienzo = 0;
      const curva = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
      const avanzar = (t) => {
        if (!comienzo) comienzo = t;
        const p = Math.min(1, (t - comienzo) / duracion);
        win.scrollTo(0, desde + distancia * curva(p));
        if (p < 1) cuadroDesplazo = win.requestAnimationFrame(avanzar);
        else {
          cuadroDesplazo = 0;
          if (!destino.matches('a, button, input, select, textarea, [tabindex]')) {
            soltarTabulado();
            destino.setAttribute('tabindex', '-1');
            tabuladoTemporal = destino;
            destino.addEventListener('blur', soltarTabulado, conCorte);
          }
          destino.focus({ preventScroll: true });
        }
      };
      cuadroDesplazo = win.requestAnimationFrame(avanzar);
    }
    if (!reducido) {
      doc.addEventListener('click', (e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const a = e.target.closest && e.target.closest('a[href^="#"]');
        if (!a) return;
        const id = decodeURIComponent(a.getAttribute('href').slice(1));
        const destino = id && doc.getElementById(id);
        if (!destino) return;
        e.preventDefault();
        if (win.history && win.history.pushState) win.history.pushState(null, '', '#' + id);
        desplazarA(destino);
      }, conCorte);
      // Si el visitante toma el control, la animación se hace a un lado.
      const ceder = () => detenerDesplazo();
      win.addEventListener('wheel', ceder, pasivo);
      win.addEventListener('touchstart', ceder, pasivo);
      win.addEventListener('keydown', ceder, conCorte);
    }

    return function desmontar() {
      if (!vivo) return;
      vivo = false;
      if (cuadro) win.cancelAnimationFrame(cuadro);
      cuadro = 0;
      detenerDesplazo();
      corte.abort();
      soltarPresion();
      pendiente = null;
      for (const o of observadores) o.disconnect();
      observadores.length = 0;
      for (const a of Array.from(animaciones)) a.cancel();
      animaciones.clear();
      for (const el of pendientes) el.removeAttribute('data-gf-espera');
      pendientes.clear();
      if (activo) activo.removeAttribute('data-gf-activo');
      activo = null;
      soltarTabulado();
      for (const el of Array.from(estilosOriginales.keys())) restaurarEstilo(el);
      html.removeAttribute('data-gf-mov');
      html.removeAttribute('data-gf-quieto');
      capa.remove();
    };
  },
};
