---
applyTo: "**/*.al"
description: "Always-on rules for AL code related to the AI Development Toolkit and Agent SDK"
---

# AL Agent Toolkit â€” Always-On Rules

Reglas que se aplican siempre que se edite cÃ³digo AL relacionado con el AI Development Toolkit o Agent SDK. Solo reglas. El conocimiento detallado (arquitectura, firmas de interfaces, patterns) vive en skills.

## Knowledge sources

Para contenido detallado, carga el skill correspondiente:

| Skill                          | CuÃ¡ndo                                                                   |
| ------------------------------ | ------------------------------------------------------------------------ |
| `skill-agent-toolkit`          | Arquitectura SDK, 3 interfaces, Setup Codeunit, ConfigurationDialog, Install/Upgrade, project structure |
| `skill-agent-task-patterns`    | Public API, Agent Task Builder, attachments, multi-turn, session detection, API availability por runtime |
| `skill-agent-instructions`     | Redactar `InstructionsV1.txt` (framework RGI + keywords)                 |

## Non-negotiable rules

1. **Public API es el entry point estÃ¡ndar** â€” toda creaciÃ³n de tasks pasa por un codeunit `Access = Public`; el resto de patterns (page action, event subscriber, multi-turn) llama por aquÃ.
2. **TryFunction obligatorio en event-driven task creation** â€” nunca se bloquea un posting/release/approval por un fallo del agente.
3. **Filtrar antes de crear** â€” la condiciÃ³n de negocio se evalÃºa ANTES del `Create()` del task builder, nunca dentro.
4. **TelemetrÃa en cada fallo** â€” `Session.LogMessage` con categorÃa y `GetLastErrorText()`. Sin excepciÃ³n.
5. **ExternalId con convenciÃ³n `{PREFIX}-{No.}`** â€” `SO-1001`, `LEAD-001`, `INV-103456`, `EMAIL-{threadId}`. Nunca GUID, nunca nÃºmero correlativo.
6. **Mensaje del task contiene TODO el contexto** â€” el agente solo sabe lo que se le pasa por el mensaje + adjuntos.
7. **Agent Task Message Builder** se usa para attachments y para controlar sanitizaciÃ³n; nunca se manipulan campos del builder por reflexiÃ³n.
8. **Instrucciones en inglÃ©s** â€” los safeguards del runtime estÃ¡n optimizados para inglÃ©s.

## Naming conventions

| Objeto                       | PatrÃ³n                                                      |
| ---------------------------- | ----------------------------------------------------------- |
| Copilot Capability EnumExt   | `"{Agent} Copilot Capability"` extends `"Copilot Capability"` |
| Metadata Provider EnumExt    | `"{Agent} Metadata Provider"` extends `"Agent Metadata Provider"` |
| Factory codeunit             | `{Agent}Factory` implements `IAgentFactory`                 |
| Metadata codeunit            | `{Agent}Metadata` implements `IAgentMetadata`               |
| Task Execution codeunit      | `{Agent}TaskExecution` implements `IAgentTaskExecution`     |
| Setup codeunit               | `"{Agent} Setup"` â€” lÃ³gica centralizada                     |
| Install codeunit             | `"{Agent} Install"` (Subtype = Install)                     |
| Upgrade codeunit             | `"{Agent} Upgrade"` (Subtype = Upgrade)                     |
| Public API codeunit          | `"{Agent} Public API"` (Access = Public) + Impl internal    |
| Setup table                  | `"{Agent} Setup"` (PK = `"User Security ID": Guid`)         |
| KPI table / page             | `"{Agent} KPI"` / CardPart                                  |
| Setup page                   | `"{Agent} Setup"` (PageType = ConfigurationDialog)          |
| Profile / RoleCenter         | `"{Agent} Profile"` / `"{Agent} Role Center"`               |
| PermissionSet                | `"{Agent}"` (Assignable, incluye D365 BASIC)                |

## ConfigurationDialog page â€” invariantes

`PageType = ConfigurationDialog` exige:

- `SourceTableTemporary = true`
- `Extensible = false`
- `InherentEntitlements = X` + `InherentPermissions = X`
- Primer elemento del layout: `part(AgentSetupPart; "Agent Setup Part")`
- `OnOpenPage` comprueba `AzureOpenAI.IsEnabled(<capability>)`
- `OnQueryClosePage` delega en el Setup Codeunit
- System actions: `OK` (gated por `IsUpdated`) + `Cancel`, sin custom triggers

## Project structure (referencia)

```
app/
â”œâ”€â”€ .resources/Instructions/InstructionsV1.txt
â”œâ”€â”€ Example/        (PageExt + PublicAPI + Impl)
â”œâ”€â”€ Integration/    (CopilotCapability EnumExt + Install + Upgrade)
â””â”€â”€ Setup/
    â”œâ”€â”€ {Agent}Setup.{Codeunit,Page,Table}.al
    â”œâ”€â”€ KPI/
    â”œâ”€â”€ Metadata/   (Factory + Metadata + MetadataProvider EnumExt)
    â”œâ”€â”€ Permissions/
    â”œâ”€â”€ Profile/    (Profile + RoleCenter + PageCustomizations)
    â””â”€â”€ TaskExecution/
```

Detalle de cada carpeta y ejemplos completos en `skill-agent-toolkit`.
