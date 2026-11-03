// Estilo "cursores": la página se arma frente al visitante, como un lienzo en una herramienta
// de diseño. Cursores que llegan, guías, recuadros con manijas, texto que se teclea y piezas
// que caen en su lugar. Todo el contenido ya está en el HTML; esto solo es una capa encima.
//
// El arranque largo usa la Web Animations API del navegador para empezar con el primer cuadro;
// GSAP (desde jsDelivr, versión fija) se pide después y solo lo usan las secciones.

export default {
  id: 'cursores',
  nombre: 'Cursores',
  montar(ctx) {
    return montar(ctx);
  },
};

// La entrada es 'completa' en la primera visita de la sesión (la decide el arranque del
// núcleo antes del primer pintado), 'corta' al volver y 'cambio' al llegar desde otro estilo.
function montar(ctx) {
    // Con movimiento reducido la página ya está en su estado final: no hay nada que montar.
    if (ctx.reducido) return function desmontarReducido() { return true; };
    var raiz = document.documentElement;
    var entrada = ctx.cambio ? 'cambio' : (raiz.classList.contains('entrada-completa') ? 'completa' : 'corta');
    var esArranque = entrada === 'completa';
    var vivo = true;
    var lineas = [];
    var zonas = [].slice.call(document.querySelectorAll('[data-seccion]'));
    var inicio = document.querySelector('[data-seccion="presentacion"]');
    var motorCaido = false;

    function cuando(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function motorListo() { return !!window.gsap; }
    function alAzar(a, b) { return a + Math.random() * (b - a); }
    function piezasDe(zona) { return [].slice.call(zona.querySelectorAll('[data-pieza]')); }

    // ---------- capa de obra en cada sección ----------
    zonas.forEach(function (z) {
      var capa = document.createElement('div');
      capa.className = 'obra';
      capa.setAttribute('aria-hidden', 'true');
      z.appendChild(capa);
    });
    function capaDe(zona) { return zona.querySelector('.obra'); }

    // Posición de un elemento dentro de su sección, que es la referencia de la capa de obra.
    function medir(el, zona) {
      var r = el.getBoundingClientRect();
      var z = zona.getBoundingClientRect();
      return { x: r.left - z.left, y: r.top - z.top, w: r.width, h: r.height };
    }

    // ---------- cursores ----------
    // Cuatro colaboradores en escala de grises. Cada uno tiene su tono, su forma de flecha y
    // de cruz, y su etiqueta, para que la parvada se lea como personas distintas.
    var COLORES = ['blanco', 'negro', 'grafito', 'gris'];
    var FLECHA = 'M1 1v16l4.2-3.7 3 6.6 2.8-1.3-3-6.4H14z';
    var FLECHA_FINA = 'M1 1v17l3.6-4 2.6 6.2 2-0.9-2.6-6H12.6z';
    var CRUZ = 'M10 1v7M10 12v7M1 10h7M12 10h7';
    var BARRA_I = 'M1.5 1h7M5 1v20M1.5 21h7';
    function svg(clase, w, h, cuerpo) {
      return '<svg class="g ' + clase + '" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' + cuerpo + '</svg>';
    }
    var GLIFOS = {
      blanco: svg('g-flecha', 16, 21, '<path d="' + FLECHA + '" fill="#F2F2F2" stroke="#0A0A0A" stroke-width="1.4" stroke-linejoin="round"/>') +
        svg('g-cruz', 20, 20, '<path d="' + CRUZ + '" stroke="#F2F2F2" stroke-width="2.2" fill="none"/>') +
        svg('g-texto', 10, 22, '<path d="' + BARRA_I + '" stroke="#F2F2F2" stroke-width="2" fill="none"/>'),
      negro: svg('g-flecha', 16, 21, '<path d="' + FLECHA + '" fill="#0A0A0A" stroke="#F2F2F2" stroke-width="1.5" stroke-linejoin="round"/>') +
        svg('g-cruz', 20, 20, '<path d="' + CRUZ + '" stroke="#F2F2F2" stroke-width="4.4" fill="none"/><path d="' + CRUZ + '" stroke="#0A0A0A" stroke-width="2" fill="none"/>') +
        svg('g-texto', 10, 22, '<path d="' + BARRA_I + '" stroke="#F2F2F2" stroke-width="4" fill="none"/><path d="' + BARRA_I + '" stroke="#0A0A0A" stroke-width="1.6" fill="none"/>'),
      grafito: svg('g-flecha', 14, 21, '<path d="' + FLECHA_FINA + '" fill="#8C8C8C" stroke="#0A0A0A" stroke-width="1.3" stroke-linejoin="round"/>') +
        svg('g-cruz', 20, 20, '<path d="M4 4l4.5 4.5M11.5 11.5L16 16M16 4l-4.5 4.5M8.5 11.5L4 16" stroke="#A6A6A6" stroke-width="2.2" fill="none"/>') +
        svg('g-texto', 10, 22, '<path d="' + BARRA_I + '" stroke="#A6A6A6" stroke-width="2" fill="none"/>'),
      gris: svg('g-flecha', 16, 21, '<path d="' + FLECHA + '" fill="none" stroke="#C8C8C8" stroke-width="1.8" stroke-linejoin="round"/>') +
        svg('g-cruz', 20, 20, '<circle cx="10" cy="10" r="3.2" stroke="#C8C8C8" stroke-width="1.6" fill="none"/><path d="M10 0v5M10 15v5M0 10h5M15 10h5" stroke="#C8C8C8" stroke-width="1.6" fill="none"/>') +
        svg('g-texto', 10, 22, '<path d="' + BARRA_I + '" stroke="#C8C8C8" stroke-width="2" fill="none"/>')
    };
    function crearCursor(color, etiqueta) {
      var c = document.createElement('div');
      c.className = 'cursor c-' + color;
      c.dataset.glifo = 'flecha';
      c.innerHTML = GLIFOS[color] + (etiqueta ? '<span class="etiqueta">' + etiqueta + '</span>' : '');
      return c;
    }

    // ---------- recuadros, guías y tecleo ----------
    function crearCaja(capa, r, reserva) {
      var k = document.createElement('div');
      k.className = 'caja' + (reserva ? ' reserva' : '');
      k.innerHTML = '<i class="manija"></i><i class="manija"></i><i class="manija"></i><i class="manija"></i>';
      k.style.left = r.x + 'px';
      k.style.top = r.y + 'px';
      // El recuadro tiene su tamaño final desde el principio y se "dibuja" destapándolo con
      // clip-path de una esquina a la otra: así no mueve nada de la página mientras crece.
      k.style.width = r.w + 'px';
      k.style.height = r.h + 'px';
      k.style.clipPath = recorte(r, 0);
      k.style.opacity = '0';
      capa.appendChild(k);
      return k;
    }
    function recorte(r, avance) {
      var der = (r.w + 6) * (1 - avance) - 6 * avance;
      var abajo = (r.h + 6) * (1 - avance) - 6 * avance;
      return 'inset(-6px ' + der.toFixed(1) + 'px ' + abajo.toFixed(1) + 'px -6px)';
    }
    function crearGuia(capa, tipo, pos) {
      var g = document.createElement('div');
      g.className = 'guia guia-' + tipo;
      if (tipo === 'h') g.style.top = Math.round(pos) + 'px';
      else g.style.left = Math.round(pos) + 'px';
      capa.appendChild(g);
      return g;
    }

    // Parte el texto en letras sin tocar los espacios, para que los renglones no cambien.
    var originales = new Map();
    function partir(el) {
      if (!originales.has(el)) originales.set(el, el.innerHTML);
      var letras = [];
      var andador = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      var nodos = [];
      while (andador.nextNode()) nodos.push(andador.currentNode);
      nodos.forEach(function (n) {
        var frag = document.createDocumentFragment();
        var texto = n.textContent;
        for (var i = 0; i < texto.length; i++) {
          var ch = texto[i];
          if (/\s/.test(ch)) { frag.appendChild(document.createTextNode(ch)); continue; }
          var s = document.createElement('span');
          s.className = 'letra';
          s.textContent = ch;
          frag.appendChild(s);
          letras.push(s);
        }
        n.parentNode.replaceChild(frag, n);
      });
      el.classList.add('tecleando');
      return letras;
    }
    function restaurar(el) {
      if (!originales.has(el)) return;
      el.innerHTML = originales.get(el);
      originales.delete(el);
      el.classList.remove('tecleando');
      // Que no quede un class="" vacío: el documento vuelve a ser idéntico al HTML original.
      if (!el.classList.length) el.removeAttribute('class');
    }
    function restaurarTodo(zona) {
      originales.forEach(function (html, el) { if (zona.contains(el)) restaurar(el); });
    }

    // Teclea el texto de un elemento; si lleva cursor, este cambia a la I y sigue a la última letra.
    function teclear(tl, el, zona, t, dur, cursor) {
      var letras = partir(el);
      var avance = { n: 0 };
      var mostradas = 0;
      tl.to(avance, {
        n: letras.length,
        duration: dur,
        ease: 'none',
        onStart: function () { if (cursor) cursor.dataset.glifo = 'texto'; },
        onUpdate: function () {
          var n = Math.round(avance.n);
          for (var i = mostradas; i < n; i++) letras[i].classList.add('vista');
          mostradas = Math.max(mostradas, n);
          if (cursor && n > 0) {
            var r = medir(letras[n - 1], zona);
            window.gsap.set(cursor, { x: r.x + r.w + 2, y: r.y + r.h / 2 });
          }
        },
        onComplete: function () { restaurar(el); }
      }, t);
    }

    // El parpadeo de doble imagen al asentarse: dos copias corridas, una blanca y una gris, que se juntan.
    var ABERRACION = '-0.06em 0 0 rgba(255, 255, 255, 0.55), 0.06em 0 0 rgba(140, 140, 140, 0.6)';
    var SIN_ABERRACION = '0em 0 0 rgba(255, 255, 255, 0), 0em 0 0 rgba(140, 140, 140, 0)';
    function asentar(tl, el, t, fuerte) {
      tl.set(el, { opacity: 1, textShadow: ABERRACION, x: fuerte ? 6 : 3 }, t);
      tl.to(el, { x: fuerte ? -4 : -2, duration: 0.03, ease: 'none' }, t + 0.02);
      tl.to(el, { x: 0, textShadow: SIN_ABERRACION, duration: 0.08, ease: 'power2.out' }, t + 0.05);
      tl.set(el, { clearProps: 'textShadow,transform' }, t + 0.14);
    }

    // Al terminar una sección no queda nada de la obra encima del texto.
    function limpiarZona(zona) {
      var capa = capaDe(zona);
      if (capa) capa.innerHTML = '';
      restaurarTodo(zona);
      var tocados = zona.querySelectorAll('[data-pieza], [data-pieza] *');
      if (window.gsap) window.gsap.set(tocados, { clearProps: 'all' });
      [].forEach.call(zona.querySelectorAll('[style]'), function (el) {
        if (el.closest('.obra')) return;
        if (el.hasAttribute('data-pieza') || el.closest('[data-pieza]')) el.removeAttribute('style');
      });
      zona.dataset.estado = 'hecha';
    }

    // =================== la biblioteca de animación ===================
    // GSAP solo lo usan las secciones. En la primera visita se pide después de que llegan las
    // fuentes, para no pelear con ellas el ancho de banda en una red lenta.
    function cargarMotor() {
      if (window.gsap || document.querySelector('script[data-motor="gsap"]')) return;
      var motor = document.createElement('script');
      motor.dataset.motor = 'gsap';
      motor.src = 'https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js';
      motor.integrity = 'sha384-HOvlOYPIs/zjoIkWUGXkVmXsjr8GuZLV+Q+rcPwmJOVZVpvTSXQChiN4t9Euv9Vc';
      motor.crossOrigin = 'anonymous';
      motor.onerror = function () { document.dispatchEvent(new Event('motor:fallo')); };
      document.head.appendChild(motor);
    }

    // =================== el arranque ===================
    // El arranque no espera a la biblioteca: usa la Web Animations API, que ya trae el
    // navegador, para que la página empiece a armarse con el primer pintado aunque la red sea
    // lenta. Cada elemento junta sus cambios en una "pista" que se vuelve una sola animación.
    var arranqueCerrado = false;
    var cursoresInicio = [];
    var animaciones = [];
    var relojes = [];
    var pistas = [];

    var CURVA = {
      salida: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
      suave: 'cubic-bezier(0.455, 0.03, 0.515, 0.955)',
      caida: 'cubic-bezier(0.55, 0.085, 0.68, 0.53)',
      frenado: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      paseo: 'cubic-bezier(0.445, 0.05, 0.55, 0.95)'
    };

    // Los tiempos de las pistas cuentan desde el estallido, que ocurre "base" segundos después
    // de armarlas: todo se mide y se prepara mientras la parvada gira.
    var base = 0;
    var avisos = [];
    function despues(seg, fn) { avisos.push([seg, fn]); }
    function programarAvisos() {
      avisos.forEach(function (a) { relojes.push(setTimeout(a[1], (base + a[0]) * 1000)); });
      avisos = [];
    }
    function pista(el, inicial, deCursor) {
      var p = { el: el, deCursor: !!deCursor, v: Object.assign({}, inicial), marcos: [{ t: 0, v: Object.assign({}, inicial) }] };
      pistas.push(p);
      return p;
    }
    // Mantiene el valor actual hasta t y de ahí lo lleva a "valores" en d segundos.
    function tramo(p, t, d, valores, curva) {
      var ultimo = p.marcos[p.marcos.length - 1].t;
      if (t < ultimo) t = ultimo;
      p.marcos.push({ t: t, v: Object.assign({}, p.v), curva: curva || 'linear' });
      Object.assign(p.v, valores);
      p.marcos.push({ t: t + Math.max(d, 0.001), v: Object.assign({}, p.v) });
    }
    function aCss(v) {
      var o = {};
      if ('x' in v || 'y' in v || 's' in v || 'sx' in v || 'sy' in v) {
        var sx = 'sx' in v ? v.sx : ('s' in v ? v.s : 1);
        var sy = 'sy' in v ? v.sy : ('s' in v ? v.s : 1);
        o.transform = 'translate(' + (v.x || 0).toFixed(1) + 'px, ' + (v.y || 0).toFixed(1) + 'px) scale(' + sx + ', ' + sy + ')';
      }
      if ('o' in v) o.opacity = v.o;
      if ('cr' in v) o.clipPath = 'inset(-6px ' + v.cr.toFixed(1) + 'px ' + v.cb.toFixed(1) + 'px -6px)';
      if ('bl' in v) o.filter = 'blur(' + v.bl.toFixed(2) + 'px)';
      if ('w' in v) o.width = v.w.toFixed(1) + 'px';
      if ('h' in v) o.height = v.h.toFixed(1) + 'px';
      if ('ab' in v) {
        var a = v.ab * 0.06;
        var alfa = v.ab > 0 ? 0.85 : 0;
        o.textShadow = (-a).toFixed(3) + 'em 0 0 rgba(255, 255, 255, ' + alfa + '), ' + a.toFixed(3) + 'em 0 0 rgba(140, 140, 140, ' + alfa + ')';
      }
      return o;
    }
    // Las de los cursores corren hasta el estallido, cuando ya se sabe de dónde salen; las
    // demás se lanzan antes con su retraso para no cargar ese momento.
    function correrPistas(deCursor, retraso) {
      pistas.forEach(function (p) {
        if (p.deCursor !== deCursor) return;
        var fin = p.marcos[p.marcos.length - 1].t;
        if (fin <= 0) return;
        var marcos = p.marcos.map(function (m) {
          var k = aCss(m.v);
          k.offset = Math.min(1, m.t / fin);
          k.easing = m.curva || 'linear';
          return k;
        });
        animaciones.push(p.el.animate(marcos, { duration: fin * 1000, delay: retraso * 1000, fill: 'both' }));
      });
    }

    function cerrarArranque() {
      if (arranqueCerrado) return;
      arranqueCerrado = true;
      quitarEscuchas();
      relojes.forEach(clearTimeout);
      animaciones.forEach(function (a) { a.cancel(); });
      limpiarZona(inicio);
      raiz.classList.remove('entrada-completa');
      [].forEach.call(document.querySelectorAll('.palabra-en-obra'), function (p) { p.remove(); });
      cargarMotor();
    }

    // Clic, tecla o scroll llevan al estado final al instante.
    var EVENTOS_SALTO = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];
    function saltar() { cerrarArranque(); }
    function quitarEscuchas() {
      EVENTOS_SALTO.forEach(function (ev) { window.removeEventListener(ev, saltar, { passive: true, capture: true }); });
    }

    function prepararParvada() {
      var capa = capaDe(inicio);
      var z = inicio.getBoundingClientRect();
      var cx = window.innerWidth / 2 - z.left;
      var cy = window.innerHeight * 0.45 - z.top;
      var inicial = document.createElement('div');
      inicial.className = 'inicial';
      inicial.textContent = 'Á';
      inicial.style.left = cx + 'px';
      inicial.style.top = cy + 'px';
      capa.appendChild(inicial);
      var radio = Math.min(window.innerWidth, window.innerHeight) * 0.17;
      var nombres = ['Ángel', 'tipografía', 'retrato', 'rejilla'];
      for (var p = 0; p < 2; p++) {
        var parvada = document.createElement('div');
        parvada.className = 'parvada parvada-' + p;
        parvada.style.left = cx + 'px';
        parvada.style.top = cy + 'px';
        for (var i = 0; i < 9; i++) {
          var etiqueta = (i === 0 || i === 4) ? nombres[p * 2 + (i === 4 ? 1 : 0)] : '';
          var c = crearCursor(COLORES[(i + p) % 4], etiqueta);
          c.style.transform = 'translate(' + (radio + alAzar(-20, 20)).toFixed(1) + 'px, ' + alAzar(-22, 22).toFixed(1) + 'px)';
          c.querySelector('.g-flecha').style.animationDelay = (-Math.random()).toFixed(2) + 's';
          var et = c.querySelector('.etiqueta');
          if (et) et.style.opacity = '0';
          parvada.appendChild(c);
          cursoresInicio.push(c);
        }
        capa.appendChild(parvada);
      }
    }

    // Saca cada cursor de su parvada sin que brinque: toma su posición en pantalla, la fija y
    // la pone como punto de partida de su pista.
    function soltarParvada() {
      var capa = capaDe(inicio);
      var z = inicio.getBoundingClientRect();
      var posiciones = cursoresInicio.map(function (c) {
        var r = c.getBoundingClientRect();
        return { x: r.left - z.left, y: r.top - z.top };
      });
      cursoresInicio.forEach(function (c, i) {
        var pos = posiciones[i];
        c.style.transform = 'translate(' + pos.x.toFixed(1) + 'px, ' + pos.y.toFixed(1) + 'px)';
        capa.appendChild(c);
        c.dataset.glifo = 'cruz';
        // El primer marco y la espera antes del primer tramo salen de aquí.
        c.pista.marcos[0].v.x = c.pista.marcos[1].v.x = pos.x;
        c.pista.marcos[0].v.y = c.pista.marcos[1].v.y = pos.y;
      });
      [].forEach.call(capa.querySelectorAll('.parvada'), function (p) { p.remove(); });
    }

    // Teclea con animaciones de una letra a la vez; el cursor, en forma de I, sigue a la última.
    // Las letras se encienden por tandas con temporizadores, no con una animación por letra:
    // en un teléfono lento crear cientos de animaciones cuesta más que el propio arranque.
    function teclearNativo(el, letras, t, dur, cursor) {
      var pasos = letras.length;
      var dt = dur / Math.max(1, pasos);
      var tandas = Math.min(pasos, 12);
      for (var k = 1; k <= tandas; k++) {
        (function (hasta, cuando) {
          despues(cuando, function () { for (var j = 0; j < hasta; j++) letras[j].classList.add('vista'); });
        })(Math.round(pasos * k / tandas), t + dur * (k - 1) / tandas);
      }
      if (!cursor) return;
      despues(t, function () { cursor.dataset.glifo = 'texto'; });
      var cada = Math.max(1, Math.round(pasos / 60));
      for (var i = 0; i < pasos; i += cada) {
        var r = medir(letras[i], inicio);
        tramo(cursor.pista, t + i * dt, dt * cada, { x: r.x + r.w + 2, y: r.y + r.h / 2 });
      }
      despues(t + dur, function () { restaurar(el); });
    }
    function asentarNativo(el, t, fuerte) {
      var p = pista(el, { o: 0, x: 0, ab: 0 });
      tramo(p, t, 0.001, { o: 1, ab: 1, x: fuerte ? 6 : 3 });
      tramo(p, t + 0.02, 0.03, { x: fuerte ? -4 : -2 });
      tramo(p, t + 0.05, 0.08, { x: 0, ab: 0 }, CURVA.frenado);
    }

    // Copia de la palabra de fondo (la que la hoja pone con ::before) partida en letras.
    function palabraGigante() {
      var contenido = window.getComputedStyle(inicio, '::before').content;
      if (!contenido || contenido === 'none') return null;
      // El valor llega como "FULL\A STACK" / "": se toma solo la primera cadena.
      var primera = /^"((?:[^"\\]|\\.)*)"/.exec(contenido);
      if (!primera) return null;
      var texto = primera[1].replace(/\\a ?/gi, '\n');
      var el = document.createElement('div');
      el.className = 'palabra-en-obra';
      el.setAttribute('aria-hidden', 'true');
      texto.split('').forEach(function (ch) {
        if (ch === '\n' || ch === ' ') { el.appendChild(document.createTextNode(ch)); return; }
        var s = document.createElement('span');
        s.className = 'letra';
        s.style.display = 'inline-block';
        s.textContent = ch;
        el.appendChild(s);
      });
      inicio.insertBefore(el, inicio.firstChild);
      return el;
    }

    function armarArranque() {
      var capa = capaDe(inicio);
      var piezas = piezasDe(inicio);
      var porNombre = {};
      piezas.forEach(function (p, i) { porNombre[p.dataset.pieza] = i; });
      var pieza = function (n) { return piezas[porNombre[n]]; };
      var cursorDe = function (i) { return cursoresInicio[i % cursoresInicio.length]; };
      // Se mide antes de partir el texto en letras: los renglones son los mismos.
      // Primero se parte todo el texto que se teclea y después se mide todo junto: así el
      // navegador acomoda la página una sola vez.
      var letrasDe = new Map();
      piezas.forEach(function (p) { if (p.hasAttribute('data-teclea')) letrasDe.set(p, partir(p)); });
      var cajas = piezas.map(function (p) { return medir(p, inicio); });
      var z = inicio.getBoundingClientRect();

      // 0.00 estallido: cada cursor cambia a cruz y sale hacia la esquina de su pieza.
      cursoresInicio.forEach(function (c, i) {
        c.pista = pista(c, { x: 0, y: 0 }, true);
        var esRetrato = i < piezas.length && piezas[i].dataset.pieza === 'retrato';
        var destino = esRetrato
          ? { x: cajas[i].x + cajas[i].w, y: cajas[i].y + cajas[i].h }
          : i < piezas.length
          ? { x: cajas[i].x, y: cajas[i].y }
          : { x: alAzar(0.08, 0.92) * z.width, y: alAzar(0.08, 0.7) * Math.min(z.height, window.innerHeight) };
        tramo(c.pista, i * 0.006, esRetrato ? 0.24 : 0.26, destino, esRetrato ? CURVA.suave : CURVA.salida);
      });
      tramo(pista(capa.querySelector('.inicial'), { o: 1 }), 0, 0.3, { o: 0 });

      // 0.06 guías de alineación y etiquetas de los colaboradores.
      var texto = cajas[porNombre.nombre];
      var foto = cajas[porNombre.retrato];
      var guias = [['h', texto.y], ['h', cajas[porNombre.resumen].y], ['h', foto.y + foto.h], ['v', texto.x], ['v', foto.x]];
      guias.forEach(function (g, i) {
        var el = crearGuia(capa, g[0], g[1]);
        var p = pista(el, g[0] === 'h' ? { sx: 0, sy: 1, o: 0.55 } : { sx: 1, sy: 0, o: 0.55 });
        tramo(p, 0.06 + i * 0.03, 0.22, g[0] === 'h' ? { sx: 1 } : { sy: 1 }, CURVA.frenado);
        tramo(p, 1.24, 0.2, { o: 0 });
      });
      [].forEach.call(capa.querySelectorAll('.etiqueta'), function (et, i) {
        et.style.opacity = '';
        tramo(pista(et, { o: 0 }, true), 0.1 + i * 0.03, 0.1, { o: 1 });
      });

      // 0.26 cada cursor arrastra el recuadro de selección de esquina a esquina. El de la
      // reserva del retrato sale con el estallido y el del resumen va primero entre los textos.
      var orden = piezas.map(function (p, i) { return i; });
      orden.sort(function (a, b) { return (piezas[b].dataset.pieza === 'resumen') - (piezas[a].dataset.pieza === 'resumen') || a - b; });
      piezas.forEach(function (p, i) {
        var r = cajas[i];
        var k = crearCaja(capa, r, p.dataset.pieza === 'retrato');
        k.style.opacity = '';
        var esRetrato = p.dataset.pieza === 'retrato';
        var t = esRetrato ? 0.02 : 0.26 + orden.indexOf(i) * 0.022;
        k.style.clipPath = '';
        var pk = pista(k, { cr: r.w + 6, cb: r.h + 6, o: 0 });
        tramo(pk, t, 0.001, { o: 1 });
        tramo(pk, t, 0.24, { cr: -6, cb: -6 }, CURVA.suave);
        tramo(pk, 1.24 + i * 0.01, 0.18, { o: 0 });
        if (!esRetrato) tramo(cursorDe(i).pista, t, 0.24, { x: r.x + r.w, y: r.y + r.h }, CURVA.suave);

      });

      // 0.5 las cajas se llenan: el saludo y el cargo se teclean, el nombre se asienta con
      // aberración, y los datos y botones entran con un parpadeo más corto.
      var tecleadas = [['lugar', 0.5, 0.14], ['saludo', 0.52, 0.16], ['cargo', 0.66, 0.2]];
      tecleadas.forEach(function (d) {
        var el = pieza(d[0]);
        if (!el) return;
        tramo(pista(el, { o: 0 }), d[1], 0.001, { o: 1 });
        teclearNativo(el, letrasDe.get(el) || partir(el), d[1], d[2], cursorDe(porNombre[d[0]]));
      });
      asentarNativo(pieza('nombre'), 0.62, true);
      // El resumen es el bloque más grande de la pantalla: entra completo y temprano, con el
      // mismo parpadeo, para que el visitante lo pueda leer cuanto antes.
      asentarNativo(pieza('resumen'), 0.5, false);
      ['dato-experiencia', 'dato-produccion', 'dato-maestria', 'dato-trabajo', 'acciones'].forEach(function (n, i) {
        var el = pieza(n);
        if (!el) return;
        asentarNativo(el, 0.78 + i * 0.04, false);
      });

      // 1.16 se sueltan las selecciones: las manijas se encogen (con una transición de CSS).
      despues(1.16, function () { [].forEach.call(capa.querySelectorAll('.caja'), function (k) { k.classList.add('soltando'); }); });

      // 0.3 la palabra gigante de atrás entra por pedazos, letra por letra y en desorden.
      // Es una copia con la misma posición que la palabra de la hoja; al terminar se quita.
      var palabra = palabraGigante();
      if (palabra) {
        [].forEach.call(palabra.querySelectorAll('.letra'), function (l) {
          tramo(pista(l, { o: 0, y: 30 }), 0.3 + Math.random() * 0.36, 0.14, { o: 1, y: 0 }, CURVA.frenado);
        });
      }

      // 0.24 el retrato cae dentro de su reserva, rebota apenas y se queda. Va primero porque
      // es lo más grande de la pantalla: así el visitante ve pronto a quién está conociendo.
      var retrato = pieza('retrato');
      var pr = pista(retrato, { o: 0.4, bl: 5, y: 0, s: 1 });
      tramo(pr, 0.18, 0.12, { y: -Math.min(40, foto.h * 0.08), s: 1.03, o: 0.6 }, CURVA.frenado);
      tramo(pr, 0.3, 0.18, { y: 0, s: 1, o: 1, bl: 0 }, CURVA.caida);
      tramo(pr, 0.48, 0.06, { y: -5 }, CURVA.frenado);
      tramo(pr, 0.54, 0.06, { y: 0 }, CURVA.caida);

      // 1.26 los cursores vuelven a ser flecha, deambulan un momento y se van por la orilla.
      cursoresInicio.forEach(function (c, i) {
        var t = 1.26 + (i % 6) * 0.02;
        despues(t, function () { c.dataset.glifo = 'flecha'; });
        tramo(c.pista, t, 0.22, { x: c.pista.v.x + alAzar(-60, 60), y: c.pista.v.y + alAzar(-40, 40) }, CURVA.paseo);
        tramo(c.pista, t + 0.24, 0.3, { x: c.pista.v.x < z.width / 2 ? -80 : z.width + 80 }, CURVA.caida);
      });

      despues(1.9, cerrarArranque);
    }

    function empezarArranque() {
      prepararParvada();
      EVENTOS_SALTO.forEach(function (ev) { window.addEventListener(ev, saltar, { passive: true, capture: true }); });
      // La parvada gira 0.4 s contados desde el primer cuadro pintado: en un teléfono lento ese
      // cuadro tarda, y contar desde ahí evita que la parvada se vaya antes de verse. Mientras
      // gira se mide la página y se preparan todas las animaciones; al estallar solo se sueltan
      // los cursores. Las fuentes van incrustadas, así que las medidas ya son las definitivas.
      window.requestAnimationFrame(function () {
        if (arranqueCerrado) return;
        var listo = performance.now() + 400;
        try {
          armarArranque();
        } catch (e) {
          cerrarArranque();
          throw e;
        }
        base = Math.max(0, (listo - performance.now()) / 1000);
        correrPistas(false, base);
        programarAvisos();
        relojes.push(setTimeout(function () {
          soltarParvada();
          correrPistas(true, 0);
          cargarMotor();
        }, base * 1000));
      });
    }

    // =================== secciones ===================
    var ETIQUETAS_ZONA = ['Ángel', 'rejilla', 'texto'];

    function construirZona(zona) {
      var gsap = window.gsap;
      var capa = capaDe(zona);
      var z = zona.getBoundingClientRect();
      var tl = gsap.timeline({ onComplete: terminar });
      lineas.push(tl);
      var rejilla = zona.querySelector('[data-rejilla]');
      var piezas = piezasDe(zona);
      var tarjetas = rejilla ? piezas.filter(function (p) { return rejilla.contains(p); }) : [];
      var sueltas = piezas.filter(function (p) { return tarjetas.indexOf(p) < 0; });
      zona.dataset.estado = 'construyendo';

      // Tres colaboradores entran por los lados, a la altura de la parte visible de la sección.
      var altoVisible = Math.max(80, Math.min(z.height, window.innerHeight - Math.max(0, z.top)));
      var arriba = Math.max(0, -z.top);
      var cursores = ETIQUETAS_ZONA.map(function (et, i) {
        var c = crearCursor(COLORES[i], et);
        c.dataset.glifo = 'cruz';
        capa.appendChild(c);
        gsap.set(c, { x: i % 2 ? z.width + 40 : -40, y: arriba + altoVisible * (0.25 + i * 0.2) });
        return c;
      });
      var cajas = piezas.map(function (p) { return medir(p, zona); });
      var cajaDe = function (p) { return cajas[piezas.indexOf(p)]; };
      var guia = crearGuia(capa, 'v', cajas[0].x);
      tl.fromTo(guia, { scaleY: 0 }, { scaleY: 1, duration: 0.3, ease: 'power2.out' }, 0);
      tl.to(guia, { opacity: 0, duration: 0.2 }, 1.1);
      var guiaH = crearGuia(capa, 'h', cajas[0].y);
      tl.fromTo(guiaH, { scaleX: 0 }, { scaleX: 1, duration: 0.3, ease: 'power2.out' }, 0.04);
      tl.to(guiaH, { opacity: 0, duration: 0.2 }, 1.1);

      // Dibuja el recuadro de una pieza con un cursor y luego la llena.
      function dibujar(p, cursor, t, dur) {
        var r = cajaDe(p);
        var k = crearCaja(capa, r, false);
        tl.to(cursor, { x: r.x, y: r.y, duration: 0.12, ease: 'power2.out' }, t - 0.12);
        tl.set(k, { opacity: 1 }, t);
        var avance = { p: 0 };
        tl.to(avance, { p: 1, duration: dur, ease: 'power2.inOut', onUpdate: function () { k.style.clipPath = recorte(r, avance.p); } }, t);
        tl.to(cursor, { x: r.x + r.w, y: r.y + r.h, duration: dur, ease: 'power2.inOut' }, t);
        return k;
      }
      function llenar(p, t, cursor) {
        if (p.hasAttribute('data-teclea')) {
          tl.set(p, { opacity: 1 }, t);
          teclear(tl, p, zona, t, Math.min(0.24, 0.012 * p.textContent.length + 0.06), cursor);
        } else {
          asentar(tl, p, t, false);
          p.querySelectorAll('[data-teclea]').forEach(function (h) { teclear(tl, h, zona, t, Math.min(0.2, 0.01 * h.textContent.length + 0.05), null); });
          p.querySelectorAll('[data-cae]').forEach(function (d) { tl.fromTo(d, { y: -18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.18, ease: 'power2.in' }, t + 0.02); });
        }
      }

      var cajasDom = [];
      // Piezas sueltas (rótulos, títulos, puestos): recuadro y llenado en secuencia.
      var paso = Math.min(0.16, 0.66 / Math.max(1, sueltas.length));
      sueltas.forEach(function (p, i) {
        var t = 0.14 + i * paso;
        var cur = cursores[i % cursores.length];
        cajasDom.push(dibujar(p, cur, t, 0.18));
        llenar(p, t + 0.16, cur);
      });

      // Rejilla de tarjetas: la primera se dibuja, la segunda se enmarca, y las demás nacen
      // como copias de la primera que se arrastran a su lugar, se vacían y reciben lo suyo.
      if (tarjetas.length) {
        var tA = 0.16;
        var primera = tarjetas[0];
        var r1 = cajaDe(primera);
        cajasDom.push(dibujar(primera, cursores[0], tA, 0.2));
        llenar(primera, tA + 0.18, null);
        if (tarjetas[1]) cajasDom.push(dibujar(tarjetas[1], cursores[1], tA + 0.12, 0.2));
        var arrastre = cursores[2];
        var tC = tA + 0.36;
        tl.to(arrastre, { x: r1.x + r1.w * 0.5, y: r1.y + 24, duration: 0.14, ease: 'power2.out' }, tC - 0.16);
        tl.add(function () { arrastre.dataset.glifo = 'flecha'; }, tC - 0.02);
        tarjetas.slice(1).forEach(function (p, j) {
          var r = cajaDe(p);
          var t = tC + j * 0.05;
          var copia = primera.cloneNode(true);
          copia.removeAttribute('data-pieza');
          copia.removeAttribute('style');
          [].forEach.call(copia.querySelectorAll('[data-pieza],[id],[style]'), function (n) { n.removeAttribute('data-pieza'); n.removeAttribute('id'); n.removeAttribute('style'); });
          [].forEach.call(copia.querySelectorAll('.letra'), function (n) { n.className = ''; });
          [].forEach.call(copia.querySelectorAll('.tecleando'), function (n) { n.classList.remove('tecleando'); });
          [].forEach.call(copia.querySelectorAll('a'), function (n) { n.setAttribute('tabindex', '-1'); });
          copia.classList.add('copia');
          copia.style.cssText = 'left:' + r1.x + 'px;top:' + r1.y + 'px;width:' + r1.w + 'px;height:' + r1.h + 'px;opacity:0';
          var estelas = [0.35, 0.18].map(function (o) {
            var e = document.createElement('div');
            e.className = 'estela';
            e.style.cssText = 'left:' + r1.x + 'px;top:' + r1.y + 'px;width:' + r1.w + 'px;height:' + r1.h + 'px;opacity:0';
            capa.appendChild(e);
            return { e: e, o: o };
          });
          capa.appendChild(copia);
          tl.set(copia, { opacity: 1 }, t);
          var viaje = { x: r.x - r1.x, y: r.y - r1.y, scaleX: r.w / r1.w, scaleY: r.h / r1.h, transformOrigin: '0 0', duration: 0.24, ease: 'power2.inOut' };
          tl.to(copia, viaje, t);
          estelas.forEach(function (s, k) {
            tl.set(s.e, { opacity: s.o }, t + 0.03 * (k + 1));
            tl.to(s.e, viaje, t + 0.03 * (k + 1));
            tl.to(s.e, { opacity: 0, duration: 0.06 }, t + 0.24 + 0.03 * (k + 1));
          });
          if (j === 0) tl.to(arrastre, { x: r.x + r.w * 0.5, y: r.y + 24, duration: 0.24, ease: 'power2.inOut' }, t);
          var llega = t + 0.24;
          tl.add(function () { copia.classList.add('vacia'); }, llega);
          llenar(p, llega + 0.06, null);
          tl.to(copia, { opacity: 0, duration: 0.08 }, llega + 0.1);
        });
      }

      // Limpieza: manijas, recuadros y colaboradores se van antes de 1.5 s.
      var fin = Math.min(1.12, tl.duration());
      tl.to(capa.querySelectorAll('.manija'), { scale: 0, duration: 0.1, stagger: 0.003 }, fin);
      tl.to(cajasDom, { opacity: 0, duration: 0.12 }, fin + 0.06);
      cursores.forEach(function (c, i) {
        tl.add(function () { c.dataset.glifo = 'flecha'; }, fin);
        tl.to(c, { x: i % 2 ? z.width + 60 : -60, duration: 0.22, ease: 'power2.in' }, fin + 0.04 + i * 0.02);
      });

      function terminar() {
        limpiarZona(zona);
      }
      // Ninguna sección pasa de 1.35 s de animación, aunque tenga muchas tarjetas: deja margen
      // para que llegue a su estado final antes de 1.5 s también en un equipo lento.
      if (tl.duration() > 1.35) tl.timeScale(tl.duration() / 1.35);
    }

    // Si algo falla o el motor no llega, la sección queda en su estado final.
    function terminarSinObra(zona) {
      limpiarZona(zona);
    }
    // Si el motor tarda más de 120 ms, la sección aparece terminada: así ninguna pasa de 1.5 s.
    function alEntrar(zona) {
      if (zona.dataset.estado) return;
      zona.dataset.estado = 'esperando';
      cargarMotor();
      var pedida = performance.now();
      var intentar = function () {
        // Si mientras tanto se desmontó el estilo o el foco la terminó, ya no se construye.
        if (!vivo || zona.dataset.estado !== 'esperando') return;
        if (motorListo()) {
          try {
            construirZona(zona);
          } catch (e) {
            terminarSinObra(zona);
            throw e;
          }
          return;
        }
        if (motorCaido || performance.now() - pedida > 120) { terminarSinObra(zona); return; }
        setTimeout(intentar, 40);
      };
      intentar();
    }

    var observador = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        observador.unobserve(e.target);
        alEntrar(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0 });
    zonas.forEach(function (z) { if (z !== inicio) observador.observe(z); });

    // Con teclado: si el foco entra a una sección que no se ha construido, se termina al instante.
    document.addEventListener('focusin', alFoco);
    function alFoco(e) {
      var zona = e.target.closest && e.target.closest('[data-seccion]');
      if (zona && zona !== inicio && zona.dataset.estado !== 'hecha' && zona.dataset.estado !== 'construyendo') {
        observador.unobserve(zona);
        terminarSinObra(zona);
      }
    }

    document.addEventListener('motor:fallo', alFallarMotor);
    function alFallarMotor() {
      motorCaido = true;
      zonas.forEach(function (z) { if (z.dataset.estado !== 'hecha') { observador.unobserve(z); terminarSinObra(z); } });
    }

    // Entrada corta: las zonas indicadas ya están terminadas; los recuadros de lo que está en
    // pantalla se encienden un instante con sus manijas y se apagan, como al soltar una
    // selección. Dura menos de medio segundo.
    function entradaCorta(terminadas) {
      terminadas.forEach(limpiarZona);
      cargarMotor();
      var orden = 0;
      terminadas.forEach(function (zona) {
        var capa = capaDe(zona);
        piezasDe(zona).forEach(function (p) {
          var r = medir(p, zona);
          var arriba = zona.getBoundingClientRect().top + r.y;
          if (!r.w || arriba > window.innerHeight || arriba + r.h < 0) return;
          var i = orden++;
          var k = crearCaja(capa, r, false);
          k.style.clipPath = '';
          k.style.opacity = '';
          var a = k.animate([{ opacity: 1 }, { opacity: 1, offset: 0.45 }, { opacity: 0 }], { duration: 420, delay: Math.min(i, 8) * 12, fill: 'forwards' });
          animaciones.push(a);
          a.onfinish = function () { k.remove(); };
        });
      });
    }

    // Deja la página como si este estilo nunca hubiera corrido: sin capas ni cursores y con
    // todo el contenido en su estado final. Lo usa el cambio de estilo.
    function desmontar() {
      vivo = false;
      if (esArranque && !arranqueCerrado) cerrarArranque();
      relojes.forEach(clearTimeout);
      animaciones.forEach(function (a) { a.cancel(); });
      lineas.forEach(function (tl) { tl.kill(); });
      observador.disconnect();
      document.removeEventListener('focusin', alFoco);
      document.removeEventListener('motor:fallo', alFallarMotor);
      zonas.forEach(function (z) {
        limpiarZona(z);
        delete z.dataset.estado;
        var capa = capaDe(z);
        if (capa) capa.remove();
      });
      raiz.classList.remove('anima', 'entrada-completa', 'entrada-corta', 'entrada-cambio');
      // Al final, sin animaciones pendientes, el reloj de GSAP deja de pedir cuadros (limpiar
      // las secciones usa gsap.set, que lo despierta).
      if (window.gsap && window.gsap.ticker && window.gsap.ticker.sleep) window.gsap.ticker.sleep();
    }

    // Al volver en la misma sesión solo el inicio llega terminado y las secciones se arman al
    // bajar; al cambiar de estilo toda la página llega terminada, para no repetir nada.
    if (esArranque) empezarArranque();
    else if (entrada === 'cambio') entradaCorta(zonas);
    else entradaCorta([inicio]);
    return desmontar;
}
