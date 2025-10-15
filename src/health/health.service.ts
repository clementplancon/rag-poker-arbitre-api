import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class HealthService {
  constructor(private readonly http: HttpService) {}

  async checkQdrant(qdrantUrl: string) {
    try {
      const url = `${qdrantUrl.replace(/\/$/, '')}/readyz`;
      const res = await firstValueFrom(this.http.get(url));
      const ok =
        res.status === 200 && String(res.data).toLowerCase().includes('ready');
      return {
        name: 'qdrant',
        status: ok ? 'ok' : 'error',
        httpStatus: res.status,
        data: res.data,
      };
    } catch (e: unknown) {
      return {
        name: 'qdrant',
        status: 'error',
        error: this.getErrorMessage(e),
      };
    }
  }

  async checkMistral(apiUrl: string, apiKey?: string) {
    if (!apiKey) {
      return { name: 'mistral', status: 'error', error: 'missing_api_key' };
    }
    try {
      const res = await firstValueFrom(
        this.http.get(`${apiUrl.replace(/\/$/, '')}/v1/models`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        }),
      );
      const ok =
        res.status >= 200 && res.status < 300 && Array.isArray(res.data?.data);
      const models = ok
        ? res.data.data?.map((m: any) => m.id).slice(0, 10)
        : [];
      return {
        name: 'mistral',
        status: ok ? 'ok' : 'error',
        httpStatus: res.status,
        models,
      };
    } catch (e: unknown) {
      return {
        name: 'mistral',
        status: 'error',
        error: this.getErrorMessage(e),
      };
    }
  }

  overallStatus(components: { status: string }[]) {
    return components.every((c) => c.status === 'ok') ? 'ok' : 'error';
  }

  private getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    try {
      return JSON.stringify(err);
    } catch {
      return 'Unknown error';
    }
  }
}
