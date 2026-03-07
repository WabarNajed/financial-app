import OpenAI from 'openai';
import { env } from '../../config';
import { DiscoveredProduct, GeneratedContent } from '../../types';
import { ContentRepo, ProductRepo } from '../../database/repositories';
import logger from '../../utils/logger';
import { withRetry } from '../../utils/retry';

/**
 * Arabic content generation service using LLM (OpenAI or Anthropic).
 * Generates product listings, ad copy, and marketing content
 * tailored for the Saudi market.
 */
export class ArabicContentGenerator {
  private openai: OpenAI | null = null;

  constructor() {
    if (env.LLM_PROVIDER === 'openai' && env.OPENAI_API_KEY) {
      this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    }
  }

  isConfigured(): boolean {
    return this.openai !== null;
  }

  async generateContent(productId: string): Promise<GeneratedContent> {
    const product = await ProductRepo.findById(productId);
    if (!product) throw new Error(`Product ${productId} not found`);

    if (!this.isConfigured()) {
      logger.warn('LLM not configured, returning placeholder content');
      return this.generatePlaceholderContent(productId, product);
    }

    return withRetry(
      async () => {
        const prompt = this.buildPrompt(product);
        const response = await this.openai!.chat.completions.create({
          model: env.OPENAI_MODEL,
          messages: [
            {
              role: 'system',
              content: `You are an expert Arabic copywriter specializing in Saudi Arabian e-commerce.
You write product content that is:
- Natural Saudi-friendly Arabic (not formal/literary)
- Persuasive but honest - no exaggerated claims
- Clean and professional
- SEO-optimized for Saudi search behavior
- Culturally appropriate for the Saudi market

Always respond in valid JSON format only.`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          response_format: { type: 'json_object' },
        });

        const content = JSON.parse(response.choices[0]?.message?.content || '{}');
        const generatedContent = this.mapLLMResponse(productId, content);

        await ContentRepo.upsert(generatedContent);
        logger.info(`Generated Arabic content for product ${productId}`);

        return generatedContent;
      },
      { maxRetries: 2, context: `content_gen:${productId}` }
    );
  }

  private buildPrompt(product: DiscoveredProduct): string {
    return `Generate complete Arabic e-commerce content for this product:

Product Name: ${product.name}
Category: ${product.category}
Keywords: ${product.keywords.join(', ')}

Generate the following in Arabic, formatted as JSON:

{
  "title_ar": "Arabic product title (max 80 chars, include key feature)",
  "description_ar": "Arabic product description (150-300 words, highlight benefits, include specs if applicable)",
  "bullet_benefits_ar": ["benefit 1", "benefit 2", "benefit 3", "benefit 4", "benefit 5"],
  "short_sales_copy_ar": "Short sales copy for listings (2-3 sentences)",
  "seo_meta_title_ar": "SEO meta title in Arabic (max 60 chars)",
  "seo_meta_description_ar": "SEO meta description in Arabic (max 155 chars)",
  "ad_hook_ar": "Short ad hook in Arabic (1 sentence, attention-grabbing)",
  "tiktok_script_idea_ar": "TikTok video script idea in Arabic (30-60 second concept)",
  "snapchat_ad_angle_ar": "Snapchat ad angle in Arabic (quick, visual-first concept)",
  "instagram_reel_caption_ar": "Instagram reel caption in Arabic with relevant hashtags"
}

Requirements:
- Use Saudi Arabic dialect where natural
- Do not use overly formal Arabic
- Avoid fake urgency or misleading claims
- Focus on real benefits
- Include relevant Saudi-market hashtags in Instagram caption
- Make TikTok script engaging and trend-aware
- All values must be in Arabic`;
  }

  private mapLLMResponse(productId: string, content: any): GeneratedContent {
    return {
      product_id: productId,
      title_ar: content.title_ar || '',
      description_ar: content.description_ar || '',
      bullet_benefits_ar: Array.isArray(content.bullet_benefits_ar) ? content.bullet_benefits_ar : [],
      short_sales_copy_ar: content.short_sales_copy_ar || '',
      seo_meta_title_ar: content.seo_meta_title_ar || '',
      seo_meta_description_ar: content.seo_meta_description_ar || '',
      ad_hook_ar: content.ad_hook_ar || '',
      tiktok_script_idea_ar: content.tiktok_script_idea_ar || '',
      snapchat_ad_angle_ar: content.snapchat_ad_angle_ar || '',
      instagram_reel_caption_ar: content.instagram_reel_caption_ar || '',
      generated_at: new Date(),
    };
  }

  private generatePlaceholderContent(productId: string, product: DiscoveredProduct): GeneratedContent {
    return {
      product_id: productId,
      title_ar: `[يتطلب مفتاح API] ${product.name}`,
      description_ar: `[يتطلب إعداد LLM] وصف المنتج: ${product.name}`,
      bullet_benefits_ar: [
        '[يتطلب مفتاح API للمحتوى العربي]',
        `المنتج: ${product.name}`,
        `الفئة: ${product.category}`,
        'يرجى إعداد OPENAI_API_KEY أو ANTHROPIC_API_KEY',
        'لإنشاء محتوى عربي احترافي',
      ],
      short_sales_copy_ar: '[يتطلب إعداد LLM]',
      seo_meta_title_ar: '[يتطلب إعداد LLM]',
      seo_meta_description_ar: '[يتطلب إعداد LLM]',
      ad_hook_ar: '[يتطلب إعداد LLM]',
      tiktok_script_idea_ar: '[يتطلب إعداد LLM]',
      snapchat_ad_angle_ar: '[يتطلب إعداد LLM]',
      instagram_reel_caption_ar: '[يتطلب إعداد LLM]',
      generated_at: new Date(),
    };
  }
}
