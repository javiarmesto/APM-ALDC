# Install-Scaffold.ps1
# Instala .github/tools, docs y plans en el proyecto consumidor
# Ejecutar con: apm run scaffold

# El script vive en .agents/skills/github-scaffold/scripts/
# $PSScriptRoot ya ES la carpeta scripts/ — tools/, docs/ y plans/ están aquí mismo
$SkillScripts = $PSScriptRoot

# Buscar raiz del proyecto (donde vive apm.yml o .git)
$ProjectRoot = Get-Location
if (Test-Path (Join-Path $ProjectRoot "apm.yml")) {
    # ok, estamos en la raiz
} elseif (Test-Path (Join-Path $ProjectRoot ".git")) {
    # ok
} else {
    # subir un nivel
    $ProjectRoot = Split-Path $ProjectRoot -Parent
}

$GithubDest = Join-Path $ProjectRoot ".github"
New-Item -ItemType Directory -Force $GithubDest | Out-Null

$folders = @{
    "tools" = $false   # no sobreescribir (el dev puede haberlo tocado)
    "docs"  = $true    # siempre actualizar (plantillas de referencia)
    "plans" = $true    # siempre actualizar
}

foreach ($folder in $folders.Keys) {
    $src  = Join-Path $SkillScripts $folder
    $dest = Join-Path $GithubDest   $folder

    # tools: no sobreescribir si ya existe
    if ($folders[$folder] -eq $false -and (Test-Path $dest)) {
        Write-Host "~ .github/$folder/ ya existe, omitido"
        continue
    }

    # Crear siempre el directorio destino
    New-Item -ItemType Directory -Force $dest | Out-Null

    # Copiar contenido si existe en el skill (puede estar vacío, como plans/)
    if (Test-Path $src) {
        $items = Get-ChildItem $src -Exclude ".gitkeep" -ErrorAction SilentlyContinue
        if ($items) {
            Copy-Item "$src\*" $dest -Recurse -Force -Exclude ".gitkeep"
        }
    }
    Write-Host "✓ .github/$folder/ instalado/actualizado"
}

Write-Host ""
Write-Host "Scaffold .github completado. Ejecuta 'git status' para ver los cambios."
