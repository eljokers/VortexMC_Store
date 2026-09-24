import { StoreOrder, OrderStatus, StaffApplication, ApplicationStatus, UserProfile } from '../types';
import { db, auth } from '../firebase';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  increment,
  Unsubscribe,
} from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as fbSignOut,
  onAuthStateChanged,
  signInAnonymously,
  User,
} from 'firebase/auth';

const MOCK_ORDER_IDS = new Set([
  'VTX-VC-89K2-1049',
  'VTX-VC-72P1-4820',
  'VTX-VC-55M9-3108',
  'VTX-VC-41A8-7612',
]);

const MOCK_PLAYERS = new Set([
  'FakeSender_00',
  'DragonSlayer_99',
]);

/**
 * Filter out any mock orders from client cache
 */
export function sanitizeOrders(orders: StoreOrder[]): StoreOrder[] {
  if (!Array.isArray(orders)) return [];
  return orders.filter(
    (o) =>
      o &&
      o.orderId &&
      !MOCK_ORDER_IDS.has(o.orderId) &&
      !MOCK_PLAYERS.has(o.player)
  );
}

/**
 * Realtime subscription to Firestore `orders` collection
 * Shared across all devices in real-time
 */
export function subscribeToOrders(
  onUpdate: (orders: StoreOrder[]) => void,
  onError?: (error: any) => void
): Unsubscribe {
  try {
    const ordersCol = collection(db, 'orders');
    return onSnapshot(
      ordersCol,
      (snapshot) => {
        const list: StoreOrder[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as StoreOrder;
          list.push({
            ...data,
            orderId: data.orderId || docSnap.id,
          });
        });

        // Sort newest first by creation timestamp
        list.sort((a, b) => {
          const timeA = a.createdAt || (a.timestamp ? new Date(a.timestamp).getTime() : 0) || 0;
          const timeB = b.createdAt || (b.timestamp ? new Date(b.timestamp).getTime() : 0) || 0;
          return timeB - timeA;
        });

        const cleaned = sanitizeOrders(list);
        try {
          localStorage.setItem('vortex_orders', JSON.stringify(cleaned));
        } catch {
          // ignore
        }
        onUpdate(cleaned);
      },
      (err) => {
        console.warn('Firestore orders snapshot listener notice:', err);
        if (onError) onError(err);
      }
    );
  } catch (err) {
    console.error('Failed to set up Firestore orders subscription:', err);
    return () => {};
  }
}

/**
 * Fetch orders from Firestore with fallback to server API & local cache
 */
export async function fetchOrders(): Promise<StoreOrder[]> {
  // 1. Query Firestore directly
  try {
    const snapshot = await getDocs(collection(db, 'orders'));
    if (!snapshot.empty) {
      const list: StoreOrder[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as StoreOrder;
        list.push({ ...data, orderId: data.orderId || docSnap.id });
      });

      list.sort((a, b) => {
        const timeA = a.createdAt || (a.timestamp ? new Date(a.timestamp).getTime() : 0) || 0;
        const timeB = b.createdAt || (b.timestamp ? new Date(b.timestamp).getTime() : 0) || 0;
        return timeB - timeA;
      });

      const cleaned = sanitizeOrders(list);
      try {
        localStorage.setItem('vortex_orders', JSON.stringify(cleaned));
      } catch {}
      return cleaned;
    }
  } catch (err) {
    console.warn('Firestore fetchOrders error, trying server API fallback:', err);
  }

  // 2. Fallback to server API
  try {
    const res = await fetch('/api/orders', {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const cleaned = sanitizeOrders(data);
        localStorage.setItem('vortex_orders', JSON.stringify(cleaned));
        return cleaned;
      }
    }
  } catch (err) {
    console.warn('Server error fetching orders, checking local cache:', err);
  }

  // 3. Fallback to local storage
  try {
    const saved = localStorage.getItem('vortex_orders');
    if (saved) {
      const parsed = JSON.parse(saved);
      return sanitizeOrders(parsed);
    }
  } catch {
    // ignore
  }

  return [];
}

/**
 * Detect client IP from server or fallback
 */
export async function fetchClientIp(): Promise<string> {
  try {
    const res = await fetch('/api/my-ip');
    if (res.ok) {
      const data = await res.json();
      if (data.ip) return data.ip;
    }
  } catch {
    // fallback
  }
  return '127.0.0.1';
}

/**
 * Submit a real order to Cloud Firestore `orders` collection and notify Discord
 */
export async function submitOrder(order: StoreOrder): Promise<StoreOrder> {
  const cleanOrder: StoreOrder = {
    ...order,
    createdAt: order.createdAt || Date.now(),
  };

  // 1. Save directly to Cloud Firestore
  try {
    const orderDocRef = doc(db, 'orders', cleanOrder.orderId);
    await setDoc(orderDocRef, cleanOrder);
  } catch (e) {
    console.warn('Firestore direct write notice:', e);
  }

  // 2. Dispatch secure server-side Discord notification with receipt attachment
  try {
    fetch('/api/discord/notify-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order: cleanOrder,
        imageBase64: cleanOrder.paymentProof,
        imageName: cleanOrder.paymentProofName,
      }),
    }).catch((err) => {
      console.warn('Discord notify dispatch notice:', err);
    });
  } catch {
    // ignore
  }

  // 3. Persist to server backend API for sync & in-game LuckPerms handling
  try {
    fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cleanOrder),
    }).catch(() => {});
  } catch {
    // ignore
  }

  // 4. Cache order in buyer's local storage for OrderTrackerModal lookup
  try {
    const myOrders = JSON.parse(localStorage.getItem('vortex_my_orders') || '[]');
    const myFiltered = myOrders.filter((o: StoreOrder) => o.orderId !== cleanOrder.orderId);
    localStorage.setItem('vortex_my_orders', JSON.stringify([cleanOrder, ...myFiltered]));

    window.dispatchEvent(new CustomEvent('vortex_order_created', { detail: cleanOrder }));
    window.dispatchEvent(new Event('vortex_orders_updated'));
  } catch (e) {
    console.error('Failed to cache order locally:', e);
  }

  return cleanOrder;
}

/**
 * Update order status on Firestore and backend
 * Supports 'pending' | 'approved' | 'rejected' | 'completed' | 'accepted' | 'cancelled'
 */
export async function updateOrderStatusApi(
  orderId: string,
  newStatus: OrderStatus,
  reason?: string,
  staffNotes?: string,
  reviewedBy?: string
): Promise<StoreOrder | null> {
  const now = Date.now();
  const nowStr = new Date().toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
  const updates: Partial<StoreOrder> = {
    status: newStatus,
    ...(reason ? { cancellationReason: reason } : {}),
    ...(staffNotes !== undefined ? { staffNotes } : {}),
    ...(reviewedBy ? { reviewedBy } : {}),
    reviewedAt: nowStr,
    reviewedTimestamp: now,
    archived: false,
  };

  // 1. Update Firestore document
  try {
    const orderDocRef = doc(db, 'orders', orderId);
    await updateDoc(orderDocRef, updates);
  } catch (err) {
    console.warn('Firestore order update error:', err);
  }

  // 2. Update server API
  try {
    fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }).catch(() => {});
  } catch {
    // ignore
  }

  // 3. Update local cache
  try {
    const existing = sanitizeOrders(JSON.parse(localStorage.getItem('vortex_orders') || '[]'));
    const updated = existing.map((o) => (o.orderId === orderId ? { ...o, ...updates } : o));
    localStorage.setItem('vortex_orders', JSON.stringify(updated));
    window.dispatchEvent(new Event('vortex_orders_updated'));
  } catch {
    // ignore
  }

  return null;
}

/**
 * Archive or unarchive order in Firestore
 */
export async function archiveOrderApi(orderId: string, archived: boolean = true): Promise<void> {
  try {
    const orderDocRef = doc(db, 'orders', orderId);
    await updateDoc(orderDocRef, { archived });
  } catch (err) {
    console.warn('Firestore archive update error:', err);
  }

  try {
    fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    }).catch(() => {});
  } catch {
    // ignore
  }

  try {
    const existing = sanitizeOrders(JSON.parse(localStorage.getItem('vortex_orders') || '[]'));
    const updated = existing.map((o) => (o.orderId === orderId ? { ...o, archived } : o));
    localStorage.setItem('vortex_orders', JSON.stringify(updated));
    window.dispatchEvent(new Event('vortex_orders_updated'));
  } catch {
    // ignore
  }
}

/**
 * Update order notes in Firestore
 */
export async function updateOrderNotesApi(orderId: string, notes: string): Promise<void> {
  try {
    const orderDocRef = doc(db, 'orders', orderId);
    await updateDoc(orderDocRef, { staffNotes: notes });
  } catch (err) {
    console.warn('Firestore notes update error:', err);
  }

  try {
    fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffNotes: notes }),
    }).catch(() => {});
  } catch {
    // ignore
  }

  try {
    const existing = sanitizeOrders(JSON.parse(localStorage.getItem('vortex_orders') || '[]'));
    const updated = existing.map((o) => (o.orderId === orderId ? { ...o, staffNotes: notes } : o));
    localStorage.setItem('vortex_orders', JSON.stringify(updated));
    window.dispatchEvent(new Event('vortex_orders_updated'));
  } catch {
    // ignore
  }
}

/**
 * Delete order from Firestore and backend
 */
export async function deleteOrderApi(orderId: string): Promise<void> {
  try {
    const orderDocRef = doc(db, 'orders', orderId);
    await deleteDoc(orderDocRef);
  } catch (err) {
    console.warn('Firestore delete error:', err);
  }

  try {
    fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: 'DELETE',
    }).catch(() => {});
  } catch {
    // ignore
  }

  try {
    const existing = sanitizeOrders(JSON.parse(localStorage.getItem('vortex_orders') || '[]'));
    const updated = existing.filter((o) => o.orderId !== orderId);
    localStorage.setItem('vortex_orders', JSON.stringify(updated));
    window.dispatchEvent(new Event('vortex_orders_updated'));
  } catch {
    // ignore
  }
}

/**
 * Clean all mock / dummy orders
 */
export async function cleanMockOrdersApi(): Promise<void> {
  try {
    const existing = sanitizeOrders(JSON.parse(localStorage.getItem('vortex_orders') || '[]'));
    localStorage.setItem('vortex_orders', JSON.stringify(existing));
    window.dispatchEvent(new Event('vortex_orders_updated'));
  } catch {
    // ignore
  }

  try {
    fetch('/api/orders/clean-mock', { method: 'POST' }).catch(() => {});
  } catch {
    // ignore
  }
}

/**
 * Sanitize staff applications list to remove any mock/fake entries
 */
export function sanitizeApplications(apps: any[]): StaffApplication[] {
  if (!Array.isArray(apps)) return [];
  return apps.filter((app) => {
    if (!app || typeof app !== 'object') return false;
    const isMock =
      app.id === 'VTX-APP-9241' ||
      app.id === 'VTX-APP-8104' ||
      app.id === 'VTX-APP-7392' ||
      app.minecraftUsername === 'ViperShadow' ||
      app.minecraftUsername === 'NovaKnight_' ||
      app.minecraftUsername === 'Xx_GamerBoy_xX';
    return !isMock;
  });
}

/**
 * Subscribe to staff applications in Firestore
 */
export function subscribeToApplications(
  onUpdate: (apps: StaffApplication[]) => void,
  onError?: (error: any) => void
): Unsubscribe {
  try {
    const appsCol = collection(db, 'applications');
    return onSnapshot(
      appsCol,
      (snapshot) => {
        const list: StaffApplication[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as StaffApplication;
          list.push({ ...data, id: data.id || docSnap.id });
        });
        const cleaned = sanitizeApplications(list);
        onUpdate(cleaned);
      },
      (err) => {
        console.warn('Firestore apps subscription notice:', err);
        if (onError) onError(err);
      }
    );
  } catch (err) {
    console.error('Failed to subscribe to Firestore applications:', err);
    return () => {};
  }
}

/**
 * Generate in-game Minecraft console commands for rank or package delivery
 */
export function getMinecraftCommandForPackage(pkg: string, player: string): {
  primaryCommand: string;
  broadcastCommand: string;
  rankKey: string;
} {
  const p = (player || 'Player').trim();
  const cleanPkg = (pkg || '').toUpperCase();

  let rankKey = 'vip';
  let primaryCommand = `/lp user ${p} parent add vip`;

  if (cleanPkg.includes('MVP+')) {
    rankKey = 'mvpplus';
    primaryCommand = `/lp user ${p} parent add mvpplus`;
  } else if (cleanPkg.includes('MVP')) {
    rankKey = 'mvp';
    primaryCommand = `/lp user ${p} parent add mvp`;
  } else if (cleanPkg.includes('VIP+')) {
    rankKey = 'vipplus';
    primaryCommand = `/lp user ${p} parent add vipplus`;
  } else if (cleanPkg.includes('VIP')) {
    rankKey = 'vip';
    primaryCommand = `/lp user ${p} parent add vip`;
  } else if (cleanPkg.includes('TITAN')) {
    rankKey = 'titan';
    primaryCommand = `/lp user ${p} parent add titan`;
  } else if (cleanPkg.includes('OVERLORD')) {
    rankKey = 'overlord';
    primaryCommand = `/lp user ${p} parent add overlord`;
  } else if (cleanPkg.includes('CUSTOM') || cleanPkg.includes('VORTEX')) {
    rankKey = 'vortex';
    primaryCommand = `/lp user ${p} parent add vortex`;
  } else if (cleanPkg.includes('KEY')) {
    if (cleanPkg.includes('50') || cleanPkg.includes('ULTIMATE')) {
      primaryCommand = `/crate give ${p} ultimate 50`;
    } else if (cleanPkg.includes('30') || cleanPkg.includes('MASTER')) {
      primaryCommand = `/crate give ${p} master 30`;
    } else if (cleanPkg.includes('15') || cleanPkg.includes('MYTHIC')) {
      primaryCommand = `/crate give ${p} mythic 15`;
    } else {
      primaryCommand = `/crate give ${p} mythic 5`;
    }
  } else if (cleanPkg.includes('COIN')) {
    if (cleanPkg.includes('1,500,000') || cleanPkg.includes('1500000')) {
      primaryCommand = `/eco give ${p} 1500000`;
    } else if (cleanPkg.includes('500,000') || cleanPkg.includes('500000')) {
      primaryCommand = `/eco give ${p} 500000`;
    } else if (cleanPkg.includes('150,000') || cleanPkg.includes('150000')) {
      primaryCommand = `/eco give ${p} 150000`;
    } else {
      primaryCommand = `/eco give ${p} 50000`;
    }
  } else if (cleanPkg.includes('WING') || cleanPkg.includes('COSMETIC')) {
    primaryCommand = `/cosmetics give ${p} wings_bundle`;
  }

  const broadcastCommand = `/broadcast &b[VortexMC] &aتم تسليم وتفعيل باقة &6${pkg} &aللاعب &e${p}&a فوراً! شكراً لدعمك للسيرفر ⚡`;

  return { primaryCommand, broadcastCommand, rankKey };
}

/**
 * Fetch staff applications from Firestore & server
 */
export async function fetchApplications(): Promise<StaffApplication[]> {
  try {
    const snapshot = await getDocs(collection(db, 'applications'));
    if (!snapshot.empty) {
      const list: StaffApplication[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as StaffApplication;
        list.push({ ...data, id: data.id || docSnap.id });
      });
      return sanitizeApplications(list);
    }
  } catch {
    // fallback
  }

  try {
    const res = await fetch('/api/applications', {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return sanitizeApplications(data);
      }
    }
  } catch {
    // ignore
  }

  try {
    const saved = localStorage.getItem('vortex_staff_applications_ar_v1');
    if (saved) {
      return sanitizeApplications(JSON.parse(saved));
    }
  } catch {
    // ignore
  }

  return [];
}

/**
 * Submit staff application
 */
export async function submitApplication(app: StaffApplication): Promise<StaffApplication> {
  try {
    await setDoc(doc(db, 'applications', app.id), app);
  } catch (e) {
    console.warn('Firestore app write notice:', e);
  }

  try {
    fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(app),
    }).catch(() => {});
  } catch {
    // ignore
  }

  try {
    const existing = sanitizeApplications(
      JSON.parse(localStorage.getItem('vortex_staff_applications_ar_v1') || '[]')
    );
    const updated = [app, ...existing.filter((a: StaffApplication) => a.id !== app.id)];
    localStorage.setItem('vortex_staff_applications_ar_v1', JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('vortex_application_submitted', { detail: app }));
    window.dispatchEvent(new Event('vortex_applications_updated'));
  } catch {
    // ignore
  }

  return app;
}

/**
 * Update staff application status
 */
export async function updateApplicationStatusApi(
  id: string,
  status: ApplicationStatus,
  notes?: string,
  reviewedBy?: string
): Promise<void> {
  const now = Date.now();
  const reviewedAt = new Date().toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
  const updates = {
    status,
    ...(notes !== undefined ? { notes } : {}),
    ...(reviewedBy ? { reviewedBy } : {}),
    reviewedAt,
    reviewedTimestamp: now,
    archived: false,
  };

  try {
    await updateDoc(doc(db, 'applications', id), updates);
  } catch {
    // ignore
  }

  try {
    fetch(`/api/applications/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }).catch(() => {});
  } catch {
    // ignore
  }

  try {
    const existing = sanitizeApplications(
      JSON.parse(localStorage.getItem('vortex_staff_applications_ar_v1') || '[]')
    );
    const updated = existing.map((app) => (app.id === id ? { ...app, ...updates } : app));
    localStorage.setItem('vortex_staff_applications_ar_v1', JSON.stringify(updated));
    window.dispatchEvent(new Event('vortex_applications_updated'));
  } catch {
    // ignore
  }
}

/**
 * Archive or unarchive staff application
 */
export async function archiveApplicationApi(id: string, archived: boolean = true): Promise<void> {
  try {
    await updateDoc(doc(db, 'applications', id), { archived });
  } catch {
    // ignore
  }

  try {
    fetch(`/api/applications/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived }),
    }).catch(() => {});
  } catch {
    // ignore
  }
}

/**
 * Update staff application notes
 */
export async function updateApplicationNotesApi(id: string, notes: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'applications', id), { notes });
  } catch {
    // ignore
  }

  try {
    fetch(`/api/applications/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    }).catch(() => {});
  } catch {
    // ignore
  }
}

/**
 * Delete application
 */
export async function deleteApplicationApi(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'applications', id));
  } catch {
    // ignore
  }

  try {
    fetch(`/api/applications/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }).catch(() => {});
  } catch {
    // ignore
  }
}

/**
 * Clean all mock / dummy staff applications
 */
export async function cleanMockApplicationsApi(): Promise<void> {
  try {
    const existing = sanitizeApplications(
      JSON.parse(localStorage.getItem('vortex_staff_applications_ar_v1') || '[]')
    );
    localStorage.setItem('vortex_staff_applications_ar_v1', JSON.stringify(existing));
    window.dispatchEvent(new Event('vortex_applications_updated'));
  } catch {
    // ignore
  }

  try {
    fetch('/api/applications/clean-mock', { method: 'POST' }).catch(() => {});
  } catch {
    // ignore
  }
}

/**
 * SECURE STAFF LOGIN:
 * Authenticates staff with Firebase Auth and/or secure server-side verification.
 * Under NO circumstances does it leak or return passwords in error messages.
 */
export async function staffLoginWithCredentials(
  identifier: string,
  passcode: string
): Promise<{ success: boolean; error?: string }> {
  const cleanId = (identifier || '').trim();
  const cleanPass = (passcode || '').trim();

  if (!cleanPass) {
    return { success: false, error: 'بيانات الدخول غير صحيحة' };
  }

  // 1. Try Firebase Authentication first if email format
  const email = cleanId.includes('@') ? cleanId : `${cleanId || 'admin'}@vortexmc.xyz`;
  try {
    const cred = await signInWithEmailAndPassword(auth, email, cleanPass);
    if (cred.user) {
      return { success: true };
    }
  } catch {
    // Firebase Auth direct signin failed, try backend verification
  }

  // 2. Server-side verification (compares password securely on server, not in browser bundle)
  try {
    const res = await fetch('/api/auth/staff-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: cleanId, password: cleanPass }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        // Authenticate with Firebase Auth anonymously so Firestore Security Rules allow staff operations
        try {
          await signInAnonymously(auth);
        } catch {
          // ignore
        }
        return { success: true };
      }
    }
  } catch (e) {
    console.warn('Backend login check notice:', e);
  }

  // Generic secure error message - NEVER reveals the password or code
  return { success: false, error: 'بيانات الدخول غير صحيحة' };
}

/**
 * Staff logout
 */
export async function staffLogout(): Promise<void> {
  try {
    await fbSignOut(auth);
  } catch {
    // ignore
  }
}

/**
 * Sync user's purchase count from orders collection:
 * Finds all orders matching userId, userEmail, or minecraftUsername.
 */
export async function syncUserPurchases(uid: string, ign?: string, email?: string): Promise<number> {
  try {
    const orders = await fetchOrders();
    const cleanIgn = (ign || '').trim().toLowerCase();
    const cleanEmail = (email || '').trim().toLowerCase();

    const matchingOrders = orders.filter((o) => {
      if (o.userId && o.userId === uid) return true;
      if (cleanEmail && o.userEmail && o.userEmail.toLowerCase() === cleanEmail) return true;
      if (cleanIgn && o.player && o.player.toLowerCase() === cleanIgn) return true;
      return false;
    });

    const count = matchingOrders.length;
    // Update users/{uid} in Firestore
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      purchaseCount: count,
      lastLoginAt: new Date().toISOString(),
    }).catch(async () => {
      await setDoc(userRef, {
        uid,
        purchaseCount: count,
        lastLoginAt: new Date().toISOString(),
      }, { merge: true });
    });

    return count;
  } catch (err) {
    console.warn('syncUserPurchases error:', err);
    return 0;
  }
}

/**
 * Increment user purchase count when an order is created or completed
 */
export async function recordUserPurchase(uid: string, orderData: Partial<StoreOrder>): Promise<void> {
  try {
    const userRef = doc(db, 'users', uid);
    await setDoc(userRef, {
      uid,
      purchaseCount: increment(1),
      lastLoginAt: new Date().toISOString(),
    }, { merge: true });
  } catch (err) {
    console.warn('recordUserPurchase error:', err);
  }
}

/**
 * Fetch UserProfile from Firestore
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (userSnap.exists()) {
      return userSnap.data() as UserProfile;
    }
  } catch (err) {
    console.warn('getUserProfile error:', err);
  }
  return null;
}

/**
 * Real-time listener for User Profile
 */
export function subscribeToUserProfile(uid: string, callback: (profile: UserProfile | null) => void): Unsubscribe {
  const userRef = doc(db, 'users', uid);
  return onSnapshot(userRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.data() as UserProfile);
    } else {
      callback(null);
    }
  }, (err) => {
    console.warn('subscribeToUserProfile error:', err);
  });
}

/**
 * Sign In with Google (Real Firebase GoogleAuthProvider)
 */
export async function signInWithGoogle(minecraftIgn?: string): Promise<UserProfile> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  const fbUser = result.user;

  // Calculate purchase count from existing orders
  const existingOrders = await fetchOrders();
  const cleanEmail = (fbUser.email || '').toLowerCase();
  const cleanIgn = (minecraftIgn || '').toLowerCase();
  const count = existingOrders.filter((o) =>
    (cleanEmail && o.userEmail?.toLowerCase() === cleanEmail) ||
    (cleanIgn && o.player?.toLowerCase() === cleanIgn) ||
    o.userId === fbUser.uid
  ).length;

  const profile: UserProfile = {
    uid: fbUser.uid,
    email: fbUser.email,
    displayName: fbUser.displayName || 'Minecraft Player',
    photoURL: fbUser.photoURL,
    minecraftUsername: minecraftIgn || undefined,
    provider: 'google',
    purchaseCount: count,
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };

  const userRef = doc(db, 'users', fbUser.uid);
  await setDoc(userRef, profile, { merge: true });
  localStorage.setItem('vortex_user_profile', JSON.stringify(profile));
  if (minecraftIgn) localStorage.setItem('vortex_mc_ign', minecraftIgn);

  return profile;
}

/**
 * Sign In or Register with Discord (Real Discord profile binding)
 */
export async function signInWithDiscord(discordInfo: {
  id: string;
  username: string;
  avatar?: string;
  minecraftIgn?: string;
}): Promise<UserProfile> {
  let currentUser = auth.currentUser;
  if (!currentUser) {
    try {
      const cred = await signInAnonymously(auth);
      currentUser = cred.user;
    } catch {
      // fallback
    }
  }

  const uid = currentUser?.uid || `discord_${discordInfo.id}`;
  const avatarUrl = discordInfo.avatar
    ? `https://cdn.discordapp.com/avatars/${discordInfo.id}/${discordInfo.avatar}.png`
    : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordInfo.id.slice(-1) || '0', 10) % 5}.png`;

  // Calculate purchase count
  const existingOrders = await fetchOrders();
  const cleanIgn = (discordInfo.minecraftIgn || '').toLowerCase();
  const count = existingOrders.filter((o) =>
    (cleanIgn && o.player?.toLowerCase() === cleanIgn) ||
    o.userId === uid
  ).length;

  const profile: UserProfile = {
    uid,
    email: `${discordInfo.username.replace(/[^a-zA-Z0-9_]/g, '')}@discord.user`,
    displayName: discordInfo.username,
    photoURL: avatarUrl,
    minecraftUsername: discordInfo.minecraftIgn || undefined,
    provider: 'discord',
    discordId: discordInfo.id,
    discordTag: discordInfo.username,
    purchaseCount: count,
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };

  const userRef = doc(db, 'users', uid);
  await setDoc(userRef, profile, { merge: true });
  localStorage.setItem('vortex_user_profile', JSON.stringify(profile));
  if (discordInfo.minecraftIgn) localStorage.setItem('vortex_mc_ign', discordInfo.minecraftIgn);

  return profile;
}

/**
 * Register with Email & Password
 */
export async function registerWithEmail(
  email: string,
  pass: string,
  minecraftIgn: string,
  displayName?: string
): Promise<UserProfile> {
  const cred = await createUserWithEmailAndPassword(auth, email, pass);
  const fbUser = cred.user;

  if (displayName || minecraftIgn) {
    await updateProfile(fbUser, {
      displayName: displayName || minecraftIgn,
      photoURL: `https://mc-heads.net/avatar/${encodeURIComponent(minecraftIgn || 'MHF_Steve')}/64`,
    }).catch(() => {});
  }

  // Calculate purchase count
  const existingOrders = await fetchOrders();
  const cleanEmail = email.toLowerCase();
  const cleanIgn = minecraftIgn.toLowerCase();
  const count = existingOrders.filter((o) =>
    o.userEmail?.toLowerCase() === cleanEmail ||
    o.player?.toLowerCase() === cleanIgn ||
    o.userId === fbUser.uid
  ).length;

  const profile: UserProfile = {
    uid: fbUser.uid,
    email: fbUser.email,
    displayName: displayName || minecraftIgn,
    photoURL: `https://mc-heads.net/avatar/${encodeURIComponent(minecraftIgn || 'MHF_Steve')}/64`,
    minecraftUsername: minecraftIgn,
    provider: 'email',
    purchaseCount: count,
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };

  const userRef = doc(db, 'users', fbUser.uid);
  await setDoc(userRef, profile, { merge: true });
  localStorage.setItem('vortex_user_profile', JSON.stringify(profile));
  localStorage.setItem('vortex_mc_ign', minecraftIgn);

  return profile;
}

/**
 * Login with Email & Password
 */
export async function loginWithEmail(email: string, pass: string): Promise<UserProfile> {
  const cred = await signInWithEmailAndPassword(auth, email, pass);
  const fbUser = cred.user;

  const profileDoc = await getUserProfile(fbUser.uid);
  if (profileDoc) {
    const count = await syncUserPurchases(fbUser.uid, profileDoc.minecraftUsername, fbUser.email || undefined);
    const updated = { ...profileDoc, purchaseCount: count, lastLoginAt: new Date().toISOString() };
    localStorage.setItem('vortex_user_profile', JSON.stringify(updated));
    return updated;
  }

  const existingOrders = await fetchOrders();
  const cleanEmail = (fbUser.email || '').toLowerCase();
  const count = existingOrders.filter((o) =>
    (cleanEmail && o.userEmail?.toLowerCase() === cleanEmail) ||
    o.userId === fbUser.uid
  ).length;

  const profile: UserProfile = {
    uid: fbUser.uid,
    email: fbUser.email,
    displayName: fbUser.displayName || 'Vortex Player',
    photoURL: fbUser.photoURL,
    provider: 'email',
    purchaseCount: count,
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };

  const userRef = doc(db, 'users', fbUser.uid);
  await setDoc(userRef, profile, { merge: true });
  localStorage.setItem('vortex_user_profile', JSON.stringify(profile));

  return profile;
}

/**
 * User Logout
 */
export async function userLogout(): Promise<void> {
  try {
    await fbSignOut(auth);
  } catch {}
  localStorage.removeItem('vortex_user_profile');
}
