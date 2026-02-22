/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AlertTriangle, 
  Shield, 
  Phone, 
  MapPin, 
  User, 
  Settings, 
  Bell, 
  Activity,
  Plus,
  Trash2,
  Lock,
  ChevronRight,
  Hospital,
  Clock,
  Fingerprint,
  ScanFace
} from 'lucide-react';
import { findNearbyHospitals } from './services/geminiService';
import { cn } from './lib/utils';
import Markdown from 'react-markdown';

// --- Types ---
interface Contact {
  id: number;
  name: string;
  phone: string;
  email: string;
}

interface Incident {
  id: number;
  timestamp: string;
  location_lat: number;
  location_lng: number;
  status: string;
  details: string;
}

// --- Components ---

const Button = ({ className, variant = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'outline' }) => {
  const variants = {
    primary: 'bg-red-600 text-white hover:bg-red-700',
    secondary: 'bg-zinc-800 text-white hover:bg-zinc-900',
    danger: 'bg-red-500 text-white hover:bg-red-600',
    outline: 'border border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800',
  };
  return (
    <button 
      className={cn("px-4 py-2 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50", variants[variant], className)} 
      {...props} 
    />
  );
};

const Input = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input 
    className={cn("w-full px-4 py-2 rounded-xl border border-zinc-200 bg-white focus:outline-none focus:ring-2 focus:ring-red-500 transition-all dark:bg-zinc-900 dark:border-zinc-800 dark:text-white", className)} 
    {...props} 
  />
);

// --- Main App ---

export default function App() {
  const [view, setView] = useState<'landing' | 'user_login' | 'contacts' | 'main' | 'admin' | 'login' | 'enroll_fingerprint'>('landing');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminStep, setAdminStep] = useState<1 | 2 | 'biometric' | 'faceid'>(1);
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  const [hasEnrolledFingerprint, setHasEnrolledFingerprint] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");

  useEffect(() => {
    if (window.PublicKeyCredential) {
      setIsBiometricSupported(true);
    }
  }, []);
  const [securityCode, setSecurityCode] = useState("");
  const [userName, setUserName] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [showSafetyCheck, setShowSafetyCheck] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [lastJerk, setLastJerk] = useState<number>(0);
  const [emergencyTriggered, setEmergencyTriggered] = useState(false);
  const [hospitalInfo, setHospitalInfo] = useState<string>("");
  const [hospitalLinks, setHospitalLinks] = useState<{ title: string; uri: string }[]>([]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchContacts();
    if (isAdminAuthenticated) fetchIncidents();
  }, [isAdminAuthenticated]);

  const fetchContacts = async () => {
    const res = await fetch('/api/contacts');
    const data = await res.json();
    setContacts(data);
  };

  const fetchIncidents = async () => {
    const res = await fetch('/api/incidents');
    const data = await res.json();
    setIncidents(data);
  };

  const requestPermissions = async () => {
    try {
      // Request Geolocation
      const geoResult = await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(resolve, resolve);
      });

      // Request Motion (iOS specific)
      if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        const permissionState = await (DeviceMotionEvent as any).requestPermission();
        if (permissionState !== 'granted') {
          alert("Motion sensor access is required for accident detection.");
          return false;
        }
      }

      setIsMonitoring(true);
      return true;
    } catch (e) {
      console.error("Permission error:", e);
      return false;
    }
  };

  const handleStartProtect = async () => {
    const granted = await requestPermissions();
    if (granted) {
      setView('user_login');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const res = await fetch('/api/auth/google/url');
      const { url } = await res.json();
      const authWindow = window.open(url, 'google_auth', 'width=500,height=600');
      
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
          setUserName(event.data.user.name);
          if (contacts.length === 0) {
            setView('contacts');
          } else {
            setView('main');
          }
          window.removeEventListener('message', handleMessage);
        }
      };
      window.addEventListener('message', handleMessage);
    } catch (error) {
      console.error("Google login error:", error);
    }
  };

  // Jerk Detection Logic
  useEffect(() => {
    if (!isMonitoring) return;

    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc) return;

      const totalAcc = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
      
      // Threshold for a "sudden jerk" (e.g., 25 m/s^2)
      if (totalAcc > 25 && Date.now() - lastJerk > 5000) {
        setLastJerk(Date.now());
        triggerSafetyCheck();
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [isMonitoring, lastJerk]);

  const triggerSafetyCheck = () => {
    setShowSafetyCheck(true);
    setCountdown(60);
    
    // Get location immediately
    navigator.geolocation.getCurrentPosition((pos) => {
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    });

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          triggerEmergency();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const triggerEmergency = async () => {
    setEmergencyTriggered(true);
    setShowSafetyCheck(false);

    let lat = 0, lng = 0;
    if (location) {
      lat = location.lat;
      lng = location.lng;
    } else {
      const pos = await new Promise<GeolocationPosition>((resolve) => navigator.geolocation.getCurrentPosition(resolve));
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
      setLocation({ lat, lng });
    }

    const result = await findNearbyHospitals(lat, lng);
    setHospitalInfo(result.text);
    setHospitalLinks(result.links);

    const locationLink = `https://www.google.com/maps?q=${lat},${lng}`;
    const emergencyMessage = `${userName.toUpperCase()} IS IN EMERGENCY. Location: ${locationLink}`;

    // Simulate sending messages to contacts
    console.log("SENDING SMS TO CONTACTS:", contacts.map(c => ({
      to: c.phone,
      message: emergencyMessage
    })));

    // Simulate alerting hospitals
    console.log("ALERTING HOSPITALS FOR AMBULANCE:", result.links.map(h => ({
      hospital: h.title,
      phone: h.phone,
      message: `EMERGENCY: Accident detected at ${locationLink}. Ambulance requested for ${userName}.`
    })));

    await fetch('/api/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat,
        lng,
        details: `Emergency triggered for ${userName}. ${emergencyMessage}. Nearby hospitals: ${result.text}`
      })
    });
  };

  const handleIAmSafe = () => {
    setShowSafetyCheck(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleAdminLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const username = formData.get('username') as string;
    const password = formData.get('password');

    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (res.ok) {
      const data = await res.json();
      setAdminUsername(username);
      setHasEnrolledFingerprint(data.hasFingerprint);
      setAdminStep(2);
    } else {
      alert("Invalid credentials");
    }
  };

  const verifySecurityCode = () => {
    if (securityCode === "1249") { // Updated security code
      if (!hasEnrolledFingerprint) {
        setView('enroll_fingerprint');
      } else {
        setIsAdminAuthenticated(true);
        setView('admin');
      }
    } else {
      alert("Invalid security code. Access denied.");
    }
  };

  const handleBiometricLogin = async (type: 'fingerprint' | 'faceid') => {
    if (!hasEnrolledFingerprint && type === 'fingerprint') {
      alert("No fingerprint enrolled. Please login with password first.");
      return;
    }
    try {
      setAdminStep(type === 'fingerprint' ? 'biometric' : 'faceid');
      
      // Simulate biometric scan
      setTimeout(async () => {
        const biometricId = "valid-biometric-123"; 
        const res = await fetch('/api/admin/verify-fingerprint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: adminUsername || "Vigneshwaran v", fingerprintId: biometricId })
        });

        if (res.ok) {
          setIsAdminAuthenticated(true);
          setView('admin');
          setAdminStep(1);
        } else {
          alert(`Wrong ${type === 'fingerprint' ? 'fingerprint' : 'face'}. Access denied.`);
          setAdminStep(1);
        }
      }, 2500);
    } catch (error) {
      console.error("Biometric error:", error);
      alert("Authentication failed.");
      setAdminStep(1);
    }
  };

  const enrollBiometric = async (type: 'fingerprint' | 'faceid') => {
    setAdminStep(type === 'fingerprint' ? 'biometric' : 'faceid');
    setTimeout(async () => {
      const biometricId = "valid-biometric-123"; 
      await fetch('/api/admin/enroll-fingerprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: adminUsername, fingerprintId: biometricId })
      });
      setHasEnrolledFingerprint(true);
      setIsAdminAuthenticated(true);
      setView('admin');
      setAdminStep(1);
    }, 2500);
  };

  const addContact = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const phone = formData.get('phone') as string;
    const email = formData.get('email') as string;

    // Validation
    if (!/^[a-zA-Z\s]+$/.test(name)) {
      alert("Contact name must contain only letters.");
      return;
    }
    if (!/^\d+$/.test(phone)) {
      alert("Phone number must contain only digits.");
      return;
    }

    await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, email })
    });
    fetchContacts();
    (e.target as HTMLFormElement).reset();
  };

  const deleteContact = async (id: number) => {
    await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
    fetchContacts();
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 font-sans selection:bg-red-100 selection:text-red-900">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('landing')}>
            <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-red-500/20">
              <Shield className="text-white w-6 h-6" />
            </div>
            <span className="text-xl font-bold tracking-tight">RAPID RESCUE</span>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setView(isAdminAuthenticated ? 'admin' : 'login')}
              className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-full transition-colors"
            >
              <Lock className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <main className="pt-24 pb-12 px-4 max-w-4xl mx-auto">
        <AnimatePresence mode="wait">
          {view === 'landing' && (
            <motion.div 
              key="landing"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="min-h-[70vh] flex flex-col items-center justify-center text-center space-y-12"
            >
              <div className="space-y-6">
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="w-24 h-24 bg-red-600 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-2xl shadow-red-500/40"
                >
                  <Shield className="text-white w-12 h-12" />
                </motion.div>
                <div className="space-y-4">
                  <h1 className="text-6xl font-black tracking-tighter text-zinc-900 dark:text-white">
                    RAPID RESCUE
                  </h1>
                  <p className="text-2xl font-medium text-zinc-500 dark:text-zinc-400 max-w-md mx-auto leading-tight">
                    Don't panic, we are with you to protect you.
                  </p>
                </div>
              </div>

              <Button 
                onClick={handleStartProtect}
                className="w-full max-w-xs py-6 text-2xl rounded-3xl shadow-2xl shadow-red-500/30 font-black tracking-tight"
              >
                START PROTECT
              </Button>

              <div className="flex items-center gap-8 text-zinc-400">
                <div className="flex flex-col items-center gap-1">
                  <Activity className="w-6 h-6" />
                  <span className="text-[10px] uppercase font-bold tracking-widest">Sensors</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <MapPin className="w-6 h-6" />
                  <span className="text-[10px] uppercase font-bold tracking-widest">Location</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <Hospital className="w-6 h-6" />
                  <span className="text-[10px] uppercase font-bold tracking-widest">Hospitals</span>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'contacts' && (
            <motion.div 
              key="contacts"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold">Emergency Contacts</h2>
                <p className="text-zinc-500">Who should we notify in case of an accident?</p>
              </div>

              <div className="grid gap-4">
                {contacts.map(contact => (
                  <div key={contact.id} className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-zinc-500" />
                      </div>
                      <div>
                        <p className="font-semibold">{contact.name}</p>
                        <p className="text-sm text-zinc-500">{contact.phone}</p>
                      </div>
                    </div>
                    <button onClick={() => deleteContact(contact.id)} className="p-2 text-zinc-400 hover:text-red-500">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
                
                <form onSubmit={addContact} className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 space-y-4 shadow-sm">
                  <div className="space-y-4">
                    <Input name="name" placeholder="Full Name" required pattern="[a-zA-Z\s]+" title="Letters and spaces only" />
                    <Input name="phone" placeholder="Phone Number" required pattern="\d+" title="Digits only" />
                    <Input name="email" placeholder="Email Address" type="email" required />
                  </div>
                  <Button type="submit" variant="outline" className="w-full py-4">Add Contact</Button>
                </form>

                {contacts.length > 0 && (
                  <Button onClick={() => setView('main')} className="w-full py-4 text-lg">
                    Continue to Dashboard
                  </Button>
                )}
              </div>
            </motion.div>
          )}

          {view === 'main' && (
            <motion.div 
              key="main"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <section className="bg-white dark:bg-zinc-900 p-10 rounded-[3rem] shadow-xl border border-zinc-100 dark:border-zinc-800 text-center space-y-8">
                <div className="relative inline-block">
                  <motion.div 
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ repeat: Infinity, duration: 3 }}
                    className="w-32 h-32 rounded-full bg-red-600 flex items-center justify-center mx-auto shadow-2xl shadow-red-500/40"
                  >
                    <Activity className="text-white w-12 h-12" />
                  </motion.div>
                  <span className="absolute -top-1 -right-1 flex h-6 w-6">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-6 w-6 bg-red-500"></span>
                  </span>
                </div>
                <div className="space-y-2">
                  <h2 className="text-3xl font-black tracking-tight">PROTECTION ACTIVE</h2>
                  <p className="text-zinc-500 dark:text-zinc-400 text-lg">
                    Monitoring for sudden impacts and jerks.
                  </p>
                </div>
                <div className="flex justify-center gap-4">
                  <div className="px-6 py-3 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-red-600" />
                    <span className="text-sm font-bold uppercase tracking-wider">GPS Active</span>
                  </div>
                  <div className="px-6 py-3 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center gap-2">
                    <Shield className="w-4 h-4 text-red-600" />
                    <span className="text-sm font-bold uppercase tracking-wider">Secure</span>
                  </div>
                </div>
                <Button 
                  onClick={triggerSafetyCheck}
                  variant="danger"
                  className="w-full py-4 rounded-2xl flex items-center justify-center gap-2"
                >
                  <AlertTriangle className="w-5 h-5" /> SIMULATE ACCIDENT (TEST)
                </Button>
              </section>

              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setView('contacts')}
                  className="bg-white dark:bg-zinc-900 p-6 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 flex flex-col items-center gap-3 hover:bg-zinc-50 transition-colors"
                >
                  <User className="w-8 h-8 text-red-600" />
                  <span className="font-bold">Contacts</span>
                </button>
                <button 
                  onClick={() => setView('landing')}
                  className="bg-white dark:bg-zinc-900 p-6 rounded-[2rem] border border-zinc-200 dark:border-zinc-800 flex flex-col items-center gap-3 hover:bg-zinc-50 transition-colors"
                >
                  <Settings className="w-8 h-8 text-zinc-400" />
                  <span className="font-bold">Settings</span>
                </button>
              </div>
            </motion.div>
          )}

          {view === 'user_login' && (
            <motion.div 
              key="user_login"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-md mx-auto bg-white dark:bg-zinc-900 p-10 rounded-[3rem] shadow-xl border border-zinc-200 dark:border-zinc-800 space-y-8"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <User className="w-8 h-8 text-red-600" />
                </div>
                <h2 className="text-3xl font-black tracking-tight">Identify Yourself</h2>
                <p className="text-zinc-500">We need to know who you are to provide better help.</p>
              </div>
                <div className="space-y-4">
                  <Button 
                    onClick={handleGoogleLogin}
                    className="w-full py-4 text-lg rounded-2xl flex items-center justify-center gap-3 bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50"
                  >
                    <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                    CONTINUE WITH GOOGLE
                  </Button>
                  
                  <div className="flex items-center gap-4 py-2">
                    <div className="h-px flex-1 bg-zinc-200"></div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">OR</span>
                    <div className="h-px flex-1 bg-zinc-200"></div>
                  </div>

                  <form onSubmit={(e) => {
                    e.preventDefault();
                    if (!/^[a-zA-Z\s]+$/.test(userName)) {
                      alert("Please enter a valid name (letters only).");
                      return;
                    }
                    if (userName.trim()) {
                      if (contacts.length === 0) setView('contacts');
                      else setView('main');
                    }
                  }} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-bold uppercase tracking-wider ml-1">Your Name</label>
                      <Input 
                        value={userName} 
                        onChange={(e) => setUserName(e.target.value)} 
                        placeholder="Enter your full name" 
                        required 
                        pattern="[a-zA-Z\s]+"
                        title="Letters and spaces only"
                        className="py-4 text-lg"
                      />
                    </div>
                    <Button type="submit" className="w-full py-4 text-xl rounded-2xl font-black">CONTINUE</Button>
                  </form>
                </div>
            </motion.div>
          )}

          {view === 'login' && (
            <motion.div 
              key="login"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-md mx-auto bg-white dark:bg-zinc-900 p-8 rounded-[2.5rem] shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-8"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-8 h-8 text-zinc-900 dark:text-white" />
                </div>
                <h2 className="text-3xl font-black tracking-tight">Admin Portal</h2>
                <p className="text-zinc-500">High-security access required</p>
              </div>

              {adminStep === 1 ? (
                <form onSubmit={handleAdminLogin} className="space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black uppercase tracking-widest ml-1 opacity-50">Username</label>
                      <Input name="username" placeholder="Admin ID" required className="bg-zinc-50 border-zinc-200" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-black uppercase tracking-widest ml-1 opacity-50">Password</label>
                      <Input name="password" type="password" placeholder="••••••••" required className="bg-zinc-50 border-zinc-200" />
                    </div>
                  </div>
                  <Button type="submit" className="w-full py-4 text-lg rounded-2xl">NEXT STEP</Button>
                  
                  {isBiometricSupported && (
                    <div className="space-y-4 pt-2">
                      <div className="flex items-center gap-4">
                        <div className="h-px flex-1 bg-zinc-200"></div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">OR</span>
                        <div className="h-px flex-1 bg-zinc-200"></div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => handleBiometricLogin('fingerprint')}
                          className="py-4 rounded-2xl flex flex-col items-center justify-center gap-2 border-zinc-200 hover:border-red-500 hover:text-red-600 transition-all"
                        >
                          <Fingerprint className="w-5 h-5" />
                          <span className="text-[10px] font-bold">FINGERPRINT</span>
                        </Button>
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => handleBiometricLogin('faceid')}
                          className="py-4 rounded-2xl flex flex-col items-center justify-center gap-2 border-zinc-200 hover:border-red-500 hover:text-red-600 transition-all"
                        >
                          <ScanFace className="w-5 h-5" />
                          <span className="text-[10px] font-bold">FACE ID</span>
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  <Button type="button" variant="outline" onClick={() => setView('landing')} className="w-full py-4 rounded-2xl border-transparent hover:bg-zinc-100">CANCEL</Button>
                </form>
              ) : adminStep === 2 ? (
                <div className="space-y-6">
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-100 dark:border-red-800/50 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
                    <p className="text-xs text-red-800 dark:text-red-200 leading-relaxed">
                      <strong>SECURITY PROTOCOL:</strong> Enter the 4-digit master key sent to your encrypted device.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black uppercase tracking-widest ml-1 opacity-50">Master Key</label>
                    <Input 
                      type="password" 
                      maxLength={4} 
                      value={securityCode}
                      onChange={(e) => setSecurityCode(e.target.value)}
                      placeholder="0 0 0 0" 
                      className="text-center text-3xl tracking-[1em] py-6 font-mono bg-zinc-50"
                    />
                  </div>
                  <Button onClick={verifySecurityCode} className="w-full py-4 text-lg rounded-2xl">AUTHORIZE ACCESS</Button>
                  <Button type="button" variant="outline" onClick={() => setAdminStep(1)} className="w-full py-4 rounded-2xl">BACK</Button>
                </div>
              ) : (
                <div className="py-12 flex flex-col items-center justify-center space-y-8">
                  <div className="relative">
                    <motion.div 
                      animate={{ 
                        scale: [1, 1.2, 1],
                        opacity: [0.5, 1, 0.5]
                      }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      className="absolute inset-0 bg-red-500/20 rounded-full blur-2xl"
                    />
                    <div className="relative w-24 h-24 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center border-2 border-red-500/30">
                      <Fingerprint className="w-12 h-12 text-red-600" />
                    </div>
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="text-xl font-bold">Scanning Fingerprint...</h3>
                    <p className="text-sm text-zinc-500">Place your finger on the sensor</p>
                  </div>
                  <Button variant="outline" onClick={() => setAdminStep(1)} className="rounded-xl">Cancel</Button>
                </div>
              )}
            </motion.div>
          )}

          {view === 'enroll_fingerprint' && (
            <motion.div 
              key="enroll_fingerprint"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-md mx-auto bg-white dark:bg-zinc-900 p-10 rounded-[3rem] shadow-2xl border border-zinc-200 dark:border-zinc-800 space-y-8"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Fingerprint className="w-8 h-8 text-red-600" />
                </div>
                <h2 className="text-3xl font-black tracking-tight">Biometric Setup</h2>
                <p className="text-zinc-500">Would you like to add fingerprint access for faster login?</p>
              </div>

              {adminStep === 'biometric' || adminStep === 'faceid' ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-8">
                  <div className="relative">
                    <motion.div 
                      animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      className="absolute inset-0 bg-red-500/20 rounded-full blur-2xl"
                    />
                    <div className="relative w-24 h-24 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center border-2 border-red-500/30">
                      {adminStep === 'biometric' ? <Fingerprint className="w-12 h-12 text-red-600" /> : <ScanFace className="w-12 h-12 text-red-600" />}
                    </div>
                  </div>
                  <div className="text-center space-y-2">
                    <h3 className="text-xl font-bold">{adminStep === 'biometric' ? 'Scanning Fingerprint...' : 'Scanning Face...'}</h3>
                    <p className="text-sm text-zinc-500">{adminStep === 'biometric' ? 'Hold your finger on the sensor' : 'Look at the camera'}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Button onClick={() => enrollBiometric('fingerprint')} className="py-4 rounded-2xl flex flex-col items-center gap-2">
                      <Fingerprint className="w-6 h-6" />
                      <span className="text-xs">FINGERPRINT</span>
                    </Button>
                    <Button onClick={() => enrollBiometric('faceid')} className="py-4 rounded-2xl flex flex-col items-center gap-2">
                      <ScanFace className="w-6 h-6" />
                      <span className="text-xs">FACE ID</span>
                    </Button>
                  </div>
                  <Button 
                    variant="outline" 
                    onClick={() => { setIsAdminAuthenticated(true); setView('admin'); }} 
                    className="w-full py-4 rounded-2xl"
                  >
                    SKIP FOR NOW
                  </Button>
                </div>
              )}
            </motion.div>
          )}
          {view === 'admin' && (
            <motion.div 
              key="admin"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-3xl font-bold">Incident Dashboard</h2>
                  <p className="text-zinc-500">Real-time emergency monitoring</p>
                </div>
                <Button variant="outline" onClick={() => { setIsAdminAuthenticated(false); setView('landing'); }}>Logout</Button>
              </div>

              <div className="grid gap-6">
                {incidents.length === 0 ? (
                  <div className="text-center py-20 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800">
                    <Shield className="w-12 h-12 text-zinc-200 mx-auto mb-4" />
                    <p className="text-zinc-500">No incidents reported yet.</p>
                  </div>
                ) : (
                  incidents.map(incident => (
                    <div key={incident.id} className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                            <AlertTriangle className="w-5 h-5 text-red-600" />
                          </div>
                          <div>
                            <p className="font-bold">Emergency Alert</p>
                            <p className="text-xs text-zinc-500">{new Date(incident.timestamp).toLocaleString()}</p>
                          </div>
                        </div>
                        <span className="px-3 py-1 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 rounded-full text-xs font-bold">
                          {incident.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
                          <MapPin className="w-4 h-4" />
                          {incident.location_lat.toFixed(4)}, {incident.location_lng.toFixed(4)}
                        </div>
                      </div>
                      <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl text-sm italic">
                        {incident.details}
                      </div>
                      <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Emergency Contacts</p>
                        <div className="flex flex-wrap gap-2">
                          {contacts.map(c => (
                            <div key={c.id} className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 rounded-xl">
                              <span className="text-xs font-bold">{c.name}</span>
                              <span className="text-xs text-zinc-500">{c.phone}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Safety Check Modal */}
      <AnimatePresence>
        {showSafetyCheck && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white dark:bg-zinc-900 w-full max-w-md p-8 rounded-[2.5rem] shadow-2xl text-center space-y-8 border border-zinc-100 dark:border-zinc-800"
            >
              <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto">
                <AlertTriangle className="w-10 h-10 text-red-600 animate-pulse" />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-bold">Are You Safe?</h2>
                <p className="text-zinc-500">We detected a sudden impact. Please respond to prevent emergency alerts.</p>
              </div>
              
              <div className="relative w-32 h-32 mx-auto">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="60"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    className="text-zinc-100 dark:text-zinc-800"
                  />
                  <motion.circle
                    cx="64"
                    cy="64"
                    r="60"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray="377"
                    animate={{ strokeDashoffset: 377 * (1 - countdown / 60) }}
                    className="text-red-600"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-4xl font-black">{countdown}</span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Button onClick={handleIAmSafe} className="py-4 text-xl rounded-2xl">I AM SAFE</Button>
                <Button onClick={triggerEmergency} variant="outline" className="py-4 text-lg rounded-2xl">TRIGGER NOW</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Emergency Triggered Success Modal */}
      <AnimatePresence>
        {emergencyTriggered && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-red-600"
          >
            <motion.div 
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="max-w-xl w-full text-white space-y-8 p-8"
            >
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-xl">
                  <Bell className="text-red-600 w-8 h-8 animate-bounce" />
                </div>
                <h2 className="text-4xl font-black uppercase tracking-tighter text-white">Emergency Triggered</h2>
              </div>
              
              <div className="space-y-6">
                <div className="bg-white/10 backdrop-blur-md p-6 rounded-3xl border border-white/20 space-y-4">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Hospital className="w-6 h-6" />
                    Ambulance Requested
                  </h3>
                  <p className="text-sm opacity-90">
                    We have sent an emergency request to nearby hospitals for an ambulance to your location.
                  </p>
                  <div className="text-xs opacity-70 italic">
                    Contacting: {hospitalLinks.map(h => h.title).join(", ") || "Searching..."}
                  </div>
                </div>

                <div className="bg-white/10 backdrop-blur-md p-6 rounded-3xl border border-white/20 space-y-4">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Phone className="w-6 h-6" />
                    Contacts Alerted
                  </h3>
                  <p className="text-sm opacity-90">
                    Your emergency contacts have been notified that you are in an emergency with your live location.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {contacts.map(c => (
                      <span key={c.id} className="px-3 py-1 bg-white/20 rounded-full text-xs font-medium">
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-sm opacity-80">
                  <Clock className="w-4 h-4" />
                  Responders are on their way. Stay calm.
                </div>
              </div>

              <Button 
                onClick={() => setEmergencyTriggered(false)} 
                className="bg-white text-red-600 hover:bg-zinc-100 w-full py-4 text-xl rounded-2xl font-black"
              >
                DISMISS
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
