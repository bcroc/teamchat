import { useState, useRef, useEffect } from 'react';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const EMOJI_CATEGORIES = {
  'Smileys': [
    '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌',
    '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗',
    '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥',
    '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶',
    '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️',
    '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱',
    '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿',
  ],
  'Gestures': [
    '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙',
    '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏',
    '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻',
  ],
  'People': [
    '👶', '👧', '🧒', '👦', '👩', '🧑', '👨', '👩‍🦱', '🧑‍🦱', '👨‍🦱', '👩‍🦰', '🧑‍🦰', '👨‍🦰',
    '👱‍♀️', '👱', '👱‍♂️', '👩‍🦳', '🧑‍🦳', '👨‍🦳', '👩‍🦲', '🧑‍🦲', '👨‍🦲', '🧔‍♀️', '🧔', '🧔‍♂️',
    '👵', '🧓', '👴', '👲', '👳‍♀️', '👳', '👳‍♂️', '🧕', '👮‍♀️', '👮', '👮‍♂️', '👷‍♀️', '👷',
  ],
  'Nature': [
    '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨', '🐯', '🦁', '🐮',
    '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥',
    '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🪱', '🐛', '🦋', '🐌',
    '🌸', '💮', '🏵️', '🌹', '🥀', '🌺', '🌻', '🌼', '🌷', '🌱', '🪴', '🌲', '🌳',
    '🌴', '🌵', '🌾', '🌿', '☘️', '🍀', '🍁', '🍂', '🍃', '🍇', '🍈', '🍉', '🍊',
  ],
  'Food': [
    '🍕', '🍔', '🍟', '🌭', '🍿', '🧂', '🥓', '🥚', '🍳', '🧇', '🥞', '🧈', '🍞',
    '🥐', '🥖', '🫓', '🥨', '🥯', '🥙', '🧆', '🌮', '🌯', '🫔', '🥗', '🥘', '🫕',
    '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🦪', '🍤', '🍙', '🍚', '🍘', '🍥',
    '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫', '🍬', '🍭', '🍮',
    '☕', '🍵', '🧃', '🥤', '🧋', '🍶', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹',
  ],
  'Activities': [
    '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸',
    '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋',
    '🎽', '🛹', '🛼', '🛷', '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️‍♀️', '🏋️', '🏋️‍♂️',
    '🎮', '🎲', '🧩', '🎰', '🎳', '🎯', '🎭', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹',
  ],
  'Objects': [
    '💻', '🖥️', '🖨️', '⌨️', '🖱️', '🖲️', '💽', '💾', '💿', '📀', '📼', '📷', '📸',
    '📹', '🎥', '📽️', '🎞️', '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️',
    '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯️', '🪔',
    '📚', '📖', '📰', '📓', '📕', '📗', '📘', '📙', '📔', '📒', '📝', '✏️', '✒️',
  ],
  'Symbols': [
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞',
    '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯',
    '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏',
    '✅', '✔️', '☑️', '❌', '❎', '➕', '➖', '➗', '✖️', '💲', '💱', '©️', '®️',
    '™️', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔶', '🔷', '🔸',
  ],
};

type CategoryName = keyof typeof EMOJI_CATEGORIES;

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryName>('Smileys');
  const [searchQuery, setSearchQuery] = useState('');
  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('recentEmojis');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleEmojiSelect = (emoji: string) => {
    // Update recent emojis
    const updatedRecent = [emoji, ...recentEmojis.filter((e) => e !== emoji)].slice(0, 24);
    setRecentEmojis(updatedRecent);
    localStorage.setItem('recentEmojis', JSON.stringify(updatedRecent));

    onSelect(emoji);
  };

  const categoryIcons: Record<CategoryName, string> = {
    'Smileys': '😀',
    'Gestures': '👋',
    'People': '👤',
    'Nature': '🌿',
    'Food': '🍕',
    'Activities': '⚽',
    'Objects': '💻',
    'Symbols': '❤️',
  };

  // Filter emojis based on search
  const getFilteredEmojis = () => {
    if (!searchQuery) {
      return activeCategory === 'Smileys' && recentEmojis.length > 0
        ? { Recent: recentEmojis, [activeCategory]: EMOJI_CATEGORIES[activeCategory] }
        : { [activeCategory]: EMOJI_CATEGORIES[activeCategory] };
    }

    // Simple search - just return all emojis (could be enhanced with emoji names)
    const allEmojis = Object.values(EMOJI_CATEGORIES).flat();
    return { 'Search Results': allEmojis };
  };

  const filteredEmojis = getFilteredEmojis();

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full mb-2 left-0 w-80 bg-white rounded-lg shadow-xl border z-50 overflow-hidden"
    >
      {/* Search */}
      <div className="p-2 border-b">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search emojis..."
          className="w-full px-3 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          autoFocus
        />
      </div>

      {/* Category tabs */}
      {!searchQuery && (
        <div className="flex border-b px-1 py-1 gap-0.5 overflow-x-auto">
          {(Object.keys(EMOJI_CATEGORIES) as CategoryName[]).map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`p-2 rounded text-lg hover:bg-gray-100 transition-colors flex-shrink-0 ${
                activeCategory === category ? 'bg-gray-100' : ''
              }`}
              title={category}
            >
              {categoryIcons[category]}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div className="h-64 overflow-y-auto p-2">
        {Object.entries(filteredEmojis).map(([category, emojis]) => (
          <div key={category}>
            <div className="text-xs font-medium text-gray-500 mb-2 px-1">{category}</div>
            <div className="grid grid-cols-8 gap-0.5 mb-3">
              {emojis.map((emoji, index) => (
                <button
                  key={`${emoji}-${index}`}
                  onClick={() => handleEmojiSelect(emoji)}
                  className="p-1.5 text-xl hover:bg-gray-100 rounded transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
