import type { FastifyInstance } from 'fastify';
import { errors } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import { assertZodSuccess } from './helpers/validation.js';

// Simple URL metadata fetcher
async function fetchUrlMetadata(url: string): Promise<{
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'TeamChatBot/1.0 (+https://teamchat.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      // Not an HTML page, return minimal info
      return { url };
    }

    const html = await response.text();
    const metadata: {
      url: string;
      title?: string;
      description?: string;
      image?: string;
      siteName?: string;
      favicon?: string;
    } = { url };

    // Parse Open Graph and meta tags
    const titleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i) ||
                       html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) metadata.title = decodeHtmlEntities(titleMatch[1].trim());

    const descMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i) ||
                      html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    if (descMatch) metadata.description = decodeHtmlEntities(descMatch[1].trim());

    const imageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
                       html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
    if (imageMatch) {
      let imageUrl = imageMatch[1].trim();
      // Convert relative URLs to absolute
      if (imageUrl.startsWith('/')) {
        const urlObj = new URL(url);
        imageUrl = `${urlObj.origin}${imageUrl}`;
      }
      metadata.image = imageUrl;
    }

    const siteNameMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i) ||
                          html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:site_name["']/i);
    if (siteNameMatch) metadata.siteName = decodeHtmlEntities(siteNameMatch[1].trim());

    // Try to get favicon
    const faviconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i) ||
                         html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
    if (faviconMatch) {
      let faviconUrl = faviconMatch[1].trim();
      if (faviconUrl.startsWith('/')) {
        const urlObj = new URL(url);
        faviconUrl = `${urlObj.origin}${faviconUrl}`;
      }
      metadata.favicon = faviconUrl;
    } else {
      // Default to /favicon.ico
      const urlObj = new URL(url);
      metadata.favicon = `${urlObj.origin}/favicon.ico`;
    }

    return metadata;
  } finally {
    clearTimeout(timeout);
  }
}

// Decode HTML entities
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ');
}

// URL validation
function isValidUrl(string: string): boolean {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Simple in-memory cache (could be replaced with Redis)
const previewCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedPreview(url: string) {
  const cached = previewCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedPreview(url: string, data: any) {
  // Clean old entries if cache is getting large
  if (previewCache.size > 1000) {
    const now = Date.now();
    for (const [key, value] of previewCache) {
      if (now - value.timestamp > CACHE_TTL) {
        previewCache.delete(key);
      }
    }
  }
  previewCache.set(url, { data, timestamp: Date.now() });
}

const previewSchema = z.object({
  url: z.string().url(),
});

export async function linkRoutes(app: FastifyInstance) {
  // Get link preview
  app.get<{ Querystring: { url: string } }>(
    '/preview',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const { url } = assertZodSuccess(
        previewSchema.safeParse(request.query),
        'Invalid URL'
      );

      if (!isValidUrl(url)) {
        throw errors.invalidInput('Invalid URL format');
      }

      // Check cache first
      const cached = getCachedPreview(url);
      if (cached) {
        return reply.send({ preview: cached });
      }

      try {
        const metadata = await fetchUrlMetadata(url);
        setCachedPreview(url, metadata);
        return reply.send({ preview: metadata });
      } catch (error) {
        // Return minimal preview on error
        return reply.send({
          preview: {
            url,
            error: true,
          },
        });
      }
    }
  );
}
