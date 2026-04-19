# ═══════════════════════════════════════════════════════════
#  Workin · Squat Coach — Mobile Dev Server
#  Windows(LG Gram) → iPhone 접속용
#
#  사용법: PowerShell에서  .\run_mobile.ps1
#  아이폰에서: Safari로 출력된 주소 접속 → 공유 → 홈 화면에 추가
# ═══════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"
$root   = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $root ".venv\Scripts\python.exe"
$port   = 8000

if (-not (Test-Path $python)) {
    Write-Error "Python venv not found at: $python`nPlease run .\run.ps1 first to set up the environment."
    exit 1
}

# ── 로컬 Wi-Fi IP 자동 감지 ──────────────────────────────────
$localIP = (
    Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notmatch "^(127\.|169\.254\.)" } |
    Sort-Object -Property PrefixLength |
    Select-Object -First 1
).IPAddress

if (-not $localIP) {
    Write-Warning "Wi-Fi IP를 찾지 못했습니다. 아이폰과 같은 네트워크에 연결됐는지 확인하세요."
    $localIP = "YOUR_PC_IP"
}

$url = "http://$($localIP):$port"

# ── 안내 출력 ────────────────────────────────────────────────
Write-Host ""
Write-Host "  ┌─────────────────────────────────────────────┐" -ForegroundColor Cyan
Write-Host "  │  Workin · Squat Coach — Mobile Dev Server  │" -ForegroundColor Cyan
Write-Host "  └─────────────────────────────────────────────┘" -ForegroundColor Cyan
Write-Host ""
Write-Host "  📱 아이폰 접속 주소:" -ForegroundColor White
Write-Host "     $url" -ForegroundColor Yellow
Write-Host ""
Write-Host "  ① 아이폰을 이 PC와 같은 Wi-Fi에 연결하세요" -ForegroundColor Gray
Write-Host "  ② Safari에서 위 주소를 입력하세요" -ForegroundColor Gray
Write-Host "  ③ 하단 공유버튼(□↑) → '홈 화면에 추가' 탭하세요" -ForegroundColor Gray
Write-Host "  ④ 홈 화면 Workin 아이콘을 열면 앱처럼 실행됩니다!" -ForegroundColor Gray
Write-Host ""
Write-Host "  서버를 종료하려면 Ctrl+C를 누르세요" -ForegroundColor DarkGray
Write-Host ""

# ── QR 코드 텍스트 렌더 (Python) ────────────────────────────
$qrScript = @"
try:
    import qrcode, sys
    qr = qrcode.QRCode(border=1)
    qr.add_data('$url')
    qr.make(fit=True)
    qr.print_ascii(invert=True)
except ImportError:
    pass  # qrcode not installed — skip silently
"@

& $python -c $qrScript 2>$null

# ── 서버 시작 (0.0.0.0 = 모든 네트워크 인터페이스) ──────────
& $python (Join-Path $root "scripts\serve.py") `
    --root (Join-Path $root "app") `
    --host 0.0.0.0 `
    --port $port
