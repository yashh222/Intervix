$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Start-Process -FilePath 'python' -ArgumentList @('backend/app.py') -WorkingDirectory $root -WindowStyle Hidden
Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev') -WorkingDirectory (Join-Path $root 'frontend') -WindowStyle Hidden
Write-Host 'Backend: http://127.0.0.1:5000'
Write-Host 'Frontend: http://127.0.0.1:3000'
