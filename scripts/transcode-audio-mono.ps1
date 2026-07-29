param(
    [Parameter(Mandatory = $true)]
    [string] $InputPath,

    [Parameter(Mandatory = $true)]
    [string] $OutputPath
)

$ErrorActionPreference = 'Stop'

function Wait-WinRtOperation {
    param(
        [Parameter(Mandatory = $true)] $Operation,
        [Type] $ResultType,
        [Type] $ProgressType
    )

    Add-Type -AssemblyName System.Runtime.WindowsRuntime

    if ($null -ne $ResultType) {
        $asTaskMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() |
            Where-Object {
                $_.Name -eq 'AsTask' -and
                $_.IsGenericMethodDefinition -and
                $_.GetGenericArguments().Count -eq 1 -and
                $_.GetParameters().Count -eq 1 -and
                $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
            } |
            Select-Object -First 1
        $task = $asTaskMethod.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
        $task.Wait()
        return $task.Result
    }

    if ($null -ne $ProgressType) {
        $asTaskMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() |
            Where-Object {
                $_.Name -eq 'AsTask' -and
                $_.IsGenericMethodDefinition -and
                $_.GetGenericArguments().Count -eq 1 -and
                $_.GetParameters().Count -eq 1 -and
                $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncActionWithProgress`1'
            } |
            Select-Object -First 1
        $task = $asTaskMethod.MakeGenericMethod($ProgressType).Invoke($null, @($Operation))
        $task.Wait()
    }
}

[void][Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
[void][Windows.Storage.StorageFolder, Windows.Storage, ContentType = WindowsRuntime]
[void][Windows.Storage.CreationCollisionOption, Windows.Storage, ContentType = WindowsRuntime]
[void][Windows.Media.Transcoding.MediaTranscoder, Windows.Media.Transcoding, ContentType = WindowsRuntime]
[void][Windows.Media.Transcoding.PrepareTranscodeResult, Windows.Media.Transcoding, ContentType = WindowsRuntime]
[void][Windows.Media.MediaProperties.MediaEncodingProfile, Windows.Media, ContentType = WindowsRuntime]
[void][Windows.Media.MediaProperties.AudioEncodingQuality, Windows.Media, ContentType = WindowsRuntime]

$inputFile = Wait-WinRtOperation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($InputPath)) ([Windows.Storage.StorageFile])
$outputFolder = Wait-WinRtOperation ([Windows.Storage.StorageFolder]::GetFolderFromPathAsync((Split-Path -LiteralPath $OutputPath))) ([Windows.Storage.StorageFolder])
$outputFile = Wait-WinRtOperation ($outputFolder.CreateFileAsync(
    (Split-Path -Leaf $OutputPath),
    [Windows.Storage.CreationCollisionOption]::ReplaceExisting
)) ([Windows.Storage.StorageFile])

$profile = [Windows.Media.MediaProperties.MediaEncodingProfile]::CreateM4a(
    [Windows.Media.MediaProperties.AudioEncodingQuality]::Low
)
$profile.Audio.ChannelCount = 1
$profile.Audio.SampleRate = 16000
$profile.Audio.Bitrate = 64000

$transcoder = [Windows.Media.Transcoding.MediaTranscoder]::new()
$prepared = Wait-WinRtOperation ($transcoder.PrepareFileTranscodeAsync(
    $inputFile,
    $outputFile,
    $profile
)) ([Windows.Media.Transcoding.PrepareTranscodeResult])

if (-not $prepared.CanTranscode) {
    throw "Cannot transcode audio: $($prepared.FailureReason)"
}

Wait-WinRtOperation ($prepared.TranscodeAsync()) $null ([double])
