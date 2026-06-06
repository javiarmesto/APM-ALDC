---
name: github-scaffold
description: "Instala la estructura base .github/tools, docs y plans en proyectos BC. Usar cuando se inicializa un proyecto nuevo con ALDC."
---

# Skill: GitHub Scaffold

Instala las carpetas de infraestructura estándar de ALDC en `.github/`:

- **tools/aldc-validate** — validador Node.js para extensiones AL
- **docs/** — plantillas de documentación (architecture, spec, plan, delivery, etc.) y schema ALDC
- **plans/** — carpeta para planes de proyecto

## Uso

Desde la raíz del proyecto consumidor, después de `apm install`:

```powershell
apm run scaffold
```

O directamente:

```powershell
powershell -File .agents/skills/github-scaffold/scripts/Install-Scaffold.ps1
```

## Comportamiento

- `tools/` — se instala solo si no existe (el dev puede haberlo modificado)
- `docs/` y `plans/` — se actualizan siempre (son plantillas de referencia)
