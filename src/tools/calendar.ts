/**
 * 飞书日历工具
 * 需要环境变量: FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_CALENDAR_ID (可选)
 * 无凭证时优雅降级返回空数组
 */

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  isBusy: boolean;
}

interface FeishuTokenResponse {
  code: number;
  msg: string;
  tenant_access_token?: string;
  expire?: number;
}

interface FeishuCalendarEvent {
  event_id: string;
  summary: string;
  start_time: { timestamp?: string; date?: string };
  end_time: { timestamp?: string; date?: string };
  status: string;  // 'confirmed' | 'tentative' | 'cancelled'
  visibility: string;
  free_busy_status?: string; // 'busy' | 'free'
}

interface FeishuEventListResponse {
  code: number;
  msg: string;
  data?: {
    items?: FeishuCalendarEvent[];
    page_token?: string;
    has_more?: boolean;
  };
}

export class CalendarTool {
  private appId: string;
  private appSecret: string;
  private calendarId: string;
  private tokenCache: { token: string; expiresAt: number } | null = null;
  private available: boolean;

  constructor(config?: { appId?: string; appSecret?: string; calendarId?: string }) {
    this.appId = config?.appId || process.env.FEISHU_APP_ID || '';
    this.appSecret = config?.appSecret || process.env.FEISHU_APP_SECRET || '';
    this.calendarId = config?.calendarId || process.env.FEISHU_CALENDAR_ID || 'primary';
    this.available = !!(this.appId && this.appSecret);

    if (!this.available) {
      console.warn('[CalendarTool] 飞书凭证未配置（FEISHU_APP_ID/FEISHU_APP_SECRET），日历功能已禁用');
    }
  }

  async getUpcomingEvents(hours: number = 1): Promise<CalendarEvent[]> {
    if (!this.available) return [];

    try {
      const token = await this.getTenantToken();
      if (!token) return [];

      const now = Math.floor(Date.now() / 1000);
      const end = now + hours * 3600;

      const url = `https://open.feishu.cn/open-apis/calendar/v4/calendars/${this.calendarId}/events?start_time=${now}&end_time=${end}&page_size=50`;

      const resp = await this.httpGet<FeishuEventListResponse>(url, {
        Authorization: `Bearer ${token}`
      });

      if (resp.code !== 0 || !resp.data?.items) {
        console.warn(`[CalendarTool] API 返回异常: code=${resp.code}, msg=${resp.msg}`);
        return [];
      }

      return resp.data.items
        .filter(ev => ev.status !== 'cancelled')
        .map(ev => this.normalize(ev));
    } catch (error) {
      console.warn(`[CalendarTool] 获取日历事件失败: ${error}`);
      return [];
    }
  }

  async isCurrentlyInEvent(): Promise<boolean> {
    const events = await this.getUpcomingEvents(1);
    const now = new Date();
    return events.some(ev => new Date(ev.start) <= now && new Date(ev.end) >= now);
  }

  async getCurrentEvent(): Promise<CalendarEvent | null> {
    const events = await this.getUpcomingEvents(1);
    const now = new Date();
    return events.find(ev => new Date(ev.start) <= now && new Date(ev.end) >= now) ?? null;
  }

  isAvailable(): boolean {
    return this.available;
  }

  private async getTenantToken(): Promise<string | null> {
    const now = Date.now();
    if (this.tokenCache && now < this.tokenCache.expiresAt) {
      return this.tokenCache.token;
    }

    try {
      const resp = await this.httpPost<FeishuTokenResponse>(
        'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
        { app_id: this.appId, app_secret: this.appSecret }
      );

      if (resp.code !== 0 || !resp.tenant_access_token) {
        console.warn(`[CalendarTool] 获取 token 失败: code=${resp.code}, msg=${resp.msg}`);
        return null;
      }

      // 提前 60s 过期，避免边界问题
      this.tokenCache = {
        token: resp.tenant_access_token,
        expiresAt: now + ((resp.expire ?? 7200) - 60) * 1000
      };

      return this.tokenCache.token;
    } catch (error) {
      console.warn(`[CalendarTool] token 请求失败: ${error}`);
      return null;
    }
  }

  private normalize(ev: FeishuCalendarEvent): CalendarEvent {
    const startTs = ev.start_time.timestamp
      ? new Date(parseInt(ev.start_time.timestamp) * 1000).toISOString()
      : ev.start_time.date ?? '';

    const endTs = ev.end_time.timestamp
      ? new Date(parseInt(ev.end_time.timestamp) * 1000).toISOString()
      : ev.end_time.date ?? '';

    return {
      id: ev.event_id,
      title: ev.summary || '（无标题）',
      start: startTs,
      end: endTs,
      isBusy: ev.free_busy_status !== 'free'
    };
  }

  private httpGet<T>(url: string, headers: Record<string, string>): Promise<T> {
    return new Promise((resolve, reject) => {
      const https = require('https');
      const parsed = new URL(url);

      const req = https.request({
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        }
      }, (res: any) => {
        let data = '';
        res.on('data', (chunk: string) => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`JSON parse error: ${data.slice(0, 200)}`)); }
        });
      });

      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    });
  }

  private httpPost<T>(url: string, body: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const https = require('https');
      const parsed = new URL(url);
      const payload = JSON.stringify(body);

      const req = https.request({
        hostname: parsed.hostname,
        path: parsed.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (res: any) => {
        let data = '';
        res.on('data', (chunk: string) => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`JSON parse error: ${data.slice(0, 200)}`)); }
        });
      });

      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout')); });
      req.write(payload);
      req.end();
    });
  }
}
