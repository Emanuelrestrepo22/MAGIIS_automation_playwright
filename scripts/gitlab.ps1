# gitlab.ps1 - CLI helper para operar contra GitLab API usando el token del .mcp.json
# Uso:
#   .\scripts\gitlab.ps1 <comando> [args]
# Comandos:
#   whoami                 -> usuario autenticado
#   repo-info              -> datos del proyecto actual
#   my-projects            -> repos accesibles con el token
#   mr-list                -> MRs abiertos del proyecto actual
#   mr-list-all            -> todos los MRs (opened, merged, closed)
#   mr-view <iid>          -> detalle de un MR
#   mr-comment <iid> <txt>          -> comenta en un MR (requiere scope api)
#   mr-comment-delete <iid> <nid>   -> borra un comentario (requiere api)
#   mr-create <target> [titulo]     -> crea MR de la rama actual hacia <target> (auto-push si falta)

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$Command,

    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Rest
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$mcpPath  = Join-Path $repoRoot '.mcp.json'

if (-not (Test-Path $mcpPath)) {
    Write-Error ".mcp.json no encontrado en $repoRoot"
    exit 1
}

$mcp = Get-Content -Raw $mcpPath | ConvertFrom-Json
$token = $mcp.mcpServers.gitlab.env.GITLAB_PERSONAL_ACCESS_TOKEN
if (-not $token -or $token -notmatch '^glpat-') {
    Write-Error "Token invalido o ausente en .mcp.json (GITLAB_PERSONAL_ACCESS_TOKEN)"
    exit 1
}

$projectPath = 'repo.magiis/magiis-testing'
$projectEnc  = [Uri]::EscapeDataString($projectPath)
$apiBase     = 'https://gitlab.com/api/v4'
$headers     = @{ 'PRIVATE-TOKEN' = $token }

function Invoke-GitLab {
    param([string]$Path, [string]$Method = 'GET', $Body = $null)
    $uri = "$apiBase/$Path"
    $params = @{ Uri = $uri; Headers = $headers; Method = $Method; ContentType = 'application/json' }
    if ($Body) { $params.Body = ($Body | ConvertTo-Json -Depth 5) }
    try {
        Invoke-RestMethod @params
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        $msg  = $_.ErrorDetails.Message
        Write-Host "[HTTP $code] $msg" -ForegroundColor Red
        exit 1
    }
}

switch ($Command) {
    'whoami' {
        $u = Invoke-GitLab 'user'
        Write-Host "Logged in as: $($u.username) ($($u.name)) id=$($u.id)" -ForegroundColor Green
    }

    'repo-info' {
        $p = Invoke-GitLab "projects/$projectEnc"
        Write-Host "Project: $($p.path_with_namespace)" -ForegroundColor Cyan
        Write-Host "  id          : $($p.id)"
        Write-Host "  default     : $($p.default_branch)"
        Write-Host "  visibility  : $($p.visibility)"
        Write-Host "  web_url     : $($p.web_url)"
    }

    'my-projects' {
        $list = Invoke-GitLab 'projects?membership=true&per_page=20&order_by=last_activity_at'
        $list | Select-Object path_with_namespace, visibility, default_branch | Format-Table -AutoSize
    }

    'mr-list' {
        $qs = 'merge_requests?state=opened' + [char]38 + 'order_by=updated_at'
        $list = Invoke-GitLab "projects/$projectEnc/$qs"
        if (-not $list -or $list.Count -eq 0) {
            Write-Host "No hay MRs abiertos." -ForegroundColor Yellow
            return
        }
        foreach ($m in $list) {
            Write-Host ("!{0}  [{1} -> {2}]  {3}" -f $m.iid, $m.source_branch, $m.target_branch, $m.title) -ForegroundColor Cyan
            Write-Host ("       {0}" -f $m.web_url) -ForegroundColor DarkGray
        }
    }

    'mr-list-all' {
        $qs = 'merge_requests?per_page=20' + [char]38 + 'order_by=updated_at'
        $list = Invoke-GitLab "projects/$projectEnc/$qs"
        foreach ($m in $list) {
            $color = switch ($m.state) { 'opened' { 'Green' } 'merged' { 'Magenta' } 'closed' { 'DarkGray' } default { 'White' } }
            Write-Host ("!{0,-4} [{1,-7}] {2}" -f $m.iid, $m.state, $m.title) -ForegroundColor $color
        }
    }

    'mr-view' {
        if (-not $Rest -or $Rest.Count -eq 0) { Write-Error 'Uso: mr-view <iid>'; exit 1 }
        $iid = $Rest[0]
        $m = Invoke-GitLab "projects/$projectEnc/merge_requests/$iid"
        Write-Host "!$($m.iid) - $($m.title)" -ForegroundColor Cyan
        Write-Host "  state        : $($m.state)"
        Write-Host "  source       : $($m.source_branch)"
        Write-Host "  target       : $($m.target_branch)"
        Write-Host "  merge_status : $($m.merge_status)"
        Write-Host "  author       : $($m.author.username)"
        Write-Host "  created      : $($m.created_at)"
        Write-Host "  updated      : $($m.updated_at)"
        Write-Host "  web_url      : $($m.web_url)"
        if ($m.description) {
            Write-Host "`n--- Description ---"
            Write-Host $m.description
        }
    }

    'mr-comment' {
        if ($Rest.Count -lt 2) { Write-Error 'Uso: mr-comment <iid> "<texto>"'; exit 1 }
        $iid = $Rest[0]
        $body = $Rest[1..($Rest.Count-1)] -join ' '
        $r = Invoke-GitLab "projects/$projectEnc/merge_requests/$iid/notes" -Method POST -Body @{ body = $body }
        Write-Host "Comment posted: id=$($r.id)" -ForegroundColor Green
    }

    'mr-create' {
        if ($Rest.Count -lt 1) { Write-Error 'Uso: mr-create <target-branch> [titulo]'; exit 1 }
        $target = $Rest[0]
        $source = (git rev-parse --abbrev-ref HEAD).Trim()
        $title  = if ($Rest.Count -ge 2) { $Rest[1..($Rest.Count-1)] -join ' ' } else { (git log -1 --pretty=%s).Trim() }
        $remoteRefs = git ls-remote --heads gitlab $source 2>$null
        if (-not $remoteRefs) {
            Write-Host "Source branch '$source' no existe en gitlab remote. Pusheando..." -ForegroundColor Yellow
            git push gitlab $source
            if ($LASTEXITCODE -ne 0) { Write-Error "Fallo el push de '$source'"; exit 1 }
        }
        $existing = Invoke-GitLab "projects/$projectEnc/merge_requests?state=opened&source_branch=$source&target_branch=$target"
        if ($existing -and $existing.Count -gt 0) {
            $m = $existing[0]
            Write-Host "MR ya existe para $source -> $target : !$($m.iid)" -ForegroundColor Yellow
            Write-Host "  $($m.web_url)" -ForegroundColor DarkGray
            return
        }
        $body = @{ source_branch = $source; target_branch = $target; title = $title; remove_source_branch = $false }
        $r = Invoke-GitLab "projects/$projectEnc/merge_requests" -Method POST -Body $body
        Write-Host "MR !$($r.iid) creado: $($r.web_url)" -ForegroundColor Green
    }

    'mr-comment-delete' {
        if ($Rest.Count -lt 2) { Write-Error 'Uso: mr-comment-delete <iid> <note-id>'; exit 1 }
        $iid = $Rest[0]
        $nid = $Rest[1]
        Invoke-GitLab "projects/$projectEnc/merge_requests/$iid/notes/$nid" -Method DELETE | Out-Null
        Write-Host "Comment $nid eliminado del MR !$iid" -ForegroundColor Green
    }

    default {
        Write-Host "Comando desconocido: $Command" -ForegroundColor Red
        Write-Host ""
        Write-Host "Comandos disponibles:"
        Write-Host "  whoami        -> usuario autenticado"
        Write-Host "  repo-info     -> info del proyecto"
        Write-Host "  my-projects   -> repos accesibles"
        Write-Host "  mr-list       -> MRs abiertos"
        Write-Host "  mr-list-all   -> todos los MRs"
        Write-Host "  mr-view <iid> -> detalle MR"
        Write-Host "  mr-comment <iid> <txt>             -> comentar (scope api)"
        Write-Host "  mr-comment-delete <iid> <note-id>  -> borrar comentario (api)"
        Write-Host "  mr-create <target> [titulo]        -> crear MR + auto-push (api)"
        exit 1
    }
}
