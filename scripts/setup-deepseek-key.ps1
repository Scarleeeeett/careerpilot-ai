$ErrorActionPreference = "Stop"

$key = Read-Host "Enter your DeepSeek API Key"
if ([string]::IsNullOrWhiteSpace($key)) {
  Write-Host "No API key entered. Canceled."
  exit 1
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot ".env"
$content = @(
  "AI_PROVIDER=deepseek",
  "DEEPSEEK_API_KEY=$key",
  "DEEPSEEK_MODEL=deepseek-v4-flash",
  "HTTPS_PROXY=http://127.0.0.1:7890",
  "HTTP_PROXY=http://127.0.0.1:7890"
)

$content | Set-Content -Path $envPath -Encoding UTF8

Write-Host ".env written to: $envPath"
Write-Host "Now run: npm start"
