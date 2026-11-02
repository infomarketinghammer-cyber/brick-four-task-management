import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  Search,
  AlertCircle,
  RefreshCw,
  X,
  Briefcase,
  Users as UsersIcon,
  MoreVertical,
  GitBranch,
  Edit3,
  Layers,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Mail,
  PhoneCall,
  Building2,
  Calendar,
  Check,
  Copy,
  ArrowRight,
  Scale,
  FileText,
  MapPin,
  BarChart3,
  TrendingUp,
  Cpu,
  Calculator,
  ShoppingCart,
  Phone,
  Wrench,
  ShieldCheck,
  Printer,
  Compass,
  User as UserIcon,
} from 'lucide-react';

import { apiClient } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { showToast } from '../store/toastStore';
import { Role, User } from '../types';
import { EditUserModal } from '../components/EditUserModal';
import { BrickFourLogo } from '../components/DarodeJogLogo';

export interface OrgNode {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: Role;
  department: string;
  designation: string;
  hierarchy_level: number;
  avatar_url?: string | null;
  employee_no?: string | null;
  location?: string | null;
  date_of_joining?: string | null;
  is_active: boolean;
  openTaskCount: number;
  directReports: OrgNode[];
}

/**
 * Returns a fitting Lucide icon component according to department and designation.
 */
function getEmployeeIcon(dept: string, title: string) {
  const d = (dept || '').toLowerCase();
  const t = (title || '').toLowerCase();

  if (d.includes('legal') || t.includes('legal') || t.includes('lawyer')) return Scale;
  if (d.includes('liasoning') || t.includes('liasoning')) return FileText;
  if (d.includes('acquisition') || t.includes('acquisition') || t.includes('land')) return MapPin;
  if (t.includes('telecalling') || t.includes('telecaller')) return Phone;
  if (d.includes('sales') || t.includes('sales')) return BarChart3;
  if (d.includes('market') || t.includes('intelligence')) return TrendingUp;
  if (d.includes('purchase') || t.includes('purchase')) return ShoppingCart;
  if (d.includes('finance') || d.includes('account') || t.includes('cfo') || t.includes('account')) return Calculator;
  if (d.includes('ai') || t.includes('ai') || t.includes('solutions') || t.includes('automation')) return Cpu;
  if (d.includes('engineering') || t.includes('engineer')) return Compass;
  if (d.includes('housekeeping') || t.includes('office boy')) return Wrench;
  if (d.includes('hr') || t.includes('hr') || t.includes('assistant')) return UsersIcon;
  if (d.includes('management') || t.includes('director') || t.includes('general manager')) return ShieldCheck;

  return UserIcon;
}

function matchesNodeOrDescendants(node: OrgNode, query: string, dept: string): boolean {
  const matchesDept = dept === 'ALL' || node.department.toLowerCase() === dept.toLowerCase();
  
  if (!query.trim()) {
    return matchesDept || (node.directReports?.some((child) => matchesNodeOrDescendants(child, query, dept)) ?? false);
  }

  const q = query.trim().toLowerCase();
  const nameMatch =
    node.name.toLowerCase().includes(q) ||
    node.designation.toLowerCase().includes(q) ||
    node.email.toLowerCase().includes(q) ||
    node.department.toLowerCase().includes(q) ||
    (node.employee_no && node.employee_no.toLowerCase().includes(q));

  const selfMatches = nameMatch && matchesDept;
  const childMatches = node.directReports?.some((child) => matchesNodeOrDescendants(child, query, dept)) ?? false;

  return selfMatches || childMatches;
}

function isNodeDirectMatch(node: OrgNode, query: string, dept: string): boolean {
  if (!query.trim() && dept === 'ALL') return true;
  const matchesDept = dept === 'ALL' || node.department.toLowerCase() === dept.toLowerCase();
  if (!query.trim()) return matchesDept;

  const q = query.trim().toLowerCase();
  const matchesText =
    node.name.toLowerCase().includes(q) ||
    node.designation.toLowerCase().includes(q) ||
    node.email.toLowerCase().includes(q) ||
    node.department.toLowerCase().includes(q) ||
    (node.employee_no && node.employee_no.toLowerCase().includes(q));

  return matchesText && matchesDept;
}

// ----------------------------------------------------------------------
// Flowchart Node Card (Matches PDF visual design)
// ----------------------------------------------------------------------
interface FlowchartCardProps {
  node: OrgNode;
  isRoot?: boolean;
  isMatch?: boolean;
  isDimmed?: boolean;
  onSelect: (node: OrgNode) => void;
}

const FlowchartCard: React.FC<FlowchartCardProps> = ({
  node,
  isRoot = false,
  isMatch = true,
  isDimmed = false,
  onSelect,
}) => {
  const IconComponent = getEmployeeIcon(node.department, node.designation);

  if (isRoot) {
    return (
      <div
        onClick={() => onSelect(node)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onSelect(node);
        }}
        className={`w-64 cursor-pointer select-none rounded-xl overflow-hidden shadow-md transition-all duration-200 transform hover:-translate-y-0.5 hover:shadow-lg border-2 ${
          isMatch ? 'border-[#8B1E22] ring-2 ring-[#8B1E22]/30' : 'border-slate-300'
        } ${isDimmed ? 'opacity-40 grayscale-30' : 'opacity-100'}`}
      >
        {/* Maroon Header Banner */}
        <div className="bg-gradient-brand text-white px-3.5 py-2.5 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-xs border border-white/40 flex items-center justify-center shrink-0">
            <UserIcon size={18} className="text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-sm tracking-tight truncate text-white">{node.name}</h3>
            <p className="text-[10px] text-rose-100 uppercase tracking-wider font-semibold">
              Director / CEO
            </p>
          </div>
        </div>

        {/* Lower Info */}
        <div className="bg-[#FAF6F6] px-3.5 py-2 border-t border-rose-100 flex items-center justify-between text-slate-800">
          <div>
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              {node.department}
            </span>
            <p className="text-xs font-bold text-slate-900">{node.designation}</p>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-[#8B1E22] text-white">
            Level 0
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => onSelect(node)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect(node);
      }}
      className={`w-[168px] sm:w-[172px] cursor-pointer select-none rounded-xl bg-white border transition-all duration-200 transform hover:-translate-y-0.5 hover:shadow-md text-left ${
        isMatch
          ? 'border-slate-300 shadow-xs hover:border-[#8B1E22]'
          : 'border-slate-200 shadow-none'
      } ${isDimmed ? 'opacity-35 grayscale-50' : 'opacity-100'}`}
    >
      {/* Top Header: Rose Avatar Circle + Employee Name */}
      <div className="p-2.5 pb-2 flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-rose-50 border border-rose-200 text-[#8B1E22] flex items-center justify-center shrink-0">
          <IconComponent size={14} className="stroke-[2.2]" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="text-[11px] font-bold text-slate-900 leading-tight truncate"
            title={node.name}
          >
            {node.name}
          </p>
          {node.employee_no && (
            <span className="text-[9px] font-semibold text-slate-400 block truncate">
              {node.employee_no}
            </span>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-slate-100 w-full" />

      {/* Bottom Section: Department & Designation */}
      <div className="p-2.5 pt-1.5 bg-slate-50/70 rounded-b-xl min-h-[46px] flex flex-col justify-center">
        <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wider truncate block">
          {node.department}
        </span>
        <p
          className="text-[10px] font-bold text-slate-800 leading-tight line-clamp-2"
          title={node.designation}
        >
          {node.designation}
        </p>
      </div>
    </div>
  );
};

// ----------------------------------------------------------------------
// Indented Tree List Row (For Tree List View mode)
// ----------------------------------------------------------------------
interface OrgNodeItemProps {
  key?: string;
  node: OrgNode;
  level: number;
  isAdmin: boolean;
  searchQuery: string;
  selectedDept: string;
  onEditUser: (node: OrgNode) => void;
  onChangeManager: (node: OrgNode) => void;
  onSelectUser: (node: OrgNode) => void;
}

function OrgNodeItem({
  node,
  level,
  isAdmin,
  searchQuery,
  selectedDept,
  onEditUser,
  onChangeManager,
  onSelectUser,
}: OrgNodeItemProps) {
  const hasReports = node.directReports && node.directReports.length > 0;
  const isDefaultExpanded = node.hierarchy_level <= 1;

  const [isExpanded, setIsExpanded] = useState<boolean>(isDefaultExpanded);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isVisible = matchesNodeOrDescendants(node, searchQuery, selectedDept);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  if (!isVisible) return null;

  const IconComponent = getEmployeeIcon(node.department, node.designation);

  return (
    <div className="w-full text-slate-900">
      <div
        onClick={() => onSelectUser(node)}
        className="w-full min-h-[54px] bg-white hover:bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 sm:px-3.5 transition-colors flex items-center justify-between gap-2.5 group shadow-xs cursor-pointer"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {hasReports ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors shrink-0"
              title={isExpanded ? 'Collapse team' : 'Expand team'}
            >
              {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
          ) : (
            <div className="w-6 shrink-0" />
          )}

          <div className="w-8 h-8 rounded-full bg-rose-50 border border-rose-200 text-[#8B1E22] flex items-center justify-center shrink-0">
            <IconComponent size={15} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <span className="text-xs font-bold text-slate-900 truncate">{node.name}</span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold border uppercase shrink-0 bg-rose-50 text-[#8B1E22] border-rose-200">
                L{node.hierarchy_level}
              </span>
              {node.employee_no && (
                <span className="text-[10px] font-semibold text-slate-400 hidden sm:inline">
                  • {node.employee_no}
                </span>
              )}
            </div>
            <p className="text-[11px] font-medium text-slate-500 truncate">{node.designation}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
            {node.department}
          </span>

          <div
            className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold shrink-0 flex items-center gap-1"
            title="Open Tasks"
          >
            <Briefcase size={11} />
            <span>{node.openTaskCount}</span>
          </div>

          {isAdmin && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMenuOpen(!isMenuOpen);
                }}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                title="User Actions"
              >
                <MoreVertical size={16} />
              </button>

              {isMenuOpen && (
                <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-30 text-xs animate-in fade-in zoom-in-95">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMenuOpen(false);
                      onEditUser(node);
                    }}
                    className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100 font-medium flex items-center gap-2"
                  >
                    <Edit3 size={14} className="text-slate-500" />
                    <span>Edit user</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMenuOpen(false);
                      onChangeManager(node);
                    }}
                    className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-100 font-medium flex items-center gap-2"
                  >
                    <GitBranch size={14} className="text-purple-600" />
                    <span>Change manager</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {hasReports && isExpanded && (
        <div className="ml-4 sm:ml-6 pl-3 sm:pl-4 border-l-2 border-slate-200 space-y-2 mt-2">
          {node.directReports.map((report) => (
            <OrgNodeItem
              key={report.id}
              node={report}
              level={level + 1}
              isAdmin={isAdmin}
              searchQuery={searchQuery}
              selectedDept={selectedDept}
              onEditUser={onEditUser}
              onChangeManager={onChangeManager}
              onSelectUser={onSelectUser}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// Main OrgChart Component
// ----------------------------------------------------------------------
export function OrgChart() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'flowchart' | 'tree'>('flowchart');
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [zoomLevel, setZoomLevel] = useState<number>(75);
  const [selectedEmployee, setSelectedEmployee] = useState<OrgNode | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Modals state
  const [changeManagerNode, setChangeManagerNode] = useState<OrgNode | null>(null);
  const [newManagerId, setNewManagerId] = useState<string>('');
  const [editUserModalData, setEditUserModalData] = useState<User | null>(null);

  const currentUser = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const isAdmin = currentUser?.role === 'ADMIN';

  // Fetch Org Chart Data
  const {
    data: orgTree = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<OrgNode[]>({
    queryKey: ['org-chart'],
    queryFn: async () => {
      const res: any = await apiClient.get('/users/org-chart');
      if (Array.isArray(res)) return res;
      if (Array.isArray(res?.data)) return res.data;
      return [];
    },
  });

  // Fetch all flat users for Reassign Manager Dropdown & Edit User
  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res: any = await apiClient.get('/users');
      return res.data?.users || [];
    },
  });

  const rootNode = useMemo(() => {
    if (!orgTree || orgTree.length === 0) return null;
    return (
      orgTree.find((n) => n.id === 'usr-hemant-001' || n.role === 'ADMIN' || n.hierarchy_level === 0) ||
      orgTree[0] ||
      null
    );
  }, [orgTree]);

  // Level 1 Pillars in exact order as PDF
  const level1Pillars = useMemo(() => {
    if (!rootNode) return [];
    return rootNode.directReports || [];
  }, [rootNode]);

  // Dynamic column width based on subtree width to guarantee zero card overlap
  const getColumnWidthClass = (pillar: OrgNode) => {
    const name = pillar.name.toLowerCase();
    if (name.includes('sanghshil')) return 'w-[756px] min-w-[756px] shrink-0';
    if (name.includes('dwarka') || name.includes('shailesh')) return 'w-[564px] min-w-[564px] shrink-0';
    if (name.includes('santosh')) return 'w-[376px] min-w-[376px] shrink-0';
    return 'w-[188px] min-w-[188px] shrink-0';
  };

  // Zoom controls
  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 10, 140));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 10, 40));
  const handleZoomReset = () => setZoomLevel(100);
  const handleFitWidth = () => setZoomLevel(60);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const openEditModal = (node: OrgNode) => {
    const fullUser = allUsers.find((u) => u.id === node.id);
    if (fullUser) {
      setEditUserModalData(fullUser);
    } else {
      setEditUserModalData({
        id: node.id,
        name: node.name,
        email: node.email,
        phone: node.phone,
        role: node.role,
        department: node.department,
        designation: node.designation,
        employee_no: node.employee_no,
        location: node.location,
        date_of_joining: node.date_of_joining,
        hierarchy_level: node.hierarchy_level,
        is_active: node.is_active,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
  };

  // Reassign Manager Mutation
  const changeManagerMutation = useMutation({
    mutationFn: async ({ userId, managerId }: { userId: string; managerId: string }) => {
      const res: any = await apiClient.patch(`/users/${userId}/manager`, { manager_id: managerId });
      return res.data;
    },
    onSuccess: () => {
      showToast({
        type: 'success',
        title: 'Manager Updated',
        message: 'Reporting line reassigned successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['org-chart'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setChangeManagerNode(null);
    },
    onError: (err: any) => {
      showToast({
        type: 'error',
        title: 'Failed to Change Manager',
        message: err?.response?.data?.message || err.message || 'An error occurred',
      });
    },
  });

  const handleChangeManagerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!changeManagerNode || !newManagerId) return;
    changeManagerMutation.mutate({ userId: changeManagerNode.id, managerId: newManagerId });
  };

  const departments = [
    'ALL',
    'Management',
    'Engineering',
    'HR & Admin',
    'Legal',
    'Liasoning',
    'Acquisition',
    'Sales',
    'Marketing',
    'AI Support',
    'Finance and Accounting',
    'Purchase',
    'Accounts',
  ];

  // Helper check for highlighting in flowchart
  const checkCardMatch = (node: OrgNode) => {
    return isNodeDirectMatch(node, searchFilter, selectedDept);
  };

  const hasFilterActive = searchFilter.trim() !== '' || selectedDept !== 'ALL';

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 bg-slate-200 rounded-xl w-64" />
        <div className="h-96 bg-slate-200/60 rounded-2xl" />
      </div>
    );
  }

  if (isError || !rootNode) {
    return (
      <div className="p-8 bg-red-50 border border-red-200 rounded-2xl text-center text-red-900">
        <AlertCircle size={36} className="mx-auto text-red-500 mb-2" />
        <h3 className="font-bold text-lg">Failed to load organization chart</h3>
        <p className="text-xs text-red-600 mt-1">Please ensure user directory data is loaded.</p>
        <button
          onClick={() => refetch()}
          className="mt-4 px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-xl hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Find specific columns with subtrees
  const dwarkaNode = level1Pillars.find((n) => n.name.toLowerCase().includes('dwarka'));
  const sanghshilNode = level1Pillars.find((n) => n.name.toLowerCase().includes('sanghshil'));
  const shaileshNode = level1Pillars.find((n) => n.name.toLowerCase().includes('shailesh'));
  const santoshNode = level1Pillars.find((n) => n.name.toLowerCase().includes('santosh'));

  return (
    <div className="space-y-4 max-w-full overflow-hidden">
      {/* Header bar matching PDF document header */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-brand text-white flex items-center justify-center font-black shadow-xs">
              <Layers size={22} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                BrickFour Organizational Hierarchy Chart
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Based on Employee Directory • Complete reporting tree & departmental pillars
              </p>
            </div>
          </div>
        </div>

        {/* View Mode Toggle & Actions */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* View Toggle */}
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200/80">
            <button
              onClick={() => setViewMode('flowchart')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'flowchart'
                  ? 'bg-white text-[#8B1E22] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers size={14} />
              <span>Flowchart View</span>
            </button>
            <button
              onClick={() => setViewMode('tree')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === 'tree'
                  ? 'bg-white text-[#8B1E22] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GitBranch size={14} />
              <span>Tree List View</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row items-center gap-3">
          {/* Search box */}
          <div className="relative flex-1 w-full">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search by employee name, ID (e.g. BRKF001), designation, department..."
              className="w-full pl-10 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-[#8B1E22] focus:outline-none transition-all"
            />
            {searchFilter && (
              <button
                onClick={() => setSearchFilter('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Flowchart Zoom Controls (Visible when in Flowchart mode) */}
          {viewMode === 'flowchart' && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
              <button
                onClick={handleZoomOut}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors"
                title="Zoom Out"
              >
                <ZoomOut size={15} />
              </button>
              <span className="text-[11px] font-bold text-slate-700 px-2 min-w-[42px] text-center">
                {zoomLevel}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors"
                title="Zoom In"
              >
                <ZoomIn size={15} />
              </button>
              <div className="w-px h-4 bg-slate-300 mx-0.5" />
              <button
                onClick={handleZoomReset}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors"
                title="Reset to 100%"
              >
                <RotateCcw size={14} />
              </button>
              <button
                onClick={handleFitWidth}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors"
                title="Fit Width"
              >
                <Maximize2 size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Department Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full pb-1 pt-0.5 text-xs no-scrollbar">
          {departments.map((dept) => (
            <button
              key={dept}
              onClick={() => setSelectedDept(dept)}
              className={`px-3 py-1 text-[11px] font-semibold rounded-lg transition-all shrink-0 ${
                selectedDept === dept
                  ? 'bg-[#8B1E22] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/70'
              }`}
            >
              {dept}
            </button>
          ))}
        </div>
      </div>

      {/* ====================================================================== */}
      {/* FLOWCHART VIEW (Matches uploaded PDF diagram)                          */}
      {/* ====================================================================== */}
      {viewMode === 'flowchart' && (
        <div className="bg-[#FAF9F9] rounded-2xl border border-slate-200/90 shadow-xs p-4 sm:p-6 overflow-x-auto overflow-y-visible relative min-h-[680px]">
          {/* Zoom Wrapper */}
          <div
            style={{
              transform: `scale(${zoomLevel / 100})`,
              transformOrigin: 'top center',
              transition: 'transform 0.15s ease-out',
            }}
            className="min-w-[3480px] mx-auto py-6 flex flex-col items-center select-none"
          >
            {/* 1. ROOT NODE: Hemant Sir (Director / CEO) */}
            <div className="flex flex-col items-center relative">
              <FlowchartCard
                node={rootNode}
                isRoot
                isMatch={checkCardMatch(rootNode)}
                isDimmed={hasFilterActive && !checkCardMatch(rootNode)}
                onSelect={setSelectedEmployee}
              />

              {/* Vertical connector trunk from Hemant Sir */}
              <div className="w-[2px] h-8 bg-[#8B1E22]" />
            </div>

            {/* 2. MAIN HORIZONTAL BUS CONNECTOR SPANNING OVER 9 PILLARS */}
            <div className="flex flex-row items-start justify-center gap-6 relative pt-0 min-w-max">
              {/* Horizontal line across all 9 pillars: starts at center of col 1 (Amol: 94px) and ends at center of last pillar */}
              <div
                className="absolute top-0 h-[2px] bg-[#8B1E22] z-10"
                style={{
                  left: '94px',
                  right: `${
                    (level1Pillars.length > 0
                      ? (() => {
                          const last = level1Pillars[level1Pillars.length - 1];
                          const name = last.name.toLowerCase();
                          if (name.includes('sanghshil')) return 756;
                          if (name.includes('dwarka') || name.includes('shailesh')) return 564;
                          if (name.includes('santosh')) return 376;
                          return 188;
                        })()
                      : 188) / 2
                  }px`,
                }}
              />
              {/* Center junction dot */}
              <div className="w-2.5 h-2.5 rounded-full bg-[#8B1E22] absolute left-1/2 -top-[4px] -translate-x-1/2 z-20" />

              {level1Pillars.map((pillar) => {
                const isMatch = checkCardMatch(pillar);
                const isDimmed = hasFilterActive && !isMatch;
                const colWidthClass = getColumnWidthClass(pillar);

                return (
                  <div key={pillar.id} className={`${colWidthClass} flex flex-col items-center`}>
                    {/* Vertical drop line from horizontal bus to card */}
                    <div className="w-[2px] h-6 bg-[#8B1E22]" />

                    {/* Pillar Card */}
                    <FlowchartCard
                      node={pillar}
                      isMatch={isMatch}
                      isDimmed={isDimmed}
                      onSelect={setSelectedEmployee}
                    />

                    {/* Subtree Branches for Pillars with Subordinates */}
                    {pillar.name.toLowerCase().includes('dwarka') && dwarkaNode && (
                      <div className="flex flex-col items-center mt-0 w-full">
                        {/* Down line */}
                        <div className="w-[2px] h-6 bg-slate-300" />
                        {/* Sub-bus for Dwarka's 3 reports: Archana, Balasaheb, Vikas */}
                        <div className="w-full relative pt-0">
                          <div className="absolute top-0 left-[90px] right-[90px] h-[2px] bg-slate-300 z-10" />
                          <div className="grid grid-cols-3 gap-3 w-full">
                            {dwarkaNode.directReports.map((subNode) => (
                              <div key={subNode.id} className="flex flex-col items-center">
                                <div className="w-[2px] h-5 bg-slate-300" />
                                <FlowchartCard
                                  node={subNode}
                                  isMatch={checkCardMatch(subNode)}
                                  isDimmed={hasFilterActive && !checkCardMatch(subNode)}
                                  onSelect={setSelectedEmployee}
                                />

                                {/* Vikas Khatik has Darshana Uttam Ghodake under him */}
                                {subNode.name.toLowerCase().includes('vikas') &&
                                  subNode.directReports &&
                                  subNode.directReports.length > 0 && (
                                    <div className="flex flex-col items-center mt-0">
                                      <div className="w-[2px] h-6 bg-slate-300 relative flex items-center justify-center">
                                        <div className="w-1.5 h-1.5 border-b-2 border-r-2 border-slate-400 rotate-45 absolute bottom-0" />
                                      </div>
                                      {subNode.directReports.map((leafNode) => (
                                        <FlowchartCard
                                          key={leafNode.id}
                                          node={leafNode}
                                          isMatch={checkCardMatch(leafNode)}
                                          isDimmed={hasFilterActive && !checkCardMatch(leafNode)}
                                          onSelect={setSelectedEmployee}
                                        />
                                      ))}
                                    </div>
                                  )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Sanghshil's Team: Atul, Kapil, Nishant, Omkar, Sonal (+ Bhagyashree), Sachin */}
                    {pillar.name.toLowerCase().includes('sanghshil') && sanghshilNode && (
                      <div className="flex flex-col items-center mt-0 w-full">
                        <div className="w-[2px] h-6 bg-slate-300" />
                        {/* Sub-bus for Sanghshil's subordinates */}
                        <div className="w-full relative pt-0">
                          <div className="absolute top-0 left-[60px] right-[60px] h-[2px] bg-slate-300 z-10" />
                          <div className="grid grid-cols-3 gap-3 w-full">
                            {sanghshilNode.directReports.map((subNode) => (
                              <div key={subNode.id} className="flex flex-col items-center">
                                <div className="w-[2px] h-5 bg-slate-300" />
                                <FlowchartCard
                                  node={subNode}
                                  isMatch={checkCardMatch(subNode)}
                                  isDimmed={hasFilterActive && !checkCardMatch(subNode)}
                                  onSelect={setSelectedEmployee}
                                />

                                {/* Sonal has Bhagyashree Patil */}
                                {subNode.directReports && subNode.directReports.length > 0 && (
                                  <div className="flex flex-col items-center mt-0">
                                    <div className="w-[2px] h-5 bg-slate-300 relative flex items-center justify-center">
                                      <div className="w-1.5 h-1.5 border-b-2 border-r-2 border-slate-400 rotate-45 absolute bottom-0" />
                                    </div>
                                    {subNode.directReports.map((leafNode) => (
                                      <FlowchartCard
                                        key={leafNode.id}
                                        node={leafNode}
                                        isMatch={checkCardMatch(leafNode)}
                                        isDimmed={hasFilterActive && !checkCardMatch(leafNode)}
                                        onSelect={setSelectedEmployee}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Shailesh Kerkar's Team: Ganesh Shivaji Veer, Jyotsana Nikum (+ Akshay), Prajeet Patil */}
                    {pillar.name.toLowerCase().includes('shailesh') && shaileshNode && (
                      <div className="flex flex-col items-center mt-0 w-full">
                        <div className="w-[2px] h-6 bg-slate-300" />
                        <div className="w-full relative pt-0">
                          <div className="absolute top-0 left-[90px] right-[90px] h-[2px] bg-slate-300 z-10" />
                          <div className="grid grid-cols-3 gap-3 w-full">
                            {shaileshNode.directReports.map((subNode) => (
                              <div key={subNode.id} className="flex flex-col items-center">
                                <div className="w-[2px] h-5 bg-slate-300" />
                                <FlowchartCard
                                  node={subNode}
                                  isMatch={checkCardMatch(subNode)}
                                  isDimmed={hasFilterActive && !checkCardMatch(subNode)}
                                  onSelect={setSelectedEmployee}
                                />

                                {/* Jyotsana has Akshay Sonawane under her */}
                                {subNode.name.toLowerCase().includes('jyotsana') &&
                                  subNode.directReports &&
                                  subNode.directReports.length > 0 && (
                                    <div className="flex flex-col items-center mt-0">
                                      <div className="w-[2px] h-6 bg-slate-300 relative flex items-center justify-center">
                                        <div className="w-1.5 h-1.5 border-b-2 border-r-2 border-slate-400 rotate-45 absolute bottom-0" />
                                      </div>
                                      {subNode.directReports.map((leafNode) => (
                                        <FlowchartCard
                                          key={leafNode.id}
                                          node={leafNode}
                                          isMatch={checkCardMatch(leafNode)}
                                          isDimmed={hasFilterActive && !checkCardMatch(leafNode)}
                                          onSelect={setSelectedEmployee}
                                        />
                                      ))}
                                    </div>
                                  )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Santosh Kotgire's Team: Suvidha Deshmukh, Tayamma Bhandari */}
                    {pillar.name.toLowerCase().includes('santosh') && santoshNode && (
                      <div className="flex flex-col items-center mt-0 w-full">
                        <div className="w-[2px] h-6 bg-slate-300" />
                        <div className="w-full relative pt-0">
                          <div className="absolute top-0 left-[90px] right-[90px] h-[2px] bg-slate-300 z-10" />
                          <div className="grid grid-cols-2 gap-3 w-full">
                            {santoshNode.directReports.map((subNode) => (
                              <div key={subNode.id} className="flex flex-col items-center">
                                <div className="w-[2px] h-5 bg-slate-300" />
                                <FlowchartCard
                                  node={subNode}
                                  isMatch={checkCardMatch(subNode)}
                                  isDimmed={hasFilterActive && !checkCardMatch(subNode)}
                                  onSelect={setSelectedEmployee}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom Footer Watermark (Matching PDF Diagram) */}
            <div className="w-full max-w-[3400px] mt-16 pt-6 border-t border-slate-200 flex items-center justify-between text-slate-400 text-xs px-4">
              <div className="flex items-center gap-3">
                <BrickFourLogo size={28} />
                <span className="font-bold text-slate-600">BrickFour Organizational Directory</span>
              </div>
              <p className="italic text-[11px]">
                Reporting relationships preserved as provided in source directory.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* TREE LIST VIEW (Nested Indented List with Expand/Collapse)            */}
      {/* ====================================================================== */}
      {viewMode === 'tree' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-xs w-full max-w-full overflow-hidden space-y-2">
          {orgTree && orgTree.length > 0 ? (
            orgTree.map((root) => (
              <OrgNodeItem
                key={root.id}
                node={root}
                level={0}
                isAdmin={isAdmin}
                searchQuery={searchFilter}
                selectedDept={selectedDept}
                onEditUser={openEditModal}
                onChangeManager={(node) => {
                  setChangeManagerNode(node);
                  setNewManagerId('');
                }}
                onSelectUser={setSelectedEmployee}
              />
            ))
          ) : (
            <div className="text-center py-16 text-slate-500">
              <UsersIcon size={44} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-semibold">No organization structure data found</p>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================== */}
      {/* EMPLOYEE DETAIL SLIDE-OVER DRAWER                                      */}
      {/* ====================================================================== */}
      {selectedEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div>
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-rose-50 text-[#8B1E22] border border-rose-200">
                    Tier L{selectedEmployee.hierarchy_level}
                  </span>
                  {selectedEmployee.employee_no && (
                    <span className="text-xs font-bold text-slate-500 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                      ID: {selectedEmployee.employee_no}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setSelectedEmployee(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Profile Card Summary */}
              <div className="p-6 border-b border-slate-100 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#8B1E22] text-white font-black text-xl flex items-center justify-center mx-auto shadow-md">
                  {selectedEmployee.name.charAt(0)}
                </div>
                <h2 className="text-lg font-black text-slate-900 mt-3">{selectedEmployee.name}</h2>
                <p className="text-xs font-bold text-[#8B1E22] mt-0.5">{selectedEmployee.designation}</p>
                <p className="text-xs text-slate-500 font-medium">{selectedEmployee.department}</p>
              </div>

              {/* Details List */}
              <div className="p-6 space-y-4 text-xs">
                {/* Email with copy */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <Mail size={16} className="text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-slate-400 font-semibold uppercase">Email Address</p>
                      <a
                        href={`mailto:${selectedEmployee.email}`}
                        className="font-semibold text-slate-900 hover:text-[#8B1E22] truncate block"
                      >
                        {selectedEmployee.email}
                      </a>
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(selectedEmployee.email, 'email')}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60"
                    title="Copy Email"
                  >
                    {copiedField === 'email' ? (
                      <Check size={14} className="text-emerald-600" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </div>

                {/* Phone with copy */}
                {selectedEmployee.phone && (
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <PhoneCall size={16} className="text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-slate-400 font-semibold uppercase">Phone Number</p>
                        <a
                          href={`tel:${selectedEmployee.phone}`}
                          className="font-semibold text-slate-900 hover:text-[#8B1E22]"
                        >
                          +91 {selectedEmployee.phone}
                        </a>
                      </div>
                    </div>
                    <button
                      onClick={() => copyToClipboard(selectedEmployee.phone!, 'phone')}
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60"
                      title="Copy Phone"
                    >
                      {copiedField === 'phone' ? (
                        <Check size={14} className="text-emerald-600" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  </div>
                )}

                {/* Location & Date of Joining */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                      <MapPin size={13} />
                      <span className="text-[10px] font-semibold uppercase">Office Location</span>
                    </div>
                    <p className="font-bold text-slate-900">{selectedEmployee.location || 'Yerwada'}</p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                      <Calendar size={13} />
                      <span className="text-[10px] font-semibold uppercase">Date of Joining</span>
                    </div>
                    <p className="font-bold text-slate-900">
                      {selectedEmployee.date_of_joining || '2024-01-01'}
                    </p>
                  </div>
                </div>

                {/* Direct Reports Count */}
                {selectedEmployee.directReports && selectedEmployee.directReports.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-rose-50/50 border border-rose-100">
                    <p className="text-[11px] font-bold text-[#8B1E22] flex items-center gap-1.5 mb-2">
                      <UsersIcon size={14} />
                      <span>Direct Team Members ({selectedEmployee.directReports.length})</span>
                    </p>
                    <div className="space-y-1.5">
                      {selectedEmployee.directReports.map((member) => (
                        <div
                          key={member.id}
                          onClick={() => setSelectedEmployee(member)}
                          className="p-2 bg-white rounded-lg border border-rose-200/60 flex items-center justify-between cursor-pointer hover:bg-rose-50/60 transition-colors"
                        >
                          <div>
                            <p className="font-bold text-slate-900">{member.name}</p>
                            <p className="text-[10px] text-slate-500">{member.designation}</p>
                          </div>
                          <ArrowRight size={13} className="text-slate-400" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions Footer */}
            <div className="p-5 border-t border-slate-100 bg-slate-50/50 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    navigate('/messages');
                    setSelectedEmployee(null);
                  }}
                  className="w-full py-2.5 px-3 bg-[#8B1E22] hover:bg-[#73171a] text-white font-bold rounded-xl text-xs shadow-xs transition-colors text-center"
                >
                  Send Message
                </button>
                <button
                  onClick={() => {
                    navigate('/tasks');
                    setSelectedEmployee(null);
                  }}
                  className="w-full py-2.5 px-3 bg-white hover:bg-slate-100 text-slate-800 border border-slate-200 font-bold rounded-xl text-xs transition-colors text-center"
                >
                  Assign Task
                </button>
              </div>

              {isAdmin && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => {
                      openEditModal(selectedEmployee);
                      setSelectedEmployee(null);
                    }}
                    className="flex-1 py-2 text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Edit3 size={13} />
                    <span>Edit Profile</span>
                  </button>
                  <button
                    onClick={() => {
                      setChangeManagerNode(selectedEmployee);
                      setNewManagerId('');
                      setSelectedEmployee(null);
                    }}
                    className="flex-1 py-2 text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <GitBranch size={13} />
                    <span>Change Manager</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* CHANGE MANAGER MODAL                                                   */}
      {/* ====================================================================== */}
      {changeManagerNode && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <GitBranch size={18} className="text-purple-600" />
                <span>Change Manager</span>
              </h3>
              <button
                onClick={() => setChangeManagerNode(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleChangeManagerSubmit} className="space-y-4 mt-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#8B1E22] text-white font-bold flex items-center justify-center text-xs">
                  {changeManagerNode.name.charAt(0)}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">{changeManagerNode.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {changeManagerNode.designation} • {changeManagerNode.department}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Select New Manager
                </label>
                <select
                  value={newManagerId}
                  onChange={(e) => setNewManagerId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-[#8B1E22] focus:outline-none"
                  required
                >
                  <option value="">-- Choose New Manager --</option>
                  {allUsers
                    ?.filter((u) => u.id !== changeManagerNode.id && u.is_active)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.designation} - {u.role})
                      </option>
                    ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  System prevents circular reporting relationships.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setChangeManagerNode(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newManagerId || changeManagerMutation.isPending}
                  className="px-4 py-2 bg-[#8B1E22] hover:bg-[#73171a] text-white font-semibold text-xs rounded-xl shadow-xs transition-colors disabled:opacity-50"
                >
                  {changeManagerMutation.isPending ? 'Updating...' : 'Confirm Manager'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====================================================================== */}
      {/* EDIT USER MODAL                                                        */}
      {/* ====================================================================== */}
      <EditUserModal
        user={editUserModalData}
        isOpen={!!editUserModalData}
        onClose={() => setEditUserModalData(null)}
      />
    </div>
  );
}
