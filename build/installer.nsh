; electron-builder가 NSIS 설치 파일에 넣는 스크립트 (package.json build.nsis.include)
; 늘 지금 사용자로만 설치: "모든 사용자 / 전용" 고르는 화면을 없앰 (2026-11-05 사용자 "하나로만").
; 모든 사용자로 설치하면 관리자 권한이 필요하고 자동 업데이트도 권한을 물어서 펫에는 필요 없음
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend
