import { ShieldAlert } from "lucide-react";

interface PatientPortalProps {
  therapistUid: string;
  therapistName: string;
  sessionPrice: number;
  onJoinCall: (roomId: string) => void;
  settings?: unknown;
}

export default function PatientPortal(_props: PatientPortalProps) {
  return (
    <section className="mx-auto my-8 w-full max-w-2xl rounded-2xl border border-amber-300 bg-amber-50 p-6 text-slate-900 shadow-sm" role="alert">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-1 h-6 w-6 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="space-y-3">
          <h2 className="text-lg font-bold">Portal de pacientes temporalmente fuera de servicio</h2>
          <p>
            Estamos actualizando la verificación de identidad y la protección de datos.
            El RUT y el correo no bastan para confirmar quién accede a una ficha clínica.
          </p>
          <p>
            Por ahora no ingreses información de salud ni uses este portal para consultar,
            reservar o modificar una cita. Contacta directamente al consultorio para recibir
            asistencia y confirmar tus horas.
          </p>
        </div>
      </div>
    </section>
  );
}
