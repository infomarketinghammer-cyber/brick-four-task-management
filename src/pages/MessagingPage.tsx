import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare,
  Plus,
  Search,
  Send,
  User as UserIcon,
  X,
  CheckCheck,
  Sparkles,
  Clock,
  Shield,
  Circle,
  AlertCircle,
  Users
} from 'lucide-react';

import { apiClient } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { User } from '../types';

interface ConversationParticipant {
  id: string;
  name: string;
  designation: string;
  department: string;
  role: string;
}

interface Conversation {
  id: string;
  kind?: 'DIRECT' | 'GROUP' | 'HEADS';
  isGroup?: boolean;
  name?: string;
  participant: ConversationParticipant;
  participants: ConversationParticipant[];
  lastMessage: {
    text: string;
    senderId: string;
    created_at: string;
  } | null;
  unreadCount: number;
  updated_at: string;
}

interface MessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderDesignation?: string;
  content: string;
  created_at: string;
}

export function MessagingPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((state) => state.user);

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [newChatMode, setNewChatMode] = useState<'direct' | 'group'>('direct');
  const [headsOnly, setHeadsOnly] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch Conversations List
  const { data: conversations = [], isLoading: isLoadingConversations } = useQuery<Conversation[]>({
    queryKey: ['conversations'],
    queryFn: async () => {
      const res: any = await apiClient.get('/conversations');
      if (Array.isArray(res)) return res;
      if (Array.isArray(res?.data)) return res.data;
      return [];
    },
    refetchInterval: 5000, // Poll fallback alongside Socket.IO
  });

  // Automatically select first conversation if none selected
  useEffect(() => {
    if (!selectedConversationId && conversations.length > 0) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [conversations, selectedConversationId]);

  // Fetch Messages for Selected Conversation
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<MessageItem[]>({
    queryKey: ['conversation-messages', selectedConversationId],
    queryFn: async () => {
      if (!selectedConversationId) return [];
      const res: any = await apiClient.get(`/conversations/${selectedConversationId}/messages`);
      if (Array.isArray(res)) return res;
      if (Array.isArray(res?.data)) return res.data;
      return [];
    },
    enabled: !!selectedConversationId,
    refetchInterval: 3000,
  });

  // Fetch All Staff Users for New Chat Modal
  const { data: staffData } = useQuery<{ total: number; users: User[] }>({
    queryKey: ['staff-users-for-chat'],
    queryFn: async () => {
      const res: any = await apiClient.get('/users?scope=messaging&limit=100');
      return res.data || { total: 0, users: [] };
    },
    enabled: isNewChatModalOpen,
  });

  // Scroll to bottom when messages load/change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send Message Mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!selectedConversationId) return;
      const res: any = await apiClient.post(`/conversations/${selectedConversationId}/messages`, { content });
      return res.data;
    },
    onSuccess: () => {
      setMessageInput('');
      queryClient.invalidateQueries({ queryKey: ['conversation-messages', selectedConversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // Start New Conversation Mutation
  const startConversationMutation = useMutation({
    mutationFn: async (recipientId: string) => {
      const res: any = await apiClient.post('/conversations', { recipient_id: recipientId });
      return res.data;
    },
    onSuccess: (newConv) => {
      closeNewChatModal();
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (newConv?.id) {
        setSelectedConversationId(newConv.id);
      }
    },
  });

  // Create Group Conversation Mutation
  const createGroupMutation = useMutation({
    mutationFn: async (payload: { name: string; participant_ids: string[] }) => {
      const res: any = await apiClient.post('/conversations', payload);
      return res.data;
    },
    onSuccess: (newConv) => {
      closeNewChatModal();
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (newConv?.id) {
        setSelectedConversationId(newConv.id);
      }
    },
  });

  function closeNewChatModal() {
    setIsNewChatModalOpen(false);
    setUserSearchQuery('');
    setNewChatMode('direct');
    setHeadsOnly(false);
    setGroupName('');
    setGroupMemberIds([]);
  }

  const toggleGroupMember = (userId: string) => {
    setGroupMemberIds((prev) => (prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId]));
  };

  // Display helpers that work for both 1:1 and group conversations
  const conversationTitle = (c: Conversation) => (c.isGroup ? c.name || 'Group' : c.participant?.name || 'Team Member');
  const conversationSubtitle = (c: Conversation) =>
    c.isGroup ? `${c.participants?.length || 0} members` : c.participant?.designation || '';

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedConversationId) return;
    sendMessageMutation.mutate(messageInput.trim());
  };

  // Filter conversations
  const filteredConversations = conversations.filter((c) => {
    if (c.isGroup) {
      const q = searchQuery.toLowerCase();
      return (c.name || '').toLowerCase().includes(q) || c.participants?.some((p) => p.name?.toLowerCase().includes(q));
    }
    const nameMatch = c.participant?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const deptMatch = c.participant?.department?.toLowerCase().includes(searchQuery.toLowerCase());
    const desigMatch = c.participant?.designation?.toLowerCase().includes(searchQuery.toLowerCase());
    return nameMatch || deptMatch || desigMatch;
  });

  // Selected conversation object
  const activeConversation = conversations.find((c) => c.id === selectedConversationId);

  // Filtered staff list for new chat (ensure current user and legacy aliases are excluded)
  const eligibleStaff = (staffData?.users || []).filter(
    (u) =>
      u.id !== currentUser?.id &&
      u.email?.toLowerCase() !== currentUser?.email?.toLowerCase() &&
      u.email !== 'admin@company.com' &&
      u.id !== 'usr-admin-001' &&
      (!headsOnly || u.role === 'DEPT_HEAD' || u.role === 'ADMIN') &&
      (u.name.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
        u.department.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
        u.designation.toLowerCase().includes(userSearchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-4 h-[calc(100vh-6.5rem)] flex flex-col">
      {/* Header Banner */}
      <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-200 shrink-0">
        <div>
          <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <MessageSquare size={20} className="text-indigo-600" />
            <span>Internal Team Messaging</span>
          </h1>
          <p className="text-xs text-slate-500">
            Real-time secure communication across management tiers & project teams.
          </p>
        </div>

        <button
          onClick={() => setIsNewChatModalOpen(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 flex items-center gap-2 transition-all shrink-0"
        >
          <Plus size={16} />
          <span>New Conversation</span>
        </button>
      </div>

      {/* Main Chat Box Container */}
      <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden grid grid-cols-1 md:grid-cols-12">
        {/* ============================================== */}
        {/* LEFT COLUMN: Conversation List & Search        */}
        {/* ============================================== */}
        <div className="md:col-span-4 lg:col-span-4 border-r border-slate-200 flex flex-col h-full bg-slate-50/50">
          {/* Conversation Search Bar */}
          <div className="p-3.5 border-b border-slate-200 space-y-2 bg-white">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations..."
                className="w-full pl-9 pr-3 py-2 bg-slate-100 focus:bg-white text-xs font-medium text-slate-900 rounded-xl border border-transparent focus:border-indigo-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          {/* Conversations List Scrollable */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {isLoadingConversations ? (
              <div className="p-8 text-center text-xs text-slate-400 font-semibold">
                Loading conversations...
              </div>
            ) : Array.isArray(filteredConversations) && filteredConversations.length > 0 ? (
              filteredConversations.map((conv) => {
                const isSelected = conv.id === selectedConversationId;
                const partner: ConversationParticipant = conv.participant || { id: '', name: 'Team Member', designation: 'Staff', department: 'Operations', role: 'EXECUTIVE' };
                const lastMsgText = conv.lastMessage?.text || 'No messages yet';
                const timeAgo = conv.updated_at
                  ? new Date(conv.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '';

                return (
                  <button
                    key={conv.id}
                    onClick={() => {
                      setSelectedConversationId(conv.id);
                      queryClient.invalidateQueries({ queryKey: ['conversation-messages', conv.id] });
                      queryClient.invalidateQueries({ queryKey: ['conversations'] });
                    }}
                    className={`w-full p-4 text-left flex items-start gap-3 transition-all relative ${
                      isSelected
                        ? 'bg-indigo-50/80 border-l-4 border-l-indigo-600 shadow-2xs'
                        : 'hover:bg-slate-100/70'
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      {conv.isGroup ? (
                        <div className={`w-10 h-10 rounded-2xl text-white flex items-center justify-center shadow-xs ${conv.kind === 'HEADS' ? 'bg-purple-600' : 'bg-indigo-500'}`}>
                          {conv.kind === 'HEADS' ? <Shield size={18} /> : <Users size={18} />}
                        </div>
                      ) : (
                        <>
                          <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white font-bold text-xs flex items-center justify-center border border-slate-700 shadow-xs">
                            {partner.name?.charAt(0) || 'U'}
                          </div>
                          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" />
                        </>
                      )}
                    </div>

                    {/* Details */}
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-900 truncate">{conversationTitle(conv)}</h4>
                        <span className="text-[10px] text-slate-400 font-mono">{timeAgo}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium truncate">{conversationSubtitle(conv)}</p>
                      <p className="text-xs text-slate-600 truncate font-normal leading-snug pt-0.5">
                        {lastMsgText}
                      </p>
                    </div>

                    {/* Unread Badge */}
                    {conv.unreadCount > 0 && !isSelected && (
                      <span className="ml-1 px-2 py-0.5 bg-indigo-600 text-white text-[10px] font-extrabold rounded-full shadow-xs shrink-0 self-center">
                        {conv.unreadCount}
                      </span>
                    )}
                  </button>
                );
              })
            ) : (
              <div className="p-8 text-center space-y-2">
                <MessageSquare size={24} className="text-slate-300 mx-auto" />
                <p className="text-xs text-slate-400 font-medium">No matching conversations found.</p>
              </div>
            )}
          </div>
        </div>

        {/* ============================================== */}
        {/* RIGHT COLUMN: Active Message Thread & Send Box  */}
        {/* ============================================== */}
        <div className="md:col-span-8 lg:col-span-8 flex flex-col h-full bg-white">
          {activeConversation ? (
            <>
              {/* Thread Header */}
              <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                {activeConversation.isGroup ? (
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-2xl text-white flex items-center justify-center shadow-md shrink-0 ${activeConversation.kind === 'HEADS' ? 'bg-purple-600' : 'bg-indigo-600'}`}>
                      {activeConversation.kind === 'HEADS' ? <Shield size={18} /> : <Users size={18} />}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
                        <span className="truncate">{conversationTitle(activeConversation)}</span>
                        {activeConversation.kind === 'HEADS' && (
                          <span className="text-[10px] px-2 py-0.5 bg-purple-100 text-purple-700 font-semibold rounded-md uppercase shrink-0">
                            Heads Only
                          </span>
                        )}
                      </h3>
                      <p
                        className="text-[11px] text-slate-500 font-medium truncate"
                        title={activeConversation.participants?.map((p) => `${p.name} (${p.department})`).join(', ')}
                      >
                        {activeConversation.participants?.map((p) => (p.id === currentUser?.id ? 'You' : p.name)).join(', ')}
                      </p>
                    </div>
                  </div>
                ) : (
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-md shadow-indigo-600/20">
                      {activeConversation.participant?.name?.charAt(0) || 'U'}
                    </div>
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span>{activeConversation.participant?.name}</span>
                      <span className="text-[10px] px-2 py-0.5 bg-slate-200/80 text-slate-700 font-semibold rounded-md uppercase">
                        {activeConversation.participant?.role?.replace('_', ' ')}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500 font-medium">
                      {activeConversation.participant?.designation} • Dept: {activeConversation.participant?.department}
                    </p>
                  </div>
                </div>
                )}

                <div className="flex items-center gap-2" />
              </div>

              {/* Messages Stream */}
              <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-slate-50/30">
                {isLoadingMessages ? (
                  <div className="text-center py-12 text-xs text-slate-400 font-semibold">
                    Loading message thread...
                  </div>
                ) : Array.isArray(messages) && messages.length > 0 ? (
                  messages.map((msg) => {
                    const isMe = msg.senderId === currentUser?.id;
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-2 mb-1 px-1">
                          <span className="text-[10px] font-bold text-slate-500">
                            {isMe ? 'You' : msg.senderName}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <div
                          className={`max-w-md p-3.5 rounded-2xl text-xs font-medium leading-relaxed shadow-2xs ${
                            isMe
                              ? 'bg-indigo-600 text-white rounded-tr-none'
                              : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none'
                          }`}
                        >
                          <div
                            className="prose prose-xs max-w-none break-words"
                            dangerouslySetInnerHTML={{ __html: msg.content }}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-16 space-y-2">
                    <MessageSquare size={32} className="text-slate-300 mx-auto" />
                    <p className="text-xs text-slate-500 font-bold">No messages in this conversation yet.</p>
                    <p className="text-[11px] text-slate-400">Send a message below to start the discussion.</p>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Send Box */}
              <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-200 bg-white flex items-center gap-3">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder={`Message ${conversationTitle(activeConversation)}...`}
                  className="flex-1 px-4 py-3 bg-slate-50 focus:bg-white border border-slate-200 rounded-2xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                />
                <button
                  type="submit"
                  disabled={sendMessageMutation.isPending || !messageInput.trim()}
                  className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold shadow-md shadow-indigo-600/30 flex items-center gap-2 transition-all disabled:opacity-40 shrink-0"
                >
                  {sendMessageMutation.isPending ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Send size={15} />
                      <span className="hidden sm:inline">Send</span>
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
              <div className="p-4 rounded-3xl bg-indigo-50 text-indigo-600">
                <MessageSquare size={36} />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Select or Start a Conversation</h3>
              <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                Choose a team member from the list on the left or click "New Conversation" to message colleagues.
              </p>
              <button
                onClick={() => setIsNewChatModalOpen(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-xs"
              >
                + New Conversation
              </button>
            </div>
          )}
        </div>
      </div>

      {/* New Conversation Modal */}
      {isNewChatModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-indigo-600 text-white rounded-xl">
                  <MessageSquare size={18} />
                </span>
                <h3 className="text-sm font-bold text-slate-900">Start New Conversation</h3>
              </div>
              <button
                onClick={closeNewChatModal}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-3">
              {/* Mode switch: 1:1 vs group */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
                {(['direct', 'group'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setNewChatMode(mode)}
                    className={`py-1.5 text-[11px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                      newChatMode === mode ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-500'
                    }`}
                  >
                    {mode === 'direct' ? <UserIcon size={13} /> : <Users size={13} />}
                    {mode === 'direct' ? 'Direct Message' : 'New Group'}
                  </button>
                ))}
              </div>

              {newChatMode === 'group' && (
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  maxLength={80}
                  placeholder="Group name, e.g. Land Deal – Sales & Legal"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              )}

              <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={headsOnly}
                  onChange={(e) => setHeadsOnly(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                Show department heads only
              </label>

              <div className="relative">
                <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  placeholder="Search employees by name or department..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Staff List */}
              <div className="max-h-64 overflow-y-auto space-y-1.5 pt-1">
                {eligibleStaff.length > 0 ? (
                  eligibleStaff.map((staff) => (
                    <div
                      key={staff.id}
                      onClick={() =>
                        newChatMode === 'group' ? toggleGroupMember(staff.id) : startConversationMutation.mutate(staff.id)
                      }
                      className={`p-3 border rounded-2xl flex items-center justify-between cursor-pointer transition-all ${
                        newChatMode === 'group' && groupMemberIds.includes(staff.id)
                          ? 'bg-indigo-50 border-indigo-300'
                          : 'bg-slate-50 hover:bg-indigo-50/80 border-slate-100 hover:border-indigo-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {newChatMode === 'group' && (
                          <input
                            type="checkbox"
                            readOnly
                            checked={groupMemberIds.includes(staff.id)}
                            className="rounded text-indigo-600 pointer-events-none"
                          />
                        )}
                        <div className="w-8 h-8 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center justify-center">
                          {staff.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900">{staff.name}</p>
                          <p className="text-[10px] text-slate-500">{staff.designation} • {staff.department}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-md">
                        {staff.role}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 text-center py-6">No matching staff members found.</p>
                )}
              </div>

              {newChatMode === 'group' && (
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                  <span className="text-[11px] text-slate-500 font-semibold">
                    {groupMemberIds.length} selected {groupMemberIds.length < 2 && '(pick at least 2)'}
                  </span>
                  <button
                    type="button"
                    disabled={!groupName.trim() || groupMemberIds.length < 2 || createGroupMutation.isPending}
                    onClick={() =>
                      createGroupMutation.mutate({ name: groupName.trim(), participant_ids: groupMemberIds })
                    }
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-40"
                  >
                    {createGroupMutation.isPending ? 'Creating...' : 'Create Group'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
