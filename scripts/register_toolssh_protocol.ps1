# register_toolssh_protocol.ps1
# Run this script locally (PowerShell as current user) to register the custom protocol handler `toolssh://`
# It will make `toolssh://user@host[:port]?pw=...` open with the provided handler script in this repo.

$repoPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
$handler = Join-Path $repoPath 'toolssh_handler.ps1'

$prog = "powershell.exe"
$cmd = "$prog -ExecutionPolicy Bypass -File `"$handler`" "%1""

# Create HKCU key for protocol
$base = 'HKCU:\Software\Classes\toolssh'
New-Item -Path $base -Force | Out-Null
Set-ItemProperty -Path $base -Name '(Default)' -Value 'URL:toolssh Protocol' -Force
Set-ItemProperty -Path $base -Name 'URL Protocol' -Value '' -Force

$cmdKey = Join-Path $base 'shell\open\command'
New-Item -Path $cmdKey -Force | Out-Null
Set-ItemProperty -Path $cmdKey -Name '(Default)' -Value $cmd -Force

Write-Host "Protocol 'toolssh:' registered for current user. Handler: $handler"
Write-Host "To remove, delete HKCU:\Software\Classes\toolssh key."