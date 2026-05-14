$oldFg = [Console]::ForegroundColor
$esc = [char]27
$BannerColor = '#755598'
$bannerBase64 = 'CiDilojilojilojilojilojilojilZcgIOKWiOKWiOKWiOKWiOKWiOKWiOKVlyAg4paI4paI4paI4paI4paI4paI4pWX4paI4paI4paI4paI4paI4paI4paI4pWX4paI4paI4paI4paI4paI4paI4paI4pWX4paI4paI4paI4pWXICAg4paI4paI4pWX4paI4paI4paI4paI4paI4paI4paI4pWX4paI4paI4paI4paI4paI4paI4paI4pWXCiDilojilojilZTilZDilZDilojilojilZfilojilojilZTilZDilZDilZDilojilojilZfilojilojilZTilZDilZDilZDilZDilZ3ilojilojilZTilZDilZDilZDilZDilZ3ilojilojilZTilZDilZDilZDilZDilZ3ilojilojilojilojilZcgIOKWiOKWiOKVkeKWiOKWiOKVlOKVkOKVkOKVkOKVkOKVneKWiOKWiOKVlOKVkOKVkOKVkOKVkOKVnQog4paI4paI4pWRICDilojilojilZHilojilojilZEgICDilojilojilZHilojilojilZEgICAgIOKWiOKWiOKWiOKWiOKWiOKWiOKWiOKVl+KWiOKWiOKWiOKWiOKWiOKVlyAg4paI4paI4pWU4paI4paI4pWXIOKWiOKWiOKVkeKWiOKWiOKWiOKWiOKWiOKWiOKWiOKVl+KWiOKWiOKWiOKWiOKWiOKVlyAgCiDilojilojilZEgIOKWiOKWiOKVkeKWiOKWiOKVkSAgIOKWiOKWiOKVkeKWiOKWiOKVkSAgICAg4pWa4pWQ4pWQ4pWQ4pWQ4paI4paI4pWR4paI4paI4pWU4pWQ4pWQ4pWdICDilojilojilZHilZrilojilojilZfilojilojilZHilZrilZDilZDilZDilZDilojilojilZHilojilojilZTilZDilZDilZ0gIAog4paI4paI4paI4paI4paI4paI4pWU4pWd4pWa4paI4paI4paI4paI4paI4paI4pWU4pWd4pWa4paI4paI4paI4paI4paI4paI4pWX4paI4paI4paI4paI4paI4paI4paI4pWR4paI4paI4paI4paI4paI4paI4paI4pWX4paI4paI4pWRIOKVmuKWiOKWiOKWiOKWiOKVkeKWiOKWiOKWiOKWiOKWiOKWiOKWiOKVkeKWiOKWiOKWiOKWiOKWiOKWiOKWiOKVlwog4pWa4pWQ4pWQ4pWQ4pWQ4pWQ4pWdICDilZrilZDilZDilZDilZDilZDilZ0gIOKVmuKVkOKVkOKVkOKVkOKVkOKVneKVmuKVkOKVkOKVkOKVkOKVkOKVkOKVneKVmuKVkOKVkOKVkOKVkOKVkOKVkOKVneKVmuKVkOKVnSAg4pWa4pWQ4pWQ4pWQ4pWd4pWa4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWd4pWa4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWd'

function Convert-HexColorToAnsiCode([string]$HexColor) {
    if ($HexColor -notmatch '^#?([0-9a-fA-F]{6})$') {
        throw "Invalid banner color: $HexColor. Use a value like #755598."
    }

    $hex = $matches[1]
    $red = [Convert]::ToInt32($hex.Substring(0, 2), 16)
    $green = [Convert]::ToInt32($hex.Substring(2, 2), 16)
    $blue = [Convert]::ToInt32($hex.Substring(4, 2), 16)

    return "38;2;$red;$green;$blue"
}

try {
    $banner = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($bannerBase64)).TrimEnd([char[]]"`r`n")

    [Console]::Write("${esc}[$(Convert-HexColorToAnsiCode $BannerColor)m")
    foreach ($line in ($banner -split "`r?`n")) {
        [Console]::WriteLine($line)
    }
    [Console]::Write("${esc}[0m")

    [Console]::ForegroundColor = 'DarkGray'
    [Console]::WriteLine('   Universal Document Search  v1.0  |  http://localhost:8000')
    [Console]::WriteLine('')
} finally {
    [Console]::Write("${esc}[0m")
    [Console]::ForegroundColor = $oldFg
}
