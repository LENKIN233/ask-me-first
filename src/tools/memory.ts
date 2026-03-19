/**
 * 记忆工具
 * 读取 MEMORY.md 与 daily notes，用于 persona 匹配
 */

export class MemoryTool {
  /**
   * 读取 MEMORY.md，提取个性特征
   */
  async readMemory(memoryPath: string): Promise<string> {
    const fs = require('fs');
    if (!fs.existsSync(memoryPath)) return '';
    return fs.readFileSync(memoryPath, 'utf-8');
  }

  /**
   * 读取今日笔记
   */
  async readTodayNote(memoryDir: string): Promise<string> {
    const today = new Date().toISOString().split('T')[0];
    const path = `${memoryDir}/${today}.md`;
    const fs = require('fs');
    if (!fs.existsSync(path)) return '';
    return fs.readFileSync(path, 'utf-8');
  }
}
