param([Parameter(Mandatory=$true)][string]$FixtureRoot)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class HostFixtureNative { [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); }'
[System.Windows.Forms.Application]::SetHighDpiMode([System.Windows.Forms.HighDpiMode]::PerMonitorV2) | Out-Null
$form = [System.Windows.Forms.Form]::new()
$form.Text = 'alpha-AOS controlled GUI verification'
$form.ClientSize = [System.Drawing.Size]::new(640,360)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.AccessibleName = 'alpha-AOS test fixture'
$script:leftClicks = 0
$script:rightClicks = 0
$script:drags = 0
$script:dragStart = $null
$label = [System.Windows.Forms.Label]::new()
$label.Text = 'Controlled test data only. No accounts or private content.'
$label.Location = [System.Drawing.Point]::new(20,20)
$label.AutoSize = $true
$form.Controls.Add($label)
$text = [System.Windows.Forms.TextBox]::new()
$text.Name = 'verificationText'
$text.AccessibleName = 'Verification text'
$text.Location = [System.Drawing.Point]::new(20,60)
$text.Width = 580
$form.Controls.Add($text)
$button = [System.Windows.Forms.Button]::new()
$button.Text = 'Verify left click'
$button.AccessibleName = 'Verify left click'
$button.Location = [System.Drawing.Point]::new(20,110)
$button.Size = [System.Drawing.Size]::new(220,50)
$form.Controls.Add($button)
$right = [System.Windows.Forms.Panel]::new()
$right.Name = 'rightClickTarget'
$right.AccessibleName = 'Right click target'
$right.BackColor = [System.Drawing.Color]::LightBlue
$right.Location = [System.Drawing.Point]::new(280,110)
$right.Size = [System.Drawing.Size]::new(220,50)
$form.Controls.Add($right)
$drag = [System.Windows.Forms.Panel]::new()
$drag.Name = 'dragTarget'
$drag.AccessibleName = 'Drag test target'
$drag.BackColor = [System.Drawing.Color]::LightGreen
$drag.Location = [System.Drawing.Point]::new(20,200)
$drag.Size = [System.Drawing.Size]::new(580,90)
$form.Controls.Add($drag)
$counter = [System.Windows.Forms.Label]::new()
$counter.Location = [System.Drawing.Point]::new(20,315)
$counter.AutoSize = $true
$form.Controls.Add($counter)
function Save-FixtureState {
  if (!$form.IsHandleCreated) {return}
  $counter.Text = "Left=$script:leftClicks Right=$script:rightClicks Drag=$script:drags Text=$($text.Text)"
  $button.AccessibleName = "Verification counters: $($counter.Text)"
  $ownProcess = [Diagnostics.Process]::GetCurrentProcess()
  $targets = @{}
  foreach ($pair in @(@('text',$text),@('left',$button),@('right',$right),@('drag',$drag))) {
    $point = $pair[1].PointToScreen([System.Drawing.Point]::new([int]($pair[1].Width/2),[int]($pair[1].Height/2)))
    $targets[$pair[0]] = @{x=($point.X-$form.Bounds.X);y=($point.Y-$form.Bounds.Y)}
  }
  $state = @{pid=$PID;windowId=$form.Handle.ToInt64().ToString();executable=$ownProcess.MainModule.FileName;processGeneration=$ownProcess.StartTime.ToUniversalTime().Ticks.ToString();title=$form.Text;leftClicks=$script:leftClicks;rightClicks=$script:rightClicks;drags=$script:drags;text=$text.Text;targets=$targets;bounds=@{x=$form.Bounds.X;y=$form.Bounds.Y;width=$form.Width;height=$form.Height}}
  $json = $state | ConvertTo-Json -Depth 6 -Compress
  [IO.File]::WriteAllText((Join-Path $FixtureRoot 'fixture-state.json'),$json,[Text.UTF8Encoding]::new($false))
}
$button.Add_Click({$script:leftClicks++;Save-FixtureState})
$right.Add_MouseDown({param($sender,$eventArgs) if ($eventArgs.Button -eq [System.Windows.Forms.MouseButtons]::Right) {$script:rightClicks++;Save-FixtureState}})
$drag.Add_MouseDown({param($sender,$eventArgs) $script:dragStart=$eventArgs.Location})
$drag.Add_MouseUp({param($sender,$eventArgs) if ($null -ne $script:dragStart -and [Math]::Abs($eventArgs.X-$script:dragStart.X) -gt 20) {$script:drags++;Save-FixtureState};$script:dragStart=$null})
$text.Add_TextChanged({Save-FixtureState})
$form.Add_Shown({Save-FixtureState})
$timer = [System.Windows.Forms.Timer]::new()
$timer.Interval=200
$script:fixtureShown=$false
$timer.Add_Tick({if (!$script:fixtureShown) {[HostFixtureNative]::ShowWindow($form.Handle,4) | Out-Null;$script:fixtureShown=$true;Save-FixtureState};if ([IO.File]::Exists((Join-Path $FixtureRoot 'STOP'))) {$form.Close()}})
$timer.Start()
[System.Windows.Forms.Application]::Run($form)
$timer.Dispose()
$form.Dispose()
