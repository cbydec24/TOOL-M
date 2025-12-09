# toolssh_handler.ps1
# Handler for toolssh:// URLs. Usage example: toolssh://user@host:22?pw=secret
# This script will parse the URL and attempt to launch PuTTY if installed.
param([string]$url)

function UrlDecode([string]$s) {
    return [System.Uri]::UnescapeDataString($s)
}

if (-not $url) { Write-Error "No URL supplied"; exit 1 }

# Remove surrounding quotes if present
$url = $url.Trim('"')

try {
    $u = [System.Uri] $url
} catch {
    Write-Error "Invalid URL: $url"
    exit 1
}

$host = $u.Host
$port = if ($u.Port -ne -1) { $u.Port } else { 22 }
$user = $u.UserInfo.Split(':')[0]

# parse query for pw
$pw = $null
if ($u.Query) {
    $q = $u.Query.TrimStart('?') -split '&' | ForEach-Object {
        $parts = $_ -split '='; @{$parts[0] = if ($parts.Length -gt 1) { UrlDecode($parts[1]) } else { '' }}
    }
    foreach ($kv in $q) { foreach ($k in $kv.Keys) { if ($k -eq 'pw') { $pw = $kv[$k] } } }
}

# Prefer PuTTY if present
$putty = "$env:ProgramFiles\PuTTY\putty.exe"
if (-not (Test-Path $putty)) { $putty = "$env:ProgramFiles(x86)\PuTTY\putty.exe" }

if (Test-Path $putty) {
    $args = "-ssh $user@$host -P $port"
    if ($pw) { $args += " -pw `"$pw`"" }
    Start-Process -FilePath $putty -ArgumentList $args
    exit 0
}

# Fallback: try Windows built-in ssh client
try {
    $sshCmd = "ssh $user@$host -p $port"
    if ($pw) {
        # Windows ssh doesn't accept password on command-line; warn user
        Write-Host "Password provided but cannot auto-send to OpenSSH. Use PuTTY or run manually: $sshCmd"
    }
    Start-Process -FilePath "ssh" -ArgumentList "$user@$host -p $port"
    exit 0
} catch {
    Write-Error "Failed to launch SSH client. Install PuTTY or ensure 'ssh' is in PATH."
    exit 1
}
