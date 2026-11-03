// Escena del teclado: un chasis y sus teclas, modelados en Blender con la oclusión horneada, una
// luz cálida de frente y una fría de contorno. Solo dibuja cuando algo se mueve: con el teclado
// quieto no hay ni un cuadro corriendo.
import * as THREE from './recursos/three.module.min.js';

// La rejilla con la que se modeló y horneó el chasis. Si el HTML trae otra, el chasis se estira.
const MODELO_COLUMNAS = 9;
const MODELO_FILAS = 6;
const ALTO_TECLA = 0.53;
const CARA = 0.33;
const CAMARA_Z = 24;
const LADO_LEYENDA = 0.68;
const FOV = 28;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));

export const TONOS = {
  hueso: '#eee7d9',
  coral: '#ed826e',
  albaricoque: '#f7b56a',
  agua: '#57c5c8',
  grafito: '#3e424d',
};
const TINTA = { claro: '#101524', oscuro: '#eee7d9' };

// ---------- curvas ----------
const potencia3 = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const salida2 = (t) => 1 - (1 - t) * (1 - t);
const rebote = (t) => {
  const c = 2.2;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const limitar = (v, a, b) => Math.min(b, Math.max(a, v));

// Números pseudoaleatorios fijos: el desarme sale igual en cada visita.
function semilla(n) {
  let s = n * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// ---------- modelo ----------
// El GLB viene con KHR_mesh_quantization: enteros normalizados, y la escala y el centro de cada
// malla en su nodo. Aquí se pasan a flotantes una sola vez.
async function cargarModelo(url, senal) {
  const respuesta = await fetch(url, { signal: senal });
  if (!respuesta.ok) throw new Error('No cargó el modelo del teclado');
  const buf = await respuesta.arrayBuffer();
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('El modelo no es GLB');
  const largo = dv.getUint32(12, true);
  const js = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, largo)));
  const inicioBin = 20 + largo + 8;
  const TIPOS = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const TOPE = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
  const COMPS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

  function leer(indice, usar, escala = 1, traslado = null) {
    const a = js.accessors[indice];
    const v = js.bufferViews[a.bufferView];
    const Tipo = TIPOS[a.componentType];
    const comps = COMPS[a.type];
    const paso = v.byteStride ? v.byteStride / Tipo.BYTES_PER_ELEMENT : comps;
    const crudo = new Tipo(buf, inicioBin + (v.byteOffset || 0) + (a.byteOffset || 0), (a.count - 1) * paso + comps);
    const tope = a.normalized ? TOPE[a.componentType] : 1;
    const salida = new Float32Array(a.count * usar);
    for (let i = 0; i < a.count; i++) {
      for (let k = 0; k < usar; k++) {
        let x = crudo[i * paso + k] / tope;
        if (a.normalized && x < -1) x = -1;
        salida[i * usar + k] = x * escala + (traslado ? traslado[k] : 0);
      }
    }
    return salida;
  }

  const mallas = {};
  for (const nodo of js.nodes) {
    const prim = js.meshes[nodo.mesh].primitives[0];
    const at = prim.attributes;
    const g = new THREE.BufferGeometry();
    const escala = nodo.scale ? nodo.scale[0] : 1;
    g.setAttribute('position', new THREE.BufferAttribute(leer(at.POSITION, 3, escala, nodo.translation || [0, 0, 0]), 3));
    const normales = leer(at.NORMAL, 3);
    for (let i = 0; i < normales.length; i += 3) {
      const l = Math.hypot(normales[i], normales[i + 1], normales[i + 2]) || 1;
      normales[i] /= l;
      normales[i + 1] /= l;
      normales[i + 2] /= l;
    }
    g.setAttribute('normal', new THREE.BufferAttribute(normales, 3));
    if (at.TEXCOORD_0 !== undefined) g.setAttribute('uv', new THREE.BufferAttribute(leer(at.TEXCOORD_0, 2), 2));
    if (at.COLOR_0 !== undefined) g.setAttribute('color', new THREE.BufferAttribute(leer(at.COLOR_0, 3), 3));
    const indices = leer(prim.indices, 1);
    g.setIndex(new THREE.BufferAttribute(Uint16Array.from(indices), 1));
    g.computeBoundingSphere();
    mallas[nodo.name] = g;
  }
  return mallas;
}

function cargarTextura(url) {
  return new Promise((listo, fallo) => new THREE.TextureLoader().load(url, listo, undefined, fallo));
}

// Piezas de una leyenda: las palabras, y dentro de cada palabra los puntos donde una tecla de
// verdad la partiría en dos renglones (cambio a mayúscula, después de una diagonal o un guion).
function piezas(texto) {
  const salida = [];
  texto.split(/\s+/).forEach((palabra) => {
    palabra.split(/(?<=[a-záéíóúñ])(?=[A-ZÁÉÍÓÚÑ])|(?<=[/-])/).forEach((t, k) => salida.push({ t, pegada: k > 0 }));
  });
  return salida;
}
// Corte silábico sencillo del español, para palabras largas que no caben en un renglón: antes
// de una consonante que abre sílaba (Evalua-ciones, Per-misos, inyec-ción), sin separar los
// grupos que van juntos (bl, cr, ch, ll...). Se elige el corte más cercano a la mitad.
const VOCAL = /[aeiouáéíóúü]/i;
const ATADAS = /^(bl|br|cl|cr|dr|fl|fr|gl|gr|pl|pr|tr|ch|ll|rr|qu|th|sh|ph|ck)$/i;
function silabear(palabra) {
  let mejor = -1;
  for (let k = 2; k <= palabra.length - 3; k++) {
    const antes = palabra[k - 1];
    const aqui = palabra[k];
    const despues = palabra[k + 1];
    if (!/[a-zñ]/i.test(aqui) || VOCAL.test(aqui)) continue;
    if (ATADAS.test(antes + aqui)) continue;
    if (!VOCAL.test(despues) && !ATADAS.test(aqui + despues)) continue;
    if (mejor < 0 || Math.abs(k - palabra.length / 2) < Math.abs(mejor - palabra.length / 2)) mejor = k;
  }
  return mejor;
}
// Partir una leyenda en renglones que quepan en el ancho dado. Con "partir", una pieza que no
// cabe sola se corta por sílaba con guion.
function renglones(c, texto, ancho, partir = false) {
  const salida = [];
  let linea = '';
  const lista = [];
  piezas(texto).forEach((p) => {
    const k = partir && c.measureText(p.t).width > ancho ? silabear(p.t) : -1;
    if (k < 0) lista.push(p);
    else lista.push({ t: p.t.slice(0, k) + '-', pegada: p.pegada }, { t: p.t.slice(k), pegada: true });
  });
  for (const p of lista) {
    const prueba = linea ? linea + (p.pegada ? '' : ' ') + p.t : p.t;
    if (c.measureText(prueba).width <= ancho || !linea) linea = prueba;
    else {
      salida.push(linea);
      linea = p.t;
    }
  }
  if (linea) salida.push(linea);
  return salida;
}

// Atlas de leyendas: blanco sobre transparente, una celda de 128 px por tecla. La letra es
// condensada, como en las teclas de verdad, y se achica hasta caber en dos renglones. Devuelve
// también el tamaño de letra de cada tecla, para saber cómo se ve en pantalla.
const CELDA = 128;
function hacerAtlas(teclas, columnas, filas, fuente) {
  const lienzo = document.createElement('canvas');
  lienzo.width = CELDA * columnas;
  lienzo.height = CELDA * filas;
  const c = lienzo.getContext('2d');
  c.fillStyle = '#fff';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  // Margen dentro de la celda: al achicar la textura, la vecina no se cuela bajo la leyenda.
  const util = CELDA - 12;
  const tamanos = teclas.map((t, i) => {
    if (!t.leyenda) return 0;
    const x = (i % columnas) * CELDA + CELDA / 2;
    const y = Math.floor(i / columnas) * CELDA + CELDA / 2;
    // El tamaño más grande que cabe en dos renglones; cortar por sílaba solo si gana bastante.
    const medir = (partir) => {
      for (let tam = 64; tam >= 16; tam -= 1) {
        c.font = '400 ' + tam + 'px ' + fuente;
        const lineas = renglones(c, t.leyenda, util, partir);
        if (lineas.length <= (partir ? 3 : 2) && lineas.every((l) => c.measureText(l).width <= util) && lineas.length * tam * 1.04 <= util) return { tam, lineas };
      }
      c.font = '400 16px ' + fuente;
      return { tam: 16, lineas: renglones(c, t.leyenda, util, partir) };
    };
    const entera = medir(false);
    const cortada = medir(true);
    // Solo se corta si entera quedaría chica (menos de 36 px aquí, unos 8.5 en un teléfono).
    const { tam, lineas } = entera.tam < 36 && cortada.tam > entera.tam * 1.25 ? cortada : entera;
    c.font = '400 ' + tam + 'px ' + fuente;
    const alto = tam * 1.04;
    lineas.forEach((l, k) => c.fillText(l, x, y + (k - (lineas.length - 1) / 2) * alto, util));
    return tam;
  });
  const tex = new THREE.CanvasTexture(lienzo);
  tex.colorSpace = THREE.NoColorSpace;
  tex.flipY = false;
  return { tex, tamanos };
}

// Estudio para los reflejos: un cuarto oscuro con una caja de luz cálida arriba a la izquierda y
// una tira fría a la derecha. Es lo que pinta el brillo en el filete de cada tecla.
function hacerEstudio(renderer) {
  const escena = new THREE.Scene();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const cuarto = new THREE.MeshBasicMaterial({ color: '#1b1f2c', side: THREE.BackSide });
  const calida = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff1dc').multiplyScalar(5) });
  const fria = new THREE.MeshBasicMaterial({ color: new THREE.Color('#9fe3e5').multiplyScalar(2.2) });
  const suelo = new THREE.MeshBasicMaterial({ color: '#0b0f1a' });
  const caja = new THREE.Mesh(geo, cuarto);
  caja.scale.set(20, 12, 20);
  escena.add(caja);
  const luz = new THREE.Mesh(geo, calida);
  luz.position.set(-4, 5.5, 4);
  luz.scale.set(7, 0.2, 5);
  escena.add(luz);
  const tira = new THREE.Mesh(geo, fria);
  tira.position.set(9.5, 1.5, -2);
  tira.scale.set(0.2, 6, 1.6);
  escena.add(tira);
  const piso = new THREE.Mesh(geo, suelo);
  piso.position.set(0, -5.9, 0);
  piso.scale.set(20, 0.2, 20);
  escena.add(piso);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const destino = pmrem.fromScene(escena, 0.03);
  pmrem.dispose();
  geo.dispose();
  [cuarto, calida, fria, suelo].forEach((m) => m.dispose());
  return destino;
}

function hacerHalo() {
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 64;
  const c = lienzo.getContext('2d');
  const g = c.createRadialGradient(32, 32, 4, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(lienzo);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// El plano de la leyenda sigue la concavidad de la cara para no quedar flotando.
function hacerPlanoLeyenda() {
  const lado = LADO_LEYENDA;
  const g = new THREE.PlaneGeometry(lado, lado, 6, 6);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const r = Math.min(1, Math.hypot(p.getX(i), p.getZ(i)) / CARA);
    p.setY(i, 0.53 - 0.018 * (1 - r * r) + 0.004);
  }
  // El atlas se dibujó con el origen arriba; la textura no se voltea.
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  return g;
}

const SOMBREADO_LEYENDA = {
  vertexShader: /* glsl */ `
    attribute vec2 aCelda;
    attribute vec3 aTinta;
    uniform vec2 uCelda;
    varying vec2 vUv;
    varying vec3 vTinta;
    void main() {
      vUv = aCelda + (0.03 + uv * 0.94) * uCelda;
      vTinta = aTinta;
      vec4 p = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        p = instanceMatrix * p;
      #endif
      gl_Position = projectionMatrix * modelViewMatrix * p;
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D uAtlas;
    uniform float uOpacidad;
    varying vec2 vUv;
    varying vec3 vTinta;
    void main() {
      float a = texture2D(uAtlas, vUv).a * uOpacidad;
      if (a < 0.03) discard;
      gl_FragColor = vec4(vTinta, a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

// ---------- la escena ----------
export async function crearEscena({ lienzo, teclas, columnas, filas, base, senal, telefono, fuente }) {
  const COLUMNAS = columnas;
  const FILAS = filas;
  // s = 1 quiere decir que el chasis mide de ancho lo mismo que el lado corto de la pantalla.
  const MEDIO_CHASIS = COLUMNAS / 2 + 0.3;
  const [mallas, texAo, texSombra] = await Promise.all([
    cargarModelo(new URL('teclado.glb', base), senal),
    cargarTextura(new URL('base-ao.webp', base).href),
    cargarTextura(new URL('sombra.webp', base).href),
  ]);
  if (senal.aborted) {
    Object.values(mallas).forEach((g) => g.dispose());
    texAo.dispose();
    texSombra.dispose();
    throw new DOMException('Se desmontó antes de terminar', 'AbortError');
  }

  const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Los sombreadores ya se probaron; revisarlos en cada compilación solo cuesta tiempo.
  renderer.debug.checkShaderErrors = false;
  const escena = new THREE.Scene();
  const estudio = hacerEstudio(renderer);
  escena.environment = estudio.texture;

  const camara = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80);
  camara.position.set(0, 0, CAMARA_Z);

  escena.add(new THREE.HemisphereLight('#fff4e6', '#0b0f1a', 1.3));
  const clave = new THREE.DirectionalLight('#fff0da', 2.4);
  clave.position.set(-6, 9, 9);
  escena.add(clave);
  const contorno = new THREE.DirectionalLight('#7fdadd', 1.4);
  contorno.position.set(8, 4, -7);
  escena.add(contorno);

  const grupo = new THREE.Group();
  escena.add(grupo);

  texAo.colorSpace = THREE.NoColorSpace;
  texAo.flipY = false;
  const matBase = new THREE.MeshStandardMaterial({ color: '#2a3144', roughness: 0.34, metalness: 0.25, aoMap: texAo, aoMapIntensity: 0.92, envMapIntensity: 0.9 });
  const chasis = new THREE.Mesh(mallas.base, matBase);
  const estirar = new THREE.Vector3((COLUMNAS + 0.6) / (MODELO_COLUMNAS + 0.6), 1, (FILAS + 0.6) / (MODELO_FILAS + 0.6));
  chasis.scale.copy(estirar);
  grupo.add(chasis);

  const geoSombra = new THREE.PlaneGeometry((MODELO_COLUMNAS / 2 + 1.8) * 2 * estirar.x, (MODELO_FILAS / 2 + 1.8) * 2 * estirar.z);
  geoSombra.rotateX(-Math.PI / 2);
  const matSombra = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, alphaMap: texSombra, opacity: 0.9, depthWrite: false });
  const sombra = new THREE.Mesh(geoSombra, matSombra);
  sombra.position.y = -0.505;
  sombra.renderOrder = -1;
  grupo.add(sombra);
  // Un charco de luz tibia bajo el teclado: sin él, la sombra de contacto se pierde en el fondo
  // casi negro de la página.
  const texCharco = hacerHalo();
  const geoCharco = new THREE.PlaneGeometry(1, 1);
  geoCharco.rotateX(-Math.PI / 2);
  const matCharco = new THREE.MeshBasicMaterial({ map: texCharco, color: '#3a3346', transparent: true, opacity: 0.75, depthWrite: false });
  const charco = new THREE.Mesh(geoCharco, matCharco);
  charco.scale.set((MODELO_COLUMNAS + 7) * estirar.x, 1, (MODELO_FILAS + 7) * estirar.z);
  charco.position.y = -0.51;
  charco.renderOrder = -2;
  grupo.add(charco);

  const n = teclas.length;
  const matTecla = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0, envMapIntensity: 0.85 });
  // Brillo de borde: donde la superficie se voltea respecto a la vista (los filetes y el canto),
  // la tecla junta un poco de luz, como el plástico real en el contorno.
  const bordeBrillante = (sombreador) => {
    sombreador.fragmentShader = sombreador.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float borde = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.6);
      totalEmissiveRadiance += (diffuseColor.rgb * 0.55 + 0.45) * borde * 0.34;`);
  };
  matTecla.onBeforeCompile = bordeBrillante;
  const tapas = new THREE.InstancedMesh(mallas.tecla, matTecla, n);
  tapas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  grupo.add(tapas);

  const filasAtlas = Math.ceil(teclas.length / COLUMNAS);
  const { tex: atlas, tamanos } = hacerAtlas(teclas, COLUMNAS, filasAtlas, fuente);
  const geoLeyenda = hacerPlanoLeyenda();
  const celdas = new Float32Array(n * 2);
  const tintas = new Float32Array(n * 3);
  teclas.forEach((t, i) => {
    celdas[i * 2] = (i % COLUMNAS) / COLUMNAS;
    celdas[i * 2 + 1] = Math.floor(i / COLUMNAS) / filasAtlas;
  });
  geoLeyenda.setAttribute('aCelda', new THREE.InstancedBufferAttribute(celdas, 2));
  const atrTinta = new THREE.InstancedBufferAttribute(tintas, 3);
  atrTinta.setUsage(THREE.DynamicDrawUsage);
  geoLeyenda.setAttribute('aTinta', atrTinta);
  const matLeyenda = new THREE.ShaderMaterial({
    ...SOMBREADO_LEYENDA,
    uniforms: { uAtlas: { value: atlas }, uCelda: { value: new THREE.Vector2(1 / COLUMNAS, 1 / filasAtlas) }, uOpacidad: { value: 1 } },
    transparent: true,
  });
  const leyendas = new THREE.InstancedMesh(geoLeyenda, matLeyenda, n);
  leyendas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  leyendas.renderOrder = 2;
  // Al desarmarse las teclas salen de la esfera que se calculó en reposo: no se recortan.
  tapas.frustumCulled = false;
  leyendas.frustumCulled = false;
  grupo.add(leyendas);

  const texHalo = hacerHalo();
  const geoHalo = new THREE.PlaneGeometry(1.7, 1.7);
  geoHalo.rotateX(-Math.PI / 2);
  const matHalo = new THREE.MeshBasicMaterial({ map: texHalo, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const halos = new THREE.InstancedMesh(geoHalo, matHalo, n);
  halos.renderOrder = 1;
  grupo.add(halos);

  // Estelas del giro: tres copias que van tantito atrás en el tiempo, cada vez más tenues.
  const fantasmas = [0.32, 0.2, 0.11].map((opacidad) => {
    const g = new THREE.Group();
    const mt = matTecla.clone();
    mt.onBeforeCompile = bordeBrillante;
    mt.transparent = true;
    mt.opacity = opacidad;
    mt.depthWrite = false;
    const mb = matBase.clone();
    mb.transparent = true;
    mb.opacity = opacidad;
    mb.depthWrite = false;
    const copia = new THREE.InstancedMesh(mallas.tecla, mt, n);
    copia.instanceMatrix = tapas.instanceMatrix;
    copia.frustumCulled = false;
    const c = new THREE.Mesh(mallas.base, mb);
    c.scale.copy(estirar);
    g.add(c, copia);
    g.visible = false;
    g.renderOrder = 3;
    escena.add(g);
    return { g, copia, mt, mb };
  });

  // ---------- estado de cada tecla ----------
  const azar = semilla(7);
  // Cada renglón ocupa todo el ancho: si un grupo tiene menos habilidades, sus teclas son más
  // anchas, como las modificadoras de un teclado de verdad, en vez de dejar huecos.
  const estado = teclas.map((t, i) => {
    const paso = COLUMNAS / t.cuantos;
    const ang = azar() * Math.PI * 2;
    return {
      x: -COLUMNAS / 2 + paso * (t.columna + 0.5),
      z: t.fila - (FILAS - 1) / 2,
      ancho: (paso - 0.08) / 0.92,
      // Alto de la letra sobre la tecla, en unidades (el plano usa el 94 % central de la celda).
      letra: tamanos[i] * LADO_LEYENDA * 0.94 / CELDA,
      tono: new THREE.Color(TONOS[t.familia]),
      tinta: new THREE.Color(t.familia === 'grafito' ? TINTA.oscuro : TINTA.claro),
      // El desarme: cada tecla tiene su rumbo, su giro y su resorte.
      rumbo: new THREE.Vector3(Math.cos(ang) * (0.6 + azar()), 1.4 + azar() * 2.2, Math.sin(ang) * (0.6 + azar())),
      ejeGiro: new THREE.Vector3(azar() - 0.5, azar() - 0.5, azar() - 0.5).normalize(),
      vueltas: (azar() - 0.5) * 3.2,
      rigidez: 26 + azar() * 40,
      e: 0,
      ve: 0,
      luz: 0,
      apagada: 0,
      encima: 0,
      presion: -1,
    };
  });

  const m4 = new THREE.Matrix4();
  const m4b = new THREE.Matrix4();
  const m4c = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v3 = new THREE.Vector3();
  const escalaUno = new THREE.Vector3(1, 1, 1);
  const escalaTecla = new THREE.Vector3(1, 1, 1);
  const posTecla = new THREE.Vector3();
  const giroTecla = new THREE.Quaternion();
  const color = new THREE.Color();
  const ejeY = new THREE.Vector3(0, 1, 0);
  let giroLeyenda = 0;

  // Deja en m4 la matriz de la tapa (estirada a su ancho) y en m4b la de su leyenda (sin estirar).
  function matrizTecla(i) {
    const s = estado[i];
    const y = alturaTecla(s);
    posTecla.set(s.x, y, s.z);
    giroTecla.identity();
    if (s.e > 0.0005) {
      v3.copy(s.rumbo).multiplyScalar(s.e * 1.15);
      posTecla.add(v3);
      giroTecla.setFromAxisAngle(s.ejeGiro, s.e * s.vueltas);
    }
    m4.compose(posTecla, giroTecla, escalaTecla.set(s.ancho, 1, 1));
    m4b.compose(posTecla, giroTecla, escalaUno).multiply(m4c.makeRotationY(giroLeyenda));
  }
  function alturaTecla(s) {
    let y = s.luz * 0.24 + s.encima * 0.06;
    if (s.presion >= 0) {
      const t = s.presion;
      const hundir = t < 0.06 ? salida2(t / 0.06) : 1 - rebote(Math.min(1, (t - 0.06) / 0.18));
      y -= 0.18 * hundir;
    }
    return y;
  }
  function escribirTeclas() {
    for (let i = 0; i < n; i++) {
      const s = estado[i];
      matrizTecla(i);
      tapas.setMatrixAt(i, m4);
      leyendas.setMatrixAt(i, m4b);
      // Tono: la encendida sube de brillo, las demás se apagan cuando hay encendidas.
      const factor = (1 + s.luz * 0.45) * (1 - s.apagada * 0.64);
      color.copy(s.tono).multiplyScalar(factor);
      tapas.setColorAt(i, color);
      color.copy(s.tinta).multiplyScalar(1 - s.apagada * 0.45);
      atrTinta.setXYZ(i, color.r, color.g, color.b);
      color.copy(s.tono).multiplyScalar(s.luz * 1.4);
      halos.setColorAt(i, color);
      halos.setMatrixAt(i, m4.compose(posTecla.set(s.x, 0.02, s.z), giroTecla.identity(), escalaTecla.set(s.ancho, 1, 1)));
    }
    tapas.instanceMatrix.needsUpdate = true;
    tapas.instanceColor.needsUpdate = true;
    leyendas.instanceMatrix.needsUpdate = true;
    atrTinta.needsUpdate = true;
    halos.instanceMatrix.needsUpdate = true;
    halos.instanceColor.needsUpdate = true;
  }
  escribirTeclas();
  fantasmas.forEach((f) => {
    f.copia.instanceColor = tapas.instanceColor;
  });

  // ---------- poses ----------
  let ancho = 1;
  let alto = 1;
  const actual = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), s: 1, leyenda: 0, giro: 0 };
  let transicion = null;
  let deriva = null;
  let poseNombre = null;
  let poseDatos = null;

  function medioAlto(z) {
    return (CAMARA_Z - z) * TAN;
  }
  function resolver(p) {
    const hh = medioAlto(p.z || 0);
    const hw = hh * (ancho / alto);
    const pos = new THREE.Vector3((p.x || 0) * hw, (p.y || 0) * hh, p.z || 0);
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      THREE.MathUtils.degToRad(p.rx || 0), THREE.MathUtils.degToRad(p.ry || 0), THREE.MathUtils.degToRad(p.rz || 0), 'ZXY',
    ));
    // El tamaño se fija en el plano de enfoque; z mueve el teclado de verdad hacia la cámara o
    // lejos de ella, y la perspectiva cambia con él.
    const hh0 = medioAlto(0);
    const s = (p.s || 1) * Math.min(hh0 * (ancho / alto), hh0) / MEDIO_CHASIS;
    return { pos, quat, s, leyenda: THREE.MathUtils.degToRad(p.leyenda || 0) };
  }
  function aplicar(e, destino = grupo) {
    destino.position.copy(e.pos);
    q.setFromAxisAngle(ejeY, e.giro).multiply(e.quat);
    destino.quaternion.copy(q);
    destino.scale.setScalar(e.s);
  }
  function enTiempo(tr, t) {
    const k = tr.curva(limitar((t - tr.t0) / tr.dur, 0, 1));
    return {
      pos: tr.desde.pos.clone().lerp(tr.hasta.pos, k),
      quat: tr.desde.quat.clone().slerp(tr.hasta.quat, k),
      s: tr.desde.s + (tr.hasta.s - tr.desde.s) * k,
      leyenda: tr.desde.leyenda + (tr.hasta.leyenda - tr.desde.leyenda) * k,
      giro: tr.desde.giro + (tr.hasta.giro - tr.desde.giro) * k,
    };
  }

  // Con "arriba" la pose pide que el borde superior de las teclas quede a esos pixeles del tope
  // de la pantalla: así no sobra un hueco arriba en teléfonos de distinto alto.
  function ajustarArriba(hasta, px) {
    const guardado = { p: grupo.position.clone(), q: grupo.quaternion.clone(), s: grupo.scale.clone() };
    aplicar({ ...hasta, giro: 0 });
    grupo.updateMatrixWorld();
    let tope = Infinity;
    estado.forEach((e) => {
      for (const [a, , b] of esquinas) tope = Math.min(tope, proyectar(e.x + a * e.ancho, ALTO_TECLA, e.z + b).y);
    });
    grupo.position.copy(guardado.p);
    grupo.quaternion.copy(guardado.q);
    grupo.scale.copy(guardado.s);
    grupo.updateMatrixWorld();
    hasta.pos.y += (tope - px) * (2 * medioAlto(hasta.pos.z) / alto);
  }

  function irA(nombre, datos, { giro = 0, dur = 0.62, instantaneo = false, entrada = false } = {}) {
    poseNombre = nombre;
    poseDatos = datos;
    const hasta = resolver(datos);
    if (datos.arriba !== undefined) ajustarArriba(hasta, datos.arriba);
    const vuelta = Math.PI * 2;
    if (instantaneo) {
      transicion = null;
      Object.assign(actual, { ...hasta, giro: 0 });
      giroLeyenda = hasta.leyenda;
      aplicar(actual);
      deriva = null;
      escribirTeclas();
      pedirCuadro();
      return;
    }
    const desde = { pos: actual.pos.clone(), quat: actual.quat.clone(), s: actual.s, leyenda: actual.leyenda, giro: actual.giro };
    if (entrada) {
      desde.pos = hasta.pos.clone().add(new THREE.Vector3(0, -medioAlto(0) * 1.3, 0));
      desde.quat = hasta.quat.clone();
      desde.s = hasta.s * 0.7;
      desde.leyenda = hasta.leyenda;
      desde.giro = -vuelta;
    }
    const vueltasYa = Math.round(desde.giro / vuelta);
    const giroFinal = (vueltasYa + (entrada ? 1 : giro)) * vuelta;
    transicion = {
      desde,
      hasta: { ...hasta, giro: entrada ? 0 : giroFinal },
      t0: performance.now() / 1000,
      dur,
      curva: potencia3,
      gira: entrada || giro !== 0,
    };
    deriva = null;
    pedirCuadro();
  }

  // ---------- cuadros ----------
  let idCuadro = 0;
  let ultimo = 0;
  let vivo = true;
  let velocidad = 0;
  let quieto = true;
  let llegada = false;
  const alQuedarQuieto = new Set();

  function pedirCuadro() {
    if (!vivo || idCuadro || document.hidden) return;
    quieto = false;
    ultimo = 0;
    idCuadro = requestAnimationFrame(cuadro);
  }

  function cuadro(ms) {
    idCuadro = 0;
    if (!vivo) return;
    const ahora = ms / 1000;
    const dt = ultimo ? Math.min(0.05, ahora - ultimo) : 1 / 60;
    ultimo = ahora;
    const t = performance.now() / 1000;
    let sigue = false;

    fantasmas.forEach((f) => { f.g.visible = false; });
    if (transicion) {
      const e = enTiempo(transicion, t);
      Object.assign(actual, e);
      giroLeyenda = e.leyenda;
      aplicar(actual);
      // Estela solo en la parte rápida del giro.
      if (transicion.gira) {
        const avance = (t - transicion.t0) / transicion.dur;
        const fuerza = Math.sin(limitar(avance, 0, 1) * Math.PI);
        if (fuerza > 0.35) {
          fantasmas.forEach((f, k) => {
            const atras = enTiempo(transicion, t - (k + 1) * 0.024);
            aplicar(atras, f.g);
            f.g.visible = true;
            f.mt.opacity = f.mb.opacity = [0.32, 0.2, 0.11][k] * fuerza;
          });
        }
      }
      if (t >= transicion.t0 + transicion.dur) {
        actual.giro = 0;
        aplicar(actual);
        transicion = null;
        deriva = { t0: t, dur: poseNombre === 'contacto' ? 4.5 : 2.4 };
        llegada = true;
      }
      sigue = true;
    } else if (deriva) {
      // Deriva lenta al llegar: el objeto respira y se queda quieto del todo al final.
      const k = (t - deriva.t0) / deriva.dur;
      if (k >= 1) {
        deriva = null;
        aplicar(actual);
      } else {
        const env = Math.pow(1 - k, 2) * Math.sin(k * Math.PI);
        aplicar(actual);
        q.setFromAxisAngle(ejeY, Math.sin(k * 5.2) * 0.05 * env);
        grupo.quaternion.premultiply(q);
        grupo.position.y = actual.pos.y + Math.sin(k * 4) * 0.08 * env * actual.s;
        sigue = true;
      }
    }

    // Resortes de cada tecla.
    const objetivo = limitar((velocidad - 2.4) / 3.2, 0, 1);
    let teclasEnMovimiento = false;
    for (const s of estado) {
      const fuerza = (objetivo - s.e) * s.rigidez - s.ve * 2 * Math.sqrt(s.rigidez) * 0.9;
      s.ve += fuerza * dt;
      s.e += s.ve * dt;
      if (s.e < 0) { s.e = 0; s.ve = 0; }
      for (const campo of ['luz', 'apagada', 'encima']) {
        const meta = s['meta_' + campo] || 0;
        const d = meta - s[campo];
        if (Math.abs(d) > 0.002) {
          s[campo] += d * Math.min(1, dt * 9);
          teclasEnMovimiento = true;
        } else {
          s[campo] = meta;
        }
      }
      if (s.presion >= 0) {
        s.presion += dt;
        if (s.presion > 0.26) s.presion = -1;
        teclasEnMovimiento = true;
      }
      if (Math.abs(s.e - objetivo) > 0.001 || Math.abs(s.ve) > 0.001) teclasEnMovimiento = true;
    }
    escribirTeclas();
    if (llegada) {
      llegada = false;
      alQuedarQuieto.forEach((f) => f());
    }
    // La sombra solo tiene sentido si la base mira hacia la cámara.
    v3.set(0, 1, 0).applyQuaternion(grupo.quaternion);
    const deCara = limitar(v3.z * 1.6 + v3.y * 0.6, 0, 1);
    matSombra.opacity = 0.9 * deCara;
    matCharco.opacity = 0.75 * deCara;
    renderer.render(escena, camara);
    if (sigue || teclasEnMovimiento) {
      idCuadro = requestAnimationFrame(cuadro);
    } else {
      quieto = true;
      alQuedarQuieto.forEach((f) => f());
    }
  }

  function medir() {
    ancho = Math.max(1, lienzo.clientWidth);
    alto = Math.max(1, lienzo.clientHeight);
    const proporcion = Math.min(window.devicePixelRatio || 1, telefono() ? 1.75 : 1.5);
    renderer.setPixelRatio(proporcion);
    renderer.setSize(ancho, alto, false);
    camara.aspect = ancho / alto;
    camara.updateProjectionMatrix();
  }
  medir();

  // ---------- lo que se ofrece ----------
  const rayo = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  // La huella completa de la tecla, de la falda a la cara: es lo que recibe el toque.
  const FALDA = 0.46;
  const esquinas = [];
  for (const y of [0.03, ALTO_TECLA]) for (const a of [-FALDA, FALDA]) for (const b of [-FALDA, FALDA]) esquinas.push([a, y, b]);

  function proyectar(x, y, z) {
    v3.set(x, y, z).applyMatrix4(grupo.matrixWorld).project(camara);
    return { x: (v3.x + 1) / 2 * ancho, y: (1 - v3.y) / 2 * alto };
  }

  return {
    irA,
    redimensionar() {
      medir();
      if (poseDatos) irA(poseNombre, poseDatos, { instantaneo: true });
      else renderer.render(escena, camara);
    },
    // Velocidad del desplazamiento en pantallas por segundo: al pasar rápido, las teclas se separan.
    velocidad(v) {
      velocidad = v;
      const separadas = estado.some((s) => s.e > 0.001);
      if (separadas || limitar((v - 2.4) / 3.2, 0, 1) > 0) pedirCuadro();
    },
    iluminar(indices) {
      const hay = indices && indices.size > 0;
      estado.forEach((s, i) => {
        s.meta_luz = hay && indices.has(i) ? 1 : 0;
        s.meta_apagada = hay && !indices.has(i) ? 1 : 0;
      });
      pedirCuadro();
    },
    resaltar(indice) {
      estado.forEach((s, i) => { s.meta_encima = i === indice ? 1 : 0; });
      pedirCuadro();
    },
    presionar(indice) {
      if (estado[indice]) estado[indice].presion = 0;
      pedirCuadro();
    },
    tecla(x, y, tacto) {
      grupo.updateMatrixWorld();
      ndc.set((x / ancho) * 2 - 1, -(y / alto) * 2 + 1);
      rayo.setFromCamera(ndc, camara);
      const golpe = rayo.intersectObject(tapas, false)[0];
      if (golpe && golpe.instanceId !== undefined) return golpe.instanceId;
      if (!tacto) return -1;
      // Con el dedo se perdona: gana la tecla más cercana si el toque cae a menos de 28 px.
      let mejor = -1;
      let distancia = 28;
      estado.forEach((s, i) => {
        const c = proyectar(s.x, ALTO_TECLA, s.z);
        const d = Math.hypot(c.x - x, c.y - y);
        if (d < distancia) { distancia = d; mejor = i; }
      });
      return mejor;
    },
    // Cajas de las caras superiores en pantalla, en reposo, y si el teclado mira de frente.
    cajas() {
      grupo.updateMatrixWorld();
      v3.set(0, 1, 0).applyQuaternion(grupo.quaternion);
      const deFrente = v3.z > 0.35;
      return {
        deFrente,
        teclas: estado.map((s) => {
          const ps = esquinas.map(([a, y, b]) => proyectar(s.x + a * s.ancho, y, s.z + b));
          const xs = ps.map((p) => p.x);
          const ys = ps.map((p) => p.y);
          const x0 = Math.min(...xs);
          const y0 = Math.min(...ys);
          // Alto de la letra en pantalla: la medida de la leyenda en su eje vertical, proyectada.
          const dx = -Math.sin(giroLeyenda) * s.letra / 2;
          const dz = -Math.cos(giroLeyenda) * s.letra / 2;
          const a = proyectar(s.x + dx, 0.53, s.z + dz);
          const b = proyectar(s.x - dx, 0.53, s.z - dz);
          return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0, letra: Math.hypot(a.x - b.x, a.y - b.y) };
        }),
      };
    },
    pose: () => poseNombre,
    enMovimiento: () => !!transicion,
    quieto: () => quieto,
    alQuedarQuieto(f) {
      alQuedarQuieto.add(f);
      return () => alQuedarQuieto.delete(f);
    },
    pausar() {
      if (idCuadro) cancelAnimationFrame(idCuadro);
      idCuadro = 0;
    },
    reanudar: pedirCuadro,
    // Suelta todo lo que vive en la GPU y el contexto mismo.
    destruir() {
      vivo = false;
      if (idCuadro) cancelAnimationFrame(idCuadro);
      idCuadro = 0;
      alQuedarQuieto.clear();
      fantasmas.forEach((f) => {
        f.mt.dispose();
        f.mb.dispose();
        f.copia.dispose();
      });
      tapas.dispose();
      leyendas.dispose();
      halos.dispose();
      Object.values(mallas).forEach((g) => g.dispose());
      [geoLeyenda, geoHalo, geoSombra, geoCharco].forEach((g) => g.dispose());
      [matBase, matTecla, matLeyenda, matHalo, matSombra, matCharco].forEach((m) => m.dispose());
      [texAo, texSombra, atlas, texHalo, texCharco].forEach((t) => t.dispose());
      estudio.dispose();
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
    info: () => renderer.info,
  };
}
