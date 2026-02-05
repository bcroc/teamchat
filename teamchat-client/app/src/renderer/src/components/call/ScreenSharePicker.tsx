import { useState, useEffect } from 'react';
import { X, Monitor, AppWindow } from 'lucide-react';
import { clsx } from 'clsx';

interface DisplaySource {
  id: string;
  name: string;
  thumbnail: string;
  appIcon: string | null;
}

interface ScreenSharePickerProps {
  onSelect: (sourceId: string) => void;
  onClose: () => void;
}

export default function ScreenSharePicker({ onSelect, onClose }: ScreenSharePickerProps) {
  const [sources, setSources] = useState<DisplaySource[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSources() {
      try {
        const displaySources = await window.electronAPI.getDisplaySources();
        setSources(displaySources);
        if (displaySources.length > 0) {
          setSelectedId(displaySources[0].id);
        }
      } catch (err) {
        console.error('Failed to get display sources:', err);
      } finally {
        setLoading(false);
      }
    }

    loadSources();
  }, []);

  const handleShare = () => {
    if (selectedId) {
      onSelect(selectedId);
    }
  };

  const screens = sources.filter((s) => s.id.startsWith('screen:'));
  const windows = sources.filter((s) => s.id.startsWith('window:'));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold">Choose what to share</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
          ) : (
            <>
              {/* Screens */}
              {screens.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <Monitor className="w-4 h-4" />
                    Entire Screen
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {screens.map((source) => (
                      <button
                        key={source.id}
                        onClick={() => setSelectedId(source.id)}
                        className={clsx(
                          'relative rounded-lg border-2 overflow-hidden transition-all',
                          selectedId === source.id
                            ? 'border-primary-500 ring-2 ring-primary-200'
                            : 'border-gray-200 hover:border-gray-300'
                        )}
                      >
                        <img
                          src={source.thumbnail}
                          alt={source.name}
                          className="w-full aspect-video object-cover bg-gray-100"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
                          <p className="text-white text-sm truncate">{source.name}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Windows */}
              {windows.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <AppWindow className="w-4 h-4" />
                    Application Window
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    {windows.map((source) => (
                      <button
                        key={source.id}
                        onClick={() => setSelectedId(source.id)}
                        className={clsx(
                          'relative rounded-lg border-2 overflow-hidden transition-all',
                          selectedId === source.id
                            ? 'border-primary-500 ring-2 ring-primary-200'
                            : 'border-gray-200 hover:border-gray-300'
                        )}
                      >
                        <img
                          src={source.thumbnail}
                          alt={source.name}
                          className="w-full aspect-video object-cover bg-gray-100"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 flex items-center gap-2">
                          {source.appIcon && (
                            <img src={source.appIcon} alt="" className="w-4 h-4" />
                          )}
                          <p className="text-white text-sm truncate">{source.name}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {screens.length === 0 && windows.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  No screens or windows available to share
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 p-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleShare}
            disabled={!selectedId}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            Share
          </button>
        </div>
      </div>
    </div>
  );
}
