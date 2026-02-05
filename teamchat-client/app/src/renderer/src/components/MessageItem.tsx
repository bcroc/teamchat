/**
 * Message Item Component
 *
 * Renders a single message with all interactive features:
 * - Avatar with online presence indicator
 * - Message body with markdown support
 * - Reactions display and quick add
 * - Thread reply indicator
 * - File attachments with download
 * - Action toolbar (edit, delete, pin, save)
 *
 * @module apps/desktop/src/renderer/src/components/MessageItem
 */

import { useState } from 'react';
import { useWorkspaceStore } from '../stores/workspace';
import { useAuthStore } from '../stores/auth';
import { useSocketStore } from '../stores/socket';
import { format } from 'date-fns';
import { MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';
import MessageContent from './MessageContent';
import MessageActions from './MessageActions';
import MessageReactions from './MessageReactions';
import MessageAttachments from './MessageAttachments';
import MessageEditor from './MessageEditor';
import MessageEmojiPicker from './MessageEmojiPicker';
import { useMessageActions } from '../hooks/useMessageActions';
import type { Message } from '@teamchat/shared';

interface MessageItemProps {
  message: Message;
  isThread?: boolean;
}

const EMOJI_LIST = ['👍', '❤️', '😂', '🎉', '🤔', '👀', '🚀', '✅'];

export default function MessageItem({ message, isThread = false }: MessageItemProps) {
  const { user } = useAuthStore();
  const { openThread } = useWorkspaceStore();
  const { onlineUsers } = useSocketStore();
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(message.body);

  const isOwn = message.senderId === user?.id;
  const isOnline = message.senderId ? onlineUsers.has(message.senderId) : false;
  const {
    isSaved,
    canPin,
    toggleReaction,
    toggleSave,
    pin,
    editMessage,
    deleteMessage,
    downloadFile,
    editMutationPending,
  } = useMessageActions(message, user?.id);

  const handleEdit = () => {
    if (editBody.trim() && editBody !== message.body) {
      editMessage(editBody.trim(), () => {
        setIsEditing(false);
      });
    } else {
      setIsEditing(false);
      setEditBody(message.body);
    }
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this message?')) {
      deleteMessage();
    }
  };

  return (
    <div
      className={clsx(
        'group relative px-4 py-2 hover:bg-gray-50 rounded-lg',
        message.isDeleted && 'opacity-50'
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        setShowActions(false);
        setShowEmojiPicker(false);
      }}
    >
      <div className="flex gap-3">
        {/* Avatar with presence indicator */}
        <div className="relative flex-shrink-0">
          <div className="w-9 h-9 rounded-lg bg-primary-500 flex items-center justify-center text-white font-medium">
            {message.sender?.displayName?.charAt(0).toUpperCase() || '?'}
          </div>
          {isOnline && (
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-gray-900">
              {message.sender?.displayName || 'Unknown'}
            </span>
            <span className="text-xs text-gray-500">
              {format(new Date(message.createdAt), 'h:mm a')}
            </span>
            {message.updatedAt !== message.createdAt && (
              <span className="text-xs text-gray-400">(edited)</span>
            )}
          </div>

          {/* Message body */}
          {isEditing ? (
            <MessageEditor
              value={editBody}
              isSaving={editMutationPending}
              onChange={setEditBody}
              onSave={handleEdit}
              onCancel={() => {
                setIsEditing(false);
                setEditBody(message.body);
              }}
            />
          ) : (
            <MessageContent content={message.body} className="text-gray-800" />
          )}

          <MessageAttachments message={message} onDownload={downloadFile} />
          <MessageReactions
            message={message}
            userId={user?.id}
            onToggleReaction={(emoji) => {
              toggleReaction(emoji);
              setShowEmojiPicker(false);
            }}
          />

          {/* Thread replies indicator */}
          {!isThread && message.replyCount && message.replyCount > 0 && (
            <button
              onClick={() => openThread(message.id)}
              className="mt-2 text-sm text-primary-600 hover:underline flex items-center gap-1"
            >
              <MessageSquare className="w-4 h-4" />
              {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
            </button>
          )}
        </div>
      </div>

      <MessageActions
        isThread={isThread}
        isEditing={isEditing}
        isDeleted={!!message.isDeleted}
        isOwn={isOwn}
        canPin={canPin}
        isSaved={isSaved}
        showActions={showActions}
        onToggleEmojiPicker={() => setShowEmojiPicker(!showEmojiPicker)}
        onReply={() => openThread(message.id)}
        onToggleSave={toggleSave}
        onPin={pin}
        onEdit={() => setIsEditing(true)}
        onDelete={handleDelete}
      />

      <MessageEmojiPicker
        isOpen={showEmojiPicker}
        emojis={EMOJI_LIST}
        onSelect={(emoji) => {
          toggleReaction(emoji);
          setShowEmojiPicker(false);
        }}
      />
    </div>
  );
}
