import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent, useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useSocketStore } from '../stores/socket';
import { useDraftsStore, getDraftKey } from '../stores/drafts';
import { Send, Paperclip, X, Smile, AtSign, Bold, Italic, Code, List } from 'lucide-react';
import { toast } from '../stores/toast';
import EmojiPicker from './EmojiPicker';
import MentionAutocomplete, { MentionItem } from './MentionAutocomplete';
import SlashCommandAutocomplete, { SlashCommandResult } from './SlashCommandAutocomplete';

interface MessageComposerProps {
  workspaceId: string;
  channelId?: string;
  dmThreadId?: string;
  parentId?: string;
  placeholder?: string;
}

interface PendingFile {
  id: string;
  file: File;
  uploading: boolean;
}

export default function MessageComposer({
  workspaceId,
  channelId,
  dmThreadId,
  parentId,
  placeholder = 'Type a message...',
}: MessageComposerProps) {
  const queryClient = useQueryClient();
  const { getDraft, setDraft, clearDraft } = useDraftsStore();

  // Calculate draft key
  const draftKey = useMemo(
    () => getDraftKey({ channelId, dmThreadId, parentId }),
    [channelId, dmThreadId, parentId]
  );

  // Initialize body from draft
  const [body, setBody] = useState(() => getDraft(draftKey));
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashPosition, setSlashPosition] = useState({ top: 0, left: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const draftTimeoutRef = useRef<NodeJS.Timeout>();
  const composerRef = useRef<HTMLDivElement>(null);

  const { startTyping, stopTyping } = useSocketStore();

  const scope = channelId ? { channelId } : dmThreadId ? { dmThreadId } : null;

  // Load draft when scope changes
  useEffect(() => {
    const savedDraft = getDraft(draftKey);
    setBody(savedDraft);
  }, [draftKey, getDraft]);

  // Save draft with debounce
  useEffect(() => {
    if (draftTimeoutRef.current) {
      clearTimeout(draftTimeoutRef.current);
    }

    draftTimeoutRef.current = setTimeout(() => {
      if (draftKey) {
        setDraft(draftKey, body);
      }
    }, 500);

    return () => {
      if (draftTimeoutRef.current) {
        clearTimeout(draftTimeoutRef.current);
      }
    };
  }, [body, draftKey, setDraft]);

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async (data: {
      body: string;
      fileIds?: string[];
    }) => {
      return api.post<{ message: any }>('/messages', {
        workspaceId,
        channelId,
        dmThreadId,
        parentId,
        body: data.body,
        fileIds: data.fileIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      setBody('');
      setPendingFiles([]);
      if (draftKey) clearDraft(draftKey);
      if (scope) stopTyping(scope);
    },
    onError: () => {
      toast.error('Failed to send message');
    },
  });

  // Upload file mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      return api.upload<{ file: { id: string } }>('/files', file, { workspaceId });
    },
  });

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [body]);

  // Detect mention trigger
  const detectMention = useCallback((text: string, cursorPosition: number) => {
    // Look backwards from cursor to find @ symbol
    let start = cursorPosition - 1;
    while (start >= 0 && text[start] !== ' ' && text[start] !== '\n') {
      if (text[start] === '@') {
        const query = text.slice(start + 1, cursorPosition);
        // Only show if query doesn't contain spaces and isn't too long
        if (!query.includes(' ') && query.length <= 20) {
          return { start, query };
        }
        break;
      }
      start--;
    }
    return null;
  }, []);

  // Detect slash command at start of message
  const detectSlashCommand = useCallback((text: string, cursorPosition: number) => {
    // Only trigger if message starts with "/" and cursor is in the command portion
    if (!text.startsWith('/')) return null;

    // Find where the command ends (space or end of text)
    const spaceIndex = text.indexOf(' ');
    const commandEnd = spaceIndex === -1 ? text.length : spaceIndex;

    // Only show autocomplete if cursor is within the command area
    // or if user just typed / and is starting a command
    if (cursorPosition <= commandEnd || text.length === 1) {
      return text.slice(1); // Return everything after the /
    }

    return null;
  }, []);

  // Handle typing indicator and mention detection
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newBody = e.target.value;
    const cursorPosition = e.target.selectionStart;
    setBody(newBody);

    // Detect slash commands (only at start of message)
    const slashCmd = detectSlashCommand(newBody, cursorPosition);
    if (slashCmd !== null) {
      setShowSlashCommands(true);
      setSlashQuery(slashCmd);
      setShowMentions(false);
      setMentionQuery('');
      setMentionStartIndex(-1);

      // Calculate position for autocomplete
      if (composerRef.current) {
        setSlashPosition({ top: 50, left: 0 });
      }
    } else {
      setShowSlashCommands(false);
      setSlashQuery('');

      // Detect mentions (only if not showing slash commands)
      const mention = detectMention(newBody, cursorPosition);
      if (mention) {
        setShowMentions(true);
        setMentionQuery(mention.query);
        setMentionStartIndex(mention.start);

        // Calculate position for autocomplete
        if (composerRef.current) {
          setMentionPosition({ top: 50, left: 80 });
        }
      } else {
        setShowMentions(false);
        setMentionQuery('');
        setMentionStartIndex(-1);
      }
    }

    if (scope) {
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Start typing
      startTyping(scope);

      // Stop typing after 3 seconds of no input
      typingTimeoutRef.current = setTimeout(() => {
        stopTyping(scope);
      }, 3000);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // If mention autocomplete is open, let it handle navigation keys
    if (showMentions && ['ArrowDown', 'ArrowUp', 'Tab', 'Escape'].includes(e.key)) {
      return; // Let MentionAutocomplete handle these
    }

    // If slash command autocomplete is open, let it handle navigation keys
    if (showSlashCommands && ['ArrowDown', 'ArrowUp', 'Tab', 'Escape', 'Enter'].includes(e.key)) {
      return; // Let SlashCommandAutocomplete handle these
    }

    // Send on Enter (without Shift), but not if mentions or slash commands are showing
    if (e.key === 'Enter' && !e.shiftKey && !showMentions && !showSlashCommands) {
      e.preventDefault();
      handleSend();
    }

    // Format shortcuts
    if (e.metaKey || e.ctrlKey) {
      switch (e.key) {
        case 'b':
          e.preventDefault();
          insertFormatting('**', '**');
          break;
        case 'i':
          e.preventDefault();
          insertFormatting('_', '_');
          break;
        case 'e':
          e.preventDefault();
          insertFormatting('`', '`');
          break;
      }
    }
  };

  // Insert formatting around selected text
  const insertFormatting = (prefix: string, suffix: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = body.slice(start, end);

    const newBody = body.slice(0, start) + prefix + selectedText + suffix + body.slice(end);
    setBody(newBody);

    // Move cursor to end of formatting
    setTimeout(() => {
      textarea.focus();
      const newPosition = start + prefix.length + selectedText.length + suffix.length;
      textarea.setSelectionRange(newPosition, newPosition);
    }, 0);
  };

  // Handle mention selection
  const handleMentionSelect = (mention: MentionItem) => {
    const textarea = textareaRef.current;
    if (!textarea || mentionStartIndex === -1) return;

    // Replace the @query with the mention value
    const before = body.slice(0, mentionStartIndex);
    const after = body.slice(textarea.selectionStart);
    const newBody = before + mention.value + ' ' + after;
    setBody(newBody);

    // Close autocomplete
    setShowMentions(false);
    setMentionQuery('');
    setMentionStartIndex(-1);

    // Focus textarea and set cursor
    setTimeout(() => {
      textarea.focus();
      const newPosition = mentionStartIndex + mention.value.length + 1;
      textarea.setSelectionRange(newPosition, newPosition);
    }, 0);
  };

  // Handle slash command result
  const handleSlashCommandResult = (result: SlashCommandResult) => {
    const textarea = textareaRef.current;

    if (result.type === 'insert' && result.text) {
      // Replace the slash command with the text to insert
      setBody(result.text);
    } else if (result.type === 'clear' || result.type === 'action') {
      // Clear the input after action commands
      setBody('');
    }

    // Close autocomplete
    setShowSlashCommands(false);
    setSlashQuery('');

    // Focus textarea
    setTimeout(() => {
      textarea?.focus();
    }, 0);
  };

  const handleSend = async () => {
    if (!body.trim() && pendingFiles.length === 0) return;

    // Upload any pending files first
    const fileIds: string[] = [];
    for (const pending of pendingFiles) {
      if (!pending.uploading) {
        setPendingFiles((prev) =>
          prev.map((p) => (p.id === pending.id ? { ...p, uploading: true } : p))
        );

        try {
          const result = await uploadMutation.mutateAsync(pending.file);
          fileIds.push(result.file.id);
        } catch {
          toast.error(`Failed to upload ${pending.file.name}`);
          return;
        }
      }
    }

    sendMutation.mutate({
      body: body.trim(),
      fileIds: fileIds.length > 0 ? fileIds : undefined,
    });
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newPendingFiles = files.map((file) => ({
      id: `${Date.now()}-${file.name}`,
      file,
      uploading: false,
    }));
    setPendingFiles((prev) => [...prev, ...newPendingFiles]);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (id: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleEmojiSelect = (emoji: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newBody = body.slice(0, start) + emoji + body.slice(end);
      setBody(newBody);

      // Set cursor position after emoji
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 0);
    } else {
      setBody(body + emoji);
    }
    setShowEmojiPicker(false);
  };

  return (
    <div ref={composerRef} className="border-t p-4 relative">
      {/* Pending files preview */}
      {pendingFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {pendingFiles.map((pending) => (
            <div
              key={pending.id}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg"
            >
              <span className="text-sm truncate max-w-[150px]">{pending.file.name}</span>
              {pending.uploading ? (
                <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <button
                  onClick={() => removeFile(pending.id)}
                  className="p-0.5 hover:bg-gray-200 rounded"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Emoji picker */}
      {showEmojiPicker && (
        <EmojiPicker
          onSelect={handleEmojiSelect}
          onClose={() => setShowEmojiPicker(false)}
        />
      )}

      {/* Mention autocomplete */}
      {showMentions && (
        <MentionAutocomplete
          query={mentionQuery}
          position={mentionPosition}
          onSelect={handleMentionSelect}
          onClose={() => setShowMentions(false)}
        />
      )}

      {/* Slash command autocomplete */}
      {showSlashCommands && (
        <SlashCommandAutocomplete
          query={slashQuery}
          position={slashPosition}
          onSelect={handleSlashCommandResult}
          onClose={() => setShowSlashCommands(false)}
        />
      )}

      {/* Formatting toolbar */}
      <div className="flex items-center gap-1 mb-2">
        <button
          onClick={() => insertFormatting('**', '**')}
          className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
          title="Bold (⌘B)"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          onClick={() => insertFormatting('_', '_')}
          className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
          title="Italic (⌘I)"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          onClick={() => insertFormatting('`', '`')}
          className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
          title="Code (⌘E)"
        >
          <Code className="w-4 h-4" />
        </button>
        <button
          onClick={() => insertFormatting('```\n', '\n```')}
          className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
          title="Code block"
        >
          <Code className="w-4 h-4" strokeWidth={3} />
        </button>
        <div className="w-px h-4 bg-gray-300 mx-1" />
        <button
          onClick={() => {
            if (textareaRef.current) {
              const start = textareaRef.current.selectionStart;
              const before = body.slice(0, start);
              const after = body.slice(start);
              const newBody = before + '@';
              setBody(newBody + after);
              setTimeout(() => {
                textareaRef.current?.focus();
                textareaRef.current?.setSelectionRange(start + 1, start + 1);
              }, 0);
            }
          }}
          className="p-1.5 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700"
          title="Mention someone"
        >
          <AtSign className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-end gap-2">
        {/* File attachment button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2 hover:bg-gray-100 rounded-lg flex-shrink-0"
          title="Attach file"
        >
          <Paperclip className="w-5 h-5 text-gray-500" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
          multiple
        />

        {/* Emoji picker button */}
        <button
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className={`p-2 hover:bg-gray-100 rounded-lg flex-shrink-0 ${
            showEmojiPicker ? 'bg-gray-100' : ''
          }`}
          title="Add emoji"
        >
          <Smile className="w-5 h-5 text-gray-500" />
        </button>

        {/* Message input */}
        <textarea
          ref={textareaRef}
          value={body}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none min-h-[48px] max-h-[200px]"
          rows={1}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={(!body.trim() && pendingFiles.length === 0) || sendMutation.isPending}
          className="p-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          title="Send message"
        >
          {sendMutation.isPending ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  );
}
