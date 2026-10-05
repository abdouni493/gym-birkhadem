# Generates a high-quality multi-resolution gym icon (.ico) and a Desktop shortcut
# that launches the app and opens it directly in the browser.
# Run with: powershell -ExecutionPolicy Bypass -NoProfile -File "create_shortcut_and_icon.ps1"

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

# --- Remove the old icon -----------------------------------------------------
$oldIco = Join-Path $PSScriptRoot "gtm.ico"
if (Test-Path $oldIco) {
    Remove-Item $oldIco -Force
    Write-Output "Removed old icon: $oldIco"
}

# --- Helper: rounded rectangle path -----------------------------------------
function New-RoundedRect([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $path.AddArc($x,            $y,            $d, $d, 180, 90)
    $path.AddArc($x + $w - $d,  $y,            $d, $d, 270, 90)
    $path.AddArc($x + $w - $d,  $y + $h - $d,  $d, $d, 0,   90)
    $path.AddArc($x,            $y + $h - $d,  $d, $d, 90,  90)
    $path.CloseFigure()
    return $path
}

# --- Helper: draw the icon at a given pixel size -----------------------------
function Draw-Icon([int]$S) {
    $bmp = New-Object System.Drawing.Bitmap($S, $S, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear([System.Drawing.Color]::Transparent)

    # Rounded-square app badge with a vibrant diagonal gradient (amber -> red)
    $pad    = [single]($S * 0.06)
    $radius = [single]($S * 0.22)
    $bgPath = New-RoundedRect $pad $pad ([single]($S - 2*$pad)) ([single]($S - 2*$pad)) $radius
    $rect   = New-Object System.Drawing.RectangleF(0, 0, $S, $S)
    $grad   = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(255, 245, 158, 11),   # amber
        [System.Drawing.Color]::FromArgb(255, 220, 38, 38),    # red
        45.0)
    $g.FillPath($grad, $bgPath)

    # Soft top sheen
    $sheen = New-Object System.Drawing.Drawing2D.GraphicsPath
    $sheen.AddEllipse([single]($S*0.10), [single]($S*0.04), [single]($S*0.80), [single]($S*0.45))
    $sheenBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(40, 255, 255, 255))
    $g.SetClip($bgPath)
    $g.FillPath($sheenBrush, $sheen)
    $g.ResetClip()

    # White dumbbell --------------------------------------------------------
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $cy    = [single]($S * 0.5)

    # center bar
    $barH = [single]($S * 0.10)
    $bar  = New-RoundedRect ([single]($S*0.34)) ([single]($cy - $barH/2)) ([single]($S*0.32)) $barH ([single]($barH*0.4))
    $g.FillPath($white, $bar)

    # inner (large) plates
    $pW = [single]($S * 0.10); $pH = [single]($S * 0.36)
    $lp = New-RoundedRect ([single]($S*0.22)) ([single]($cy - $pH/2)) $pW $pH ([single]($pW*0.35))
    $rp = New-RoundedRect ([single]($S*0.68)) ([single]($cy - $pH/2)) $pW $pH ([single]($pW*0.35))
    $g.FillPath($white, $lp); $g.FillPath($white, $rp)

    # outer (small) plates
    $qW = [single]($S * 0.065); $qH = [single]($S * 0.22)
    $lo = New-RoundedRect ([single]($S*0.15)) ([single]($cy - $qH/2)) $qW $qH ([single]($qW*0.4))
    $ro = New-RoundedRect ([single]($S*0.785)) ([single]($cy - $qH/2)) $qW $qH ([single]($qW*0.4))
    $g.FillPath($white, $lo); $g.FillPath($white, $ro)

    $g.Dispose()
    return $bmp
}

# --- Build a proper multi-resolution PNG-based .ico --------------------------
$sizes   = @(16, 24, 32, 48, 64, 128, 256)
$pngList = @()
foreach ($s in $sizes) {
    $bmp = Draw-Icon $s
    $ms  = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngList += ,@($s, $ms.ToArray())
    $bmp.Dispose(); $ms.Dispose()
}

$icoPath = Join-Path $PSScriptRoot "gym-management.ico"
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)

# ICONDIR
$bw.Write([UInt16]0)                 # reserved
$bw.Write([UInt16]1)                 # type = icon
$bw.Write([UInt16]$pngList.Count)    # image count

# ICONDIRENTRY table
$offset = 6 + (16 * $pngList.Count)
foreach ($entry in $pngList) {
    $s = $entry[0]; $bytes = $entry[1]
    $dim = if ($s -ge 256) { 0 } else { $s }
    $bw.Write([Byte]$dim)            # width
    $bw.Write([Byte]$dim)            # height
    $bw.Write([Byte]0)              # palette
    $bw.Write([Byte]0)              # reserved
    $bw.Write([UInt16]1)            # color planes
    $bw.Write([UInt16]32)          # bits per pixel
    $bw.Write([UInt32]$bytes.Length)
    $bw.Write([UInt32]$offset)
    $offset += $bytes.Length
}
# Image data
foreach ($entry in $pngList) { $bw.Write($entry[1]) }

$bw.Flush(); $bw.Close(); $fs.Close()
Write-Output "Saved new icon to $icoPath"

# --- Create / update the Desktop shortcut -----------------------------------
$WshShell  = New-Object -ComObject WScript.Shell
$desktop   = [Environment]::GetFolderPath("Desktop")
$lnkPath   = Join-Path $desktop "GYM Management App.lnk"
$shortcut  = $WshShell.CreateShortcut($lnkPath)
$shortcut.TargetPath       = Join-Path $PSScriptRoot "RUN_APP.bat"
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.IconLocation     = "$icoPath,0"
$shortcut.Description       = "GYM Management System - launches the app and opens it in your browser"
$shortcut.WindowStyle       = 7   # minimized launcher window
$shortcut.Save()
Write-Output "Shortcut created/updated at $lnkPath"
