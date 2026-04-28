# Configuración del schedule de sincronización en AWS

Este documento describe cómo activar la sincronización automática
contra Brightspace para que la base de datos del backend mantenga
fresca la información que sirve a los dashboards.

El backend ya expone los endpoints necesarios. Esta guía cubre
únicamente la parte que se hace **en AWS y en Brightspace**, no en
el código.

## Resumen del flujo

```
[AWS EventBridge Scheduler]  cada 30 min
    POST https://<prod-url>/admin/sync-cron-all
    Header: X-Cron-Secret: <valor del secret compartido>
        ↓
[Backend ECS]
    1. Valida X-Cron-Secret contra env CRON_SHARED_SECRET
    2. Mintea access_token usando env BRIGHTSPACE_SERVICE_REFRESH_TOKEN
    3. Lista cursos con enrollments activos en Postgres
    4. Por cada curso, corre sync_student_metric_snapshots
    5. Devuelve resumen con stats agregadas
        ↓
[Postgres]
    Snapshots actualizados → próximas peticiones del dashboard
    se sirven desde DB en ~50ms en vez de 1-3s desde Brightspace
```

## Variables de entorno nuevas en `taskdef.json`

Hay que agregar dos variables al task definition de ECS:

| Variable | Valor | Para qué |
|---|---|---|
| `BRIGHTSPACE_SERVICE_REFRESH_TOKEN` | Refresh token de la cuenta dueña del sync | Permite al backend mintear access_tokens contra Brightspace sin intervención humana |
| `CRON_SHARED_SECRET` | String aleatorio largo (64+ caracteres) | Autentica al schedule cuando llama al endpoint, evita que cualquiera dispare el sync |

## Paso 1 — Generar el secret compartido

Puede ser cualquier string aleatorio. Una forma rápida en una terminal:

```bash
openssl rand -hex 32
```

Output ejemplo: `7a3f9d2b8c4e1f0a6d5c9b7e2f8a1d4b3c6e9f0a2d5b8c1e4f7a0d3b6c9e2f5a`

Guarde este valor — se usa tanto en `taskdef.json` como en el header
de EventBridge.

## Paso 2 — Capturar el `refresh_token` de Brightspace

El backend tiene un endpoint temporal `/admin/show-refresh-token` que
expone el refresh_token de la sesión actual. Solo se usa esta vez,
después se elimina.

Pasos:

1. Asegúrese de que el backend con los endpoints nuevos ya está
   desplegado en producción (commits hasta `23faffd`).

2. Abra en un navegador (con la cuenta de Brightspace que será dueña
   del sync — recomendado: una cuenta institucional con permisos
   estables, no una cuenta personal que pueda perder permisos):

   ```
   https://<prod-url>/auth/brightspace/login
   ```

   Complete el login normal con Microsoft SSO.

3. Después de loguear, en el mismo navegador visite:

   ```
   https://<prod-url>/admin/show-refresh-token
   ```

   La respuesta es un JSON tipo:

   ```json
   {
       "warning": "ENDPOINT TEMPORAL — eliminar del codigo tras capturar el token",
       "refresh_token": "abc123def456...token-largo...",
       "user": {
           "user_id": "12345",
           "user_name": "Juan David Perez",
           "user_email": "jd@cesa.edu.co"
       },
       "instructions": "Copie 'refresh_token' a la env..."
   }
   ```

4. Copie el valor de `refresh_token`. Es un string largo (típicamente
   100+ caracteres). Guárdelo seguro — funciona como credencial.

   Verifique en `user` que la sesión es de la cuenta correcta antes
   de copiar.

## Paso 3 — Agregar las variables al taskdef

Edite `taskdef.json` (o registre una nueva versión del task
definition vía AWS Console / CLI). En el bloque `environment` agregue:

```json
{
    "name": "BRIGHTSPACE_SERVICE_REFRESH_TOKEN",
    "value": "<el refresh_token capturado en el paso 2>"
},
{
    "name": "CRON_SHARED_SECRET",
    "value": "<el secret generado en el paso 1>"
}
```

Despliegue una nueva versión del servicio ECS para que las variables
queden activas.

Verifique con un `curl` de prueba que el endpoint ahora responde
distinto:

```bash
curl -i -X POST "https://<prod-url>/admin/sync-cron-all" \
    -H "X-Cron-Secret: <CRON_SHARED_SECRET>"
```

Esperado: HTTP 200 con un JSON tipo:

```json
{
    "ok": true,
    "totalCourses": 1,
    "successCount": 1,
    "failureCount": 0,
    "results": [
        { "orgUnitId": 29120, "ok": true, "details": {...}, "error": null }
    ]
}
```

Si responde 401: el secret no coincide.
Si responde 502 con "No se pudo mintar access_token": el refresh_token
es inválido o fue revocado, hay que repetir el paso 2.

## Paso 4 — Crear el schedule en EventBridge

En la consola de AWS:

1. **Servicio**: Amazon EventBridge → **Scheduler** → **Schedules** →
   **Create schedule**.

2. **Name**: ej. `gemelo-digital-sync-cron`.

3. **Schedule pattern**:
   - **Recurring schedule**.
   - **Rate-based** (más simple): cada `30 minutes`.
   - O **Cron-based** si quiere algo específico (ej. solo en horario
     hábil): `cron(0/30 * * * ? *)` = cada 30 min en punto.

4. **Flexible time window**: sin tolerancia (off) o 5 min según
   preferencia.

5. **Target**: **API destination** (HTTP).

   Hay que crear primero un **API destination** y un **connection** si
   no existen:

   - **Connection**: API key authentication. Aunque nuestro endpoint
     usa header custom, EventBridge requiere algún tipo de connection.
     Puede crear una vacía / dummy.
   - **API destination**:
     - Endpoint: `https://<prod-url>/admin/sync-cron-all`
     - Method: `POST`

6. **Headers** del target: agregar
   `X-Cron-Secret: <CRON_SHARED_SECRET>` como invocation http
   parameter.

7. **Permissions**: rol IAM con permiso `events:InvokeApiDestination`
   sobre el API destination creado. EventBridge sugiere crear el rol
   automáticamente si no existe.

8. **Create schedule**.

## Paso 5 — Verificación

Tras crear el schedule, espere a la primera invocación
(máximo 30 min según la frecuencia configurada).

En **CloudWatch Logs** del servicio ECS busque líneas como:

```
INFO: sync-cron-all disparado (orgUnitIds=TODOS)
INFO: sync-cron-all: arrancando sync de N curso(s): [...]
INFO: sync-cron-all ou=29120 OK
```

Si aparecen, el schedule está funcionando.

En **EventBridge Scheduler → schedule → Monitoring** se ven los
intentos y respuestas HTTP.

Si EventBridge muestra status 401: el header `X-Cron-Secret` no
coincide con la env del backend.
Si muestra 503: alguna de las dos vars no está cargada en el
taskdef (verificar deploy).
Si muestra 502: el refresh_token es inválido.

## Paso 6 — Eliminar el endpoint de captura

Una vez todo verificado y con el schedule corriendo OK durante
algunas horas, **eliminar del código el endpoint
`/admin/show-refresh-token`**. Ya no se necesita y mantenerlo
expuesto es un riesgo de seguridad (cualquier sesión activa lo
puede consultar).

Avisar al desarrollador para que prepare el commit de eliminación.
Despliegue siguiente, el endpoint queda fuera.

## Renovación del refresh_token (a futuro)

Brightspace rota el refresh_token periódicamente (típicamente cada
~1 año si no hay uso, indefinidamente si se usa). El backend NO
guarda el refresh_token rotado de vuelta al taskdef — eso requeriría
escritura runtime en AWS.

Si en algún momento el schedule empieza a fallar con 502 "refresh
token revocado":

1. Re-habilitar temporalmente el endpoint `/admin/show-refresh-token`
   (revertir el commit que lo eliminó).
2. Repetir paso 2 con la misma cuenta para capturar un refresh_token
   nuevo.
3. Actualizar la env `BRIGHTSPACE_SERVICE_REFRESH_TOKEN` en el
   taskdef y redesplegar.
4. Volver a eliminar el endpoint.

Si el problema es recurrente, considerar migrar a una cuenta de
servicio dedicada con permisos más estables.

## Resumen de variables de entorno

Después de configurar el schedule, el `taskdef.json` debe tener
estas variables nuevas (además de las que ya existían):

```json
{ "name": "BRIGHTSPACE_SERVICE_REFRESH_TOKEN", "value": "..." },
{ "name": "CRON_SHARED_SECRET",                "value": "..." }
```

Nada más cambia. El backend funciona normal aunque estas variables
no estén — solo el endpoint `/admin/sync-cron-all` retorna 503 si
faltan, lo cual es comportamiento intencional.
