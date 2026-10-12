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

- La identidad de Banco Académico usa un símbolo vectorial y lettering reutilizables. La splash de entrada aparece una vez por pestaña al abrir una ruta de autenticación; al reducir movimiento se acorta y el login permanece accesible aunque la animación no se ejecute.
- El registro público permite elegir Estudiante, Docente o Administrador para ver el proceso aplicable, pero solo crea cuentas de **alumno**. El acceso docente requiere revisión y el administrador no se puede registrar públicamente.
- Un alumno solicita acceso docente desde su perfil. Un administrador valida la solicitud y puede aprobarla desde `/admin/solicitudes`.
- La primera cuenta administradora se aprovisiona desde el SQL Editor de Supabase siguiendo [docs/SEGURIDAD_Y_ROLES.md](docs/SEGURIDAD_Y_ROLES.md). No uses una clave `service_role` desde el navegador.
- `middleware.ts`, los layouts de servidor, las Server Actions, los RPC y las políticas RLS aplican controles en sus respectivas capas. La interfaz por sí sola no concede permisos.
- Roles internos vigentes: `alumno`, `docente` y `administrador`. No hay un selector de administrador ni un rol distinto para “profesor”.

Para probar los tres espacios, crea cuentas separadas desde el registro para alumno; promueve una cuenta de prueba a administrador con las instrucciones de seguridad; solicita acceso docente desde una cuenta alumno y apruébala desde el panel administrador. Usa cuentas de prueba de tu propio proyecto y nunca guardes sus contraseñas en el repositorio.

## Base de datos

Para una base existente, haz un respaldo y aplica en orden `supabase/migrations/0005_server_login_identifier_lookup.sql`, `supabase/migrations/0006_server_auth_attempts.sql`, `supabase/migrations/0007_account_auth_attempt_limits.sql` y `supabase/migrations/0008_reset_login_attempts_after_password_recovery.sql` como migraciones incrementales; aplica la 0008 antes de desplegar el código que la usa. No vuelvas a ejecutar el SQL consolidado sobre una base ya instalada. Las migraciones 0006 y 0007 añaden límites temporales de autenticación y registran eventos mediante funciones solo disponibles para `service_role`; la 0007 cuenta los fallos por cuenta, independientemente de la red y unifica el correo con su identificador institucional. La 0008 reinicia el contador y libera el bloqueo inmediatamente después de restablecer correctamente la contraseña. Usa `extensions.digest` para que la función de hash coincida con el esquema donde Supabase instaló `pgcrypto`. Para una instalación nueva, usa `supabase/BANCO_ACADEMICO_MIGRACION_COMPLETA.sql`, que incluye las ocho migraciones en orden. Las fuentes incrementales están en `supabase/migrations/`.

## Deployment en Vercel

El proyecto usa Next.js y puede desplegarse en Vercel con el preset detectado automáticamente:

1. Importa el repositorio en Vercel y conserva los comandos predeterminados de Next.js (`npm run build` y salida administrada por Next).
2. Configura `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_SITE_URL` en los entornos Preview y Production. `NEXT_PUBLIC_SITE_URL` debe ser el origen HTTPS real del deployment correspondiente, nunca `localhost` en Production. Configura `SUPABASE_SERVICE_ROLE_KEY` como variable privada de servidor en ambos entornos si habilitas el acceso por identificador institucional y el límite de intentos; nunca la expongas al frontend ni uses un prefijo `NEXT_PUBLIC_`.
3. En Supabase Auth, define **Site URL** al origen de producción real y permite como **Redirect URL** la ruta exacta `${NEXT_PUBLIC_SITE_URL}/auth/callback` (y los orígenes/rutas locales necesarios para desarrollo). Los enlaces de recuperación y confirmación pasan por ese callback; la aplicación continúa a `/recuperar/nueva` o al inicio según el flujo. No agregues un dominio de producción hasta confirmar cuál usa el proyecto.
4. Despliega y prueba registro, confirmación de correo, login, recuperación, salida y redirección por rol. Comprueba con cuentas separadas que las rutas ajenas redirigen y que RLS mantiene los datos restringidos.

No hay un deployment ni una URL remota configurados o verificados desde este workspace. `NEXT_PUBLIC_SITE_URL` debe coincidir con el host activo en cada entorno.

## Estado conocido

La app incluye autenticación con Supabase, paneles por rol, solicitudes docentes, perfiles, materiales privados, favoritos, asesorías y reportes. Algunas rutas de administración todavía muestran listados de lectura genéricos: los CRUD completos de usuarios, materias, grupos, periodos y calificaciones están pendientes. La prueba de autorización con cuentas reales depende de usuarios de prueba en el proyecto Supabase.
