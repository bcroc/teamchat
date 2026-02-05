import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from '../stores/toast';
import type { Message } from '@teamchat/shared';

interface MessageActions {
  isSaved: boolean;
  canPin: boolean;
  toggleReaction: (emoji: string) => void;
  toggleSave: () => void;
  pin: () => void;
  editMessage: (body: string, onSuccess?: () => void) => void;
  deleteMessage: () => void;
  downloadFile: (fileId: string, filename: string) => Promise<void>;
  editMutationPending: boolean;
  deleteMutationPending: boolean;
}

export function useMessageActions(message: Message, userId?: string): MessageActions {
  const queryClient = useQueryClient();

  // Compute scope for precise query invalidation
  const messageScope = message.channelId
    ? { channelId: message.channelId }
    : message.dmThreadId
    ? { dmThreadId: message.dmThreadId }
    : null;

  // Check if message is saved
  const { data: savedData } = useQuery({
    queryKey: ['saved-message', message.id],
    queryFn: () => api.get<{ saved: boolean }>(`/saved/${message.id}`),
    staleTime: 30000,
  });

  const isSaved = savedData?.saved || false;

  // Add reaction mutation
  const addReactionMutation = useMutation({
    mutationFn: (emoji: string) =>
      api.post(`/messages/${message.id}/reactions`, { emoji }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', messageScope] });
    },
  });

  // Remove reaction mutation
  const removeReactionMutation = useMutation({
    mutationFn: (emoji: string) =>
      api.delete(`/messages/${message.id}/reactions/${encodeURIComponent(emoji)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', messageScope] });
    },
  });

  // Edit message mutation
  const editMutation = useMutation({
    mutationFn: (body: string) => api.patch(`/messages/${message.id}`, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', messageScope] });
      toast.success('Message edited');
    },
    onError: () => {
      toast.error('Failed to edit message');
    },
  });

  // Delete message mutation
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/messages/${message.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', messageScope] });
      toast.success('Message deleted');
    },
    onError: () => {
      toast.error('Failed to delete message');
    },
  });

  // Pin message mutation
  const pinMutation = useMutation({
    mutationFn: () =>
      api.post(`/pins/${message.channelId}`, { messageId: message.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pinned-messages', message.channelId] });
      toast.success('Message pinned');
    },
    onError: () => {
      toast.error('Failed to pin message');
    },
  });

  // Save message mutation
  const saveMutation = useMutation({
    mutationFn: () => api.post('/saved', { messageId: message.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-message', message.id] });
      queryClient.invalidateQueries({ queryKey: ['saved-messages'] });
      toast.success('Message saved');
    },
    onError: () => {
      toast.error('Failed to save message');
    },
  });

  // Unsave message mutation
  const unsaveMutation = useMutation({
    mutationFn: () => api.delete(`/saved/${message.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-message', message.id] });
      queryClient.invalidateQueries({ queryKey: ['saved-messages'] });
      toast.success('Message removed from saved');
    },
    onError: () => {
      toast.error('Failed to remove from saved');
    },
  });

  const toggleReaction = (emoji: string) => {
    const existingReaction = message.reactions?.find(
      (r) => r.emoji === emoji && r.userId === userId
    );

    if (existingReaction) {
      removeReactionMutation.mutate(emoji);
    } else {
      addReactionMutation.mutate(emoji);
    }
  };

  const toggleSave = () => {
    if (isSaved) {
      unsaveMutation.mutate();
    } else {
      saveMutation.mutate();
    }
  };

  const pin = () => {
    pinMutation.mutate();
  };

  const editMessage = (body: string, onSuccess?: () => void) => {
    editMutation.mutate(body, { onSuccess });
  };

  const deleteMessage = () => {
    deleteMutation.mutate();
  };

  const downloadFile = async (fileId: string, filename: string) => {
    try {
      const { blob } = await api.download(`/files/${fileId}/download`);
      const buffer = await blob.arrayBuffer();

      const savedPath = await window.electronAPI.saveFile({
        filename,
        data: buffer,
      });

      if (savedPath) {
        toast.success('File downloaded');
      }
    } catch {
      toast.error('Failed to download file');
    }
  };

  return {
    isSaved,
    canPin: !!message.channelId,
    toggleReaction,
    toggleSave,
    pin,
    editMessage,
    deleteMessage,
    downloadFile,
    editMutationPending: editMutation.isPending,
    deleteMutationPending: deleteMutation.isPending,
  };
}
