-- Paneles de área: los técnicos entran con su usuario de Ecodatos (Supabase Auth) y la API
-- decide qué paneles ve cada uno según los permisos que ya tiene en Ecodatos:
--   - usuarios_formularios → formularios (ej. fitosanitarios_domisanitarios)
--   - usuarios_areas       → areas (ej. control_ambiental)
--   - usuarios_rol → roles 'admin' / 'superadmin' (ven todos los paneles)
-- El rol botonera solo LEE esas tablas; los permisos se siguen administrando en Ecodatos.
-- Las políticas son nuevas y solo para botonera: no cambian lo que ve nadie más.

grant select on public.areas, public.formularios, public.usuarios_areas,
                public.usuarios_formularios, public.roles, public.usuarios_rol,
                public.profiles to botonera;

do $$
declare t text;
begin
  foreach t in array array['areas','formularios','usuarios_areas','usuarios_formularios','roles','usuarios_rol','profiles'] loop
    execute format('drop policy if exists botonera_lectura on public.%I', t);
    execute format('create policy botonera_lectura on public.%I for select to botonera using (true)', t);
  end loop;
end $$;
