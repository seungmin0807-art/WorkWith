# ═══════════════════════════════════════════════════════════════
#  Workin · iOS 앱 빌드 셋업 스크립트 (Windows)
#  실행: PowerShell에서  .\setup_ios.ps1
# ═══════════════════════════════════════════════════════════════

$ErrorActionPreference = "SilentlyContinue"

function Write-Header($msg) {
    Write-Host ""
    Write-Host "  ══════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "   $msg" -ForegroundColor Cyan
    Write-Host "  ══════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step($n, $msg) {
    Write-Host "  [$n] $msg" -ForegroundColor White
}

function Write-Ok($msg)   { Write-Host "  ✅  $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  ⚠️   $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "  ❌  $msg" -ForegroundColor Red }
function Write-Info($msg) { Write-Host "  ℹ️   $msg" -ForegroundColor Gray }

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Header "Workin iOS 빌드 셋업 — Windows LG Gram"

# ── STEP 1: Node.js 확인 ─────────────────────────────────────
Write-Step "1/5" "Node.js 설치 확인"

$nodeVer = node --version 2>$null
if ($nodeVer) {
    Write-Ok "Node.js $nodeVer 감지됨"
} else {
    Write-Fail "Node.js가 설치되지 않았습니다"
    Write-Host ""
    Write-Host "  👉 지금 바로 설치하세요:" -ForegroundColor Yellow
    Write-Host "     https://nodejs.org  →  LTS 버전 다운로드 후 설치" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  설치 완료 후 PowerShell을 다시 열고 .\setup_ios.ps1 재실행" -ForegroundColor Gray
    exit 1
}

$npmVer = npm --version 2>$null
if ($npmVer) { Write-Ok "npm $npmVer 감지됨" }

# ── STEP 2: Git 확인 ─────────────────────────────────────────
Write-Step "2/5" "Git 설치 확인"

$gitVer = git --version 2>$null
if ($gitVer) {
    Write-Ok "$gitVer 감지됨"
} else {
    Write-Fail "Git이 설치되지 않았습니다"
    Write-Host ""
    Write-Host "  👉 설치: https://git-scm.com/download/win" -ForegroundColor Yellow
    Write-Host "  설치 후 PowerShell 재시작 → 스크립트 재실행" -ForegroundColor Gray
    exit 1
}

# ── STEP 3: npm install ──────────────────────────────────────
Write-Step "3/5" "Capacitor 패키지 설치 (npm install)"

Set-Location $root
npm install --silent
if ($LASTEXITCODE -eq 0) {
    Write-Ok "패키지 설치 완료 (node_modules/)"
} else {
    Write-Fail "npm install 실패"
    exit 1
}

# ── STEP 4: GitHub 저장소 설정 ──────────────────────────────
Write-Step "4/5" "GitHub 저장소 설정"
Write-Host ""

$gitInit = Test-Path (Join-Path $root ".git")
if (-not $gitInit) {
    Write-Info "git 저장소 초기화 중..."
    git init -b main
    Write-Ok "git 저장소 생성됨"
} else {
    Write-Ok "이미 git 저장소입니다"
}

git add -A
git commit -m "chore: Capacitor iOS 빌드 셋업" 2>$null

Write-Host ""
Write-Host "  ┌─────────────────────────────────────────────────────┐" -ForegroundColor Yellow
Write-Host "  │  지금 GitHub에서 새 저장소를 만들어야 합니다        │" -ForegroundColor Yellow
Write-Host "  └─────────────────────────────────────────────────────┘" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1) https://github.com/new 접속" -ForegroundColor White
Write-Host "  2) Repository name: workin-squat-coach" -ForegroundColor White
Write-Host "  3) Private 선택 → Create repository" -ForegroundColor White
Write-Host "  4) 아래 명령어를 복사해서 여기 붙여넣기:" -ForegroundColor White
Write-Host ""
Write-Host "     git remote add origin https://github.com/YOUR_USERNAME/workin-squat-coach.git" -ForegroundColor Cyan
Write-Host "     git push -u origin main" -ForegroundColor Cyan
Write-Host ""
Write-Host "  (YOUR_USERNAME을 본인 GitHub 아이디로 바꾸세요)" -ForegroundColor Gray
Write-Host ""

$pushed = Read-Host "  GitHub push 완료됐나요? (y/n)"
if ($pushed -ne "y") {
    Write-Warn "GitHub push 후 다음 단계를 진행하세요"
    Write-Info "스크립트 재실행 없이 아래 STEP 5 안내를 따르세요"
}

# ── STEP 5: Codemagic + Sideloadly 안내 ─────────────────────
Write-Step "5/5" "Codemagic 및 Sideloadly 설정 안내"

Write-Host ""
Write-Host "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  [A] Codemagic 설정 (브라우저, 5분)" -ForegroundColor Cyan
Write-Host "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1) https://codemagic.io  →  GitHub 계정으로 로그인" -ForegroundColor White
Write-Host "  2) 'Add application' → GitHub 선택 → workin-squat-coach 선택" -ForegroundColor White
Write-Host "  3) 'YAML 설정 사용' 선택 (codemagic.yaml 자동 감지됨)" -ForegroundColor White
Write-Host "  4) Environment variables 탭에서 아래 변수 추가:" -ForegroundColor White
Write-Host ""
Write-Host "     APPLE_ID              → 본인 Apple ID 이메일" -ForegroundColor Yellow
Write-Host "     APPLE_ID_PASSWORD     → 앱 전용 비밀번호*" -ForegroundColor Yellow
Write-Host "     DEVICE_UDID           → 아이폰 UDID**" -ForegroundColor Yellow
Write-Host ""
Write-Host "  * appleid.apple.com → 로그인 → '앱 전용 암호' → 생성" -ForegroundColor Gray
Write-Host "  ** iTunes 연결 후: 장치 정보 화면에서 일련번호 클릭 → UDID 표시" -ForegroundColor Gray
Write-Host "     또는 3uTools 설치: https://www.3u.com" -ForegroundColor Gray
Write-Host ""
Write-Host "  5) 'Start new build' 클릭 → 10~15분 기다리면 .ipa 완성" -ForegroundColor White
Write-Host "  6) Artifacts 탭에서 Workin.ipa 다운로드" -ForegroundColor White
Write-Host ""
Write-Host "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  [B] Sideloadly로 아이폰에 설치 (USB, 3분)" -ForegroundColor Cyan
Write-Host "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1) https://sideloadly.io  →  Windows 버전 다운로드 & 설치" -ForegroundColor White
Write-Host "  2) iTunes 설치 필요: https://www.apple.com/itunes/" -ForegroundColor White
Write-Host "  3) 아이폰을 USB로 PC에 연결" -ForegroundColor White
Write-Host "  4) Sideloadly 실행 → .ipa 파일 드래그 앤 드롭" -ForegroundColor White
Write-Host "  5) Apple ID 입력 → Start 클릭" -ForegroundColor White
Write-Host "  6) 아이폰: 설정 → 일반 → VPN 및 기기 관리 → 개발자 앱 → 신뢰" -ForegroundColor White
Write-Host ""
Write-Host "  ⚠️  앱은 7일 후 만료됩니다 (경진대회 전날 재설치 권장)" -ForegroundColor Yellow
Write-Host ""
Write-Host "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  셋업 완료! 궁금한 점은 Claude에게 물어보세요 :)" -ForegroundColor Green
Write-Host "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
