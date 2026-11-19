---
colors:
  navy: "#102D55"
  institutional-blue: "#183B70"
  ink: "#142742"
  canvas: "#F2F5FA"
  surface: "#FFFFFF"
  line: "#DCE4EF"
  wine: "#8D3B55"
  wine-soft: "#F5E9ED"
typography:
  display: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  body: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  heading-scale: "clamp(29px, 3.2vw, 42px)"
  body-scale: "13px–16px"
radius:
  control: "13px"
  card: "20px"
  pill: "999px"
spacing:
  page-gutter: "clamp(22px, 4vw, 64px)"
  content-gap: "18px"
motion:
  quick: "160ms"
  normal: "220ms–240ms"
  easing: "cubic-bezier(.2, .8, .2, 1)"
---

# Banco Académico — sistema de interfaz

## Dirección

Una plataforma de campus digital, con carácter tecnológico, académicamente confiable y activa. El azul profundo es la base institucional; el vino se usa con moderación para señalar selección, actividad y avance. Los paneles se sienten organizados y actuales mediante contraste, capas suaves y visualizaciones claras.

## Usuarios y propósito

Alumnado, docentes y administración del Instituto Tecnológico de San Luis Potosí. El producto reúne materiales, materias, horarios, asesorías, avisos, calificaciones, perfiles y herramientas administrativas. Cada espacio conserva su navegación y permisos reales.

## Principios

- Primero la acción: títulos y acciones principales se distinguen al instante.
- La información académica manda: las tarjetas ayudan a leer los datos y nunca compiten con ellos.
- Movimiento con respuesta: transiciones cortas ayudan a entender navegación, selección, presión, expansión y avance.
- Una misma familia visual para los tres roles; densidad y tareas dependen de cada módulo.
- El color conserva significado: estados de éxito, pendiente y error mantienen su semántica propia.

## Color

- Azul `#102D55` estructura la navegación institucional.
- Azul `#183B70` resalta acciones, rutas y contenido académico.
- Vino `#8D3B55` aporta un acento pequeño para selección, avance y detalles destacados.
- Fondo frío `#F2F5FA`, superficies blancas y líneas `#DCE4EF` separan niveles de contenido.
- En tema oscuro se conservan azules y vino sobre superficies profundas para mantener continuidad y contraste.

## Tipografía y densidad

Inter y fuentes del sistema permiten una lectura rápida y evitan dependencias de fuentes externas. Los encabezados son compactos, firmes y con escala adaptable; el texto normal se mantiene entre 13px y 16px. Cifras usan números tabulares para que los indicadores no salten al cambiar.

## Navegación y estructura

La barra lateral fija organiza enlaces por tarea en grupos que se pueden expandir y contraer. En móvil, los destinos se convierten en una barra horizontal táctil que conserva sus enlaces. La navegación distingue ruta activa, hover, foco y pulsación. El encabezado ubica la sección actual; los paneles de datos tienen jerarquía separada de sus controles.

El docente recibe accesos directos a grupos, materiales y calificaciones. Alumnado tiene accesos a biblioteca, horario y calificaciones. Administración cuenta con una barra compacta propia y un menú de navegación rápida con búsqueda acotada de perfiles, números institucionales, materias y grupos; sus consultas se validan como administrador en servidor y RLS.

## Movimiento

- Respuesta de botones y controles: 160–180ms.
- Hover de tarjetas y cambios de selección: 180–240ms.
- Entrada de vista y barras: 360–650ms, con opacidad o transformaciones ligeras.
- Solo se animan transform y opacidad en los momentos de entrada; las barras animan su crecimiento una vez.
- El gráfico sigue siendo controlable con su selector de periodo.
- Toda animación se reduce según `prefers-reduced-motion`.
- Sin bucles llamativos en el contenido operativo; los adornos de fondo son sutiles.
- El fondo usa una sola luz difusa de movimiento lento, desactivada en movimiento reducido.
- El contenido bajo el primer pliegue entra suavemente al intersectar el viewport.

## Interacción y accesibilidad

Controles conservan foco visible, área táctil adecuada y semántica nativa. Navegación por teclado funciona con los grupos nativos `details/summary`. Los gráficos ofrecen descripciones accesibles y las barras de progreso mantienen el valor textual. El tema oscuro conserva etiquetas y controles legibles.

El menú de navegación rápida abre con `⌘K` o `Ctrl+K`, filtra enlaces al teclear y se cierra con Escape. Cargando se comunica con skeletons; las secciones sin registros mantienen mensajes vacíos en lenguaje claro.

## Componentes

- Acciones principales: azul institucional, ligero gradiente, elevación y respuesta al pulsar.
- Acciones secundarias: superficie azul pálido con borde neutral.
- Métricas: tarjetas de alto contraste, cifra tabular y ornamento geométrico tenue.
- Actividad: barras azul-vino, selección de periodo y avance con texto.
- Navegación: fondo azul profundo, grupo desplegable y acento vino en ruta activa.
- Formularios: superficies claras, radios coherentes y foco azul suave.

## Límites

Se mantienen stack, rutas, servicios, datos, autenticación, políticas de acceso, logos/enlaces ITSLP y TecNM, y flujos académicos existentes. El rediseño no inventa datos, permisos ni marcas institucionales. `DESIGN.md` de referencia Wizz se usó como inspiración de ritmo editorial y detalles pulidos, no como guía cromática o estructura literal.
