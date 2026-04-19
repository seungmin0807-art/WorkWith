@echo off
chcp 65001 >nul
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║   Workin — GitHub Push 자동화            ║
echo  ╚══════════════════════════════════════════╝
echo.

cd /d "%~dp0"

:: Git 설치 확인
git --version >nul 2>&1
if errorlevel 1 (
    echo  [오류] Git이 설치되지 않았습니다.
    echo  설치: https://git-scm.com/download/win
    pause
    exit /b 1
)

:: 원격 저장소 확인
git remote -v >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [설정 필요] GitHub 저장소가 연결되지 않았습니다.
    echo.
    echo  1) https://github.com/new 에서 새 저장소 생성
    echo     이름: workin-squat-coach  /  Public 또는 Private
    echo.
    set /p REPO_URL="  저장소 URL 붙여넣기 (예: https://github.com/username/workin-squat-coach.git): "
    git init -b main
    git remote add origin %REPO_URL%
    echo  [완료] 원격 저장소 연결됨
)

echo  [1/3] 변경 파일 스테이징 중...
git add app/index.html app/styles.css app/manifest.json app/sw.js app/icons/ ^
        capacitor.config.json codemagic.yaml package.json ^
        run_mobile.ps1 setup_ios.ps1 .gitignore 로드맵.html 2>nul

echo  [2/3] 커밋 중...
git commit -m "feat: iOS Capacitor + Codemagic 빌드 셋업 및 UI 리디자인" 2>nul
if errorlevel 1 (
    echo  (커밋할 변경사항 없음 — 이미 최신 상태)
)

echo  [3/3] GitHub에 push 중...
git push -u origin main 2>&1
if errorlevel 1 (
    echo.
    echo  [오류] push 실패. GitHub 로그인이 필요할 수 있습니다.
    echo  Git Credential Manager가 자동으로 로그인 창을 열어줍니다.
    echo  로그인 후 이 파일을 다시 실행하세요.
    pause
    exit /b 1
)

echo.
echo  ══════════════════════════════════════════
echo   GitHub push 완료!
echo.
echo   다음 단계: Codemagic 빌드 시작
echo   https://codemagic.io 접속 후 Start Build 클릭
echo  ══════════════════════════════════════════
echo.
pause
