export interface ProjectContext {
  projectName: string;
  recentCommits: string[];
  openFiles: string[];
  currentTask?: string;
}

export class ContextTool {
  async getContext(workspaceDir: string): Promise<ProjectContext> {
    const [recentCommits, openFiles, currentTask] = await Promise.all([
      this.getRecentCommits(workspaceDir),
      this.getOpenFiles(),
      this.detectCurrentTask(workspaceDir)
    ]);

    return {
      projectName: this.detectProjectName(workspaceDir),
      recentCommits,
      openFiles,
      currentTask
    };
  }

  private detectProjectName(dir: string): string {
    return require('path').basename(dir);
  }

  private async getRecentCommits(dir: string): Promise<string[]> {
    try {
      const { exec } = require('child_process');
      return new Promise((resolve) => {
        exec('git log --oneline -5', { cwd: dir, timeout: 3000 }, (err: any, stdout: string) => {
          if (err) resolve([]);
          else resolve(stdout.trim().split('\n').filter(Boolean));
        });
      });
    } catch {
      return [];
    }
  }

  private async getOpenFiles(): Promise<string[]> {
    try {
      const { exec } = require('child_process');
      const psScript = `Get-Process | Where-Object { $_.MainWindowTitle -and ($_.ProcessName -match 'Code|code') } | ForEach-Object { $_.MainWindowTitle } | Select-Object -First 5`;
      return new Promise((resolve) => {
        exec(`powershell -NoProfile -Command "${psScript}"`, { timeout: 3000 }, (err: any, stdout: string) => {
          if (err || !stdout.trim()) {
            resolve([]);
            return;
          }
          const titles = stdout.trim().split('\n').map(t => t.trim()).filter(Boolean);
          // VS Code titles: "filename - folder - Visual Studio Code"
          const files = titles.map(t => {
            const parts = t.split(' - ');
            return parts.length > 0 ? parts[0].trim() : t;
          }).filter(f => f && f !== 'Visual Studio Code');
          resolve(files);
        });
      });
    } catch {
      return [];
    }
  }

  private async detectCurrentTask(dir: string): Promise<string | undefined> {
    const fs = require('fs');
    const path = require('path');

    const todoPath = path.join(dir, 'TODO.md');
    if (fs.existsSync(todoPath)) {
      try {
        const content: string = fs.readFileSync(todoPath, 'utf-8');
        const lines = content.split('\n');
        // Find first unchecked task: "- [ ] ..."
        const active = lines.find((l: string) => /^[-*]\s*\[\s\]/.test(l.trim()));
        if (active) return active.replace(/^[-*]\s*\[\s\]\s*/, '').trim();
      } catch { /* ignore */ }
    }

    const memPath = path.join(dir, 'MEMORY.md');
    if (fs.existsSync(memPath)) {
      try {
        const content: string = fs.readFileSync(memPath, 'utf-8');
        const focusMatch = content.match(/##\s*(?:Current Focus|当前任务|目前在做)\s*\n+(.+)/i);
        if (focusMatch) return focusMatch[1].trim();
      } catch { /* ignore */ }
    }

    return undefined;
  }
}
