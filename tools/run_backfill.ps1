param(
    [switch]$DryRun = $true,
    [int]$Limit = 100,
    [string]$Url = 'http://127.0.0.1:8000/topology/backfill'
)

try {
    $query = "?dry_run=$($DryRun.ToString().ToLower())&limit=$Limit"
    $full = "$Url$query"
    Write-Host "Calling: $full"
    $res = Invoke-RestMethod -Method Post -Uri $full -UseBasicParsing -ErrorAction Stop
    $res | ConvertTo-Json -Depth 6
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    exit 1
}
