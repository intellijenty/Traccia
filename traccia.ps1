  $out = "$env:USERPROFILE\Desktop\traccia-diag.txt"
  Start-Transcript -Path $out -Force | Out-Null

  Write-Host "TIMESTAMP $(Get-Date -Format o)"
  Write-Host "User: $env:USERNAME  Host: $env:COMPUTERNAME"

  Write-Host ""
  Write-Host "=== Processes ==="
  $procs = Get-Process OUTLOOK,olk -ErrorAction SilentlyContinue
  foreach ($p in $procs) {
    Write-Host "  $($p.Name) pid=$($p.Id) start=$($p.StartTime)"
  }
  if (-not $procs) { Write-Host "  (none)" }

  Write-Host ""
  Write-Host "=== OST files ==="
  $ostDir = "$env:LOCALAPPDATA\Microsoft\Outlook"
  $osts = Get-ChildItem $ostDir -Filter *.ost -ErrorAction SilentlyContinue
  foreach ($f in $osts) {
    $mb = [int]($f.Length / 1MB)
    Write-Host "  $($f.Name)  size=${mb}MB  mtime=$($f.LastWriteTime)"
  }
  if (-not $osts) { Write-Host "  (none)" }

  Write-Host ""
  Write-Host "=== MAPI Profiles ==="
  $profKey = "HKCU:\Software\Microsoft\Office\16.0\Outlook\Profiles"
  if (Test-Path $profKey) {
    $list = Get-ChildItem $profKey
    foreach ($k in $list) { Write-Host "  $($k.PSChildName)" }
  } else {
    Write-Host "  (none)"
  }
  $outlookKey = "HKCU:\Software\Microsoft\Office\16.0\Outlook"
  $defObj = Get-ItemProperty $outlookKey -ErrorAction SilentlyContinue
  Write-Host "DefaultProfile: $($defObj.DefaultProfile)"

  Write-Host ""
  Write-Host "=== Default mailto ProgId ==="
  $mailtoKey = "HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\mailto\UserChoice"
  $mt = Get-ItemProperty $mailtoKey -ErrorAction SilentlyContinue
  Write-Host "ProgId: $($mt.ProgId)"

  Write-Host ""
  Write-Host "=== Locale ==="
  $ci = Get-Culture
  Write-Host "Culture: $($ci.Name)"
  Write-Host "ShortDate: $($ci.DateTimeFormat.ShortDatePattern)"
  Write-Host "ShortTime: $($ci.DateTimeFormat.ShortTimePattern)"
  Write-Host "AM: $($ci.DateTimeFormat.AMDesignator)  PM: $($ci.DateTimeFormat.PMDesignator)"

  Write-Host ""
  Write-Host "=== COM Outlook.Application ==="
  $cal = $null
  try {
    $o = New-Object -ComObject Outlook.Application
    Write-Host "Version: $($o.Version)"
    Write-Host "Name: $($o.Name)"
    $ns = $o.GetNamespace("MAPI")
    Write-Host "Profile: $($ns.CurrentProfileName)"
    $cal = $ns.GetDefaultFolder(9)
    Write-Host "Store: $($cal.Store.DisplayName)"
    Write-Host "Path: $($cal.Store.FilePath)"
    Write-Host "IsCached: $($cal.Store.IsCachedExchange)"
  } catch {
    Write-Host "COM FAIL: $_"
  }

  if ($cal -ne $null) {
    $today = (Get-Date).Date
    $end1 = $today.AddDays(1)
    $end7 = $today.AddDays(7)

    Write-Host ""
    Write-Host "=== Raw scan TODAY ==="
    try {
      $items = $cal.Items
      $items.Sort("[Start]")
      $items.IncludeRecurrences = $true
      $hits = 0
      $scanned = 0
      foreach ($i in $items) {
        $scanned++
        if ($i.Start -ge $today -and $i.Start -lt $end1) {
          $s = $i.Start.ToString("o")
          Write-Host "HIT $s dur=$($i.Duration) recur=$($i.IsRecurring) resp=$($i.ResponseStatus) | $($i.Subject)"
          $hits++
        }
        if ($scanned -gt 5000) { Write-Host "(stop 5000)"; break }
      }
      Write-Host "TodayHits=$hits  Scanned=$scanned"
    } catch {
      Write-Host "Raw FAIL: $_"
    }

    Write-Host ""
    Write-Host "=== Restrict TODAY ==="
    try {
      $fromStr = $today.ToString("M/d/yyyy h:mm tt")
      $toStr = $end1.ToString("M/d/yyyy h:mm tt")
      $f = "[Start] >= '" + $fromStr + "' AND [Start] <= '" + $toStr + "'"
      Write-Host "Filter: $f"
      $r = $items.Restrict($f)
      $rc = 0
      foreach ($i in $r) {
        $s = $i.Start.ToString("o")
        Write-Host "RES $s recur=$($i.IsRecurring) | $($i.Subject)"
        $rc++
        if ($rc -gt 300) { Write-Host "(stop 300)"; break }
      }
      Write-Host "RestrictMatches=$rc"
    } catch {
      Write-Host "Restrict FAIL: $_"
    }

    Write-Host ""
    Write-Host "=== Restrict 7-DAY ==="
    try {
      $fromStr = $today.ToString("M/d/yyyy h:mm tt")
      $to7Str = $end7.ToString("M/d/yyyy h:mm tt")
      $f7 = "[Start] >= '" + $fromStr + "' AND [Start] <= '" + $to7Str + "'"
      Write-Host "Filter: $f7"
      $r7 = $items.Restrict($f7)
      $rc7 = 0
      $stale = 0
      foreach ($i in $r7) {
        $isStale = $false
        if ($i.Start -lt $today) { $isStale = $true; $stale++ }
        $s = $i.Start.ToString("o")
        Write-Host "RES7 $s recur=$($i.IsRecurring) stale=$isStale | $($i.Subject)"
        $rc7++
        if ($rc7 -gt 300) { Write-Host "(stop 300)"; break }
      }
      Write-Host "Restrict7Matches=$rc7  StaleBeforeToday=$stale"
    } catch {
      Write-Host "Restrict7 FAIL: $_"
    }
  }

  Stop-Transcript | Out-Null
  Write-Host ""
  Write-Host "DONE. Output: $out"
  Read-Host "Press ENTER"