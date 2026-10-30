[CmdletBinding()]
param(
    [ValidateRange(60, 1800)]
    [int]$DownloadTimeoutSeconds = 600
)

# Server 2025 source published by Microsoft:
# https://learn.microsoft.com/en-us/windows-server/get-started/server-core-app-compatibility-feature-on-demand
# https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/features-on-demand-language-fod
# Run this script in a GitHub Actions step with timeout-minutes: 30.
# LimitAccess prevents DISM from falling back to Windows Update or WSUS.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$timer = [Diagnostics.Stopwatch]::StartNew()

function Write-ProgressMessage {
    param([string]$Message)
    Write-Host ('[{0:0.0}s] {1}' -f $timer.Elapsed.TotalSeconds, $Message)
}

function Get-RequiredCapability {
    param([string]$Name)
    $capabilityMatches = @(Get-WindowsCapability -Online -Name $Name -ErrorAction Stop)
    if ($capabilityMatches.Count -ne 1 -or $capabilityMatches[0].Name -ne $Name) {
        throw "Expected exactly one Windows capability named $Name."
    }
    return $capabilityMatches[0]
}

if (-not [Environment]::Is64BitProcess -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
    throw 'This installer requires native AMD64 Windows PowerShell. ARM64 and 32-bit hosts are not supported.'
}

$operatingSystem = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction Stop
if ([int]$operatingSystem.BuildNumber -ne 26100 -or [int]$operatingSystem.ProductType -eq 1) {
    throw ('This ISO is for Windows Server 2025 build 26100 only. Detected: {0}; build {1}; product type {2}. Use matching official media for this OS.' -f $operatingSystem.Caption, $operatingSystem.BuildNumber, $operatingSystem.ProductType)
}

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'An elevated administrator session is required to install Windows capabilities.'
}

$required = @(
    @{ Name = 'Language.Basic~~~zh-TW~0.0.1.0'; CabPattern = '*LanguageFeatures-Basic-zh-tw-Package*amd64*.cab' },
    @{ Name = 'Language.Fonts.Hant~~~und-HANT~0.0.1.0'; CabPattern = '*LanguageFeatures-Fonts-Hant-Package*amd64*.cab' },
    @{ Name = 'Language.OCR~~~zh-TW~0.0.1.0'; CabPattern = '*LanguageFeatures-OCR-zh-tw-Package*amd64*.cab' }
)

$missing = @()
foreach ($entry in $required) {
    $capability = Get-RequiredCapability -Name $entry.Name
    Write-ProgressMessage ('{0}: {1}' -f $capability.Name, $capability.State)
    if ($capability.State -eq 'InstallPending') {
        throw "$($entry.Name) is pending a restart. Use a clean runner before testing OCR."
    }
    if ($capability.State -ne 'Installed') {
        $missing += $entry
    }
}

if ($missing.Count -eq 0) {
    Write-ProgressMessage 'Traditional Chinese Basic, OCR and Hant fonts are already installed.'
    return
}

$curl = Get-Command curl.exe -CommandType Application -ErrorAction Stop
$tempRoot = $env:RUNNER_TEMP
if ([string]::IsNullOrWhiteSpace($tempRoot)) {
    $tempRoot = [IO.Path]::GetTempPath()
}
$workDirectory = Join-Path $tempRoot ('darklord-server2025-lof-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $workDirectory -ErrorAction Stop
$isoPath = Join-Path $workDirectory 'server2025-languages-and-optional-features.iso'
$sourceUrl = 'https://go.microsoft.com/fwlink/?linkid=2273506'
$mounted = $false

try {
    Write-ProgressMessage ('Downloading official Server 2025 Languages and Optional Features ISO; timeout {0}s. The media is about 6.4 GiB.' -f $DownloadTimeoutSeconds)
    # No retries: max-time bounds the entire transfer, including redirects.
    & $curl.Source --fail --location --silent --show-error --proto '=https' --proto-redir '=https' --connect-timeout 30 --max-time $DownloadTimeoutSeconds --output $isoPath $sourceUrl
    if ($LASTEXITCODE -ne 0) {
        throw "Official ISO download failed or timed out (curl exit $LASTEXITCODE)."
    }
    $isoFile = Get-Item -LiteralPath $isoPath -ErrorAction Stop
    if ($isoFile.Length -lt 100MB) {
        throw 'Downloaded file is too small to be the Server 2025 language media; refusing to mount it.'
    }
    Write-ProgressMessage ('Downloaded {0:N0} bytes; mounting ISO read-only.' -f $isoFile.Length)
    $diskImage = Mount-DiskImage -ImagePath $isoPath -StorageType ISO -Access ReadOnly -PassThru -ErrorAction Stop
    $mounted = $true
    $volumes = @($diskImage | Get-Volume -ErrorAction Stop | Where-Object { $_.DriveLetter })
    $sources = @()
    foreach ($volume in $volumes) {
        $candidate = '{0}:\LanguagesAndOptionalFeatures' -f $volume.DriveLetter
        if (Test-Path -LiteralPath $candidate -PathType Container) {
            $sources += $candidate
        }
    }
    if ($sources.Count -ne 1) {
        throw 'The mounted ISO does not contain exactly one LanguagesAndOptionalFeatures source directory.'
    }
    $source = $sources[0]
    foreach ($entry in $required) {
        $packages = @(Get-ChildItem -LiteralPath $source -Filter $entry.CabPattern -File -ErrorAction Stop)
        if ($packages.Count -eq 0) {
            throw "Official media is missing the AMD64 package for $($entry.Name). Refusing an online fallback."
        }
    }
    Write-ProgressMessage ('Validated offline Basic, OCR and Hant font packages in {0}.' -f $source)

    foreach ($entry in $missing) {
        Write-ProgressMessage ('Installing {0} from local ISO with LimitAccess.' -f $entry.Name)
        $result = Add-WindowsCapability -Online -Name $entry.Name -Source $source -LimitAccess -ErrorAction Stop
        if ($result.RestartNeeded) {
            throw "$($entry.Name) requires a restart. The current CI session cannot claim OCR readiness; rerun on a prepared runner."
        }
        $after = Get-RequiredCapability -Name $entry.Name
        if ($after.State -ne 'Installed') {
            throw "$($entry.Name) did not reach Installed state (actual: $($after.State))."
        }
        Write-ProgressMessage ('Installed {0}; RestartNeeded=False.' -f $entry.Name)
    }

    foreach ($entry in $required) {
        $verified = Get-RequiredCapability -Name $entry.Name
        if ($verified.State -ne 'Installed') {
            throw "Final verification failed for $($entry.Name): $($verified.State)."
        }
    }
    Write-ProgressMessage 'All three capabilities are Installed. Run the separate OCR recognition test to verify the engine.'
}
finally {
    if ($mounted) {
        try {
            Dismount-DiskImage -ImagePath $isoPath -ErrorAction Stop
            $mounted = $false
            Write-ProgressMessage 'Dismounted official ISO.'
        }
        catch {
            Write-Warning ('Could not dismount ISO: {0}' -f $_.Exception.Message)
        }
    }
    if (-not $mounted) {
        try {
            if (Test-Path -LiteralPath $isoPath -PathType Leaf) {
                Remove-Item -LiteralPath $isoPath -Force -ErrorAction Stop
            }
            # Remove only the uniquely created directory, and only when empty.
            if (Test-Path -LiteralPath $workDirectory -PathType Container) {
                [IO.Directory]::Delete($workDirectory, $false)
            }
            Write-ProgressMessage 'Removed temporary download files.'
        }
        catch {
            Write-Warning ('Could not clean up installer temporary files: {0}' -f $_.Exception.Message)
        }
    }
}
