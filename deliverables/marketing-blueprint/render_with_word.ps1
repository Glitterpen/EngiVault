$ErrorActionPreference = 'Stop'
$source = (Resolve-Path -LiteralPath '.\EngiCite_Marketing_Blueprint.docx').Path
$targetDirectory = (Resolve-Path -LiteralPath '.\rendered').Path
$target = Join-Path $targetDirectory 'EngiCite_Marketing_Blueprint.pdf'
$word = $null
$document = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $word.AutomationSecurity = 3
    $word.Options.SaveNormalPrompt = $false
    $word.Options.ConfirmConversions = $false
    $word.Options.UpdateLinksAtOpen = $false
    $document = $word.Documents.OpenNoRepairDialog($source, $false, $true, $false)
    $document.ExportAsFixedFormat($target, 17)
    Write-Output $target
}
finally {
    if ($null -ne $document) { $document.Close($false) }
    if ($null -ne $word) { $word.Quit() }
    if ($null -ne $document) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($document) | Out-Null }
    if ($null -ne $word) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
