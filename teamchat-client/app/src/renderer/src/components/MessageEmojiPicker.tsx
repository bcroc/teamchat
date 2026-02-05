interface MessageEmojiPickerProps {
  isOpen: boolean;
  emojis: string[];
  onSelect: (emoji: string) => void;
}

export default function MessageEmojiPicker({
  isOpen,
  emojis,
  onSelect,
}: MessageEmojiPickerProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="absolute right-4 top-8 bg-white border rounded-lg shadow-lg p-2 z-10">
      <div className="flex gap-1">
        {emojis.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onSelect(emoji)}
            className="p-1.5 hover:bg-gray-100 rounded text-lg"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
