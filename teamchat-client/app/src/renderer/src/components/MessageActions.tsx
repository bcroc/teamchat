import { Bookmark, MessageSquare, Pin, Pencil, Smile, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';

interface MessageActionsProps {
  isThread: boolean;
  isEditing: boolean;
  isDeleted: boolean;
  isOwn: boolean;
  canPin: boolean;
  isSaved: boolean;
  showActions: boolean;
  onToggleEmojiPicker: () => void;
  onReply: () => void;
  onToggleSave: () => void;
  onPin: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function MessageActions({
  isThread,
  isEditing,
  isDeleted,
  isOwn,
  canPin,
  isSaved,
  showActions,
  onToggleEmojiPicker,
  onReply,
  onToggleSave,
  onPin,
  onEdit,
  onDelete,
}: MessageActionsProps) {
  if (!showActions || isDeleted || isEditing) {
    return null;
  }

  return (
    <div className="absolute right-4 top-0 -translate-y-1/2 flex items-center gap-1 bg-white border rounded-lg shadow-sm p-1">
      <button
        onClick={onToggleEmojiPicker}
        className="p-1.5 hover:bg-gray-100 rounded"
        title="Add reaction"
      >
        <Smile className="w-4 h-4 text-gray-600" />
      </button>

      {!isThread && (
        <button
          onClick={onReply}
          className="p-1.5 hover:bg-gray-100 rounded"
          title="Reply in thread"
        >
          <MessageSquare className="w-4 h-4 text-gray-600" />
        </button>
      )}

      <button
        onClick={onToggleSave}
        className="p-1.5 hover:bg-gray-100 rounded"
        title={isSaved ? 'Remove from saved' : 'Save message'}
      >
        <Bookmark
          className={clsx(
            'w-4 h-4',
            isSaved ? 'text-primary-600 fill-primary-600' : 'text-gray-600'
          )}
        />
      </button>

      {canPin && (
        <button
          onClick={onPin}
          className="p-1.5 hover:bg-gray-100 rounded"
          title="Pin to channel"
        >
          <Pin className="w-4 h-4 text-gray-600" />
        </button>
      )}

      {isOwn && (
        <>
          <button
            onClick={onEdit}
            className="p-1.5 hover:bg-gray-100 rounded"
            title="Edit"
          >
            <Pencil className="w-4 h-4 text-gray-600" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 hover:bg-gray-100 rounded"
            title="Delete"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </>
      )}
    </div>
  );
}
