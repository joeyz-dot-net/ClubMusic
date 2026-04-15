param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Prompt', 'Tool')]
    [string]$Mode
)

function New-HookResponse {
    param(
        [string]$SystemMessage,
        [string]$AdditionalContext
    )

    $payload = @{}
    if ($SystemMessage) {
        $payload.systemMessage = $SystemMessage
    }
    if ($AdditionalContext) {
        $payload.hookSpecificOutput = @{
            additionalContext = $AdditionalContext
        }
    }

    if ($payload.Count -eq 0) {
        $payload.continue = $true
    }

    $payload | ConvertTo-Json -Compress -Depth 8
}

function Get-JsonStrings {
    param(
        [Parameter(ValueFromPipeline = $true)]
        $InputObject
    )

    $results = New-Object System.Collections.Generic.List[string]

    function Add-StringsRecursive {
        param($Value)

        if ($null -eq $Value) {
            return
        }

        if ($Value -is [string]) {
            if (-not [string]::IsNullOrWhiteSpace($Value)) {
                $results.Add($Value)
            }
            return
        }

        if ($Value -is [System.Collections.IDictionary]) {
            foreach ($entry in $Value.GetEnumerator()) {
                Add-StringsRecursive -Value $entry.Key
                Add-StringsRecursive -Value $entry.Value
            }
            return
        }

        if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
            foreach ($item in $Value) {
                Add-StringsRecursive -Value $item
            }
            return
        }

        $psObject = $Value.PSObject
        if ($psObject -and $psObject.Properties.Count -gt 0) {
            foreach ($property in $psObject.Properties) {
                Add-StringsRecursive -Value $property.Name
                Add-StringsRecursive -Value $property.Value
            }
        }
    }

    Add-StringsRecursive -Value $InputObject
    return $results
}

function Test-PlaybackPrompt {
    param([string]$Prompt)

    if ([string]::IsNullOrWhiteSpace($Prompt)) {
        return $false
    }

    $pattern = '(?i)\b(playback|player|pause|resume|next|prev|playlist_updated|ktv|youtube|room|pipe|status sync|websocket|autoplay|queue)\b'
    return [regex]::IsMatch($Prompt, $pattern)
}

function Get-ToolReminder {
    param($Payload)

    $strings = @(Get-JsonStrings -InputObject $Payload.tool_input)
    if ($Payload.tool_response) {
        $strings += @(Get-JsonStrings -InputObject $Payload.tool_response)
    }

    $joined = ($strings -join "`n")
    if ([string]::IsNullOrWhiteSpace($joined)) {
        return $null
    }

    $apiParityMatch = [regex]::IsMatch($joined, '(?i)(^|[\\/])(routers|static[\\/]js)([\\/]|$)')
    $playbackMatch = [regex]::IsMatch($joined, '(?i)(static[\\/]js[\\/](api|main|player|playlist|playNow|playLock|playbackState|ktv)\.js|routers[\\/](player|playlist|room|websocket|state|dependencies)\.py|models[\\/]player\.py|tools[\\/]browser_control_regression\.py)')

    if (-not $apiParityMatch -and -not $playbackMatch) {
        return $null
    }

    $messages = New-Object System.Collections.Generic.List[string]
    if ($apiParityMatch) {
        $messages.Add('Router or frontend API files changed. Keep backend routes and static/js/api.js in sync, including FormData versus JSON payload expectations.')
    }
    if ($playbackMatch) {
        $messages.Add('Playback-related files changed. If behavior touches trusted controls, pause/resume, KTV, request tracing, or queue refresh flow, run py tools/browser_control_regression.py --base-url http://127.0.0.1:9000/ --ensure-server --include-queue-suite --output logs/browser-control-regression.json and expect summary.passed=true, checks.controlSuite=true, checks.trustedResumeSuite=true, and checks.queueSuite=true.')
    }

    return ($messages -join ' ')
}

try {
    $rawInput = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($rawInput)) {
        New-HookResponse | Write-Output
        exit 0
    }

    $payload = $rawInput | ConvertFrom-Json -Depth 20

    if ($Mode -eq 'Prompt') {
        if (Test-PlaybackPrompt -Prompt $payload.prompt) {
            New-HookResponse -SystemMessage 'Playback-related request detected. Use the playback-debugging skill or Playback Investigator agent for diagnosis, and remember the browser regression baseline for trusted controls and resume behavior.' | Write-Output
            exit 0
        }
    }

    if ($Mode -eq 'Tool') {
        $reminder = Get-ToolReminder -Payload $payload
        if ($reminder) {
            New-HookResponse -SystemMessage $reminder | Write-Output
            exit 0
        }
    }

    New-HookResponse | Write-Output
    exit 0
}
catch {
    New-HookResponse | Write-Output
    exit 0
}