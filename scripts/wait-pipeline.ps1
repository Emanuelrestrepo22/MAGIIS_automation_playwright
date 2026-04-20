param([int64]$PipelineId, [int]$Iterations = 40, [int]$SleepSec = 30)
$mcp = Get-Content -Raw .mcp.json | ConvertFrom-Json
$token = $mcp.mcpServers.gitlab.env.GITLAB_PERSONAL_ACCESS_TOKEN
$headers = @{ 'PRIVATE-TOKEN' = $token }
$projectEnc = [Uri]::EscapeDataString('repo.magiis/magiis-testing')
for ($i = 1; $i -le $Iterations; $i++) {
  $p = Invoke-RestMethod -Uri "https://gitlab.com/api/v4/projects/$projectEnc/pipelines/$PipelineId" -Headers $headers
  $ts = Get-Date -Format "HH:mm:ss"
  Write-Output ("[{0}/{1} {2}] pipe={3} status={4} duration={5}s" -f $i, $Iterations, $ts, $PipelineId, $p.status, $p.duration)
  if ($p.status -in @('success', 'failed', 'canceled', 'skipped', 'manual')) {
    Write-Output ("TERMINAL status={0} url={1}" -f $p.status, $p.web_url)
    break
  }
  Start-Sleep -Seconds $SleepSec
}
