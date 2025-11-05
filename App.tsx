

import React, { useState, useEffect, useMemo, useCallback, useRef, createContext, useContext } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, recalculateBalancesForParty } from './lib/db';
import type { Party, LedgerEntry, PartyType } from './types';
import { formatCurrency, formatDate } from './lib/utils';
import {
  UsersIcon, LayoutDashboardIcon, SettingsIcon, PlusIcon, ArrowLeftIcon, MoreVerticalIcon, SunIcon, MoonIcon, UserPlusIcon, EditIcon, Trash2Icon
} from './components/Icons';

// --- TOAST NOTIFICATION SYSTEM ---
type ToastMessage = { id: number; message: string; type: 'success' | 'error' };
type ToastContextType = { showToast: (message: string, type?: 'success' | 'error') => void; };

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2">
        {toasts.map(toast => (
          <div key={toast.id} className={`px-4 py-2 rounded-full text-sm font-medium shadow-lg animate-fade-in-up ${toast.type === 'success' ? 'bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'bg-danger-DEFAULT text-white'}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
};


// --- THEME MANAGEMENT ---
type Theme = 'light' | 'dark' | 'system';
const ThemeContext = React.createContext<{ theme: Theme; setTheme: (theme: Theme) => void; } | undefined>(undefined);

const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'system');

  useEffect(() => {
    const root = window.document.documentElement;
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const currentTheme = theme === 'system' ? systemTheme : theme;
    
    root.classList.remove('light', 'dark');
    root.classList.add(currentTheme);
    localStorage.setItem('theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', currentTheme === 'dark' ? '#18181b' : '#f9fafb');
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
};

const useTheme = () => {
  const context = React.useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// --- NAVIGATION / ROUTING ---
type Page = 'dashboard' | 'parties' | 'settings' | 'party-detail' | 'add-party' | 'edit-party' | 'add-entry' | 'edit-entry';
type Route = { page: Page; params?: any };

const useRouter = () => {
  const [route, setRoute] = useState<Route>({ page: 'dashboard' });

  const navigate = useCallback((page: Page, params?: any) => {
    window.scrollTo(0, 0);
    setRoute({ page, params });
  }, []);

  return { route, navigate };
};

// --- UI COMPONENTS ---

const Header: React.FC<{ title: string; onBack?: () => void; actions?: React.ReactNode }> = ({ title, onBack, actions }) => (
  <header className="sticky top-0 z-10 flex items-center justify-between h-16 px-4 bg-gray-50/80 dark:bg-zinc-900/80 backdrop-blur-sm border-b border-gray-200 dark:border-zinc-800">
    <div className="flex items-center gap-2">
      {onBack && (
        <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-800" aria-label="Go back">
          <ArrowLeftIcon className="w-6 h-6" />
        </button>
      )}
      <h1 className="text-xl font-bold">{title}</h1>
    </div>
    <div className="flex items-center gap-2">{actions}</div>
  </header>
);

const BottomNav: React.FC<{ activePage: Page; onNavigate: (page: Page) => void }> = ({ activePage, onNavigate }) => {
  // FIX: Changed icon type from React.ReactNode to React.ReactElement to allow cloning with a className prop.
  const navItems: { page: Page; icon: React.ReactElement; label: string }[] = [
    { page: 'dashboard', icon: <LayoutDashboardIcon />, label: 'Dashboard' },
    { page: 'parties', icon: <UsersIcon />, label: 'Parties' },
    { page: 'settings', icon: <SettingsIcon />, label: 'Settings' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 bg-gray-100 dark:bg-zinc-900 border-t border-gray-200 dark:border-zinc-800 pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around h-16">
        {navItems.map(item => (
          <button
            key={item.page}
            onClick={() => onNavigate(item.page)}
            className={`flex flex-col items-center justify-center w-full gap-1 transition-colors ${
              activePage === item.page
                ? 'text-indigo-600 dark:text-indigo-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400'
            }`}
          >
            {/* FIX: Cast the icon element to inform TypeScript it accepts a `className` prop, resolving an overload error with React.cloneElement. */}
            {React.cloneElement(item.icon as React.ReactElement<{className?: string}>, { className: 'w-6 h-6' })}
            <span className="text-xs font-medium">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

const Card: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white dark:bg-zinc-800/50 rounded-2xl shadow-sm p-4 ${className}`}>
    {children}
  </div>
);

const DropdownMenu: React.FC<{ trigger: React.ReactNode; children: React.ReactNode }> = ({ trigger, children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <div onClick={() => setIsOpen(o => !o)}>{trigger}</div>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-800 rounded-md shadow-lg z-20 ring-1 ring-black dark:ring-zinc-700 ring-opacity-5 animate-fade-in-fast">
          <div className="py-1" role="menu" aria-orientation="vertical">
            {React.Children.map(children, child => {
              if (React.isValidElement(child)) {
                // FIX: Cast `child` to `React.ReactElement<any>` to inform TypeScript that it can accept the new `onClick` prop, resolving the overload error.
                const props = child.props as { onClick?: () => void; [key: string]: any };
                return React.cloneElement(child as React.ReactElement<any>, {
                  ...props,
                  onClick: () => {
                    props.onClick?.();
                    setIsOpen(false);
                  },
                });
              }
              return child;
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const DropdownMenuItem: React.FC<{ onClick: () => void; children: React.ReactNode; className?: string }> = ({ onClick, children, className = '' }) => (
  <button onClick={onClick} className={`flex items-center gap-3 w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-700 ${className}`} role="menuitem">
    {children}
  </button>
);

const ConfirmationModal: React.FC<{ isOpen: boolean; onClose: () => void; onConfirm: () => void; title: string; children: React.ReactNode; }> = ({ isOpen, onClose, onConfirm, title, children }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in-fast" onClick={onClose}>
            <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-xl w-full max-w-sm m-4 p-6 animate-fade-in-up" onClick={e => e.stopPropagation()}>
                <h2 className="text-lg font-bold">{title}</h2>
                <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">{children}</div>
                <div className="mt-6 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-zinc-700 font-semibold text-sm">Cancel</button>
                    <button onClick={onConfirm} className="px-4 py-2 rounded-lg bg-danger-DEFAULT text-white font-semibold text-sm">Confirm</button>
                </div>
            </div>
        </div>
    );
};

const Page: React.FC<{ children: React.ReactNode, className?: string}> = ({ children, className }) => (
    <div className={`animate-fade-in ${className}`}>{children}</div>
);

// --- SKELETON LOADERS ---
const Skeleton: React.FC<{ className?: string }> = ({ className }) => <div className={`bg-gray-200 dark:bg-zinc-800 rounded-md animate-pulse ${className}`} />;

const PartiesListSkeleton: React.FC = () => (
    <div className="p-4 space-y-3">
        <Skeleton className="h-10 w-full" />
        {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-zinc-800/50 rounded-xl p-4 flex justify-between items-center">
                <div>
                    <Skeleton className="h-5 w-32 mb-2" />
                    <Skeleton className="h-4 w-24" />
                </div>
                <div className="text-right">
                    <Skeleton className="h-5 w-20 mb-2" />
                    <Skeleton className="h-3 w-16" />
                </div>
            </div>
        ))}
    </div>
);

// --- PAGES ---

const DashboardPage: React.FC<{ onNavigate: (page: Page, params?: any) => void }> = ({ onNavigate }) => {
  const parties = useLiveQuery(() => db.parties.toArray(), []);

  const { totalReceivable, totalPayable } = useMemo(() => {
    if (!parties) return { totalReceivable: 0, totalPayable: 0 };
    return parties.reduce(
      (acc, party) => {
        if (party.balance > 0) acc.totalReceivable += party.balance;
        if (party.balance < 0) acc.totalPayable += Math.abs(party.balance);
        return acc;
      }, { totalReceivable: 0, totalPayable: 0 }
    );
  }, [parties]);
  
  return (
    <Page>
      <Header title="Dashboard" />
      <main className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <h3 className="text-sm text-gray-500 dark:text-gray-400">You will receive</h3>
            <p className="text-2xl font-bold text-green-600 dark:text-green-500 tracking-tight">{formatCurrency(totalReceivable)}</p>
          </Card>
          <Card>
            <h3 className="text-sm text-gray-500 dark:text-gray-400">You Owe</h3>
            <p className="text-2xl font-bold text-red-600 dark:text-red-500 tracking-tight">{formatCurrency(totalPayable)}</p>
          </Card>
        </div>
        <Card>
           <h3 className="font-semibold mb-2">Recent Parties</h3>
            {!parties ? <Skeleton className="h-40 w-full"/> : parties.length > 0 ? (
                <ul className="divide-y divide-gray-200 dark:divide-zinc-700">
                    {parties.slice(0, 5).map(party => (
                        <li key={party.id} onClick={() => onNavigate('party-detail', { partyId: party.id })} className="py-3 flex justify-between items-center cursor-pointer">
                            <div>
                                <p className="font-medium">{party.name}</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{party.phone}</p>
                            </div>
                             <div className={`text-right ${party.balance > 0 ? 'text-green-600 dark:text-green-500' : party.balance < 0 ? 'text-red-600 dark:text-red-500' : ''}`}>
                                <p className="font-mono font-semibold tracking-tighter">{formatCurrency(Math.abs(party.balance))}</p>
                                <p className="text-xs">{party.balance > 0 ? 'Receivable' : party.balance < 0 ? 'Payable' : 'Settled'}</p>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="text-center text-gray-500 dark:text-gray-400 py-4">
                  <p>No parties added yet.</p>
                  <button onClick={() => onNavigate('add-party')} className="mt-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400">Add your first party</button>
                </div>
            )}
        </Card>
      </main>
    </Page>
  );
};

const PartiesPage: React.FC<{ onNavigate: (page: Page, params?: any) => void }> = ({ onNavigate }) => {
  const parties = useLiveQuery(() => db.parties.orderBy('name').toArray(), []);
  const [searchTerm, setSearchTerm] = useState('');
  
  const filteredParties = useMemo(() => {
    if (!parties) return undefined;
    if (!searchTerm) return parties;
    return parties.filter(p =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.phone.includes(searchTerm)
    );
  }, [parties, searchTerm]);

  return (
    <Page>
      <Header title="Parties" actions={
        <button onClick={() => onNavigate('add-party')} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-800" aria-label="Add new party">
          <UserPlusIcon className="w-6 h-6" />
        </button>
      }/>
      <main className="p-4">
        <input type="text" placeholder="Search by name or phone..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full px-4 py-2 mb-4 bg-gray-100 border-transparent rounded-lg dark:bg-zinc-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"/>
        {!filteredParties ? <PartiesListSkeleton /> : filteredParties.length > 0 ? (
          <ul className="space-y-3">
            {filteredParties.map(party => (
              <li key={party.id} onClick={() => onNavigate('party-detail', { partyId: party.id })} className="bg-white dark:bg-zinc-800/50 rounded-xl shadow-sm p-4 flex justify-between items-center cursor-pointer active:scale-[0.98] transition-transform">
                <div>
                  <p className="font-semibold">{party.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{party.phone}</p>
                </div>
                <div className={`text-right ${party.balance > 0 ? 'text-green-600 dark:text-green-500' : party.balance < 0 ? 'text-red-600 dark:text-red-500' : ''}`}>
                  <p className="font-mono font-semibold tracking-tighter">{formatCurrency(Math.abs(party.balance))}</p>
                  <p className="text-xs">{party.balance > 0 ? 'Receivable' : party.balance < 0 ? 'Payable' : 'Settled'}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-center text-gray-500 mt-8">No parties found.</p>
        )}
      </main>
    </Page>
  );
};

const PartyDetailPage: React.FC<{ partyId: number, onNavigate: (page: Page, params?: any) => void; onBack: () => void; setDeleteConfirmation: (config: any) => void; }> = ({ partyId, onNavigate, onBack, setDeleteConfirmation }) => {
  const party = useLiveQuery(() => db.parties.get(partyId), [partyId]);
  const entries = useLiveQuery(() => db.entries.where('partyId').equals(partyId).reverse().sortBy('date'), [partyId]);

  if (!party) return <div>Loading...</div>; // Could be a skeleton here

  const balanceColor = party.balance > 0 ? 'text-green-600 dark:text-green-500' : party.balance < 0 ? 'text-red-600 dark:text-red-500' : '';
  const balanceLabel = party.balance > 0 ? 'You will receive' : party.balance < 0 ? 'You Owe' : 'Settled';

  const partyActions = (
    <DropdownMenu trigger={
      <button className="p-2 -mr-2 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-800" aria-label="Party options">
        <MoreVerticalIcon className="w-6 h-6"/>
      </button>
    }>
      <DropdownMenuItem onClick={() => onNavigate('edit-party', { partyId })}>
          <EditIcon className="w-4 h-4" /> Edit Party
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setDeleteConfirmation({ type: 'party', party, partyId })} className="text-danger-DEFAULT dark:text-danger-DEFAULT">
          <Trash2Icon className="w-4 h-4" /> Delete Party
      </DropdownMenuItem>
    </DropdownMenu>
  );

  return (
    <Page className="flex flex-col h-full">
      <Header title={party.name} onBack={onBack} actions={partyActions}/>
      <main className="flex-grow">
        <div className="p-4 bg-white dark:bg-zinc-800/50 border-b border-gray-200 dark:border-zinc-800">
            <p className={`text-sm ${balanceColor}`}>{balanceLabel}</p>
            <p className={`text-3xl font-bold tracking-tight ${balanceColor}`}>{formatCurrency(Math.abs(party.balance))}</p>
        </div>
        
        <div className="p-4 pb-32">
             <h3 className="font-semibold mb-2 text-lg">History</h3>
             {!entries ? <Skeleton className="w-full h-40" /> : entries.length > 0 ? (
                <ul className="space-y-3">
                    {entries.map(entry => (
                        <li key={entry.id} className="flex justify-between items-start p-3 bg-white dark:bg-zinc-800/50 rounded-lg">
                           <div className="flex-grow">
                             <p className="font-medium capitalize">{formatDate(entry.date)}</p>
                             <p className="text-sm text-gray-500 dark:text-gray-400">{entry.note || 'Transaction'}</p>
                           </div>
                           <div className="text-right flex-shrink-0 ml-4">
                               <p className={`font-semibold font-mono tracking-tighter ${entry.direction === 'credit' ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'}`}>
                                 {entry.direction === 'credit' ? '+' : '-'} {formatCurrency(entry.amount)}
                               </p>
                               <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">Bal: {formatCurrency(entry.balanceAfter)}</p>
                           </div>
                           <div className="ml-2">
                             <DropdownMenu trigger={
                                <button className="p-2 -m-2 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700" aria-label="Entry options">
                                  <MoreVerticalIcon className="w-5 h-5"/>
                                </button>
                              }>
                                <DropdownMenuItem onClick={() => onNavigate('edit-entry', { entryId: entry.id, partyId })}>
                                  <EditIcon className="w-4 h-4" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setDeleteConfirmation({ type: 'entry', entryId: entry.id, partyId })} className="text-danger-DEFAULT dark:text-danger-DEFAULT">
                                  <Trash2Icon className="w-4 h-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenu>
                           </div>
                        </li>
                    ))}
                </ul>
             ) : (
                <p className="text-center text-gray-500 py-8">No transactions yet.</p>
             )}
        </div>
      </main>
      <div className="fixed bottom-0 left-0 right-0 z-10 bg-gray-100/80 dark:bg-zinc-900/80 backdrop-blur-sm border-t border-gray-200 dark:border-zinc-800 pb-[env(safe-area-inset-bottom)]">
        <div className="flex gap-4 p-4">
            <button onClick={() => onNavigate('add-entry', { partyId, direction: 'debit' })} className="w-full py-3 rounded-lg font-semibold bg-red-600 text-white">You Got (Debit)</button>
            <button onClick={() => onNavigate('add-entry', { partyId, direction: 'credit' })} className="w-full py-3 rounded-lg font-semibold bg-green-600 text-white">You Gave (Credit)</button>
        </div>
      </div>
    </Page>
  );
};

const AddEditPartyPage: React.FC<{ onBack: () => void, partyId?: number }> = ({ onBack, partyId }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState<PartyType>('customer');
  const { showToast } = useToast();
  
  const partyToEdit = useLiveQuery(() => partyId ? db.parties.get(partyId) : undefined, [partyId]);

  useEffect(() => {
    if (partyToEdit) {
      setName(partyToEdit.name);
      setPhone(partyToEdit.phone);
      setType(partyToEdit.type);
    }
  }, [partyToEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;
    
    const partyData = { name, phone, type, updatedAt: new Date() };

    if (partyId) {
        await db.parties.update(partyId, partyData);
        showToast('Party updated successfully');
    } else {
        await db.parties.add({ ...partyData, balance: 0, createdAt: new Date() });
        showToast('Party added successfully');
    }
    
    onBack();
  };

  return (
    <Page>
      <Header title={partyId ? "Edit Party" : "Add Party"} onBack={onBack}/>
      <main className="p-4">
        <form onSubmit={handleSubmit} className="space-y-4 pb-20">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Name</label>
            <input type="text" id="name" value={name} onChange={e => setName(e.target.value)} required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Phone Number</label>
            <input type="tel" id="phone" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
          </div>
           <div>
            <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">Party Type</span>
            <div className="mt-2 flex gap-4">
              <label className="flex items-center">
                <input type="radio" name="type" value="customer" checked={type === 'customer'} onChange={() => setType('customer')} className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300" />
                <span className="ml-2">Customer</span>
              </label>
              <label className="flex items-center">
                <input type="radio" name="type" value="supplier" checked={type === 'supplier'} onChange={() => setType('supplier')} className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300" />
                <span className="ml-2">Supplier</span>
              </label>
            </div>
          </div>
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm border-t border-gray-200 dark:border-zinc-800">
            <button type="submit" className="w-full py-3 px-4 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900">
              Save Party
            </button>
          </div>
        </form>
      </main>
    </Page>
  );
};

const AddEditEntryPage: React.FC<{ partyId: number, onBack: () => void, entryId?: number, initialDirection?: 'credit' | 'debit' }> = ({ partyId, onBack, entryId, initialDirection }) => {
    const party = useLiveQuery(() => db.parties.get(partyId), [partyId]);
    const entryToEdit = useLiveQuery(() => entryId ? db.entries.get(entryId) : undefined, [entryId]);
    const { showToast } = useToast();
    
    const [amount, setAmount] = useState('');
    const [note, setNote] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [direction, setDirection] = useState<'credit' | 'debit'>(initialDirection || 'credit');

    useEffect(() => {
        if (entryToEdit) {
            setAmount(String(entryToEdit.amount));
            setNote(entryToEdit.note || '');
            setDate(new Date(entryToEdit.date).toISOString().split('T')[0]);
            setDirection(entryToEdit.direction);
        }
    }, [entryToEdit]);

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0 || !party) return;
      
      if (entryId) {
         await db.entries.update(entryId, { amount: numAmount, direction, note, date: new Date(date) });
         await recalculateBalancesForParty(partyId);
         showToast("Entry updated");
      } else {
        await db.transaction('rw', db.parties, db.entries, async () => {
            const currentParty = await db.parties.get(partyId);
            if(!currentParty) throw new Error("Party not found");
            const entries = await db.entries.where({ partyId }).sortBy('date');
            
            const newEntry = {
                id: 0, // temp id for sorting
                partyId,
                amount: numAmount,
                direction,
                note,
                date: new Date(date),
                balanceAfter: 0, // will be calculated
                createdAt: new Date(),
            };

            const allEntries = [...entries, newEntry].sort((a, b) => a.date.getTime() - b.date.getTime() || (a.createdAt?.getTime() || 0) - (b.createdAt?.getTime() || 0));
            
            let runningBalance = 0;
            const updates: Promise<any>[] = [];

            for (const entry of allEntries) {
                const entryAmount = entry.direction === 'credit' ? entry.amount : -entry.amount;
                runningBalance += entryAmount;
                if(entry.id === 0) { // our new entry
                    entry.balanceAfter = runningBalance;
                } else if (entry.balanceAfter !== runningBalance) {
                    updates.push(db.entries.update(entry.id!, { balanceAfter: runningBalance }));
                }
            }
            
            delete (newEntry as any).id; // remove temp id before adding
            updates.push(db.entries.add(newEntry));
            updates.push(db.parties.update(partyId, { balance: runningBalance, updatedAt: new Date() }));
            
            await Promise.all(updates);
        });
        showToast("Entry added");
      }
      
      onBack();
    };

    if (!party) return null;
    
    return (
      <Page>
        <Header title={entryId ? `Edit Entry` : `Add Entry for ${party.name}`} onBack={onBack}/>
        <main className="p-4">
          <form onSubmit={handleSubmit} className="space-y-6 pb-24">
            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Amount</label>
              <input type="text" id="amount" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-md shadow-sm text-3xl font-bold focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" placeholder="0.00" />
            </div>

            <div className="flex gap-4">
                <button type="button" onClick={() => setDirection('credit')} className={`w-full py-3 rounded-lg font-semibold transition-colors ${direction === 'credit' ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-zinc-700'}`}>You Gave (Credit)</button>
                <button type="button" onClick={() => setDirection('debit')} className={`w-full py-3 rounded-lg font-semibold transition-colors ${direction === 'debit' ? 'bg-red-600 text-white' : 'bg-gray-200 dark:bg-zinc-700'}`}>You Got (Debit)</button>
            </div>

            <div>
              <label htmlFor="note" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Note (Optional)</label>
              <input type="text" id="note" value={note} onChange={e => setNote(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" />
            </div>

             <div className="relative">
              <label htmlFor="date" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Date</label>
              <input type="date" id="date" value={date} onChange={e => setDate(e.target.value)} required className="mt-1 block w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 appearance-none" />
            </div>
          
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm border-t border-gray-200 dark:border-zinc-800">
                <button type="submit" className="w-full py-3 px-4 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900">
                  Save Entry
                </button>
            </div>
          </form>
        </main>
      </Page>
    );
};

const SettingsPage: React.FC = () => {
  const { theme, setTheme } = useTheme();
  return (
    <Page>
      <Header title="Settings" />
      <main className="p-4">
        <Card>
          <h3 className="font-semibold mb-2">Theme</h3>
          <div className="flex items-center justify-between">
            <p>Appearance</p>
            <div className="flex items-center gap-1 p-1 bg-gray-200 dark:bg-zinc-700 rounded-lg">
              <button onClick={() => setTheme('light')} className={`p-2 rounded-md transition-colors ${theme === 'light' ? 'bg-white dark:bg-zinc-900 shadow-sm' : ''}`}><SunIcon className="w-5 h-5"/></button>
              <button onClick={() => setTheme('dark')} className={`p-2 rounded-md transition-colors ${theme === 'dark' ? 'bg-white dark:bg-zinc-900 shadow-sm' : ''}`}><MoonIcon className="w-5 h-5"/></button>
              <button onClick={() => setTheme('system')} className={`px-3 py-2 rounded-md text-sm transition-colors ${theme === 'system' ? 'bg-white dark:bg-zinc-900 shadow-sm' : ''}`}>System</button>
            </div>
          </div>
        </Card>
      </main>
    </Page>
  );
};


// --- MAIN APP COMPONENT ---

const App: React.FC = () => {
  const { route, navigate } = useRouter();
  const [history, setHistory] = useState<Route[]>([]);
  const [deleteConfirmation, setDeleteConfirmation] = useState<any>(null);
  const { showToast } = useToast();
  
  const handleNavigate = (page: Page, params?: any) => {
    setHistory(prev => [...prev, route]);
    navigate(page, params);
  }

  const handleBack = () => {
    const lastRoute = history.pop();
    if (lastRoute) {
        setHistory([...history]);
        navigate(lastRoute.page, lastRoute.params);
    } else {
        navigate('dashboard');
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteConfirmation) return;

    const { type, partyId, entryId, party } = deleteConfirmation;

    if (type === 'party') {
        await db.transaction('rw', db.parties, db.entries, async () => {
            await db.entries.where({ partyId }).delete();
            await db.parties.delete(partyId);
        });
        showToast(`Deleted ${party.name}`);
        handleBack();
    } else if (type === 'entry') {
        await db.entries.delete(entryId);
        await recalculateBalancesForParty(partyId);
        showToast('Entry deleted');
    }

    setDeleteConfirmation(null);
  };

  const renderPage = () => {
    switch (route.page) {
      case 'dashboard': return <DashboardPage onNavigate={handleNavigate} />;
      case 'parties': return <PartiesPage onNavigate={handleNavigate} />;
      case 'party-detail': return <PartyDetailPage partyId={route.params.partyId} onNavigate={handleNavigate} onBack={handleBack} setDeleteConfirmation={setDeleteConfirmation}/>;
      case 'add-party': return <AddEditPartyPage onBack={handleBack} />;
      case 'edit-party': return <AddEditPartyPage onBack={handleBack} partyId={route.params.partyId} />;
      case 'add-entry': return <AddEditEntryPage partyId={route.params.partyId} initialDirection={route.params.direction} onBack={handleBack} />;
      case 'edit-entry': return <AddEditEntryPage partyId={route.params.partyId} entryId={route.params.entryId} onBack={handleBack} />;
      case 'settings': return <SettingsPage />;
      default: return <DashboardPage onNavigate={handleNavigate} />;
    }
  };

  const showBottomNav = ['dashboard', 'parties', 'settings'].includes(route.page);

  return (
    <>
      <div className="h-full flex flex-col bg-gray-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50">
        <div className={`flex-grow ${showBottomNav ? 'pb-16' : ''}`}>
          {renderPage()}
        </div>
        {showBottomNav && <BottomNav activePage={route.page} onNavigate={navigate} />}
      </div>
      <ConfirmationModal
        isOpen={!!deleteConfirmation}
        onClose={() => setDeleteConfirmation(null)}
        onConfirm={handleConfirmDelete}
        title={`Delete ${deleteConfirmation?.type === 'party' ? 'Party' : 'Entry'}`}
      >
        <p>
            {deleteConfirmation?.type === 'party' 
                ? `Are you sure you want to delete ${deleteConfirmation?.party?.name}? All associated transactions will also be deleted.`
                : 'Are you sure you want to permanently delete this transaction?'}
        </p>
        <p className="mt-2 font-medium">This action cannot be undone.</p>
      </ConfirmationModal>
    </>
  );
};

const Root = () => (
  <ThemeProvider>
    <ToastProvider>
      <App />
    </ToastProvider>
  </ThemeProvider>
);

export default Root;