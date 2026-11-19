-- Reemplaza el correo del alumno de prueba por una cuenta real ya creada.
-- Ejecuta después de la migración 0013. No crea contraseñas ni usuarios Auth.
insert into public.notificaciones (
  usuario_destino_id, tipo, titulo, mensaje, remitente_id,
  remitente_nombre, remitente_rol, leida
)
select alumno.id, demo.tipo, demo.titulo, demo.mensaje, admin.id,
       trim(concat(admin.first_name, ' ', admin.last_name)), admin.role, false
from public.profiles alumno
cross join lateral (select id, first_name, last_name, role from public.profiles where role = 'administrador' and is_active = true order by created_at limit 1) admin
cross join (values
  ('tarea'::text, 'Actividad de ejemplo', 'Consulta la actividad y la fecha de entrega.'),
  ('anuncio'::text, 'Aviso de biblioteca', 'El catálogo ya está disponible para consulta.'),
  ('anuncio'::text, 'Horario de atención', 'La biblioteca abre de 8:00 a 20:00 esta semana.')
) as demo(tipo, titulo, mensaje)
where alumno.email = 'alumno.demo@example.com'
  and alumno.role = 'alumno'
  and not exists (
    select 1 from public.notificaciones n
    where n.usuario_destino_id = alumno.id and n.titulo = demo.titulo
      and n.remitente_id = admin.id
  );
