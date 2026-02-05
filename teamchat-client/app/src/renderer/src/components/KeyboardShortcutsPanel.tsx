import { useEffect, useRef } from 'react';
import { X, Keyboard } from 'lucide-react';

interface KeyboardShortcutsPanelProps {
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  shortcuts: Array<{
    keys: string[];
    description: string;
  }>;
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Open quick switcher' },
      { keys: ['⌘', '/'], description: 'Toggle keyboard shortcuts' },
      { keys: ['Esc'], description: 'Close panel / Cancel action' },
    ],
  },
  {
    title: 'Messages',
    shortcuts: [
      { keys: ['Enter'], description: 'Send message' },
      { keys: ['Shift', 'Enter'], description: 'New line in message' },
      { keys: ['↑'], description: 'Edit last message (in empty composer)' },
    ],
  },
  {
    title: 'Formatting',
    shortcuts: [
      { keys: ['⌘', 'B'], description: 'Bold text' },
      { keys: ['⌘', 'I'], description: 'Italic text' },
      { keys: ['⌘', 'E'], description: 'Inline code' },
    ],
  },
  {
    title: 'Mentions',
    shortcuts: [
      { keys: ['@'], description: 'Mention a user' },
      { keys: ['#'], description: 'Link to a channel' },
      { keys: ['Tab'], description: 'Accept autocomplete suggestion' },
      { keys: ['↑', '↓'], description: 'Navigate autocomplete' },
    ],
  },
  {
    title: 'Slash Commands',
    shortcuts: [
      { keys: ['/shrug'], description: 'Insert ¯\\_(ツ)_/¯' },
      { keys: ['/tableflip'], description: 'Insert (╯°□°)╯︵ ┻━┻' },
      { keys: ['/me'], description: 'Third-person action text' },
      { keys: ['/status'], description: 'Set custom status' },
      { keys: ['/away'], description: 'Set status to away' },
      { keys: ['/dnd'], description: 'Set do not disturb' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['⌘', 'Shift', 'A'], description: 'Toggle audio in call' },
      { keys: ['⌘', 'Shift', 'V'], description: 'Toggle video in call' },
    ],
  },
];

export default function KeyboardShortcutsPanel({ onClose }: KeyboardShortcutsPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-modal-backdrop">
      <div
        ref={containerRef}
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden animate-modal-enter"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <Keyboard className="w-6 h-6 text-primary-600" />
            <h2 className="text-xl font-bold">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {shortcutGroups.map((group) => (
              <div key={group.title}>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  {group.title}
                </h3>
                <div className="space-y-2">
                  {group.shortcuts.map((shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50"
                    >
                      <span className="text-gray-700">{shortcut.description}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <span key={keyIndex}>
                            <kbd className="px-2 py-1 bg-gray-100 border border-gray-200 rounded text-sm font-mono text-gray-700 shadow-sm">
                              {key}
                            </kbd>
                            {keyIndex < shortcut.keys.length - 1 && (
                              <span className="mx-1 text-gray-400">+</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Pro tip */}
          <div className="mt-8 p-4 bg-primary-50 rounded-lg">
            <p className="text-sm text-primary-800">
              <strong>Pro tip:</strong> Press{' '}
              <kbd className="px-1.5 py-0.5 bg-white border rounded text-xs font-mono">⌘</kbd>
              {' + '}
              <kbd className="px-1.5 py-0.5 bg-white border rounded text-xs font-mono">/</kbd>
              {' '}anytime to open this panel.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
