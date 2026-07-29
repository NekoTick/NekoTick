param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath
)

$ErrorActionPreference = 'Stop'
$installer = (Get-Item $InstallerPath).FullName
$installDir = Join-Path $env:RUNNER_TEMP 'vlaina-installer-smoke'
$appPath = Join-Path $installDir 'vlaina.exe'
$uninstallRegistryPath = 'Software\Microsoft\Windows\CurrentVersion\Uninstall'
$sentinelPath = Join-Path $env:APPDATA "vlaina\installer-smoke-$([Guid]::NewGuid().ToString('N')).txt"
$appProcess = $null

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class NativeWindow {
  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);
}
"@

function Invoke-Installer {
  param(
    [string[]]$Arguments,
    [int]$ExpectedExitCode = 0
  )

  $process = Start-Process -FilePath $installer -ArgumentList $Arguments -PassThru
  if (-not $process.WaitForExit(120000)) {
    Stop-Process -Id $process.Id -Force
    throw 'Installer did not finish within 120 seconds.'
  }
  if ($process.ExitCode -ne $ExpectedExitCode) {
    throw "Installer exited with code $($process.ExitCode); expected $ExpectedExitCode."
  }
}

function Get-VlainaRegistrations {
  param([ValidateSet('CurrentUser', 'LocalMachine')][string]$Hive)

  $registryRoot = if ($Hive -eq 'CurrentUser') {
    "Registry::HKEY_CURRENT_USER\$uninstallRegistryPath"
  } else {
    "Registry::HKEY_LOCAL_MACHINE\$uninstallRegistryPath"
  }

  @(
    Get-ChildItem -Path $registryRoot -ErrorAction SilentlyContinue |
      Get-ItemProperty |
      Where-Object { $_.DisplayName -eq 'vlaina' }
  )
}

function Assert-CurrentUserRegistration {
  $perUserRegistrations = @(Get-VlainaRegistrations -Hive CurrentUser)
  if ($perUserRegistrations.Count -ne 1) {
    throw "Expected one current-user registration; found $($perUserRegistrations.Count)."
  }
  if ($perUserRegistrations[0].InstallLocation.TrimEnd('\') -ne $installDir.TrimEnd('\')) {
    throw 'Current-user registration did not preserve the expected installation directory.'
  }

  $perMachineRegistrations = @(Get-VlainaRegistrations -Hive LocalMachine)
  if ($perMachineRegistrations.Count -ne 0) {
    throw 'Installer unexpectedly registered vlaina for all users.'
  }

  $perUserRegistrations[0]
}

function Start-ResponsiveApp {
  $process = Start-Process -FilePath $appPath -PassThru
  $deadline = [DateTime]::UtcNow.AddSeconds(30)

  try {
    while ([DateTime]::UtcNow -lt $deadline) {
      Start-Sleep -Milliseconds 500
      $process.Refresh()
      if ($process.HasExited) {
        throw "Installed application exited with code $($process.ExitCode) before showing a window."
      }

      if (
        $process.MainWindowHandle -ne [IntPtr]::Zero -and
        [NativeWindow]::IsWindowVisible($process.MainWindowHandle) -and
        $process.Responding
      ) {
        return $process
      }
    }

    throw 'Installed application did not show a responsive window within 30 seconds.'
  } catch {
    Stop-AppProcessTree -Process $process
    throw
  }
}

function Stop-AppProcessTree {
  param([System.Diagnostics.Process]$Process)

  if ($null -eq $Process -or $Process.HasExited) {
    return
  }

  $stop = Start-Process -FilePath taskkill.exe -ArgumentList @(
    '/PID',
    $Process.Id,
    '/T',
    '/F'
  ) -Wait -PassThru
  if ($stop.ExitCode -ne 0) {
    Write-Warning "Unable to stop the smoke-test process tree (exit code $($stop.ExitCode))."
  }
}

$existingRegistrations = @(
  @(Get-VlainaRegistrations -Hive CurrentUser)
  @(Get-VlainaRegistrations -Hive LocalMachine)
)
if ($existingRegistrations.Count -ne 0) {
  throw 'Windows installer smoke test requires a machine without an existing vlaina installation.'
}

try {
  Invoke-Installer -Arguments @('/S', '/allusers', "/D=$installDir")
  if (-not (Test-Path $appPath -PathType Leaf)) {
    throw "Installed application was not found at $appPath."
  }

  $registration = Assert-CurrentUserRegistration
  $packagedVersion = $registration.DisplayVersion
  if ([string]::IsNullOrWhiteSpace($packagedVersion)) {
    throw 'Installer registration did not contain a display version.'
  }

  Set-ItemProperty -LiteralPath $registration.PSPath -Name DisplayVersion -Value '9999.0.0'
  Invoke-Installer -Arguments @('/S', '/allusers', "/D=$installDir") -ExpectedExitCode 1

  $registration = Assert-CurrentUserRegistration
  if ($registration.DisplayVersion -ne '9999.0.0') {
    throw 'Rejected downgrade changed the installed version registration.'
  }

  Set-ItemProperty -LiteralPath $registration.PSPath -Name DisplayVersion -Value '0.0.1'
  New-Item -ItemType Directory -Path (Split-Path $sentinelPath) -Force | Out-Null
  Set-Content -LiteralPath $sentinelPath -Value 'preserve during installer upgrade'

  $appProcess = Start-ResponsiveApp
  Invoke-Installer -Arguments @('/S', '/allusers', '--updated')
  $appProcess.Refresh()
  if (-not $appProcess.HasExited) {
    throw 'Upgrade installer did not close the running old application.'
  }
  $appProcess = $null

  if (-not (Test-Path $appPath -PathType Leaf)) {
    throw "Updated application was not found at $appPath."
  }

  $registration = Assert-CurrentUserRegistration
  if ($registration.InstallLocation.TrimEnd('\') -ne $installDir.TrimEnd('\')) {
    throw 'Upgrade changed the existing installation directory.'
  }
  if ($registration.DisplayVersion -ne $packagedVersion) {
    throw "Upgrade registered version $($registration.DisplayVersion); expected $packagedVersion."
  }
  if (-not (Test-Path $sentinelPath -PathType Leaf)) {
    throw 'Upgrade removed existing user data.'
  }

  $appProcess = Start-ResponsiveApp
} finally {
  Stop-AppProcessTree -Process $appProcess
  $appProcess = $null

  $uninstaller = Get-ChildItem -Path $installDir -Filter 'Uninstall *.exe' -File -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($null -ne $uninstaller) {
    $uninstall = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -PassThru
    if (-not $uninstall.WaitForExit(60000)) {
      Stop-Process -Id $uninstall.Id -Force
      Write-Warning 'Uninstaller did not finish within 60 seconds.'
    } elseif ($uninstall.ExitCode -ne 0) {
      Write-Warning "Uninstaller exited with code $($uninstall.ExitCode)."
    }
  }

  Remove-Item -LiteralPath $sentinelPath -Force -ErrorAction SilentlyContinue
}
