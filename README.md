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

- La identidad de Banco Académico usa un símbolo vectorial y lettering reutilizables. La splash de entrada dura aproximadamente dos segundos y aparece una vez por pestaña al abrir una ruta de autenticación; al reducir movimiento se acorta y el login permanece accesible aunque la animación no se ejecute.
- Las transiciones de rutas, las entradas de secciones, los reveals por scroll y las interacciones comparten tokens de duración y easing en `src/app/globals.css`. `prefers-reduced-motion` mantiene fades breves y elimina el movimiento decorativo; los efectos de hover se reservan para punteros precisos.
- El registro público permite elegir Estudiante, Docente o Administrador para ver el proceso aplicable, pero solo crea cuentas de **alumno**. El acceso docente requiere revisión y el administrador no se puede registrar públicamente.
- Un alumno solicita acceso docente desde su perfil. Un administrador valida la solicitud y puede aprobarla desde `/admin/solicitudes`.
- La primera cuenta administradora se aprovisiona desde el SQL Editor de Supabase siguiendo [docs/SEGURIDAD_Y_ROLES.md](docs/SEGURIDAD_Y_ROLES.md). Administración puede invitar alumnos y docentes desde sus secciones; las invitaciones usan `SUPABASE_SERVICE_ROLE_KEY` exclusivamente en el servidor. No uses esa clave en el navegador.
- `middleware.ts`, los layouts de servidor, las Server Actions, los RPC y las políticas RLS aplican controles en sus respectivas capas. La interfaz por sí sola no concede permisos.
- Roles internos vigentes: `alumno`, `docente` y `administrador`. No hay un selector de administrador ni un rol distinto para “profesor”.

Para probar los tres espacios, crea cuentas separadas desde el registro para alumno; promueve una cuenta de prueba a administrador con las instrucciones de seguridad; solicita acceso docente desde una cuenta alumno y apruébala desde el panel administrador. Usa cuentas de prueba de tu propio proyecto y nunca guardes sus contraseñas en el repositorio.

## Base de datos

Para una base existente, haz un respaldo y aplica en orden las migraciones incrementales pendientes de `supabase/migrations/`, incluyendo `0013_notifications.sql`; aplica cada migración una sola vez y valida cambios de esquema primero en una copia de pruebas. La 0009 fija el programa académico y el catálogo institucional. La 0010 permite dar de alta y desactivar cuentas sin borrar su historial; la 0011 audita el alta con contraseña temporal institucional (`Tec12345!`) sin guardar contraseñas en texto plano. La 0013 agrega notificaciones para tareas y anuncios, sus políticas RLS y la edición administrativa de cuentas. No vuelvas a ejecutar el SQL consolidado sobre una base ya instalada. Para una instalación nueva, usa `supabase/BANCO_ACADEMICO_MIGRACION_COMPLETA.sql`, que incluye la 0013. Las fuentes incrementales están en `supabase/migrations/`.

### Notificaciones y usuarios

- Ejecuta `supabase/migrations/0013_notifications.sql` en Supabase SQL Editor antes de publicar esta versión. La campana actualiza el conteo cada 30 segundos y las publicaciones nuevas (`posts`) generan notificaciones al alumnado inscrito en el grupo; administración también puede enviar un anuncio o tarea a todos los alumnos.
- En `/admin/usuarios`, selecciona Agregar, Editar o Eliminar. Eliminar desactiva la cuenta y conserva su historial. El rol editable se limita a alumno o docente/bibliotecario; las cuentas administradoras no se pueden editar desde el directorio.
- Los datos ficticios para crear cuentas de prueba están en `supabase/seeds/usuarios_demo.md`. Créelas desde administración (no insertes filas directamente en `auth.users`). El formulario de prueba está en `supabase/seeds/notificaciones_demo.sql`: reemplaza `alumno.demo@example.com` por el correo del alumno y ejecútalo. Crea tres notificaciones y no crea usuarios ni contraseñas.
- Navegación disponible y acciones siguen los roles reales de esta app (`administrador`, `docente`, `alumno`). La app no tiene un modelo de préstamos de libros; el apartado existente de calificaciones/materiales no se cambia para simular préstamos.

Para iniciar y probar localmente, configura `.env.local` como indica la sección anterior, aplica migraciones en Supabase y ejecuta `npm run dev`. Prueba cada rol con cuentas separadas: colapsa y expande la barra, confirma que el estado persiste al recargar, abre la campana, marca una notificación como leída y publica una tarea para un grupo con alumnos inscritos. En administración, crea, edita, busca por matrícula y da de baja una cuenta de prueba.

## Deployment en Vercel

El proyecto usa Next.js y puede desplegarse en Vercel con el preset detectado automáticamente:

1. Importa el repositorio en Vercel y conserva los comandos predeterminados de Next.js (`npm run build` y salida administrada por Next).
2. Configura `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_SITE_URL` en los entornos Preview y Production. `NEXT_PUBLIC_SITE_URL` debe ser el origen HTTPS real del deployment correspondiente, nunca `localhost` en Production. Configura `SUPABASE_SERVICE_ROLE_KEY` como variable privada de servidor en ambos entornos si habilitas el acceso por identificador institucional, el límite de intentos o las invitaciones administrativas; nunca la expongas al frontend ni uses un prefijo `NEXT_PUBLIC_`.
3. En Supabase Auth, define **Site URL** al origen de producción real y permite como **Redirect URL** la ruta exacta `${NEXT_PUBLIC_SITE_URL}/auth/callback` (y los orígenes/rutas locales necesarios para desarrollo). Los enlaces de recuperación y confirmación pasan por ese callback; la aplicación continúa a `/recuperar/nueva` o al inicio según el flujo. No agregues un dominio de producción hasta confirmar cuál usa el proyecto.
4. Despliega y prueba registro, confirmación de correo, login, recuperación, salida y redirección por rol. Comprueba con cuentas separadas que las rutas ajenas redirigen y que RLS mantiene los datos restringidos.

No hay un deployment ni una URL remota configurados o verificados desde este workspace. `NEXT_PUBLIC_SITE_URL` debe coincidir con el host activo en cada entorno.

## Estado conocido

La app incluye autenticación con Supabase, paneles por rol, solicitudes docentes, perfiles, materiales privados, favoritos, asesorías y reportes. Administración puede invitar y desactivar o reactivar alumnos y docentes desde sus secciones; desactivar conserva el historial y no elimina datos. Las invitaciones necesitan correo saliente configurado en Supabase y `SUPABASE_SERVICE_ROLE_KEY` solo en el servidor. Los CRUD de materias, grupos, periodos y calificaciones siguen pendientes. La prueba de autorización con cuentas reales depende de usuarios de prueba en el proyecto Supabase.
