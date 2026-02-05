import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { ExternalLink, Globe } from 'lucide-react';

interface LinkPreviewProps {
  url: string;
}

interface PreviewData {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
  error?: boolean;
}

export default function LinkPreview({ url }: LinkPreviewProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['link-preview', url],
    queryFn: () => api.get<{ preview: PreviewData }>('/links/preview', { url }),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });

  // Don't render anything while loading or on error
  if (isLoading || error || !data?.preview || data.preview.error) {
    return null;
  }

  const preview = data.preview;

  // Don't render if no meaningful content
  if (!preview.title && !preview.description && !preview.image) {
    return null;
  }

  const hostname = (() => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return '';
    }
  })();

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block mt-2 border border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 hover:bg-gray-50 transition-colors max-w-lg group"
    >
      <div className="flex">
        {/* Image preview */}
        {preview.image && (
          <div className="flex-shrink-0 w-32 h-24 bg-gray-100">
            <img
              src={preview.image}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                // Hide broken images
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 p-3 min-w-0">
          {/* Site info */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
            {preview.favicon ? (
              <img
                src={preview.favicon}
                alt=""
                className="w-3.5 h-3.5"
                onError={(e) => {
                  // Replace with globe icon on error
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <Globe className="w-3.5 h-3.5" />
            )}
            <span className="truncate">{preview.siteName || hostname}</span>
          </div>

          {/* Title */}
          {preview.title && (
            <h4 className="text-sm font-medium text-gray-900 line-clamp-1 group-hover:text-primary-600 transition-colors">
              {preview.title}
            </h4>
          )}

          {/* Description */}
          {preview.description && (
            <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">
              {preview.description}
            </p>
          )}
        </div>

        {/* External link indicator */}
        <div className="flex items-center pr-3 text-gray-400 group-hover:text-gray-600">
          <ExternalLink className="w-4 h-4" />
        </div>
      </div>
    </a>
  );
}

// Helper function to extract URLs from text
export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const matches = text.match(urlRegex) || [];

  // Deduplicate and clean URLs (remove trailing punctuation)
  const cleaned = matches.map((url) => {
    // Remove common trailing punctuation that might be part of the sentence
    return url.replace(/[.,;:!?)]+$/, '');
  });

  return [...new Set(cleaned)];
}
