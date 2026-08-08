# Guía de usuario — probar la instalación de ALDC vía APM

Esta guía te permite **reproducir a mano, paso a paso**, la validación de una
instalación real de ALDC desde GitHub mediante APM en un proyecto consumidor
limpio. Es la versión "humana" del gate automático descrito en
[`testing-apm-consumer-installation.md`](./testing-apm-consumer-installation.md)
(en inglés): cada paso indica el comando exacto, qué comprobar y el resultado
esperado, tal como se validó con APM CLI **0.27.0**.

> **Regla crítica de esta distribución**: GitHub Copilot usa
> `.github/prompts/*.prompt.md`. Si en algún paso aparece `.github/commands` o
> `.claude`, la prueba **falla** — esas rutas pertenecen a distribuciones para
> Claude Code, no a esta.

Toda la prueba se hace en **directorios temporales fuera de este repositorio**;
al terminar puedes borrarlos sin dejar rastro.

---

## 1. Requisitos previos

| Herramienta | Versión | Comprobación |
|-------------|---------|--------------|
| Node.js | 18 o superior (validado con 22) | `node --version` |
| npm | incluido con Node | `npm --version` |
| Python + pip | 3.10+ (para instalar APM) | `pip --version` |
| APM CLI | **0.27.0** (la versión con la que está registrada la evidencia) | `apm --version` |
| Red | acceso a `github.com` y `registry.npmjs.org` | — |

- **No necesitas `gh` ni autenticación de GitHub**: `javiarmesto/APM-ALDC` es
  público y la instalación validada resolvió sin credenciales. Solo si usas
  fuentes privadas o topas con límites de peticiones necesitarás un token
  (consulta la documentación del APM CLI).
- Instalar APM:

```bash
pip install apm-cli==0.27.0
apm --version
# → Agent Package Manager (APM) CLI version 0.27.0
```

(Alternativas: script oficial `curl -sSL https://aka.ms/apm-unix | sh` en
Linux/macOS, `irm https://aka.ms/apm-windows | iex` en PowerShell, o Homebrew/
Scoop — ver el repo del APM CLI.)

## 2. La decisión de confianza MCP (léela antes de instalar)

El comando de instalación usa `--trust-transitive-mcp`. Eso significa que
**confías explícitamente en los cuatro servidores MCP que declara ALDC**, que
APM configurará en `.vscode/mcp.json` del proyecto:

| Servidor MCP | Transporte | Qué se configura |
|--------------|------------|------------------|
| `github-mcp-server` | http | `https://api.githubcopilot.com/mcp/` |
| `markitdown-mcp` | stdio | `uvx markitdown-mcp@0.0.1a4` |
| `microsoftdocs-mcp` | http | `https://learn.microsoft.com/api/mcp` |
| `al-symbols-mcp` | stdio | `npx al-mcp-server` |

Esta prueba solo verifica que quedan *configurados*; nunca los ejecuta. Si no
quieres aceptar esa confianza en bloque, quita el flag y responde tú mismo a
las preguntas interactivas de APM.

---

## 3. Escenario A — proyecto AL con `app.json` en la raíz

### 3.1 Crear el consumidor limpio

```bash
mkdir aldc-prueba-root && cd aldc-prueba-root
```

Crea `apm.yml` (referencia parametrizable — mientras no exista un tag aprobado
usa `#main`; cuando se publique, cámbialo por p. ej. `#v4.2.0`):

```yaml
name: aldc-consumidor-prueba
version: 0.0.0
description: Consumidor de prueba para ALDC

target: [copilot]

dependencies:
  apm:
    - javiarmesto/APM-ALDC#main
```

Crea un `app.json` AL mínimo en la raíz:

```json
{
  "id": "00000000-0000-0000-0000-000000000001",
  "name": "Prueba ALDC",
  "publisher": "MiEmpresa",
  "version": "1.0.0.0",
  "platform": "1.0.0.0",
  "application": "26.0.0.0",
  "idRanges": [{ "from": 50100, "to": 50149 }]
}
```

### 3.2 Instalar desde GitHub

```bash
apm install --target copilot --trust-transitive-mcp
```

Salida esperada (fíjate en el commit resuelto — es tu evidencia de *qué* se
instaló, porque `#main` es una referencia móvil):

```text
[+] javiarmesto/APM-ALDC #main @<commit>
|-- 11 prompts integrated -> .github/prompts/
|-- 11 agents integrated -> .github/agents/
|-- 8 instruction(s) integrated -> .github/instructions/
|-- 19 skill(s) integrated -> .agents/skills/
...
[*] Configured 4 servers
```

### 3.3 Verificar los recuentos sobre los archivos reales

No te fíes de la consola: cuenta los archivos desplegados.

Bash (macOS/Linux):

```bash
ls .github/prompts/*.prompt.md | wc -l   # → 11
ls .github/agents | wc -l                # → 11
ls .github/instructions | wc -l          # → 8
ls -d .agents/skills/*/ | wc -l          # → 19
```

PowerShell (Windows):

```powershell
(Get-ChildItem .github/prompts -Filter *.prompt.md).Count   # → 11
(Get-ChildItem .github/agents -File).Count                  # → 11
(Get-ChildItem .github/instructions -File).Count            # → 8
(Get-ChildItem .agents/skills -Directory).Count             # → 19
```

### 3.4 Comprobar las rutas prohibidas (regresión Copilot)

Ninguna de estas rutas debe existir; los 11 prompts deben estar **solo** en
`.github/prompts` y conservar la extensión `.prompt.md`:

```bash
test ! -e .github/commands && test ! -e .claude && test ! -e docs/templates \
  && echo "OK: sin rutas prohibidas"
```

```powershell
if (-not (Test-Path .github/commands) -and -not (Test-Path .claude) -and -not (Test-Path docs/templates)) { "OK: sin rutas prohibidas" }
```

### 3.5 Ejecutar el scaffold inicial

```bash
node .agents/skills/github-scaffold/scripts/Install-Scaffold.mjs
```

Resultado esperado — **`Seeded 7, skipped 0`** con estos 7 elementos:

```text
+ .github/copilot-instructions.md
+ aldc.yaml
+ aldc.code-workspace (simple layout)
+ .github/plans/memory.md
+ tools/bcquality
+ tools/aldc-validate
+ tools/bc-agents
```

Con `app.json` en la raíz el workspace debe decir **`(simple layout)`**.

### 3.6 Idempotencia (segunda ejecución sin `--force`)

Vuelve a lanzar el mismo comando. Resultado esperado: **`Seeded 0, skipped 7`**
y ningún archivo modificado (si quieres verificarlo con hashes, anota antes el
SHA-256 de `aldc.yaml` y compáralo después: `shasum -a 256 aldc.yaml` /
`Get-FileHash aldc.yaml`).

### 3.7 Alcance de `--force`

1. Modifica a propósito un archivo del scaffold:
   `echo "SABOTAJE" > .github/copilot-instructions.md`
2. Crea un archivo tuyo: `echo "mío" > NOTAS-PROPIAS.md`
3. Anota el hash de `app.json` (`shasum -a 256 app.json` / `Get-FileHash app.json`).
4. Ejecuta:

```bash
node .agents/skills/github-scaffold/scripts/Install-Scaffold.mjs --force
```

Comprueba que:

- `.github/copilot-instructions.md` queda **restaurado** (idéntico al seed
  desplegado en `.agents/skills/github-scaffold/scripts/seed/copilot-instructions.md`);
- el hash de `app.json` **no ha cambiado**;
- `NOTAS-PROPIAS.md` sigue intacto;
- solo cambian los 7 destinos del scaffold, nada más.

> Nota sobre hashes: el archivo restaurado tiene **dos** hashes documentados y
> ambos son correctos — `3631…` (bytes crudos del archivo, lo que registra
> `apm.lock.yaml` como `content_hash`) y `d863…` (texto con `.trim()`, el
> `copilotEntrypointHash` que fija `aldc.yaml` y comprueba el validador).

### 3.8 Ejecutar el validador ALDC

```bash
cd tools/aldc-validate && npm ci --no-audit --no-fund && cd ../..
node tools/aldc-validate/index.js
```

Resultado esperado (código de salida 0):

```text
✅ ALDC Core v1.1 COMPLIANT (0 warning(s))
```

Es decir: **0 errores y 0 warnings**. Si tu versión del validador muestra otro
banner, anota la versión real y el motivo del cambio.

### 3.9 (Opcional) Verlo funcionando en VS Code

Abre `aldc.code-workspace` en VS Code: verás la raíz "ALDC (extension)" y la
raíz BCQuality (esta última aparecerá como ausente hasta ejecutar
`bash tools/bcquality/install.sh` — es normal). En Copilot Chat, al escribir
`/` deberían aparecer los prompts (`al-initialize`, `al-build`, `al-spec.create`,
…) y VS Code te pedirá confirmar el arranque de los servidores MCP declarados
en `.vscode/mcp.json`.

---

## 4. Escenario B — proyecto dividido `App/` + `Test/`

Repite los pasos 3.1–3.5 y 3.8 en **otro directorio temporal**, con una sola
diferencia: en lugar del `app.json` en la raíz, crea:

```text
App/app.json    (mismo contenido mínimo, id …0001)
Test/app.json   (mismo contenido, id …0002 y otro name)
```

Diferencias esperadas:

- El scaffold debe decir **`aldc.code-workspace (split layout)`**.
- `aldc.code-workspace` debe ser **multirraíz** con cuatro carpetas:
  `"AL (extension)" → App`, `"AL (tests)" → Test`, la raíz del repo y BCQuality.
- El validador debe volver a dar `ALDC Core v1.1 COMPLIANT`, 0 errores,
  0 warnings.

---

## 5. Checklist de resultados

| # | Comprobación | Esperado |
|---|--------------|----------|
| 1 | `apm install` desde GitHub | exit 0, commit resuelto anotado |
| 2 | Prompts | 11 en `.github/prompts`, todos `*.prompt.md` |
| 3 | Agentes | 11 archivos en `.github/agents` |
| 4 | Instrucciones | 8 archivos en `.github/instructions` |
| 5 | Skills | 19 carpetas en `.agents/skills` |
| 6 | Rutas prohibidas | no existen `.github/commands`, `.claude`, `docs/templates` |
| 7 | Scaffold 1ª vez | `Seeded 7, skipped 0` |
| 8 | Scaffold 2ª vez | `Seeded 0, skipped 7`, sin cambios |
| 9 | `--force` | restaura lo suyo; `app.json` y archivos del consumidor intactos |
| 10 | Workspace | `simple` en root-app, multirraíz en App/Test |
| 11 | Validador | `ALDC Core v1.1 COMPLIANT`, 0 errores, 0 warnings (ambos layouts) |

## 6. Todo esto, en un solo comando

El runner automático ejecuta exactamente esta misma matriz (las dos
disposiciones, con fixtures temporales y limpieza automática) desde la raíz de
este repositorio:

```bash
node tests/e2e/apm-consumer-install.mjs
```

Variables útiles: `ALDC_APM_REF` (rama o tag a probar, por defecto `main`),
`APM_BIN` (ejecutable APM), `ALDC_E2E_KEEP=1` (conservar los fixtures para
investigar un fallo). Detalle completo en
[`testing-apm-consumer-installation.md`](./testing-apm-consumer-installation.md).

## 7. Solución de problemas

- **`apm: command not found`** — con pip en Linux/macOS el binario queda en
  `~/.local/bin`; añádelo al PATH o usa `APM_BIN=~/.local/bin/apm`.
- **El validador falla con `Cannot find module 'js-yaml'`** — te falta el
  `npm ci` del paso 3.8 dentro de `tools/aldc-validate`.
- **Recuentos distintos a 11/11/8/19** — comprueba con `apm.lock.yaml` qué
  commit se resolvió; si `main` ha avanzado, los recuentos esperados pueden
  haber cambiado con él. Anota el commit y compara con el README del paquete.
- **Límite de peticiones de GitHub** — configura un token según la
  documentación del APM CLI y reintenta.
- **La raíz BCQuality aparece como carpeta ausente en VS Code** — esperado
  hasta ejecutar `bash tools/bcquality/install.sh` (clona la base de
  conocimiento fuera del proyecto AL).

## 8. Limpieza

Borra los directorios temporales de prueba (`aldc-prueba-root`, el del
escenario B) cuando termines. Nada de la prueba escribe dentro de este
repositorio.
