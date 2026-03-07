import { discoverFromAliExpress } from '../discovery/aliexpress';
import { discoverFromAmazon } from '../discovery/amazon';
import { discoverFromTikTok } from '../discovery/tiktok';
import { DiscoveredProduct } from '../discovery/types';
import { dedupeProducts } from '../discovery/utils';

export class DiscoveryOrchestratorService {
  async discover(keywords: string[]): Promise<DiscoveredProduct[]> {
    const cleanKeywords = (keywords || [])
      .map((k) => String(k).trim())
      .filter(Boolean);

    const seedKeywords = cleanKeywords.length
      ? cleanKeywords
      : ['portable blender', 'galaxy projector', 'massage gun'];

    const [tiktok, amazon, aliexpress] = await Promise.all([
      discoverFromTikTok(seedKeywords),
      discoverFromAmazon(seedKeywords),
      discoverFromAliExpress(seedKeywords),
    ]);

    return dedupeProducts([...tiktok, ...amazon, ...aliexpress]);
  }
}
