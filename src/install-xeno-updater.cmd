@echo off
mkdir "bin"
mkdir "bin\xeno-updater"

set parent=bin\xeno-updater
del /Q "%parent%\*"
for /d %%D in ("%parent%\*") do rmdir /S /Q "%%D"

xcopy "_install\*" "%parent%" /E /I /Y
rmdir /S /Q "_install"
pushd %parent%
call npm install
popd

del /Q "update-xeno.cmd"
echo @echo off >> "update-xeno.cmd"
echo node "%%~dp0\bin\xeno-updater\index.js" %%* >> "update-xeno.cmd"

@echo on
echo Xeno Updater installed properly and correctly.
pause