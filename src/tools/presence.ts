export interface PresenceInfo {
  windowTitle: string;
  processName: string;
  idleTime: number; // 秒 (reserved, not yet detected)
}

export class PresenceTool {
  async getPresence(): Promise<PresenceInfo> {
    const psScript = `
      Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class Win {
          [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
          [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
        }
      "@
      $hWnd = [Win]::GetForegroundWindow()
      $sb = New-Object System.Text.StringBuilder(256)
      [Win]::GetWindowText($hWnd, $sb, $sb.Capacity) | Out-Null
      $title = $sb.ToString()
      $process = (Get-Process | Where-Object { $_.MainWindowTitle -eq $title -and $_.MainWindowHandle -eq $hWnd } | Select-Object -First 1).Name
      Write-Output "WINDOW_TITLE=$title"
      Write-Output "PROCESS=$process"
    `;

    const result = await this.execPs(psScript);
    const lines = result.split('\n').map(l => l.trim()).filter(Boolean);

    return {
      windowTitle: lines.find(l => l.startsWith('WINDOW_TITLE='))?.split('=').slice(1).join('=') ?? '',
      processName: lines.find(l => l.startsWith('PROCESS='))?.split('=').slice(1).join('=') ?? '',
      idleTime: 0
    };
  }

  inferMode(processName: string, windowTitle: string): string {
    const p = processName.toLowerCase();
    if (p.includes('code') || p.includes('vscode')) return 'coding';
    if (p.includes('chrome') || p.includes('edge') || p.includes('firefox')) {
      if (windowTitle.includes('meet') || windowTitle.includes('zoom')) return 'meeting';
      return 'browsing';
    }
    if (p.includes('excel') || p.includes('word') || p.includes('powerpoint')) return 'writing';
    if (p.includes('calendar') || p.includes('outlook')) return 'meeting';
    if (p.includes('terminal') || p.includes('powershell')) return 'coding';
    return 'unknown';
  }

  assessAvailability(processName: string, windowTitle: string): { availability: string; interruptibility: number } {
    const title = windowTitle.toLowerCase();
    if (title.includes('meeting') || title.includes('zoom') || title.includes('teams')) {
      return { availability: 'busy', interruptibility: 0.2 };
    }
    return { availability: 'online', interruptibility: 0.8 };
  }

  private async execPs(script: string): Promise<string> {
    const { exec } = await import('child_process');
    return new Promise((resolve, reject) => {
      exec(`powershell -NoProfile -Command "${script.replace(/"/g, '`"')}"`, (err: any, stdout: string) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });
  }
}
