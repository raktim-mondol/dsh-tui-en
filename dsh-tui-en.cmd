@echo off
rem dsh-tui-en: launch dsh-TUI through the official dsh CLI profile boot.
rem Equivalent to: dsh --profile dsh-tui <args>
rem   --resume: read ~/.dsh-tui/resume.txt (legacy ~/.dsh-cc/resume.txt as
rem             fallback) and feed it to the TUI as DSH_TUI_RESUME_SESSION —
rem             dual-written as DSH_CC_RESUME_SESSION for pre-rename TUI
rem             builds (the TUI writes the chosen session id there on
rem             /resume; see src/sessionHistory.ts, issue #120).
rem Prereq: dsh CLI on PATH (npm install -g @deepseek-ai/dsh). The profile
rem         is created by `dsh plugin --profile dsh-tui add @deepseek-harness-tui/dsh-tui`
rem         under $DSH_HOME/profiles/dsh-tui (default ~/.dsh), so this
rem         launcher must NOT pin DSH_HOME.
rem NODE_ENV defaults to production: the React renderer's development build
rem records unbounded performance.measure() entries and OOMs long sessions.
rem WORKSPACE: working directory (defaults to the current directory; override with DSH_TUI_WORKSPACE).
setlocal
if not defined NODE_ENV set "NODE_ENV=production"
set "WORKSPACE=%DSH_TUI_WORKSPACE%"
if "%WORKSPACE%"=="" set "WORKSPACE=%CD%"
cd /d "%WORKSPACE%"

where dsh >nul 2>nul
if errorlevel 1 (
  echo [dsh-tui-en] dsh CLI not found. Install it first: npm install -g @deepseek-ai/dsh 1>&2
  exit /b 1
)

set "ARGS="
:parse
if "%~1"=="" goto :run
if /i "%~1"=="--resume" (
  if exist "%USERPROFILE%\.dsh-tui\resume.txt" (
    set /p DSH_TUI_RESUME_SESSION=<"%USERPROFILE%\.dsh-tui\resume.txt"
  ) else if exist "%USERPROFILE%\.dsh-cc\resume.txt" (
    set /p DSH_TUI_RESUME_SESSION=<"%USERPROFILE%\.dsh-cc\resume.txt"
  )
  if defined DSH_TUI_RESUME_SESSION set "DSH_CC_RESUME_SESSION=%DSH_TUI_RESUME_SESSION%"
) else (
  set "ARGS=%ARGS% "%~1""
)
shift
goto :parse

:run
@dsh --profile dsh-tui %ARGS%
endlocal
