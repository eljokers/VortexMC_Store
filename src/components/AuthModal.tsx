import React, { useState, useEffect } from 'react';
import { 
  X, LogIn, UserPlus, LogOut, CheckCircle2, AlertCircle, 
  Sparkles, ShoppingBag, ShieldCheck, Mail, Lock, User, 
  RefreshCw, ExternalLink, Hash, Check
} from 'lucide-react';
import { UserProfile, StoreOrder } from '../types';
import { 
  signInWithGoogle, 
  signInWithDiscord, 
  registerWithEmail, 
  loginWithEmail, 
  userLogout,
  syncUserPurchases,
  fetchOrders
} from '../services/api';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onUserChanged: (user: UserProfile | null) => void;
  onCopyText: (text: string, message?: string) => void;
  onOpenStore?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserChanged,
  onCopyText,
  onOpenStore,
}) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  
  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [minecraftIgn, setMinecraftIgn] = useState('');
  const [displayName, setDisplayName] = useState('');
  
  // Discord custom modal state
  const [isDiscordPromptOpen, setIsDiscordPromptOpen] = useState(false);
  const [discordUsername, setDiscordUsername] = useState('');
  const [discordId, setDiscordId] = useState('');
  const [discordIgn, setDiscordIgn] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // User orders history
  const [userOrders, setUserOrders] = useState<StoreOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  useEffect(() => {
    if (isOpen && currentUser) {
      loadUserOrders(currentUser);
    }
  }, [isOpen, currentUser]);

  const loadUserOrders = async (user: UserProfile) => {
    setIsLoadingOrders(true);
    try {
      const all = await fetchOrders();
      const cleanEmail = (user.email || '').toLowerCase();
      const cleanIgn = (user.minecraftUsername || '').toLowerCase();
      const filtered = all.filter((o) =>
        o.userId === user.uid ||
        (cleanEmail && o.userEmail?.toLowerCase() === cleanEmail) ||
        (cleanIgn && o.player?.toLowerCase() === cleanIgn)
      );
      setUserOrders(filtered);
    } catch {
      // ignore
    } finally {
      setIsLoadingOrders(false);
    }
  };

  if (!isOpen) return null;

  // Handle Google Sign In
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const savedIgn = localStorage.getItem('vortex_mc_ign') || minecraftIgn || undefined;
      const profile = await signInWithGoogle(savedIgn);
      onUserChanged(profile);
      setSuccessMsg('تم تسجيل الدخول بحساب Google بنجاح! 🎉');
      await loadUserOrders(profile);
    } catch (err: any) {
      console.error('Google Sign In Error:', err);
      setErrorMsg(err.message?.includes('popup-closed') 
        ? 'تم إغلاق نافذة تسجيل الدخول' 
        : 'تعذر تسجيل الدخول بحساب Google، يرجى المحاولة مجدداً');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Discord Sign In Submit
  const handleDiscordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = discordUsername.trim();
    if (!cleanUser) {
      setErrorMsg('يرجى كتابة يوزر الديسكورد الخاص بك');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    try {
      const id = discordId.trim() || `dc_${Date.now().toString(36)}`;
      const ign = discordIgn.trim() || localStorage.getItem('vortex_mc_ign') || undefined;
      const profile = await signInWithDiscord({
        id,
        username: cleanUser,
        minecraftIgn: ign,
      });
      onUserChanged(profile);
      setIsDiscordPromptOpen(false);
      setSuccessMsg(`مرحباً بك! تم تسجيل الدخول بحساب ديسكورد @${cleanUser} 🎉`);
      await loadUserOrders(profile);
    } catch (err: any) {
      console.error('Discord Auth Error:', err);
      setErrorMsg('تعذر تسجيل الدخول بحساب الديسكورد، يرجى المحاولة مرة أخرى');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Email Login
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMsg('يرجى ملء البريد الإلكتروني وكلمة المرور');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    try {
      const profile = await loginWithEmail(email.trim(), password);
      onUserChanged(profile);
      setSuccessMsg('تم تسجيل الدخول بنجاح! 🎉');
      await loadUserOrders(profile);
    } catch (err: any) {
      console.error('Email Login Error:', err);
      setErrorMsg('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Email Register
  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    const cleanPass = password.trim();
    const cleanIgn = minecraftIgn.trim();

    if (!cleanEmail || !cleanPass || !cleanIgn) {
      setErrorMsg('يرجى كتابة اسم حسابك في ماينكرافت والبريد وكلمة المرور');
      return;
    }

    if (cleanPass.length < 6) {
      setErrorMsg('كلمة المرور يجب ألا تقل عن 6 خانات');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    try {
      const profile = await registerWithEmail(cleanEmail, cleanPass, cleanIgn, displayName.trim() || cleanIgn);
      onUserChanged(profile);
      setSuccessMsg('تم إنشاء الحساب بنجاح! تم ربط اسم اللاعب وتتبع المشتريات 🎉');
      await loadUserOrders(profile);
    } catch (err: any) {
      console.error('Email Register Error:', err);
      if (err.code === 'auth/email-already-in-use') {
        setErrorMsg('هذا البريد الإلكتروني مسجل مسبقاً، يرجى تسجيل الدخول');
      } else {
        setErrorMsg('تعذر إنشاء الحساب، تأكد من صحة البريد الإلكتروني');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    setIsLoading(true);
    try {
      await userLogout();
      onUserChanged(null);
      setUserOrders([]);
      setSuccessMsg('تم تسجيل الخروج بنجاح');
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Sync purchase count manually
  const handleRefreshPurchases = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    try {
      const updatedCount = await syncUserPurchases(
        currentUser.uid,
        currentUser.minecraftUsername,
        currentUser.email || undefined
      );
      onUserChanged({ ...currentUser, purchaseCount: updatedCount });
      await loadUserOrders(currentUser);
      onCopyText('', `تم تحديث السجل: لديك ${updatedCount} مشتريات مسجلة ✅`);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  // Minecraft head preview
  const previewSkinIgn = (minecraftIgn.trim().toLowerCase() === 'el_joker_' || minecraftIgn.trim().toLowerCase() === 'el_joker_.')
    ? 'ng_jonesi14'
    : (minecraftIgn.trim() || 'MHF_Steve');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto" dir="rtl">
      <div 
        className="relative w-full max-w-lg bg-[#0c121e] border border-cyan-500/30 rounded-3xl p-6 sm:p-8 shadow-[0_0_60px_rgba(0,210,255,0.25)] text-white my-6 transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 left-5 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800/70 hover:bg-slate-700 transition-colors z-10 cursor-pointer"
          title="إغلاق"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ========================================================================= */}
        {/* VIEW 1: USER IS ALREADY LOGGED IN (PROFILE & PURCHASE COUNT TRACKER)       */}
        {/* ========================================================================= */}
        {currentUser ? (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <img
                  src={
                    currentUser.photoURL ||
                    (currentUser.minecraftUsername
                      ? `https://mc-heads.net/avatar/${encodeURIComponent(currentUser.minecraftUsername)}/64`
                      : 'https://mc-heads.net/avatar/MHF_Steve/64')
                  }
                  alt={currentUser.displayName || 'User'}
                  className="w-16 h-16 rounded-2xl bg-slate-800 border-2 border-[#00d2ff] shadow-md object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = 'https://mc-heads.net/avatar/MHF_Steve/64';
                  }}
                />
                <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-[#00d2ff] text-slate-950 font-mono">
                  {currentUser.provider}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-black text-white truncate">
                    {currentUser.displayName || 'Vortex Player'}
                  </h3>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>نشط</span>
                  </span>
                </div>
                
                {currentUser.email && (
                  <p className="text-xs text-slate-400 font-mono truncate">{currentUser.email}</p>
                )}

                {currentUser.minecraftUsername && (
                  <p className="text-xs text-[#00d2ff] font-bold mt-0.5 flex items-center gap-1">
                    <span>🎮 حساب اللعبة:</span>
                    <span className="font-mono bg-slate-900 px-1.5 py-0.2 rounded border border-white/10" dir="ltr">
                      {currentUser.minecraftUsername}
                    </span>
                  </p>
                )}
              </div>
            </div>

            {/* PURCHASE COUNT HERO BOX ("ويتسجل هو اشترا كام مره") */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-[#00d2ff]/15 via-purple-600/15 to-blue-600/15 border border-[#00d2ff]/40 shadow-inner">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-[#00d2ff]/20 border border-[#00d2ff]/40 flex items-center justify-center text-[#00d2ff] shrink-0">
                    <ShoppingBag className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-300 font-bold">سجل المشتريات المعتمدة</div>
                    <div className="text-2xl sm:text-3xl font-black text-white flex items-center gap-2">
                      <span className="text-[#00d2ff] font-mono">{currentUser.purchaseCount || userOrders.length}</span>
                      <span className="text-sm font-bold text-slate-300">
                        {(currentUser.purchaseCount || userOrders.length) === 1
                          ? 'عملية شراء واحدة'
                          : (currentUser.purchaseCount || userOrders.length) === 2
                          ? 'عمليتين شراء'
                          : 'عمليات شراء مسجلة'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRefreshPurchases}
                  disabled={isLoading}
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-[#00d2ff] border border-white/10 transition-colors cursor-pointer"
                  title="تحديث عدد المشتريات"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
                <span>
                  {currentUser.purchaseCount > 0 ? '🌟 عميل معتمد في سيرفر فورتكس' : '✨ لم تقم بالشراء بعد'}
                </span>
                {onOpenStore && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenStore();
                    }}
                    className="text-[#00d2ff] hover:underline font-bold cursor-pointer"
                  >
                    تصفح الرتب في المتجر ←
                  </button>
                )}
              </div>
            </div>

            {/* ORDER HISTORY LIST */}
            <div>
              <h4 className="text-xs font-bold text-slate-300 mb-2.5 flex items-center justify-between">
                <span>سجل طلباتك ورتبك ({userOrders.length})</span>
                {isLoadingOrders && <span className="text-[10px] text-slate-500">جاري التحميل...</span>}
              </h4>

              {userOrders.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-900/60 border border-white/5 text-center text-xs text-slate-400">
                  لا توجد مشتريات سابقة مرتبطة بحسابك حالياً. عند شرائك أي رتبة ستضاف تلقائياً إلى رصيد مشترياتك.
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {userOrders.map((o) => (
                    <div
                      key={o.orderId}
                      className="p-3 rounded-xl bg-slate-900/80 border border-white/5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span className="text-[#00d2ff]">{o.package}</span>
                          <span className="text-slate-500">•</span>
                          <span className="font-mono text-emerald-400">{o.priceEgp}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          كود: {o.orderId}
                        </div>
                      </div>

                      <div>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          o.status === 'accepted' || o.status === 'approved' || o.status === 'completed'
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : o.status === 'cancelled' || o.status === 'rejected'
                            ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                            : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        }`}>
                          {o.status === 'accepted' || o.status === 'approved' || o.status === 'completed'
                            ? 'مفعلة ✅'
                            : o.status === 'cancelled' || o.status === 'rejected'
                            ? 'ملغية ❌'
                            : 'قيد المراجعة ⏳'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Logout Action */}
            <div className="pt-2 border-t border-white/10 flex items-center justify-between">
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>تسجيل الخروج</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* VIEW 2: LOGIN OR REGISTER FORM                                            */
          /* ========================================================================= */
          <div className="space-y-5">
            {/* Header */}
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#00d2ff]/20 to-purple-600/20 border border-[#00d2ff]/30 flex items-center justify-center mx-auto mb-3 text-[#00d2ff]">
                <User className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-black text-white">
                {tab === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                سجل حسابك لتتبع رتبك ومشترياتك وتوثيق عدد مرات الشراء تلقائياً.
              </p>
            </div>

            {/* Notification Messages */}
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* SOCIAL LOGIN BUTTONS (GOOGLE & DISCORD) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Google Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-black text-xs transition-all shadow-md hover:shadow-lg cursor-pointer disabled:opacity-60"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>الدخول عبر Google</span>
              </button>

              {/* Discord Button */}
              <button
                type="button"
                onClick={() => {
                  setErrorMsg('');
                  setIsDiscordPromptOpen(true);
                }}
                disabled={isLoading}
                className="flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-black text-xs transition-all shadow-md hover:shadow-lg cursor-pointer disabled:opacity-60"
              >
                <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                <span>الدخول عبر Discord</span>
              </button>
            </div>

            {/* Divider */}
            <div className="relative flex items-center justify-center my-4">
              <div className="border-t border-white/10 w-full" />
              <span className="bg-[#0c121e] px-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                أو بالبريد الإلكتروني
              </span>
            </div>

            {/* TAB SWITCHER */}
            <div className="flex rounded-xl bg-slate-900 p-1 border border-white/10">
              <button
                type="button"
                onClick={() => {
                  setTab('login');
                  setErrorMsg('');
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  tab === 'login'
                    ? 'bg-[#00d2ff] text-slate-950 font-black shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                تسجيل الدخول
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('register');
                  setErrorMsg('');
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  tab === 'register'
                    ? 'bg-purple-600 text-white font-black shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                إنشاء حساب جديد
              </button>
            </div>

            {/* LOGIN / REGISTER FORM */}
            <form onSubmit={tab === 'login' ? handleEmailLogin : handleEmailRegister} className="space-y-3.5">
              {tab === 'register' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      اسم حسابك في ماينكرافت (IGN) *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={minecraftIgn}
                        onChange={(e) => setMinecraftIgn(e.target.value.trim())}
                        placeholder="مثال: Steve أو el_joker_"
                        required
                        className="w-full bg-slate-900 border border-white/15 focus:border-[#00d2ff] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none pl-12 font-mono"
                      />
                      {minecraftIgn && (
                        <div className="absolute left-2.5 top-1/2 -translate-y-1/2">
                          <img
                            src={`https://mc-heads.net/avatar/${encodeURIComponent(previewSkinIgn)}/24`}
                            alt={minecraftIgn}
                            className="w-6 h-6 rounded bg-slate-800 border border-white/10"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      سيتم ربط مشترياتك في السيرفر تلقائياً بهذا الاسم.
                    </span>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">البريد الإلكتروني</label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    required
                    className="w-full bg-slate-900 border border-white/15 focus:border-[#00d2ff] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none pl-10 font-mono"
                  />
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">كلمة المرور</label>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full bg-slate-900 border border-white/15 focus:border-[#00d2ff] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none pl-10 font-mono"
                  />
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00d2ff] to-[#0080ff] text-slate-950 font-black text-sm shadow-md hover:shadow-[#00d2ff]/30 transition-all cursor-pointer disabled:opacity-50 mt-2"
              >
                {isLoading ? 'جاري المعالجة...' : tab === 'login' ? 'دخول لحسابي' : 'تسجيل وتفعيل الحساب'}
              </button>
            </form>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUB-MODAL: DISCORD ACCOUNT PROMPT                                         */}
        {/* ========================================================================= */}
        {isDiscordPromptOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-md bg-[#0e1626] border border-[#5865F2]/50 rounded-3xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div className="flex items-center gap-2 text-[#5865F2] font-black text-sm">
                  <span>ربط حساب Discord</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDiscordPromptOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                أدخل اسم مستخدم الديسكورد الخاص بك لتوثيق مشترياتك وربط حسابك بروم #passcode:
              </p>

              <form onSubmit={handleDiscordSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    اسم حساب الديسكورد (Discord Username) *
                  </label>
                  <input
                    type="text"
                    value={discordUsername}
                    onChange={(e) => setDiscordUsername(e.target.value)}
                    placeholder="مثال: player_vortex أو player#0000"
                    required
                    className="w-full bg-slate-900 border border-white/15 focus:border-[#5865F2] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    اسمك في ماينكرافت (Minecraft IGN)
                  </label>
                  <input
                    type="text"
                    value={discordIgn}
                    onChange={(e) => setDiscordIgn(e.target.value.trim())}
                    placeholder="اسمك في اللعبة لتتبع مشترياتك"
                    className="w-full bg-slate-900 border border-white/15 focus:border-[#5865F2] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1">
                    الـ Discord User ID (اختياري لجلب صورتك الحقيقية)
                  </label>
                  <input
                    type="text"
                    value={discordId}
                    onChange={(e) => setDiscordId(e.target.value.trim())}
                    placeholder="مثال: 947291827491827"
                    className="w-full bg-slate-900 border border-white/15 focus:border-[#5865F2] rounded-xl px-4 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none font-mono"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 py-2.5 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] text-white font-black text-xs transition-colors cursor-pointer"
                  >
                    {isLoading ? 'جاري الربط...' : 'تأكيد وتسجيل الدخول'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsDiscordPromptOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
