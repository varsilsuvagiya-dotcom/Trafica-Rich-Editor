$i = [Console]::In.ReadToEnd() | ConvertFrom-Json
$p = $i.tool_input.file_path
if ($p -and $p -match 'src[\\/]') {
  Write-Output '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"reminder fired"}}'
}
