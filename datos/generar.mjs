// Escribe los proyectos de datos/proyectos.json dentro de index.html, entre las marcas
// <!-- proyectos:inicio --> y <!-- proyectos:fin -->. Uso: node datos/generar.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datos = JSON.parse(fs.readFileSync(path.join(RAIZ, 'datos', 'proyectos.json'), 'utf8'));
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const sangria = (n) => ' '.repeat(n);

function medio(p) {
  const m = p.medio;
  const tam = p.destacado ? '(min-width: 1024px) 760px, 92vw' : '(min-width: 1200px) 420px, (min-width: 768px) 46vw, 92vw';
  if (m.tipo === 'imagen') {
    const pie = m.pie ? `\n${sangria(12)}<figcaption>${esc(m.pie)}</figcaption>` : '';
    return `${sangria(10)}<figure class="proyecto-medio" data-cae>
${sangria(12)}<img src="${m.src}-960.webp" srcset="${m.src}-560.webp 560w, ${m.src}-960.webp 960w" sizes="${tam}" width="${m.ancho}" height="${m.alto}" alt="${esc(m.alt)}" loading="lazy" decoding="async">${pie}
${sangria(10)}</figure>`;
  }
  if (m.tipo === 'videos') {
    const piezas = m.piezas.map((v) => `${sangria(14)}<li>
${sangria(16)}<div class="video-marco">
${sangria(18)}<img src="${v.poster}" width="360" height="640" alt="${esc(v.alt)}" loading="lazy" decoding="async">
${sangria(18)}<a class="ver-video" href="${v.video}" data-video>Ver<span class="solo-lector"> el video ${esc(v.nombre)}</span></a>
${sangria(16)}</div>
${sangria(16)}<span class="video-nombre">${esc(v.nombre)}</span>
${sangria(14)}</li>`).join('\n');
    return `${sangria(10)}<figure class="proyecto-medio proyecto-videos" data-cae>
${sangria(12)}<ul class="videos">
${piezas}
${sangria(12)}</ul>
${sangria(12)}<figcaption>${esc(m.pie)}</figcaption>
${sangria(10)}</figure>`;
  }
  if (m.tipo === 'cifra') {
    return `${sangria(10)}<figure class="proyecto-medio proyecto-cifra" data-cae aria-hidden="true">
${sangria(12)}<span class="antes">${esc(m.antes)}</span>
${sangria(12)}<span class="despues">${esc(m.despues)}</span>
${sangria(12)}<span class="nota">${esc(m.nota)}</span>
${sangria(10)}</figure>`;
  }
  return `${sangria(10)}<figure class="proyecto-medio proyecto-esquema" data-cae aria-hidden="true">
${sangria(12)}<ol>${m.lineas.map((l) => `<li>${esc(l)}</li>`).join('')}</ol>
${sangria(10)}</figure>`;
}

function proyecto(p) {
  const destacado = p.destacado ? ' data-destacado' : '';
  const cifras = p.cifras && p.cifras.length
    ? `\n${sangria(12)}<ul class="proyecto-cifras" aria-label="Cifras">${p.cifras.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '';
  const enlaces = p.enlaces && p.enlaces.length
    ? `\n${sangria(12)}<ul class="proyecto-enlaces">${p.enlaces.map((e) => `<li><a class="boton" href="${esc(e.url)}">${esc(e.texto)}<span class="solo-lector"> de ${esc(p.titulo)}</span></a></li>`).join('')}</ul>` : '';
  return `${sangria(8)}<article class="proyecto" data-proyecto="${p.id}" data-pieza="proy-${p.id}"${destacado} aria-labelledby="titulo-${p.id}">
${medio(p)}
${sangria(10)}<div class="proyecto-texto">
${sangria(12)}<span class="proyecto-tipo">${esc(p.tipo)}</span>
${sangria(12)}<h3 class="proyecto-titulo" id="titulo-${p.id}" data-teclea>${esc(p.titulo)}</h3>
${sangria(12)}<p class="proyecto-descripcion">${esc(p.descripcion)}</p>
${sangria(12)}<p class="proyecto-rol"><strong>Rol:</strong> ${esc(p.rol)}</p>${cifras}
${sangria(12)}<ul class="proyecto-stack" aria-label="Tecnologías">${p.stack.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>${enlaces}
${sangria(10)}</div>
${sangria(8)}</article>`;
}

const bloque = datos.proyectos.map(proyecto).join('\n');
const mas = datos.masSitios;
const lineaMas = `${sangria(6)}<div class="mas-sitios" data-pieza="proy-mas-sitios">
${sangria(8)}<p>${esc(mas.texto)}</p>
${sangria(8)}<ul>${mas.sitios.map((s) => `<li><a class="boton" href="${esc(s.url)}">${esc(s.nombre)}</a></li>`).join('')}<li><a class="boton" href="https://github.com/angeljgc-dev">Todo el código en GitHub</a></li></ul>
${sangria(6)}</div>`;

const ruta = path.join(RAIZ, 'index.html');
let html = fs.readFileSync(ruta, 'utf8');
const poner = (texto, marca, contenido) => {
  const re = new RegExp(`<!-- ${marca}:inicio -->[\\s\\S]*?<!-- ${marca}:fin -->`);
  if (!re.test(texto)) throw new Error('Falta la marca ' + marca);
  return texto.replace(re, () => `<!-- ${marca}:inicio -->\n${contenido}\n<!-- ${marca}:fin -->`);
};
html = poner(html, 'proyectos', bloque);
html = poner(html, 'mas-sitios', lineaMas);
fs.writeFileSync(ruta, html);
console.log(`${datos.proyectos.length} proyectos y ${mas.sitios.length} sitios escritos en index.html`);
