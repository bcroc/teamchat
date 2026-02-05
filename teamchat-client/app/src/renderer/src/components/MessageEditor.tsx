interface MessageEditorProps {
  value: string;
  isSaving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function MessageEditor({
  value,
  isSaving,
  onChange,
  onSave,
  onCancel,
}: MessageEditorProps) {
  return (
    <div className="mt-1">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
        rows={3}
        autoFocus
      />
      <div className="flex gap-2 mt-2">
        <button
          onClick={onSave}
          disabled={isSaving}
          className="px-3 py-1 bg-primary-600 text-white text-sm rounded hover:bg-primary-700"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
