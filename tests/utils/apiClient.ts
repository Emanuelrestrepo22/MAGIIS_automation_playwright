// tests/utils/apiClient.ts
import { APIRequestContext } from '@playwright/test';

export class ApiClient {
  private readonly authUrl: string;

  constructor(private readonly request: APIRequestContext) {
    this.authUrl = process.env.AUTH_API_URL as string;
  }

  async loginCarrier() {
    const payload = {
      username: process.env.USER_CARRIER,
      password: process.env.PASS_CARRIER,
    };

    const response = await this.request.post(this.authUrl, {
      data: payload,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      failOnStatusCode: false, // NO tirar excepción automática; la controlamos nosotros
    });

    const status = response.status();
    const rawBody = await response.text();

    console.log('[TS-AUTH-TC02][AUTH LOGIN] Request:', {
      url: this.authUrl,
      payload,
      status,
      rawBody,
    });

    return { response, status, rawBody };
  }
}
