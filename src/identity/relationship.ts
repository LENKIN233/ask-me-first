import { UserEntry, Relationship, defaultRelationship } from './types.js';

export class RelationshipAnalyzer {
  private getRelationship(user: UserEntry): Relationship {
    return user.relationship ?? defaultRelationship();
  }

  isSameTeam(user: UserEntry, targetTeam?: string): boolean {
    if (!targetTeam) return false;
    return this.getRelationship(user).team === targetTeam;
  }

  hasProjectAccess(user: UserEntry, project: string): boolean {
    return this.getRelationship(user).project.includes(project);
  }

  trustLevel(user: UserEntry): 'low' | 'medium' | 'high' {
    const score = this.getRelationship(user).trustScore;
    if (score >= 0.8) return 'high';
    if (score >= 0.5) return 'medium';
    return 'low';
  }

  needsVerification(user: UserEntry, action: 'escalate' | 'sensitive' | 'commitment'): boolean {
    const level = this.trustLevel(user);
    if (level === 'high') return false;
    if (action === 'sensitive' && level === 'medium') return true;
    if (action === 'commitment' && this.getRelationship(user).trustScore < 0.7) return true;
    return true;
  }
}
