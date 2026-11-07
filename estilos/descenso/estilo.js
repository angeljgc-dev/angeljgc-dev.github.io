// Estilo "descenso". La página es una inmersión desde la superficie hasta el fondo del mar.
// Arriba hay cielo y el nombre flota en la línea de agua: la mitad de arriba es el texto real
// de la página, la de abajo la pinta el shader, refractada. Al bajar, la luz del sol se apaga
// y en lo hondo solo queda la luz que hacen los propios seres del mar.
//
// Todo el mundo submarino es un solo fragment shader de pantalla completa, sin imágenes ni
// bibliotecas: oleaje por suma de ondas, rayos, cáusticas, nieve marina y el fondo marino.
// El cardumen es una segunda pasada en el mismo contexto. El contenido no se toca: solo se
// presenta encima, en paneles opacos.

const ZONAS = [
  { hasta: 0, nombre: 'Superficie' },
  { hasta: 200, nombre: 'Zona iluminada' },
  { hasta: 1000, nombre: 'Zona crepuscular' },
  { hasta: 4000, nombre: 'Zona de medianoche' },
  { hasta: Infinity, nombre: 'Zona abisal' },
];
// Qué tan hondo está cada punto de la página, como fracción del recorrido bajo el agua.
const NUDOS = [[0, 0], [0.14, 200], [0.36, 1000], [0.6, 4000], [1, 4800]];

// Recortes de la interfaz real de cada proyecto que salen del marco de su captura.
// Las cifras son la fracción de la imagen original (960 x 600).
const PIEZAS = [
  { patron: /recepcion-agenda/, x: 698 / 960, y: 108 / 600, w: 200 / 960, h: 166 / 600, ancho: 0.36 },
  { patron: /recepcion-asistente/, x: 700 / 960, y: 107 / 600, w: 198 / 960, h: 33 / 600, ancho: 0.5 },
];

const VERTICES = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const AGUA = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uEscala;
uniform float uT;
uniform float uLinea;
uniform float uAmp;
uniform vec2 uMetros;
uniform float uFondo;
uniform float uDesp;
uniform vec4 uNombreR;
uniform float uHayNombre;
uniform sampler2D uNombre;
uniform float uCalidad;
uniform float uCorte;
uniform vec4 uLuces[4];

float h11(float n) { return fract(sin(n) * 43758.5453); }
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 h22(vec2 p) { float n = h21(p); return vec2(n, h21(p + n + 17.3)); }
float ruido(float x) { float i = floor(x); float f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h11(i), h11(i + 1.0), f); }
float ruido2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}

// La misma ola se calcula en JavaScript para recortar el nombre justo en la línea.
float ola(float x, float t) {
  return uAmp * (0.55 * sin(x * 0.011 + t * 1.1) + 0.30 * sin(x * 0.023 - t * 1.7 + 1.3) + 0.15 * sin(x * 0.051 + t * 2.3 + 2.1));
}

// Bordes de celdas de Voronoi que se mueven: la red de luz de las cáusticas.
float bordes(vec2 p, float t) {
  vec2 i = floor(p); vec2 f = fract(p);
  float d1 = 8.0; float d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = h22(i + g);
      o = 0.5 + 0.42 * sin(t + 6.2831 * o);
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  }
  return d2 - d1;
}
float causticas(vec2 p, float t) {
  vec2 q = p * 0.019;
  q += 0.55 * vec2(sin(q.y * 1.3 + t * 0.7) + 0.5 * sin(q.y * 3.1 - t * 0.9), cos(q.x * 1.1 - t * 0.6) + 0.5 * cos(q.x * 2.7 + t * 0.8));
  float c = 1.0 - smoothstep(0.0, 0.13, bordes(q, t * 0.9));
  if (uCalidad > 0.5) {
    float c2 = 1.0 - smoothstep(0.0, 0.1, bordes(q * 1.9 + 3.7, t * 1.25));
    c = max(c, c2 * 0.6);
  }
  // La luz se junta en manchas: unas zonas brillan más que otras y cambian despacio.
  float manchas = smoothstep(0.25, 0.85, ruido2(p * 0.0045 + vec2(t * 0.05, -t * 0.03)));
  return c * c * (0.35 + 0.9 * manchas);
}

vec3 rampa(float m) {
  float k = clamp(log(1.0 + m / 60.0) / log(81.0), 0.0, 1.0);
  vec3 a = vec3(0.043, 0.310, 0.361);
  vec3 b = vec3(0.039, 0.184, 0.239);
  vec3 c = vec3(0.012, 0.067, 0.102);
  return k < 0.5 ? mix(a, b, k / 0.5) : mix(b, c, clamp((k - 0.5) / 0.42, 0.0, 1.0));
}

// Partículas en una rejilla: una por celda, en algunas celdas nada más.
float motas(vec2 q, float celda, float t, float semilla, float cuantas, float radio) {
  vec2 c = q / celda; vec2 i = floor(c); vec2 f = fract(c);
  vec2 h = h22(i + semilla);
  if (h.x > cuantas) return 0.0;
  vec2 pos = 0.2 + 0.6 * h.yx + 0.07 * vec2(sin(t * 0.5 + h.x * 30.0), cos(t * 0.4 + h.y * 20.0));
  float d = length((f - pos) * celda);
  return smoothstep(radio + 0.9, radio * 0.3, d);
}

vec3 cielo(vec2 p, float L, float t, float ancho) {
  float alto = L - p.y;
  vec3 c = mix(vec3(0.902, 0.953, 0.945), vec3(0.60, 0.80, 0.82), smoothstep(30.0, 900.0, alto));
  vec2 sol = vec2(ancho * 0.84, L - 600.0);
  float ds = length(p - sol);
  c = mix(c, vec3(1.0, 0.80, 0.58), 0.55 * exp(-ds / 260.0));
  c = mix(c, vec3(1.0, 0.97, 0.90), 0.85 * smoothstep(52.0, 38.0, ds));
  vec2 v = p - sol; float ang = atan(v.y, v.x);
  float r = ruido(ang * 19.0 + t * 0.05) * ruido(ang * 43.0 - t * 0.03);
  c += vec3(1.0, 0.95, 0.85) * 0.18 * r * exp(-ds / 700.0) * smoothstep(40.0, 160.0, ds);
  vec2 q = vec2(p.x * 0.0022 + t * 0.006, (p.y - L) * 0.011);
  float n = ruido2(q) * 0.62 + ruido2(q * 2.3 + 5.0) * 0.38;
  c = mix(c, vec3(0.975, 0.99, 0.985), 0.42 * smoothstep(0.55, 0.86, n) * smoothstep(80.0, 320.0, alto));
  return c;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uEscala;
  float H = uRes.y / uEscala;
  float ancho = uRes.x / uEscala;
  float t = uT;
  float L = uLinea + ola(p.x, t);
  float fino = 0.9 * sin(p.x * 0.13 + t * 3.1) * sin(p.x * 0.037 - t * 0.9);
  float bajo = p.y - (L + fino);
  vec3 c;

  if (bajo < 0.0) {
    c = cielo(p, L, t, ancho);
    // La superficie de atrás: el mar visto un poco desde arriba, claro y con destellos.
    float atras = uLinea - uAmp * 0.9 - 9.0 + ola(p.x * 0.7 + 90.0, t * 0.8) * 0.6;
    if (p.y > atras) {
      float k = smoothstep(atras, L, p.y);
      vec3 mar = mix(vec3(0.80, 0.92, 0.91), vec3(0.68, 0.86, 0.86), k);
      float destello = smoothstep(0.82, 0.97, ruido2(vec2(p.x * 0.09 + t * 0.6, p.y * 0.5 - t * 0.4)));
      mar += vec3(0.25) * destello;
      c = mix(c, mar, smoothstep(atras - 1.0, atras + 1.5, p.y));
    }
    // Espuma en las crestas.
    float espuma = smoothstep(-5.0, 0.0, bajo) * smoothstep(0.45, 0.8, ruido2(vec2(p.x * 0.12 - t * 0.9, t * 0.7)));
    c = mix(c, vec3(0.97, 1.0, 0.99), espuma * 0.7);
  } else {
    float m = max(0.0, mix(uMetros.x, uMetros.y, p.y / H));
    float sol = exp(-m / 260.0);
    float bio = smoothstep(500.0, 2600.0, m);
    vec2 mundo = vec2(p.x, p.y + uDesp);
    c = rampa(m);
    // Corrientes lentas: el agua nunca es un color parejo.
    float corriente = ruido2(vec2(p.x * 0.0021 + t * 0.012, mundo.y * 0.0016 - t * 0.02)) * 0.65 + ruido2(vec2(p.x * 0.0057 - t * 0.02, mundo.y * 0.0049 + t * 0.01)) * 0.35;
    c *= 0.8 + 0.42 * corriente;
    c += vec3(0.0, 0.05, 0.06) * exp(-m / 1100.0) * (1.0 - p.y / H);
    // La luz entra por arriba: más clara cerca de la superficie y hacia arriba de la pantalla.
    c += vec3(0.04, 0.24, 0.24) * exp(-bajo / 320.0) * sol;
    c += vec3(0.01, 0.06, 0.07) * (1.0 - p.y / H) * sol;
    // Rayos de luz en diagonal, del mismo lado que el sol del cielo.
    vec2 dir = normalize(vec2(-0.34, 1.0));
    float u = dot(p, vec2(dir.y, -dir.x));
    float a = dot(p, dir);
    float n = ruido(u * 0.011 + t * 0.07) * 0.6 + ruido(u * 0.029 - t * 0.11 + 4.0) * 0.4;
    float rayo = smoothstep(0.5, 0.92, n) * (0.72 + 0.28 * sin(a * 0.008 - t * 0.5 + u * 0.003));
    float caida = 0.3 + 0.7 * exp(-bajo / 520.0);
    c += vec3(0.42, 0.92, 0.86) * 0.2 * rayo * sol * caida * smoothstep(0.0, 40.0, bajo);
    // Cáusticas: la red de luz que deja el oleaje, pegada a la superficie.
    float cerca = exp(-bajo / 130.0) * sol;
    if (cerca > 0.015) c += vec3(0.5, 1.0, 0.9) * 0.17 * causticas(mundo, t) * cerca;
    // La superficie vista desde abajo: una banda brillante que tiembla, y el menisco.
    float banda = exp(-bajo / 16.0);
    if (banda > 0.01) {
      float brillo = causticas(vec2(p.x, mundo.y * 3.0), t * 1.3);
      c += vec3(0.62, 1.0, 0.94) * banda * (0.18 + 0.55 * brillo) * (0.4 + 0.6 * sol);
    }
    c = mix(c, vec3(0.93, 1.0, 0.98), smoothstep(2.4, 0.0, bajo) * 0.85);
    // Nieve marina: dos capas que suben con el desplazamiento a distinta velocidad.
    float nieve = motas(vec2(p.x, p.y + uDesp * 0.45 - t * 7.0), 52.0, t, 3.0, 0.5, 1.3);
    if (uCalidad > 0.5) nieve += 0.6 * motas(vec2(p.x + 13.0, p.y + uDesp * 0.2 - t * 4.0), 27.0, t, 11.0, 0.45, 0.7);
    c += vec3(0.62, 0.82, 0.82) * nieve * (0.16 + 0.22 * sol);
    // El halo de las medusas que pasan: la luz que hacen ellas mismas.
    for (int i = 0; i < 4; i++) {
      vec4 l = uLuces[i];
      if (l.w > 0.0) c += vec3(0.30, 1.0, 0.82) * l.w * exp(-length(p - l.xy) / l.z);
    }
    // Bioluminiscencia: luces verdes que parpadean, donde ya no llega el sol.
    if (bio > 0.01) {
      vec2 q = vec2(p.x, p.y + uDesp * 0.6);
      float celda = 74.0;
      vec2 ci = floor(q / celda);
      float chispa = 0.5 + 0.5 * sin(t * (1.2 + h21(ci) * 2.0) + h21(ci + 4.0) * 40.0);
      float luz = motas(q, celda, t * 0.6, 7.0, 0.42, 1.6);
      float halo = motas(q, celda, t * 0.6, 7.0, 0.42, 12.0);
      c += vec3(0.30, 1.0, 0.82) * (luz * 0.9 + halo * 0.12) * chispa * bio;
      // De vez en cuando, una luz grande y blanda que late, como una medusa a lo lejos.
      vec2 qm = vec2(p.x, p.y + uDesp * 0.25 - t * 3.0);
      float medusa = motas(qm, 300.0, t * 0.3, 31.0, 0.35, 70.0);
      vec2 cm = floor(qm / 300.0);
      c += vec3(0.25, 0.95, 0.85) * medusa * medusa * 0.1 * bio * (0.55 + 0.45 * sin(t * 0.9 + h21(cm) * 30.0));
    }
    // El fondo marino sube al final: tres perfiles de roca, cada uno a su velocidad.
    if (uFondo < H * 1.8) {
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float par = 0.55 + 0.25 * fi;
        float base = H + (uFondo - H) * par;
        float alto = 180.0 - 50.0 * fi;
        float x = p.x * (0.0035 + 0.0022 * fi) + fi * 13.7;
        float perfil = ruido(x) * 0.6 + ruido(x * 2.7 + 3.0) * 0.28 + ruido(x * 7.1) * 0.12;
        float cima = base - alto * (0.35 + 0.65 * perfil) + 40.0 * fi;
        if (p.y > cima) {
          vec3 roca = mix(vec3(0.03, 0.11, 0.14), vec3(0.008, 0.035, 0.05), fi / 2.0);
          float borde = exp(-(p.y - cima) / 5.0);
          roca += vec3(0.30, 1.0, 0.82) * borde * 0.16 * (0.4 + bio);
          float puntos = motas(vec2(p.x, p.y - base), 38.0, t * 0.4, 21.0 + fi, 0.25, 1.4);
          roca += vec3(0.30, 1.0, 0.82) * puntos * 0.7 * smoothstep(0.0, 60.0, p.y - cima);
          c = mix(c, roca, smoothstep(cima - 1.0, cima + 1.5, p.y));
        }
      }
    }
    // El nombre bajo el agua, refractado por el oleaje.
    if (uHayNombre > 0.5) {
      vec2 q = p;
      q.x += sin(p.y * 0.09 + t * 2.2) * 2.4 + sin(p.y * 0.031 - t * 1.3) * 1.6;
      q.y += sin(p.x * 0.05 + t * 1.6) * 1.5;
      vec2 uv = (q - uNombreR.xy) / uNombreR.zw;
      if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
        float letra = texture2D(uNombre, uv).a * 0.6 + texture2D(uNombre, uv + vec2(0.0, 1.6) / uNombreR.zw).a * 0.4;
        float luz = 0.85 + 0.3 * causticas(mundo * 1.3, t);
        vec3 tinta = mix(vec3(0.86, 0.97, 0.95), c, 0.18) * luz;
        c = mix(c, tinta, letra * 0.84 * smoothstep(0.0, 3.0, bajo));
      }
    }
    // Un poco más oscuro en las orillas, como cuando se mira hacia abajo en el agua.
    vec2 v = p / vec2(ancho, H) - 0.5;
    c *= 1.0 - 0.28 * dot(v, v);
    c = mix(c, rampa(m), smoothstep(uCorte - 140.0, uCorte, p.y));
  }
  c += (h21(p + fract(t)) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}
`;

const PECES_VERTICES = `
attribute vec2 aPos;
attribute vec4 aColor;
uniform vec2 uTam;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec2 c = aPos / uTam * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}
`;
// Los animales: un rectángulo con su hoja de cuadros, oscurecido y velado por el agua que tiene delante.
const SPRITE_VERTICES = `
attribute vec2 aPos;
attribute vec2 aUv;
uniform vec2 uTam;
varying vec2 vUv;
void main() {
  vUv = aUv;
  vec2 c = aPos / uTam * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
}
`;
const SPRITE_FRAGMENTOS = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uHoja;
uniform vec3 uAgua;
uniform float uNiebla;
uniform float uLuz;
uniform float uAlfa;
void main() {
  vec4 t = texture2D(uHoja, vUv);
  vec3 c = mix(t.rgb * uLuz, uAgua * t.a, uNiebla);
  gl_FragColor = vec4(c, t.a) * uAlfa;
}
`;
const PECES_FRAGMENTOS = `
precision mediump float;
varying vec4 vColor;
void main() { gl_FragColor = vColor; }
`;

// La ola en JavaScript, idéntica a la del shader.
function ola(x, t, amp) {
  return amp * (0.55 * Math.sin(x * 0.011 + t * 1.1) + 0.3 * Math.sin(x * 0.023 - t * 1.7 + 1.3) + 0.15 * Math.sin(x * 0.051 + t * 2.3 + 2.1));
}
const limitar = (v, a, b) => Math.min(b, Math.max(a, v));
const suave = (a, b, v) => { const k = limitar((v - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

function compilar(gl, tipo, fuente) {
  const s = gl.createShader(tipo);
  gl.shaderSource(s, fuente);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error('El shader del agua no compiló: ' + error);
  }
  return s;
}
function programa(gl, v, f) {
  const p = gl.createProgram();
  const sv = compilar(gl, gl.VERTEX_SHADER, v);
  const sf = compilar(gl, gl.FRAGMENT_SHADER, f);
  gl.attachShader(p, sv);
  gl.attachShader(p, sf);
  gl.linkProgram(p);
  gl.deleteShader(sv);
  gl.deleteShader(sf);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('El shader del agua no enlazó: ' + gl.getProgramInfoLog(p));
  return p;
}

export default {
  id: 'descenso',
  nombre: 'Descenso',

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
    // Lo que el estilo cambia en elementos que no son suyos se guarda para dejarlo como estaba.
    const estilosOriginales = new Map();
    function tocar(el, propiedad, valor) {
      if (!estilosOriginales.has(el)) estilosOriginales.set(el, el.getAttribute('style'));
      if (valor === null) el.style.removeProperty(propiedad);
      else el.style.setProperty(propiedad, valor);
    }
    const atributosRaiz = new Map();
    function marcarRaiz(nombre, valor) {
      if (!atributosRaiz.has(nombre)) atributosRaiz.set(nombre, raiz.getAttribute(nombre));
      if (raiz.getAttribute(nombre) !== valor) raiz.setAttribute(nombre, valor);
    }
    function crear(etiqueta, clase, padre, antes) {
      const n = doc.createElement(etiqueta);
      n.className = clase;
      n.setAttribute('data-descenso', '');
      n.setAttribute('aria-hidden', 'true');
      if (antes) padre.insertBefore(n, antes);
      else padre.appendChild(n);
      limpiezas.push(() => n.remove());
      return n;
    }

    const principal = doc.querySelector('main') || doc.body;
    const inicio = doc.querySelector('[data-seccion="presentacion"]') || principal.querySelector('section');
    const nombre = (inicio && inicio.querySelector('h1')) || doc.querySelector('h1');
    const cabecera = doc.querySelector('body > header');
    const enCielo = [];
    if (nombre && nombre.parentElement) {
      for (const hermano of nombre.parentElement.children) {
        if (hermano === nombre) break;
        enCielo.push(hermano);
      }
    }

    // ---------- el medidor de profundidad ----------
    const medidor = crear('div', 'descenso-medidor', doc.body);
    const zonaTexto = doc.createElement('span');
    zonaTexto.className = 'descenso-medidor-zona';
    const cifraTexto = doc.createElement('span');
    cifraTexto.className = 'descenso-medidor-cifra';
    const barra = doc.createElement('span');
    barra.className = 'descenso-medidor-barra';
    medidor.append(zonaTexto, cifraTexto, barra);
    let ultimaLectura = '';

    // ---------- las piezas que salen del marco ----------
    for (const img of principal.querySelectorAll('.proyecto-medio > img, [data-proyecto] figure > img')) {
      const fuente = img.getAttribute('src') || '';
      const pieza = PIEZAS.find((p) => p.patron.test(fuente));
      if (!pieza) continue;
      const marco = img.parentElement;
      const el = crear('div', 'descenso-pieza', marco);
      const proporcion = (pieza.h * 600) / (pieza.w * 960);
      el.style.width = (pieza.ancho * 100).toFixed(1) + '%';
      el.style.aspectRatio = (1 / proporcion).toFixed(3);
      el.style.right = '6%';
      el.style.top = '-26px';
      el.style.backgroundSize = (100 / pieza.w).toFixed(2) + '% ' + (100 / pieza.h).toFixed(2) + '%';
      el.style.backgroundPosition = ((pieza.x / (1 - pieza.w)) * 100).toFixed(2) + '% ' + ((pieza.y / (1 - pieza.h)) * 100).toFixed(2) + '%';
      const poner = () => { if (vivo) el.style.backgroundImage = 'url("' + (img.currentSrc || img.src) + '")'; };
      if (img.complete && img.naturalWidth) poner();
      else escuchar(img, 'load', poner);
    }

    // ---------- medidas de la página ----------
    const m = { ancho: 1, alto: 1, doc: 1, superficie: 400, nombre: null, cabecera: 96 };
    let texturaLista = false;
    let lienzoNombre = null;

    function metrosDe(yPagina) {
      const largo = Math.max(1, m.doc - m.superficie);
      const f = (yPagina - m.superficie) / largo;
      if (f <= 0) return (f * NUDOS[1][1]) / NUDOS[1][0];
      for (let i = 1; i < NUDOS.length; i++) {
        if (f <= NUDOS[i][0]) {
          const [f0, m0] = NUDOS[i - 1];
          const [f1, m1] = NUDOS[i];
          return m0 + ((f - f0) / (f1 - f0)) * (m1 - m0);
        }
      }
      return NUDOS[NUDOS.length - 1][1];
    }

    // Las palabras del nombre con su lugar exacto, para pintarlas igual en la textura.
    function palabrasDelNombre() {
      const lista = [];
      const andador = doc.createTreeWalker(nombre, NodeFilter.SHOW_TEXT);
      const rango = doc.createRange();
      while (andador.nextNode()) {
        const nodo = andador.currentNode;
        const texto = nodo.textContent;
        const patron = /\S+/g;
        let hallado;
        while ((hallado = patron.exec(texto))) {
          rango.setStart(nodo, hallado.index);
          rango.setEnd(nodo, hallado.index + hallado[0].length);
          const r = rango.getBoundingClientRect();
          if (r.width > 0) lista.push({ texto: hallado[0], r });
        }
      }
      rango.detach();
      return lista;
    }

    function medirNombre(desp) {
      const r = nombre.getBoundingClientRect();
      const cs = ventana.getComputedStyle(nombre);
      const fuente = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      const tam = parseFloat(cs.fontSize);
      const margen = Math.ceil(tam * 0.35);
      const palabras = palabrasDelNombre();
      if (!palabras.length) return null;
      if (!lienzoNombre) lienzoNombre = doc.createElement('canvas');
      const ancho = Math.ceil(r.width + margen * 2);
      const alto = Math.ceil(r.height + margen * 2);
      lienzoNombre.width = ancho;
      lienzoNombre.height = alto;
      const c2 = lienzoNombre.getContext('2d');
      c2.clearRect(0, 0, ancho, alto);
      c2.font = fuente;
      if ('letterSpacing' in c2) c2.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
      c2.fillStyle = '#ffffff';
      c2.textBaseline = 'alphabetic';
      const metrica = c2.measureText('H');
      const subida = metrica.fontBoundingBoxAscent || tam * 0.9;
      const mayuscula = metrica.actualBoundingBoxAscent || tam * 0.7;
      const mayus = cs.textTransform === 'uppercase';
      let ultimaBase = 0;
      for (const p of palabras) {
        const base = p.r.top + subida;
        ultimaBase = Math.max(ultimaBase, base);
        c2.fillText(mayus ? p.texto.toLocaleUpperCase('es-MX') : p.texto, p.r.left - r.left + margen, base - r.top + margen);
      }
      return {
        x: r.left - margen,
        y: r.top + desp - margen,
        w: ancho,
        h: alto,
        caja: { x: r.left, y: r.top + desp, w: r.width, h: r.height },
        // La línea de agua cruza la última línea del nombre un poco abajo de la mitad de las mayúsculas.
        linea: ultimaBase + desp - mayuscula * 0.42,
      };
    }

    function medir() {
      const desp = ventana.scrollY;
      m.ancho = doc.documentElement.clientWidth || ventana.innerWidth;
      m.alto = ventana.innerHeight;
      m.doc = Math.max(doc.documentElement.scrollHeight, m.alto + 1);
      m.cabecera = (cabecera ? cabecera.getBoundingClientRect().height : 64) + medidor.getBoundingClientRect().height;
      m.nombre = nombre ? medirNombre(desp) : null;
      m.superficie = m.nombre ? m.nombre.linea : m.alto * 0.6;
      texturaLista = false;
    }

    // ---------- el agua: WebGL ----------
    let gl = null;
    let lienzo = null;
    let prog = null;
    let progPeces = null;
    let bufPantalla = null;
    let bufPeces = null;
    let textura = null;
    let u = {};
    let up = {};
    let progSprite = null;
    let us = {};
    const esTelefono = Math.min(ventana.innerWidth, ventana.innerHeight) < 700;
    const escalaMax = esTelefono ? 0.75 : 0.8;
    let escala = Math.min(escalaMax, ventana.devicePixelRatio || 1);
    let calidad = esTelefono ? 0 : 1;

    // Programas, búferes y textura. Se vuelven a crear si el navegador pierde el contexto y lo devuelve.
    function recursosGL() {
      prog = programa(gl, VERTICES, AGUA);
      progPeces = programa(gl, PECES_VERTICES, PECES_FRAGMENTOS);
      bufPantalla = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, bufPantalla);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      bufPeces = gl.createBuffer();
      textura = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, textura);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
      for (const nombreU of ['uRes', 'uEscala', 'uT', 'uLinea', 'uAmp', 'uMetros', 'uFondo', 'uDesp', 'uNombreR', 'uHayNombre', 'uNombre', 'uCalidad', 'uCorte', 'uLuces']) {
        u[nombreU] = gl.getUniformLocation(prog, nombreU);
      }
      up = { uTam: gl.getUniformLocation(progPeces, 'uTam'), aPos: gl.getAttribLocation(progPeces, 'aPos'), aColor: gl.getAttribLocation(progPeces, 'aColor') };
      u.aPos = gl.getAttribLocation(prog, 'aPos');
      progSprite = programa(gl, SPRITE_VERTICES, SPRITE_FRAGMENTOS);
      us = {};
      for (const nombreU of ['uTam', 'uHoja', 'uAgua', 'uNiebla', 'uLuz', 'uAlfa']) us[nombreU] = gl.getUniformLocation(progSprite, nombreU);
      us.aPos = gl.getAttribLocation(progSprite, 'aPos');
      us.aUv = gl.getAttribLocation(progSprite, 'aUv');
    }
    try {
      lienzo = crear('canvas', 'descenso-agua' + (reducido ? ' fija' : ''), doc.body, doc.body.firstChild);
      gl = lienzo.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: 'default' });
      if (!gl) throw new Error('Sin WebGL');
      recursosGL();
    } catch (e) {
      // Sin WebGL el estilo sigue: el agua queda en los degradados de CSS.
      liberarGL();
      if (lienzo) lienzo.remove();
      lienzo = null;
      gl = null;
    }

    function liberarGL() {
      if (!gl) return;
      if (prog) gl.deleteProgram(prog);
      if (progPeces) gl.deleteProgram(progPeces);
      if (progSprite) gl.deleteProgram(progSprite);
      for (const h of Object.values(hojas)) { if (h.tex) gl.deleteTexture(h.tex); h.tex = null; }
      if (bufPantalla) gl.deleteBuffer(bufPantalla);
      if (bufPeces) gl.deleteBuffer(bufPeces);
      if (textura) gl.deleteTexture(textura);
      const perder = gl.getExtension('WEBGL_lose_context');
      if (perder) perder.loseContext();
      prog = progPeces = progSprite = bufPantalla = bufPeces = textura = null;
    }

    // Mientras el agua no tiene su primer cuadro (o si se pierde el contexto), se ve la versión de
    // CSS: el cielo baja hasta debajo del nombre y nada queda en tinta sobre un fondo oscuro.
    let perdido = false;
    let encendida = false;
    marcarRaiz('data-descenso-agua', gl && reducido ? 'fija' : 'css');

    function ajustarLienzo(altoCss) {
      const w = Math.max(1, Math.round(m.ancho * escala));
      const h = Math.max(1, Math.round(altoCss * escala));
      if (lienzo.width !== w || lienzo.height !== h) {
        lienzo.width = w;
        lienzo.height = h;
      }
      if (reducido) {
        lienzo.style.width = m.ancho + 'px';
        lienzo.style.height = altoCss + 'px';
      }
    }

    function subirTextura() {
      if (texturaLista || !gl || !m.nombre || !lienzoNombre) return;
      gl.bindTexture(gl.TEXTURE_2D, textura);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, lienzoNombre);
      texturaLista = true;
    }

    // ---------- el cardumen ----------
    const N = esTelefono ? 64 : 110;
    const peces = new Float32Array(N * 5);
    for (let i = 0; i < N; i++) {
      peces[i * 5] = Math.random() * ventana.innerWidth;
      peces[i * 5 + 1] = ventana.innerHeight * (0.65 + Math.random() * 0.3);
      peces[i * 5 + 2] = 40 + Math.random() * 20;
      peces[i * 5 + 3] = (Math.random() - 0.5) * 10;
      peces[i * 5 + 4] = Math.random();
    }
    const verticesPeces = new Float32Array(N * 6 * 6);
    const puntero = { x: -9999, y: -9999 };

    function moverPeces(dt, linea, t) {
      const arriba = Math.max(linea + 46, m.cabecera + 30);
      const abajo = m.alto + 60;
      const metaX = m.ancho * (0.5 + 0.36 * Math.sin(t * 0.07));
      const metaY = Math.max(arriba + 40, m.alto * (0.62 + 0.18 * Math.sin(t * 0.11)));
      for (let i = 0; i < N; i++) {
        const o = i * 5;
        const x = peces[o];
        const y = peces[o + 1];
        let sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, n = 0;
        for (let j = 0; j < N; j++) {
          if (j === i) continue;
          const dx = peces[j * 5] - x;
          const dy = peces[j * 5 + 1] - y;
          if (dx > 48 || dx < -48 || dy > 48 || dy < -48) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 > 2304) continue;
          n++;
          ax += peces[j * 5 + 2];
          ay += peces[j * 5 + 3];
          cx += dx;
          cy += dy;
          if (d2 < 196) { sx -= dx / (d2 + 1); sy -= dy / (d2 + 1); }
        }
        let vx = peces[o + 2];
        let vy = peces[o + 3];
        if (n) {
          vx += (ax / n - vx) * 0.05 + (cx / n) * 0.006 + sx * 18;
          vy += (ay / n - vy) * 0.05 + (cy / n) * 0.006 + sy * 18;
        }
        vx += (metaX - x) * 0.0009;
        vy += (metaY - y) * 0.0012;
        if (y < arriba) vy += (arriba - y) * 0.03;
        if (y > abajo) vy -= (y - abajo) * 0.03;
        const px = x - puntero.x;
        const py = y - puntero.y;
        const dp = px * px + py * py;
        if (dp < 12000) { vx += (px / Math.sqrt(dp + 1)) * 9; vy += (py / Math.sqrt(dp + 1)) * 9; }
        const v = Math.hypot(vx, vy) || 1;
        const tope = limitar(v, 28, 88);
        vx = (vx / v) * tope;
        vy = (vy / v) * tope;
        let nx = x + vx * dt;
        const ny = y + vy * dt;
        if (nx < -30) nx = m.ancho + 30;
        if (nx > m.ancho + 30) nx = -30;
        peces[o] = nx;
        peces[o + 1] = ny;
        peces[o + 2] = vx;
        peces[o + 3] = vy;
      }
    }

    function armarPeces(linea, metrosArriba, metrosAbajo) {
      let k = 0;
      const largo = esTelefono ? 7 : 9;
      const grueso = esTelefono ? 2.2 : 2.8;
      const poner = (x, y, r, g, b, a) => {
        verticesPeces[k++] = x; verticesPeces[k++] = y;
        verticesPeces[k++] = r * a; verticesPeces[k++] = g * a; verticesPeces[k++] = b * a; verticesPeces[k++] = a;
      };
      for (let i = 0; i < N; i++) {
        const o = i * 5;
        const x = peces[o];
        const y = peces[o + 1];
        const vx = peces[o + 2];
        const vy = peces[o + 3];
        const v = Math.hypot(vx, vy) || 1;
        const dx = vx / v;
        const dy = vy / v;
        const metros = Math.max(0, metrosArriba + (metrosAbajo - metrosArriba) * (y / m.alto));
        const sol = Math.exp(-metros / 260);
        const bio = suave(500, 2600, metros);
        const brilla = peces[o + 4] < 0.4;
        const sobreLinea = suave(linea + 6, linea + 30, y);
        const destello = 0.65 + 0.35 * Math.abs(dx);
        let r = 0.8, g = 0.93, b = 0.94;
        let a = 0.6 * sol * destello;
        if (brilla && bio > 0) {
          const mezcla = bio;
          r = r * (1 - mezcla) + 0.3 * mezcla;
          g = g * (1 - mezcla) + 1.0 * mezcla;
          b = b * (1 - mezcla) + 0.82 * mezcla;
          a = Math.max(a, 0.9 * bio);
        }
        a *= sobreLinea;
        const ex = -dy;
        const ey = dx;
        // En lo hondo los peces que brillan se encogen a un punto de luz.
        const chico = brilla ? 1 - 0.55 * bio : 1;
        const nariz = largo * 0.6 * chico;
        const cola = largo * 0.7 * chico;
        const lado = grueso * 0.5 * (brilla ? 1 - 0.2 * bio : 1);
        const sx = x + dx * largo * 0.15;
        const sy = y + dy * largo * 0.15;
        poner(x + dx * nariz, y + dy * nariz, r, g, b, a); poner(sx + ex * lado, sy + ey * lado, r, g, b, a); poner(x - dx * cola, y - dy * cola, r, g, b, a * 0.7);
        poner(x + dx * nariz, y + dy * nariz, r, g, b, a); poner(x - dx * cola, y - dy * cola, r, g, b, a * 0.7); poner(sx - ex * lado, sy - ey * lado, r, g, b, a);
      }
      return k / 6;
    }

    // ---------- cada cuadro ----------
    const amp = esTelefono ? 6.5 : 9;
    const inicioReloj = ventana.performance.now();
    let ultimo = inicioReloj;
    let promedio = 16;
    let cuadros = 0;
    let estadoCielo = null;
    const ascenso = !reducido;
    let inicioAscenso = 0;

    function lineaEnPantalla(desp, t) {
      const fija = m.superficie - desp;
      if (!ascenso) return fija;
      const k = limitar((t - inicioAscenso) / 0.7, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      // Al entrar el agua sube desde abajo hasta su lugar, solo si la superficie está a la vista.
      if (fija < -40 || fija > m.alto + 40) return fija;
      return fija + (1 - e) * (m.alto - fija + 60);
    }

    function recortarNombre(linea, t, desp, siempre) {
      if (!m.nombre || !gl || perdido) return;
      const caja = m.nombre.caja;
      const arriba = caja.y - desp;
      if (!siempre && (arriba > m.alto + 50 || arriba + caja.h < -50)) return;
      const puntos = [];
      const pasos = 28;
      for (let i = pasos; i >= 0; i--) {
        const xl = (caja.w + 80) * (i / pasos) - 40;
        const yl = linea + ola(caja.x + xl, t, amp) - arriba;
        puntos.push(xl.toFixed(1) + 'px ' + yl.toFixed(1) + 'px');
      }
      tocar(nombre, 'clip-path', 'polygon(-40px -400px, ' + (caja.w + 40).toFixed(1) + 'px -400px, ' + puntos.join(', ') + ')');
    }

    function moverCielo(desp) {
      if (reducido || !enCielo.length) return;
      if (desp > 600 && estadoCielo === 'fuera') return;
      const k = limitar(desp / 110, 0, 1);
      for (const el of enCielo) {
        tocar(el, 'transform', k ? 'translate3d(0,' + (Math.min(desp, 600) * 0.35).toFixed(1) + 'px,0)' : null);
        tocar(el, 'opacity', k ? (1 - k).toFixed(3) : null);
        if (!esTelefono) tocar(el, 'filter', k ? 'blur(' + (k * 6).toFixed(2) + 'px)' : null);
      }
      estadoCielo = k >= 1 ? 'fuera' : 'dentro';
    }

    function actualizarMedidor(linea, desp) {
      const lectura = desp + m.cabecera + (m.alto - m.cabecera) * 0.35;
      const metros = Math.max(0, metrosDe(lectura));
      const redondo = metros < 1 ? 0 : Math.round(metros / 10) * 10;
      const zona = metros < 1 ? ZONAS[0] : ZONAS.find((z) => metros < z.hasta && z.hasta > 0);
      const texto = zona.nombre + '|' + redondo;
      marcarRaiz('data-descenso-zona', linea > m.cabecera ? 'cielo' : 'agua');
      if (texto === ultimaLectura) return;
      ultimaLectura = texto;
      zonaTexto.textContent = zona.nombre;
      cifraTexto.textContent = '−' + redondo.toLocaleString('es-MX') + ' m';
      barra.style.setProperty('--avance', limitar(metros / 4800, 0, 1).toFixed(3));
      barra.style.setProperty('--acento-medidor', metros > 1000 ? '#4DFFD2' : '#FF9F45');
    }

    function pintar(t, desp, linea, altoCss) {
      if (!gl || gl.isContextLost()) return;
      subirTextura();
      gl.viewport(0, 0, lienzo.width, lienzo.height);
      gl.disable(gl.BLEND);
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufPantalla);
      gl.enableVertexAttribArray(u.aPos);
      gl.vertexAttribPointer(u.aPos, 2, gl.FLOAT, false, 0, 0);
      const metrosArriba = metrosDe(desp);
      const metrosAbajo = metrosDe(desp + altoCss);
      gl.uniform2f(u.uRes, lienzo.width, lienzo.height);
      gl.uniform1f(u.uEscala, lienzo.width / m.ancho);
      gl.uniform1f(u.uT, t);
      gl.uniform1f(u.uLinea, linea);
      gl.uniform1f(u.uAmp, amp);
      gl.uniform2f(u.uMetros, metrosArriba, metrosAbajo);
      gl.uniform1f(u.uFondo, m.doc - desp);
      gl.uniform1f(u.uDesp, desp);
      gl.uniform1f(u.uCalidad, calidad);
      gl.uniform1f(u.uCorte, reducido ? altoCss : 1e6);
      gl.uniform4fv(u.uLuces, luces);
      if (m.nombre && texturaLista) {
        gl.uniform4f(u.uNombreR, m.nombre.x, m.nombre.y - desp, m.nombre.w, m.nombre.h);
        gl.uniform1f(u.uHayNombre, 1);
      } else {
        gl.uniform1f(u.uHayNombre, 0);
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textura);
      gl.uniform1i(u.uNombre, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return [metrosArriba, metrosAbajo];
    }

    // Los peces y los animales grandes comparten el mismo programa: triángulos con color.
    function dibujarTriangulos(datos, cuantos, altoCss) {
      if (!cuantos) return;
      gl.useProgram(progPeces);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufPeces);
      gl.bufferData(gl.ARRAY_BUFFER, datos.subarray(0, cuantos * 6), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(up.aPos);
      gl.vertexAttribPointer(up.aPos, 2, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(up.aColor);
      gl.vertexAttribPointer(up.aColor, 4, gl.FLOAT, false, 24, 8);
      gl.uniform2f(up.uTam, m.ancho, altoCss);
      gl.drawArrays(gl.TRIANGLES, 0, cuantos);
      gl.disableVertexAttribArray(up.aColor);
    }
    function pintarPeces(linea, metros) {
      dibujarTriangulos(verticesPeces, armarPeces(linea, metros[0], metros[1]), m.alto);
    }

    // ---------- los animales grandes ----------
    // Tiburones, mantarrayas y peces espada donde todavía hay luz; en lo hondo, el rape con su
    // señuelo encendido. Son modelos de Quaternius renderizados en Blender a hojas de 12 cuadros
    // de su ciclo de nado: aquí cada animal es un rectángulo con su hoja que avanza por el agua,
    // teñido y velado por la profundidad. Van detrás de todo el contenido: nunca tapan texto.
    const ESPECIES = {
      tiburon: { cuadro: [288, 116], ancho: [170, 260], vel: 46, ciclo: 1.3, zona: 'luz' },
      manta: { cuadro: [256, 173], ancho: [150, 230], vel: 30, ciclo: 2.6, zona: 'luz' },
      'pez-espada': { cuadro: [240, 146], ancho: [120, 180], vel: 58, ciclo: 0.9, zona: 'luz' },
      rape: { cuadro: [200, 123], ancho: [104, 140], vel: 16, ciclo: 1.6, zona: 'honda', senuelo: [0.93, 0.46] },
      // La medusa la modelé en Blender: su luz es la campana entera.
      medusa: { cuadro: [104, 160], ancho: [62, 84], vel: 10, ciclo: 1.8, zona: 'honda', senuelo: [0.5, 0.22] },
    };
    // Cada zona tiene su turno de especies: nunca la misma dos veces seguidas ni dos iguales a la vista.
    const turnos = { luz: 0, honda: 0 };
    const MAX_ANIMALES = esTelefono ? 3 : 4;
    const animales = [];
    const luces = new Float32Array(16);
    const hojas = {};
    const verticesSprite = new Float32Array(24);
    let esperaNacer = 0.8;
    let despAnterior = null;
    let ultimaMarca = 0;
    let primeros = false;

    function rampaJS(metros) {
      const k = limitar(Math.log(1 + metros / 60) / Math.log(81), 0, 1);
      const a = [0.043, 0.31, 0.361];
      const b = [0.039, 0.184, 0.239];
      const c = [0.012, 0.067, 0.102];
      const mezcla = (x, y, f) => [x[0] + (y[0] - x[0]) * f, x[1] + (y[1] - x[1]) * f, x[2] + (y[2] - x[2]) * f];
      return k < 0.5 ? mezcla(a, b, k / 0.5) : mezcla(b, c, limitar((k - 0.5) / 0.42, 0, 1));
    }

    // Las hojas se piden cuando hacen falta: las de la zona con luz al entrar, la del rape al acercarse a lo hondo.
    function subirHoja(h) {
      if (!gl || perdido || !h.lista) return;
      if (h.tex) gl.deleteTexture(h.tex);
      h.tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, h.tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, h.img);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.activeTexture(gl.TEXTURE0);
    }
    function pedirHoja(especie) {
      if (hojas[especie] || !gl) return;
      const img = new Image();
      const h = { img, tex: null, lista: false, fallo: false };
      hojas[especie] = h;
      img.decoding = 'async';
      img.onload = () => {
        if (!vivo) return;
        h.lista = true;
        subirHoja(h);
        if (reducido) pintarFijo();
      };
      // Si la hoja no llega, esa especie simplemente no aparece.
      img.onerror = () => { h.fallo = true; };
      img.src = new URL('./recursos/' + especie + '.webp', import.meta.url).href;
      limpiezas.push(() => { img.onload = null; img.onerror = null; });
    }
    const hojaLista = (especie) => !!(hojas[especie] && hojas[especie].tex);

    // Qué tanto del ancho de la pantalla queda descubierto a esa altura: sin panel, tarjeta ni imagen encima.
    // El panel de la presentación es un pseudoelemento de su rejilla: se reconoce por la altura del cargo.
    const rejilla = nombre ? nombre.parentElement : null;
    const cargo = rejilla ? rejilla.querySelector('.cargo') : null;
    function aguaLibre(y) {
      const xs = [];
      for (let i = 0; i < 5; i++) {
        const px = m.ancho * (0.1 + i * 0.2);
        let e = doc.elementFromPoint(px, y);
        let tapado = !!(e && cargo && rejilla.contains(e) && y >= cargo.getBoundingClientRect().top);
        for (let n = 0; e && e !== doc.body && n < 8 && !tapado; n++, e = e.parentElement) {
          const cs = ventana.getComputedStyle(e);
          const fondo = cs.backgroundColor.match(/[\d.]+/g);
          if (e.tagName === 'IMG' || cs.backgroundImage !== 'none' || (fondo && (fondo.length < 4 || parseFloat(fondo[3]) > 0.5))) tapado = true;
        }
        if (!tapado) xs.push(px);
      }
      return xs;
    }

    function nacer(linea, mArriba, mAbajo, enPantalla) {
      const arriba = Math.max(linea + 80, m.cabecera + 60);
      const abajo = m.alto - 40;
      if (abajo - arriba < 50) return;
      // Nacen donde se vean: de varias alturas al azar, la que tenga más agua descubierta y nadie cerca.
      let y = 0;
      let mejor = -1;
      for (let i = 0; i < 8 && mejor < 0.8; i++) {
        const otra = arriba + Math.random() * (abajo - arriba);
        const libre = aguaLibre(otra).length / 5 - (animales.some((o) => Math.abs(o.y - otra) < 70) ? 0.5 : 0);
        if (libre > mejor) { mejor = libre; y = otra; }
      }
      const metros = Math.max(0, mArriba + (mAbajo - mArriba) * (y / m.alto));
      const zona = metros > 1300 ? 'honda' : 'luz';
      const orden = Object.keys(ESPECIES).filter((k) => ESPECIES[k].zona === zona);
      let especie = null;
      for (let i = 0; i < orden.length && !especie; i++) {
        const k = orden[(turnos[zona] + i) % orden.length];
        if (hojaLista(k) && !animales.some((x) => x.especie === k)) {
          especie = k;
          turnos[zona] = (turnos[zona] + i + 1) % orden.length;
        }
      }
      if (!especie) return;
      const e = ESPECIES[especie];
      const lejos = Math.random() * 0.5;
      const tam = e.ancho[esTelefono ? 0 : 1] * (0.85 + Math.random() * 0.3) * (1 - lejos * 0.4);
      const vel = e.vel * (0.85 + Math.random() * 0.3) * (1 - lejos * 0.3);
      const dir = Math.random() < 0.5 ? 1 : -1;
      // La medusa es lenta: aparece ya en el agua, con su fundido, en lugar de entrar por un lado.
      const x = enPantalla || especie === 'medusa' ? m.ancho * (0.2 + Math.random() * 0.6) : dir > 0 ? -tam * 0.6 : m.ancho + tam * 0.6;
      animales.push({ especie, x, y, dir, vel, tam, lejos, fase: Math.random(), edad: 0, apto: 1 });
      animales.sort((p, q) => q.lejos - p.lejos);
    }

    function moverAnimales(dt, linea, mArriba, mAbajo, desp) {
      const dy = despAnterior === null ? 0 : limitar(desp - despAnterior, -240, 240);
      despAnterior = desp;
      for (let i = animales.length - 1; i >= 0; i--) {
        const a = animales[i];
        const e = ESPECIES[a.especie];
        a.edad += dt;
        // Se quedan atrás al desplazarse, más los que están lejos: están detrás del contenido.
        a.y -= dy * 0.22 * (1 - a.lejos * 0.5);
        a.x += a.dir * a.vel * dt;
        // El ciclo de nado va al paso de su velocidad.
        a.fase += (dt / e.ciclo) * (a.vel / e.vel);
        if (a.especie === 'manta') a.y += Math.cos(a.fase * 6.283) * 6 * dt;
        if (a.especie === 'rape') a.y += Math.sin(a.fase * 3.1) * 3 * dt;
        // La medusa avanza a empujones: sube cuando la campana se cierra.
        if (a.especie === 'medusa') a.y -= (3 + 12 * Math.max(0, Math.sin(a.fase * 6.283))) * dt;
        const fuera = a.x < -a.tam || a.x > m.ancho + a.tam || a.y > m.alto + a.tam || a.y < Math.max(linea, 0) - a.tam;
        if (fuera || (a.apto < 0.02 && a.edad > 1.5)) animales.splice(i, 1);
      }
      esperaNacer -= dt;
      if (animales.length < MAX_ANIMALES && esperaNacer <= 0) {
        nacer(linea, mArriba, mAbajo, false);
        esperaNacer = 1.5 + Math.random() * 2.5;
      }
    }

    // Calcula qué se ve de cada animal y prende la luz del señuelo antes de pintar el agua.
    function prepararAnimales(linea, mArriba, mAbajo, altoCss) {
      luces.fill(0);
      let nl = 0;
      const lista = [];
      for (const a of animales) {
        const e = ESPECIES[a.especie];
        if (!hojaLista(a.especie)) continue;
        const metros = Math.max(0, mArriba + (mAbajo - mArriba) * (a.y / altoCss));
        a.apto = e.zona === 'honda' ? suave(800, 1400, metros) : 1 - suave(1500, 2600, metros);
        const alto = a.tam * e.cuadro[1] / e.cuadro[0];
        const alfa = Math.min(1, a.edad / 0.8) * a.apto * suave(linea + 10, linea + 50, a.y - alto * 0.3);
        if (alfa < 0.01) continue;
        const sol = Math.exp(-metros / 260);
        const caja = [a.x - a.tam / 2, a.y - alto / 2, a.x + a.tam / 2, a.y + alto / 2];
        if (e.senuelo && nl < 4) {
          const lx = a.dir > 0 ? caja[0] + e.senuelo[0] * a.tam : caja[2] - e.senuelo[0] * a.tam;
          luces.set([lx, caja[1] + e.senuelo[1] * alto, a.tam * (a.especie === 'medusa' ? 0.6 : 0.32), 0.75 * alfa], nl * 4);
          nl++;
        }
        // En lo hondo ya no hay sol que los oscurezca: los alumbra su propio señuelo, y se ven más.
        const hondo = e.zona === 'honda';
        // La medusa es pura luz: no se oscurece ni se vela.
        const propia = a.especie === 'medusa';
        lista.push({ a, caja, alfa, agua: rampaJS(metros), luz: propia ? 1.15 : hondo ? 0.85 : 0.42 + 0.58 * sol, niebla: propia ? 0.04 : hondo ? 0.12 + a.lejos * 0.3 : Math.min(0.8, 0.14 + a.lejos * 0.5 + (1 - sol) * 0.25) });
      }
      return lista;
    }

    function dibujarAnimales(lista, altoCss) {
      if (!lista.length || !progSprite) return;
      gl.useProgram(progSprite);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufPeces);
      gl.enableVertexAttribArray(us.aPos);
      gl.enableVertexAttribArray(us.aUv);
      gl.uniform2f(us.uTam, m.ancho, altoCss);
      gl.uniform1i(us.uHoja, 1);
      gl.activeTexture(gl.TEXTURE1);
      for (const v of lista) {
        const a = v.a;
        const n = ((Math.floor(a.fase * 12) % 12) + 12) % 12;
        const u0 = (n % 4) / 4;
        const v0 = Math.floor(n / 4) / 3;
        // Las hojas miran a la derecha; para nadar a la izquierda se voltea la textura.
        const izq = a.dir > 0 ? u0 : u0 + 0.25;
        const der = a.dir > 0 ? u0 + 0.25 : u0;
        const [x0, y0, x1, y1] = v.caja;
        const v1 = v0 + 1 / 3;
        verticesSprite.set([x0, y0, izq, v0, x1, y0, der, v0, x0, y1, izq, v1, x1, y0, der, v0, x1, y1, der, v1, x0, y1, izq, v1]);
        gl.bufferData(gl.ARRAY_BUFFER, verticesSprite, gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(us.aPos, 2, gl.FLOAT, false, 16, 0);
        gl.vertexAttribPointer(us.aUv, 2, gl.FLOAT, false, 16, 8);
        gl.bindTexture(gl.TEXTURE_2D, hojas[a.especie].tex);
        gl.uniform3f(us.uAgua, v.agua[0], v.agua[1], v.agua[2]);
        gl.uniform1f(us.uLuz, v.luz);
        gl.uniform1f(us.uNiebla, v.niebla);
        gl.uniform1f(us.uAlfa, v.alfa);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      gl.disableVertexAttribArray(us.aUv);
      gl.activeTexture(gl.TEXTURE0);
    }

    // Deja escrito en el lienzo qué animales están a la vista y dónde, sin tocar el contenido.
    function anotarAnimales(vistos, ahora) {
      if (ahora - ultimaMarca < 250) return;
      ultimaMarca = ahora;
      lienzo.dataset.animales = vistos.map(({ a }) => a.especie + ':' + Math.round(a.x) + ',' + Math.round(a.y) + ',' + Math.round(a.tam)).join(' ');
    }

    // Si el teléfono no da el cuadro, primero baja la resolución del agua y luego las capas finas.
    function ajustarCalidad(dt) {
      promedio += (dt - promedio) * 0.08;
      cuadros++;
      if (cuadros % 45 !== 0) return;
      if (promedio > 21 && escala > 0.3) {
        escala = Math.max(0.3, escala * 0.82);
        if (escala < 0.42) calidad = 0;
        ajustarLienzo(m.alto);
      } else if (promedio < 13 && escala < escalaMax) {
        escala = Math.min(escalaMax, escala * 1.08);
        ajustarLienzo(m.alto);
      }
    }

    function cuadro(ahora) {
      if (!vivo) return;
      idCuadro = ventana.requestAnimationFrame(cuadro);
      const dt = Math.min(0.05, (ahora - ultimo) / 1000);
      ajustarCalidad(ahora - ultimo);
      ultimo = ahora;
      const t = ((ahora - inicioReloj) / 1000) % 3600;
      const desp = ventana.scrollY;
      if (!encendida) {
        // El agua se enciende cuando ya llegó la fuente del nombre y está medido con ella.
        if (!fuenteLista || pendiente || perdido) {
          moverCielo(desp);
          actualizarMedidor(m.superficie - desp, desp);
          return;
        }
        inicioAscenso = t;
      }
      const linea = lineaEnPantalla(desp, t);
      const mArriba = metrosDe(desp);
      const mAbajo = metrosDe(desp + m.alto);
      // Los primeros ya están en el agua cuando esta termina de subir.
      if (!primeros && encendida && t - inicioAscenso > 0.75) {
        primeros = true;
        nacer(linea, mArriba, mAbajo, true);
        nacer(linea, mArriba, mAbajo, true);
      }
      if (mAbajo > 700) { pedirHoja('rape'); pedirHoja('medusa'); }
      moverAnimales(dt, linea, mArriba, mAbajo, desp);
      const grandes = prepararAnimales(linea, mArriba, mAbajo, m.alto);
      const metros = perdido ? null : pintar(t + 2, desp, linea, m.alto);
      if (metros) {
        dibujarAnimales(grandes, m.alto);
        anotarAnimales(grandes, ahora);
        moverPeces(dt, linea, t);
        pintarPeces(linea, metros);
        if (!encendida) {
          encendida = true;
          lienzo.classList.add('encendida');
          marcarRaiz('data-descenso-agua', 'viva');
        }
      }
      recortarNombre(linea, t + 2, desp);
      moverCielo(desp);
      actualizarMedidor(encendida ? linea : m.superficie - desp, desp);
    }

    // Con movimiento reducido el agua es una sola imagen: se pinta una vez y no hay cuadros.
    function pintarFijo() {
      if (!vivo) return;
      const t = 8;
      if (gl) {
        const altoCss = Math.ceil(inicio ? inicio.getBoundingClientRect().bottom + ventana.scrollY : m.alto);
        escala = Math.min(0.75, ventana.devicePixelRatio || 1);
        calidad = 1;
        ajustarLienzo(altoCss);
        const guardaDesp = ventana.scrollY;
        // En la imagen fija también hay animales, quietos, en el agua bajo el nombre.
        animales.length = 0;
        animales.push({ especie: 'tiburon', x: m.ancho * 0.64, y: m.superficie + (esTelefono ? 105 : 135), dir: -1, vel: 0, tam: ESPECIES.tiburon.ancho[esTelefono ? 0 : 1], lejos: 0, fase: 0.3, edad: 9, apto: 1 });
        if (!esTelefono) animales.push({ especie: 'manta', x: m.ancho * 0.88, y: m.superficie + 115, dir: -1, vel: 0, tam: 190, lejos: 0.2, fase: 0.6, edad: 9, apto: 1 });
        const grandes = prepararAnimales(m.superficie, metrosDe(0), metrosDe(altoCss), altoCss);
        pintar(t, 0, m.superficie, altoCss);
        dibujarAnimales(grandes, altoCss);
        anotarAnimales(grandes, Infinity);
        recortarNombre(m.superficie - guardaDesp, t, guardaDesp, true);
      }
      actualizarMedidor(m.superficie - ventana.scrollY, ventana.scrollY);
    }

    // ---------- el lecho marino que enmarca cada tarjeta ----------
    // Para cada tarjeta se dibuja un SVG que sigue su rectángulo redondeado: enredaderas con hojas
    // que recorren tramos del borde y se enroscan en las esquinas, coral ramificado en una o dos
    // esquinas, matas de algas que se mecen y detalles chicos. Todo crece en un anillo que va de
    // 5 px dentro del marco a 28 px afuera: nunca llega al área de texto. Qué tramos, qué esquinas,
    // qué colores y qué detalles salen de una semilla por índice, así no cambian al recargar.
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const ANILLO = 28;
    const DENTRO = 5;
    const SELECTOR_TARJETAS = '.proyecto, .mas-sitios, .puesto, .subtitulo, .idiomas, .tesis, .grupo, .canal, .dato';
    // Las tarjetitas de datos tienen otras al lado: su anillo es angosto para no invadirlas.
    const anilloDe = (el) => (el.classList.contains('dato') ? 6 : ANILLO);
    // Tres tonos por pieza: sombra, cuerpo y la orilla de arriba, que recibe la luz de la superficie.
    const PALETAS = {
      superficie: [
        { tallo: ['#0F3F22', '#4FB86A', '#D2F7B0'], coral: ['#7A2218', '#F0704F', '#FFC7A6'], detalle: ['#FF8A45', '#FFE0C2'] },
        { tallo: ['#22420F', '#8BC34A', '#E6F7A6'], coral: ['#7E2A4E', '#F07FA6', '#FFD3E1'], detalle: ['#FF6E5A', '#FFDCD2'] },
        { tallo: ['#0A3A35', '#36C29B', '#B8FBE0'], coral: ['#8A4012', '#FFA04F', '#FFE0A8'], detalle: ['#FFC23D', '#FFF0C2'] },
      ],
      media: [
        { tallo: ['#123E4A', '#2C7A88', '#8CCFD9'], coral: ['#3A3E7A', '#6A70BE', '#B9BDF0'], detalle: ['#8F95E0', '#DADDFF'] },
        { tallo: ['#16364F', '#336F95', '#94C4E6'], coral: ['#3F2F6E', '#7A62B8', '#C8B8F2'], detalle: ['#6FA9D8', '#D2E8FF'] },
        { tallo: ['#0F3E3D', '#287B74', '#88D3C9'], coral: ['#2D4A78', '#5784C2', '#AFCBF1'], detalle: ['#7CC4D0', '#D4F4F8'] },
      ],
      hondo: [
        { tallo: ['#0B2A33', '#1F5A66', '#5FA3AE'], coral: ['#23284A', '#45508A', '#8A93CC'], detalle: ['#5C88A8', '#A9C8DE'] },
        { tallo: ['#0C2433', '#22506B', '#6799B8'], coral: ['#2A2147', '#544188', '#9C88CC'], detalle: ['#4F8AA0', '#A5D2DE'] },
      ],
      abisal: [
        { tallo: ['#0A2E2C', '#22A386', '#4DFFD2'], coral: ['#0E3540', '#2ACFAE', '#9CFFE9'], detalle: ['#4DFFD2', '#C2FFF1'], brillo: true },
        { tallo: ['#0B2A35', '#2295A8', '#7BE9FF'], coral: ['#102E3E', '#2BB9C4', '#A6F6FF'], detalle: ['#5EE6FF', '#CBF8FF'], brillo: true },
      ],
    };
    const DETALLES = ['percebes', 'burbujas', 'anemona', 'estrella'];
    let arrecife = [];
    let anchoCoral = 0;
    const vigiaBorde = 'IntersectionObserver' in ventana ? new ventana.IntersectionObserver((entradas) => {
      // Las algas solo se mecen mientras su tarjeta está cerca de la pantalla.
      for (const en of entradas) {
        en.target.classList.toggle('en-vista', en.isIntersecting);
        const alga = en.target.nextElementSibling;
        if (alga && alga.classList.contains('descenso-alga')) alga.classList.toggle('en-vista', en.isIntersecting);
      }
    }, { rootMargin: '200px 0px' }) : null;
    const vigiaTamano = 'ResizeObserver' in ventana ? new ventana.ResizeObserver((entradas) => {
      for (const en of entradas) {
        const datos = arrecife.find((d) => d.medida === en.target);
        if (datos) dibujarBorde(datos);
      }
    }) : null;

    // Azar con semilla: el mismo índice da siempre el mismo borde.
    function azarDe(semilla) {
      let a = semilla >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    // El contorno de la tarjeta: un punto y su normal hacia afuera para cada fracción s del perímetro.
    function contorno(W, H, r) {
      r = Math.max(0, Math.min(r, W / 2, H / 2));
      const recta = [W - 2 * r, H - 2 * r];
      const arco = (Math.PI / 2) * r;
      const tramos = [recta[0], arco, recta[1], arco, recta[0], arco, recta[1], arco];
      const total = tramos.reduce((x, y) => x + y, 0);
      return {
        total,
        en(s) {
          let d = (((s % 1) + 1) % 1) * total;
          let i = 0;
          while (i < 7 && d > tramos[i]) { d -= tramos[i]; i++; }
          const k = tramos[i] ? d / tramos[i] : 0;
          const esquina = (cx, cy, a0) => { const a = a0 + k * Math.PI / 2; return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) }; };
          switch (i) {
            case 0: return { x: r + d, y: 0, nx: 0, ny: -1 };
            case 1: return esquina(W - r, r, -Math.PI / 2);
            case 2: return { x: W, y: r + d, nx: 1, ny: 0 };
            case 3: return esquina(W - r, H - r, 0);
            case 4: return { x: W - r - d, y: H, nx: 0, ny: 1 };
            case 5: return esquina(r, H - r, Math.PI / 2);
            case 6: return { x: 0, y: H - r - d, nx: -1, ny: 0 };
            default: return esquina(r, r, Math.PI);
          }
        },
      };
    }

    function dibujarBorde(datos) {
      const { svg, medida, indice, azarBase, paleta, plan } = datos;
      const W = medida.offsetWidth;
      const H = medida.offsetHeight;
      if (!W || !H) return;
      const r = parseFloat(ventana.getComputedStyle(datos.radio || medida).borderTopLeftRadius) || 14;
      const caja = medida.getBoundingClientRect();
      const anchoPagina = doc.documentElement.clientWidth;
      // A los lados el anillo no sale de la página.
      const A = datos.anillo;
      const izq = Math.max(0, Math.min(A, caja.left - 5));
      const der = Math.max(0, Math.min(A, anchoPagina - caja.right - 5));
      const vista = `${-izq} ${-A} ${W + izq + der} ${H + 2 * A}`;
      svg.style.left = -izq + 'px';
      svg.style.top = -A + 'px';
      svg.style.width = W + izq + der + 'px';
      svg.style.height = H + 2 * A + 'px';
      const az = azarDe(azarBase);
      const c = contorno(W, H, r);
      // Un punto vale si está en el anillo: fuera del área de texto y dentro de la página.
      const vale = (x, y) => x >= -izq && x <= W + der && y >= -A && y <= H + A && !(x > DENTRO && x < W - DENTRO && y > DENTRO && y < H - DENTRO);
      const tierra = (s, d) => { const p = c.en(s); return { x: p.x + p.nx * d, y: p.y + p.ny * d, nx: p.nx, ny: p.ny }; };
      const atrapar = (p) => ({ x: Math.max(-izq + 1, Math.min(W + der - 1, p.x)), y: Math.max(-A + 1, Math.min(H + A - 1, p.y)) });
      const capas = { fondo: [], cuerpo: [], luz: [], meces: [] };
      const f = (n) => n.toFixed(1);
      const brillo = paleta.brillo;

      // Una cinta de grosor variable: la base de las enredaderas, los tallos y las hojas largas.
      function cinta(puntos, ancho, colores, destino) {
        const izqP = [];
        const derP = [];
        const n = puntos.length;
        for (let i = 0; i < n; i++) {
          const a = puntos[Math.max(0, i - 1)];
          const b = puntos[Math.min(n - 1, i + 1)];
          let tx = b.x - a.x;
          let ty = b.y - a.y;
          const l = Math.hypot(tx, ty) || 1;
          tx /= l; ty /= l;
          const t = i / (n - 1);
          const w = (ancho * Math.pow(Math.sin(Math.PI * Math.min(0.98, Math.max(0.02, t))), 0.55) + 0.5) / 2;
          izqP.push([puntos[i].x - ty * w, puntos[i].y + tx * w]);
          derP.push([puntos[i].x + ty * w, puntos[i].y - tx * w]);
        }
        const d = 'M' + izqP.map((p) => f(p[0]) + ' ' + f(p[1])).join('L') + 'L' + derP.reverse().map((p) => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
        const linea = 'M' + puntos.map((p) => f(p.x) + ' ' + f(p.y - 0.5)).join('L');
        (destino || capas.cuerpo).push(`<path d="${d}" fill="${colores[1]}" stroke="${colores[0]}" stroke-width="0.9" stroke-linejoin="round"/>`);
        capas.luz.push(`<path d="${linea}" fill="none" stroke="${colores[2]}" stroke-width="${f(Math.max(0.6, ancho * 0.28))}" stroke-linecap="round" opacity="0.8"/>`);
        if (brillo) capas.fondo.push(`<path d="${linea}" fill="none" stroke="${colores[2]}" stroke-width="${f(ancho * 3)}" stroke-linecap="round" opacity="0.14"/>`);
      }
      // Una fronda de alga: nace angosta, se ensancha y termina en punta, con la punta doblada.
      function hoja(p, ang, largo, ancho, colores, doblez) {
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const px = -dy, py = dx;
        const fin = { x: p.x + dx * largo + px * doblez, y: p.y + dy * largo + py * doblez };
        const medio = { x: p.x + dx * largo * 0.55 + px * doblez * 0.4, y: p.y + dy * largo * 0.55 + py * doblez * 0.4 };
        if (!vale(fin.x, fin.y) || !vale(medio.x, medio.y)) return;
        // También donde la fronda se abomba: ninguna curva entra al área de texto.
        const lado1 = { x: medio.x + px * ancho * 1.1, y: medio.y + py * ancho * 1.1 };
        const lado2 = { x: medio.x - px * ancho * 0.9, y: medio.y - py * ancho * 0.9 };
        if (!vale(lado1.x, lado1.y) || !vale(lado2.x, lado2.y)) return;
        const a1 = { x: p.x + dx * largo * 0.3 + px * ancho, y: p.y + dy * largo * 0.3 + py * ancho };
        const a2 = { x: medio.x + px * ancho * 1.1, y: medio.y + py * ancho * 1.1 };
        const b1 = { x: medio.x - px * ancho * 0.9, y: medio.y - py * ancho * 0.9 };
        const b2 = { x: p.x + dx * largo * 0.3 - px * ancho * 0.8, y: p.y + dy * largo * 0.3 - py * ancho * 0.8 };
        capas.cuerpo.push(`<path d="M${f(p.x)} ${f(p.y)}C${f(a1.x)} ${f(a1.y)} ${f(a2.x)} ${f(a2.y)} ${f(fin.x)} ${f(fin.y)}C${f(b1.x)} ${f(b1.y)} ${f(b2.x)} ${f(b2.y)} ${f(p.x)} ${f(p.y)}Z" fill="${colores[1]}" stroke="${colores[0]}" stroke-width="0.7" stroke-linejoin="round"/>`);
        capas.luz.push(`<path d="M${f(p.x)} ${f(p.y)}Q${f(medio.x)} ${f(medio.y)} ${f(p.x + (fin.x - p.x) * 0.85)} ${f(p.y + (fin.y - p.y) * 0.85)}" fill="none" stroke="${colores[2]}" stroke-width="0.7" stroke-linecap="round" opacity="0.9"/>`);
      }
      function zarcillo(p, sentido, colores) {
        // Una espiral corta que se enrosca hacia afuera.
        const base = Math.atan2(p.ny, p.nx);
        const puntos = [];
        for (let k = 0; k <= 18; k++) {
          const th = k / 18 * Math.PI * 2.6;
          const rad = 1 + k * 0.38;
          const cx = p.x + p.nx * 7;
          const cy = p.y + p.ny * 7;
          puntos.push({ x: cx + Math.cos(base + Math.PI + sentido * th) * rad, y: cy + Math.sin(base + Math.PI + sentido * th) * rad });
        }
        if (!puntos.every((q) => vale(q.x, q.y))) return;
        capas.cuerpo.push(`<path d="M${puntos.map((q) => f(q.x) + ' ' + f(q.y)).join('L')}" fill="none" stroke="${colores[1]}" stroke-width="1.3" stroke-linecap="round"/>`);
      }

      // Enredaderas: tramos del borde con un tallo ondulado, hojas alternadas y zarcillos al final.
      for (const [s0, s1] of plan.tramos) {
        const largo = (s1 - s0) * c.total;
        const n = Math.max(6, Math.round(largo / 3));
        const fase = az() * 6.28;
        const puntos = [];
        for (let i = 0; i <= n; i++) {
          const s = s0 + (s1 - s0) * i / n;
          const d = Math.min(A - 2, 3 + 4 * Math.sin(i / n * Math.PI * (2 + plan.ondas) + fase));
          puntos.push(atrapar(tierra(s, d)));
        }
        cinta(puntos, plan.grosor, paleta.tallo);
        // En algunas tarjetas, un segundo tallo más fino se enreda con el primero.
        if (plan.doble) {
          const otros = [];
          for (let i = 0; i <= n; i++) {
            const t = i / n;
            otros.push(atrapar(tierra(s0 + (s1 - s0) * (0.08 + t * 0.84), 3 + 4 * Math.sin(t * Math.PI * (3 + plan.ondas) + fase + 2.4))));
          }
          cinta(otros, plan.grosor * 0.55, paleta.tallo);
        }
        // Hojas a distancias irregulares, alternando lados, más grandes hacia el centro del tramo.
        let lado = 1;
        for (let i = 2 + Math.floor(az() * 3); i < puntos.length - 2; i += plan.densidad + Math.floor(az() * 4)) {
          const t = i / n;
          const p = tierra(s0 + (s1 - s0) * t, 3);
          const tang = Math.atan2(p.ny, p.nx) - Math.PI / 2;
          const ang = Math.atan2(p.ny, p.nx) + lado * (0.55 + az() * 0.45) - (az() < 0.5 ? 0 : 0.1);
          const tam = 0.7 + 0.6 * Math.sin(Math.PI * t);
          hoja(puntos[i], ang + 0 * tang, (11 + az() * 7) * tam, (2.4 + az() * 1.4) * tam, paleta.tallo, lado * (2 + az() * 3));
          lado = -lado;
        }
        zarcillo(tierra(s1, 3), az() < 0.5 ? 1 : -1, paleta.tallo);
      }

      // Coral ramificado en una o dos esquinas: ramas cortas y redondeadas, con pólipos en las puntas.
      for (const esquina of plan.esquinas) {
        const s = { arribaIzq: 7.5, arribaDer: 1.5, abajoDer: 3.5, abajoIzq: 5.5 }[esquina] / 8;
        const p = tierra(s, 1);
        const arriba = esquina.startsWith('arriba');
        const lado = esquina.endsWith('Izq') ? -1 : 1;
        const espacio = lado < 0 ? izq : der;
        // Arriba crece hacia la superficie; abajo, hacia el costado, si hay lugar.
        let ang = arriba ? -Math.PI / 2 + lado * 0.35 : (lado < 0 ? Math.PI : 0) + (espacio < 20 ? -lado * 1.2 : -lado * 0.5);
        const ramas = [];
        const crecer = (x, y, a, l, w, nivel) => {
          const x2 = x + Math.cos(a) * l;
          const y2 = y + Math.sin(a) * l;
          if (!vale(x2, y2)) return;
          const cx = (x + x2) / 2 + Math.cos(a + 1.57) * l * 0.15;
          const cy = (y + y2) / 2 + Math.sin(a + 1.57) * l * 0.15;
          ramas.push({ d: `M${f(x)} ${f(y)}Q${f(cx)} ${f(cy)} ${f(x2)} ${f(y2)}`, w, x2, y2, punta: nivel === 0 });
          if (nivel > 0) {
            const abre = 0.32 + az() * 0.3;
            crecer(x2, y2, a - abre, l * 0.74, w * 0.72, nivel - 1);
            crecer(x2, y2, a + abre, l * 0.74, w * 0.72, nivel - 1);
            if (az() < 0.35) crecer(x2, y2, a + (az() - 0.5) * 0.3, l * 0.6, w * 0.6, nivel - 1);
          }
        };
        const troncos = 2 + Math.floor(az() * 2);
        for (let k = 0; k < troncos; k++) crecer(p.x + (k - troncos / 2) * 3.5 * lado, p.y, ang + (k - (troncos - 1) / 2) * 0.4, 10 + az() * 4, 4.2, 3);
        for (const b of ramas) capas.cuerpo.push(`<path d="${b.d}" fill="none" stroke="${paleta.coral[0]}" stroke-width="${f(b.w + 1.1)}" stroke-linecap="round"/>`);
        for (const b of ramas) capas.cuerpo.push(`<path d="${b.d}" fill="none" stroke="${paleta.coral[1]}" stroke-width="${f(b.w)}" stroke-linecap="round"/>`);
        for (const b of ramas) {
          capas.luz.push(`<path d="${b.d}" transform="translate(-0.4 -0.6)" fill="none" stroke="${paleta.coral[2]}" stroke-width="${f(Math.max(0.6, b.w * 0.32))}" stroke-linecap="round"/>`);
          if (b.punta) capas.luz.push(`<circle cx="${f(b.x2)}" cy="${f(b.y2)}" r="${f(b.w * 0.55 + 0.4)}" fill="${paleta.coral[2]}"/>`);
          if (brillo) capas.fondo.push(`<path d="${b.d}" fill="none" stroke="${paleta.coral[2]}" stroke-width="${f(b.w * 3)}" stroke-linecap="round" opacity="0.12"/>`);
        }
      }

      // Una mata de algas que se mece despacio, en la orilla de arriba o en un costado.
      {
        const p = tierra(plan.alga, 1);
        const blades = [];
        const base = Math.atan2(p.ny, p.nx);
        const n = 3 + Math.floor(az() * 3);
        for (let k = 0; k < n; k++) {
          const ang = base + (k - (n - 1) / 2) * 0.28;
          const largo = 12 + az() * 12;
          const puntos = [];
          for (let i = 0; i <= 8; i++) {
            const t = i / 8;
            const curva = Math.sin(t * 2.4 + k) * 2.4 * t;
            const x = p.x + Math.cos(ang) * largo * t - Math.sin(ang) * curva;
            const y = p.y + Math.sin(ang) * largo * t + Math.cos(ang) * curva;
            puntos.push({ x, y });
          }
          if (puntos.every((q) => vale(q.x, q.y))) blades.push(puntos);
        }
        const antes = capas.cuerpo.length;
        const antesLuz = capas.luz.length;
        const antesFondo = capas.fondo.length;
        for (const pts of blades) cinta(pts, 2.4, paleta.tallo);
        const grupo = capas.fondo.splice(antesFondo).concat(capas.cuerpo.splice(antes), capas.luz.splice(antesLuz));
        if (grupo.length) {
          // La mata va en su propio SVG chico: gira entero en el compositor y no obliga a repintar el borde.
          const xs = blades.flat().map((q) => q.x).concat(p.x);
          const ys = blades.flat().map((q) => q.y).concat(p.y);
          const bx = Math.max(-izq, Math.min(...xs) - 4), by = Math.min(...ys) - 4;
          const bw = Math.min(W + der, Math.max(...xs) + 4) - bx, bh = Math.max(...ys) + 4 - by;
          capas.meces.push({ html: grupo.join(''), bx, by, bw, bh, ox: p.x - bx, oy: p.y - by, dura: (5 + az() * 4).toFixed(1), retraso: (az() * 5).toFixed(1) });
        }
      }

      // Detalles chicos en una orilla.
      for (const det of plan.detalles) {
        const s = det.s;
        if (det.tipo === 'percebes') {
          for (let k = 0; k < 4; k++) {
            const p = tierra(s + k * 0.006, 2.5);
            const rr = 1.8 + az() * 1.4;
            if (!vale(p.x, p.y)) continue;
            capas.cuerpo.push(`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(rr)}" fill="${paleta.detalle[1]}" stroke="${paleta.tallo[0]}" stroke-width="0.7"/>`);
            capas.luz.push(`<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(rr * 0.42)}" fill="${paleta.tallo[0]}"/>`);
          }
        } else if (det.tipo === 'burbujas') {
          const p = tierra(s, 4);
          for (let k = 0; k < 4; k++) {
            const q = { x: p.x + p.nx * k * 5 + (az() - 0.5) * 4, y: p.y + p.ny * k * 5 + (az() - 0.5) * 4 };
            if (!vale(q.x, q.y)) continue;
            capas.luz.push(`<circle cx="${f(q.x)}" cy="${f(q.y)}" r="${f(1 + k * 0.5)}" fill="none" stroke="${paleta.detalle[1]}" stroke-width="0.8" opacity="0.75"/>`);
          }
        } else if (det.tipo === 'anemona') {
          const p = tierra(s, 1.5);
          const base = Math.atan2(p.ny, p.nx);
          for (let k = 0; k < 9; k++) {
            const a = base + (k - 4) * 0.22;
            const l = 6 + az() * 4;
            const x2 = p.x + Math.cos(a) * l, y2 = p.y + Math.sin(a) * l;
            if (!vale(x2, y2)) continue;
            capas.cuerpo.push(`<path d="M${f(p.x)} ${f(p.y)}Q${f(p.x + Math.cos(a + 0.4) * l * 0.6)} ${f(p.y + Math.sin(a + 0.4) * l * 0.6)} ${f(x2)} ${f(y2)}" fill="none" stroke="${paleta.coral[1]}" stroke-width="1.5" stroke-linecap="round"/>`);
            capas.luz.push(`<circle cx="${f(x2)}" cy="${f(y2)}" r="0.9" fill="${paleta.coral[2]}"/>`);
          }
        } else {
          const p = tierra(s, 7);
          if (!vale(p.x, p.y)) continue;
          const rot = az() * 6.28;
          let d = '';
          for (let k = 0; k < 10; k++) {
            const a = rot + k * Math.PI / 5;
            const rr = k % 2 ? 2.4 : 6.5;
            d += (k ? 'L' : 'M') + f(p.x + Math.cos(a) * rr) + ' ' + f(p.y + Math.sin(a) * rr);
          }
          capas.cuerpo.push(`<path d="${d}Z" fill="${paleta.detalle[0]}" stroke="${paleta.coral[0]}" stroke-width="0.8" stroke-linejoin="round"/>`);
          capas.luz.push(`<circle cx="${f(p.x - 0.6)}" cy="${f(p.y - 0.8)}" r="1.1" fill="${paleta.detalle[1]}"/>`);
        }
      }
      // El dibujo se entrega como imagen SVG de fondo: el navegador lo rasteriza una vez y al
      // desplazarse solo pinta un mapa de bits, en lugar de cientos de trazos vivos.
      const comoImagen = (caja, cuerpo) => 'url("data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="${SVG_NS}" viewBox="${caja}">${cuerpo}</svg>`) + '")';
      svg.style.backgroundImage = comoImagen(vista, capas.fondo.join('') + capas.cuerpo.join('') + capas.luz.join(''));
      svg.dataset.indice = String(indice);
      if (datos.alga) { datos.alga.remove(); datos.alga = null; }
      for (const g of capas.meces) {
        const alga = doc.createElement('span');
        alga.className = 'descenso-alga descenso-mece';
        alga.setAttribute('aria-hidden', 'true');
        alga.setAttribute('data-descenso', '');
        alga.setAttribute('style', `left:${f(g.bx)}px;top:${f(g.by)}px;width:${f(g.bw)}px;height:${f(g.bh)}px;transform-origin:${f(g.ox)}px ${f(g.oy)}px;animation-duration:${g.dura}s;animation-delay:-${g.retraso}s`);
        alga.style.backgroundImage = comoImagen(`${f(g.bx)} ${f(g.by)} ${f(g.bw)} ${f(g.bh)}`, g.html);
        svg.after(alga);
        datos.alga = alga;
      }
    }

    function planDe(indice, previo) {
      for (let intento = 0; intento < 40; intento++) {
        const az = azarDe(indice * 7919 + intento * 104729 + 23);
        const cuantos = 1 + Math.floor(az() * 2);
        const tramos = [];
        let s = az();
        for (let k = 0; k < cuantos; k++) {
          const largo = 0.14 + az() * 0.2;
          tramos.push([s, s + largo]);
          s += largo + 0.12 + az() * 0.2;
        }
        const todas = ['arribaIzq', 'arribaDer', 'abajoDer', 'abajoIzq'];
        const esquinas = [todas[Math.floor(az() * 4)]];
        if (az() < 0.45) esquinas.push(todas[(todas.indexOf(esquinas[0]) + 1 + Math.floor(az() * 3)) % 4]);
        const detalles = [];
        const tipos = DETALLES.slice().sort(() => az() - 0.5).slice(0, 1 + Math.floor(az() * 2));
        for (const tipo of tipos) detalles.push({ tipo, s: tipo === 'estrella' || tipo === 'percebes' ? 0.5 + az() * 0.25 : az() < 0.5 ? 0.05 + az() * 0.15 : 0.3 + az() * 0.15 });
        const plan = {
          tramos, esquinas, detalles,
          alga: az() < 0.6 ? 0.04 + az() * 0.18 : 0.28 + az() * 0.16,
          grosor: 2.6 + az() * 1.4,
          densidad: 4 + Math.floor(az() * 3),
          doble: az() < 0.5,
          ondas: Math.floor(az() * 4),
          variante: Math.floor(az() * 6),
        };
        plan.firma = esquinas.slice().sort().join('+') + '|' + tramos.map((t) => t.map((x) => (x % 1).toFixed(2)).join('-')).join(',') + '|' + tipos.slice().sort().join('+') + '|' + plan.variante;
        // Dos tarjetas seguidas nunca iguales: otras esquinas, otros detalles y otro color.
        if (!previo || (plan.esquinas[0] !== previo.esquinas[0] && plan.variante % 2 !== previo.variante % 2 && tipos.join() !== previo.detalles.map((d) => d.tipo).join())) return plan;
      }
      return null;
    }

    // ---------- coral 3D en las tarjetas de título ----------
    // La presentación y la cabecera de cada sección llevan coral modelado en Blender, asomándose
    // entero por detrás de su borde de arriba. Piezas continuas, sin partes sueltas.
    const CORAL3D = {
      'anemona-coral': [200, 162], 'anemona-rosa': [200, 154], 'cerebro-ocre': [200, 104], 'cerebro-verde': [200, 108],
      'gorgonia-violeta': [200, 175], 'mesa-verde': [200, 94], 'rama-ocre': [200, 199], 'rama-rosa': [200, 176],
      'tubos-amarillo': [164, 200], 'tubos-naranja': [129, 200],
      'esponja-vidrio': [120, 200], 'gorgonia-luz': [175, 200], 'rama-luz': [187, 200], 'tubos-luz': [138, 200],
      'anemona-luz': [200, 164], 'cerebro-luz': [200, 106], 'rama-luz-azul': [200, 160],
    };
    const SOMERO = ['cerebro-verde', 'anemona-rosa', 'tubos-naranja', 'rama-ocre', 'gorgonia-violeta', 'cerebro-ocre', 'anemona-coral', 'tubos-amarillo', 'mesa-verde', 'rama-rosa'];
    const HONDO = ['rama-luz', 'tubos-luz', 'anemona-luz', 'gorgonia-luz', 'cerebro-luz', 'esponja-vidrio', 'rama-luz-azul'];
    let titulos = [];
    const vigiaCoral = 'IntersectionObserver' in ventana ? new ventana.IntersectionObserver((entradas) => {
      for (const en of entradas) {
        if (!en.isIntersecting) continue;
        ponerImagenes(en.target);
        vigiaCoral.unobserve(en.target);
      }
    }, { rootMargin: '900px 0px' }) : null;
    function ponerImagenes(caja) {
      for (const p of caja.querySelectorAll('[data-coral]')) p.style.backgroundImage = 'url("' + new URL('./recursos/coral/' + p.dataset.coral + '.webp', import.meta.url).href + '")';
    }
    function armarTitulos() {
      const desp = ventana.scrollY;
      const lista = [];
      if (rejilla && cargo) lista.push({ el: rejilla, inicio: true });
      for (const el of principal.querySelectorAll('.zona-cabeza')) lista.push({ el, inicio: false });
      const usadas = new Set();
      let anteriores = [];
      lista.forEach(({ el, inicio: esInicio }, i) => {
        const r = (esInicio ? cargo : el).getBoundingClientRect();
        const metros = metrosDe(r.top + desp + r.height / 2);
        const banco = metros < 1000 ? SOMERO : HONDO;
        const cuantas = banco === SOMERO ? 3 : 2;
        let elegido = null;
        for (let intento = 0; intento < 80 && !elegido; intento++) {
          const azar = azarDe(i * 6007 + intento * 92821 + 5);
          const fuente = banco.filter((n) => !anteriores.includes(n));
          const piezas = [];
          while (piezas.length < Math.min(cuantas, fuente.length)) {
            const n = fuente[Math.floor(azar() * fuente.length)];
            if (!piezas.includes(n)) piezas.push(n);
          }
          const firma = piezas.slice().sort().join('+');
          if (!usadas.has(firma)) elegido = { piezas, firma, azar };
        }
        if (!elegido) return;
        usadas.add(elegido.firma);
        anteriores = elegido.piezas;
        const caja = doc.createElement('span');
        caja.className = 'descenso-coral' + (esInicio ? ' en-inicio' : '');
        caja.setAttribute('data-descenso', '');
        caja.setAttribute('aria-hidden', 'true');
        caja.dataset.firma = elegido.firma;
        // El ancho se mide ya puesto: en la presentación es el del panel, no el de la rejilla.
        el.insertBefore(caja, el.firstChild);
        const ancho = caja.getBoundingClientRect().width;
        const n = elegido.piezas.length;
        const hueco = ancho / n;
        elegido.piezas.forEach((nombrePieza, k) => {
          const [w0, h0] = CORAL3D[nombrePieza];
          // Cada pieza cabe en su tramo del borde, entera: nada se sale de la tarjeta a los lados.
          let alto = Math.round((esTelefono ? 78 : 132) * (0.85 + elegido.azar() * 0.4));
          let anchoP = Math.round(alto * w0 / h0);
          if (anchoP > hueco * 0.92) { anchoP = Math.floor(hueco * 0.92); alto = Math.round(anchoP * h0 / w0); }
          const p = doc.createElement('i');
          p.className = 'descenso-coral-pieza';
          p.dataset.coral = nombrePieza;
          p.style.width = anchoP + 'px';
          p.style.height = alto + 'px';
          const libre = hueco - anchoP;
          p.style.left = Math.round(k * hueco + libre * (0.2 + elegido.azar() * 0.6)) + 'px';
          // Solo la base queda detrás del borde: el resto se ve completo.
          p.style.bottom = 'calc(100% - ' + Math.round(alto * 0.1) + 'px)';
          if (elegido.azar() < 0.5) p.style.transform = 'scaleX(-1)';
          caja.appendChild(p);
        });
        titulos.push(caja);
        if (vigiaCoral) vigiaCoral.observe(caja);
        else ponerImagenes(caja);
      });
    }

    function armarCoral() {
      quitarCoral();
      anchoCoral = m.ancho;
      armarTitulos();
      const desp = ventana.scrollY;
      const tarjetas = [];
      for (const el of principal.querySelectorAll(SELECTOR_TARJETAS)) tarjetas.push({ el, inicio: false });
      let previo = null;
      tarjetas.forEach(({ el, inicio: esInicio }, i) => {
        const plan = planDe(i, previo);
        if (!plan) return;
        previo = plan;
        let anfitrion = el;
        let medida = el;
        if (esInicio) {
          // El panel de la presentación es un pseudoelemento: un contenedor ocupa su lugar en la rejilla.
          anfitrion = doc.createElement('span');
          anfitrion.className = 'descenso-coral en-inicio';
          anfitrion.setAttribute('data-descenso', '');
          anfitrion.setAttribute('aria-hidden', 'true');
          el.insertBefore(anfitrion, el.firstChild);
          medida = anfitrion;
        }
        const r = medida.getBoundingClientRect();
        const metros = metrosDe(r.top + desp + r.height / 2);
        const zona = metros < 200 ? 'superficie' : metros < 1000 ? 'media' : metros < 4000 ? 'hondo' : 'abisal';
        const opciones = PALETAS[zona];
        const paleta = opciones[plan.variante % opciones.length];
        const svg = doc.createElement('span');
        svg.className = 'descenso-borde';
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('data-descenso', '');
        svg.dataset.firma = plan.firma + '|' + zona;
        anfitrion.insertBefore(svg, anfitrion.firstChild);
        const datos = { svg, medida, anfitrion: esInicio ? anfitrion : null, indice: i, azarBase: i * 131 + 7, paleta, plan, radio: esInicio ? null : el, anillo: anilloDe(el) };
        arrecife.push(datos);
        dibujarBorde(datos);
        if (vigiaBorde) vigiaBorde.observe(svg);
        if (vigiaTamano) vigiaTamano.observe(medida);
      });
    }
    function quitarCoral() {
      for (const d of arrecife) {
        if (vigiaBorde) vigiaBorde.unobserve(d.svg);
        if (vigiaTamano) vigiaTamano.unobserve(d.medida);
        d.svg.remove();
        if (d.alga) d.alga.remove();
        if (d.anfitrion) d.anfitrion.remove();
      }
      arrecife = [];
      for (const caja of titulos) { if (vigiaCoral) vigiaCoral.unobserve(caja); caja.remove(); }
      titulos = [];
    }
    limpiezas.push(() => {
      if (vigiaBorde) vigiaBorde.disconnect();
      if (vigiaTamano) vigiaTamano.disconnect();
      if (vigiaCoral) vigiaCoral.disconnect();
      quitarCoral();
    });

    // ---------- arranque y respuesta a cambios ----------
    medir();
    armarCoral();
    // Sin el shader el nombre no se recorta: el cielo de CSS baja hasta debajo del nombre completo.
    const lineaCss = () => Math.round(m.nombre ? m.nombre.caja.y + m.nombre.caja.h + 28 : m.superficie) + 'px';
    tocar(raiz, '--linea-css', lineaCss());

    let pendiente = false;
    function remedir() {
      if (!vivo || pendiente) return;
      pendiente = true;
      ventana.setTimeout(() => {
        pendiente = false;
        if (!vivo) return;
        medir();
        tocar(raiz, '--linea-css', lineaCss());
        // Si cambió el ancho, cambian las tarjetas y su profundidad: el coral se vuelve a armar.
        if (Math.abs(m.ancho - anchoCoral) > 1) armarCoral();
        if (!gl || perdido) { actualizarMedidor(m.superficie - ventana.scrollY, ventana.scrollY); return; }
        if (reducido) pintarFijo();
        else ajustarLienzo(m.alto);
      }, 60);
    }
    const vigia = 'ResizeObserver' in ventana ? new ventana.ResizeObserver(remedir) : null;
    if (vigia) vigia.observe(doc.body);
    escuchar(ventana, 'resize', remedir);
    let fuenteLista = !doc.fonts || !nombre || doc.fonts.check("400 1em 'Descenso Anton'");
    const avisar = () => { fuenteLista = true; remedir(); };
    if (doc.fonts) {
      // El nombre se pinta en la textura con su fuente: hay que volver a medir cuando llega.
      escuchar(doc.fonts, 'loadingdone', remedir);
      if (doc.fonts.ready) doc.fonts.ready.then(remedir, () => null);
      if (nombre) doc.fonts.load("400 1em 'Descenso Anton'").then(avisar, avisar);
    }
    // Si la fuente no llega, el agua se enciende igual con la de respaldo.
    const esperaFuente = ventana.setTimeout(avisar, 1500);
    limpiezas.push(() => ventana.clearTimeout(esperaFuente));

    // Si el navegador pierde el contexto (pasa en teléfonos), se vuelve a la versión de CSS
    // al instante y se reconstruye todo cuando lo devuelve.
    function alPerder(e) {
      e.preventDefault();
      perdido = true;
      encendida = false;
      if (nombre) tocar(nombre, 'clip-path', null);
      tocar(raiz, '--linea-css', lineaCss());
      marcarRaiz('data-descenso-agua', 'css');
      lienzo.classList.remove('encendida');
      lienzo.style.visibility = 'hidden';
    }
    function alRecuperar() {
      try {
        recursosGL();
      } catch (err) {
        // Si no se puede reconstruir, la página se queda con el agua de CSS, que ya está puesta.
        return;
      }
      perdido = false;
      texturaLista = false;
      // Las hojas ya están descargadas: solo se vuelven a subir al contexto nuevo.
      for (const h of Object.values(hojas)) { h.tex = null; subirHoja(h); }
      lienzo.style.visibility = '';
      if (reducido) {
        marcarRaiz('data-descenso-agua', 'fija');
        pintarFijo();
      }
    }
    if (reducido || !gl) {
      // Sin cuadros, el medidor sigue el desplazamiento con un oyente pasivo.
      escuchar(ventana, 'scroll', () => actualizarMedidor(m.superficie - ventana.scrollY, ventana.scrollY), { passive: true });
    }

    if (gl) {
      for (const especie of Object.keys(ESPECIES)) if (ESPECIES[especie].zona === 'luz') pedirHoja(especie);
      escuchar(lienzo, 'webglcontextlost', alPerder);
      escuchar(lienzo, 'webglcontextrestored', alRecuperar);
      if (reducido) {
        pintarFijo();
      } else {
        ajustarLienzo(m.alto);
        escuchar(ventana, 'pointermove', (e) => { puntero.x = e.clientX; puntero.y = e.clientY; }, { passive: true });
        escuchar(ventana, 'pointerdown', (e) => { puntero.x = e.clientX; puntero.y = e.clientY; }, { passive: true });
        escuchar(doc, 'visibilitychange', () => {
          if (doc.hidden) { ventana.cancelAnimationFrame(idCuadro); idCuadro = 0; }
          else if (vivo && !idCuadro) { ultimo = ventana.performance.now(); idCuadro = ventana.requestAnimationFrame(cuadro); }
        });
        idCuadro = ventana.requestAnimationFrame(cuadro);
      }
    } else {
      actualizarMedidor(m.superficie - ventana.scrollY, ventana.scrollY);
    }

    return function desmontar() {
      vivo = false;
      if (idCuadro) ventana.cancelAnimationFrame(idCuadro);
      idCuadro = 0;
      if (vigia) vigia.disconnect();
      liberarGL();
      gl = null;
      for (let i = limpiezas.length - 1; i >= 0; i--) limpiezas[i]();
      limpiezas.length = 0;
      for (const [el, original] of estilosOriginales) {
        if (original === null) el.removeAttribute('style');
        else el.setAttribute('style', original);
      }
      estilosOriginales.clear();
      for (const [nombreAtributo, original] of atributosRaiz) {
        if (original === null) raiz.removeAttribute(nombreAtributo);
        else raiz.setAttribute(nombreAtributo, original);
      }
      atributosRaiz.clear();
      if (lienzoNombre) { lienzoNombre.width = 0; lienzoNombre.height = 0; lienzoNombre = null; }
    };
  },
};
