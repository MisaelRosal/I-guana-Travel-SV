# Traducción pública de publicaciones con LibreTranslate

Las publicaciones conservan el título y la descripción originales en español. El backend puede generar una versión inglesa para el catálogo público; si no existe o el traductor no está disponible, el lector recibe el texto español. La traducción automática es un borrador: no certifica calidad ni sustituye una revisión humana.

## Ruta rápida para una instalación nueva

> **Solo para una instalación realmente nueva.** Esta ruta crea volúmenes y ejecuta migraciones y seed. Ejecútela únicamente desde el directorio de un despliegue nuevo, nunca sobre datos existentes ni desde los worktrees de esta estación.

1. En el directorio de un despliegue nuevo, prepare sus propios valores locales y secretos:

   ```powershell
   Copy-Item .env.example .env
   # En este despliegue nuevo, edite .env y cambie contraseñas, clave JWT y valores de despliegue.
   docker compose --env-file .env up -d --build
   ```

2. Espere a que el modelo español→inglés se descargue y LibreTranslate quede saludable:

   ```powershell
   docker compose --env-file .env ps libretranslate
   Invoke-RestMethod -Uri http://localhost:5000/api/Publicacione?contentLocale=en
   ```

   El segundo comando comprueba el endpoint público de la aplicación. Para probar LibreTranslate directamente, siga la sección **Comprobar el traductor**.

3. Si publicaciones existentes aún no tienen inglés, ejecute el backfill manual descrito abajo. No se inicia automáticamente al arrancar la aplicación ni al migrar la base de datos.

> **Importante:** el comando `up` completo inicia PostgreSQL, MinIO, el migrador, el backend, pgAdmin y el frontend. En una instalación existente no ejecute este comando: siga únicamente el procedimiento controlado de abajo, después de un respaldo verificado y aprobación explícita.

## Arquitectura y comportamiento

| Parte | Comportamiento |
| --- | --- |
| Fuente | Títulos/descripciones de publicaciones, biografías públicas de anfitriones, nombres/descripciones de experiencias y comentarios/respuestas de reseñas conservan su texto fuente en español. |
| Inglés | Las columnas `*_en` son nullable, independientes por campo y no se exponen en el JSON de entidades. |
| Lecturas públicas | Publicaciones, perfiles de anfitrión, experiencias anidadas y reseñas aceptan `contentLocale=es` o `contentLocale=en`; el valor por defecto es `es`. Cada campo inglés faltante vuelve a su texto fuente. Otro locale produce `400 Bad Request`. |
| Escrituras | La API guarda primero el texto fuente y luego traduce los campos pendientes de publicaciones, biografías, experiencias, comentarios y respuestas del anfitrión. Si LibreTranslate falla, el texto fuente sigue guardado. |
| Ediciones | Cambiar el título invalida solo `titulo_en`; cambiar la descripción invalida solo `descripcion_en`. La escritura condicional impide que una respuesta atrasada reemplace una traducción asociada con una versión anterior. |
| Tráfico | Las lecturas GET no llaman al traductor. La traducción usa español→inglés, formato `text`, lotes de hasta dos textos, límites de 200 caracteres para título de publicación y 1200 para otros textos, y un máximo de dos llamadas concurrentes por proceso backend. No hay cola ni reintentos automáticos. |
| Paneles | La ruta de publicaciones por anfitrión y los formularios de edición continúan usando el español fuente. |

El frontend envía el idioma activo como `contentLocale` para catálogo, búsqueda, próximas experiencias, detalle, perfil público del anfitrión, reseñas públicas y bandeja de reseñas del anfitrión. La búsqueda se hace sobre el título y la descripción devueltos para ese locale. El formulario privado **Mi perfil** y las herramientas de edición conservan el texto fuente en español.

## Configuración

| Variable | Uso y valor inicial |
| --- | --- |
| `LIBRETRANSLATE_ENABLED` | Compose la pasa al backend; `true` por defecto en Compose. Use `false` para desactivar llamadas sin detener el backend. |
| `LIBRETRANSLATE_TIMEOUT_SECONDS` | Timeout HTTP en Compose; `15` segundos por defecto. El backend limita el valor efectivo a un máximo de 60 segundos. |
| `Translation__LibreTranslate__Enabled` | Opción .NET para una ejecución directa del backend; es `false` por defecto si no se configura. |
| `Translation__LibreTranslate__BaseUrl` | Opción .NET para ejecución directa; `.env.example` muestra `http://localhost:5501` para un servicio de prueba local. Compose usa internamente `http://libretranslate:5000`. |
| `ARGOS_PACKAGE_INDEX` | URL base fija del índice Argos en `docker-compose.yml`; apunta al commit `ff90de60728f7c1338ff6b75974e4c89b2442d22` y termina en `/` para que Argos construya correctamente la ruta `index.json`. |
| `LT_LOAD_ONLY` | Limita los idiomas cargados a `es,en`. |
| `LT_UPDATE_MODELS` | No se configura: se conserva el valor oficial predeterminado `false`, por lo que no se actualiza automáticamente un modelo ya instalado. La primera instalación descarga los modelos que faltan para los idiomas configurados. |
| `LT_CHAR_LIMIT`, `LT_BATCH_LIMIT` | Limita cada solicitud a 1200 caracteres y cada lote a dos textos. |

Compose conserva los datos descargados en un volumen de proyecto montado en `/home/libretranslate/.local`, que contiene las rutas oficiales `/home/libretranslate/.local/share` y `/home/libretranslate/.local/cache`. Montar el directorio padre conserva los permisos del usuario no privilegiado de la imagen y evita montar volúmenes root-owned sobre subdirectorios que no existen en la imagen. El servicio no publica un puerto en la configuración normal. Tampoco tiene un `depends_on` desde el backend: una caída del traductor no impide que la aplicación arranque.

Con `LT_LOAD_ONLY=es,en`, Argos puede instalar ambos sentidos: aproximadamente **272 MB** para español→inglés y **83 MB** para inglés→español, más los datos de MiniSBD. Presupueste alrededor de **355 MB más MiniSBD** de descarga inicial según la lista oficial. No se han medido aquí el espacio instalado exacto, la RAM ni el tiempo de arranque en un servidor objetivo.

## Instalación existente: proteger los datos primero

Antes de actualizar una instalación existente:

1. Confirme el estado real de PostgreSQL, el historial de migraciones y el método de respaldo/restauración utilizado por esa instalación.
2. Revise el `docker-compose.yml` efectivo, los nombres de volúmenes y la ruta de datos real de MinIO antes de recrear o cambiar cualquier servicio.
3. Aplique la migración de EF Core solo mediante el procedimiento de despliegue aprobado para esa base de datos; no ejecute backfill durante el despliegue.
4. Active LibreTranslate después de validar el traductor por separado.

El Compose de este repositorio configura el MinIO de Bitnami con datos en `/bitnami/minio/data`. Una instalación previa puede usar otra imagen y otra ruta, por ejemplo `/data`. Cambiar imagen, montaje o volumen sin una migración de datos verificada puede hacer que los objetos parezcan desaparecer o ponerlos en riesgo. No inicie ni recree PostgreSQL, MinIO o pgAdmin como parte de una prueba del traductor, y no use `docker compose down -v`.

### Instalación existente en esta estación — instrucciones, no ejecutar ahora

> **Los comandos de esta sección son documentación para una operación futura; no los ejecute ahora.** Se requiere un respaldo PostgreSQL completado y verificado, además de aprobación explícita del usuario, antes de alterar la base existente.

El estado previamente verificado de esta estación tiene dos worktrees y un proyecto Compose activo:

| Elemento | Ruta o valor |
| --- | --- |
| Worktree original, rama `pruebas` | `C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV` |
| Worktree aislado, rama `feature/libretranslate-i18n` | `C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV-libretranslate` |
| Proyecto de los contenedores existentes | `i-guana-travel-sv` |
| Archivo `.env` existente | Solo en el worktree original: `C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV\.env` |

El archivo `.env` **no** está en el worktree feature. No lo lea, copie ni edite para preparar este cambio. Las operaciones Compose documentadas abajo lo referencian directamente mediante `--env-file` para interpolar los valores del proyecto existente.

#### 1. Precomprobaciones de solo lectura

Los siguientes comandos son para el operador cuando reciba autorización. Muestran rama, cambios locales, worktrees y etiquetas de los contenedores; no cambian datos:

```powershell
$originalRoot = 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV'
$featureRoot = 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV-libretranslate'

git -C $originalRoot status --short --branch
git -C $originalRoot worktree list
git -C $featureRoot status --short --branch
docker inspect rutasv-db --format '{{index .Config.Labels "com.docker.compose.project"}}'
docker inspect rutasv-minio --format '{{.Config.Image}}'
docker inspect rutasv-minio --format '{{json .Mounts}}'
```

La etiqueta previamente verificada de `rutasv-db` es `i-guana-travel-sv`. También se verificó una discrepancia crítica de MinIO: el servicio activo usa `minio/minio` con datos en `/data`, mientras el `docker-compose.yml` versionado configura `bitnamilegacy/minio` con datos en `/bitnami/minio/data`. **No inicie, recree ni cambie imagen, montaje o volumen de `postgres`, `minio` o `pgadmin`.** No ejecute un `docker compose up` general, `down`, `down -v` ni comandos que reconstruyan o recreen esos servicios.

#### 2. Respaldo PostgreSQL — requerido antes de cualquier cambio

Este ejemplo escribe un dump custom dentro de `/tmp` del contenedor PostgreSQL existente y lo copia a un archivo temporal del host. `pg_dump` expande las variables dentro del contenedor; el comando no muestra ni imprime `.env`, contraseña ni valores de entorno.

> **No se ejecutó este respaldo como parte de esta implementación.** Un respaldo completado y verificado, más aprobación explícita para alterar la base existente, son requisitos previos; sin ambos, deténgase.

```powershell
$backupPath = Join-Path $env:TEMP 'iguana-sv-pre-libretranslate.dump'

docker exec rutasv-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/iguana-sv-pre-libretranslate.dump'
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed; stop before changing the database.' }

docker cp rutasv-db:/tmp/iguana-sv-pre-libretranslate.dump $backupPath
if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf)) { throw 'The host backup file is missing.' }
$backup = Get-Item -LiteralPath $backupPath
if ($backup.Length -le 0) { throw 'The host backup file is empty.' }
"Custom-format backup verified: $($backup.Length) bytes at $($backup.FullName)"
```

Conserve el archivo fuera del repositorio y verifique que el procedimiento de restauración sea válido para el operador. No considere suficiente que `docker cp` haya terminado: confirme que el archivo existe y no está vacío.

#### 3. Migración y actualización, solo después de respaldo y aprobación

Los comandos Compose deben conservar el proyecto existente y tomar Compose, rutas relativas y variables del worktree correcto. No ejecute estas instrucciones durante pruebas o sin autorización operativa:

```powershell
docker compose `
  --project-directory 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV-libretranslate' `
  --env-file 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV\.env' `
  -f 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV-libretranslate\docker-compose.yml' `
  -p i-guana-travel-sv `
  up -d --no-deps migrator
```

Este migrador aplica todas las migraciones EF pendientes y después carga el seed de referencia idempotente. `--no-deps` es obligatorio: PostgreSQL ya debe estar activo; Compose no debe iniciarlo ni recrearlo. Espere a que el proceso termine y revise solo ese servicio:

```powershell
docker compose `
  --project-directory 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV-libretranslate' `
  --env-file 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV\.env' `
  -f 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV-libretranslate\docker-compose.yml' `
  -p i-guana-travel-sv `
  logs --no-color --tail 100 migrator

docker compose `
  --project-directory 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV-libretranslate' `
  --env-file 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV\.env' `
  -f 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV-libretranslate\docker-compose.yml' `
  -p i-guana-travel-sv `
  ps --all migrator
```

Si el migrador no termina correctamente, deténgase; no actualice el backend/frontend ni intente un `down`, reset o restauración improvisada.

Después de confirmar el migrador, inicie únicamente LibreTranslate. El volumen del modelo usa el proyecto existente y el puerto de prueba no se publica porque este comando solo utiliza el Compose normal:

```powershell
docker compose `
  --project-directory 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV-libretranslate' `
  --env-file 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV\.env' `
  -f 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV-libretranslate\docker-compose.yml' `
  -p i-guana-travel-sv `
  up -d --no-deps libretranslate
```

Construya solo las imágenes backend/frontend y luego actualice solo esos dos servicios. `--no-deps` impide que Docker Compose intente arrancar/recrear PostgreSQL, MinIO, pgAdmin o migrator; esos servicios de datos deben seguir activos y saludables:

```powershell
docker compose `
  --project-directory 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV-libretranslate' `
  --env-file 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV\.env' `
  -f 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV-libretranslate\docker-compose.yml' `
  -p i-guana-travel-sv `
  build backend frontend

docker compose `
  --project-directory 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV-libretranslate' `
  --env-file 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV\.env' `
  -f 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV-libretranslate\docker-compose.yml' `
  -p i-guana-travel-sv `
  up -d --no-deps backend frontend
```

No se ejecutaron estas operaciones en la instalación existente: no se hizo backup, migración, backfill, stop, ni operación sobre sus contenedores o datos. Las pruebas API/database de esta rama usan exclusivamente fixtures desechables de Testcontainers; el único contenedor live probado es el servicio LibreTranslate aislado.

#### 4. Reanudar o recuperar el worktree sin cambiar de rama

Compruebe ambos worktrees con comandos de solo lectura:

```powershell
git -C 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV' status --short --branch
git -C 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV' worktree list
git -C 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV-libretranslate' status --short --branch
```

El worktree original permanece en `pruebas` y conserva cambios locales de usuario en `.atl/skill-registry.md` y `.atl/.skill-registry.cache.json`. Para continuar esta feature, abra una terminal en el worktree hermano o ejecute:

```powershell
Set-Location -LiteralPath 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV-libretranslate'
git status --short --branch
```

No ejecute `git switch pruebas` desde el worktree feature: esa rama ya está activa en el worktree original. En esta rama feature no hay commits nuevos que descartar; sus cambios están sin commit. No use `reset --hard`, no descarte ni guarde en stash cambios automáticamente y no elimine el worktree o la rama. Eliminar la rama feature solo procede después de una decisión explícita del usuario y de revisar/preservar todo el trabajo sin commit.

Si el usuario decide expresamente eliminar esta rama, primero guarde fuera del worktree cualquier cambio que deba conservar y confirme que el status está limpio. Solo entonces ejecute, sin `--force`:

```powershell
git -C 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV-libretranslate' status --short --branch
git -C 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV' worktree remove 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV-libretranslate'
git -C 'C:\Users\ESTUDIANTE\Desktop\alejandro\I-Guana-Travel-SV\I-guana-Travel-SV' branch -d feature/libretranslate-i18n
```

Si el primer comando muestra archivos modificados o nuevos, deténgase: no use `git worktree remove --force` ni `git branch -D`.

OpenCode puede permanecer abierto durante inspecciones de estado de solo lectura. Si ejecuta una migración, build o comando Compose prolongado en la misma terminal, espere a que termine antes de emitir el siguiente comando; no es necesario cerrar OpenCode.

#### Reversión de esquema

El destino anterior a la traducción es `20261008170558_AddResenas`. Volver a ese destino elimina la migración de traducciones y **borra las columnas inglesas y las traducciones almacenadas**. No se proporciona aquí un comando ejecutable de reversión: requiere un runbook manual aprobado por mantenimiento/operaciones, respaldo verificado y autorización explícita independiente. No lo ejecute como parte de esta guía.

## Comprobar el traductor

La publicación del puerto se encuentra solo en `docker-compose.translation-test.yml`. Ejecute la prueba con un nombre de proyecto único; `--no-deps` limita el arranque a LibreTranslate:

```powershell
docker compose --env-file .env.example `
  -f docker-compose.yml `
  -f docker-compose.translation-test.yml `
  -p iguana-libretranslate-manual `
  up -d --no-deps libretranslate
```

La primera ejecución descarga el modelo. Espere a que el healthcheck termine y consulte la respuesta oficial:

```powershell
Invoke-RestMethod -Uri http://127.0.0.1:5501/health
```

Respuesta esperada: un objeto JSON con `status` igual a `ok` (HTTP 200).

Pruebe una traducción con texto sintético, no con contenido de usuarios:

```powershell
$body = @{
  q = @(
    'Una casa cerca de la playa'
    'Descripción sintética para comprobar el lote'
  )
  source = 'es'
  target = 'en'
  format = 'text'
} | ConvertTo-Json -Compress
$bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)

$response = Invoke-WebRequest -UseBasicParsing -Method Post `
  -Uri http://127.0.0.1:5501/translate `
  -ContentType 'application/json; charset=utf-8' `
  -Body $bodyBytes `
  -TimeoutSec 120
"HTTP $($response.StatusCode)"
$response.Content
```

Respuesta esperada: HTTP 200 con `translatedText` como una lista que contiene una traducción no vacía por cada texto enviado. Este chequeo confirma que el servicio responde; **no** certifica exactitud, naturalidad ni calidad humana de la traducción.

Para parar el contenedor de prueba y conservar los volúmenes del modelo:

```powershell
docker compose --env-file .env.example `
  -f docker-compose.yml `
  -f docker-compose.translation-test.yml `
  -p iguana-libretranslate-manual `
  stop libretranslate
```

No ejecute `down -v`. El puerto `5501` solo se enlaza a `127.0.0.1`; no añada una publicación de puerto a la configuración normal.

## Backfill administrativo manual

El backfill es una operación explícita: solo el rol `admin` puede ejecutarlo y cada llamada procesa como máximo 25 publicaciones. La ruta también exige el token CSRF de la sesión. Procesa únicamente traducciones ausentes y devuelve conteos y cursor, nunca el texto traducido.

1. Inicie sesión con una cuenta administradora en el sitio local, por ejemplo `http://localhost/` cuando se usa el frontend de Compose.
2. En esa misma pestaña y origen, abra las herramientas de desarrollador del navegador y seleccione **Console**.
3. Ejecute un lote por vez. `credentials: 'include'` permite que el navegador envíe automáticamente la cookie HttpOnly `iguana_auth`; el código lee la cookie CSRF de la pestaña para formar la cabecera coincidente. No copie, imprima ni comparta cookies o tokens.

```javascript
const afterId = null; // Primer lote; en el siguiente, use el nextAfterId numérico recibido.
const params = new URLSearchParams({ batchSize: '25' });
if (afterId !== null) params.set('afterId', String(afterId));

const csrfCookie = document.cookie
  .split(';')
  .map((part) => part.trim())
  .find((part) => part.startsWith('iguana_csrf='));
if (!csrfCookie) throw new Error('No se encontró la cookie CSRF en este origen.');
const csrfToken = decodeURIComponent(csrfCookie.slice('iguana_csrf='.length));

const response = await fetch(`/api/Publicacione/traducir-pendientes?${params}`, {
  method: 'POST',
  credentials: 'include',
  headers: { 'X-CSRF-Token': csrfToken },
});
const result = await response.json();
console.log({ status: response.status, result });
```

Revise `status` y el objeto de respuesta en la consola. Ejemplo de una respuesta HTTP 200 (los conteos e IDs dependen de los datos):

```json
{
  "processedCount": 25,
  "translatedCount": 25,
  "failedCount": 0,
  "nextAfterId": 148,
  "hasMore": true
}
```

Si `hasMore` es `true`, ejecute otro lote sustituyendo `null` en `afterId` por el valor numérico de `nextAfterId` devuelto por el lote anterior. Continúe hasta que `hasMore` sea `false`. Si `failedCount` es `1`, reintente desde el cursor devuelto; el registro fallido no se salta. Si falla el primer registro, `nextAfterId` puede ser `null`; vuelva a enviar el primer lote. Un `batchSize` fuera del rango 1–25 se rechaza con `400`.

### Biografías, experiencias y reseñas existentes

Para completar traducciones de contenido público que ya existía antes de la migración, use el endpoint administrativo por tipo. Cada tipo tiene su propio cursor; procese `anfitriones`, `experiencias` y `resenas` por separado. El backfill procesa hasta 25 registros, detiene el lote ante el primer fallo y devuelve solo conteos/cursor, nunca el texto fuente o traducido.

```javascript
async function backfill(tipo, afterId = null) {
  const params = new URLSearchParams({ tipo, batchSize: '25' });
  if (afterId !== null) params.set('afterId', String(afterId));

  const csrfCookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('iguana_csrf='));
  if (!csrfCookie) throw new Error('No se encontró la cookie CSRF en este origen.');
  const csrfToken = decodeURIComponent(csrfCookie.slice('iguana_csrf='.length));

  const response = await fetch(`/api/Traducciones/pendientes?${params}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-CSRF-Token': csrfToken },
  });
  return { status: response.status, result: await response.json() };
}

await backfill('anfitriones');
// Repetir el tipo pasando result.nextAfterId mientras result.hasMore sea true.
// Después repetir por separado para 'experiencias' y 'resenas'.
```

Este backfill requiere sesión de administrador y el mismo token CSRF. Solo incluye la biografía pública; no traduce correo/teléfono ni datos privados. Para reseñas procesa comentario y respuesta del anfitrión. No lo ejecute contra una base existente sin respaldo verificado y aprobación operativa.

No ejecute el backfill en esta instalación sin autorización operativa y una revisión previa. Primero valide el procedimiento solo con fixtures de base de datos desechables. No se ejecutó backfill contra datos reales durante esta implementación.

## Fallos, desactivación y reversión

- Si el servicio no está configurado o falla, el backend conserva la fuente en español, registra el ID de publicación y una categoría de fallo (no el contenido ni secretos), y las lecturas inglesas vuelven al texto español.
- Para que nuevas escrituras omitan por completo la llamada en Compose, establezca `LIBRETRANSLATE_ENABLED=false` en el archivo de entorno de despliegue y recree únicamente el backend mediante el procedimiento habitual. Detener LibreTranslate también es seguro, pero las llamadas en curso pueden esperar hasta el timeout configurado.
- El backend ejecutado directamente permanece deshabilitado si no se define `Translation__LibreTranslate__Enabled=true`.
- Revertir la aplicación a una versión que no lea el overlay es independiente de los campos fuente. La migración `AddPublicationEnglishTranslations` es aditiva; revertirla elimina los textos ingleses almacenados. No revierta una base de datos compartida sin respaldo, aprobación y el procedimiento de migración establecido.

## Licencias

LibreTranslate publica el servidor bajo AGPL-3.0 y el código de Argos Translate bajo MIT. El índice de Argos no declara la licencia del archivo específico `.argosmodel`; su licencia **no se ha verificado de forma independiente**. Revise los términos del artefacto del modelo antes de redistribuirlo o incluirlo en una imagen. No se versiona ni se incluye el archivo del modelo en este repositorio.

## Verificación de esta implementación

### Ejecutado en el worktree aislado

- Se generaron `AddPublicationEnglishTranslations` y `AddPublicUserContentEnglishTranslations` con `dotnet ef migrations add`; la suite aplicó migraciones solo en bases PostgreSQL desechables de Testcontainers.
- `dotnet test Backend/IguanaSV.Api.sln`: 122 pruebas pasaron con `LIBRETRANSLATE_TEST_URL=http://127.0.0.1:5501` (incluye los tests live de cliente/API y las pruebas de localización y backfill de anfitriones, experiencias y reseñas).
- `npm ci`: dependencias restauradas; npm informó una vulnerabilidad alta en el árbol instalado.
- `npm test`: 206 pruebas pasaron. `npm run build`: compilación exitosa; Vite advirtió que un chunk generado supera 500 kB.
- Se levantó el conjunto aislado `iguana-i18n-demo` (frontend `8081`, backend `127.0.0.1:5500`, MinIO `19000/19001`, PostgreSQL desechable, LibreTranslate de prueba en `127.0.0.1:5501`) y su migrator aplicó `AddPublicUserContentEnglishTranslations` exitosamente (exit 0).
- E2E por API contra el conjunto aislado: registrar anfitrión y `PUT /api/Anfitrione/mi-perfil` persiste la biografía inglesa (`contentLocale=en` devuelve inglés, `=es` la fuente); crear publicación con experiencia hija traduce título, descripción y nombre/descripción de la experiencia; publicar reseña y respuesta del anfitrión traduce comentario y respuesta, y `respuestaAnfitrionFuente` conserva el español para editar. Todo con fallback a la fuente cuando falta la traducción.
- `docker compose --env-file .env.example -f docker-compose.yml -f docker-compose.translation-test.yml config --quiet`: configuración válida, sin salida.
- Se descargó y arrancó `libretranslate/libretranslate:v1.9.6` solo en el proyecto `iguana-libretranslate-verify`, con `up -d --no-deps libretranslate`. `GET http://127.0.0.1:5501/health` devolvió `status=ok`; un POST sintético en español devolvió dos textos no vacíos en `translatedText`.
- Los tests opcionales `.NET` de cliente y API live, ejecutados con `LIBRETRANSLATE_TEST_URL=http://127.0.0.1:5501` y filtro `FullyQualifiedName~LiveLibreTranslate`, pasaron 2/2. El test API envió POST sintético por el pipeline HTTP real, verificó traducciones persistidas en el PostgreSQL desechable de `AuthApiFixture` y las leyó con `contentLocale=en`.
- Tras retirar `LT_UPDATE_MODELS`, `up -d --no-deps libretranslate` informó `Running`; el volumen persistente se reutilizó. No se observaron mensajes de descarga/actualización del modelo y el servicio volvió a `healthy` en segundos.

### No ejecutado

- No se conectó a una instalación real ni se modificó el despliegue `rutasv-*`. La validación E2E usó el conjunto aislado `iguana-i18n-demo` con su PostgreSQL desechable y un LibreTranslate de prueba; no la instalación desplegada.
- No se aplicó la migración a una base de datos persistente de producción ni se ejecutó backfill sobre datos reales. El backfill masivo de contenido existente permanece manual.
- No se midieron consumo de RAM, tiempo de instalación/arranque en un servidor objetivo ni calidad humana de las traducciones.
- La instalación nueva, actualización de instalaciones existentes, backfill operativo, revisión humana del inglés y validación de licencia del paquete `.argosmodel` siguen siendo pasos manuales.
