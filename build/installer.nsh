; NSIS include for the installer (package.json build.nsis.include).
; Always install for the current user: skips the "all users / only me" page (user request 2026-11-05).
; Keep this file ASCII only: UTF-8 Korean comments made the installer crash at start (System.dll 0xC0000005).
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend
