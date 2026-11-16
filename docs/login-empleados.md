# Login de empleados: cómo está hoy y qué hay que cambiar para el login central

**Visión (2026-11-16):** un dominio `sistema.ecologia.misiones.gob.ar` con un solo login para todos los empleados, validado contra la
base de **Personal** (tienen usuario y contraseña ahí), que emite un **JWT firmado** que leen todos los demás sistemas. Todavía no existe:
esto describe cómo dejamos la botonera para que, cuando exista, el cambio sea acotado.

## Hoy
- Se entra con el usuario de **Ecodatos** (Supabase Auth). La API recibe `Authorization: Bearer <token>`, le pregunta a Supabase quién es
  (`/auth/v1/user`, con caché de 1 minuto) y arma los permisos con las tablas de Ecodatos (roles admin/superadmin, `usuarios_areas`, `usuarios_formularios`).
- Los **contribuyentes** no pasan por esto (código por mail): no cambian.

## Los dos únicos puntos que cambian
1. **Front → `packages/sesion/src/index.ts`**: es lo único que sabe con qué se inicia sesión (`token()`, `ingresar()`, `salir()`, `haySesion()`,
   `email()`, `alCambiar()`). Los tres paneles (técnicos, Recaudaciones, administración) lo usan y **comparten una sola sesión**
   (una única clave de almacenamiento: se entra una vez para los tres). Para el login central se reemplaza la implementación (redirigir al login
   central / canjear el código por el token) sin tocar los paneles.
2. **API → `apps/api/src/core/auth-ecodatos.ts`**: `requiereSesionPanel` obtiene `{ id, email }` del token (`usuarioDeToken`) y los permisos
   (`permisosDeUsuario`). Con el JWT central: verificar firma, `iss`, `aud` y `exp` con la clave pública (JWKS) en vez de preguntarle a Supabase, y
   leer los permisos de los *claims* o de la tabla de permisos que se defina. El resto de la API usa solo `req.sesionPanel` (`usuario`, `modulos`, `areas`, `areasEditor`).

## Ya hecho para esto
- Sesión de los fronts concentrada en un paquete (`@botonera/sesion`), una sola sesión para los tres paneles.
- **Recaudaciones respeta solo lectura:** el área `recaudaciones` con `es_editor = false` ve todo pero **no puede cambiar tarifas** (`POST /api/admin/tarifas`
  responde 403 y el front esconde "Cambiar valor"). Admin/superadmin y editores del área sí. Así el ministro y los altos mandos pueden entrar **como
  integrantes del área sin edición**, sin ser admin de todo Ecodatos. Probado.

## Decisiones que quedan para cuando exista el login central
- Cómo se verifica la contraseña contra Personal (formato del hash, API o lectura), segundo factor para admins/Recaudaciones, topes de intentos.
- Dónde viven los permisos por sistema (tabla propia del login central vs los claims) y si la dependencia de Personal da acceso automático.
- Qué `sub` identifica a la persona (hoy es el id de Supabase; habría que mapear por email o id de Personal).
- Ecodatos: si acepta JWT de terceros; si no, convivir con su login.
