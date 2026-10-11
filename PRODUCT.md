# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Alumnos, docentes y personal administrador del Instituto Tecnológico de San Luis Potosí (ITSLP), cada quien desde su espacio y permisos académicos.

## Product Purpose

Banco Académico reúne en un portal la consulta y el intercambio de recursos académicos, junto con materias, horario, calificaciones, avisos, asesorías y datos del perfil. El resultado esperado es que cada integrante encuentre con rapidez lo que necesita para su actividad escolar.

## Operating Context

Se usa como aplicación web. Los alumnos se registran y consultan/comparten recursos; las cuentas docentes se habilitan mediante revisión institucional; administración mantiene la operación y revisa aportes. La autenticación, perfiles y datos académicos están en Supabase; producción está desplegada en Vercel.

## Capabilities and Constraints

- Roles vigentes: `alumno`, `docente` y `administrador`.
- El registro público crea alumnos. La solicitud docente requiere revisión; el acceso administrador se aprovisiona por un canal de confianza.
- La navegación y los permisos existentes deben conservar sus rutas y controles de servidor/RLS.
- La aplicación ya existe y debe evolucionarse sobre Next.js App Router, React, TypeScript y Tailwind CSS.
- Los cambios visuales no deben crear contenido, actividad, cifras, cuentas ni afirmaciones institucionales ficticias.
- El alcance exacto del rediseño integral se infiere de la petición y queda abierto a corrección del usuario.

## Brand Commitments

- El nombre es Banco Académico del ITSLP.
- La interfaz debe reconocer al ITSLP y al Tecnológico Nacional de México (TecNM), cuya presencia el usuario pidió previamente.
- El usuario corrigió la dirección visual: conservar los azules institucionales del Banco Académico y sumar vino de forma contenida. El archivo `/Users/eliantristan/Downloads/DESIGN.md` es referencia para fluidez, motion y acabado; no impone su paleta rosa ni su estructura de marketing.
- El usuario pide un rediseño integral de las pantallas de producto, interactivo, animado y rápido. Navegación por rol, contenido, permisos y flujos académicos deben conservar su comportamiento real.
- El usuario ha pedido una experiencia clara, interactiva, fluida y cuidada, con tema claro y oscuro.

## Evidence on Hand

- `README.md`, `docs/SEGURIDAD_Y_ROLES.md`, las rutas actuales de `src/app/` y los componentes actuales de `src/components/` documentan funcionalidades y permisos.
- No hay archivos de logos institucionales dentro de `public/`; no se deben inventar o reconstruir sus logotipos como si fueran oficiales.

## Product Principles

- El acceso y las acciones deben coincidir con el rol académico activo.
- El contenido y sus estados deben ser fáciles de encontrar y entender.
- Los recursos académicos compartidos deben conservar su revisión y visibilidad segura.
- Las interacciones deben responder con claridad al usuario.
