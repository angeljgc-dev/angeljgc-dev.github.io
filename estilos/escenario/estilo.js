// Estilo "escenario". Un escenario negro con una sola fuente de luz: una línea lima que ondula,
// nace en la presentación, pasa detrás de la pantalla de los proyectos y, al bajar, se agranda y
// se desenfoca hasta volverse la luz de ambiente que ilumina la pila de tarjetas.
//
// Piezas:
//   - Lienzo 2D fijo detrás de todo: la línea de la presentación y la banda de ambiente.
//   - Pantalla abombada (WebGL propio, sin bibliotecas): franja pegada arriba que muestra el
//     proyecto que se está leyendo; cambia con barrido lateral o de iris y, al pasar el último,
//     se parte en mosaico de 2x2. La curvatura crece con la velocidad del desplazamiento.
//   - Pila de habilidades en 3D: tarjetas escalonadas en diagonal; la cámara las recorre con el
//     desplazamiento y solo la tarjeta activa enciende su halo.
//   - Golpe de exposición en los cortes: la luz sube a casi blanco 90 ms y regresa.
//
// El contenido no se toca: todo lo agregado lleva data-esc y aria-hidden, y al desmontar se
// restauran los atributos class y style originales de lo que se haya movido.

const VERTICES = 'attribute vec2 p;varying vec2 v;void main(){v=p*0.5+0.5;gl_Position=vec4(p,0.0,1.0);}';

// Sombreador de la pantalla. Unidades en píxeles CSS de la franja. ACTUAL y SIGUIENTE son las
// capturas del barrido; CELDA_UNO, CELDA_DOS y CELDA_TRES, las otras tres celdas del mosaico.
// R: tamaño de la franja. P: centro y medio ancho y alto del panel. T: tiempo. K: curvatura extra
// por velocidad. Q y TIPO: avance y tipo de barrido. M: mosaico. E: la luz que se vuelve ambiente.
// F: fase de la onda (sigue al dedo y al puntero).
const FRAGMENTOS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v;
uniform vec2 R;
uniform vec4 P;
uniform float T,K,Q,TIPO,M,E,F,OPACO;
uniform sampler2D ACTUAL,SIGUIENTE,CELDA_UNO,CELDA_DOS,CELDA_TRES;
const vec3 LIMA=vec3(0.776,1.0,0.227);
const vec3 VIOLETA=vec3(0.478,0.361,1.0);
const vec3 FONDO=vec3(0.039,0.039,0.059);
float onda(float x){return 14.0*sin(x*0.011+T*1.3+F)+7.0*sin(x*0.026-T*0.9+1.7+F*0.6);}
vec3 muestra(sampler2D s,vec2 uv){return texture2D(s,clamp(uv,0.002,0.998)).rgb;}
vec3 pantalla(vec2 uv){
  if(Q<=0.0)return muestra(ACTUAL,uv);
  if(TIPO<0.5){
    float d=0.06*sin(3.14159*Q);
    vec3 c=vec3(0.0);
    for(int i=0;i<5;i++){
      float x=uv.x+Q+(float(i)-2.0)*d*0.5;
      c+=x<1.0?muestra(ACTUAL,vec2(x,uv.y)):muestra(SIGUIENTE,vec2(x-1.0,uv.y));
    }
    return c/5.0;
  }
  vec2 q=(uv-0.5)*vec2(P.z/P.w,1.0);
  float r=length(q),rr=Q*1.05;
  vec3 c=r<rr?muestra(SIGUIENTE,uv):muestra(ACTUAL,uv);
  return c*(1.0-0.9*(1.0-smoothstep(0.0,0.16,abs(r-rr)))*sin(3.14159*Q));
}
vec3 escena(vec2 uv){
  if(M<=0.0)return pantalla(uv);
  float S=1.0+M;
  vec2 g=(uv-0.5)*S+0.5*S;
  vec2 celda=clamp(floor(g),0.0,1.0);
  vec2 l=g-celda;
  float id=celda.x+2.0*celda.y;
  float h=0.035*M;
  vec2 lc=l-0.5;
  float dentro=step(abs(lc.x),0.5-h)*step(abs(lc.y),0.5-h*1.6);
  vec2 lu=0.5+lc*(0.92+0.04*sin(T*0.7+id*1.9))+0.025*vec2(sin(T*0.5+id),cos(T*0.4+id*2.3));
  lu=mix(l,lu,M);
  vec3 c=id<0.5?muestra(ACTUAL,lu):id<1.5?muestra(CELDA_UNO,lu):id<2.5?muestra(CELDA_DOS,lu):muestra(CELDA_TRES,lu);
  if(id>0.5)c=mix(FONDO,c,M);
  return mix(FONDO*0.6,c,dentro);
}
void main(){
  vec2 px=vec2(v.x*R.x,(1.0-v.y)*R.y);
  float dl=abs(px.y-P.y-onda(px.x));
  float w=1.6+30.0*E;
  float halo=exp(-dl/(16.0+70.0*E));
  vec3 luz=LIMA*(exp(-dl*dl/(w*w))*(1.0-0.7*E)*0.95+halo*0.32*(1.0-0.5*E))+vec3(0.9,1.0,0.8)*exp(-dl*dl/0.8)*(1.0-E)*0.5+VIOLETA*halo*0.12;
  vec2 q=(px-P.xy)/P.zw;
  float b=0.05+K;
  float ex=1.0+b*max(1.0-q.y*q.y,-1.5);
  float ey=1.0+b*1.6*max(1.0-q.x*q.x,-1.5);
  vec2 qn=vec2(q.x/ex,q.y/ey);
  vec2 potencia=pow(abs(qn),vec2(8.0));
  float d=pow(potencia.x+potencia.y,0.125);
  float sombra=0.75*(1.0-smoothstep(1.0,1.35,d));
  float gh=1.0-smoothstep(0.0,1.2,min(abs(px.y-(P.y-P.w*ey)),abs(px.y-(P.y+P.w*ey))));
  float gv=1.0-smoothstep(0.0,1.2,min(abs(px.x-(P.x-P.z*ex)),abs(px.x-(P.x+P.z*ex))));
  vec3 guia=vec3(0.95)*0.22*step(1.0,d)*(gh*step(0.5,fract(px.x/10.0))+gv*step(0.5,fract(px.y/10.0)));
  // Afuera del panel: con fondo propio (columna) o solo luz que se suma y sombra (sobre la tarjeta).
  vec3 col=(FONDO*OPACO+luz)*(1.0-sombra)+guia;
  float alfa=mix(sombra,1.0,OPACO);
  float aa=1.5/P.w;
  float dentro=1.0-smoothstep(1.0-aa,1.0,d);
  if(dentro>0.0){
    float radioCuad=dot(qn,qn);
    vec2 uv=0.5+0.5*qn*(1.0-(0.08+K)*(1.0-0.5*radioCuad));
    float ab=(0.003+0.02*K)*radioCuad;
    vec2 cu=uv-0.5;
    vec3 c=vec3(escena(0.5+cu*(1.0+ab)).r,escena(uv).g,escena(0.5+cu*(1.0-ab)).b);
    c*=mix(vec3(1.0),vec3(0.94,1.0,0.88),0.4);
    c*=1.0-0.5*pow(d,7.0);
    c+=vec3(0.12)*(1.0-smoothstep(0.0,0.9,length(qn-vec2(-0.5,-0.62))));
    float orilla=smoothstep(1.0-6.0*aa,1.0-aa,d);
    c=mix(c,LIMA,orilla*(0.25+0.5*exp(-abs(qn.y)*1.25)));
    col=mix(col,c,dentro);
    alfa=mix(alfa,1.0,dentro);
  }
  float borde=mix(1.0,1.0-smoothstep(R.y-30.0,R.y,px.y),OPACO);
  gl_FragColor=vec4(col*borde,alfa*borde);
}`;

// Curvas de movimiento: las entradas arrancan rápido y frenan largo; los barridos aceleran
// y frenan.
const salida = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const vaiven = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const acotar = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);

export default {
  id: 'escenario',
  nombre: 'Escenario',

  async montar(ctx) {
    const doc = ctx && ctx.raiz && ctx.raiz.documentElement ? ctx.raiz : document;
    const win = doc.defaultView || window;
    const html = doc.documentElement;
    const reducido = !!(ctx && ctx.reducido);
    const q = (s, r = doc) => r.querySelector(s);
    const seccion = (id) => q(`[data-seccion="${id}"]`) || q(`[data-zona="${id}"]`) || doc.getElementById(id);

    // Con movimiento reducido el estado final es la página lineal que ya pinta la hoja: luz
    // quieta, lentes en CSS y la pila como lista. No se agrega nada ni se pide ningún cuadro.
    if (reducido) return function desmontar() {};

    const corte = new AbortController();
    const { signal } = corte;
    const nodos = [];
    const estilos = new Map();
    const clases = new Map();
    const animaciones = new Set();
    const observadores = [];
    const relojes = new Set();
    let vivo = true;
    let cuadro = 0;
    // Estado de la pantalla: proyecto activo, barrido en curso y mosaico.
    let activo = 0; let desde = 0; let hacia = 0; let avance = 0; let tipo = 0; let cambios = 0;
    let transicion = null; let mosaico = 0; let mosaicoMeta = 0; let mosaicoTween = null;

    const guardarEstilo = (el) => { if (!estilos.has(el)) estilos.set(el, el.getAttribute('style')); };
    const guardarClase = (el) => { if (!clases.has(el)) clases.set(el, el.getAttribute('class')); };
    const ponerClase = (el, c, si = true) => { guardarClase(el); el.classList.toggle(c, si); };
    const crear = (tag, clase) => { const e = doc.createElement(tag); e.className = clase; e.setAttribute('data-esc', ''); e.setAttribute('aria-hidden', 'true'); return e; };
    const insertar = (padre, el, antes = null) => { padre.insertBefore(el, antes); nodos.push(el); return el; };
    const animar = (el, cuadros, opciones) => {
      if (!el || !el.animate) return null;
      const a = el.animate(cuadros, opciones);
      animaciones.add(a);
      a.finished.then(() => animaciones.delete(a), () => animaciones.delete(a));
      return a;
    };
    const reloj = (f, ms) => { const id = win.setTimeout(() => { relojes.delete(id); f(); }, ms); relojes.add(id); return id; };

    const inicio = seccion('presentacion') || seccion('inicio') || q('main section');
    const proyectos = seccion('proyectos');
    const habilidades = seccion('habilidades');
    const nombre = inicio && q('h1', inicio);
    const cargo = inicio && (q('[data-pieza="cargo"]', inicio) || q('.cargo', inicio));

    ponerClase(html, 'esc-vivo');

    // ---------- la luz: lienzo 2D fijo ----------
    const luz = insertar(doc.body, crear('canvas', 'esc-luz'), doc.body.firstChild);
    luz.dataset.fase = 'linea';
    const pincel = luz.getContext('2d');
    // La parte ancha y blanda va en un lienzo chico que el navegador agranda a toda la pantalla:
    // el suavizado del escalado hace el desenfoque y no hay que repintar uno grande cada cuadro.
    const blando = insertar(doc.body, crear('canvas', 'esc-ambiente'), luz);
    const gb = blando.getContext('2d');
    const golpe = insertar(doc.body, crear('div', 'esc-golpe'));

    // ---------- presentación: guías de herramienta de diseño y franja de la luz ----------
    let guias = null; let recuadro = null; let franja = null;
    if (inicio && nombre) {
      guias = insertar(inicio, crear('div', 'esc-guias'), inicio.firstChild);
      for (const c of ['esc-guia-h esc-a', 'esc-guia-h esc-b', 'esc-guia-v esc-a', 'esc-guia-v esc-b', 'esc-achurado esc-a', 'esc-achurado esc-b']) guias.appendChild(crear('span', c));
      recuadro = guias.appendChild(crear('span', 'esc-recuadro'));
      const ancla = cargo || nombre;
      franja = insertar(ancla.parentNode, crear('div', 'esc-franja'), ancla.nextSibling);
    }

    // ---------- proyectos: la pantalla abombada ----------
    const tarjetas = proyectos ? [...proyectos.querySelectorAll('[data-proyecto]')] : [];
    const masCodigo = proyectos && (q('.mas-sitios', proyectos) || q('[data-pieza="proy-mas-sitios"]', proyectos));
    const lista = tarjetas.length ? tarjetas[0].parentElement : null;
    let franjaGl = null; let lienzoGl = null; let gl = null; let programa = null; let u = {};
    let finalPantalla = null; let objetivo = null; let figuraEncendida = null;
    // En escritorio la pantalla es una columna pegada junto a los proyectos. En un ancho angosto
    // no se pega: va sobre la figura del proyecto que se está leyendo y nunca pasa por encima del
    // texto; al final se parte en mosaico en su propio marco, antes de la lista de sitios.
    const anchoMq = win.matchMedia('(min-width: 1024px)');
    let enColumna = anchoMq.matches;
    const texturas = [];
    let buffer = null;
    if (lista && tarjetas.length >= 2) {
      franjaGl = insertar(lista.parentElement, crear('div', 'esc-pantalla'), lista);
      franjaGl.dataset.modo = 'pantalla';
      franjaGl.dataset.activo = '0';
      lienzoGl = franjaGl.appendChild(doc.createElement('canvas'));
      try { gl = lienzoGl.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: 'low-power' }); } catch (e) { gl = null; }
      if (gl) {
        const sombreador = (tipo, fuente) => { const s = gl.createShader(tipo); gl.shaderSource(s, fuente); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
        const vs = sombreador(gl.VERTEX_SHADER, VERTICES);
        const fs = sombreador(gl.FRAGMENT_SHADER, FRAGMENTOS);
        if (vs && fs) {
          programa = gl.createProgram();
          gl.attachShader(programa, vs); gl.attachShader(programa, fs); gl.linkProgram(programa);
          gl.deleteShader(vs); gl.deleteShader(fs);
          if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) programa = null;
        }
      }
      if (programa) {
        gl.useProgram(programa);
        buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const pos = gl.getAttribLocation(programa, 'p');
        gl.enableVertexAttribArray(pos);
        gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
        for (const n of ['R', 'P', 'T', 'K', 'Q', 'TIPO', 'M', 'E', 'F', 'OPACO', 'ACTUAL', 'SIGUIENTE', 'CELDA_UNO', 'CELDA_DOS', 'CELDA_TRES']) u[n] = gl.getUniformLocation(programa, n);
        ['ACTUAL', 'SIGUIENTE', 'CELDA_UNO', 'CELDA_DOS', 'CELDA_TRES'].forEach((n, i) => gl.uniform1i(u[n], i));
        if (masCodigo) finalPantalla = insertar(masCodigo.parentElement, crear('div', 'esc-final'), masCodigo);
        lienzoGl.addEventListener('webglcontextlost', (e) => { e.preventDefault(); apagarPantalla(); }, { signal });
      } else {
        apagarPantalla();
      }
    }
    function apagarPantalla() {
      programa = null; gl = null;
      if (franjaGl) { franjaGl.remove(); franjaGl = null; }
      if (finalPantalla) { finalPantalla.remove(); finalPantalla = null; }
      encenderFigura(null);
      ponerClase(html, 'esc-gl', false);
      ponerClase(html, 'esc-gl-tarjeta', false);
    }
    // La figura que queda debajo de la pantalla se apaga (sigue en el árbol de accesibilidad).
    function encenderFigura(fig) {
      if (figuraEncendida === fig) return;
      if (figuraEncendida) ponerClase(figuraEncendida, 'esc-en-pantalla', false);
      figuraEncendida = fig;
      if (fig) ponerClase(fig, 'esc-en-pantalla', true);
    }
    // Pone la pantalla sobre el proyecto i, o en el marco del mosaico si i es -2.
    function ponerEn(i) {
      if (!franjaGl || enColumna) return;
      if (i === -2 && finalPantalla) {
        if (franjaGl.parentElement !== finalPantalla) finalPantalla.appendChild(franjaGl);
        franjaGl.hidden = false; objetivo = finalPantalla; encenderFigura(null);
      } else {
        const art = tarjetas[i]; const medio = art && q('.proyecto-medio', art);
        if (!medio || medio.classList.contains('proyecto-videos')) { franjaGl.hidden = true; objetivo = null; encenderFigura(null); return; }
        if (franjaGl.parentElement !== art) art.appendChild(franjaGl);
        franjaGl.hidden = false; objetivo = q(':scope > img', medio) || medio; encenderFigura(medio);
      }
      medirPantalla();
    }
    function colocar() {
      if (!franjaGl) return;
      ponerClase(html, 'esc-gl', enColumna);
      ponerClase(html, 'esc-gl-tarjeta', !enColumna);
      if (enColumna) {
        if (franjaGl.parentElement !== lista.parentElement || franjaGl.nextElementSibling !== lista) lista.parentElement.insertBefore(franjaGl, lista);
        franjaGl.removeAttribute('style'); franjaGl.hidden = false; objetivo = null; encenderFigura(null);
        medirPantalla();
      } else ponerEn(mosaicoMeta === 1 ? -2 : activo);
    }

    // Una textura por proyecto (su captura, sus pósteres o su figura dibujada) y el retrato para
    // el mosaico. Se piden cerca del proyecto que se está leyendo, no todas al montar.
    function textura() {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([21, 21, 29, 255]));
      return t;
    }
    function subir(i, fuente) {
      if (!vivo || !gl) return;
      gl.bindTexture(gl.TEXTURE_2D, texturas[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fuente);
    }
    const imagen = (img) => new Promise((listo, fallo) => {
      const im = new Image();
      im.decoding = 'async';
      im.onload = () => { im.onload = im.onerror = null; listo(im); };
      im.onerror = () => { im.onload = im.onerror = null; fallo(new Error('sin imagen')); };
      im.src = img.getAttribute('src') || img.currentSrc;
    });
    const lienzo = () => { const c = doc.createElement('canvas'); c.width = 960; c.height = 600; const g = c.getContext('2d'); g.fillStyle = '#15151D'; g.fillRect(0, 0, 960, 600); return [c, g]; };
    const TITULO = '"Escenario Titulo", Impact, sans-serif';
    const LECTURA = '"Escenario Texto", Arial, sans-serif';
    // Varios pósteres verticales (los comerciales): un tríptico sobre la superficie oscura.
    function triptico(i, imgs) {
      Promise.all(imgs.map(imagen)).then((ims) => {
        const [c, g] = lienzo();
        const alto = 540; const ancho = alto * 9 / 16; const hueco = 24;
        const margenX = (960 - ims.length * ancho - (ims.length - 1) * hueco) / 2;
        ims.forEach((im, k) => {
          const x = margenX + k * (ancho + hueco); const esc = Math.max(ancho / im.width, alto / im.height);
          const sw = ancho / esc; const sh = alto / esc;
          g.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, x, 30, ancho, alto);
        });
        subir(i, c);
      }, () => {});
    }
    // Un proyecto sin captura: su cifra, su esquema o su título, dibujados en lima y blanco.
    function desdeTexto(i, tarjeta) {
      const [c, g] = lienzo();
      g.strokeStyle = 'rgba(198, 255, 58, 0.1)'; g.lineWidth = 2;
      for (let x = -600; x < 960; x += 24) { g.beginPath(); g.moveTo(x, 600); g.lineTo(x + 600, 0); g.stroke(); }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const cifra = q('.proyecto-cifra', tarjeta);
      const esquema = q('.proyecto-esquema', tarjeta);
      if (cifra && cifra.children.length >= 2) {
        const partes = [...cifra.children].map((e) => e.textContent.trim());
        g.fillStyle = '#B6B5C0'; g.font = `120px ${TITULO}`; g.fillText(partes[0], 480, 150);
        const w = g.measureText(partes[0]).width; g.fillRect(480 - w / 2, 148, w, 8);
        g.fillStyle = '#C6FF3A'; g.font = `230px ${TITULO}`; g.fillText(partes[1], 480, 320);
        if (partes[2]) { g.fillStyle = '#F3F1EC'; g.font = `700 40px ${LECTURA}`; g.fillText(partes[2], 480, 480); }
      } else if (esquema) {
        const partes = [...esquema.querySelectorAll('li')].map((e) => e.textContent.trim());
        const paso = 520 / Math.max(1, partes.length);
        partes.forEach((t, k) => {
          const y = 40 + paso * (k + 0.5);
          g.font = `700 50px ${LECTURA}`;
          const w = g.measureText(t).width + 70;
          g.strokeStyle = '#C6FF3A'; g.lineWidth = 3;
          g.beginPath(); g.roundRect(480 - w / 2, y - 42, w, 84, 42); g.stroke();
          g.fillStyle = k === partes.length - 1 ? '#C6FF3A' : '#F3F1EC'; g.fillText(t, 480, y + 2);
          if (k) { g.fillStyle = '#C6FF3A'; g.fillRect(479, y - paso + 44, 2, paso - 88); }
        });
      } else {
        g.fillStyle = '#C6FF3A'; g.font = `150px ${TITULO}`;
        g.fillText((q('h3', tarjeta) || tarjeta).textContent.trim().toUpperCase(), 480, 300, 860);
      }
      subir(i, c);
    }
    let fuentesListas = null;
    const pedidas = new Set();
    const retrato = inicio && q('img', inicio);
    const RETRATO = tarjetas.length;
    function cargar(i) {
      if (!programa || i < 0 || i >= texturas.length || pedidas.has(i)) return;
      pedidas.add(i);
      if (i === RETRATO) { imagen(retrato).then((im) => subir(i, im), () => {}); return; }
      const medio = q('.proyecto-medio', tarjetas[i]) || tarjetas[i];
      const posters = [...medio.querySelectorAll('.video-marco img')];
      const img = posters.length ? null : q(':scope > img', medio) || q('img', medio);
      if (posters.length) triptico(i, posters);
      else if (img) imagen(img).then((im) => subir(i, im), () => {});
      else {
        if (!fuentesListas) {
          fuentesListas = doc.fonts && doc.fonts.load
            ? Promise.race([Promise.all([doc.fonts.load(`400 100px ${TITULO}`), doc.fonts.load(`700 40px ${LECTURA}`)]), new Promise((r) => reloj(r, 1500))]).catch(() => null)
            : Promise.resolve();
        }
        fuentesListas.then(() => { if (vivo) desdeTexto(i, tarjetas[i]); });
      }
    }
    if (programa) {
      for (let i = 0; i < tarjetas.length + (retrato ? 1 : 0); i++) texturas.push(textura());
      cargar(0); cargar(1);
    }
    // Las otras tres celdas del mosaico: el primer proyecto, el segundo y el retrato (o el
    // tercero, si no hay retrato).
    const celdasMosaico = (a) => [0, 1, RETRATO, 2].filter((i) => i !== a && i < texturas.length).slice(0, 3);

    // ---------- habilidades: la pila en 3D ----------
    let pila = null; let tarjetasPila = [];
    if (habilidades) {
      pila = q('.grupos', habilidades) || [...habilidades.querySelectorAll('ul, ol')].find((l) => l.children.length >= 3) || null;
      if (pila && pila.children.length >= 3) {
        tarjetasPila = [...pila.children];
        ponerClase(html, 'esc-pila');
        guardarEstilo(habilidades);
        habilidades.style.setProperty('--esc-n', String(tarjetasPila.length));
        tarjetasPila.forEach((li) => { guardarEstilo(li); guardarClase(li); });
      } else pila = null;
    }

    // ---------- medidas (se rehacen al cambiar el tamaño) ----------
    let vw = 0; let vh = 0; let escala = 1; let franjaY = 0;
    let caja = { cx: 0, cy: 0, hw: 0, hh: 0 }; let anchoGl = 0; let altoGl = 0;
    let pilaInicio = 0; let pilaRecorrido = 1;
    function medirPantalla() {
      if (!franjaGl || !gl || franjaGl.hidden) return;
      if (!enColumna && objetivo) {
        // Sobre la tarjeta: la figura y un margen a los lados y arriba, nunca hacia el texto.
        const contenedor = franjaGl.parentElement.getBoundingClientRect();
        const o = objetivo.getBoundingClientRect();
        const enMarco = objetivo === finalPantalla;
        const izq = enMarco ? 0 : Math.max(0, o.left - contenedor.left - 14);
        const arriba = enMarco ? 0 : Math.max(0, o.top - contenedor.top - 14);
        const ancho = enMarco ? o.width : Math.min(contenedor.width - izq, o.right - contenedor.left + 14 - izq);
        const alto = o.bottom - contenedor.top - arriba;
        franjaGl.style.cssText = `left:${izq}px;top:${arriba}px;width:${ancho}px;height:${alto}px`;
        anchoGl = ancho; altoGl = alto;
        caja = { cx: o.left - contenedor.left - izq + o.width / 2, cy: o.top - contenedor.top - arriba + o.height / 2, hw: o.width / 2 / 1.14, hh: o.height / 2 / 1.23 };
      } else {
        const r = franjaGl.getBoundingClientRect();
        anchoGl = r.width; altoGl = r.height;
        const hh = Math.min(altoGl * 0.34, (anchoGl * 0.41) / 1.6);
        caja = { cx: anchoGl / 2, cy: altoGl * 0.47, hw: hh * 1.6, hh };
      }
      lienzoGl.width = Math.round(anchoGl * escala); lienzoGl.height = Math.round(altoGl * escala);
      gl.viewport(0, 0, lienzoGl.width, lienzoGl.height);
      franjaGl.dataset.caja = JSON.stringify({ cx: Math.round(caja.cx), cy: Math.round(caja.cy), hw: Math.round(caja.hw), hh: Math.round(caja.hh) });
    }
    function medir() {
      vw = html.clientWidth; vh = win.innerHeight;
      escala = Math.min(win.devicePixelRatio || 1, 1.5);
      luz.width = Math.round(vw * escala); luz.height = Math.round(vh * escala);
      blando.width = Math.ceil(vw / 4); blando.height = Math.ceil(vh / 4);
      const sy = win.scrollY;
      if (franja) { const r = franja.getBoundingClientRect(); franjaY = r.top + sy + r.height / 2; }
      if (guias && nombre) {
        const base = inicio.getBoundingClientRect();
        // El recuadro abraza el nombre y el cargo sin pisar ninguna línea de texto: arriba queda
        // en el aire que deja el nombre sobre su primera línea, abajo en la franja de la luz.
        const cajaTexto = (el) => { const r = doc.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
        const a = nombre.getBoundingClientRect();
        const primera = cajaTexto(nombre.firstElementChild || nombre);
        const b = (cargo || nombre).getBoundingClientRect();
        const previo = nombre.previousElementSibling;
        const arriba = previo ? cajaTexto(previo).bottom : primera.top - 12;
        const y = arriba < primera.top ? (arriba + primera.top) / 2 : primera.top - 2;
        const izq = Math.max(base.left + 6, Math.min(a.left, b.left) - 12);
        const der = Math.min(base.right - 6, Math.max(a.right, b.right) + 12);
        guias.style.setProperty('--x', `${izq - base.left}px`);
        guias.style.setProperty('--y', `${y - base.top}px`);
        guias.style.setProperty('--w', `${der - izq}px`);
        guias.style.setProperty('--h', `${b.bottom + 12 - y}px`);
      }
      medirPantalla();
      if (pila) {
        const env = pila.parentElement.getBoundingClientRect();
        const previo = pila.previousElementSibling;
        const desplaz = previo ? previo.getBoundingClientRect().bottom - env.top + (parseFloat(win.getComputedStyle(previo).marginBottom) || 0) : 0;
        pilaInicio = env.top + sy + desplaz;
        pilaRecorrido = Math.max(1, env.height - desplaz - pila.offsetHeight);
      }
    }
    colocar();
    medir();
    anchoMq.addEventListener('change', () => { enColumna = anchoMq.matches; colocar(); medir(); }, { signal });
    // La entrada mueve el nombre; las guías se vuelven a medir cuando ya se asentó.
    reloj(() => { if (vivo) medir(); }, 860);
    const ro = new win.ResizeObserver(() => { if (vivo) medir(); });
    ro.observe(doc.body);
    observadores.push(ro);
    win.addEventListener('resize', () => medir(), { signal, passive: true });

    // ---------- entrada corta (menos de 0.8 s) ----------
    const arranque = win.performance.now();
    const subir8 = [{ opacity: 0, transform: 'translateY(0.3em)', filter: 'blur(10px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }];
    if (nombre) {
      const piezas = nombre.children.length ? [...nombre.children] : [nombre];
      piezas.forEach((p, i) => animar(p, subir8, { duration: 500, delay: 140 + i * 80, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' }));
    }
    [inicio && (q('[data-pieza="lugar"]', inicio) || q('.lugar', inicio)), inicio && (q('[data-pieza="saludo"]', inicio) || q('.saludo', inicio)), cargo].forEach((p, i) => animar(p, subir8, { duration: 420, delay: 60 + i * 120, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' }));
    if (recuadro) {
      animar(recuadro, [{ transform: 'scale(0.12, 0.35)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, delay: 60, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' });
      [...guias.children].forEach((e, i) => { if (e !== recuadro) animar(e, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 280 + i * 30, fill: 'backwards' }); });
    }

    // Encabezados de sección: entran por pieza, con caída y desenfoque, la primera vez que se ven.
    const io = new win.IntersectionObserver((entradas) => {
      for (const en of entradas) {
        if (!en.isIntersecting) continue;
        io.unobserve(en.target);
        [...en.target.children].forEach((p, i) => animar(p, subir8, { duration: 520, delay: i * 80, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' }));
      }
    }, { rootMargin: '0px 0px -14% 0px' });
    // Lo que ya está a la vista al montar no se esconde para volver a entrar.
    for (const cab of doc.querySelectorAll('main section header, main .zona-cabeza')) {
      if ((inicio && inicio.contains(cab)) || cab.getBoundingClientRect().top < win.innerHeight * 0.86) continue;
      io.observe(cab);
    }
    observadores.push(io);

    // ---------- golpe de exposición ----------
    let ultimoGolpe = -1e9;
    function golpear() {
      const ahora = win.performance.now();
      if (ahora - ultimoGolpe < 1100) return;
      ultimoGolpe = ahora;
      animar(golpe, [{ opacity: 0, visibility: 'visible' }, { opacity: 0.6, visibility: 'visible', offset: 0.35 }, { opacity: 0, visibility: 'visible' }], { duration: 90, easing: 'ease-out' });
    }

    // ---------- entrada del puntero y del desplazamiento ----------
    let faseObjetivo = 0; let fase = 0;
    win.addEventListener('pointermove', (e) => { faseObjetivo = (e.clientX / (vw || 1) - 0.5) * 1.4; }, { signal, passive: true });
    let pausado = false;
    doc.addEventListener('visibilitychange', () => {
      if (doc.hidden) { pausado = true; win.cancelAnimationFrame(cuadro); cuadro = 0; }
      else if (pausado && vivo) { pausado = false; ultimoT = 0; cuadro = win.requestAnimationFrame(paso); }
    }, { signal });

    // ---------- estado de la pantalla ----------
    let pegadoAntes = false; let ambienteAntes = false; let pilaAntes = false;
    let posPila = null; let viajePila = null;
    let velocidad = 0; let yAntes = win.scrollY; let ultimoT = 0;

    function cambiarProyecto(nuevo) {
      if (transicion) { desde = hacia; transicion = null; }
      desde = activo; hacia = nuevo; activo = nuevo;
      for (let k = -1; k <= 2; k++) cargar(nuevo + k);
      if (nuevo >= tarjetas.length - 2) celdasMosaico(tarjetas.length - 1).forEach(cargar);
      tipo = cambios++ % 2;
      transicion = { t: win.performance.now(), dura: tipo === 0 ? 420 : 340 };
      franjaGl.dataset.transicion = tipo === 0 ? 'barrido' : 'iris';
      franjaGl.dataset.activo = String(nuevo);
      ponerEn(nuevo);
    }
    function ponerMosaico(si) {
      mosaicoMeta = si ? 1 : 0;
      if (si) { cargar(activo); celdasMosaico(activo).forEach(cargar); }
      mosaicoTween = { t: win.performance.now(), de: mosaico, dura: 600 };
      franjaGl.dataset.modo = si ? 'mosaico' : 'pantalla';
      ponerEn(si ? -2 : activo);
      if (si) golpear();
    }

    // La onda, igual en el lienzo 2D y en el sombreador.
    const onda = (x, t, f) => 14 * Math.sin(x * 0.011 + t * 1.3 + f) + 7 * Math.sin(x * 0.026 - t * 0.9 + 1.7 + f * 0.6);
    function trazar(g, base, t, f, ancho, alfa, color, s, hastaX) {
      g.globalAlpha = alfa; g.strokeStyle = color; g.lineWidth = ancho * s;
      g.beginPath();
      for (let x = 0; x <= hastaX + 12; x += 12) { const yy = (base + onda(x, t, f)) * s; if (x === 0) g.moveTo(0, yy); else g.lineTo(x * s, yy); }
      g.stroke();
    }

    let faseLuz = 'linea'; let limpio = false; let nitidoLimpio = false; let ultimoBlando = 0;
    function pintarLuz(t, sy, aLinea, e) {
      const W = luz.width; const H = luz.height;
      if (aLinea <= 0.01 && e <= 0.01) { if (!limpio) { pincel.clearRect(0, 0, W, H); gb.clearRect(0, 0, blando.width, blando.height); limpio = true; nitidoLimpio = true; } return; }
      limpio = false;
      const dibujo = acotar((win.performance.now() - arranque) / 300);
      const hastaX = vw * salida(dibujo);
      // Lo blando: halo de la línea y banda diagonal de ambiente, en el lienzo chico. Cuando solo
      // queda el ambiente, que es lento y borroso, basta con repintarlo 25 veces por segundo.
      const ahoraMs = win.performance.now();
      if (aLinea > 0.01 || ahoraMs - ultimoBlando > 40) {
        ultimoBlando = ahoraMs;
        const sb = blando.width / vw;
        gb.setTransform(1, 0, 0, 1, 0, 0);
        gb.globalCompositeOperation = 'source-over'; gb.globalAlpha = 1;
        gb.clearRect(0, 0, blando.width, blando.height);
        gb.globalCompositeOperation = 'lighter'; gb.lineCap = 'round';
        // El desenfoque se aplica en el lienzo chico, donde cuesta poco.
        if (aLinea > 0.01) {
          gb.filter = 'blur(3px)';
          trazar(gb, franjaY - sy, t, fase, 40, 0.42 * aLinea, '#C6FF3A', sb, hastaX);
        }
        if (e > 0.01) {
          // La misma línea, agrandada: capas anidadas que hacen una caída suave del centro a la orilla.
          gb.filter = 'blur(10px)';
          gb.save();
          gb.translate(blando.width / 2, blando.height / 2);
          gb.rotate(-0.5);
          gb.translate(-blando.width, -blando.height / 2);
          const largo = vw * 2;
          const G = Math.max(vw, vh) * (0.7 + 0.3 * e);
          trazar(gb, vh / 2, t * 0.4, fase, G * 0.55, 0.05 * e, '#7A5CFF', sb, largo);
          trazar(gb, vh / 2, t * 0.4, fase, G * 0.3, 0.06 * e, '#7A5CFF', sb, largo);
          trazar(gb, vh / 2, t * 0.4, fase, G * 0.14, 0.045 * e, '#C6FF3A', sb, largo);
          trazar(gb, vh / 2, t * 0.4, fase, G * 0.04, 0.05 * e, '#E8FFB0', sb, largo);
          gb.restore();
        }
        gb.filter = 'none';
      }
      // Lo nítido: cuerpo y núcleo de la línea, solo mientras se ve.
      if (aLinea > 0.01 || !nitidoLimpio) {
        pincel.setTransform(1, 0, 0, 1, 0, 0);
        pincel.globalCompositeOperation = 'source-over'; pincel.globalAlpha = 1;
        pincel.clearRect(0, 0, W, H);
        nitidoLimpio = aLinea <= 0.01;
      }
      if (aLinea > 0.01) {
        pincel.globalCompositeOperation = 'lighter'; pincel.lineCap = 'round';
        trazar(pincel, franjaY - sy, t, fase, 12, 0.22 * aLinea, '#C6FF3A', escala, hastaX);
        trazar(pincel, franjaY - sy, t, fase, 2.6, 0.95 * aLinea, '#E8FFB0', escala, hastaX);
      }
    }

    function paso(ahora) {
      if (!vivo) return;
      cuadro = win.requestAnimationFrame(paso);
      const dt = ultimoT ? Math.min(64, ahora - ultimoT) : 16;
      ultimoT = ahora;
      // Tiempo desde que se montó, acotado: en las GPU de teléfono un número grande pierde precisión.
      const t = ((ahora - arranque) / 1000) % 3600;
      const sy = win.scrollY;
      const dy = sy - yAntes; yAntes = sy;
      velocidad += (Math.min(4, Math.abs(dy) / dt) - velocidad) * 0.12;
      fase += (faseObjetivo + sy * 0.0035 - fase) * 0.08;

      // Lecturas primero, escrituras después.
      const rBanda = franjaGl && !franjaGl.hidden ? franjaGl.getBoundingClientRect() : null;
      const siguiente = proyectos && proyectos.nextElementSibling;
      const topSiguiente = siguiente ? siguiente.getBoundingClientRect().top : vh;
      const topProyectos = proyectos ? proyectos.getBoundingClientRect().top : vh;
      // Proyecto activo: el último cuya tarjeta cruzó la línea de lectura.
      const linea = enColumna ? vh * 0.6 : vh * 0.5;
      let nuevo = 0;
      if (franjaGl) for (let i = 0; i < tarjetas.length; i++) if (tarjetas[i].getBoundingClientRect().top < linea) nuevo = i;
      const finProyectos = !enColumna && finalPantalla ? finalPantalla.getBoundingClientRect().top + vh * 0.05 : masCodigo ? masCodigo.getBoundingClientRect().top : tarjetas.length ? tarjetas[tarjetas.length - 1].getBoundingClientRect().bottom : vh;

      // La luz: línea de la presentación que se apaga cuando llegan los proyectos; luego, ambiente.
      const aLinea = proyectos ? 1 - acotar((vh - topProyectos) / (vh * 0.6)) : 1 - acotar((sy - franjaY + vh * 0.3) / vh);
      const e = acotar((vh * 0.85 - topSiguiente) / (vh * 0.7));
      pintarLuz(t, sy, aLinea, e);
      const nuevaFase = e > 0.5 ? 'ambiente' : 'linea';
      if (nuevaFase !== faseLuz) { faseLuz = nuevaFase; luz.dataset.fase = nuevaFase; }
      if (e > 0.5 && !ambienteAntes && dy > 0) golpear();
      ambienteAntes = e > 0.5;

      // La pantalla.
      // Golpe al entrar a los proyectos.
      const entra = topProyectos < vh * 0.5;
      if (entra && !pegadoAntes && dy > 0) golpear();
      pegadoAntes = entra;
      if (franjaGl && gl && programa) {
        const enMosaico = finProyectos < linea;
        if (enMosaico !== (mosaicoMeta === 1)) {
          if (enMosaico && transicion) { transicion = null; avance = 0; desde = activo; delete franjaGl.dataset.transicion; }
          ponerMosaico(enMosaico);
        }
        if (!enMosaico && nuevo !== activo) cambiarProyecto(nuevo);
        if (transicion) {
          const p = acotar((ahora - transicion.t) / transicion.dura);
          avance = tipo === 0 ? vaiven(p) : salida(p);
          if (p >= 1) { transicion = null; avance = 0; desde = hacia; delete franjaGl.dataset.transicion; }
        }
        if (mosaicoTween) {
          const p = acotar((ahora - mosaicoTween.t) / mosaicoTween.dura);
          mosaico = mosaicoTween.de + (mosaicoMeta - mosaicoTween.de) * vaiven(p);
          if (p >= 1) mosaicoTween = null;
        }
        if (rBanda && rBanda.bottom > 0 && rBanda.top < vh) {
          const a = transicion ? desde : activo;
          const b = transicion ? hacia : activo;
          const otros = celdasMosaico(a);
          const unidades = [a, b, otros[0], otros[1], otros[2]];
          unidades.forEach((ix, k) => { gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_2D, texturas[ix === undefined ? a : ix]); });
          gl.uniform2f(u.R, anchoGl, altoGl);
          gl.uniform4f(u.P, caja.cx, caja.cy, caja.hw, caja.hh);
          gl.uniform1f(u.T, t);
          gl.uniform1f(u.K, Math.min(0.09, velocidad * 0.045));
          gl.uniform1f(u.Q, transicion ? avance : 0);
          gl.uniform1f(u.TIPO, tipo);
          gl.uniform1f(u.M, mosaico);
          gl.uniform1f(u.E, enColumna ? acotar(-rBanda.top / Math.max(1, rBanda.height)) * 0.8 + e * 0.2 : 0);
          gl.uniform1f(u.OPACO, enColumna ? 1 : 0);
          gl.uniform1f(u.F, fase);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
      }

      // La pila: la cámara viaja por la diagonal con el desplazamiento.
      if (pila) {
        const p = acotar((sy - pilaInicio) / pilaRecorrido);
        const enVista = sy + vh > pilaInicio - vh * 0.2 && sy < pilaInicio + pilaRecorrido + vh;
        const enPila = sy >= pilaInicio - 2 && sy <= pilaInicio + pilaRecorrido;
        if (enPila && !pilaAntes && dy > 0) golpear();
        pilaAntes = enPila;
        // El desplazamiento elige la tarjeta; la cámara viaja sola hasta ella y se queda quieta.
        // Así ninguna posición de scroll deja dos tarjetas a medias, una encima de otra.
        const destino = Math.round(p * (tarjetasPila.length - 1));
        if (posPila === null || !enVista) { posPila = destino; viajePila = null; }
        else if (destino !== (viajePila ? viajePila.a : posPila)) {
          viajePila = { de: posPila, a: destino, t: ahora, dura: Math.min(720, 420 + 90 * Math.abs(destino - posPila)) };
        }
        if (viajePila) {
          const avancePila = acotar((ahora - viajePila.t) / viajePila.dura);
          posPila = viajePila.de + (viajePila.a - viajePila.de) * vaiven(avancePila);
          if (avancePila >= 1) { posPila = viajePila.a; viajePila = null; }
        }
        const estadoPila = viajePila ? 'moviendo' : 'quieta';
        if (luz.dataset.pila !== estadoPila) luz.dataset.pila = estadoPila;
        if (enVista) {
          const s = posPila;
          const DX = Math.min(vw * 0.15, 110); const DY = Math.min(vh * 0.11, 90); const DZ = 360;
          tarjetasPila.forEach((li, i) => {
            const d = i - s;
            const k = d < 0 ? 1.4 : 1;
            const rot = Math.min(1, Math.abs(d));
            const tr = `translate(-50%, -50%) translate3d(${(d * DX * k).toFixed(1)}px, ${(-d * DY * k).toFixed(1)}px, ${(-d * DZ * (d < 0 ? 0.9 : 1)).toFixed(1)}px) rotateY(${(-12 * rot).toFixed(2)}deg) rotateX(${(7 * rot).toFixed(2)}deg)`;
            // Las de atrás quedan como placas sin texto; las que ya pasaron se desvanecen rápido; las
            // muy lejanas se apagan y así no cuesta componerlas.
            const niebla = d > 0 ? acotar((d - 0.12) / 0.4) : 0;
            const op = d < 0 ? acotar(1 + d * 2.2) : acotar((2.6 - d) / 0.6);
            if (li.__escT !== tr) { li.style.transform = tr; li.__escT = tr; }
            const n = niebla.toFixed(3);
            if (li.__escN !== n) { li.style.setProperty('--niebla', n); li.__escN = n; }
            const o = op.toFixed(3);
            if (li.__escO !== o) { li.style.opacity = o; li.__escO = o; }
            const act = Math.abs(d) < 0.5;
            if (li.__escA !== act) { li.classList.toggle('esc-activa', act); li.__escA = act; }
          });
        }
      }
    }
    cuadro = win.requestAnimationFrame(paso);

    return function desmontar() {
      vivo = false;
      win.cancelAnimationFrame(cuadro);
      corte.abort();
      observadores.forEach((o) => o.disconnect());
      relojes.forEach((id) => win.clearTimeout(id));
      animaciones.forEach((a) => a.cancel());
      animaciones.clear();
      if (gl) {
        texturas.forEach((t) => gl.deleteTexture(t));
        if (buffer) gl.deleteBuffer(buffer);
        if (programa) gl.deleteProgram(programa);
        const perder = gl.getExtension('WEBGL_lose_context');
        if (perder) perder.loseContext();
        gl = null;
      }
      blando.width = 0; luz.width = 0;
      nodos.forEach((n) => n.remove());
      tarjetasPila.forEach((li) => { delete li.__escT; delete li.__escN; delete li.__escO; delete li.__escA; });
      // Leer el atributo antes de quitarlo asienta los cambios pendientes del estilo en línea; si
      // no, el navegador puede volver a escribir un style vacío al serializar la página.
      estilos.forEach((v, el) => { el.getAttribute('style'); if (v === null) el.removeAttribute('style'); else el.setAttribute('style', v); });
      clases.forEach((v, el) => { if (v === null) el.removeAttribute('class'); else el.setAttribute('class', v); });
    };
  },
};
