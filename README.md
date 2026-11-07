# Ángel García Canteros · portafolio

**Ver en vivo: [angeljgc-dev.github.io](https://angeljgc-dev.github.io)**

Sitio personal de Ángel Josué García Canteros, desarrollador full-stack en Matías Romero, Oaxaca.
Reúne experiencia, proyectos, la tesis de maestría, habilidades y contacto.

El contenido está una sola vez en `index.html` y se lee completo sin JavaScript. Encima de ese
contenido van los estilos: formas distintas de presentar lo mismo, que el visitante elige en la
cabecera. El estilo de base, **Cursores**, arma la página frente a quien la abre, como un lienzo en
una herramienta de diseño: cursores que llegan, guías, recuadros con manijas, texto que se teclea y
piezas que caen en su lugar. Con movimiento reducido, todo aparece terminado desde el principio.

## Novedades

Ocho estilos para elegir en la cabecera: **Cursores** (el de base), **Gafete**, **Escenario**,
**Teclado**, **Pausa**, **Collage**, **Descenso** y **Vuelo**. Vuelo es una escena 3D renderizada
en Blender: se sube la cortinilla de la ventanilla, se cruza el vidrio y se vuela entre las nubes
siguiendo el scroll. Al cambiar de estilo la página no se recarga:
sube al principio y el estilo nuevo se arma con su entrada completa. Los cambios están en `CHANGELOG.md`.

## Cómo verlo

Es un sitio estático, sin compilación. Para verlo completo hay que servirlo por http, por ejemplo:

```
python -m http.server 8000
```

y abrir `http://localhost:8000`. También abre con doble clic en `index.html`: así se ve el estilo de
base, terminado, sin la construcción ni el selector, porque el navegador no carga módulos desde
archivos locales.

Para publicarlo basta subir la carpeta a GitHub Pages.

## Estructura

```
index.html              todo el contenido, una sola vez
nucleo/registro.js      la lista de estilos y cuáles están publicados
nucleo/nucleo.js        cargador, selector de estilo y video bajo demanda
datos/proyectos.json    los proyectos; node datos/generar.mjs los escribe en index.html
estilos/<id>/           cada estilo: estilo.css (bajo html[data-estilo="<id>"]) y estilo.js
img/, videos/           foto, capturas de proyectos y comerciales (720p, solo se bajan al pedirlos)
fuentes/                Anton y Atkinson Hyperlegible Next, recortadas, con su licencia OFL
```

## Agregar un proyecto

Se agrega un objeto en `datos/proyectos.json` (tipo, título, descripción, rol, stack, medio visual y
enlaces) y se corre `node datos/generar.mjs`. Las imágenes van en `img/proyectos/` en WebP a 560 y
960 px de ancho. Un video necesita su póster ligero; el archivo de video no se descarga hasta que
alguien toca "Ver".

## Agregar un estilo

1. Crear `estilos/<id>/estilo.css`, con todo bajo `html[data-estilo="<id>"]`.
2. Crear `estilos/<id>/estilo.js`, un módulo con `export default { id, nombre, montar(ctx) }`.
   `montar` devuelve la función que deja la página como estaba.
3. Probarlo con `?estilo=<id>` en la URL y, cuando esté listo, marcarlo `disponible: true` en
   `nucleo/registro.js` para que aparezca en el selector.

La elección del visitante se recuerda en el navegador y se puede compartir con `?estilo=<id>`.

## Créditos

- Tipografías: Anton y Atkinson Hyperlegible Next, SIL Open Font License 1.1 (`fuentes/OFL.txt`).
- Animación de las secciones: GSAP 3.13.0, servido desde jsDelivr.
- Cielo de Vuelo: HDRI "Qwantani Sunset (Pure Sky)" de Poly Haven, CC0
  (https://polyhaven.com/a/qwantani_sunset_puresky).
- Los sitios de la sección de proyectos son de marcas ficticias. Las capturas de Recepción IA y Mi
  Kinder usan datos de demostración.
