import React from "react";
import { Award, BookOpen, Briefcase, GraduationCap, Heart, ShieldCheck, Star, Sparkles, CheckCircle2 } from "lucide-react";
import { ClinicSettings } from "../types";

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

interface ProfessionalProfileProps {
  settings?: ClinicSettings | null;
}

export default function ProfessionalProfile({ settings }: ProfessionalProfileProps) {
  const therapistName = settings?.therapistName || "Ps. José Ignacio Rovel";
  const therapistTitle = settings?.therapistTitle || "Psicólogo Clínico Adultos | Magíster en Psicoterapia Constructivista";
  const sisNumber = settings?.sisNumber || "482931";
  const experienceYears = settings?.experienceYears || "+10 Años de Experiencia";
  const bioQuote = settings?.bioQuote || '"Hola, soy José Ignacio. Mi enfoque clínico se centra en ofrecer un espacio de psicoterapia constructivo, libre de juicios y rigurosamente de confidencialidad médica. Juntos trabajaremos para resignificar las experiencias afectivas o de ansiedad que generan malestar, dotándote de estrategias de afrontamiento fundamentadas en la evidencia clínica chilena y el resguardo ético."';
  
  const formationList = settings?.formationList || DEFAULT_FORMATION;
  const experienceList = settings?.experienceList || DEFAULT_EXPERIENCE;
  const specialties = settings?.specialties || DEFAULT_SPECIALTIES;

  // Extract initials dynamically
  const initials = therapistName
    .replace(/^(Ps\.|Dr\.|Dra\.|Ph\.D\.)\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "JI";

  return (
    <div id="professional-profile-container" className="max-w-4xl mx-auto space-y-6 font-sans mt-8 animate-in fade-in duration-300">
      
      {/* Clinician Card Header */}
      <div className="bg-slate-900 dark:bg-slate-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-lg border border-slate-800 dark:border-slate-700">
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <BookOpen className="w-48 h-48" />
        </div>
        
        <div className="flex flex-col md:flex-row items-center gap-6 relative z-10">
          {/* Avatar frame with emerald neon hover pulse border */}
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-slate-800 border-2 border-emerald-500 overflow-hidden flex items-center justify-center shrink-0 shadow-inner hover:scale-105 active:scale-95 transition-transform duration-300 cursor-pointer">
            <span className="text-3xl font-extrabold text-emerald-400">{initials}</span>
          </div>
          
          <div className="text-center md:text-left space-y-2">
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <h3 className="text-2xl font-extrabold tracking-tight">{therapistName}</h3>
              {sisNumber && (
                <span className="bg-emerald-500 text-slate-950 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Acreditado SIS
                </span>
              )}
            </div>
            <p className="text-sm text-slate-300 font-medium">
              {therapistTitle}
            </p>
            
            <div className="flex flex-wrap justify-center md:justify-start gap-4 pt-1.5 text-xs text-slate-400">
              {sisNumber && (
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Reg. Superv. de Salud Nº {sisNumber}
                </span>
              )}
              {experienceYears && (
                <span className="flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                  {experienceYears}
                </span>
              )}
            </div>
          </div>
        </div>

        {bioQuote && (
          <p className="border-t border-slate-800 mt-6 pt-4 text-xs text-slate-300 leading-relaxed font-sans max-w-3xl italic">
            {bioQuote.startsWith('"') ? bioQuote : `"${bioQuote}"`}
          </p>
        )}
      </div>

      {/* Bento-like Sections for Education & Experience with smooth lift transition (tactile feedback) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Academic Formation Column */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-150 dark:border-slate-800 p-6 shadow-sm space-y-4 hover:translate-y-[-3px] transition-transform duration-300 hover:shadow-md">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-slate-800">
            <div className="p-2 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-emerald-400 rounded-xl">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">Educación y Formación</h4>
              <p className="text-[10px] text-gray-550 dark:text-slate-400">Historial académico y postítulos clínicos</p>
            </div>
          </div>

          <div className="space-y-4">
            {formationList.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-slate-500">Ningún antecedente ingresado todavía.</p>
            ) : (
              formationList.map((f, index) => (
                <div key={index} className="relative pl-5 before:absolute before:left-1 before:top-1.5 before:w-1.5 before:h-1.5 before:bg-emerald-500 before:rounded-full after:absolute after:left-[7px] after:top-4 after:bottom-[-20px] after:w-[1px] after:bg-slate-100 dark:after:bg-slate-800 last:after:hidden">
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">{f.degree}</span>
                    <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.2 rounded font-bold shrink-0">{f.year}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-semibold">{f.institution}</div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 leading-relaxed font-sans">{f.description}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Clinical Experience Column */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-150 dark:border-slate-800 p-6 shadow-sm space-y-4 hover:translate-y-[-3px] transition-transform duration-300 hover:shadow-md">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-slate-800">
            <div className="p-2 bg-slate-50 dark:bg-slate-800 text-slate-905 dark:text-amber-400 rounded-xl">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-slate-900 dark:text-white">Trayectoria y Experiencia</h4>
              <p className="text-[10px] text-gray-550 dark:text-slate-440">Cargos anteriores y desempeño clínico</p>
            </div>
          </div>

          <div className="space-y-4">
            {experienceList.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-slate-500">Ninguna experiencia registrada todavía.</p>
            ) : (
              experienceList.map((exp, index) => (
                <div key={index} className="relative pl-5 before:absolute before:left-1 before:top-1.5 before:w-1.5 before:h-1.5 before:bg-slate-950 dark:before:bg-amber-400 before:rounded-full after:absolute after:left-[7px] after:top-4 after:bottom-[-20px] after:w-[1px] after:bg-slate-100 dark:after:bg-slate-800 last:after:hidden">
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-bold text-slate-800 dark:text-slate-202 text-xs">{exp.role}</span>
                    <span className="text-[10px] font-mono text-slate-600 dark:text-slate-350 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded font-bold shrink-0">{exp.period}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-semibold">{exp.company}</div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 leading-relaxed font-sans">{exp.description}</p>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Specialties & Patient Guarantee */}
      <div className="bg-slate-50 dark:bg-slate-900/60 rounded-3xl p-6 border border-slate-150 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Areas of interest */}
        <div className="md:col-span-2 space-y-3">
          <h4 className="text-xs uppercase tracking-wider font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-emerald-500" /> Especialidades de Atención y Enfoques
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700 dark:text-slate-300">
            {specialties.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-slate-550">No hay áreas seleccionadas aún.</p>
            ) : (
              specialties.map((spec, i) => (
                <div key={i} className="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-2.5 rounded-xl border border-gray-150 dark:border-slate-800 hover:scale-102 hover:-translate-y-0.5 hover:shadow-xs transition-all duration-200 cursor-pointer">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-medium">{spec}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Guarantees Box */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-250 dark:border-slate-800 flex flex-col justify-between space-y-3 shadow-xs">
          <div className="space-y-1.5">
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-gray-400 block font-mono">Garantías del Paciente</span>
            <h5 className="text-xs font-bold text-slate-950 dark:text-white">Atención Ética y Normativa Chile</h5>
            <p className="text-[10.5px] text-gray-550 dark:text-slate-400 leading-relaxed font-sans">
              Cada hora clínica agendada respeta fielmente los dictámenes de la <strong>Ley 19.628</strong> sobre datos clínicos sensibles y la <strong>Ley 20.584</strong> de Deberes y Derechos de Salud.
            </p>
          </div>
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-300 font-bold">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Código de Ética y Secreto Clínico</span>
          </div>
        </div>

      </div>

    </div>
  );
}
