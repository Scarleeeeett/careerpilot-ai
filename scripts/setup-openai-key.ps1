$ErrorActionPreference = "Stop"

$key = Read-Host "Enter your OpenAI API Key"
if ([string]::IsNullOrWhiteSpace($key)) {
  Write-Host "No API key entered. Canceled."
  exit 1
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot ".env"
$content = @(
  "OPENAI_API_KEY=$key",
  "OPENAI_MODEL=gpt-4o-mini",
  "HTTPS_PROXY=http://127.0.0.1:7890",
  "HTTP_PROXY=http://127.0.0.1:7890"
)

$content | Set-Content -Path $envPath -Encoding UTF8

Write-Host ".env written to: $envPath"
Write-Host "Now run: npm start"
