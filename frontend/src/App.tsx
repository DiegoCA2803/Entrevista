import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { ShiftsPage } from './pages/ShiftsPage.js';
import { EquipmentPage } from './pages/EquipmentPage.js';
import { OperatorsPage } from './pages/OperatorsPage.js';
import { ProjectionPage } from './pages/ProjectionPage.js';
import { AssignmentModal } from './components/AssignmentModal.js';
import { CloseShiftModal } from './components/CloseShiftModal.js';
import { MaintenanceModal } from './components/MaintenanceModal.js';
import { Equipment, Operator, Shift, ProjectionItem } from './types.js';
import { api } from './services/api.js';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';

export function App() {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [projection, setProjection] = useState<ProjectionItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [assignmentModalShift, setAssignmentModalShift] = useState<Shift | null>(null);
  const [closeModalShift, setCloseModalShift] = useState<Shift | null>(null);
  const [maintenanceModalEq, setMaintenanceModalEq] = useState<Equipment | null>(null);

  // Toast notification banner
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'warning' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const loadData = async () => {
    try {
      const [eqData, opData, shiftData, projData] = await Promise.all([
        api.getEquipment(),
        api.getOperators(),
        api.getShifts(),
        api.get7DayProjection()
      ]);
      setEquipment(eqData);
      setOperators(opData);
      setShifts(shiftData);
      setProjection(projData.projection);
    } catch (err: any) {
      console.error('Error cargando datos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleShiftClosed = (result: any) => {
    loadData();
    const blockedCount = result.blockedEquipment?.length || 0;
    if (blockedCount > 0) {
      showToast(
        `Turno cerrado exitosamente. ¡ALERTA: ${blockedCount} equipo(s) superaron su intervalo de mantenimiento y quedaron BLOQUEADOS!`,
        'warning'
      );
    } else {
      showToast(`Turno cerrado exitosamente con ${result.shift?.actual_duration_hours}h reales.`, 'success');
    }
  };

  const handleMaintenanceSuccess = (data: any) => {
    loadData();
    showToast(
      `Mantenimiento de ${data.equipment.code} registrado. Equipo LIBERADO a estado DISPONIBLE. Siguiente umbral: ${data.equipment.last_maintenance_horometer + data.equipment.maintenance_interval_hours}h.`,
      'success'
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Barra de Navegación Superior */}
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        onDataReset={() => {
          loadData();
          showToast('Base de datos restablecida a los casos de prueba solicitados.', 'info');
        }}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-20 right-4 z-50 max-w-md animate-fade-in">
          <div
            className={`p-4 rounded-xl shadow-2xl border flex items-start space-x-3 ${
              toast.type === 'warning'
                ? 'bg-amber-950/90 border-amber-500 text-amber-200'
                : toast.type === 'info'
                ? 'bg-blue-950/90 border-blue-500 text-blue-200'
                : 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
            }`}
          >
            {toast.type === 'warning' ? (
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            ) : (
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="text-xs font-medium leading-relaxed">{toast.message}</div>
          </div>
        </div>
      )}

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-3">
            <span className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
            <p className="text-xs text-slate-400">Cargando flota minera...</p>
          </div>
        ) : (
          <>
            {currentTab === 'dashboard' && (
              <DashboardPage
                equipment={equipment}
                operators={operators}
                shifts={shifts}
                projection={projection}
                setCurrentTab={setCurrentTab}
                onOpenCloseShift={(s) => setCloseModalShift(s)}
              />
            )}

            {currentTab === 'shifts' && (
              <ShiftsPage
                shifts={shifts}
                equipment={equipment}
                operators={operators}
                onOpenNewAssignment={(s) => setAssignmentModalShift(s)}
                onOpenCloseShift={(s) => setCloseModalShift(s)}
                onRefresh={loadData}
              />
            )}

            {currentTab === 'equipment' && (
              <EquipmentPage
                equipment={equipment}
                onOpenMaintenanceModal={(eq) => setMaintenanceModalEq(eq)}
                onRefresh={loadData}
              />
            )}

            {currentTab === 'operators' && (
              <OperatorsPage
                operators={operators}
                onRefresh={loadData}
              />
            )}

            {currentTab === 'projection' && (
              <ProjectionPage
                onRefresh={loadData}
              />
            )}
          </>
        )}
      </main>

      {/* Modales */}
      {assignmentModalShift && (
        <AssignmentModal
          shift={assignmentModalShift}
          equipmentList={equipment}
          operatorsList={operators}
          isOpen={!!assignmentModalShift}
          onClose={() => setAssignmentModalShift(null)}
          onSuccess={() => {
            loadData();
            showToast('Asignación registrada exitosamente.', 'success');
          }}
        />
      )}

      {closeModalShift && (
        <CloseShiftModal
          shift={closeModalShift}
          isOpen={!!closeModalShift}
          onClose={() => setCloseModalShift(null)}
          onSuccess={handleShiftClosed}
        />
      )}

      {maintenanceModalEq && (
        <MaintenanceModal
          equipment={maintenanceModalEq}
          isOpen={!!maintenanceModalEq}
          onClose={() => setMaintenanceModalEq(null)}
          onSuccess={handleMaintenanceSuccess}
        />
      )}
    </div>
  );
}

export default App;
