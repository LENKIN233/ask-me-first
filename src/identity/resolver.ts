/**
 * 身份解析器
 * 读取 users.json，根据 senderId 返回对应的身份和权限级别
 */

import { UserEntry, IdentityConfig, defaultRelationship, defaultInfoLevel } from './types.js';
import { StateCache } from '../state/cache.js';
import fs from 'fs';

export class IdentityResolver {
  private config: IdentityConfig | null = null;
  private cache = new StateCache(5000);

  constructor(private workspaceDir: string) {}

  async resolve(userId: string): Promise<UserEntry & { infoLevel: string; relationship: NonNullable<UserEntry['relationship']> }> {
    const cacheKey = `identity:${userId}`;
    const cached = this.cache.get<UserEntry>(cacheKey);
    if (cached) return this.normalize(cached);

    await this.loadConfig();

    const user = this.config?.users.find(u => u.userId === userId);
    if (!user) {
      const guest: UserEntry = {
        userId,
        identity: 'guest',
        infoLevel: 'public',
        relationship: defaultRelationship()
      };
      this.cache.set(cacheKey, guest);
      return this.normalize(guest);
    }

    this.cache.set(cacheKey, user);
    return this.normalize(user);
  }

  private normalize(user: UserEntry) {
    return {
      ...user,
      infoLevel: user.infoLevel ?? defaultInfoLevel(user.identity),
      relationship: user.relationship ?? defaultRelationship()
    };
  }

  private async loadConfig(): Promise<void> {
    if (this.config) return;

    const filePath = `${this.workspaceDir}/ask_me_first/users.json`;
    try {
      const content = await this.readFile(filePath);
      this.config = JSON.parse(content);
    } catch (error) {
      console.error('[IdentityResolver] Failed to load users.json:', error);
      this.config = { version: '1.0', users: [] };
    }
  }

  private readFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, 'utf-8', (err: any, data: string) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  async updateTrustScore(userId: string, delta: number): Promise<void> {
    const user = await this.resolve(userId);
    user.relationship.trustScore = Math.max(0, Math.min(1, user.relationship.trustScore + delta));
    user.relationship.lastInteraction = new Date().toISOString();
    await this.persist();
  }

  private async persist(): Promise<void> {
    if (!this.config) return;
    const filePath = `${this.workspaceDir}/ask_me_first/users.json`;
    this.writeFile(filePath, JSON.stringify(this.config, null, 2));
  }

  private writeFile(filePath: string, content: string): void {
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  async reload(): Promise<void> {
    this.config = null;
    this.cache.clear();
  }

  async decayTrustScores(): Promise<void> {
    await this.loadConfig();
    if (!this.config) return;

    const now = Date.now();
    let changed = false;

    for (const user of this.config.users) {
      if (!user.relationship?.lastInteraction) continue;
      const daysSince = (now - new Date(user.relationship.lastInteraction).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 1) continue;

      const decay = Math.floor(daysSince) * 0.01;
      const newScore = Math.max(0, user.relationship.trustScore - decay);
      if (newScore !== user.relationship.trustScore) {
        user.relationship.trustScore = newScore;
        changed = true;
      }
    }

    if (changed) {
      this.cache.clear();
      await this.persist();
    }
  }
}
