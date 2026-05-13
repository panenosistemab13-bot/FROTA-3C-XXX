import { useState, useEffect, FormEvent, ChangeEvent, useMemo, Fragment, useRef } from 'react';
import { Truck, Plus, X, Calendar, Users, ChevronDown, ChevronUp, ChevronRight, CheckCircle, XCircle, AlertTriangle, Wrench, Home, MoveRight, Send, ChevronsLeft, ChevronsRight, Pencil, BookOpen, History, Ship, Archive, LayoutDashboard, PieChart as PieChartIcon, Search, Shield, Trash2, LogOut, MessageSquare, Lightbulb, Activity, FileText, Volume2, VolumeX, Speaker } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { storageService } from './services/storageService';
import { collection, onSnapshot, query, addDoc, serverTimestamp, orderBy, limit, where, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from './lib/firebase';

// --- DATA & TYPES ---
const STORAGE_KEYS = {
  GROUPS: 'frota_scale_groups',
  ESCALA: 'frota_escala_items',
  CHECKLISTS: 'frota_checklists',
  NOTIFICATIONS: 'frota_notifications',
};

interface AppNotification {
  id: string;
  type: 'success' | 'info' | 'warning' | 'danger' | 'neutral';
  message: string;
  timestamp: string;
  read: boolean;
  isPriority?: boolean;
}

const playNotificationSound = (message: string, soundEnabled: boolean) => {
  if (!soundEnabled) return;
  
  let soundUrl = '';
  const msgUpper = message.toUpperCase();
  
  if (msgUpper.includes('CHECKLIST REALIZADO')) {
    // Longer and more noticeable sound (success/double notification)
    soundUrl = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';
  } else if (msgUpper.includes('ESCALA CRIADA') || msgUpper.includes('ESCALA EXCLUÍDA')) {
    // Short and discrete pop
    soundUrl = 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3';
  } else {
    // Default notification sound for other messages
    soundUrl = 'https://assets.mixkit.co/active_storage/sfx/2357/2357-preview.mp3';
  }
  
  if (soundUrl) {
    const audio = new Audio(soundUrl);
    audio.volume = 0.5;
    audio.play()
      .then(() => console.log(`[AUDIO] Playback successful: ${message}`))
      .catch(e => {
        console.error('[AUDIO] Playback failed or blocked:', e);
      });
  }
};

const addNotification = async (type: AppNotification['type'], message: string, isPriority: boolean = false) => {
  try {
    await storageService.addNotification(message, type, isPriority);
    // Sound is now handled by the realtime listener in Dashboard to allow all users to hear it
  } catch (error) {
    console.error('Failed to save notification:', error);
  }
};

function getStorage<T>(key: string, defaultVal: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultVal;
  } catch (e) {
    return defaultVal;
  }
}

const setStorage = (key: string, value: any) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- MIGRATION LOGIC REMOVED ---

const dailyTips = [
  "O café perfeito começa com a moagem correta para o método escolhido.",
  "Sempre utilize água filtrada ou mineral para não alterar o sabor do seu café.",
  "A temperatura ideal da água para o preparo é entre 92°C e 96°C.",
  "Escalde o filtro de papel antes de colocar o pó para remover o gosto de celulose.",
  "Armazene seu café em local fresco, seco e protegido da luz.",
  "O frescor é fundamental: prefira comprar café em grãos e moer na hora.",
  "A proporção padrão ouro é de 10g de café para cada 180ml de água.",
  "Experimente diferentes origens para descobrir as notas sensoriais que mais te agradam.",
  "Limpe seus equipamentos regularmente para evitar resíduos de óleos oxidados.",
  "O ritual do café é um momento de pausa e conexão, aproveite cada gole."
];

const DESTINOS = [
  'ARAÇARIGUAMA-SP', 'ARIQUEMES-RO', 'BEBEDOURO-SP', 'BRASÍLIA-DF', 'CAMPO GRANDE-MS',
  'CUIABÁ-MT', 'EUSÉBIO-CE', 'EXPORTAÇÃO', 'GOVERNADOR CELSO RAMOS-SC', 'GUARULHOS-SP',
  'LONDRINA-PR', 'MANAUS-AM', 'MONTES CLAROS-MG', 'MOSSORÓ-RN', 'NATAL-RN',
  'PINHAIS-PR', 'PORTO VELHO-RO', 'RECIFE-PE', 'RIO DE JANEIRO-RJ', 'SALVADOR-BA',
  'SANTA LUZIA-MG', 'SUMARÉ-SP', 'VESPASIANO-MG', 'VIANA-ES', 'FUJIOKA-DF'
];

interface EscalaItem {
  id: number;
  scale_group_id: number;
  cavalo: string;
  bau1: string;
  bau2?: string;
  destino?: string;
  tipo_veiculo: 'Rodo Trem' | 'Bau';
  checklist_status: 'Checklist OK' | 'Checklist Vencido' | 'Negativado' | 'Liberado para 1 viagem';
  liberacao_status?: string;
  agendamento_status?: string;
  yard_status?: string; // Deprecated
  bau1_yard_status?: string;
  bau2_yard_status?: string;
  veiculo_atrelado?: string;
  bau1_doca_action?: string;
  bau1_doca_number?: string;
  bau1_final_status?: string;
  bau2_doca_action?: string;
  bau2_doca_number?: string;
  bau2_final_status?: string;
  no_patio?: string;
  checklist_realizado?: 'Sim' | 'Não';
  data_escala?: string;
  saved?: number | boolean;
  created_at: string;
  nota_fiscal?: string;
  danfe_ok?: 'Sim' | 'Não';
  entregue_recebedoria?: 'Sim' | 'Não';
  recebimento_status?: 'Aguardando' | 'Recebido' | 'Pendente';
}

interface FrotaItem extends EscalaItem {
  frota_id: number;
  frota_status: 'Finalizado' | 'Com Produto' | 'Vazio';
  docas: { id: number; numero_doca: number; status: 'Mais Pesado' | 'Mais Leve' | 'Descarregar' | 'Aguarda'; bau?: string }[];
}

const companyPrinciples = [
  { num: 1, title: 'Encante o Consumidor', text: 'Coloque-se no lugar do consumidor para compreender e atender às suas necessidades. Priorize-o em todas as decisões. Trabalhe continuamente para superar suas expectativas, gerando experiências e memórias prazerosas com nossos produtos e serviços.' },
  { num: 2, title: 'Construa Laços Legítimos e Duradouros', text: 'Cultive relacionamentos com simplicidade e sinceridade. Tenha interesse genuíno pelas pessoas, dedique tempo a elas e promova conexões. Fortaleça os times e esteja presente nos momentos bons e nos difíceis. Construa um ambiente de trabalho acolhedor, seguro, diverso e inclusivo.' },
  { num: 3, title: 'Planeje e Faça Acontecer', text: 'Planeje antes de agir. Trabalhe com colaboração, entusiasmo e dedicação. Seja proativo e mão na massa. Assuma riscos calculados e busque a causa raiz na solução dos problemas. Evite desperdício de recursos e tempo. Vá até o fim, garantindo o resultado, respeitando os processos e com sinergia entre as áreas.' },
  { num: 4, title: 'Empreenda e Inove', text: 'Seja inquieto, curioso e criativo. Transforme necessidades em oportunidades. Teste e aprenda rápido, gerando e adaptando ideias. Empreenda a fim de gerar valor para o negócio. Seja um agente de transformação!' },
  { num: 5, title: 'Tenha Atitude de Dono', text: 'Comprometa-se com o que é melhor para o negócio. Tome decisões pensando no todo e com visão de longo prazo. Faça o que precisa ser feito, com zelo e da forma correta. Seja exemplo e construa uma empresa da qual você se orgulhe: esta é a sua obra!' },
  { num: 6, title: 'Comunique-se com Clareza e Respeito', text: 'Pratique a escuta ativa, com interesse sincero pela opinião do outro. Posicione-se de forma equilibrada e embasada em fatos e dados. Compartilhe informações com responsabilidade, transparência e objetividade. Não fuja das conversas difíceis, tratando as pessoas com cuidado e respeito.' },
  { num: 7, title: 'Tenha Humildade para Aprender e Ensinar', text: 'Aprenda, desapreenda e reaprenda. Busque conhecimentos, cultive novos hábitos e absorva o melhor da experiência dos outros. Compartilhe aprendizados, treine e incentive o crescimento de todos. Seja protagonista do seu desenvolvimento e nunca pare de evoluir!' },
  { num: 8, title: 'Seja Resiliente', text: 'Tenha flexibilidade e reinvente-se frente às mudanças. Mantenha o equilíbrio e a serenidade para se adaptar às situações inesperadas, garantindo a operação mesmo diante das dificuldades. Persista com coragem e disciplina na nossa jornada.' },
  { num: 9, title: 'Construa uma Empresa Sustentável', text: 'Pratique o ESG! Trabalhe com foco nas melhores práticas para minimizar os efeitos da nossa operação no meio ambiente, causar impacto social positivo e aprimorar a nossa governança. Atue como cidadão: o futuro se constrói agora.' },
];

// --- MOCK DATA & TYPES ---

type ExpedicaoStatus = 'Finalizado' | 'Pendente' | 'Na Doca' | 'Na Balança' | 'Precisa Descarregar';
type Turno = 'A' | 'AB' | 'B' | 'BC' | 'C';

interface BauExpedicao {
  placa: string;
  status: ExpedicaoStatus;
  turno: Turno;
}

// --- AUTHENTICATION ---
const USERS: Record<string, { password: string; role: string; name: string }> = {
  '3cmot': { password: 'frota3c28', role: 'veiculos', name: 'Motorista 3C' },
  'gr3c': { password: 'grsantaluzia3c7', role: 'admin', name: 'GR Santa Luzia' },
  '3clog': { password: 'grlogistica', role: 'docas', name: 'Logística 3C' },
  'jeff': { password: '#trescafe27', role: 'admin', name: 'Jeff' },
};

// --- MAIN APP COMPONENT ---
export default function App() {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [page, setPage] = useState<'dashboard' | 'escala' | 'principios' | 'checklist' | 'veiculos' | 'docas' | 'chat' | 'sobre' | 'recebimento'>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    // One-time cleanup for test data
    const hasCleared = localStorage.getItem('frota_cleared_v2');
    if (!hasCleared) {
      localStorage.removeItem(STORAGE_KEYS.GROUPS);
      localStorage.removeItem(STORAGE_KEYS.ESCALA);
      localStorage.removeItem(STORAGE_KEYS.CHECKLISTS);
      localStorage.removeItem(STORAGE_KEYS.NOTIFICATIONS);
      localStorage.setItem('frota_cleared_v2', 'true');
      window.location.reload();
    }

    // Clear notifications every 15 minutes
    const notificationCleanupInterval = setInterval(async () => {
      try {
        await storageService.clearNotifications();
        window.dispatchEvent(new Event('storage'));
      } catch (error) {
        console.error('Failed to clear notifications:', error);
      }
    }, 15 * 60 * 1000);

    return () => clearInterval(notificationCleanupInterval);
  }, []);

  // Audio Unlocking Logic (Bypasses browser autoplay restrictions)
  useEffect(() => {
    const unlockAudio = () => {
      const audio = new Audio();
      // One pixel transparent silent wav
      audio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise.then(() => {
          console.log('[AUDIO] System unlocked successfully by user interaction');
          
          // Resume AudioContext if it exists to be double sure
          const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioCtx) {
            const tempCtx = new AudioCtx();
            if (tempCtx.state === 'suspended') tempCtx.resume();
          }

          window.removeEventListener('mousedown', unlockAudio);
          window.removeEventListener('touchstart', unlockAudio);
          window.removeEventListener('keydown', unlockAudio);
        }).catch(e => {
          console.error('[AUDIO] Unlock failed:', e);
        });
      }
    };

    window.addEventListener('mousedown', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
    
    return () => {
      window.removeEventListener('mousedown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return <DashboardPage onNavigate={setPage} onLogout={() => setCurrentUser(null)} currentUser={currentUser!} />;
      case 'escala':
        return <EscalaPage setPage={setPage} currentUser={currentUser!} />;
      case 'veiculos':
        return <VeiculosPage setPage={setPage} currentUser={currentUser!} />;
      case 'docas':
        return <DocasPage setPage={setPage} currentUser={currentUser!} />;
      case 'principios':
        return <PrincipiosPage setPage={setPage} />;
      case 'checklist':
        return <ChecklistPage setPage={setPage} currentUser={currentUser!} />;
      case 'recebimento':
        return <RecebimentoPage setPage={setPage} currentUser={currentUser!} />;
      case 'chat':
        return <ChatPage setPage={setPage} currentUser={currentUser!} />;
      case 'sobre':
        return <SobrePage setPage={setPage} />;
      default:
        return <DashboardPage onNavigate={setPage} onLogout={() => setCurrentUser(null)} currentUser={currentUser!} />;
    }
  };

  if (!currentUser) {
    return <LoginPage onLoginSuccess={(user) => setCurrentUser(user)} />;
  }

  return (
    <div className="min-h-screen bg-[#0A0E14] text-slate-300 flex font-sans">
      <Sidebar 
        currentPage={page} 
        setPage={setPage} 
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        currentUser={currentUser}
        onLogout={() => setCurrentUser(null)}
      />
      <main className="flex-1 flex flex-col relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0, filter: 'blur(4px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, filter: 'blur(4px)' }}
            transition={{ duration: 0.4 }}
            className="flex-1 flex flex-col"
          >
            {renderPage()}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

// --- PAGE & UI COMPONENTS ---

function LoginPage({ onLoginSuccess }: { onLoginSuccess: (user: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    let authenticated = false;

    try {
      const q = query(collection(db, 'users'), where('username', '==', username));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0].data();
        if (userDoc.password === password) {
          authenticated = true;
        }
      }
    } catch (err) {
      console.error("Firestore query failed, falling back to hardcoded users:", err);
    }
    
    // Fallback for hardcoded users if not in db or query failed
    if (!authenticated) {
      const user = USERS[username];
      if (user && user.password === password) {
        authenticated = true;
      }
    }

    if (authenticated) {
      onLoginSuccess(username);
    } else {
      setError('Usuário ou senha incorretos.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-cyan-500/5 blur-[120px] rounded-full" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm relative z-10"
      >
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-2xl shadow-2xl shadow-black/50">
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 bg-cyan-500 rounded-xl flex items-center justify-center mb-3 shadow-xl shadow-cyan-500/20">
              <Truck size={24} className="text-white" />
            </div>
            <h1 className="text-xl font-black text-white tracking-tighter mb-0.5">FROTA 3C</h1>
            <p className="text-cyan-500 font-black text-[8px] uppercase tracking-[0.4em]">Painel de Controle</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-3">
            <div className="space-y-1">
              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-3">Usuário</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full h-10 bg-slate-900 border border-white/10 rounded-xl px-4 text-xs font-bold text-white outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
                placeholder="Digite seu usuário"
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest ml-3">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 bg-slate-900 border border-white/10 rounded-xl px-4 text-xs font-bold text-white outline-none focus:ring-2 focus:ring-cyan-500 transition-all"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <motion.p 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-cyan-500 text-[8px] font-black uppercase tracking-widest text-center bg-cyan-500/10 py-1.5 rounded-lg border border-cyan-500/20"
              >
                {error}
              </motion.p>
            )}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              className="w-full h-10 bg-cyan-500 text-white rounded-xl font-black uppercase tracking-widest shadow-xl shadow-cyan-500/20 hover:bg-cyan-500/80 transition-all mt-1 text-[10px]"
            >
              Entrar no Sistema
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

function VeiculosPage({ setPage, currentUser }: { setPage: (page: any) => void; currentUser: string }) {
  const canEdit = ['3cmot', 'jeff'].includes(currentUser);
  const [escalaItems, setEscalaItems] = useState<EscalaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchEscala = async () => {
    setLoading(true);
    try {
      const [_allItems, _groups] = await Promise.all([
        storageService.getEscalaItems(),
        storageService.getScaleGroups()
      ]);
      const allItems = _allItems as EscalaItem[];
      const groups = _groups as ScaleGroup[];
      const openGroupIds = groups.filter(g => g.status === 'Open').map(g => g.id);
      const filtered = allItems.filter(item => openGroupIds.includes(item.scale_group_id));
      setEscalaItems(filtered.sort((a, b) => b.id - a.id));
    } catch (error) {
      console.error('Failed to fetch escala:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEscala(); }, []);

  const handleUpdateYardStatus = async (id: number, field: string, status: string) => {
    try {
      setLoading(true);
      const allItems = await storageService.getEscalaItems();
      const item = allItems.find(i => i.id === id);
      if (item) {
        const updatedItem = { ...item, [field]: status };
        await storageService.saveEscalaItem(updatedItem);
        fetchEscala();
      }
    } catch (error) {
      console.error('Failed to update yard status:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = escalaItems.filter(item => 
    item.cavalo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.bau1.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.bau2 && item.bau2.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="p-4 md:p-8 space-y-6 flex-1 overflow-y-auto bg-coffee-dark">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/5 pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2 text-coffee-red font-black text-[8px] uppercase tracking-[0.4em] mb-1">
            <Truck size={10} />
            <span>Controle de Pátio</span>
          </div>
          <h1 translate="no" className="text-2xl font-black text-white tracking-tighter uppercase">Veículos</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              type="text" 
              placeholder="Pesquisar placa..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 pl-9 pr-4 bg-white/5 border border-white/10 rounded-xl text-white text-xs font-medium focus:outline-none focus:border-coffee-red/50 transition-colors w-full md:w-64"
            />
          </div>
          <button 
            onClick={() => setPage('dashboard')}
            className="h-9 px-4 bg-white/5 text-slate-400 hover:text-white rounded-xl flex items-center gap-2 font-black text-[9px] uppercase tracking-widest transition-all"
          >
            <Home size={14} /> <span className="hidden sm:inline">Início</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {loading ? (
          <div className="h-48 flex flex-col items-center justify-center gap-4 bg-white/5 rounded-[2rem] border border-white/10">
            <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-cyan-500 font-black text-[9px] uppercase tracking-widest animate-pulse">Sincronizando Veículos...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center gap-4 bg-white/5 rounded-[2rem] border border-white/10 border-dashed">
            <Truck size={40} className="text-white/10" />
            <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Nenhum veículo registrado.</p>
          </div>
        ) : (
          filteredItems.map(item => (
            <motion.div 
              key={item.id} 
              initial={{opacity:0, y: 10}} 
              animate={{opacity:1, y: 0}} 
              className="bg-white/5 border border-white/10 hover:border-coffee-red/30 rounded-2xl p-4 flex flex-col gap-4 transition-all duration-500"
            >
              <div 
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
              >
                <div className="flex items-center gap-6">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Cavalo</span>
                    <span className="font-mono text-lg font-black text-white tracking-tighter">{item.cavalo}</span>
                    <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mt-1">{new Date(item.data_escala || '').toLocaleDateString('pt-BR')}</span>
                  </div>
                  <div className="h-8 w-[1px] bg-white/10" />
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">COMPOSIÇÃO PARA BAÚ</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-300">{item.bau1}</span>
                      {item.bau2 && (
                        <>
                          <MoveRight size={10} className="text-coffee-red" />
                          <span className="font-mono text-xs font-bold text-slate-300">{item.bau2}</span>
                        </>
                      )}
                      
                      {/* Destino e Escala */}
                      <div className="h-3 w-[1px] bg-white/10 mx-1" />
                      <span className="font-mono text-[9px] font-bold text-slate-400 uppercase tracking-tight">{item.destino || 'S/D'}</span>
                      <div className="h-3 w-[1px] bg-white/10 mx-1" />
                      <span className="font-mono text-[9px] font-bold text-slate-400 uppercase tracking-tight">ESCALA {item.data_escala ? new Date(item.data_escala).toLocaleDateString('pt-BR') : 'N/A'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${item.checklist_status === 'Checklist OK' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>
                    {item.checklist_status}
                  </div>
                  {expandedId === item.id ? <ChevronDown size={14} className="text-slate-500 rotate-180 transition-transform" /> : <ChevronDown size={14} className="text-slate-500 transition-transform" />}
                </div>
              </div>

              <AnimatePresence>
                {expandedId === item.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden space-y-6 pt-6 border-t border-white/5"
                  >
                    <div className="bg-coffee-dark/50 p-6 rounded-3xl border border-white/5 space-y-6">
                      {/* Pergunta 1: O veículo está no pátio? */}
                      <SelectField 
                        label="O veículo está no pátio?"
                        value={item.no_patio || ''}
                        onChange={(e) => handleUpdateYardStatus(item.id, 'no_patio', e.target.value)}
                        options={['Sim', 'Não']}
                        placeholder="Selecione..."
                        disabled={!canEdit}
                      />

                      {item.no_patio === 'Sim' && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-6 pt-4 border-t border-white/5"
                        >
                          {/* Pergunta 2: Status (Carregado com Paletes, Carregado com Produtos, Vazio) */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <SelectField 
                              label={`Status - MAIS PESADO (${item.bau1})`}
                              value={item.bau1_yard_status || ''}
                              onChange={(e) => handleUpdateYardStatus(item.id, 'bau1_yard_status', e.target.value)}
                              options={['Vazio', 'Carregado com Produto', 'Carregado com Paletes']}
                              placeholder="Selecione..."
                              disabled={!canEdit}
                            />
                            {item.bau2 && (
                              <SelectField 
                                label={`Status - MAIS LEVE (${item.bau2})`}
                                value={item.bau2_yard_status || ''}
                                onChange={(e) => handleUpdateYardStatus(item.id, 'bau2_yard_status', e.target.value)}
                                options={['Vazio', 'Carregado com Produto', 'Carregado com Paletes']}
                                placeholder="Selecione..."
                                disabled={!canEdit}
                              />
                            )}
                          </div>

                          {/* Pergunta 3: Se o checklist estiver vencido, perguntar se está atrelado */}
                          {(item.checklist_status === 'Checklist Vencido' || item.checklist_status === 'Negativado' || item.checklist_status === 'Liberado para 1 viagem') && (
                            <motion.div
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="pt-4 border-t border-white/5"
                            >
                              <SelectField 
                                label="Veículo Atrelado?"
                                value={item.veiculo_atrelado || ''}
                                onChange={(e) => handleUpdateYardStatus(item.id, 'veiculo_atrelado', e.target.value)}
                                options={['Sim', 'Não']}
                                placeholder="Selecione..."
                                disabled={!canEdit}
                              />
                            </motion.div>
                          )}
                        </motion.div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

function DashboardPage({ onNavigate, onLogout, currentUser }: { onNavigate: (page: any) => void; onLogout: () => void; currentUser: string }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const isAdmin = currentUser === 'jeff' || (currentUser && USERS[currentUser]?.role === 'admin');
  
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('frota_sound_enabled') !== 'false';
  });
  const [newNotifIds, setNewNotifIds] = useState<Set<string>>(new Set());
  const isInitialLoad = useRef(true);

  useEffect(() => {
    localStorage.setItem('frota_sound_enabled', soundEnabled.toString());
  }, [soundEnabled]);

  useEffect(() => {
    const q = query(
      collection(db, 'notifications'),
      orderBy('timestamp', 'desc'),
      limit(10)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedDocs = snapshot.docs.map(doc => {
          const data = doc.data() as any;
          return {
            id: doc.id,
            ...data,
            timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : data.timestamp
          } as AppNotification;
      });

      if (!isInitialLoad.current) {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const data = change.doc.data() as any;
                const id = change.doc.id;
                
                playNotificationSound(data.message, soundEnabled);
                
                // Track for blinking icon
                setNewNotifIds(prev => {
                    const next = new Set(prev);
                    next.add(id);
                    return next;
                });
                
                setTimeout(() => {
                    setNewNotifIds(prev => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                    });
                }, 5000);
            }
        });
      }

      setNotifications(fetchedDocs);
      isInitialLoad.current = false;
    });
    return () => unsubscribe();
  }, [soundEnabled]);

  const handleClearNotifications = async () => {
    if (confirm('ATENÇÃO: Deseja apagar TODAS as notificações operacionais?')) {
      try {
        setNotifications([]); // Immediate UI clear
        await storageService.clearNotifications();
        alert('Notificações limpas com sucesso!');
      } catch (error) {
        console.error('Failed to clear notifications:', error);
      }
    }
  };

  const sections = [
    { id: 'checklist', label: 'Checklist', icon: CheckCircle, description: 'Segurança em primeiro lugar!', color: 'text-emerald-400' },
    { id: 'escala', label: 'Escala', icon: Calendar, description: 'Organize o fluxo de entrada!', color: 'text-coffee-red' },
    { id: 'veiculos', label: 'Veículos', icon: Truck, description: 'Status do pátio em tempo real.', color: 'text-sky-400' },
    { id: 'docas', label: 'Docas', icon: Shield, description: 'Monitoramento de carregamento.', color: 'text-rose-400' },
    { id: 'recebimento', label: 'Recebimento', icon: FileText, description: 'Gestão de Notas Fiscais.', color: 'text-amber-500' },
    { id: 'chat', label: 'Chat', icon: MessageSquare, description: 'Comunicação interna da equipe.', color: 'text-violet-400' },
    { id: 'principios', label: 'Princípios', icon: BookOpen, description: 'Nossa essência e o que nos move.', color: 'text-coffee-cream' },
    { id: 'sobre', label: 'Sobre o App', icon: Lightbulb, description: 'Filosofia e propósito.', color: 'text-amber-400' },
    { id: 'logout', label: 'Sair', icon: LogOut, description: 'Encerrar sessão e voltar ao login.', color: 'text-slate-400' },
  ];

  const currentPrinciple = Math.floor(Date.now() / 3600000) % companyPrinciples.length;

  return (
    <div className="p-4 md:p-8 flex-1 flex flex-col items-center justify-start overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="flex gap-1">
            <Plus size={16} className="text-coffee-red fill-coffee-red" />
            <Plus size={16} className="text-coffee-red fill-coffee-red" />
            <Plus size={16} className="text-coffee-red fill-coffee-red" />
          </div>
        </div>
        <h1 translate="no" className="text-2xl font-black text-white tracking-tighter uppercase mb-1">
          Bem-vindo à <span className="text-coffee-red">FROTA 3C</span>
        </h1>
        <p className="text-coffee-red font-medium tracking-widest uppercase text-[8px]">Conectando corações através do café</p>
      </motion.div>

      {/* Notifications Panel */}
      <div className="w-full max-w-4xl mb-8">
        <div className="flex items-center justify-between mb-4 px-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-coffee-red animate-pulse" />
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">Notificações Operacionais</h3>
          </div>
          
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button 
                onClick={handleClearNotifications}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all"
                title="Limpar Tudo"
              >
                <Trash2 size={14} />
                <span className="text-[9px] font-black uppercase tracking-widest">Limpar Tudo</span>
              </button>
            )}

            <button 
              onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
              soundEnabled 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/20' 
                : 'bg-slate-800 border-slate-700 text-slate-500 hover:bg-slate-700'
            }`}
            title={soundEnabled ? "Silenciar Alertas" : "Ativar Alertas"}
          >
            {soundEnabled ? (
              <>
                <Volume2 size={14} />
                <span className="text-[9px] font-black uppercase tracking-widest">Sons Ativos</span>
              </>
            ) : (
              <>
                <VolumeX size={14} />
                <span className="text-[9px] font-black uppercase tracking-widest">Mudo</span>
              </>
            )}
          </button>
        </div>
      </div>
        
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {notifications.length === 0 ? (
            <div className="col-span-full bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
              <p className="text-slate-500 text-[10px] uppercase tracking-widest">Nenhuma notificação recente</p>
            </div>
          ) : (
            notifications.map((notif, idx) => (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={`bg-white/5 border-l-2 rounded-r-xl p-4 flex items-start gap-3 relative overflow-hidden group transition-all duration-500 ${
                  notif.isPriority && newNotifIds.has(notif.id) 
                    ? 'border-emerald-500 bg-emerald-500/20 ring-2 ring-emerald-500/50 animate-pulse' 
                    : notif.type === 'success' ? 'border-emerald-500 bg-emerald-500/5' :
                  notif.type === 'danger' ? 'border-rose-500 bg-rose-500/5' :
                  notif.type === 'warning' ? 'border-amber-500 bg-amber-500/5' :
                  notif.type === 'info' ? 'border-cyan-500 bg-cyan-500/5' :
                  'border-slate-500 bg-slate-500/5'
                }`}
              >
                {newNotifIds.has(notif.id) && (
                   <div className="absolute top-2 right-2">
                     <motion.div
                       animate={notif.isPriority ? {
                         scale: [1, 1.4, 1],
                         rotate: [0, 15, -15, 0],
                         filter: ["brightness(1)", "brightness(1.5)", "brightness(1)"]
                       } : { 
                         scale: [1, 1.2, 1],
                         opacity: [0.5, 1, 0.5]
                       }}
                       transition={{ 
                         repeat: Infinity,
                         duration: notif.isPriority ? 0.5 : 1
                       }}
                       className={notif.isPriority ? "text-white" : "text-emerald-500"}
                     >
                       {notif.isPriority ? <CheckCircle size={14} className="drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" /> : <Speaker size={12} />}
                     </motion.div>
                   </div>
                )}
                
                <div className={`mt-0.5 ${
                  notif.type === 'success' ? 'text-emerald-500' :
                  notif.type === 'danger' ? 'text-rose-500' :
                  notif.type === 'warning' ? 'text-amber-500' :
                  notif.type === 'info' ? 'text-cyan-500' :
                  'text-slate-500'
                }`}>
                  {notif.type === 'success' && <CheckCircle size={14} />}
                  {notif.type === 'danger' && <AlertTriangle size={14} />}
                  {notif.type === 'warning' && <AlertTriangle size={14} />}
                  {notif.type === 'info' && <Truck size={14} />}
                  {notif.type === 'neutral' && <Shield size={14} />}
                </div>
                <div className="flex-1">
                  <p className="text-white text-[10px] font-bold uppercase tracking-wide leading-tight">{notif.message}</p>
                  <p className="text-slate-500 text-[8px] mt-1 font-mono">{new Date(notif.timestamp).toLocaleTimeString('pt-BR')}</p>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Principle Highlight */}
      <motion.div 
        key={currentPrinciple}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="w-full max-w-4xl bg-coffee-red/10 border border-coffee-red/20 rounded-2xl p-5 mb-8 flex items-center gap-5 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-2 opacity-5">
          <BookOpen size={80} />
        </div>
        <div className="bg-coffee-red text-white w-10 h-10 rounded-full flex items-center justify-center font-black text-lg flex-shrink-0">
          {companyPrinciples[currentPrinciple].num}
        </div>
        <div>
          <h3 className="text-coffee-red font-black uppercase tracking-wider text-[10px] mb-0.5">Princípio de Liderança</h3>
          <h2 className="text-lg font-bold text-white mb-1">{companyPrinciples[currentPrinciple].title}</h2>
          <p className="text-slate-400 text-xs italic">"{companyPrinciples[currentPrinciple].text.substring(0, 120)}..."</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full max-w-4xl mb-6">
        {sections.map((section, index) => (
          <motion.div
            key={section.id}
            onClick={() => {
              if (section.id === 'logout') onLogout();
              else onNavigate(section.id as any);
            }}
            className="bg-white/5 p-4 rounded-2xl border border-white/10 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-cyan-500/20 hover:border-cyan-500 transition-all duration-500 group relative overflow-hidden"
            whileHover={{ scale: 1.03, y: -2 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.05 }}
          >
            <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <section.icon className={`w-8 h-8 ${section.color} mb-2 group-hover:scale-110 transition-transform duration-500`} />
            <h2 className="text-xs font-black text-white uppercase tracking-tighter">{section.label}</h2>
            <p className="text-slate-500 mt-1 text-[9px] font-medium leading-tight hidden sm:block">{section.description}</p>
            
            <div className="mt-2 flex items-center gap-1 text-cyan-500 font-bold text-[8px] uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0">
              Acessar <MoveRight size={10} />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="flex items-center gap-6 py-6 border-t border-white/5 w-full max-w-6xl justify-center mb-8">
        <div className="flex flex-col items-center">
          <span className="text-coffee-red font-black text-xl">3</span>
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Corações</span>
        </div>
        <div className="h-6 w-[1px] bg-white/10" />
        <p className="text-slate-500 text-[10px] max-w-md text-center">
          Trabalhamos com paixão para levar o melhor café até você. FROTA 3C: Eficiência que aquece a alma.
        </p>
      </div>

      {/* Jefferson Augusto Section */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="w-full max-w-6xl mt-auto pt-4 border-t border-white/5 flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-coffee-red to-coffee-dark rounded-full flex items-center justify-center border border-white/10">
            <span className="text-white font-black text-[10px]">JA</span>
          </div>
          <div>
            <p className="text-white font-black text-[10px] uppercase tracking-tighter">Jefferson Augusto</p>
            <p className="text-coffee-red font-bold text-[7px] uppercase tracking-widest">Fundador</p>
          </div>
        </div>
        <p className="text-slate-500 text-[9px] italic max-w-xs text-right">
          "A inovação transforma o dia a dia das pessoas."
        </p>
      </motion.div>
    </div>
  );
}

// ... (keep existing code)

function SobrePage({ setPage }: { setPage: (page: any) => void }) {
  return (
    <div className="p-4 md:p-8 space-y-8 flex-1 overflow-y-auto bg-coffee-dark">
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-coffee-red font-black text-[8px] uppercase tracking-[0.4em] mb-1">
            <Lightbulb size={10} />
            <span>Filosofia & Propósito</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tighter">SOBRE O APP</h1>
        </div>
        <button 
          onClick={() => setPage('dashboard')}
          className="h-9 px-4 bg-white/5 text-slate-400 hover:text-white rounded-xl flex items-center gap-2 font-black text-[9px] uppercase tracking-widest transition-all"
        >
          <Home size={14} /> <span className="hidden sm:inline">Início</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-6"
        >
          <div className="bg-gradient-to-br from-coffee-red/20 to-transparent border border-coffee-red/20 rounded-[2.5rem] p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Truck size={120} />
            </div>
            <h2 className="text-3xl font-black text-white tracking-tighter mb-4">CAFEÍNA IDEIA</h2>
            <p className="text-slate-300 leading-relaxed text-sm font-medium mb-6">
              O app foi criado baseado no conceito "Cafeína Ideia": despertar a logística para um novo jeito de pensar e de mover. 
              Assim como o café impulsiona o dia, nossa tecnologia impulsiona a operação, trazendo energia, clareza e eficiência para cada processo.
            </p>
            <div className="flex items-center gap-4 pt-4 border-t border-white/10">
              <div className="w-12 h-12 bg-coffee-red rounded-full flex items-center justify-center font-black text-white text-xl">JA</div>
              <div>
                <p className="text-white font-black text-xs uppercase tracking-widest">Jefferson Augusto</p>
                <p className="text-coffee-red text-[10px] font-bold uppercase tracking-widest">Fundador & Idealizador</p>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 gap-4 content-start"
        >
          <div className="bg-white/5 border border-white/10 rounded-3xl p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-2">
              <Shield size={32} className="text-emerald-500" />
            </div>
            <h3 className="text-white font-black uppercase tracking-tight text-xl">Segurança & Agilidade</h3>
            <p className="text-slate-400 text-xs leading-relaxed max-w-xs mx-auto">
              Nossa filosofia une a precisão dos dados com a velocidade da operação. Cada funcionalidade foi desenhada para eliminar gargalos e proteger o fluxo logístico.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-cyan-500/10 rounded-2xl flex items-center justify-center mx-auto mb-2">
              <Users size={32} className="text-cyan-500" />
            </div>
            <h3 className="text-white font-black uppercase tracking-tight text-xl">Foco nas Pessoas</h3>
            <p className="text-slate-400 text-xs leading-relaxed max-w-xs mx-auto">
              Tecnologia feita por pessoas, para pessoas. Acreditamos que a ferramenta deve servir ao operador, simplificando decisões e valorizando o tempo de cada um.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function PrincipiosPage({ setPage }: { setPage: (page: any) => void }) {
  return (
    <div className="p-4 md:p-8 space-y-6 flex-1 overflow-y-auto bg-coffee-dark">
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-coffee-red font-black text-[8px] uppercase tracking-[0.4em] mb-1">
            <BookOpen size={10} />
            <span>Nossa Cultura</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tighter">NOSSOS PRINCÍPIOS</h1>
        </div>
        <button 
          onClick={() => setPage('dashboard')}
          className="h-9 px-4 bg-white/5 text-slate-400 hover:text-white rounded-xl flex items-center gap-2 font-black text-[9px] uppercase tracking-widest transition-all"
        >
          <Home size={14} /> <span className="hidden sm:inline">Início</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl">
        {companyPrinciples.map((principle, index) => (
          <motion.div
            key={principle.num}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
            className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:border-coffee-red/50 transition-all group"
          >
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 bg-coffee-red text-white rounded-full flex items-center justify-center font-black text-sm flex-shrink-0 group-hover:scale-110 transition-transform">
                {principle.num}
              </div>
              <div>
                <h3 className="text-white font-black uppercase tracking-tight text-sm mb-1">{principle.title}</h3>
                <p className="text-slate-400 text-[11px] leading-relaxed">{principle.text}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

const ExpedicaoShiftChart = ({ data }: { data: FrotaItem[] }) => {
  const shiftCounts = data.reduce((acc: Record<string, number>, item) => {
    const shifts = [(item as any).bau1_exp_turno, (item as any).bau2_exp_turno].filter(Boolean);
    shifts.forEach(s => {
      acc[s] = (acc[s] || 0) + 1;
    });
    return acc;
  }, {});

  const chartData = ['A', 'B', 'C', 'AB', 'BC', 'AC'].map(shift => ({
    name: `Turno ${shift}`,
    value: shiftCounts[shift] || 0
  }));

  const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

  return (
    <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.4em]">Carregamento por Turno</h3>
        <PieChartIcon size={16} className="text-coffee-red" />
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ backgroundColor: '#1c1917', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '1rem' }}
              itemStyle={{ color: '#fff', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {chartData.map((item, idx) => (
          <div key={item.name} className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.name}</span>
            <span className="text-xs font-black text-white ml-auto">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

function ChatPage({ setPage, currentUser }: { setPage: (page: any) => void; currentUser: string }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [userProfiles, setUserProfiles] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isAdmin = currentUser === 'jeff' || (currentUser && USERS[currentUser]?.role === 'admin');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'users'));
        const profiles: Record<string, string> = {};
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.username) {
            profiles[data.username] = data.name || data.displayName || data.username;
          }
        });
        setUserProfiles(profiles);
      } catch (err) {
        console.error("Failed to fetch user profiles:", err);
      }
    };
    fetchProfiles();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'chat_messages'),
      orderBy('timestamp', 'asc'),
      limit(100)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedMessages = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as any));
        
        const now = Date.now();
        
        // Filter deleted messages in the UI logic and map to view model
        setMessages(fetchedMessages
            .filter((msg: any) => !msg.isDeleted)
            .map((msg: any) => {
                const msgDate = msg.timestamp?.toDate();
                const isOwner = msg.id_usuario === currentUser;
                const isWithin24h = msgDate && (now - msgDate.getTime()) < 24 * 60 * 60 * 1000;

                // Admin can delete/edit anything. Owner can delete/edit within 24h.
                const canEditDelete = isAdmin || (isOwner && isWithin24h);

                return {
                    id: msg.id,
                    user: msg.usuario,
                    displayName: msg.nome_exibicao || getUserDisplayName(msg.id_usuario),
                    text: msg.texto,
                    time: msgDate?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '',
                    isMe: isOwner,
                    canEditDelete,
                    isEdited: msg.isEdited,
                    isDeleted: msg.isDeleted
                };
            }));
    });
    return () => unsubscribe();
  }, [currentUser, isAdmin]);

  const getUserDisplayName = (username: string) => {
    return userProfiles[username] || USERS[username]?.name || username;
  };

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
        const userDisplayName = getUserDisplayName(currentUser);
        await addDoc(collection(db, 'chat_messages'), {
            texto: newMessage,
            usuario: currentUser,
            id_usuario: currentUser,
            nome_exibicao: userDisplayName,
            timestamp: serverTimestamp(),
            isEdited: false,
            isDeleted: false
        });
        await storageService.addNotification(`Nova mensagem de ${userDisplayName} no chat`, 'info');
        setNewMessage('');
    } catch (error) {
        console.error('Error sending message:', error);
    }
  };

  const handleEdit = async (id: string, currentText: string) => {
    const newText = prompt("Editar mensagem:", currentText);
    if (newText !== null && newText !== currentText) {
      await storageService.updateChatMessage(id, newText);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Tem certeza que deseja excluir esta mensagem?")) {
      await storageService.softDeleteChatMessage(id);
    }
  };

  const handleClearChat = async () => {
    if (confirm("ATENÇÃO: Você deseja apagar TODO o histórico de mensagens para todos?")) {
      try {
        setMessages([]); // Immediate UI reset
        await storageService.clearChatHistory();
        console.log("[CHAT] History cleared successfully in DB");
      } catch (error) {
        console.error("[CHAT] Failed to clear history:", error);
      }
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 flex-1 flex flex-col h-full bg-coffee-dark">
      <div className="flex items-center justify-between border-b border-white/5 pb-4 flex-shrink-0">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-coffee-red font-black text-[8px] uppercase tracking-[0.4em] mb-1">
            <MessageSquare size={10} />
            <span>Comunicação Interna</span>
          </div>
          <h1 translate="no" className="text-2xl font-black text-white tracking-tighter">CHAT DA EQUIPE</h1>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <button 
              onClick={handleClearChat}
              className="h-9 px-4 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white border border-rose-500/20 rounded-xl flex items-center gap-2 font-black text-[9px] uppercase tracking-widest transition-all shadow-lg shadow-rose-500/10"
              title="Limpar Histórico Completo"
            >
              <Trash2 size={14} /> <span>Limpar Tudo</span>
            </button>
          )}
          <button 
            onClick={() => setPage('dashboard')}
            className="h-9 px-4 bg-white/5 text-slate-400 hover:text-white rounded-xl flex items-center gap-2 font-black text-[9px] uppercase tracking-widest transition-all"
          >
            <Home size={14} /> <span className="hidden sm:inline">Início</span>
          </button>
        </div>
      </div>

      <div className="flex-1 bg-white/5 border border-white/10 rounded-3xl flex flex-col overflow-hidden relative">
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {messages.map((msg: any) => (
            <div key={msg.id} className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'}`}>
              {/* Display full name above bubble */}
              <span className={`text-[9px] font-black uppercase tracking-widest mb-1.5 px-1 ${msg.isMe ? 'text-coffee-red' : 'text-slate-500'}`}>
                {msg.displayName}
              </span>
              
              <div className={`flex items-end gap-2 max-w-[85%] ${msg.isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`p-3 rounded-2xl text-[11px] leading-relaxed flex items-center gap-2 relative ${msg.isMe ? 'bg-coffee-red text-white' : 'bg-slate-800 text-slate-300'} ${msg.isDeleted ? 'italic text-slate-500 bg-slate-900 border border-slate-800 line-through' : ''}`}>
                  {msg.text}
                  {msg.isEdited && <span className="text-[8px] opacity-60">(editada)</span>}
                  {msg.canEditDelete && (
                    <div className="absolute -top-3 -right-3 flex gap-1 items-center bg-black/80 rounded-full p-1 z-50 border border-white/10 shadow-xl opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEdit(msg.id, msg.text)} className="p-1 text-yellow-400 hover:text-yellow-200 transition-colors"><Pencil size={10} /></button>
                      <button onClick={() => handleDelete(msg.id)} className="p-1 text-red-400 hover:text-red-200 transition-colors"><Trash2 size={10} /></button>
                    </div>
                  )}
                </div>
              </div>
              <span className="text-[8px] text-slate-600 font-bold mt-1.5 px-1">{msg.time}</span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="p-4 bg-slate-950/50 border-t border-white/5 flex gap-3">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Digite sua mensagem..."
            className="flex-1 h-12 bg-white/5 border border-white/10 rounded-xl px-4 text-sm text-white focus:ring-1 focus:ring-coffee-red outline-none transition-all placeholder-slate-600"
          />
          <button 
            type="submit"
            className="w-12 h-12 bg-coffee-red text-white rounded-xl flex items-center justify-center hover:bg-coffee-red/90 transition-all shadow-lg shadow-coffee-red/20"
          >
            <Send size={20} />
          </button>
        </form>
      </div>
    </div>
  );
}

function Sidebar({ currentPage, setPage, collapsed, onToggle, currentUser, onLogout }: { currentPage: string, setPage: (page: any) => void, collapsed: boolean, onToggle: () => void, currentUser: string, onLogout: () => void }) {
  const navItems = [
    { id: 'checklist', label: 'Checklist', icon: CheckCircle },
    { id: 'escala', label: 'Escala', icon: Calendar },
    { id: 'veiculos', label: 'Veículos', icon: Truck },
    { id: 'docas', label: 'Docas', icon: Shield },
    { id: 'recebimento', label: 'Recebimento', icon: FileText },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'principios', label: 'Princípios', icon: BookOpen },
    { id: 'sobre', label: 'Sobre o App', icon: Lightbulb },
  ];

  return (
    <aside className={`bg-slate-950 border-r border-white/5 flex-col hidden md:flex flex-shrink-0 transition-all duration-500 ease-in-out ${collapsed ? 'w-14' : 'w-52'}`}>
      <div className={`p-4 border-b border-white/5 flex items-center justify-between gap-2 ${collapsed ? 'flex-col' : ''}`}>
        <div className="flex items-center gap-2">
          <div className="bg-cyan-500 p-1 rounded-lg">
            <Truck size={16} className="text-white flex-shrink-0" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-white font-black text-xs tracking-tighter leading-none">FROTA 3C</span>
              <span className="text-cyan-500 font-bold text-[7px] uppercase tracking-widest mt-0.5">3 Corações</span>
            </div>
          )}
        </div>
        <button 
          onClick={onToggle} 
          className="text-slate-500 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5"
          title="Recolher Painel"
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar flex flex-col">
        <button 
          onClick={() => setPage('dashboard' as any)}
          className={`flex items-center gap-3 px-4 py-3 w-full rounded-xl font-black uppercase tracking-tighter text-[10px] transition-all group relative ${collapsed ? 'justify-center' : ''} ${currentPage === 'dashboard' ? 'bg-coffee-red text-white shadow-2xl shadow-coffee-red/30' : 'text-slate-500 hover:bg-white/5 hover:text-white'}`}>
          <LayoutDashboard size={16} className={`flex-shrink-0 ${currentPage === 'dashboard' ? 'text-white' : 'group-hover:text-coffee-red transition-colors'}`} />
          {!collapsed && <span>Início</span>}
        </button>

        <div className="h-2" />
        {!collapsed && <p className="px-4 text-[8px] font-black text-slate-600 uppercase tracking-[0.3em] mb-1">Operações</p>}

        {navItems.map(item => (
          <button 
            key={item.id}
            onClick={() => setPage(item.id as any)}
            className={`flex items-center gap-3 px-4 py-3 w-full rounded-xl font-black uppercase tracking-tighter text-[10px] transition-all group relative ${collapsed ? 'justify-center' : ''} ${currentPage === item.id ? 'bg-coffee-red text-white shadow-2xl shadow-coffee-red/30' : 'text-slate-500 hover:bg-white/5 hover:text-white'}`}>
            <item.icon size={16} className={`flex-shrink-0 ${currentPage === item.id ? 'text-white' : 'group-hover:text-coffee-red transition-colors'}`} />
            {!collapsed && <span translate="no">{item.label}</span>}
          </button>
        ))}

        <div className="flex-1" /> {/* Spacer */}

        {!collapsed && (
          <div className="mt-4 p-4 bg-white/5 rounded-2xl border border-white/5 mx-1 relative overflow-hidden group">
            <p className="text-[8px] font-black text-coffee-red uppercase tracking-widest mb-2">Dica do Dia ☕</p>
            <p className="text-[9px] text-slate-400 font-medium leading-relaxed italic">
              "{dailyTips[Math.floor(Date.now() / 3600000) % dailyTips.length]}"
            </p>
          </div>
        )}
        
        <div className="mt-4 pt-4 border-t border-white/5">
          <button 
            onClick={onLogout}
            className={`flex items-center gap-3 px-4 py-3 w-full rounded-xl font-black uppercase tracking-tighter text-[10px] transition-all group relative text-slate-500 hover:bg-rose-500/10 hover:text-rose-500 ${collapsed ? 'justify-center' : ''}`}
          >
            <LogOut size={16} className="flex-shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </nav>
    </aside>
  );
}

interface ScaleGroup {
  id: number;
  data_escala: string;
  status: 'Open' | 'Archived';
  items_count: number;
  created_at: string;
}

function EscalaPage({ setPage, currentUser }: { setPage: (page: any) => void; currentUser: string }) {
  const canEdit = ['gr3c', 'jeff'].includes(currentUser);
  const [view, setView] = useState<'list' | 'create' | 'details'>('list');
  const [activeTab, setActiveTab] = useState<'ativas' | 'semanal' | 'checklist_vencido'>('ativas');
  const [scaleGroups, setScaleGroups] = useState<ScaleGroup[]>([]);
  const [checklistVencidoItems, setChecklistVencidoItems] = useState<EscalaItem[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [activeGroupDate, setActiveGroupDate] = useState<string>('');
  
  // Create Form State
  const [creationStep, setCreationStep] = useState<'date' | 'vehicle' | 'decision'>('date');
  const [newScaleDate, setNewScaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [tempVehicles, setTempVehicles] = useState<Omit<EscalaItem, 'id' | 'created_at' | 'scale_group_id'>[]>([]);

  // Details View State
  const [escalaItems, setEscalaItems] = useState<EscalaItem[]>([]);
  const [checklists, setChecklists] = useState<{ placa: string; status: string; validade: string | null; tipo: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('Todos');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  
  // Item Form state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [cavalo, setCavalo] = useState('');
  const [bau1, setBau1] = useState('');
  const [bau2, setBau2] = useState('');
  const [tipoVeiculo, setTipoVeiculo] = useState<'Rodo Trem' | 'Bau'>('Rodo Trem');
  const [destino, setDestino] = useState('');
  const [searchTermPlate, setSearchTermPlate] = useState('');
  const [searchTermDate, setSearchTermDate] = useState('');

  useEffect(() => { 
    setLoading(true);
    let unsubGroups: () => void;
    let unsubEscala: () => void;
    let unsubChecklists: () => void;

    const todayISO = new Date().toISOString().split('T')[0];

    // Listen Escala Items
    const qEscala = collection(db, 'escala_items');
    unsubEscala = onSnapshot(qEscala, (snapshot) => {
      const allItems = snapshot.docs.map(doc => ({ id: Number(doc.id), ...doc.data() })) as EscalaItem[];
      
      const itemsVencido = allItems.filter(i => i.veiculo_atrelado === 'Sim' && i.checklist_status !== 'Checklist OK').sort((a, b) => b.id - a.id);
      setChecklistVencidoItems(itemsVencido);

      if (activeGroupId) {
        const groupItems = allItems.filter(i => i.scale_group_id === activeGroupId).sort((a, b) => b.id - a.id);
        setEscalaItems(groupItems);
      }
    });

    // Listen Scale Groups
    const qGroups = collection(db, 'scale_groups');
    unsubGroups = onSnapshot(qGroups, async (snapshot) => {
      const groups = snapshot.docs.map(doc => ({ id: Number(doc.id), ...doc.data() })) as ScaleGroup[];
      
      // Auto archive
      const newGroups = groups.map((g) => {
         if (g.status === 'Open' && g.data_escala < todayISO) {
           const archived = { ...g, status: 'Archived' as const };
           storageService.saveScaleGroup(archived);
           return archived;
         }
         return g;
      });

      let filteredGroups = newGroups.filter(g => 
        activeTab === 'semanal' ? g.status === 'Archived' : (g.status === 'Open' && g.data_escala >= todayISO)
      );

      if (searchTermDate) {
        filteredGroups = filteredGroups.filter(g => g.data_escala === searchTermDate);
      }

      if (searchTermPlate) {
        const itemsSnap = await getDocs(collection(db, 'escala_items'));
        const allItems = itemsSnap.docs.map(doc => ({ ...doc.data() })) as any[];
        const groupIdsWithPlate = allItems
          .filter(i => 
            i.cavalo.toLowerCase().includes(searchTermPlate.toLowerCase()) ||
            i.bau1.toLowerCase().includes(searchTermPlate.toLowerCase()) ||
            (i.bau2 && i.bau2.toLowerCase().includes(searchTermPlate.toLowerCase()))
          )
          .map(i => i.scale_group_id);
        
        filteredGroups = filteredGroups.filter(g => groupIdsWithPlate.includes(g.id));
      }

      const allItemsSnap = await getDocs(collection(db, 'escala_items'));
      const allItemsCount = allItemsSnap.docs.map(doc => ({ ...doc.data() })) as any[];
      const groupsWithCount = filteredGroups.map(g => ({
        ...g,
        items_count: allItemsCount.filter(i => i.scale_group_id === g.id && !i.saved && i.veiculo_atrelado !== 'Sim').length
      })).sort((a, b) => b.id - a.id);

      setScaleGroups(groupsWithCount);
      setLoading(false);
    });

    // Listen Checklists
    const qChecklists = collection(db, 'checklists');
    unsubChecklists = onSnapshot(qChecklists, (snapshot) => {
       const docs = snapshot.docs.map(doc => ({ placa: doc.id, ...doc.data() })) as any;
       setChecklists(docs);
    });

    return () => {
      if(unsubGroups) unsubGroups();
      if(unsubEscala) unsubEscala();
      if(unsubChecklists) unsubChecklists();
    };
  }, [view, activeGroupId, activeTab, searchTermPlate, searchTermDate]);

  const fetchChecklistVencido = () => {};

  const filteredItems = useMemo(() => {
    return escalaItems.filter(item => {
      const matchesSearch = 
        item.cavalo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.bau1.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.bau2 && item.bau2.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesFilter = filterStatus === 'Todos' || item.checklist_status === filterStatus;
      
      return matchesSearch && matchesFilter;
    });
  }, [escalaItems, searchTerm, filterStatus]);

  const fetchScaleGroups = () => {};

  const handleArchiveScale = async (e: any, groupId: number) => {
    e.stopPropagation();
    if (!window.confirm('Tem certeza que deseja arquivar esta escala? Ela será movida para Escalas Semanais.')) return;

    try {
      setLoading(true);
      const groups = await storageService.getScaleGroups();
      const group = groups.find(g => g.id === groupId);
      if (group) {
        await storageService.saveScaleGroup({ ...group, status: 'Archived' });
        fetchScaleGroups();
      }
    } catch (error) {
      console.error('Failed to archive scale:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTempVehicle = async (e: FormEvent) => {
    e.preventDefault();
    if (!cavalo || !bau1) {
      alert('Por favor, preencha a placa do Cavalo e do MAIS PESADO.');
      return;
    }
    if (tipoVeiculo === 'Rodo Trem' && !bau2) {
      alert('Por favor, preencha a placa do MAIS LEVE para Rodo Trem.');
      return;
    }

    const cavaloUpper = cavalo.toUpperCase().trim() || "";
    const bau1Upper = bau1.toUpperCase().trim() || "";
    const bau2Upper = (tipoVeiculo === 'Rodo Trem' && bau2) ? bau2.toUpperCase().trim() : "";

    // Check for duplicates within the current input
    if (cavaloUpper === bau1Upper || (bau2Upper && (cavaloUpper === bau2Upper || bau1Upper === bau2Upper))) {
      alert('As placas do Cavalo e dos MAIS PESADOS/LEVES não podem ser iguais.');
      return;
    }

    // Check for duplicates in the temporary list
    const isDuplicateCavalo = tempVehicles.some(v => v.cavalo === cavaloUpper);
    if (isDuplicateCavalo) {
      alert('Este cavalo já foi adicionado nesta lista.');
      return;
    }

    const isDuplicateBau = tempVehicles.some(v => 
      v.bau1 === bau1Upper || 
      (v.bau2 && v.bau2 === bau1Upper) ||
      (bau2Upper && (v.bau1 === bau2Upper || (v.bau2 && v.bau2 === bau2Upper)))
    );

    if (isDuplicateBau) {
      alert('Uma ou mais placas de baú já foram adicionadas nesta lista.');
      return;
    }

    const isCrossDuplicate = tempVehicles.some(v => 
      v.cavalo === bau1Upper || 
      (bau2Upper && v.cavalo === bau2Upper) ||
      v.bau1 === cavaloUpper ||
      (v.bau2 && v.bau2 === cavaloUpper)
    );

    if (isCrossDuplicate) {
      alert('Uma placa está sendo usada como cavalo e baú simultaneamente.');
      return;
    }

    const checklists = await storageService.getChecklists();
    const checklistItem: any = checklists.find((c: any) => c.placa === cavaloUpper);
    const checklistStatus = checklistItem ? getEffectiveStatus(checklistItem.status, checklistItem.validade) : 'Checklist OK';

    const newTempItem = {
      cavalo: cavaloUpper,
      bau1: bau1Upper,
      bau2: bau2Upper,
      destino: destino,
      tipo_veiculo: tipoVeiculo,
      data_escala: newScaleDate,
      checklist_status: checklistStatus as any,
      veiculo_atrelado: 'Não' as const,
      checklist_realizado: 'Não' as const,
      bau1_yard_status: '',
      bau2_yard_status: '',
      bau1_doca_action: '',
      bau2_doca_action: '',
      bau1_doca_number: '',
      bau2_doca_number: '',
      bau1_final_status: '',
      bau2_final_status: '',
      saved: false
    };

    setTempVehicles([...tempVehicles, newTempItem]);
    setCavalo(''); setBau1(''); setBau2(''); setDestino('');
    setCreationStep('decision');
  };

  const handleFinishCreation = async () => {
    try {
      setLoading(true);
      const newGroup = await storageService.saveScaleGroup({
        data_escala: newScaleDate,
        status: 'Open',
        items_count: tempVehicles.length,
        created_at: new Date().toISOString()
      });
      
      const newItems = tempVehicles.map(temp => ({
        scale_group_id: newGroup.id,
        ...temp,
        created_at: new Date().toISOString()
      }));

      for (const item of newItems) {
        // Just replacing undefined with "" as a failsafe
        Object.keys(item).forEach(key => {
          if ((item as any)[key] === undefined) {
             (item as any)[key] = "";
          }
        });
      }

      try {
        await storageService.saveEscalaItems(newItems);
      } catch (err) {
        console.error("Erro salvando os data items:", newItems, err);
        throw err;
      }
      
      setTempVehicles([]);
      setCavalo(''); setBau1(''); setBau2(''); setDestino('');
      setCreationStep('date');
      setView('list');
      setActiveTab('ativas');
      addNotification('success', `Escala criada para ${new Date(newScaleDate).toLocaleDateString('pt-BR')}`);
      alert('Escala criada com sucesso!');
    } catch (error) {
      console.error('Failed to create scale:', error);
      alert('Erro ao criar escala. Verifique o console para detalhes.');
    } finally {
      setLoading(false);
    }
  };

  const fetchEscala = (groupId: number) => {};

  const handleArchiveGroup = async () => {
    if (!window.confirm('Deseja salvar e arquivar esta escala? Ela será movida para o Semanal.')) return;
    
    try {
      setLoading(true);
      const groups = await storageService.getScaleGroups();
      const group = groups.find(g => g.id === activeGroupId);
      if (group) {
        await storageService.saveScaleGroup({ ...group, status: 'Archived' });
        alert('Escala arquivada com sucesso!');
        setActiveTab('semanal');
        setView('list');
      }
    } catch (error) {
      console.error('Failed to archive group:', error);
      alert('Erro ao arquivar escala.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Deseja realmente excluir esta escala completa? Esta ação não pode ser desfeita.')) return;
    
    try {
      setLoading(true);
      // ATUALIZAÇÃO OTIMISTA: Remove da tela na hora!
      setScaleGroups(prev => prev.filter(group => group.id !== id));

      await storageService.deleteScaleGroup(id);
      
      // Remove items associated with group
      const allItems = await storageService.getEscalaItems();
      const itemsToDelete = allItems.filter(i => i.scale_group_id === id);
      for (const item of itemsToDelete) {
        await storageService.deleteEscalaItem(item.id);
      }
      
      addNotification('success', 'Escala excluída com sucesso.');
    } catch (error) {
      console.error('Failed to delete scale group:', error);
      alert('Erro ao excluir escala.');
      fetchScaleGroups(); // Revert optimistic update
    } finally {
      setLoading(false);
    }
  };

  const fetchChecklists = () => {};

  const getEffectiveStatus = (status: string, validade: string | null) => {
    const now = new Date();
    if (status === 'Negativado') return 'Negativado';
    if (status === 'Liberado para 1 viagem') return 'Liberado para 1 viagem';
    if (validade && new Date(validade) < now) return 'Checklist Vencido';
    return 'Checklist OK';
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!cavalo || !bau1) {
      alert('Por favor, preencha a placa do Cavalo e do MAIS PESADO.');
      return;
    }
    if (tipoVeiculo === 'Rodo Trem' && !bau2) {
      alert('Por favor, preencha a placa do MAIS LEVE para Rodo Trem.');
      return;
    }

    const cavaloUpper = cavalo.toUpperCase().trim() || "";
    if (!editingId && escalaItems.some(item => item.cavalo === cavaloUpper)) {
      alert('Esta placa de cavalo já foi adicionada na escala.');
      return;
    }

    try {
      setLoading(true);
      const checklists = await storageService.getChecklists();
      const checklistItem = checklists.find((c: any) => c.placa === cavaloUpper);
      const checklistStatus = checklistItem ? getEffectiveStatus(checklistItem.status, checklistItem.validade) : 'Checklist OK';

      const entryData = {
        scale_group_id: activeGroupId! || "",
        cavalo: cavaloUpper,
        bau1: bau1.toUpperCase().trim() || "",
        bau2: (tipoVeiculo === 'Rodo Trem' && bau2) ? bau2.toUpperCase().trim() : "",
        tipo_veiculo: tipoVeiculo || "",
        data_escala: activeGroupDate || "",
        checklist_status: checklistStatus as any,
      };

      if (editingId) {
        const allItems = await storageService.getEscalaItems();
        const target = allItems.find(i => i.id === editingId);
        if (target) {
          await storageService.saveEscalaItem({ ...target, ...entryData });
        }
      } else {
        const newItem = {
          ...entryData,
          veiculo_atrelado: 'Não' as const,
          checklist_realizado: 'Não' as const,
          created_at: new Date().toISOString()
        };
        await storageService.saveEscalaItem(newItem);
      }
      
      fetchEscala(activeGroupId!);
      setCavalo(''); setBau1(''); setBau2('');
      setEditingId(null);
      setShowForm(false);
    } catch (error) {
      console.error('Failed to save escala item:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item: EscalaItem) => {
    setEditingId(item.id);
    setCavalo(item.cavalo);
    setBau1(item.bau1);
    setBau2(item.bau2 || '');
    setTipoVeiculo(item.tipo_veiculo);
    setShowForm(true);
  };

  // --- VIEWS ---

  const renderTabs = () => (
    <div className="flex gap-4 border-b border-white/5 mb-6">
      <button 
        onClick={() => { setActiveTab('ativas'); setView('list'); }} 
        className={`pb-2 px-4 font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'ativas' ? 'text-coffee-red border-b-2 border-coffee-red' : 'text-slate-500 hover:text-white'}`}
      >
        Escalas Ativas
      </button>
      <button 
        onClick={() => { setActiveTab('semanal'); setView('list'); }} 
        className={`pb-2 px-4 font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'semanal' ? 'text-coffee-red border-b-2 border-coffee-red' : 'text-slate-500 hover:text-white'}`}
      >
        Histórico/Arquivo
      </button>
      <button 
        onClick={() => { setActiveTab('checklist_vencido'); setView('list'); }} 
        className={`pb-2 px-4 font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'checklist_vencido' ? 'text-coffee-red border-b-2 border-coffee-red' : 'text-slate-500 hover:text-white'} flex items-center gap-2`}
      >
        Checklist Vencido
        {checklistVencidoItems.length > 0 && (
          <span className="bg-coffee-red text-white text-[8px] px-1.5 py-0.5 rounded-full animate-pulse">
            {checklistVencidoItems.length}
          </span>
        )}
      </button>
    </div>
  );

  if (activeTab === 'checklist_vencido') {
    return (
      <div className="p-4 md:p-8 space-y-6 flex-1 overflow-y-auto bg-coffee-dark">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <div className="flex items-center gap-2 text-coffee-red font-black text-[8px] uppercase tracking-[0.4em] mb-1">
              <AlertTriangle size={10} />
              <span>Controle de Pendências</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tighter">CHECKLIST VENCIDO</h1>
          </div>
          <button 
            onClick={() => setPage('dashboard')}
            className="h-9 px-4 bg-white/5 text-slate-400 hover:text-white rounded-xl flex items-center gap-2 font-black text-[9px] uppercase tracking-widest transition-all"
          >
            <Home size={14} /> <span className="hidden sm:inline">Início</span>
          </button>
        </div>

        {renderTabs()}

        <div className="grid grid-cols-1 gap-4">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-4 bg-slate-900/20 rounded-3xl border border-slate-800">
              <div className="w-12 h-12 border-2 border-coffee-red border-t-transparent rounded-full animate-spin" />
              <span className="text-coffee-red font-mono text-xs animate-pulse">Buscando pendências...</span>
            </div>
          ) : checklistVencidoItems.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-4 bg-slate-900/20 rounded-3xl border border-slate-800 border-dashed">
              <CheckCircle size={48} className="text-slate-800" />
              <p className="text-slate-600 font-medium">Nenhum veículo com checklist pendente.</p>
            </div>
          ) : (
            checklistVencidoItems.map((item, idx) => (
              <EscalaCard 
                key={item.id} 
                item={item} 
                index={idx}
                isExpanded={expandedId === item.id}
                onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                onUpdate={fetchChecklistVencido}
                onEdit={() => {}}
                onOptimisticRemove={(id) => {
                  setChecklistVencidoItems(prev => prev.filter(i => i.id !== id));
                }}
                canEdit={canEdit}
                activeTab="checklist_vencido"
              />
            ))
          )}
        </div>
      </div>
    );
  }

  if (view === 'list') {
    const renderGroupCard = (group: ScaleGroup) => (
      <motion.div 
        key={group.id}
        whileHover={{ y: -3 }}
        className={`bg-white/5 border border-white/10 p-6 rounded-[2rem] cursor-pointer group transition-all ${activeTab === 'semanal' ? 'hover:border-amber-500/50' : 'hover:border-coffee-red/50'}`}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          setActiveGroupId(group.id);
          setActiveGroupDate(group.data_escala);
          setView('details');
        }}
      >
        <div className="flex justify-between items-start mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${activeTab === 'semanal' ? 'bg-amber-500/10 text-amber-500 group-hover:bg-amber-500 group-hover:text-white' : 'bg-coffee-red/10 text-coffee-red group-hover:bg-coffee-red group-hover:text-white'}`}>
            <Calendar size={20} />
          </div>
          <div className="flex items-center gap-2">
            <div className={`px-2.5 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${group.status === 'Archived' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'}`}>
              {group.status === 'Archived' ? 'Arquivado' : 'Em Aberto'}
            </div>
            {group.status !== 'Archived' && canEdit && (
              <button
                onClick={(e) => handleArchiveScale(e, group.id)}
                className="w-6 h-6 rounded-full bg-white/5 hover:bg-amber-500/20 text-slate-400 hover:text-amber-500 flex items-center justify-center transition-colors"
                title="Arquivar Escala"
              >
                <Archive size={12} />
              </button>
            )}
            {canEdit && (
              <button
                onClick={(e) => handleDeleteGroup(group.id, e as unknown as React.MouseEvent)}
                className="w-6 h-6 rounded-full bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors"
                title="Excluir Escala"
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
        <h3 className="text-xl font-black text-white tracking-tight mb-1">
          {new Date(group.data_escala + 'T00:00:00').toLocaleDateString('pt-BR')}
        </h3>
        <p className="text-slate-500 text-[9px] font-bold uppercase tracking-widest mb-4">
          Escala #{group.id.toString().padStart(4, '0')}
        </p>
        <div className="flex items-center gap-2 text-slate-400 text-[10px] font-medium">
          <Truck size={14} />
          <span>{group.items_count} Veículos registrados</span>
        </div>
      </motion.div>
    );

    return (
      <div className="p-4 md:p-8 space-y-6 flex-1 overflow-y-auto bg-coffee-dark">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <div className="flex items-center gap-2 text-coffee-red font-black text-[8px] uppercase tracking-[0.4em] mb-1">
              <Calendar size={10} />
              <span>Gerenciamento de Escalas</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tighter uppercase">
              {activeTab === 'semanal' ? 'Histórico de Escalas' : 'Escalas Ativas'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2">
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input 
                        type="text" 
                        placeholder="Pesquisar placa..." 
                        value={searchTermPlate}
                        onChange={(e) => setSearchTermPlate(e.target.value)}
                        className="h-9 pl-9 pr-4 bg-white/5 border border-white/10 rounded-xl text-white text-xs font-medium focus:outline-none focus:border-coffee-red/50 transition-colors w-32 lg:w-40"
                    />
                </div>
                <div className="relative">
                    <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input 
                        type="date" 
                        value={searchTermDate}
                        onChange={(e) => setSearchTermDate(e.target.value)}
                        className="h-9 pl-9 pr-4 bg-white/5 border border-white/10 rounded-xl text-white text-xs font-medium focus:outline-none focus:border-coffee-red/50 transition-colors w-32 lg:w-40"
                    />
                </div>
            </div>
            <button 
              onClick={() => setPage('dashboard')}
              className="h-9 px-4 bg-white/5 text-slate-400 hover:text-white rounded-xl flex items-center gap-2 font-black text-[9px] uppercase tracking-widest transition-all"
            >
              <Home size={14} /> <span className="hidden sm:inline">Início</span>
            </button>
            {canEdit && activeTab === 'ativas' && (
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setView('create')}
                className="h-9 px-4 bg-coffee-red text-white rounded-xl flex items-center gap-2 font-black text-[9px] uppercase tracking-widest shadow-xl shadow-coffee-red/20"
              >
                <Plus size={14} /> <span className="hidden sm:inline">Nova Escala</span>
                <span className="sm:hidden">Nova</span>
              </motion.button>
            )}
          </div>
        </div>

        {renderTabs()}

        <div className="w-full flex flex-col gap-6">
          {loading ? (
            <div className="text-center py-16 text-slate-500 text-xs">Carregando escalas...</div>
          ) : scaleGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 border border-dashed border-white/10 rounded-[2rem]">
              <Calendar size={40} className="text-white/10" />
              <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Nenhuma escala encontrada.</p>
              {activeTab === 'ativas' && <button onClick={() => setView('create')} className="text-coffee-red hover:underline text-[10px] font-bold uppercase tracking-widest">Criar a primeira escala</button>}
            </div>
          ) : activeTab === 'semanal' ? (
            Object.entries(
              scaleGroups.reduce((acc, group) => {
                const date = new Date(group.data_escala + 'T00:00:00');
                const monthYear = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                const capMonthYear = monthYear.charAt(0).toUpperCase() + monthYear.slice(1);
                if (!acc[capMonthYear]) acc[capMonthYear] = [];
                acc[capMonthYear].push(group);
                return acc;
              }, {} as Record<string, ScaleGroup[]>)
            ).map(([monthYear, groups]) => (
              <div key={monthYear} className="space-y-4">
                <h2 className="text-xl font-black text-slate-400 capitalize">{monthYear}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {groups.map(group => renderGroupCard(group))}
                </div>
              </div>
            ))
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {scaleGroups.map(group => renderGroupCard(group))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === 'create') {
    return (
      <div className="p-6 md:p-8 flex-1 flex items-center justify-center bg-coffee-dark">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white/5 border border-white/10 p-12 rounded-[3rem] max-w-2xl w-full text-center space-y-8 shadow-2xl backdrop-blur-xl"
        >
          {creationStep === 'date' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-md mx-auto">
              <div className="w-12 h-12 bg-coffee-red/10 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-coffee-red/20">
                <Calendar size={20} className="text-coffee-red" />
              </div>
              
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-white tracking-tight">Data da Escala</h2>
                <p className="text-slate-400 text-xs">Selecione o dia operacional para iniciar.</p>
              </div>

              <div className="relative group">
                <input 
                  type="date" 
                  value={newScaleDate}
                  onChange={(e) => setNewScaleDate(e.target.value)}
                  className="w-full h-12 bg-slate-900/50 border border-white/5 rounded-xl px-4 text-sm text-white text-center focus:ring-1 focus:ring-coffee-red/50 focus:border-coffee-red/50 outline-none transition-all placeholder-slate-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button 
                  onClick={() => setView('list')}
                  className="w-full h-10 bg-transparent text-slate-400 hover:text-white hover:bg-white/5 rounded-lg font-medium text-xs transition-all border border-transparent hover:border-white/5"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => setCreationStep('vehicle')}
                  className="w-full h-10 bg-coffee-red text-white rounded-lg font-medium text-xs hover:bg-coffee-red/90 transition-all shadow-lg shadow-coffee-red/10 flex items-center justify-center gap-2"
                >
                  <span>Próximo</span>
                  <MoveRight size={14} />
                </button>
              </div>
            </motion.div>
          )}

          {creationStep === 'vehicle' && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6 text-left">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-black text-white tracking-tighter">NOVO REGISTRO</h2>
                <p className="text-slate-500 text-xs font-medium uppercase tracking-widest">
                  Adicionando veículo {tempVehicles.length + 1} para {new Date(newScaleDate).toLocaleDateString('pt-BR')}
                </p>
              </div>
              
              <form onSubmit={handleAddTempVehicle} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <SelectField
                    label="Placa Cavalo"
                    value={cavalo}
                    onChange={(e) => setCavalo(e.target.value)}
                    options={checklists
                      .filter(c => c.tipo === 'Cavalo' && !tempVehicles.some(v => v.cavalo === c.placa))
                      .map(c => ({
                        label: `${c.placa} [${getEffectiveStatus(c.status, c.validade)}]`,
                        value: c.placa
                      }))}
                    placeholder="Selecione..."
                  />
                </div>
                <SelectField 
                  label="Configuração" 
                  value={tipoVeiculo} 
                  onChange={e => setTipoVeiculo(e.target.value as any)} 
                  options={['Rodo Trem', 'Bau']} 
                />
                <SelectField 
                  label="Destino" 
                  value={destino} 
                  onChange={e => setDestino(e.target.value)} 
                  options={DESTINOS} 
                  placeholder="Selecione..."
                />
                <InputField label="Placa MAIS PESADO" value={bau1} onChange={setBau1} placeholder="ABC-1234" />
                {tipoVeiculo === 'Rodo Trem' && (
                  <InputField label="Placa MAIS LEVE" value={bau2} onChange={setBau2} placeholder="XYZ-5678" />
                )}
                
                <div className="col-span-full grid grid-cols-2 gap-4 mt-4">
                  <button 
                    type="button"
                    onClick={() => setCreationStep('date')}
                    className="w-full h-12 bg-white/5 text-slate-400 hover:text-white rounded-xl font-black uppercase tracking-widest hover:bg-white/10 transition-all text-xs"
                  >
                    Voltar
                  </button>
                  <button 
                    type="submit"
                    className="w-full h-12 bg-coffee-red text-white rounded-xl font-black uppercase tracking-widest hover:bg-coffee-red/80 transition-all shadow-xl shadow-coffee-red/20 text-xs"
                  >
                    Salvar Veículo
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {creationStep === 'decision' && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="space-y-8">
              <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle size={40} className="text-emerald-500" />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-black text-white tracking-tighter">VEÍCULO ADICIONADO!</h2>
                <p className="text-slate-500 text-sm font-medium">Você tem {tempVehicles.length} veículos nesta escala.</p>
              </div>
              
              <div className="grid grid-cols-1 gap-4">
                <button 
                  onClick={() => setCreationStep('vehicle')}
                  className="w-full h-14 bg-white/5 text-white border border-white/10 rounded-2xl font-black uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                >
                  <Plus size={18} /> Adicionar Mais Um Veículo
                </button>
                <button 
                  onClick={handleFinishCreation}
                  className="w-full h-14 bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2"
                >
                  <CheckCircle size={18} /> Finalizar Escala
                </button>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    );
  }

  // Details View
  return (
    <div className="p-4 md:p-8 space-y-4 flex-1 overflow-y-auto bg-coffee-dark relative">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/5 pb-4">
        <div className="space-y-1">
          <button 
            onClick={() => setView('list')}
            className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors text-[8px] font-black uppercase tracking-[0.2em] mb-1"
          >
            <ChevronsLeft size={10} />
            <span>Voltar para Lista</span>
          </button>
          <h1 translate="no" className="text-2xl font-black text-white tracking-tighter flex items-center gap-2">
            ESCALA <span className="text-coffee-red">{new Date(activeGroupDate + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
          </h1>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={() => setPage('dashboard')}
            className="h-9 px-4 bg-white/5 text-slate-400 hover:text-white rounded-xl flex items-center gap-2 font-black text-[9px] uppercase tracking-widest transition-all"
          >
            <Home size={14} /> <span className="hidden sm:inline">Início</span>
          </button>
          {canEdit && (
            <div className="flex gap-2">
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowForm(!showForm)}
                className={`h-9 px-4 rounded-xl flex items-center gap-2 font-black text-[9px] uppercase tracking-widest transition-all shadow-2xl ${showForm ? 'bg-white/5 text-slate-400' : 'bg-coffee-red text-white shadow-coffee-red/20'}`}
              >
                {showForm ? <XCircle size={16} /> : <Plus size={16} />}
                {showForm ? 'Cancelar' : 'Adicionar'}
              </motion.button>
            </div>
          )}
        </div>
      </div>
      
      {renderTabs()}
      
      <AnimatePresence>
        {showForm && (
          <motion.div 
            initial={{ opacity: 0, y: -20, height: 0 }} 
            animate={{ opacity: 1, y: 0, height: 'auto' }} 
            exit={{ opacity: 0, y: -20, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white/5 border border-white/10 rounded-[1.5rem] p-6 mb-8 backdrop-blur-xl">
              <h3 className="text-coffee-red font-black text-[9px] uppercase tracking-[0.4em] mb-4">
                {editingId ? 'Editar Registro' : 'Novo Registro'}
              </h3>
              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 items-end">
                <div className="flex flex-col gap-2">
                  <SelectField
                    label="Placa Cavalo"
                    value={cavalo}
                    onChange={(e) => setCavalo(e.target.value)}
                    options={checklists
                      .filter(c => c.tipo === 'Cavalo')
                      .map(c => ({
                        label: `${c.placa} [${getEffectiveStatus(c.status, c.validade)}]`,
                        value: c.placa
                      }))}
                    placeholder="Selecione..."
                  />
                </div>
                <SelectField 
                  label="Configuração" 
                  value={tipoVeiculo} 
                  onChange={e => setTipoVeiculo(e.target.value as any)} 
                  options={['Rodo Trem', 'Bau']} 
                />
                <InputField label="Placa MAIS PESADO" value={bau1} onChange={setBau1} placeholder="ABC-1234" />
                {tipoVeiculo === 'Rodo Trem' && (
                  <InputField label="Placa MAIS LEVE" value={bau2} onChange={setBau2} placeholder="XYZ-5678" />
                )}
                <div className="flex gap-2 col-span-full lg:col-span-1">
                  <button 
                    type="submit" 
                    className="flex-1 bg-coffee-red hover:bg-coffee-red/80 text-white h-11 rounded-xl flex items-center justify-center gap-2 font-black uppercase tracking-widest transition-all shadow-xl shadow-coffee-red/20 text-[10px]"
                  >
                    <CheckCircle size={18} /> {editingId ? 'Atualizar' : 'Salvar'}
                  </button>
                  {editingId && (
                    <button 
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setCavalo(''); setBau1(''); setBau2('');
                        setShowForm(false);
                      }}
                      className="bg-white/5 text-slate-400 hover:text-white h-11 px-3 rounded-xl transition-all"
                    >
                      <XCircle size={18} />
                    </button>
                  )}
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-[0.4em]">Monitoramento em Tempo Real</h2>
            <div className="h-4 w-[1px] bg-white/10" />
            <span className="text-[10px] font-bold text-coffee-red uppercase tracking-widest">{filteredItems.length} Veículos</span>
          </div>
          
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative">
              <input 
                type="text"
                placeholder="Buscar placa..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="h-12 pl-10 pr-4 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white outline-none focus:ring-2 focus:ring-coffee-red transition-all w-48"
              />
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            </div>
            
            <select 
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="h-12 px-4 bg-coffee-red border border-white/10 rounded-xl text-xs font-black text-white outline-none focus:ring-2 focus:ring-white/20 transition-all uppercase tracking-widest"
            >
              <option value="Todos">Todas</option>
              <option value="Checklist OK">Checklist OK</option>
              <option value="Checklist Vencido">Checklist Vencido</option>
              <option value="Negativado">Negativado</option>
              <option value="Liberado para 1 viagem">Liberado para 1 viagem</option>
            </select>

            <div className="flex gap-6 text-[10px] font-bold uppercase tracking-widest ml-4">
              <span className="flex items-center gap-2 text-emerald-500"><div className="w-2 h-2 rounded-full bg-current animate-pulse" /> Operacional</span>
              <span className="flex items-center gap-2 text-coffee-red"><div className="w-2 h-2 rounded-full bg-current" /> Pendência</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-4 bg-slate-900/20 rounded-3xl border border-slate-800">
              <div className="w-12 h-12 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-cyan-500 font-mono text-xs animate-pulse">Sincronizando Banco de Dados...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-4 bg-slate-900/20 rounded-3xl border border-slate-800 border-dashed">
              <Truck size={48} className="text-slate-800" />
              <p className="text-slate-600 font-medium">Nenhum registro encontrado.</p>
            </div>
          ) : (
            <AnimatePresence initial={false} mode="popLayout">
              {filteredItems.map((item, idx) => (
                <EscalaCard 
                  key={item.id} 
                  item={item} 
                  index={idx}
                  isExpanded={expandedId === item.id}
                  onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  onUpdate={() => fetchEscala(activeGroupId!)}
                  onEdit={() => handleEdit(item)}
                  onOptimisticRemove={(id) => {
                    setEscalaItems(prev => prev.filter(i => i.id !== id));
                  }}
                  canEdit={canEdit}
                  activeTab={activeTab}
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}

const FrotaStatusChart = ({ data }: { data: FrotaItem[] }) => {
  const statusCounts = data.reduce((acc, item) => {
    acc[item.frota_status] = (acc[item.frota_status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const chartData = [
    { name: 'Carregado com Produtos', value: statusCounts['Carregado com Produtos'] || 0, color: '#FF0000' },
    { name: 'Vazio', value: statusCounts['Vazio'] || 0, color: '#FFD700' },
    { name: 'Carregado com Palete', value: statusCounts['Carregado com Palete'] || 0, color: '#10b981' },
  ];

  return (
    <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-10 h-full flex flex-col items-center justify-center backdrop-blur-xl">
      <div className="relative w-full h-[240px] max-w-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              innerRadius={80}
              outerRadius={100}
              paddingAngle={10}
              dataKey="value"
              stroke="none"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-black text-white tracking-tighter">{data.length}</span>
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total</span>
        </div>
      </div>
      <div className="mt-10 grid grid-cols-3 gap-4 w-full">
        {chartData.map((item) => (
          <div key={item.name} className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">{item.name}</span>
            </div>
            <span className="text-xl font-black text-white">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// --- Reusable Form & UI Components ---

interface InputFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}
const InputField = ({ label, value, onChange, placeholder }: InputFieldProps) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
    <input 
      type="text" 
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      required
      className="h-11 px-4 bg-slate-900/50 border border-slate-300/20 rounded-xl focus:ring-2 focus:ring-cyan-500 outline-none transition-all uppercase font-mono text-white placeholder:text-slate-700 text-sm"
    />
  </div>
);

interface SelectFieldProps {
  label: string;
  value: string | number;
    onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  options: (string | number | { label: string, value: string | number })[];
  placeholder?: string;
  disabled?: boolean;
}
const SelectField = ({ label, value, onChange, options, placeholder, disabled }: SelectFieldProps) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{label}</label>
    <div className="relative">
      <select 
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`h-11 px-4 w-full bg-slate-900 border border-slate-300/20 rounded-xl appearance-none focus:ring-2 focus:ring-cyan-500 outline-none transition-all text-white font-bold text-xs ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {placeholder && <option value="" disabled className="bg-slate-900 text-slate-500">{placeholder}</option>}
        {options.map(opt => {
          const isObj = typeof opt === 'object' && opt !== null;
          const val = isObj ? (opt as any).value : opt;
          const lab = isObj ? (opt as any).label : opt;
          return <option key={val} value={val} className="bg-slate-900 text-white">{lab}</option>;
        })}
      </select>
      <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
    </div>
  </div>
);

interface EscalaCardProps {
  item: EscalaItem;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: () => void | Promise<void>;
  onEdit: () => void;
  onOptimisticRemove: (id: number) => void;
  canEdit: boolean;
  activeTab?: 'ativas' | 'semanal' | 'checklist_vencido';
}

const EscalaCard = ({ item, index, isExpanded, onToggle, onUpdate, onEdit, onOptimisticRemove, canEdit, activeTab }: EscalaCardProps) => {
  const [checklistResult, setChecklistResult] = useState<'Checklist OK' | 'Negativado' | null>(null);
  const [negativadoAction, setNegativadoAction] = useState<'Liberado para 1 viagem' | 'Reprovado' | null>(null);
  const [newValidade, setNewValidade] = useState('');
  const [showDateInput, setShowDateInput] = useState(false);

  const statusColors = {
    'Checklist OK': 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    'Checklist Vencido': 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    'Negativado': 'bg-rose-500/10 text-rose-500 border-rose-500/20',
    'Liberado para 1 viagem': 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  };

  const handleToggleAtrelado = async (val: 'Sim' | 'Não') => {
    const allItems = getStorage<EscalaItem[]>(STORAGE_KEYS.ESCALA, []);
    const updatedItems = allItems.map(i => i.id === item.id ? { ...i, veiculo_atrelado: val } : i);
    setStorage(STORAGE_KEYS.ESCALA, updatedItems);
    if (val === 'Sim') {
      addNotification('info', `Veículo ${item.cavalo} atrelado e movido para Checklist Vencido`);
      alert(`Veículo ${item.cavalo} atrelado! Pendência enviada para a aba Checklist Vencido.`);
    }
    onUpdate();
  };

  const handleChecklistRealizadoSim = async () => {
    if (!newValidade) {
      alert("Por favor, insira a nova data de validade.");
      return;
    }

    try {
      // 1. Atualizar Firestore - Checklist Collection
      const checklists = await storageService.getChecklists();
      const existingChecklist = checklists.find(c => c.placa === item.cavalo);
      await storageService.saveChecklist({
        placa: item.cavalo,
        status: 'Checklist OK',
        validade: newValidade,
        tipo: existingChecklist?.tipo || 'Cavalo',
        created_at: existingChecklist?.created_at || new Date().toISOString()
      });

      // 2. Atualizar Firestore - EscalaItem
      // Devemos atualizar o item e mudar o status para OK
      await storageService.saveEscalaItem({
        ...item,
        checklist_status: 'Checklist OK',
        checklist_realizado: 'Sim'
      });

      // 3. Notificação Prioritária
      await addNotification('success', `Checklist REALIZADO: Veículo ${item.cavalo} com nova validade ${newValidade}`, true);
      
      // 4. Limpar estados locais
      setShowDateInput(false);
      setNewValidade('');
      
      onUpdate();
    } catch (error) {
      console.error("Erro ao validar checklist:", error);
    }
  };

  const handleChecklistRealizadoNao = async (restricao: string) => {
    try {
      // Atualizar Firestore - Checklist Collection
      const checklists = await storageService.getChecklists();
      const existingChecklist = checklists.find(c => c.placa === item.cavalo);
      await storageService.saveChecklist({
        placa: item.cavalo,
        status: restricao,
        validade: existingChecklist?.validade || null,
        tipo: existingChecklist?.tipo || 'Cavalo',
        created_at: existingChecklist?.created_at || new Date().toISOString()
      });

      // Atualizar Firestore - EscalaItem
      await storageService.saveEscalaItem({
        ...item,
        checklist_status: restricao as any
      });
      
      onUpdate();
    } catch (error) {
      console.error("Erro ao aplicar restrição:", error);
    }
  };

  const handleDeleteItem = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Deseja apagar este veículo da escala?')) return;
    
    // ATUALIZAÇÃO OTIMISTA: Remove o veículo da tela na hora!
    onOptimisticRemove(item.id);
    
    const allItems = getStorage<EscalaItem[]>(STORAGE_KEYS.ESCALA, []);
    const updatedItems = allItems.filter(i => i.id !== item.id);
    setStorage(STORAGE_KEYS.ESCALA, updatedItems);
  };

  const handleArchiveItem = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Deseja arquivar este veículo para a escala semanal?')) return;
    
    const allItems = getStorage<EscalaItem[]>(STORAGE_KEYS.ESCALA, []);
    const updatedItems = allItems.map(i => i.id === item.id ? { ...i, saved: true } : i);
    setStorage(STORAGE_KEYS.ESCALA, updatedItems);
    onUpdate();
  };

  if (item.saved && activeTab === 'ativas') return null; // Don't show saved items in main list

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 10 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, scale: 0.95, filter: 'blur(4px)' }}
      transition={{ duration: 0.3, delay: index * 0.03 }}
      className="group bg-white/5 border border-white/10 hover:border-cyan-500/50 rounded-xl p-3 md:p-4 transition-all duration-500"
    >
      <div className="flex items-center justify-between cursor-pointer" onClick={onToggle}>
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Cavalo</span>
            <span className="font-mono text-base font-black text-white tracking-tighter">{item.cavalo}</span>
          </div>
          <div className="h-8 w-[1px] bg-white/10" />
          <div className="flex flex-col">
            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">COMPOSIÇÃO PARA BAÚ</span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-bold text-slate-300">{item.bau1}</span>
              {item.bau2 && (
                <>
                  <MoveRight size={10} className="text-cyan-500" />
                  <span className="font-mono text-xs font-bold text-slate-300">{item.bau2}</span>
                </>
              )}
              <span className="text-[9px] text-slate-500 font-bold ml-2 uppercase tracking-wider border-l border-white/10 pl-2">
                 {item.destino} • ESCALA {item.data_escala ? new Date(item.data_escala).toLocaleDateString('pt-BR') : ''}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
           <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[8px] font-black uppercase tracking-widest ${statusColors[item.checklist_status]}`}>
            {item.checklist_status === 'Checklist OK' && <CheckCircle size={10} />}
            {item.checklist_status === 'Checklist Vencido' && <AlertTriangle size={10} />}
            {item.checklist_status === 'Negativado' && <XCircle size={10} />}
            {item.checklist_status === 'Liberado para 1 viagem' && <Wrench size={10} />}
            <span className="hidden sm:inline">{item.checklist_status}</span>
            <span className="sm:hidden">{item.checklist_status.split(' ')[0]}</span>
          </div>
          
          {canEdit && (
            <button 
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-1.5 bg-cyan-500/10 text-cyan-500 rounded-lg hover:bg-cyan-500 hover:text-white transition-all"
              title="Editar Registro"
            >
              <Pencil size={14} />
            </button>
          )}

          {/* Action buttons removed from header as requested */}
          {isExpanded ? <ChevronDown size={14} className="text-slate-500 rotate-180 transition-transform" /> : <ChevronDown size={14} className="text-slate-500 transition-transform" />}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && canEdit && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden pt-6 mt-4 border-t border-white/5"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Veículo Atrelado option hidden as requested */}

              {activeTab === 'checklist_vencido' && item.checklist_realizado !== 'Sim' && (
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Checklist Realizado?</h4>
                  <div className="flex gap-2">
                    {!showDateInput ? (
                    <>
                    <button
                      onClick={() => setShowDateInput(true)}
                      className="flex-1 h-9 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all border bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500 hover:text-white"
                    >
                      Sim
                    </button>
                    <button
                      onClick={() => setChecklistResult('Negativado')}
                      className={`flex-1 h-9 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all border ${
                        checklistResult === 'Negativado'
                          ? 'bg-rose-500 text-white border-rose-500 shadow-lg shadow-rose-500/20' 
                          : 'bg-white/5 text-slate-500 border-white/10 hover:border-white/20'
                        }`}
                    >
                      Não
                    </button>
                    </>
                    ) : (
                      <div className="flex-1 space-y-2">
                        <div className="flex gap-2">
                          <input 
                            type="date" 
                            value={newValidade}
                            onChange={(e) => setNewValidade(e.target.value)}
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-2 py-1 text-[10px] text-white focus:outline-none focus:border-emerald-500"
                          />
                          <button
                            onClick={handleChecklistRealizadoSim}
                            className="px-3 h-9 rounded-xl border border-emerald-500 bg-emerald-500 text-white font-black text-[9px] uppercase tracking-widest"
                          >
                            Confirmar
                          </button>
                        </div>
                        <button 
                          onClick={() => setShowDateInput(false)}
                          className="w-full text-[8px] text-slate-500 uppercase font-bold text-center"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {checklistResult === 'Negativado' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="pt-2"
                    >
                      <label className="block text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                        Restrição Manual
                      </label>
                      <select
                        onChange={(e) => {
                           if (e.target.value) {
                             handleChecklistRealizadoNao(e.target.value);
                             setChecklistResult(null); // Fecha o dropdown após selecionar
                           }
                        }}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-rose-500 transition-colors"
                      >
                        <option value="" className="bg-slate-800 text-white">Selecione...</option>
                        <option value="Nenhuma" className="bg-slate-800 text-white">Nenhuma</option>
                        <option value="Manutenção" className="bg-slate-800 text-white">Manutenção</option>
                        <option value="Documentação" className="bg-slate-800 text-white">Documentação</option>
                        <option value="Negativado" className="bg-slate-800 text-white">Negativado</option>
                        <option value="Liberado para 1 viagem" className="bg-slate-800 text-white">Liberado para 1 viagem</option>
                      </select>
                    </motion.div>
                  )}
                </div>
              )}
            </div>

            {/* Edit button moved to header */}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

function ChecklistPage({ setPage, currentUser }: { setPage: (page: any) => void; currentUser: string }) {
  const canEdit = ['gr3c', 'jeff'].includes(currentUser);
  const [checklists, setChecklists] = useState<{ id: string; placa: string; status: string; validade: string | null; tipo: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedPlaca, setExpandedPlaca] = useState<string | null>(null);
  
  // Edit state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newStatus, setNewStatus] = useState('Checklist OK');
  const [newValidade, setNewValidade] = useState('');
  const [newTipo, setNewTipo] = useState('Cavalo');

  // Add form state
  const [addPlaca, setAddPlaca] = useState('');
  const [addValidade, setAddValidade] = useState('');
  const [addTipo, setAddTipo] = useState('Cavalo');

  useEffect(() => { 
    setLoading(true);
    const q = collection(db, 'checklists');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any;
      setChecklists(data);
      setLoading(false);
    }, (error) => {
      console.error('Failed to fetch checklists:', error);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  const fetchChecklists = () => {
     // Stub to satisfy other functions calling it, now handled by onSnapshot
  };

  const handleAddVehicle = async (e: FormEvent) => {
    e.preventDefault();
    const placaUpper = addPlaca.toUpperCase().trim();
    
    try {
      setLoading(true);
      const currentList = await storageService.getChecklists();

      if (currentList.some(item => item.placa === placaUpper)) {
        alert('Esta placa já está registrada no sistema.');
        return;
      }

      const newItem = { 
        placa: placaUpper, 
        status: 'Checklist OK', 
        validade: addValidade || null, 
        tipo: addTipo,
        created_at: new Date().toISOString()
      };

      await storageService.saveChecklist(newItem);
      await storageService.addNotification(`Novo checklist realizado: ${placaUpper}`, 'success');
      fetchChecklists();
      setAddPlaca('');
      setAddValidade('');
      setShowAddForm(false);
    } catch (error) {
      console.error('Failed to add vehicle to checklist:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (index: number) => {
    try {
      setLoading(true);
      const currentList = await storageService.getChecklists();
      const target = currentList[index];
      if (target) {
        const updated = { 
          ...target, 
          status: newStatus, 
          validade: newValidade || null, 
          tipo: newTipo 
        };
        await storageService.saveChecklist(updated);
        await storageService.addNotification(`Checklist atualizado para placa ${updated.placa}`, 'info');
        fetchChecklists();
      }
      setEditingIndex(null);
    } catch (error) {
      console.error('Failed to update checklist:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVehicle = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja remover este veículo? Esta ação não pode ser desfeita.')) return;
    
    try {
      setLoading(true);
      // ATUALIZAÇÃO OTIMISTA: Remove da tela na hora!
      setChecklists(prev => prev.filter(c => c.id !== id));
      await deleteDoc(doc(db, 'checklists', id));
    } catch (error) {
      console.error('Failed to delete checklist:', error);
      fetchChecklists(); // Revert optimistic update
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string, validade: string | null) => {
    const now = new Date();
    if (status === 'Negativado') return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
    if (status === 'Liberado para 1 viagem') return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
    if (validade && new Date(validade) < now) return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
    if (status === 'Checklist OK') return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
  };

  const getEffectiveStatus = (status: string, validade: string | null) => {
    const now = new Date();
    if (status === 'Negativado') return 'Negativado';
    if (status === 'Liberado para 1 viagem') return 'Liberado para 1 viagem';
    if (validade && new Date(validade) < now) return 'Checklist Vencido';
    return status;
  };

  return (
    <div className="p-4 md:p-8 space-y-6 flex-1 overflow-y-auto bg-coffee-dark">
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2 text-coffee-red font-black text-[8px] uppercase tracking-[0.4em] mb-1">
            <CheckCircle size={10} />
            <span>Controle de Vistorias</span>
          </div>
          <h1 translate="no" className="text-2xl font-black text-white tracking-tighter uppercase">Checklists</h1>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setPage('dashboard')}
            className="h-9 px-4 bg-white/5 text-slate-400 hover:text-white rounded-xl flex items-center gap-2 font-black text-[9px] uppercase tracking-widest transition-all"
          >
            <Home size={14} /> <span className="hidden sm:inline">Início</span>
          </button>
          {canEdit && (
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowAddForm(!showAddForm)}
              className="h-9 px-4 bg-coffee-red text-white rounded-xl flex items-center gap-2 font-black text-[9px] uppercase tracking-widest shadow-xl shadow-coffee-red/20"
            >
              {showAddForm ? <X size={16} /> : <Plus size={16} />}
              {showAddForm ? 'Cancelar' : 'Nova'}
            </motion.button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showAddForm && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <form onSubmit={handleAddVehicle} className="bg-white/5 border border-white/10 p-6 rounded-2xl grid grid-cols-1 md:grid-cols-4 gap-4 items-end mb-6">
              <InputField label="Placa" value={addPlaca} onChange={setAddPlaca} placeholder="ABC-1234" />
              <SelectField label="Tipo" value={addTipo} onChange={(e) => setAddTipo(e.target.value)} options={['Cavalo', 'Bau']} />
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Validade</label>
                <input type="date" value={addValidade} onChange={e => setAddValidade(e.target.value)} className="h-10 px-4 bg-slate-900/50 border border-slate-300/20 rounded-xl text-white font-bold text-xs outline-none" />
              </div>
              <button type="submit" className="h-10 bg-coffee-red text-white rounded-xl font-black uppercase tracking-widest text-[10px]">Salvar</button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading ? (
          <div className="col-span-full text-center py-12 text-slate-500 text-xs">Carregando...</div>
        ) : checklists.length === 0 ? (
          <div className="col-span-full text-center py-12 text-slate-500 text-xs border border-dashed border-white/10 rounded-2xl">Nenhum registro.</div>
        ) : (
          checklists.map((c, idx) => (
            <motion.div 
              key={`${c.placa}-${idx}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.02 }}
              className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:border-coffee-red/30 transition-all group"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">{c.tipo}</span>
                  <span className="text-lg font-black text-white font-mono tracking-tighter">{c.placa}</span>
                </div>
                <div className="flex gap-1">
                  {canEdit && (
                    <>
                      <button onClick={() => {
                        setEditingIndex(idx);
                        setNewStatus(c.status);
                        setNewValidade(c.validade ? c.validade.split('T')[0] : '');
                        setNewTipo(c.tipo);
                      }} className="p-1.5 bg-white/5 rounded-lg text-slate-500 hover:text-white transition-colors" title="Editar">
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => handleDeleteVehicle(c.id)} className="p-1.5 bg-white/5 rounded-lg text-red-500 hover:bg-red-500/20 transition-colors" title="Excluir">
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {editingIndex === idx ? (
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <SelectField 
                    label="Status Automático" 
                    value={(newValidade && new Date(newValidade) < new Date()) ? 'Checklist Vencido' : 'Checklist OK'} 
                    onChange={() => {}} 
                    options={['Checklist OK', 'Checklist Vencido']}
                    disabled={true}
                  />
                  <SelectField 
                    label="Restrição Manual" 
                    value={['Negativado', 'Liberado para 1 viagem'].includes(newStatus) ? newStatus : 'Nenhuma'} 
                    onChange={(e) => setNewStatus(e.target.value === 'Nenhuma' ? 'Checklist OK' : e.target.value)} 
                    options={['Nenhuma', 'Negativado', 'Liberado para 1 viagem']} 
                  />
                  <div className="flex flex-col gap-1">
                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Validade</label>
                    <input type="date" value={newValidade} onChange={e => setNewValidade(e.target.value)} className="h-8 px-2 bg-slate-900/50 border border-slate-300/20 rounded-lg text-white font-bold text-[10px] outline-none" />
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => handleUpdate(idx)} className="flex-1 h-8 bg-emerald-500/20 text-emerald-500 rounded-lg font-black text-[9px] uppercase">OK</button>
                    <button onClick={() => setEditingIndex(null)} className="h-8 px-2 bg-white/5 text-slate-500 rounded-lg font-black text-[9px] uppercase">X</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between mt-2">
                  <div className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest border ${getStatusColor(c.status, c.validade)}`}>
                    {getEffectiveStatus(c.status, c.validade)}
                  </div>
                  <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">
                    {c.validade ? new Date(c.validade).toLocaleDateString('pt-BR') : 'S/ DATA'}
                  </span>
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}

const RecebimentoItem = ({ item, activeTab, onUpdate }: { item: EscalaItem; activeTab: string; onUpdate: (id: number, field: string, value: string) => void }) => {
  const [localNF, setLocalNF] = useState(item.nota_fiscal || '');
  const [isSaving, setIsSaving] = useState(false);

  // Sync local state if item changes externally
  useEffect(() => {
    setLocalNF(item.nota_fiscal || '');
  }, [item.nota_fiscal]);

  const handleSaveNF = () => {
    if (localNF === item.nota_fiscal) return;
    setIsSaving(true);
    onUpdate(item.id, 'nota_fiscal', localNF);
    setTimeout(() => setIsSaving(false), 500);
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-4"
    >
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex flex-col">
          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Veículo</span>
          <span className="font-mono text-lg font-black text-white tracking-tighter">{item.cavalo}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Status Descarga</span>
          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${item.bau1_final_status === 'Veículo Descarregado' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
            {item.bau1_final_status === 'Veículo Descarregado' ? 'Descarregado' : 'Em Processo'}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">
            {activeTab === 'aguardando' ? 'Nota Fiscal' : activeTab === 'recebido' ? 'Notas Fiscais Recebidas e Conferidas' : 'Notas Fiscais Pendentes de Recebimentos'}
          </label>
          <div className="relative flex gap-2">
            <input 
              type="text"
              value={localNF}
              onChange={(e) => setLocalNF(e.target.value)}
              onBlur={handleSaveNF}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveNF()}
              placeholder="Digite o número da NF..."
              className="flex-1 h-9 bg-white/5 border border-white/10 rounded-lg px-3 text-white text-xs font-medium focus:outline-none focus:border-coffee-red/50"
            />
            {localNF !== (item.nota_fiscal || '') && (
              <button 
                onClick={handleSaveNF}
                className="h-9 px-3 bg-emerald-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 animate-pulse"
              >
                {isSaving ? '...' : 'Salvar'}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest block mb-1">
              {activeTab === 'aguardando' ? 'DANFE Ok?' : 'Entregue Recebedoria?'}
            </label>
            <select 
              value={activeTab === 'aguardando' ? (item.danfe_ok || '') : (item.entregue_recebedoria || '')}
              onChange={(e) => onUpdate(item.id, activeTab === 'aguardando' ? 'danfe_ok' : 'entregue_recebedoria', e.target.value)}
              className="w-full h-9 bg-slate-800 border border-white/10 rounded-lg px-2 text-white text-[10px] font-bold uppercase tracking-widest focus:outline-none focus:border-coffee-red/50 appearance-none cursor-pointer"
            >
              <option value="" className="bg-slate-900">Selecione</option>
              <option value="Sim" className="bg-slate-900">Sim</option>
              <option value="Não" className="bg-slate-900">Não</option>
            </select>
          </div>
          
          <div className="flex items-end">
            {activeTab === 'aguardando' ? (
              <div className="flex gap-1 w-full">
                <button 
                  onClick={() => onUpdate(item.id, 'recebimento_status', 'Recebido')}
                  className="flex-1 h-9 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all"
                >
                  Receber
                </button>
                <button 
                  onClick={() => onUpdate(item.id, 'recebimento_status', 'Pendente')}
                  className="flex-1 h-9 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-amber-500 hover:text-white transition-all"
                >
                  Pendente
                </button>
              </div>
            ) : (
              <button 
                onClick={() => onUpdate(item.id, 'recebimento_status', 'Aguardando')}
                className="w-full h-9 bg-white/5 text-slate-500 border border-white/10 rounded-lg text-[8px] font-black uppercase tracking-widest hover:text-white transition-all"
              >
                Voltar
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

function RecebimentoPage({ setPage, currentUser }: { setPage: (page: any) => void; currentUser: string }) {
  const [activeTab, setActiveTab] = useState<'aguardando' | 'recebido' | 'pendente'>('aguardando');
  const [items, setItems] = useState<EscalaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchItems = async () => {
    setLoading(true);
    try {
      const allItems = await storageService.getEscalaItems();
      
      let filtered = allItems;
      if (activeTab === 'aguardando') {
        filtered = allItems.filter(item => 
          (item.bau1_yard_status === 'Carregado com Produto' || (item.bau2 && item.bau2_yard_status === 'Carregado com Produto')) &&
          (!item.recebimento_status || item.recebimento_status === 'Aguardando')
        );
      } else if (activeTab === 'recebido') {
        filtered = allItems.filter(item => item.recebimento_status === 'Recebido');
      } else if (activeTab === 'pendente') {
        filtered = allItems.filter(item => item.recebimento_status === 'Pendente');
      }

      setItems(filtered.sort((a, b) => b.id - a.id));
    } catch (error) {
      console.error('Failed to fetch items for recebimento:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchItems(); }, [activeTab]);

  const handleUpdate = async (id: number, field: string, value: string) => {
    try {
      setLoading(true);
      const allItems = await storageService.getEscalaItems();
      const item = allItems.find(i => i.id === id);
      if (item) {
        const updated = { ...item, [field]: value };
        await storageService.saveEscalaItem(updated);
        fetchItems();
      }
    } catch (error) {
      console.error('Failed to update item in recebimento:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = items.filter(item => 
    item.cavalo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.bau1.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.bau2 && item.bau2.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="p-4 md:p-8 space-y-6 flex-1 overflow-y-auto bg-coffee-dark">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/5 pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2 text-coffee-red font-black text-[8px] uppercase tracking-[0.4em] mb-1">
            <FileText size={10} />
            <span>Processamento de NF</span>
          </div>
          <h1 translate="no" className="text-2xl font-black text-white tracking-tighter uppercase">Recebimento</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              type="text" 
              placeholder="Pesquisar..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-9 pl-9 pr-4 bg-white/5 border border-white/10 rounded-xl text-white text-xs font-medium focus:outline-none focus:border-coffee-red/50 transition-colors w-full md:w-64"
            />
          </div>
          <button 
            onClick={() => setPage('dashboard')}
            className="h-9 px-4 bg-white/5 text-slate-400 hover:text-white rounded-xl flex items-center gap-2 font-black text-[9px] uppercase tracking-widest transition-all"
          >
            <Home size={14} /> <span className="hidden sm:inline">Início</span>
          </button>
        </div>
      </div>

      <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 w-fit">
        <button 
          onClick={() => setActiveTab('aguardando')}
          className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'aguardando' ? 'bg-coffee-red text-white' : 'text-slate-500 hover:text-white'}`}
        >
          Aguardando Descarga
        </button>
        <button 
          onClick={() => setActiveTab('recebido')}
          className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'recebido' ? 'bg-coffee-red text-white' : 'text-slate-500 hover:text-white'}`}
        >
          Recebidas e Conferidas
        </button>
        <button 
          onClick={() => setActiveTab('pendente')}
          className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'pendente' ? 'bg-coffee-red text-white' : 'text-slate-500 hover:text-white'}`}
        >
          Pendentes
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full h-48 flex flex-col items-center justify-center gap-4 bg-white/5 rounded-[2rem] border border-white/10">
            <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-cyan-500 font-black text-[9px] uppercase tracking-widest animate-pulse">Sincronizando...</span>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="col-span-full h-48 flex flex-col items-center justify-center gap-4 bg-white/5 rounded-[2rem] border border-white/10 border-dashed">
            <FileText size={40} className="text-white/10" />
            <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Nenhum registro encontrado.</p>
          </div>
        ) : (
          filteredItems.map(item => (
            <RecebimentoItem 
              key={item.id} 
              item={item} 
              activeTab={activeTab} 
              onUpdate={handleUpdate} 
            />
          ))
        )}
      </div>
    </div>
  );
}

function DocasPage({ setPage, currentUser }: { setPage: (page: any) => void; currentUser: string }) {
  const canEdit = ['3clog', 'jeff'].includes(currentUser);
  const [docasItems, setDocasItems] = useState<any[]>([]);
  const [allItems, setAllItems] = useState<EscalaItem[]>([]);
  const [finishedVehicles, setFinishedVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'expedicao' | 'stage' | 'finalizados'>('expedicao');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const docaOptions = Array.from({ length: 12 }, (_, i) => `Doca ${i + 4}`);

  const occupiedDocks = useMemo(() => {
    const occupied = new Map<string, { action: string, plate: string, type: 'expedicao' | 'stage' }>();
    allItems.forEach(item => {
      if (item.bau1_doca_number && !['Veículo Descarregado', 'Veículo Finalizado'].includes(item.bau1_final_status)) {
        const type = (item.bau1_yard_status === 'Vazio') ? 'expedicao' : 'stage';
        occupied.set(item.bau1_doca_number, { action: item.bau1_doca_action, plate: item.cavalo, type });
      }
      if (item.bau2 && item.bau2_doca_number && !['Veículo Descarregado', 'Veículo Finalizado'].includes(item.bau2_final_status)) {
        const type = (item.bau2_yard_status === 'Vazio') ? 'expedicao' : 'stage';
        occupied.set(item.bau2_doca_number, { action: item.bau2_doca_action, plate: item.cavalo, type });
      }
    });
    return occupied;
  }, [allItems]);

  const getDockColor = (type: 'expedicao' | 'stage') => {
    if (type === 'expedicao') return 'bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-500/20';
    if (type === 'stage') return 'bg-amber-500 text-white border-amber-400 shadow-lg shadow-amber-500/20';
    return 'bg-slate-800 text-slate-500 border-slate-700';
  };

  const toggleExpand = (id: number) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const fetchDocas = () => {
    setLoading(true);
    const unsubscribe = storageService.subscribeToDocas(async (allItems) => {
      try {
        const groups = await storageService.getScaleGroups();
        setAllItems(allItems);
        
        const openGroupIds = groups.filter(g => g.status === 'Open').map(g => g.id);
        const relevantStatuses = ['Carregado com Produto', 'Vazio', 'Carregado com Paletes'];
        
        const docasItems = allItems.filter(item => {
            if (!openGroupIds.includes(item.scale_group_id)) return false;
            
            // Se o checklist foi reprovado, não mostrar na expedição
            if (item.checklist_status === 'Negativado') return false;

            // Se o veículo já foi finalizado ou descarregado em ambos os baús (ou no único baú), não mostrar
            const bau1Finished = item.bau1_final_status === 'Veículo Descarregado' || item.bau1_final_status === 'Veículo Finalizado';
            const bau2Finished = item.bau2 ? (item.bau2_final_status === 'Veículo Descarregado' || item.bau2_final_status === 'Veículo Finalizado') : true;
            
            if (bau1Finished && bau2Finished) return false;

            const hasBau1 = item.bau1_yard_status && relevantStatuses.includes(item.bau1_yard_status);
            const hasBau2 = item.bau2 && item.bau2_yard_status && relevantStatuses.includes(item.bau2_yard_status);
            return hasBau1 || hasBau2;
        }).sort((a, b) => b.id - a.id);
        
        setDocasItems(docasItems);

        // Finished Vehicles
        const finished = allItems.filter(item => {
            const bau1Finished = item.bau1_final_status === 'Veículo Descarregado' || item.bau1_final_status === 'Veículo Finalizado';
            const bau2Finished = item.bau2 ? (item.bau2_final_status === 'Veículo Descarregado' || item.bau2_final_status === 'Veículo Finalizado') : true;
            return bau1Finished && bau2Finished;
        }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setFinishedVehicles(finished);
      } catch (error) {
        console.error('Error in onSnapshot:', error);
      } finally {
        setLoading(false);
      }
    });                
    return unsubscribe;
  };

  useEffect(() => {
    const unsubscribe = fetchDocas();
    return () => unsubscribe();
  }, []);

  const handleUpdateDoca = async (id: number, field: string, value: string) => {
    try {
      setLoading(true);
      const allItems = await storageService.getEscalaItems();
      
      // Validação de Doca Ocupada
      if (field.endsWith('_doca_number') && value !== '') {
        const isOccupied = allItems.some(item => {
          const bau1Match = item.bau1_doca_number === value && 
            !['Veículo Descarregado', 'Veículo Finalizado'].includes(item.bau1_final_status) &&
            !(item.id === id && field === 'bau1_doca_number');
            
          const bau2Match = item.bau2 && item.bau2_doca_number === value && 
            !['Veículo Descarregado', 'Veículo Finalizado'].includes(item.bau2_final_status) &&
            !(item.id === id && field === 'bau2_doca_number');
            
          return bau1Match || bau2Match;
        });

        if (isOccupied) {
          alert(`A ${value} já está ocupada por outro veículo!`);
          return;
        }
      }

      let isFullyFinished = false;
      let targetItem = allItems.find(i => i.id === id);
      if (!targetItem) return;

      let newItem = { ...targetItem, [field]: value };
      
      // Logic for "Stage" -> "Expedição"
      if (viewMode === 'stage' && field.endsWith('_final_status') && value === 'Veículo Descarregado') {
        const bauPrefix = field.split('_')[0]; // bau1 or bau2
        newItem = {
          ...newItem,
          [`${bauPrefix}_yard_status`]: 'Vazio',
          [`${bauPrefix}_final_status`]: '',
          [`${bauPrefix}_doca_action`]: '',
          [`${bauPrefix}_doca_number`]: ''
        };
      }

      // Logic for "Expedição" -> "Stage"
      if (viewMode === 'expedicao' && field.endsWith('_final_status') && value === 'Precisa Descarregar') {
        const bauPrefix = field.split('_')[0]; // bau1 or bau2
        newItem = {
          ...newItem,
          [`${bauPrefix}_yard_status`]: 'Carregado com Produto',
          [`${bauPrefix}_final_status`]: '',
          [`${bauPrefix}_doca_action`]: 'Descarregar',
          [`${bauPrefix}_doca_number`]: ''
        };

        // Reopen scale group
        const groups = await storageService.getScaleGroups();
        const group = groups.find(g => g.id === targetItem!.scale_group_id);
        if (group) {
          await storageService.saveScaleGroup({ ...group, status: 'Open' });
        }
      }

      const bau1Fin = newItem.bau1_final_status === 'Veículo Descarregado' || newItem.bau1_final_status === 'Veículo Finalizado';
      const bau2Fin = newItem.bau2 ? (newItem.bau2_final_status === 'Veículo Descarregado' || newItem.bau2_final_status === 'Veículo Finalizado') : true;
      
      if (bau1Fin && bau2Fin) {
        isFullyFinished = true;
      }

      await storageService.saveEscalaItem(newItem);
      
      if (isFullyFinished) {
        addNotification('success', `Veículo ${id} finalizado e movido para Histórico`);
        alert('Veículo finalizado com sucesso! Ele foi movido para o Histórico.');

        // Check if all items in the scale group are finished
        const updatedItems = await storageService.getEscalaItems();
        const scaleGroupId = targetItem.scale_group_id;
        const allScaleItems = updatedItems.filter(i => i.scale_group_id === scaleGroupId);
        const allFinished = allScaleItems.every(i => {
          const b1F = i.bau1_final_status === 'Veículo Descarregado' || i.bau1_final_status === 'Veículo Finalizado';
          const b2F = i.bau2 ? (i.bau2_final_status === 'Veículo Descarregado' || i.bau2_final_status === 'Veículo Finalizado') : true;
          return b1F && b2F;
        });

        if (allFinished) {
          const groups = await storageService.getScaleGroups();
          const group = groups.find(g => g.id === scaleGroupId);
          if (group) {
            await storageService.saveScaleGroup({ ...group, status: 'Archived' });
            addNotification('info', `Escala de ${new Date(allScaleItems[0].data_escala || '').toLocaleDateString('pt-BR')} arquivada automaticamente.`);
          }
        }
      } else {
        if (field.includes('doca_number')) {
          addNotification('neutral', `Veículo ${newItem.cavalo} atribuído à Doca ${value}`);
        }
      }
      
      fetchDocas();
    } catch (error) {
      console.error('Failed to update doca status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSetToStage = async (id: number) => {
    try {
      setLoading(true);
      const allItems = await storageService.getEscalaItems();
      let scaleGroupId: number | null = null;
      
      const targetItem = allItems.find(item => item.id === id);
      if (targetItem) {
        scaleGroupId = targetItem.scale_group_id;
        const updatedItem = {
          ...targetItem,
          bau1_yard_status: 'Carregado com Produto',
          bau1_final_status: '',
          bau1_doca_action: 'Descarregar',
          bau1_doca_number: '',
          bau2_yard_status: targetItem.bau2 ? 'Carregado com Produto' : '',
          bau2_final_status: targetItem.bau2 ? '' : '',
          bau2_doca_action: targetItem.bau2 ? 'Descarregar' : '',
          bau2_doca_number: targetItem.bau2 ? '' : ''
        };
        await storageService.saveEscalaItem(updatedItem);
      }
      
      if (scaleGroupId !== null) {
        const groups = await storageService.getScaleGroups();
        const group = groups.find(g => g.id === scaleGroupId);
        if (group) {
          await storageService.saveScaleGroup({ ...group, status: 'Open' });
        }
      }
      
      fetchDocas();
    } catch (error) {
      console.error('Failed to set vehicle to stage:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromDocas = async (id: number) => {
    if (!window.confirm('Deseja remover este veículo das docas?')) return;
    
    try {
      setLoading(true);
      const allItems = await storageService.getEscalaItems();
      const targetItem = allItems.find(i => i.id === id);
      if (targetItem) {
        const updatedItem = {
          ...targetItem,
          bau1_yard_status: '', 
          bau2_yard_status: '',
          bau1_doca_action: '',
          bau1_doca_number: '',
          bau1_final_status: '',
          bau2_doca_action: '',
          bau2_doca_number: '',
          bau2_final_status: ''
        };
        await storageService.saveEscalaItem(updatedItem);
        fetchDocas();
      }
    } catch (error) {
      console.error('Failed to remove vehicle from docas:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-3 md:p-8 space-y-4 md:space-y-6 flex-1 overflow-y-auto bg-coffee-dark">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-white/5 pb-4 gap-4">
        <div className="flex items-center justify-between w-full lg:w-auto">
          <div>
            <div className="flex items-center gap-2 text-coffee-red font-black text-[8px] uppercase tracking-[0.4em] mb-1">
              <Shield size={10} />
              <span>Monitoramento Ativo</span>
            </div>
            <h1 translate="no" className="text-xl md:text-2xl font-black text-white tracking-tighter uppercase">Docas</h1>
          </div>
          <button 
            onClick={() => setPage('dashboard')}
            className="lg:hidden h-9 px-4 bg-white/5 text-slate-400 hover:text-white rounded-xl flex items-center gap-2 font-black text-[9px] uppercase tracking-widest transition-all"
          >
            <Home size={14} />
          </button>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 overflow-x-auto no-scrollbar">
            <button 
              onClick={() => setViewMode('expedicao')}
              className={`flex-1 sm:flex-none px-3 md:px-4 py-2 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${viewMode === 'expedicao' ? 'bg-coffee-red text-white shadow-lg shadow-coffee-red/20' : 'text-slate-500 hover:text-white'}`}
            >
              Expedição
            </button>
            <button 
              onClick={() => setViewMode('stage')}
              className={`flex-1 sm:flex-none px-3 md:px-4 py-2 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${viewMode === 'stage' ? 'bg-coffee-red text-white shadow-lg shadow-coffee-red/20' : 'text-slate-500 hover:text-white'}`}
            >
              Stage
            </button>
            <button 
              onClick={() => setViewMode('finalizados')}
              className={`flex-1 sm:flex-none px-3 md:px-4 py-2 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${viewMode === 'finalizados' ? 'bg-coffee-red text-white shadow-lg shadow-coffee-red/20' : 'text-slate-500 hover:text-white'}`}
            >
              Finalizados
            </button>
          </div>
          <button 
            onClick={() => setPage('dashboard')}
            className="hidden lg:flex h-9 px-4 bg-white/5 text-slate-400 hover:text-white rounded-xl items-center gap-2 font-black text-[9px] uppercase tracking-widest transition-all"
          >
            <Home size={14} /> <span>Início</span>
          </button>
        </div>
      </div>

      <div className={viewMode === 'finalizados' ? 'flex flex-col gap-4' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6'}>
        {/* Real-time Dock Status Notification */}
        {viewMode !== 'finalizados' && (
          <div className="col-span-full bg-white/5 border border-white/10 rounded-2xl p-4 overflow-x-auto">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Activity size={12} /> Status das Docas (Tempo Real)
            </h3>
            <div className="flex gap-2 min-w-max">
              {docaOptions.map(doca => {
                const info = occupiedDocks.get(doca);
                const isOccupied = !!info;
                const colorClass = isOccupied ? getDockColor(info.type) : 'bg-white/5 text-slate-600 border-white/5';
                
                return (
                  <div key={doca} className={`flex flex-col items-center justify-center w-24 h-20 rounded-xl border ${colorClass} transition-all relative overflow-hidden`}>
                    <span className="text-[9px] font-black uppercase tracking-widest mb-1">{doca}</span>
                    {isOccupied ? (
                      <>
                        <span className="text-xs font-bold font-mono">{info.plate}</span>
                        <span className="text-[7px] font-black uppercase tracking-wider opacity-80 mt-1">{info.action}</span>
                        <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-white animate-pulse m-1.5" />
                      </>
                    ) : (
                      <span className="text-[8px] font-medium opacity-50">Livre</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {loading ? (
          <div className="col-span-full h-48 flex flex-col items-center justify-center gap-4 bg-white/5 rounded-[2rem] border border-white/10">
            <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-cyan-500 font-black text-[9px] uppercase tracking-widest animate-pulse">Sincronizando Docas...</span>
          </div>
        ) : viewMode === 'finalizados' ? (
          finishedVehicles.length === 0 ? (
            <div className="col-span-full h-48 flex flex-col items-center justify-center gap-4 bg-white/5 rounded-[2rem] border border-white/10 border-dashed">
              <Truck size={40} className="text-white/10" />
              <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Nenhum veículo finalizado ainda.</p>
            </div>
          ) : (
            finishedVehicles.map(item => (
              <div key={item.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Cavalo</span>
                    <span className="font-mono text-lg font-black text-white tracking-tighter">{item.cavalo}</span>
                    <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider mt-1">{new Date(item.data_escala || '').toLocaleDateString('pt-BR')}</span>
                  </div>
                  <div className="h-8 w-[1px] bg-white/10" />
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">COMPOSIÇÃO PARA BAÚ</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-300">{item.bau1}</span>
                      {item.bau2 && (
                        <>
                          <MoveRight size={10} className="text-coffee-red" />
                          <span className="font-mono text-xs font-bold text-slate-300">{item.bau2}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="h-8 w-[1px] bg-white/10 hidden sm:block" />
                  <div className="flex flex-col hidden sm:flex">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Finalizado em</span>
                    <span className="text-[10px] font-bold text-white uppercase tracking-widest">{new Date(item.created_at).toLocaleString('pt-BR')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => handleSetToStage(item.id)}
                    className="h-8 px-3 bg-coffee-red/10 text-coffee-red border border-coffee-red/20 rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-coffee-red hover:text-white transition-all"
                  >
                    Precisa Descarregar
                  </button>
                  <span className="bg-emerald-500/10 text-emerald-500 text-[8px] font-black px-3 py-1 rounded-lg uppercase tracking-widest border border-emerald-500/20">Finalizado</span>
                </div>
              </div>
            ))
          )
        ) : docasItems.filter(item => {
          if (viewMode === 'expedicao') {
            return item.bau1_yard_status === 'Vazio' || item.bau2_yard_status === 'Vazio';
          } else {
            const loadedStatuses = ['Carregado com Produto', 'Carregado com Paletes'];
            return loadedStatuses.includes(item.bau1_yard_status) || (item.bau2 && loadedStatuses.includes(item.bau2_yard_status));
          }
        }).length === 0 ? (
          <div className="col-span-full h-48 flex flex-col items-center justify-center gap-4 bg-white/5 rounded-[2rem] border border-white/10 border-dashed">
            <Shield size={40} className="text-white/10" />
            <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">
              Nenhum veículo em {viewMode === 'expedicao' ? 'Expedição' : 'Stage'}.
            </p>
          </div>
        ) : (
          docasItems.filter(item => {
            if (viewMode === 'expedicao') {
              return item.bau1_yard_status === 'Vazio' || item.bau2_yard_status === 'Vazio';
            } else {
              const loadedStatuses = ['Carregado com Produto', 'Carregado com Paletes'];
              return loadedStatuses.includes(item.bau1_yard_status) || (item.bau2 && loadedStatuses.includes(item.bau2_yard_status));
            }
          }).map(item => {
            const isExpanded = expandedId === item.id;
            return (
              <div key={item.id} className={`bg-white/5 border border-white/10 rounded-2xl p-4 md:p-5 flex flex-col gap-4 relative hover:border-coffee-red/30 transition-all ${!isExpanded ? 'pb-4' : ''}`}>
                <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
                  <button 
                    onClick={() => toggleExpand(item.id)}
                    className="text-slate-500 hover:text-white transition-colors p-1.5 hover:bg-white/5 rounded-lg"
                    title={isExpanded ? "Minimizar" : "Expandir"}
                  >
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                  {canEdit && (
                    <button 
                      onClick={() => handleRemoveFromDocas(item.id)}
                      className="text-slate-500 hover:text-rose-500 transition-colors p-1.5 hover:bg-rose-500/10 rounded-lg"
                      title="Remover das Docas"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                
                <div className="flex items-start justify-between">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Truck size={14} className="text-coffee-red" />
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Veículo</span>
                    </div>
                    <span className="font-mono text-xl md:text-2xl font-black text-white tracking-tighter">{item.cavalo}</span>
                    <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">{new Date(item.data_escala || '').toLocaleDateString('pt-BR')}</span>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                        {item.bau1}
                      </span>
                      {item.bau2 && (
                        <>
                          <MoveRight size={10} className="text-slate-600" />
                          <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                            {item.bau2}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="grid grid-cols-1 gap-3 pt-3 border-t border-white/5">
                    {/* MAIS PESADO Section */}
                    {((viewMode === 'expedicao' && item.bau1_yard_status === 'Vazio') || 
                      (viewMode === 'stage' && ['Carregado com Produto', 'Carregado com Paletes'].includes(item.bau1_yard_status))) && (
                      <div className="bg-slate-900/30 rounded-xl p-3 border border-white/5 space-y-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">MAIS PESADO ({item.bau1})</span>
                          <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 ${item.bau1_yard_status === 'Vazio' ? 'text-emerald-500' : 'text-amber-500'}`}>
                            {item.bau1_yard_status}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <SelectField 
                            label="Doca"
                            value={item.bau1_doca_number || ''}
                            onChange={(e) => handleUpdateDoca(item.id, 'bau1_doca_number', e.target.value)}
                            options={docaOptions.filter(d => !occupiedDocks.has(d) || d === item.bau1_doca_number)}
                            placeholder="Doca..."
                            disabled={!canEdit}
                          />
                          <SelectField 
                            label="Operação"
                            value={viewMode === 'stage' ? 'Descarregar' : (item.bau1_doca_action || '')}
                            onChange={(e) => handleUpdateDoca(item.id, 'bau1_doca_action', e.target.value)}
                            options={viewMode === 'stage' ? ['Descarregar'] : ((item.checklist_status === 'Checklist Vencido' || item.checklist_status === 'Negativado' || item.checklist_status === 'Liberado para 1 viagem') ? ['Descarregar'] : ['Mais Pesado', 'Mais Leve'])}
                            placeholder="Ação..."
                            disabled={!canEdit || viewMode === 'stage'}
                          />
                        </div>
                        <SelectField 
                          label="Status Final"
                          value={item.bau1_final_status || ''}
                          onChange={(e) => handleUpdateDoca(item.id, 'bau1_final_status', e.target.value)}
                          options={viewMode === 'expedicao' 
                            ? ['Em Doca', 'Na Balança', 'Aguardando', 'Precisa Descarregar', 'Veículo Finalizado']
                            : ['Em Doca', 'Na Balança', 'Aguardando', 'Veículo Descarregado']
                          }
                          placeholder="Atualizar Status..."
                          disabled={!canEdit}
                        />
                      </div>
                    )}

                    {/* MAIS LEVE Section */}
                    {item.bau2 && ((viewMode === 'expedicao' && item.bau2_yard_status === 'Vazio') || 
                      (viewMode === 'stage' && ['Carregado com Produto', 'Carregado com Paletes'].includes(item.bau2_yard_status))) && (
                      <div className="bg-slate-900/30 rounded-xl p-3 border border-white/5 space-y-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">MAIS LEVE ({item.bau2})</span>
                          <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 ${item.bau2_yard_status === 'Vazio' ? 'text-emerald-500' : 'text-amber-500'}`}>
                            {item.bau2_yard_status}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <SelectField 
                            label="Doca"
                            value={item.bau2_doca_number || ''}
                            onChange={(e) => handleUpdateDoca(item.id, 'bau2_doca_number', e.target.value)}
                            options={docaOptions.filter(d => !occupiedDocks.has(d) || d === item.bau2_doca_number)}
                            placeholder="Doca..."
                            disabled={!canEdit}
                          />
                          <SelectField 
                            label="Operação"
                            value={viewMode === 'stage' ? 'Descarregar' : (item.bau2_doca_action || '')}
                            onChange={(e) => handleUpdateDoca(item.id, 'bau2_doca_action', e.target.value)}
                            options={viewMode === 'stage' ? ['Descarregar'] : ((item.checklist_status === 'Checklist Vencido' || item.checklist_status === 'Negativado' || item.checklist_status === 'Liberado para 1 viagem') ? ['Descarregar'] : ['Mais Pesado', 'Mais Leve'])}
                            placeholder="Ação..."
                            disabled={!canEdit || viewMode === 'stage'}
                          />
                        </div>
                        <SelectField 
                          label="Status Final"
                          value={item.bau2_final_status || ''}
                          onChange={(e) => handleUpdateDoca(item.id, 'bau2_final_status', e.target.value)}
                          options={viewMode === 'expedicao' 
                            ? ['Em Doca', 'Na Balança', 'Aguardando', 'Precisa Descarregar', 'Veículo Finalizado']
                            : ['Em Doca', 'Na Balança', 'Aguardando', 'Veículo Descarregado']
                          }
                          placeholder="Atualizar Status..."
                          disabled={!canEdit}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          }))}
      </div>
    </div>
  );
}