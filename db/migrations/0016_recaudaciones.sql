-- Recaudaciones en Ecodatos (esquema public): el área y las estadísticas.
--
--  1) Área "Recaudaciones" (public.areas). La gente de Contaduría/Recaudaciones se asigna a esa área en
--     Ecodatos (usuarios_areas) y con eso entra al panel financiero de la botonera (mismo login de Ecodatos).
--  2) public.recaudacion_estadisticas(desde, hasta): totales de lo recaudado, por trámite y por día, para
--     mostrar en Ecodatos. Ecodatos solo expone `public` por PostgREST, así que se llama como RPC:
--        supabase.rpc('recaudacion_estadisticas', { p_desde: '2026-01-01', p_hasta: '2026-12-31' })
--     Es SECURITY DEFINER (lee el esquema `pagos`, que nadie más ve) y ella misma verifica quién llama:
--     solo admin/superadmin o integrantes del área Recaudaciones. A cualquier otro le da error 42501.
--     Solo lectura, y solo agregados: no devuelve datos de las personas.
--
-- Esta migración toca `public`: la corre quien mantiene Ecodatos (con el rol dueño de las tablas).

insert into public.areas (key, nombre, descripcion)
select 'recaudaciones', 'Recaudaciones', 'Pagos de trámites: panel financiero de la botonera y estadísticas de recaudación'
 where not exists (select 1 from public.areas where key = 'recaudaciones');

create or replace function public.recaudacion_puede_ver(uid uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select uid is not null and (
    exists (select 1 from public.usuarios_rol ur join public.roles r on r.id = ur.rol_id
             where ur.user_id = uid and ur.activo and r.activo and r.key in ('admin', 'superadmin'))
    or exists (select 1 from public.usuarios_areas ua join public.areas a on a.id = ua.area_id
                where ua.user_id = uid and ua.activo and a.activo and a.key = 'recaudaciones')
  );
$$;

create or replace function public.recaudacion_estadisticas(p_desde date default null, p_hasta date default null)
returns jsonb
language plpgsql stable security definer
set search_path = pagos, public, pg_temp
as $$
declare
  tz    constant text := 'America/Argentina/Buenos_Aires';
  hasta date := coalesce(p_hasta, (now() at time zone tz)::date);
  desde date := coalesce(p_desde, date_trunc('year', now() at time zone tz)::date);
  r     jsonb;
begin
  if not public.recaudacion_puede_ver(auth.uid()) then
    raise exception 'Sin permiso para ver la recaudación.' using errcode = '42501';
  end if;
  if desde > hasta then
    raise exception 'La fecha inicial es posterior a la final.' using errcode = '22023';
  end if;

  with pagados as (
    select o.modulo_slug,
           coalesce(p.importe_centavos, o.importe_centavos) as importe,
           (p.created_at at time zone tz)::date as dia
      from pagos.pagos p join pagos.ordenes_pago o on o.id = p.orden_id
     where p.estado = 'pagado' and (p.created_at at time zone tz)::date between desde and hasta
  )
  select jsonb_build_object(
    'desde', desde,
    'hasta', hasta,
    'recaudadoCentavos', coalesce((select sum(importe) from pagados), 0),
    'pagos', (select count(*) from pagados),
    'porTramite', coalesce((
      select jsonb_agg(jsonb_build_object('slug', m.slug, 'nombre', m.nombre, 'categoria', c.nombre,
                                          'recaudadoCentavos', coalesce(x.total, 0), 'pagos', coalesce(x.n, 0))
                       order by coalesce(x.total, 0) desc, m.nombre)
        from pagos.modulos m
        join pagos.categorias c on c.slug = m.categoria_slug
        left join (select modulo_slug, sum(importe) as total, count(*) as n from pagados group by modulo_slug) x
               on x.modulo_slug = m.slug
    ), '[]'::jsonb),
    'porDia', coalesce((
      select jsonb_agg(jsonb_build_object('fecha', dia, 'recaudadoCentavos', total, 'pagos', n) order by dia)
        from (select dia, sum(importe) as total, count(*) as n from pagados group by dia) d
    ), '[]'::jsonb)
  ) into r;
  return r;
end;
$$;

revoke all on function public.recaudacion_puede_ver(uuid) from public;
revoke all on function public.recaudacion_estadisticas(date, date) from public;
grant execute on function public.recaudacion_estadisticas(date, date) to authenticated;
