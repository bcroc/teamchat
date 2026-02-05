import { clsx } from 'clsx';
import type { Message } from '@teamchat/shared';

interface MessageReactionsProps {
  message: Message;
  userId?: string;
  onToggleReaction: (emoji: string) => void;
}

export default function MessageReactions({ message, userId, onToggleReaction }: MessageReactionsProps) {
  const groupedReactions = (message.reactions || []).reduce(
    (acc, reaction) => {
      if (!acc[reaction.emoji]) {
        acc[reaction.emoji] = { count: 0, users: [], hasOwn: false };
      }
      acc[reaction.emoji].count++;
      acc[reaction.emoji].users.push(reaction.user?.displayName || 'Unknown');
      if (reaction.userId === userId) {
        acc[reaction.emoji].hasOwn = true;
      }
      return acc;
    },
    {} as Record<string, { count: number; users: string[]; hasOwn: boolean }>
  );

  if (Object.keys(groupedReactions).length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {Object.entries(groupedReactions).map(([emoji, data]) => (
        <button
          key={emoji}
          onClick={() => onToggleReaction(emoji)}
          className={clsx(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm border',
            data.hasOwn
              ? 'bg-primary-50 border-primary-200 text-primary-700'
              : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
          )}
          title={data.users.join(', ')}
        >
          <span>{emoji}</span>
          <span className="text-xs">{data.count}</span>
        </button>
      ))}
    </div>
  );
}
