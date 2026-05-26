import { useEffect, useState } from 'react';
import { Shell, TabId } from './components/Shell';
import { CommandCenter } from './views/CommandCenter';
import { AttendanceIntelligence } from './views/AttendanceIntelligence';
import { AssessmentCompetency } from './views/AssessmentCompetency';
import { People } from './views/People';
import { CapacityOps } from './views/CapacityOps';
import { Dataset } from './lib/derive';
import { dataSource, dataSourceMode } from './lib/dataSource';
import { useFilteredDataset, useFilters } from './state/filters';

export default function App() {
  const [ds, setDs] = useState<Dataset | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>(readHashTab());

  useEffect(() => {
    const onHash = () => setTab(readHashTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    if (window.location.hash !== `#${tab}`) window.location.hash = tab;
  }, [tab]);
  const [pickedEmployee, setPickedEmployee] = useState<string | null>(
    new URLSearchParams(window.location.search).get('employee'),
  );
  const { filters, setFilters } = useFilters();
  const filtered = useFilteredDataset(ds, filters);

  useEffect(() => {
    dataSource.loadAll()
      .then(setDs)
      .catch(e => setErr(e.message ?? String(e)));
  }, []);

  // Picking an employee anywhere → navigate to People view with them selected.
  const pickEmployee = (email: string | null) => {
    setPickedEmployee(email);
    if (email) setTab('people');
  };

  return (
    <Shell
      tab={tab}
      onTab={setTab}
      filters={filters}
      setFilters={setFilters}
      dataset={ds}
      dataSourceMode={dataSourceMode}
    >
      {err && <ErrorBanner message={err} />}
      {!err && !filtered && <Loading />}
      {!err && filtered && tab === 'command'    && <CommandCenter         ds={filtered} onPickEmployee={pickEmployee} />}
      {!err && filtered && tab === 'attendance' && <AttendanceIntelligence ds={filtered} onPickEmployee={pickEmployee} />}
      {!err && filtered && tab === 'assessment' && <AssessmentCompetency   ds={filtered} onPickEmployee={pickEmployee} />}
      {!err && filtered && tab === 'people'     && <People                  ds={filtered} selected={pickedEmployee} onPickEmployee={pickEmployee} />}
      {!err && filtered && tab === 'capacity'   && <CapacityOps             ds={filtered} />}
    </Shell>
  );
}

function readHashTab(): TabId {
  const valid: TabId[] = ['command', 'attendance', 'assessment', 'people', 'capacity'];
  const h = (typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '') as TabId;
  return valid.includes(h) ? h : 'command';
}

function Loading() {
  return <div className="text-sm text-muted dark:text-muted-dark py-12 text-center">Loading data…</div>;
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="border border-bad/40 bg-bad/[0.04] p-4 text-sm">
      <div className="font-medium text-bad mb-1">Data load failed</div>
      <code className="text-xs">{message}</code>
    </div>
  );
}
