import { Download } from 'lucide-react';
import type { Message } from '@teamchat/shared';

interface MessageAttachmentsProps {
  message: Message;
  onDownload: (fileId: string, filename: string) => void;
}

export default function MessageAttachments({ message, onDownload }: MessageAttachmentsProps) {
  if (!message.files || message.files.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 space-y-2">
      {message.files.map((file) => (
        <div
          key={file.id}
          className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg"
        >
          <span className="text-sm text-gray-700 truncate max-w-[200px]">
            {file.originalName}
          </span>
          <span className="text-xs text-gray-500">
            ({(file.size / 1024).toFixed(1)} KB)
          </span>
          <button
            onClick={() => onDownload(file.id, file.originalName)}
            className="p-1 hover:bg-gray-200 rounded"
            title="Download"
          >
            <Download className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      ))}
    </div>
  );
}
