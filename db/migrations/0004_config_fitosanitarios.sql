-- La config de cada módulo sigue `ConfigModulo` (packages/shared/src/contrato.ts): de ahí el
-- panel saca qué datos pide el trámite y qué conceptos de tarifa necesita, sin código por módulo.
-- `validez_dias` es propio de fitosanitarios y convive con el contrato.

update pagos.modulos
   set config = '{
     "campos": [
       { "name": "identificador", "label": "DNI o CUIT", "type": "text", "required": true }
     ],
     "requisito": { "tipo": "registro", "registro": "fitosanitarios_domisanitarios", "campo": "identificador" },
     "monto": { "tipo": "fijo", "concepto": "renovacion-anual" },
     "validez_dias": 365
   }'::jsonb
 where slug = 'fitosanitarios';
