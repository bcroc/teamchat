import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from '../stores/toast';
import { clsx } from 'clsx';
import { Loader2, ExternalLink, ChevronDown } from 'lucide-react';

interface InteractiveAction {
  id: string;
  actionId: string;
  type: 'button' | 'select';
  label: string;
  value?: string | null;
  style?: 'primary' | 'danger' | 'default' | null;
  url?: string | null;
  confirm?: {
    title: string;
    text: string;
    confirmText?: string;
    denyText?: string;
  } | null;
  options?: Array<{
    label: string;
    value: string;
    description?: string;
  }> | null;
}

interface InteractiveActionsProps {
  messageId: string;
  actions: InteractiveAction[];
}

interface ConfirmDialogProps {
  title: string;
  text: string;
  confirmText?: string;
  denyText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  title,
  text,
  confirmText = 'Confirm',
  denyText = 'Cancel',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-gray-600 mb-4">{text}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded"
          >
            {denyText}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InteractiveActions({ messageId, actions }: InteractiveActionsProps) {
  const [showConfirm, setShowConfirm] = useState<{
    action: InteractiveAction;
    value?: string;
  } | null>(null);
  const [ephemeralMessage, setEphemeralMessage] = useState<string | null>(null);

  const triggerMutation = useMutation({
    mutationFn: (data: { actionId: string; value?: string }) =>
      api.post<{
        type: string;
        text?: string;
        url?: string;
        message?: string;
      }>('/interactions/trigger', {
        messageId,
        actionId: data.actionId,
        value: data.value,
      }),
    onSuccess: (response) => {
      if (response.type === 'url' && response.url) {
        window.open(response.url, '_blank');
      } else if (response.type === 'ephemeral' && response.text) {
        setEphemeralMessage(response.text);
        // Clear ephemeral message after 5 seconds
        setTimeout(() => setEphemeralMessage(null), 5000);
      } else if (response.type === 'error') {
        toast.error(response.message || 'Action failed');
      }
    },
    onError: () => {
      toast.error('Failed to perform action');
    },
  });

  const handleAction = (action: InteractiveAction, value?: string) => {
    // If action has URL, open it directly
    if (action.url) {
      window.open(action.url, '_blank');
      return;
    }

    // If action has confirmation, show dialog
    if (action.confirm) {
      setShowConfirm({ action, value });
      return;
    }

    // Otherwise trigger the action
    triggerMutation.mutate({
      actionId: action.actionId,
      value: value || action.value || undefined,
    });
  };

  const handleConfirm = () => {
    if (showConfirm) {
      triggerMutation.mutate({
        actionId: showConfirm.action.actionId,
        value: showConfirm.value || showConfirm.action.value || undefined,
      });
      setShowConfirm(null);
    }
  };

  if (actions.length === 0) return null;

  // Group actions into rows (max 5 per row for buttons)
  const buttonActions = actions.filter((a) => a.type === 'button');
  const selectActions = actions.filter((a) => a.type === 'select');

  return (
    <div className="mt-2 space-y-2">
      {/* Buttons */}
      {buttonActions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {buttonActions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleAction(action)}
              disabled={triggerMutation.isPending}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded border transition-colors',
                action.style === 'primary' &&
                  'bg-primary-600 text-white border-primary-600 hover:bg-primary-700',
                action.style === 'danger' &&
                  'bg-red-600 text-white border-red-600 hover:bg-red-700',
                (!action.style || action.style === 'default') &&
                  'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
                triggerMutation.isPending && 'opacity-50 cursor-not-allowed'
              )}
            >
              {triggerMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : action.url ? (
                <ExternalLink className="w-4 h-4" />
              ) : null}
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Select menus */}
      {selectActions.map((action) => (
        <div key={action.id} className="relative inline-block">
          <select
            onChange={(e) => {
              if (e.target.value) {
                handleAction(action, e.target.value);
                e.target.value = ''; // Reset selection
              }
            }}
            disabled={triggerMutation.isPending}
            className={clsx(
              'appearance-none pl-3 pr-8 py-1.5 text-sm border border-gray-300 rounded bg-white',
              'hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500',
              triggerMutation.isPending && 'opacity-50 cursor-not-allowed'
            )}
          >
            <option value="">{action.label}</option>
            {action.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      ))}

      {/* Ephemeral message */}
      {ephemeralMessage && (
        <div className="p-2 bg-gray-100 rounded text-sm text-gray-600 italic">
          {ephemeralMessage}
        </div>
      )}

      {/* Confirmation dialog */}
      {showConfirm && showConfirm.action.confirm && (
        <ConfirmDialog
          title={showConfirm.action.confirm.title}
          text={showConfirm.action.confirm.text}
          confirmText={showConfirm.action.confirm.confirmText}
          denyText={showConfirm.action.confirm.denyText}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(null)}
        />
      )}
    </div>
  );
}
