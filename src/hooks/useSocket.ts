import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { showToast } from '../store/toastStore';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || !user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    // Connect to Socket server
    const socket = io(window.location.origin, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      // Evaluated on every (re)connect so a refreshed access token is used
      auth: (cb) => cb({ token: useAuthStore.getState().accessToken }),
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      // Join user specific room
      socket.emit('join_room', `user:${user.id}`);
      if (user.department) {
        socket.emit('join_room', `dept:${user.department}`);
      }
    });

    // Real-time Event Listeners
    socket.on('org:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['org-chart'] });
    });

    socket.on('task:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['org-chart'] });
    });

    socket.on('notification:new', (notification: any) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      showToast({
        type: 'info',
        title: notification.title || 'Notification',
        message: notification.message || 'You have a new update.',
      });
    });

    socket.on('conversation:message', (payload: { conversationId?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (payload?.conversationId) {
        queryClient.invalidateQueries({ queryKey: ['conversation-messages', payload.conversationId] });
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, user?.id, queryClient]);

  return socketRef.current;
}
