param(
    [Parameter(Mandatory = $true)]
    [string]$ResultPath
)

$options = @(
    @{ Text = 'Start Server'; Value = '1'; Hotkey = '1'; Icon = '>' },
    @{ Text = 'Restart Server'; Value = '2'; Hotkey = '2'; Icon = '@' },
    @{ Text = 'Install / Update Packages'; Value = '3'; Hotkey = '3'; Icon = '+' },
    @{ Text = 'Open watched_docs Folder'; Value = '4'; Hotkey = '4'; Icon = '#' },
    @{ Text = 'Exit'; Value = '0'; Hotkey = '0'; Icon = 'x' }
)

function Save-Choice([string]$Value) {
    Set-Content -LiteralPath $ResultPath -Value $Value -NoNewline -Encoding ASCII
}

if ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected) {
    Save-Choice '0'
    exit 0
}

$index = 0
$oldFg = [Console]::ForegroundColor
$oldBg = [Console]::BackgroundColor
$oldCursor = [Console]::CursorVisible
$top = [Console]::CursorTop

function Fit-Line([string]$Text, [int]$Width) {
    if ($Text.Length -gt $Width) {
        return $Text.Substring(0, $Width)
    }
    return $Text.PadRight($Width)
}

function Draw-Menu {
    $width = [Math]::Max(30, [Console]::WindowWidth - 1)
    [Console]::SetCursorPosition(0, $top)

    [Console]::ForegroundColor = 'DarkGray'
    [Console]::BackgroundColor = 'Black'
    [Console]::WriteLine((Fit-Line '  Up/Down move   Enter select   Esc quit' $width))
    [Console]::WriteLine((Fit-Line '' $width))

    for ($i = 0; $i -lt $options.Count; $i++) {
        $arrow = if ($i -eq $script:index) { '>' } else { ' ' }
        $line = Fit-Line ('  ' + $arrow + '  ' + $options[$i].Icon + '  ' + $options[$i].Text) $width

        if ($i -eq $script:index) {
            [Console]::ForegroundColor = 'Yellow'
        } else {
            [Console]::ForegroundColor = 'Gray'
        }
        [Console]::BackgroundColor = 'Black'

        [Console]::WriteLine($line)
    }

    [Console]::ForegroundColor = 'DarkGray'
    [Console]::BackgroundColor = 'Black'
    [Console]::WriteLine((Fit-Line '  --------------------------------------------------' $width))
}

try {
    [Console]::CursorVisible = $false

    while ($true) {
        Draw-Menu
        $keyInfo = [Console]::ReadKey($true)
        $key = $keyInfo.Key
        $char = $keyInfo.KeyChar

        if ($key -eq 'UpArrow') {
            $index = ($index + $options.Count - 1) % $options.Count
        } elseif ($key -eq 'DownArrow') {
            $index = ($index + 1) % $options.Count
        } elseif ($key -eq 'Enter') {
            Save-Choice $options[$index].Value
            break
        } elseif ($key -eq 'Escape') {
            Save-Choice '0'
            break
        } else {
            $match = $options | Where-Object { $_.Hotkey -eq [string]$char } | Select-Object -First 1
            if ($match) {
                Save-Choice $match.Value
                break
            }
        }
    }
} finally {
    [Console]::ForegroundColor = $oldFg
    [Console]::BackgroundColor = $oldBg
    [Console]::CursorVisible = $oldCursor
}
