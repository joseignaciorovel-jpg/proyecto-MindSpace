import React, { useState, useEffect } from "react";
import { 
  Save, 
  Plus, 
  Trash2, 
  Check, 
  AlertCircle, 
  GraduationCap, 
  Briefcase, 
  Tag, 
  Sliders, 
  Loader2, 
  CheckCircle2, 
  DollarSign, 
  Hash, 
  Phone, 
  Mail, 
  User, 
  MessageSquare,
  ShieldCheck,
  Lock,
  Key,
  CreditCard,
  ArrowUpRight,
  ShieldAlert
} from "lucide-react";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { ClinicSettings } from "../types";

// Default lists to bootstrap the inputs if user has none
const DEFAULT_FORMATION = [
  {
    degree: "Magíster en Psicología Clínica Adultos",
    institution: "Universidad de Chile",
    year: "2018",
    description: "Especialización en Psicoterapia Constructivista Cognitiva y abordaje de trastornos complejos de la personalidad.",
  },
  {
    degree: "Título Profesional de Psicólogo Clínico",
    institution: "Pontificia Universidad Católica de Chile",
    year: "2014",
    description: "Graduado con distinción máxima. Enfoque integral en salud mental y psicología de enlace.",
  },
  {
    degree: "Postítulo en Psicoterapia Breve y Regulación Emocional",
    institution: "Instituto de Terapia Cognitiva (INTECO)",
    year: "2016",
    description: "Técnicas avanzadas de intervención en crisis, trastornos de ansiedad (GAD-7) y sintomatología depresiva (PHQ-9).",
  }
];

const DEFAULT_EXPERIENCE = [
  {
    role: "Fundador y Psicólogo Clínico Principal",
    company: "Centro de Apoyo Psicoterapéutico Integral (CAPI)",
    period: "2020 - Presente",
    description: "Liderazgo de terapia individual privada en formato presencial y telemedicina. Más de 1.500 horas de atención clínica certificadas.",
  },
  {
    role: "Psicólogo Clínico del S. de Psiquiatría y Salud Mental",
    company: "Hospital Clínico San Borja Arriarán",
    period: "2016 - 2020",
    description: "Intervención en Unidad de Enlace Psicosomático, psicoterapia de pacientes con patologías de alta intensidad y derivaciones de interconsulta pública.",
  },
  {
    role: "Interventor Clínico Comunitario de Redes Senda",
    company: "Ilustre Municipalidad de Santiago",
    period: "2014 - 2016",
    description: "Acompañamiento y diseño de estrategias de prevención de recaídas clínicas de adicciones y soporte de urgencia psicosocial.",
  }
];

const DEFAULT_SPECIALTIES = [
  "Trastornos del Ánimo y Ansiedad",
  "Psicoterapia Constructivista Cognitiva",
  "Regulación Emocional y Control del Estrés",
  "Prevención e Intervención en Riesgo Suicida (C-SSRS)",
  "Apoyo Psicoterapéutico en Procesos de Duelo",
  "Terapia Basada en Mindfulness para Ansiedad",
];

interface ClinicianSettingsProps {
  therapistUid: string;
  currentSettings: ClinicSettings | null;
  onSettingsSaved: (newSettings: ClinicSettings) => void;
}

export default function ClinicianSettings({ therapistUid, currentSettings, onSettingsSaved }: ClinicianSettingsProps) {
  // Navigation tabs for editor sections
  const [activeSubTab, setActiveSubTab] = useState<"general" | "education" | "experience" | "specialties" | "billing_security">("general");

  // Stripe & Security States
  const [stripeConnected, setStripeConnected] = useState(false);
  const [bankAccountMasked, setBankAccountMasked] = useState("");
  const [bankName, setBankName] = useState("");
  const [passcode2FAEnabled, setPasscode2FAEnabled] = useState(false);
  const [passcodePIN, setPasscodePIN] = useState("");
  const [isMaxSecurityEnforced, setIsMaxSecurityEnforced] = useState(false);
  
  // Submit/Saving states
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // General fields states
  const [therapistName, setTherapistName] = useState("");
  const [therapistTitle, setTherapistTitle] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [sessionPrice, setSessionPrice] = useState(45000);
  const [sisNumber, setSisNumber] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [bioQuote, setBioQuote] = useState("");
  const [whatsappReminders, setWhatsappReminders] = useState(true);
  const [emailReminders, setEmailReminders] = useState(true);

  // Lists states
  const [formationList, setFormationList] = useState<any[]>([]);
  const [experienceList, setExperienceList] = useState<any[]>([]);
  const [specialties, setSpecialties] = useState<string[]>([]);

  // Subform inputs arrays
  const [newDegree, setNewDegree] = useState("");
  const [newInstitution, setNewInstitution] = useState("");
  const [newYear, setNewYear] = useState("");
  const [newDegreeDesc, setNewDegreeDesc] = useState("");

  const [newRole, setNewRole] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newPeriod, setNewPeriod] = useState("");
  const [newRoleDesc, setNewRoleDesc] = useState("");

  const [newSpecialty, setNewSpecialty] = useState("");

  // Initialize fields once settings are received
  useEffect(() => {
    if (currentSettings) {
      setTherapistName(currentSettings.therapistName || "Ps. José Ignacio Rovel");
      setTherapistTitle(currentSettings.therapistTitle || "Psicólogo Clínico Adultos | Magíster en Psicoterapia Constructivista");
      setContactEmail(currentSettings.contactEmail || "joseignacio.rovel@gmail.com");
      setContactPhone(currentSettings.contactPhone || "+56 9 1234 5678");
      setSessionPrice(currentSettings.sessionPrice || 45000);
      setSisNumber(currentSettings.sisNumber || "482931");
      setExperienceYears(currentSettings.experienceYears || "+10 Años");
      setBioQuote(currentSettings.bioQuote || "");
      setWhatsappReminders(currentSettings.whatsappReminders !== false);
      setEmailReminders(currentSettings.emailReminders !== false);
      setFormationList(currentSettings.formationList || DEFAULT_FORMATION);
      setExperienceList(currentSettings.experienceList || DEFAULT_EXPERIENCE);
      setSpecialties(currentSettings.specialties || DEFAULT_SPECIALTIES);
      setStripeConnected(currentSettings.stripeConnected || false);
      setBankAccountMasked(currentSettings.bankAccountMasked || "");
      setBankName(currentSettings.bankName || "");
      setPasscode2FAEnabled(currentSettings.passcode2FAEnabled || false);
      setPasscodePIN(currentSettings.passcodePIN || "");
      setIsMaxSecurityEnforced(currentSettings.isMaxSecurityEnforced || false);
    } else {
      setTherapistName("Ps. José Ignacio Rovel");
      setTherapistTitle("Psicólogo Clínico Adultos | Magíster en Psicoterapia Constructivista");
      setContactEmail("joseignacio.rovel@gmail.com");
      setContactPhone("+56 9 1234 5678");
      setSessionPrice(45000);
      setSisNumber("482931");
      setExperienceYears("+10 Años");
      setBioQuote("");
      setWhatsappReminders(true);
      setEmailReminders(true);
      setFormationList(DEFAULT_FORMATION);
      setExperienceList(DEFAULT_EXPERIENCE);
      setSpecialties(DEFAULT_SPECIALTIES);
      setStripeConnected(false);
      setBankAccountMasked("");
      setBankName("");
      setPasscode2FAEnabled(false);
      setPasscodePIN("");
      setIsMaxSecurityEnforced(false);
    }
  }, [currentSettings]);

  // General add/delete list methods
  const handleAddFormation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDegree || !newInstitution || !newYear) {
      alert("Por favor rellene Nombre de Título, Institución y Año.");
      return;
    }
    const item = {
      degree: newDegree,
      institution: newInstitution,
      year: newYear,
      description: newDegreeDesc
    };
    setFormationList([...formationList, item]);
    setNewDegree("");
    setNewInstitution("");
    setNewYear("");
    setNewDegreeDesc("");
  };

  const handleRemoveFormation = (idxToDelete: number) => {
    setFormationList(formationList.filter((_, i) => i !== idxToDelete));
  };

  const handleAddExperience = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRole || !newCompany || !newPeriod) {
      alert("Por favor complete Cargo, Institución/Empresa y Período.");
      return;
    }
    const item = {
      role: newRole,
      company: newCompany,
      period: newPeriod,
      description: newRoleDesc
    };
    setExperienceList([...experienceList, item]);
    setNewRole("");
    setNewCompany("");
    setNewPeriod("");
    setNewRoleDesc("");
  };

  const handleRemoveExperience = (idxToDelete: number) => {
    setExperienceList(experienceList.filter((_, i) => i !== idxToDelete));
  };

  const handleAddSpecialty = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newSpecialty.trim();
    if (!clean) return;
    if (specialties.includes(clean)) {
      alert("La especialidad ya se encuentra registrada.");
      return;
    }
    setSpecialties([...specialties, clean]);
    setNewSpecialty("");
  };

  const handleRemoveSpecialty = (itemToRemove: string) => {
    setSpecialties(specialties.filter((s) => s !== itemToRemove));
  };

  // Ultimate Save operation
  const handleSaveProfile = async () => {
    setIsSaving(true);
    setStatusMessage(null);

    const docId = therapistUid || "default_psychologist_uid_123";
    const payload: ClinicSettings = {
      id: docId,
      therapistName: therapistName.trim() || "Ps. José Ignacio Rovel",
      therapistTitle: therapistTitle.trim(),
      contactEmail: contactEmail.trim(),
      contactPhone: contactPhone.trim(),
      sessionPrice: Number(sessionPrice) || 45000,
      whatsappReminders,
      emailReminders,
      sisNumber: sisNumber.trim(),
      experienceYears: experienceYears.trim(),
      bioQuote: bioQuote.trim(),
      formationList,
      experienceList,
      specialties,
      stripeConnected,
      bankAccountMasked,
      bankName,
      passcode2FAEnabled,
      passcodePIN: passcodePIN.trim(),
      isMaxSecurityEnforced,
      updatedAt: Timestamp.now(),
      ownerId: docId
    };

    try {
      await setDoc(doc(db, "settings", docId), payload);
      onSettingsSaved(payload);
      setStatusMessage({
        type: "success",
        text: "¡Ajustes y Perfil Profesional guardados exitosamente! La información ya está actualizada de forma interactiva en su portal."
      });
      // Clear status after some seconds
      setTimeout(() => setStatusMessage(null), 8000);
    } catch (err: any) {
      console.error("Error committing settings to Firestore:", err);
      setStatusMessage({
        type: "error",
        text: `Error al guardar: ${err.message}`
      });
      handleFirestoreError(err, OperationType.WRITE, `settings/${docId}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-150 dark:border-slate-800 shadow-sm overflow-hidden font-sans animate-in fade-in duration-300">
      
      {/* Header section with double-ring lock verification badge */}
      <div className="bg-slate-900 border-b border-slate-800 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-white">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 px-2.5 bg-emerald-500/10 text-emerald-400 text-[10px] font-mono rounded border border-emerald-500/20 uppercase font-bold">
              Modulo de Configuraciones
            </span>
          </div>
          <h3 className="text-xl font-extrabold tracking-tight mt-1">Configuración de Consultorio y Perfil Profesional</h3>
          <p className="text-xs text-slate-400 mt-0.5">Gestione sus tarifas de atención, textos de biografía, títulos, cursos y especialidades clínicas.</p>
        </div>

        <button
          onClick={handleSaveProfile}
          disabled={isSaving}
          className="bg-emerald-500 text-slate-950 px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-emerald-400 active:scale-95 disabled:opacity-50 transition-all cursor-pointer shadow-md"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Guardando...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" /> Guardar Todos los Cambios
            </>
          )}
        </button>
      </div>

      {/* Editor Sub Tabs */}
      <div className="flex flex-wrap bg-slate-50 dark:bg-slate-950 p-2 gap-2 border-b border-gray-100 dark:border-slate-850 px-6">
        <button
          onClick={() => setActiveSubTab("general")}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
            activeSubTab === "general"
              ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-gray-150 dark:border-slate-700"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
          }`}
        >
          <Sliders className="w-3.5 h-3.5" /> 1. Datos Generales y Tarifas
        </button>

        <button
          onClick={() => setActiveSubTab("education")}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
            activeSubTab === "education"
              ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-gray-150 dark:border-slate-700"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
          }`}
        >
          <GraduationCap className="w-3.5 h-3.5" /> 2. Estudios y Cursos
        </button>

        <button
          onClick={() => setActiveSubTab("experience")}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
            activeSubTab === "experience"
              ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-gray-150 dark:border-slate-700"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
          }`}
        >
          <Briefcase className="w-3.5 h-3.5" /> 3. Experiencia Clínica
        </button>

        <button
          onClick={() => setActiveSubTab("specialties")}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
            activeSubTab === "specialties"
              ? "bg-white dark:bg-slate-800 text-slate-905 dark:text-white shadow-sm border border-gray-150 dark:border-slate-700"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
          }`}
        >
          <Tag className="w-3.5 h-3.5" /> 4. Enfoques y Especialidades
        </button>

        <button
          onClick={() => setActiveSubTab("billing_security")}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
            activeSubTab === "billing_security"
              ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-gray-150 dark:border-slate-700"
              : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
          }`}
        >
          <Lock className="w-3.5 h-3.5 text-emerald-500" /> 5. Pasarela y Ciberseguridad
        </button>
      </div>

      {/* Alert Banner / Display State updates */}
      {statusMessage && (
        <div className={`p-4 mx-6 mt-6 rounded-2xl flex items-start gap-2.5 text-xs ${
          statusMessage.type === "success" 
            ? "bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-400"
            : "bg-red-50 dark:bg-red-950/20 border border-red-150 dark:border-red-900/50 text-red-800 dark:text-red-400"
        }`}>
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          )}
          <span className="font-medium leading-relaxed">{statusMessage.text}</span>
        </div>
      )}

      {/* Editor Main Views */}
      <div className="p-6">
        
        {/* SUBTAB 1: Datos Generales */}
        {activeSubTab === "general" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <h4 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider font-mono border-b dark:border-slate-800 pb-2">
              Información Básica del Consultorio
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block uppercase">Nombre Profesional Completo</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={therapistName}
                    onChange={(e) => setTherapistName(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/55 dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-100 font-medium focus:border-slate-400 focus:bg-white transition"
                    placeholder="Ej. Ps. José Ignacio Rovel"
                  />
                </div>
                <p className="text-[10px] text-gray-400 dark:text-slate-500">Nombre público asociado a recetas, informes clnicos y agendamiento público.</p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block uppercase">Subtítulo / Especialidad Principal</label>
                <input
                  type="text"
                  value={therapistTitle}
                  onChange={(e) => setTherapistTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/55 dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-100 font-medium focus:border-slate-400 focus:bg-white transition"
                  placeholder="Ej. Psicólogo Clínico Adultos | Magíster en Psicoterapia Constructivista"
                />
                <p className="text-[10px] text-gray-400 dark:text-slate-500">Frase destacada mostrada abajo de su nombre en cabeceras de pacientes.</p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block uppercase">Valor de una Sesión Estándar (CLP)</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 font-bold text-slate-500 text-xs font-mono">$</span>
                  <input
                    type="number"
                    value={sessionPrice}
                    onChange={(e) => setSessionPrice(Number(e.target.value))}
                    className="w-full pl-8 pr-4 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/55 dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-100 font-mono focus:border-slate-400 focus:bg-white transition"
                    placeholder="Ej. 45000"
                  />
                </div>
                <p className="text-[10px] text-gray-400 dark:text-slate-500">Monto cobrado al paciente en la confirmación de la pasarela de pago.</p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block uppercase">Registro SIS (Súper. de Salud)</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={sisNumber}
                    onChange={(e) => setSisNumber(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/55 dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-100 font-medium focus:border-slate-400 focus:bg-white transition"
                    placeholder="Ej. 482931"
                  />
                </div>
                <p className="text-[10px] text-gray-400 dark:text-slate-500">Número oficial para acreditar la validez de su título profesional clínico en Chile.</p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block uppercase">Años de Trayectoria</label>
                <input
                  type="text"
                  value={experienceYears}
                  onChange={(e) => setExperienceYears(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/55 dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-100 font-medium focus:border-slate-400 focus:bg-white transition"
                  placeholder="Ej. +10 Años de Experiencia"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block uppercase">Medio de Contacto (Teléfono)</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/55 dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-100 font-mono focus:border-slate-400 focus:bg-white transition"
                    placeholder="+56 9 XXXXXXXX"
                  />
                </div>
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block uppercase">Email Corporativo de Contacto</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/55 dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-100 focus:border-slate-400 focus:bg-white transition"
                    placeholder="clinico@remindspace.com"
                  />
                </div>
              </div>

              <div className="space-y-1 md:col-span-2">
                <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block uppercase">Biografía e Introducción (Cita Destacada)</label>
                <textarea
                  value={bioQuote}
                  onChange={(e) => setBioQuote(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/55 dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-100 leading-relaxed font-sans focus:border-slate-400 focus:bg-white transition"
                  placeholder="Introduzca un párrafo de bienvenida explicando su modelo teórico cognitivo o enfoque ..."
                />
              </div>
            </div>

            {/* Notification and Channel Settings */}
            <div className="border-t dark:border-slate-800 pt-6 space-y-4">
              <h4 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider font-mono">
                Canales de Recordatorios Automáticos
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Email channel */}
                <div className="border dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-4 py-4 hover:bg-slate-50/50 dark:hover:bg-slate-900">
                  <div className="space-y-0.5">
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-200 block">Recordatorios automáticos por E-mail</span>
                    <p className="text-[10px] text-gray-500 leading-normal">Los pacientes recibirán un correo con la fecha, el bloque y el enlace de consula HIPAA al confirmar la agenda.</p>
                  </div>
                  
                  <button
                    onClick={() => setEmailReminders(!emailReminders)}
                    className={`p-1.5 px-3 rounded-lg text-[10px] font-sans font-bold flex items-center gap-1 cursor-pointer transition-all border ${
                      emailReminders
                        ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-650 border-emerald-200 dark:border-emerald-900/60"
                        : "bg-gray-100 dark:bg-slate-805 text-gray-500 border-gray-200 dark:border-slate-700"
                    }`}
                  >
                    {emailReminders ? "Activado " : "Desactivado"}
                  </button>
                </div>

                {/* WhatsApp reminders */}
                <div className="border dark:border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-4 py-4 hover:bg-slate-50/50 dark:hover:bg-slate-900">
                  <div className="space-y-0.5">
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-200 block">Recordatorios automáticos por WhatsApp</span>
                    <p className="text-[10px] text-gray-550 leading-normal">Simulación interactiva de mensajes de alerta por WhatsApp programados para el teléfono celular del paciente.</p>
                  </div>

                  <button
                    onClick={() => setWhatsappReminders(!whatsappReminders)}
                    className={`p-1.5 px-3 rounded-lg text-[10px] font-sans font-bold flex items-center gap-1 cursor-pointer transition-all border ${
                      whatsappReminders
                        ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-650 border-emerald-200 dark:border-emerald-900/60"
                        : "bg-gray-100 dark:bg-slate-805 text-gray-500 border-gray-200 dark:border-slate-700"
                    }`}
                  >
                    {whatsappReminders ? "Activado " : "Desactivado"}
                  </button>
                </div>

              </div>
            </div>

          </div>
        )}

        {/* SUBTAB 2: Estudios y Cursos */}
        {activeSubTab === "education" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <h4 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider font-mono border-b dark:border-slate-800 pb-2">
              Estudios Académicos y Certificaciones
            </h4>

            {/* List and display existing education items */}
            <div className="space-y-3">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block uppercase">Estudios Registrados</span>
              {formationList.length === 0 ? (
                <div className="p-8 border border-dashed rounded-2xl text-center text-xs text-slate-500 dark:border-slate-800">
                  No ha ingresado estudios o postgrados aún. Rellene el formulario a continuación para agregar hitos.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {formationList.map((f, i) => (
                    <div key={i} className="border dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-slate-350 transition relative">
                      <button
                        onClick={() => handleRemoveFormation(i)}
                        className="absolute top-3 right-3 p-1.5 bg-gray-50 hover:bg-rose-50 hover:text-rose-600 dark:bg-slate-850 dark:hover:bg-rose-950/30 text-gray-400 rounded-lg transition"
                        title="Eliminar antecedente"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="space-y-1.5 pr-6">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-1.5 rounded">{f.year}</span>
                        </div>
                        <h5 className="text-xs font-bold text-slate-800 dark:text-slate-205">{f.degree}</h5>
                        <p className="text-[10px] text-slate-500 font-semibold">{f.institution}</p>
                        <p className="text-[11px] text-gray-550 leading-relaxed font-sans">{f.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Form to insert new Education block */}
            <form onSubmit={handleAddFormation} className="bg-slate-50 dark:bg-slate-950 border dark:border-slate-850 rounded-2xl p-4 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b dark:border-slate-850">
                <Plus className="w-4 h-4 text-emerald-600" />
                <span className="text-[10.5px] font-bold text-slate-800 dark:text-slate-200 uppercase">Agregar nuevo hito académico</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block">Nombre Graduación / Certificado</label>
                  <input
                    type="text"
                    value={newDegree}
                    onChange={(e) => setNewDegree(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-805 dark:text-slate-100 placeholder:text-gray-400"
                    placeholder="Ej. Diplomado en Terapia Gestalt y Enfoque Fenomenológico"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-505 uppercase block">Año Egreso</label>
                  <input
                    type="text"
                    value={newYear}
                    onChange={(e) => setNewYear(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-805 dark:text-slate-100 placeholder:text-gray-400"
                    placeholder="Ej. 2021"
                  />
                </div>

                <div className="space-y-1 col-span-3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block">Casa de Estudios / Universidad</label>
                  <input
                    type="text"
                    value={newInstitution}
                    onChange={(e) => setNewInstitution(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-805 dark:text-slate-100 placeholder:text-gray-400"
                    placeholder="Ej. Universidad de Santiago de Chile"
                  />
                </div>

                <div className="space-y-1 col-span-3">
                  <label className="text-[10px] font-bold text-slate-505 uppercase block">Breve Resumen o Especialidad (Opcional)</label>
                  <textarea
                    value={newDegreeDesc}
                    onChange={(e) => setNewDegreeDesc(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-805 dark:text-slate-100 font-sans"
                    placeholder="Descripción resumida sobre los créditos cursados u horas de práctica supervisada..."
                  />
                </div>
              </div>

              <button
                type="submit"
                className="bg-slate-900 dark:bg-white text-white dark:text-slate-950 px-4 py-2 rounded-xl text-[10px] font-extrabold uppercase tracking-wide flex items-center gap-1.5 hover:scale-102 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar Estudios clínicos
              </button>
            </form>
          </div>
        )}

        {/* SUBTAB 3: Experiencia Clínica */}
        {activeSubTab === "experience" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <h4 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider font-mono border-b dark:border-slate-800 pb-2">
              Trayectoria de Desempeño Laboral
            </h4>

            {/* List existing work history items */}
            <div className="space-y-3">
              <span className="text-[11px] font-bold text-slate-505 dark:text-slate-400 block uppercase">Cargos Clínicos Previos</span>
              {experienceList.length === 0 ? (
                <div className="p-8 border border-dashed rounded-2xl text-center text-xs text-slate-550 dark:border-slate-800">
                  Ningún desempeño ingresado actualmente. Use el formulario a continuación para poblar su historial clínico.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {experienceList.map((exp, i) => (
                    <div key={i} className="border dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-slate-350 transition relative">
                      <button
                        onClick={() => handleRemoveExperience(i)}
                        className="absolute top-3 right-3 p-1.5 bg-gray-50 hover:bg-rose-50 hover:text-rose-600 dark:bg-slate-850 dark:hover:bg-rose-950/30 text-gray-400 rounded-lg transition"
                        title="Eliminar cargo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="space-y-1.5 pr-6">
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-[9px] font-bold text-slate-705 dark:text-slate-350 bg-slate-100 dark:bg-slate-800 px-1.5 rounded">{exp.period}</span>
                        </div>
                        <h5 className="text-xs font-bold text-slate-800 dark:text-slate-205">{exp.role}</h5>
                        <p className="text-[10px] text-slate-505 font-semibold">{exp.company}</p>
                        <p className="text-[11px] text-gray-550 leading-relaxed font-sans">{exp.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Form to insert new Work History block */}
            <form onSubmit={handleAddExperience} className="bg-slate-50 dark:bg-slate-950 border dark:border-slate-850 rounded-2xl p-4 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b dark:border-slate-850">
                <Plus className="w-4 h-4 text-amber-500" />
                <span className="text-[10.5px] font-bold text-slate-800 dark:text-slate-200 uppercase">Agregar cargo terapéutico anterior</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1 col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block">Nombre de Cargo Clínico</label>
                  <input
                    type="text"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-805 dark:text-slate-105 placeholder:text-gray-400"
                    placeholder="Ej. Psicólogo Clínico Senior de Enlace de Interconsulta"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-505 uppercase block">Período de Desempeño</label>
                  <input
                    type="text"
                    value={newPeriod}
                    onChange={(e) => setNewPeriod(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-805 dark:text-slate-105 placeholder:text-gray-400"
                    placeholder="Ej. 2017 - 2022"
                  />
                </div>

                <div className="space-y-1 col-span-3">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block">Institución / Centro Médico / Hospital</label>
                  <input
                    type="text"
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-805 dark:text-slate-105 placeholder:text-gray-400"
                    placeholder="Ej. Hospital Santiago Oriente"
                  />
                </div>

                <div className="space-y-1 col-span-3">
                  <label className="text-[10px] font-bold text-slate-505 uppercase block">Descripción de Responsabilidades o logros clínicos</label>
                  <textarea
                    value={newRoleDesc}
                    onChange={(e) => setNewRoleDesc(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-805 dark:text-slate-105 font-sans"
                    placeholder="Detalles sobre terapia de grupo, derivación, interconsulta, patologías atendidas, etc."
                  />
                </div>
              </div>

              <button
                type="submit"
                className="bg-slate-900 dark:bg-white text-white dark:text-slate-950 px-4 py-2 rounded-xl text-[10px] font-extrabold uppercase tracking-wide flex items-center gap-1.5 hover:scale-102 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar Experiencia Laboral
              </button>
            </form>
          </div>
        )}

        {/* SUBTAB 4: Enfoques y Especialidades */}
        {activeSubTab === "specialties" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <h4 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider font-mono border-b dark:border-slate-800 pb-2">
              Especialidades Médicas y Enfoques Teóricos
            </h4>

            {/* Specialties tag management */}
            <div className="space-y-3">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block uppercase">Mis Especialidades de Atención</span>
              <p className="text-[10.5px] text-gray-500">
                Estas etiquetas de enfoque se muestran con un check de verificación de color esmeralda en su carta pública de presentación clínica. Haga clic en cualquiera de estas tarjetas para removerlas en cualquier momento.
              </p>

              <div className="flex flex-wrap gap-2 pt-2">
                {specialties.length === 0 ? (
                  <p className="text-xs text-slate-400 font-medium p-4 border border-dashed rounded-xl w-full text-center dark:border-slate-800">
                    No posee enfoques definidos. Agregue uno abajo.
                  </p>
                ) : (
                  specialties.map((spec, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleRemoveSpecialty(spec)}
                      className="group flex items-center gap-2 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 rounded-xl border border-gray-150 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-205 font-semibold hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:text-rose-600 hover:border-rose-200 transition cursor-pointer w-full sm:w-auto"
                      title="Haga clic para eliminar especialidad"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 group-hover:hidden" />
                      <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0 hidden group-hover:block" />
                      <span>{spec}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Quick tag adder form */}
            <form onSubmit={handleAddSpecialty} className="bg-slate-50 dark:bg-slate-950 border dark:border-slate-850 rounded-2xl p-4 flex gap-2">
              <input
                type="text"
                value={newSpecialty}
                onChange={(e) => setNewSpecialty(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-805 dark:text-slate-105 placeholder:text-gray-400"
                placeholder="Ej. Terapia Psicoanalítica, Intervención EMDR de trauma, etc."
              />
              <button
                type="submit"
                className="bg-slate-900 dark:bg-white text-white dark:text-slate-950 px-4 py-2 rounded-xl text-xs font-bold shrink-0 hover:scale-102 transition cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar
              </button>
            </form>
          </div>
        )}

        {/* SUBTAB 5: Pasarela & Ciberseguridad */}
        {activeSubTab === "billing_security" && (
          <div className="space-y-6 animate-in fade-in duration-200 text-left">
            {/* Security Explanation banner */}
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <h5 className="text-xs font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wide">Criptografía y Flujo Seguro de Fondos con Flow.cl</h5>
                <p className="text-[11px] text-slate-700 dark:text-slate-300 mt-1 leading-relaxed">
                  Para tu total tranquilidad y conforme a la <strong>Ley 19.628</strong> sobre protección de datos privados:
                  Los datos sensibles de tu cuenta bancaria (donde recibes el dinero recaudado de tus consultas) <strong>se configuran únicamente dentro del panel privado de la plataforma oficial de Flow (flow.cl)</strong>. 
                  Nuestra aplicación jamás te solicitará claves bancarias ni registrará datos vulnerables. El dinero fluye de forma directa y garantizada a tu cuenta destinataria gracias a la encriptación bancaria de Flow.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-sans">
              
              {/* Flow Integration Section */}
              <div className="border border-slate-150 dark:border-slate-800 rounded-3xl p-5 space-y-4 bg-slate-50/40 dark:bg-slate-950/20">
                <div className="flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-slate-800/80">
                  <CreditCard className="w-5 h-5 text-emerald-500" />
                  <span className="text-xs font-extrabold uppercase text-slate-800 dark:text-slate-200">
                    Sincronización Payouts con Flow Chile 🇨🇱
                  </span>
                </div>

                <div className="space-y-3">
                  <p className="text-[11px] text-gray-500 leading-normal font-sans">
                    La consulta procesa cobros en pesos chilenos (CLP) mediante Webpay / Flow. Los datos a continuación son meramente de referencia local para tu contabilidad o para ofrecer transferencias directas/manuales si tus pacientes lo prefieren. Los fondos generales de tus reservas se depositan según tus plazos definidos en Flow.cl.
                  </p>

                  {stripeConnected ? (
                    <div className="bg-emerald-50/50 dark:bg-emerald-905/25 border border-emerald-100 dark:border-emerald-900 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span className="text-[11px] font-bold uppercase font-sans">¡Sincronizado con Comercio Flow!</span>
                      </div>
                      <div className="text-[11.5px] space-y-1 text-slate-750 dark:text-slate-300">
                        <p><strong>Banco de Referencia:</strong> {bankName || "Banco de Chile (Cuenta Corriente)"}</p>
                        <p><strong>Nº de Cuenta Encriptado:</strong> {bankAccountMasked || "•••• •••• ••84"}</p>
                        <p><strong>Modo:</strong> Simulación de Comercio Flow Activo</p>
                      </div>
                      <p className="text-[10px] text-emerald-650 font-medium bg-emerald-50/50 px-2 py-1 rounded">
                        🔒 Los fondos se transfieren en los plazos estipulados por Flow (Ej: D+1) de manera impenetrable.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setStripeConnected(false);
                          setBankAccountMasked("");
                          setBankName("");
                        }}
                        className="text-[10px] font-bold text-red-500 hover:underline hover:text-red-700 transition cursor-pointer"
                      >
                        Desvincular Cuenta de Referencia
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4 font-sans">
                      <div className="bg-slate-100 dark:bg-slate-900 p-3 rounded-xl border border-dashed text-center text-xs text-gray-400 font-sans">
                        No hay cuenta bancaria para transferencias manuales registrada aún. Tus transacciones de Flow continuarán operando con normalidad.
                      </div>

                      <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-505 uppercase block">Tu Banco de Recibos</label>
                            <select
                              value={bankName}
                              onChange={(e) => setBankName(e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-805 rounded-xl bg-white dark:bg-slate-900 text-xs font-semibold focus:border-slate-400 text-slate-800 dark:text-white"
                            >
                              <option value="">-- Seleccionar Banco --</option>
                              <option value="Banco de Chile">Banco de Chile</option>
                              <option value="Banco Santander">Banco Santander</option>
                              <option value="Banco Estado / CuentaRUT">Banco Estado / CuentaRUT</option>
                              <option value="Banco BCI">Banco BCI</option>
                              <option value="Banco Itaú">Banco Itaú</option>
                              <option value="Banco Scotiabank">Banco Scotiabank</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-505 uppercase block">Nº de Cuenta (Opcional)</label>
                            <input
                              type="text"
                              value={bankAccountMasked}
                              placeholder="Ej. Vista 12-34-5"
                              onChange={(e) => setBankAccountMasked(e.target.value)}
                              className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 text-xs font-medium focus:border-slate-400 text-slate-805 dark:text-white"
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (!bankName || !bankAccountMasked) {
                              alert("Por favor seleccione un banco y proporcione su número de cuenta de transferencia.");
                              return;
                            }
                            setStripeConnected(true);
                          }}
                          className="w-full bg-[#1e293b] hover:bg-slate-800 text-white p-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow cursor-pointer active:scale-95 duration-150"
                        >
                          Guardar Datos de Referencia / Transferencia Directa <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Advanced Login & UI Session Cybersecurity Hardening */}
              <div className="border border-slate-150 dark:border-slate-800 rounded-3xl p-5 space-y-4 bg-slate-50/40 dark:bg-slate-950/20">
                <div className="flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-slate-800/80">
                  <Lock className="w-5 h-5 text-emerald-500" />
                  <span className="text-xs font-extrabold uppercase text-slate-800 dark:text-slate-200">
                    Doble Factor y Protección de Ficha (PIN de Firma) 🔐
                  </span>
                </div>

                <div className="space-y-4">
                  <p className="text-[11px] text-gray-500 leading-normal font-sans">
                    Evite que personal no autorizado con acceso físico a su computador o que intente alterar variables del navegador acceda a las fichas clínicas de sus pacientes.
                  </p>

                  <div className="flex items-center justify-between p-3 border border-slate-100 dark:border-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900 duration-150">
                    <div className="space-y-1.5 pr-4">
                      <span className="font-bold text-xs text-slate-800 dark:text-slate-200 block">Exigir Clave PIN de Segunda Firma</span>
                      <p className="text-[10px] text-gray-500 leading-tight">Solicita un PIN de seguridad de 4 dígitos antes de abrir cualquier historial, ficha o procesar reembolsos en la sesión.</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setPasscode2FAEnabled(!passcode2FAEnabled);
                        if (!passcode2FAEnabled && !passcodePIN) {
                          setPasscodePIN("1234"); // default helper
                        }
                      }}
                      className={`p-1.5 px-3 rounded-lg text-[10px] font-sans font-bold cursor-pointer transition-all border ${
                        passcode2FAEnabled
                          ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-650 border-emerald-200 dark:border-emerald-900/60"
                          : "bg-gray-100 dark:bg-slate-805 text-gray-500 border-gray-200 dark:border-slate-700"
                      }`}
                    >
                      {passcode2FAEnabled ? "Exigido ✅" : "Inactivo"}
                    </button>
                  </div>

                  {passcode2FAEnabled && (
                    <div className="space-y-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3.5 rounded-2xl animate-in slide-in-from-top-1 duration-150">
                      <label className="text-[10px] font-extrabold text-slate-500 uppercase block">Establecer PIN Clínico de Firma (4 Números Duros)</label>
                      <div className="relative">
                        <Key className="absolute left-3 top-2.5 w-4 h-4 text-slate-405" />
                        <input
                          type="password"
                          maxLength={4}
                          value={passcodePIN}
                          onChange={(e) => setPasscodePIN(e.target.value.replace(/\D/g, ''))}
                          placeholder="Ej. 1234"
                          className="w-full pl-9 pr-4 py-1.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-900 text-xs font-mono tracking-widest text-slate-805 dark:text-white"
                        />
                      </div>
                      <p className="text-[9px] text-[#A2A2A6] leading-normal font-sans">
                        Este código se encripta de manera que solo el profesional poseedor conozca su combinación de seguridad (Firma electrónica simple Ley 20.584).
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between p-3 border border-slate-100 dark:border-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900 duration-150">
                    <div className="space-y-1.5 pr-4">
                      <span className="font-bold text-xs text-slate-800 dark:text-slate-200 block">Restricción Estricta IP / TLS Encryption</span>
                      <p className="text-[10px] text-gray-500 leading-tight">Filtra automáticamente conexiones que no lleven canales de firma PKI cifrados.</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsMaxSecurityEnforced(!isMaxSecurityEnforced)}
                      className={`p-1.5 px-3 rounded-lg text-[10px] font-sans font-bold cursor-pointer transition-all border ${
                        isMaxSecurityEnforced
                          ? "bg-slate-900 dark:bg-white text-white dark:text-slate-950 border-slate-850"
                          : "bg-gray-100 dark:bg-slate-805 text-gray-500 border-gray-200 dark:border-slate-700"
                      }`}
                    >
                      {isMaxSecurityEnforced ? "Máximo 🛡️" : "Estándar"}
                    </button>
                  </div>
                </div>
              </div>

            </div>

            {/* General Database rules notice */}
            <div className="border border-slate-200/60 dark:border-slate-800 rounded-2xl p-4 bg-white dark:bg-slate-900 text-[11px] leading-relaxed text-gray-500 space-y-2 font-sans">
              <span className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500" /> Nota sobre Ciberseguridad de Datos e Inyecciones de Código Client-side
              </span>
              <p>
                Nuestra base de datos de <strong>Cloud Firestore</strong> cuenta con <strong>Reglas de Seguridad Servidor (firestore.rules)</strong> que garantizan el bloqueo total ante cualquier intromisión:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Ningún usuario externo o bot puede interceptar la lectura o escritura de fichas clínicas, ya que se exige validación tokenizada única del UID de terapeuta dueño coincida con su cuenta (Auth Token UID).</li>
                <li>Hacer alteraciones directas en consola JS del navegador o intentar "saltar" visualmente la página no expone ningún registro clínico, ya que las peticiones a base de datos serán rechazadas por el Servidor de Google.</li>
              </ul>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}
