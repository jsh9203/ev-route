# .env 의 GIT_* / GITHUB_* 값을 읽어 이 저장소에만 Git 계정을 설정한다.
# 전역(--global) 설정은 건드리지 않는다.
# 사용법 (프로젝트 루트에서): pwsh ./scripts/setup-git.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env'
if (-not (Test-Path $envFile)) { throw ".env 파일이 없습니다. .env.example 을 복사해 값을 채워주세요." }

$vars = @{}
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$') { $vars[$Matches[1]] = $Matches[2] }
}
foreach ($k in 'GIT_USER_NAME', 'GIT_USER_EMAIL', 'GITHUB_USERNAME') {
    if (-not $vars[$k]) { throw ".env 에 $k 값이 비어 있습니다." }
}

Push-Location $root
try {
    if (-not (Test-Path (Join-Path $root '.git'))) { git init -b main | Out-Null }

    git config --local user.name  $vars['GIT_USER_NAME']
    git config --local user.email $vars['GIT_USER_EMAIL']
    # 자격증명을 계정·경로별로 분리 (전역 계정과 섞이지 않도록)
    git config --local credential.username $vars['GITHUB_USERNAME']
    git config --local credential.https://github.com.useHttpPath true

    if ($vars['GITHUB_REPO']) {
        $url = "https://$($vars['GITHUB_USERNAME'])@github.com/$($vars['GITHUB_USERNAME'])/$($vars['GITHUB_REPO']).git"
        if (git remote | Select-String -SimpleMatch -Quiet 'origin') { git remote set-url origin $url }
        else { git remote add origin $url }
    }

    Write-Host "적용된 local 설정:"
    git config --local --list | Select-String '^(user\.|credential\.|remote\.origin\.url)'
}
finally { Pop-Location }
