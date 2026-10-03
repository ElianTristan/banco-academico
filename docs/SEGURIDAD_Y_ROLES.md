# Seguridad y control de roles

## Flujo

- El registro público no tiene selector de rol. La acción de servidor acepta solo los campos del registro; un campo adicional como `role=administrador` hace que la solicitud sea rechazada.
- El trigger de `auth.users` crea siempre el perfil como `alumno`, sin leer el rol de `user_metadata`. Un rol enum inválido tampoco puede entrar a PostgreSQL.
- Un alumno solicita acceso docente desde su perfil. La fila queda `Pendiente`; la solicitud no cambia el rol ni crea permisos docentes.
- Un administrador valida por un canal institucional y aprueba o rechaza desde `/admin/solicitudes`. La función `SECURITY DEFINER` comprueba al administrador, bloquea la solicitud para evitar una doble revisión, cambia el rol y crea la fila docente dentro de la misma transacción.
- La web no tiene una acción para crear administradores. El primer administrador se aprovisiona en Supabase Auth y se promueve desde SQL Editor, operado por el propietario del proyecto. No se debe promover una cuenta desde DevTools ni compartir contraseñas, `service_role` o tokens.

El esquema conserva los roles actuales `alumno`, `docente` y `administrador`; el estado `Pendiente/Aprobada/Rechazada` vive solo en `teacher_applications`, no es un rol.

## Capas de autorización

- `middleware.ts` valida la sesión con `auth.getUser()` y consulta el rol en `profiles`; bloquea la familia de rutas ajena al rol.
- `Portal` repite la comprobación en el servidor para no depender solo del middleware.
- Cada Server Action sensible vuelve a validar sesión y rol. La revisión de solicitudes se ejecuta además en un RPC que solo pueden ejecutar usuarios autenticados, y el RPC vuelve a comprobar `administrador`.
- PostgreSQL RLS limita filas por usuario, grupo, inscripción y rol. Las funciones `is_teacher_of` e `is_enrolled_in` también comprueban el rol actual. Las reglas cubren consultas directas al API de Supabase, aunque se manipulen URLs o UUIDs.
- Un trigger impide cambiar roles por una petición autenticada directa, incluso si la cuenta es administradora. Solo permite operaciones de rol desde las funciones de confianza o desde el SQL Editor propietario.
- Los archivos académicos y fotos usan buckets privados. La clave `service_role` no se usa en el navegador.

## Primer administrador

1. Crea/invita la cuenta desde **Supabase → Authentication → Users** y verifica su correo.
2. En **SQL Editor**, asigna únicamente ese correo:

```sql
update public.profiles
set role = 'administrador'
where email = 'correo-institucional@ejemplo.mx'
returning email, role;
```

3. Confirma que `RETURNING` muestre una sola fila. Cierra sesión en la web y vuelve a entrar con esa cuenta.

Ese comando es aprovisionamiento inicial confiable, no parte del registro público ni una migración. Para docentes usa las solicitudes de la app, que además guardan la decisión en la bitácora.

## Matriz de seguridad

`PASS (código)` significa que el control está presente en las rutas, Server Actions, RPC o RLS inspeccionados. Las pruebas con dos cuentas reales de Supabase aún requieren crear cuentas de prueba en el proyecto; no se marca una prueba de integración como ejecutada sin esas cuentas.

| Caso | Control esperado | Revisión actual |
|---|---|---|
| Alumno visita `/admin` | Redirigido a su espacio; sus consultas siguen restringidas por RLS | PASS (código); integración Supabase pendiente |
| Docente visita `/admin` | Redirigido a su espacio; sin permisos administrativos | PASS (código); integración Supabase pendiente |
| Alumno envía `role=docente/admin` al registro | Acción estricta rechaza el campo; trigger de Auth crea `alumno` siempre | PASS (código); integración Auth pendiente |
| Usuario actualiza su rol por REST | Trigger de perfil rechaza el cambio | PASS (SQL); integración REST pendiente |
| Admin actualiza el rol directo por REST | Trigger rechaza; el flujo web para crear admins no existe | PASS (SQL); integración REST pendiente |
| Usuario intenta insertar/aprobar una solicitud por REST | Sin políticas RLS de escritura; solo RPC controlado | PASS (SQL); integración REST pendiente |
| Docente A intenta leer calificaciones/grupo de Docente B | `is_teacher_of` requiere rol docente y asignación exacta; RLS de grades verifica el grupo | PASS (políticas inspeccionadas); integración RLS pendiente |
| Alumno A intenta leer datos privados de Alumno B | Select de perfil/alumno y calificaciones restringido por identidad/inscripción | PASS (políticas inspeccionadas); integración RLS pendiente |
| Alumno cambia UUID de su asesoría | RPC/reserva comprueba rol, disponibilidad/cupo; trigger solo permite cancelar su reserva propia | PASS (SQL); integración RLS pendiente |
| Sesión no autenticada abre ruta académica | Middleware redirige a login; tablas solo conceden políticas a `authenticated` | PASS (código/SQL); integración de sesión pendiente |

## Límites por resolver

- No se ejecutaron ataques HTTP/RLS contra Supabase: aquí no hay cuentas de prueba para alumno, docente y administrador, ni se debe compartir una contraseña para fabricarlas. Crea cuentas de prueba en tu proyecto y recorre la matriz.
- No se implementó desactivar/bloquear cuentas en Auth. Eso requiere un endpoint de administración con `service_role` solo en servidor y una política operacional; la clave no debe añadirse al cliente.
- `LOGIN_FAILED` debe consultarse desde los registros de auditoría de Supabase Auth o conectarse mediante un webhook de confianza; una sesión anónima no puede escribir legítimamente en `access_logs`.
- Los listados CRUD completos de usuarios, materias, grupos, periodos y calificaciones siguen pendientes; las rutas genéricas actuales no equivalen a esos módulos.
- El número de trabajador y el departamento declarados por quien solicita acceso no verifican su identidad. Administración debe confirmarlos antes de aprobar.
