import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Shell } from './components/Shell';
import { CommandCenter } from './views/CommandCenter';
import { AttendanceIntelligence } from './views/AttendanceIntelligence';
import { AssessmentCompetency } from './views/AssessmentCompetency';
import { People } from './views/People';
import { CapacityOps } from './views/CapacityOps';
import { dataSource, dataSourceMode } from './lib/dataSource';
import { useFilteredDataset, useFilters } from './state/filters';
export default function App() {
    const [ds, setDs] = useState(null);
    const [err, setErr] = useState(null);
    const [tab, setTab] = useState(readHashTab());
    useEffect(() => {
        const onHash = () => setTab(readHashTab());
        window.addEventListener('hashchange', onHash);
        return () => window.removeEventListener('hashchange', onHash);
    }, []);
    useEffect(() => {
        if (window.location.hash !== `#${tab}`)
            window.location.hash = tab;
    }, [tab]);
    const [pickedEmployee, setPickedEmployee] = useState(new URLSearchParams(window.location.search).get('employee'));
    const { filters, setFilters } = useFilters();
    const filtered = useFilteredDataset(ds, filters);
    useEffect(() => {
        dataSource.loadAll()
            .then(setDs)
            .catch(e => setErr(e.message ?? String(e)));
    }, []);
    // Picking an employee anywhere → navigate to People view with them selected.
    const pickEmployee = (email) => {
        setPickedEmployee(email);
        if (email)
            setTab('people');
    };
    return (_jsxs(Shell, { tab: tab, onTab: setTab, filters: filters, setFilters: setFilters, dataset: ds, dataSourceMode: dataSourceMode, children: [err && _jsx(ErrorBanner, { message: err }), !err && !filtered && _jsx(Loading, {}), !err && filtered && tab === 'command' && _jsx(CommandCenter, { ds: filtered, onPickEmployee: pickEmployee }), !err && filtered && tab === 'attendance' && _jsx(AttendanceIntelligence, { ds: filtered, onPickEmployee: pickEmployee }), !err && filtered && tab === 'assessment' && _jsx(AssessmentCompetency, { ds: filtered, onPickEmployee: pickEmployee }), !err && filtered && tab === 'people' && _jsx(People, { ds: filtered, selected: pickedEmployee, onPickEmployee: pickEmployee }), !err && filtered && tab === 'capacity' && _jsx(CapacityOps, { ds: filtered })] }));
}
function readHashTab() {
    const valid = ['command', 'attendance', 'assessment', 'people', 'capacity'];
    const h = (typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '');
    return valid.includes(h) ? h : 'command';
}
function Loading() {
    return _jsx("div", { className: "text-sm text-muted dark:text-muted-dark py-12 text-center", children: "Loading data\u2026" });
}
function ErrorBanner({ message }) {
    return (_jsxs("div", { className: "border border-bad/40 bg-bad/[0.04] p-4 text-sm", children: [_jsx("div", { className: "font-medium text-bad mb-1", children: "Data load failed" }), _jsx("code", { className: "text-xs", children: message })] }));
}
