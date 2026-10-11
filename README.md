# Banco Académico

Portal académico del ITSLP construido con Next.js App Router, TypeScript, Tailwind CSS y Supabase.

## Requisitos

- Node.js 20.9 o superior.
- npm 10 o superior.
- Proyecto Supabase con las migraciones de `supabase/` aplicadas.

## Configuración local

1. Instala dependencias con `npm install`.
2. Copia `.env.example` como `.env.local` y completa `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_SITE_URL=http://localhost:3000`. Para iniciar sesión con número de control o de trabajador también configura `SUPABASE_SERVICE_ROLE_KEY`; solo se usa en el servidor y nunca debe tener el prefijo `NEXT_PUBLIC_`.
3. Ejecuta `npm run dev` y abre [http://localhost:3000](http://localhost:3000).
4. Mantén la terminal abierta mientras desarrollas. Detén el servidor con `Control + C`.

## Validación y vista de producción local

```bash
npm run lint
npm run security:check
npm run build
npm run preview
```

`preview` inicia `next start`; ejecútalo después de un build exitoso. Abre [http://localhost:3000](http://localhost:3000) para revisar la salida de producción.

## Autenticación y roles

- El registro público crea cuentas de **alumno**. No permite elegir roles privilegiados.
- Un alumno solicita acceso docente desde su perfil. Un administrador valida la solicitud y puede aprobarla desde `/admin/solicitudes`.
- La primera cuenta administradora se aprovisiona desde el SQL Editor de Supabase siguiendo [docs/SEGURIDAD_Y_ROLES.md](docs/SEGURIDAD_Y_ROLES.md). No uses una clave `service_role` desde el navegador.
- `middleware.ts`, los layouts de servidor, las Server Actions, los RPC y las políticas RLS aplican controles en sus respectivas capas. La interfaz por sí sola no concede permisos.
- Roles internos vigentes: `alumno`, `docente` y `administrador`. No hay un selector de administrador ni un rol distinto para “profesor”.

Para probar los tres espacios, crea cuentas separadas desde el registro para alumno; promueve una cuenta de prueba a administrador con las instrucciones de seguridad; solicita acceso docente desde una cuenta alumno y apruébala desde el panel administrador. Usa cuentas de prueba de tu propio proyecto y nunca guardes sus contraseñas en el repositorio.

## Base de datos

Para una base existente, aplica solo `supabase/migrations/0005_server_login_identifier_lookup.sql` como migración incremental; no vuelvas a ejecutar el SQL consolidado sobre una base ya instalada. Para una instalación nueva, usa `supabase/BANCO_ACADEMICO_MIGRACION_COMPLETA.sql`, que incluye las cinco migraciones en orden. Las fuentes incrementales están en `supabase/migrations/`. Haz un respaldo de Supabase antes de cambios de esquema y no mezcles migraciones parciales.

## Deployment en Vercel

El proyecto usa Next.js y puede desplegarse en Vercel con el preset detectado automáticamente:

1. Importa el repositorio en Vercel y conserva los comandos predeterminados de Next.js (`npm run build` y salida administrada por Next).
2. Configura `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_SITE_URL` en los entornos Preview y Production. Para habilitar el acceso por identificador institucional, configura también `SUPABASE_SERVICE_ROLE_KEY` como variable privada de servidor en ambos entornos. Nunca la expongas al frontend ni uses un prefijo `NEXT_PUBLIC_`.
3. En Supabase Auth, configura las URL de sitio y redirección para el dominio desplegado, incluyendo `/auth/callback` y `/recuperar/nueva`; conserva también las URL locales necesarias para desarrollo.
4. Despliega y prueba registro, confirmación de correo, login, recuperación, salida y redirección por rol. Comprueba con cuentas separadas que las rutas ajenas redirigen y que RLS mantiene los datos restringidos.

No hay un deployment ni una URL remota configurados o verificados desde este workspace. `NEXT_PUBLIC_SITE_URL` debe coincidir con el host activo en cada entorno.

## Estado conocido

La app incluye autenticación con Supabase, paneles por rol, solicitudes docentes, perfiles, materiales privados, favoritos, asesorías y reportes. Algunas rutas de administración todavía muestran listados de lectura genéricos: los CRUD completos de usuarios, materias, grupos, periodos y calificaciones están pendientes. La prueba de autorización con cuentas reales depende de usuarios de prueba en el proyecto Supabase.
