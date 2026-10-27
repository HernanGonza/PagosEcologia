-- Fitosanitarios: suma el tipo "Fraccionamiento" y ordena los tipos como los presenta el área:
-- comercio, vehículo, depósito, fraccionamiento. Requisitos provisorios hasta el relevamiento.

update pagos.modulos m
   set config = jsonb_set(
         jsonb_set(
           m.config,
           '{monto,conceptos,fraccionamiento}',
           '"certificado-fraccionamiento"'
         ),
         '{solicitud,tipos}',
         (
           select jsonb_agg(t order by array_position(array['comercio','vehiculo','deposito','fraccionamiento'], t->>'slug'))
             from (
               select t from jsonb_array_elements(m.config->'solicitud'->'tipos') t
                where t->>'slug' <> 'fraccionamiento'
               union all
               select '{
                 "slug": "fraccionamiento",
                 "nombre": "Fraccionamiento",
                 "descripcion": "Para establecimientos que fraccionan o reenvasan productos fitosanitarios o domisanitarios.",
                 "requisitos": [
                   { "clave": "direccion-planta", "etiqueta": "Dirección del establecimiento", "tipo": "texto", "obligatorio": true },
                   { "clave": "productos", "etiqueta": "Productos que fracciona", "tipo": "texto", "obligatorio": true, "ayuda": "Nombre comercial y principio activo de cada uno." },
                   { "clave": "responsable-tecnico", "etiqueta": "Responsable técnico (nombre y matrícula)", "tipo": "texto", "obligatorio": true },
                   { "clave": "croquis", "etiqueta": "Plano o croquis del establecimiento", "tipo": "documento", "obligatorio": true },
                   { "clave": "habilitacion-municipal", "etiqueta": "Habilitación municipal", "tipo": "documento", "obligatorio": true }
                 ]
               }'::jsonb
             ) x
         )
       )
 where m.slug = 'fitosanitarios';
