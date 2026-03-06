import { env } from '../../config';
import { SallaProductPayload, SallaProductResponse } from '../../types';
import { createHttpClient } from '../../utils/http';
import { withRetry } from '../../utils/retry';
import logger from '../../utils/logger';
import Bottleneck from 'bottleneck';

const limiter = new Bottleneck({ maxConcurrent: 3, minTime: 500 });

/**
 * Salla Merchant API integration.
 *
 * API Docs: https://docs.salla.dev/
 * Authentication: OAuth 2.0 (access token + refresh token)
 *
 * Required credentials:
 * - SALLA_CLIENT_ID
 * - SALLA_CLIENT_SECRET
 * - SALLA_ACCESS_TOKEN (obtained via OAuth flow)
 */
export class SallaIntegration {
  private http;
  private accessToken: string;

  constructor() {
    this.accessToken = env.SALLA_ACCESS_TOKEN;

    this.http = createHttpClient('https://api.salla.dev/admin/v2', {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    }, limiter);
  }

  isConfigured(): boolean {
    return !!(env.SALLA_CLIENT_ID && env.SALLA_ACCESS_TOKEN);
  }

  async createProduct(payload: SallaProductPayload): Promise<SallaProductResponse> {
    if (!this.isConfigured()) {
      throw new Error('Salla API not configured. Set SALLA_CLIENT_ID and SALLA_ACCESS_TOKEN.');
    }

    return withRetry(
      async () => {
        const response = await this.http.post('/products', {
          name: payload.name,
          description: payload.description,
          price: payload.price,
          compare_price: payload.compare_price,
          cost_price: payload.cost_price,
          sku: payload.sku,
          quantity: payload.quantity ?? 100,
          status: payload.status || 'hidden',
          product_type: 'product',
          metadata: payload.metadata,
        });

        const product = response.data?.data;
        logger.info(`Salla product created: ${product?.id} - ${product?.name}`);

        // Upload images if provided
        if (payload.images?.length && product?.id) {
          await this.uploadImages(product.id, payload.images);
        }

        return {
          id: product?.id,
          name: product?.name,
          url: product?.url || '',
          status: product?.status,
        };
      },
      { maxRetries: 2, context: 'salla_create_product' }
    );
  }

  async updateProduct(productId: number, payload: Partial<SallaProductPayload>): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Salla API not configured.');
    }

    return withRetry(
      async () => {
        await this.http.post(`/products/${productId}`, payload);
        logger.info(`Salla product updated: ${productId}`);
      },
      { maxRetries: 2, context: `salla_update_product:${productId}` }
    );
  }

  async updatePrice(productId: number, price: number, comparePrice?: number): Promise<void> {
    await this.updateProduct(productId, {
      price,
      compare_price: comparePrice,
    });
  }

  async updateStock(productId: number, quantity: number): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('Salla API not configured.');
    }

    return withRetry(
      async () => {
        await this.http.post(`/products/${productId}/quantities`, {
          quantity,
          operation: 'set',
        });
        logger.info(`Salla stock updated for product ${productId}: ${quantity}`);
      },
      { maxRetries: 2, context: `salla_stock:${productId}` }
    );
  }

  async setPublishState(productId: number, status: 'sale' | 'out' | 'hidden'): Promise<void> {
    await this.updateProduct(productId, { status });
  }

  async uploadImages(productId: number, images: { url: string }[]): Promise<void> {
    if (!this.isConfigured()) return;

    for (const image of images) {
      try {
        await withRetry(
          async () => {
            await this.http.post(`/products/${productId}/images`, {
              image: { url: image.url },
            });
          },
          { maxRetries: 1, context: `salla_image:${productId}` }
        );
      } catch (error) {
        // Image upload failure is non-fatal
        logger.warn(`Failed to upload image to Salla product ${productId}: ${error}`);
      }
    }
  }

  async getProduct(productId: number): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('Salla API not configured.');
    }

    const response = await this.http.get(`/products/${productId}`);
    return response.data?.data;
  }

  async listProducts(page = 1, perPage = 20): Promise<any[]> {
    if (!this.isConfigured()) {
      throw new Error('Salla API not configured.');
    }

    const response = await this.http.get('/products', {
      params: { page, per_page: perPage },
    });
    return response.data?.data || [];
  }

  /**
   * OAuth callback handler - exchange authorization code for tokens.
   * Used in the OAuth flow when connecting a Salla store.
   */
  async handleOAuthCallback(code: string): Promise<{ access_token: string; refresh_token: string }> {
    const response = await this.http.post('https://accounts.salla.sa/oauth2/token', {
      grant_type: 'authorization_code',
      client_id: env.SALLA_CLIENT_ID,
      client_secret: env.SALLA_CLIENT_SECRET,
      code,
      redirect_uri: env.SALLA_REDIRECT_URI,
    });

    const tokens = response.data;
    this.accessToken = tokens.access_token;
    logger.info('Salla OAuth tokens received');

    return {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    };
  }

  async refreshAccessToken(): Promise<string> {
    if (!env.SALLA_REFRESH_TOKEN) {
      throw new Error('No refresh token available');
    }

    const response = await this.http.post('https://accounts.salla.sa/oauth2/token', {
      grant_type: 'refresh_token',
      client_id: env.SALLA_CLIENT_ID,
      client_secret: env.SALLA_CLIENT_SECRET,
      refresh_token: env.SALLA_REFRESH_TOKEN,
    });

    this.accessToken = response.data.access_token;
    logger.info('Salla access token refreshed');
    return this.accessToken;
  }

  getOAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: env.SALLA_CLIENT_ID,
      redirect_uri: env.SALLA_REDIRECT_URI,
      response_type: 'code',
      scope: 'offline_access',
    });
    return `https://accounts.salla.sa/oauth2/auth?${params}`;
  }
}
